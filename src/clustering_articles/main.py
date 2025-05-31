import contextlib
import dataclasses
import logging
import os
from typing import Any, Iterator

import functions_framework
import google.cloud.logging
import google.cloud.sql.connector
import google.genai
import google.genai.types
import numpy as np
import pymysql
import pymysql.cursors
import sklearn.metrics.pairwise

# Configure logging to Google Cloud Logging
logging_client = google.cloud.logging.Client()
logging_client.setup_logging()
logger = logging.getLogger(__name__)


class Config:
    """Configuration for the application."""
    PROJECT_ID = os.getenv('PROJECT_ID', '')
    LOCATION = os.getenv('LOCATION', 'us-west1')

    INSTANCE_CONNECTION_NAME = os.getenv("INSTANCE_CONNECTION_NAME", '')
    MYSQL_USERNAME = os.getenv('MYSQL_FETCHER_USERNAME', '')
    MYSQL_PASSWORD = os.getenv('MYSQL_FETCHER_PASSWORD', '')
    MYSQL_DATABASE = 'somesup'

    SIMILARITY_THRESHOLD = float(os.getenv('SIMILARITY_THRESHOLD', '0.8'))

    def validate(self):
        """Validate the configuration.

        Raises:
            ValueError: If any required configuration is missing.
        """
        if not self.PROJECT_ID:
            raise ValueError("PROJECT_ID is not set.")
        if not self.INSTANCE_CONNECTION_NAME:
            raise ValueError("INSTANCE_CONNECTION_NAME is not set.")
        if not self.MYSQL_USERNAME:
            raise ValueError("MYSQL_FETCHER_USERNAME is not set.")
        if not self.MYSQL_PASSWORD:
            raise ValueError("MYSQL_FETCHER_PASSWORD is not set.")


@dataclasses.dataclass
class SimpleArticle:
    """A simple representation of an article.

    Attributes:
        id (int): The unique identifier of the article.
        title (str): The title of the article.
        content (str): The content of the article.
        embedding_vector (list[float] | None): The embedding vector for the article, if available.
    """
    id: int
    title: str
    content: str
    embedding_vector: list[float] | None

    @classmethod
    def from_api_response(cls, article: dict[str, Any]) -> 'SimpleArticle':
        """Create a SimpleArticle instance from an API response.

        Args:
            article: The article data from the API response.
        Returns:
            An instance of SimpleArticle populated with the article data.
        """
        return cls(
            id=article.get('id', 0),
            title=article.get('title', ''),
            content=article.get('content', ''),
            embedding_vector=None,
        )


class DatabaseClient:

    def __init__(
        self,
        instance_name: str,
        username: str,
        password: str,
        database: str,
    ):
        """Initialize the DatabaseClient."""
        self._instance_name = instance_name
        self._username = username
        self._password = password
        self._database = database

        self._connector = google.cloud.sql.connector.Connector()

    @contextlib.contextmanager
    def _get_connection(self) -> Iterator[pymysql.connections.Connection]:
        """Get a connection to the MySQL database.

        Provides a secure way to manage database connections with automatic
        cleanup. The connection is automatically closed when exiting the
        context, even if an exception occurs.

        Yields:
            A pymysql connection object.

        Raises:
            Exception: If there is an error connecting to the database.
        """
        connection = None
        try:
            connection = self._connector.connect(
                self._instance_name,
                'pymysql',
                user=self._username,
                password=self._password,
                db=self._database,
            )
            yield connection
        except Exception as e:
            logger.error(f"Error connecting to the database: {e}")
            raise e
        finally:
            if connection:
                connection.close()

    def get_unprocessed_articles(self) -> list[SimpleArticle]:
        """Fetch unprocessed articles from the database.

        This method retrieves articles that have not been processed yet.

        Returns:
            A list of SimpleArticle instances representing unprocessed articles.
        """
        with self._get_connection() as connection:
            with connection.cursor(pymysql.cursors.DictCursor) as cursor:
                cursor.execute(
                    "SELECT id, title, content FROM article WHERE is_processed = FALSE"
                )
                rows = cursor.fetchall()
                articles = [
                    SimpleArticle.from_api_response(row) for row in rows
                ]
                return articles


class GeminiClient:

    def __init__(
        self,
        project: str,
        location: str,
    ):
        """Initialize the GeminiClient."""
        self._project = project
        self._location = location

        self._client = google.genai.Client(
            vertexai=True,
            project=self._project,
            location=self._location,
        )

    def _truncate_embed_contents(
        self,
        articles: SimpleArticle,
        max_length: int = 1400,
    ) -> str:
        """Truncate the article content for embedding.

        This method truncates the article content to a maximum length to ensure
        it fits within the limits of the embedding model.

        Args:
            articles: The SimpleArticle instance to truncate.
            max_length: The maximum length of the content to embed.

        Returns:
            A string containing the truncated content of the article.
        """
        content = f"{articles.title}\n\n{articles.content[:max_length]}"
        return content

    def _get_embeddings(
        self,
        articles: list[SimpleArticle],
    ) -> list[google.genai.types.ContentEmbedding] | None:
        """Get embeddings for a list of articles.

        This method retrieves embeddings for the provided articles using the
        Gemini API. It truncates the content of each article to fit within the
        embedding model's limits.

        Args:
            articles: A list of SimpleArticle instances to get embeddings for.

        Returns:
            A list of ContentEmbedding instances containing the embeddings for
            each article, or None if no articles are provided or no embeddings are returned.
        """
        if not articles:
            logger.info("No articles to get embeddings for.")
            return []

        article_contents = [
            self._truncate_embed_contents(article) for article in articles
        ]

        result = self._client.models.embed_content(
            contents=article_contents,
            model='text-embedding-004',
            config=google.genai.types.EmbedContentConfig(
                output_dimensionality=768),
        )

        return result.embeddings

    def map_embeddings(
        self,
        articles: list[SimpleArticle],
    ) -> None:
        """Map embeddings to articles.

        This method retrieves embeddings for the provided articles and maps
        them to the corresponding SimpleArticle instances. It updates the
        `embedding_vector` attribute of each article with the retrieved
        embeddings.

        Args:
            articles: A list of SimpleArticle instances to map embeddings to.

        Returns:
            None: This method does not return a value. It updates the articles
            in place with their corresponding embeddings.
        """
        if not articles:
            logger.info("No articles to cluster.")
            return

        embeddings = self._get_embeddings(articles)
        if not embeddings:
            logger.info("No embeddings returned for articles.")
            return

        for article, embedding in zip(articles, embeddings):
            article.embedding_vector = embedding.values


class ClusterClient:

    def __init__(self, similarity_threshold: float):
        """Initialize the ClusterClient."""
        self._similarity_threshold = similarity_threshold

    def cluster_articles(
        self,
        articles: list[SimpleArticle],
    ) -> list[list[SimpleArticle]]:
        """Cluster articles based on their embeddings.

        This method clusters articles based on the cosine similarity of their
        embedding vectors. It groups articles that have a cosine similarity
        above the specified threshold into clusters.

        Args:
            articles: A list of SimpleArticle instances to cluster.

        Returns:
            A list of clusters, where each cluster is a list of SimpleArticle
            instances that are similar to each other based on their embeddings.
        """
        if not articles:
            logger.info("No articles to cluster.")
            return []

        valid_articles = [
            article for article in articles if article.embedding_vector
        ]
        if not valid_articles:
            logger.info("No valid articles with embeddings to cluster.")
            return []

        vectors = np.array(
            [article.embedding_vector for article in valid_articles])

        similarity_matrix = sklearn.metrics.pairwise.cosine_similarity(vectors)

        clusters = []
        used_indices = set()

        for i, article in enumerate(valid_articles):
            if i in used_indices:
                continue

            similar_indices = []
            for j in range(len(valid_articles)):
                if j != i and similarity_matrix[i][
                        j] >= self._similarity_threshold:
                    similar_indices.append(j)

            if similar_indices:
                cluster = [article]
                cluster.extend([valid_articles[j] for j in similar_indices])
                clusters.append(cluster)

                used_indices.add(i)
                used_indices.update(similar_indices)
            else:
                clusters.append([article])
                used_indices.add(i)

        return clusters


@functions_framework.http
def main(request):
    config = Config()
    try:
        config.validate()
    except ValueError as e:
        logger.error("Configuration error: %s", e)
        return f"Configuration error: {e}", 500

    # Initialized clients
    db_client = DatabaseClient(
        instance_name=config.INSTANCE_CONNECTION_NAME,
        username=config.MYSQL_USERNAME,
        password=config.MYSQL_PASSWORD,
        database=config.MYSQL_DATABASE,
    )

    gemini_client = GeminiClient(
        project=config.PROJECT_ID,
        location=config.LOCATION,
    )

    cluster_client = ClusterClient(
        similarity_threshold=config.SIMILARITY_THRESHOLD)

    # Fetch unprocessed articles from the database
    unprocessed_articles = db_client.get_unprocessed_articles()
    if not unprocessed_articles:
        logger.info("No unprocessed articles found.")
        return "No unprocessed articles found.", 200

    # Map embeddings to articles
    gemini_client.map_embeddings(unprocessed_articles)

    # Cluster articles based on their embeddings
    clusters = cluster_client.cluster_articles(unprocessed_articles)

    for i, cluster in enumerate(clusters):
        logger.info("Cluster %d: %s", i, [article.id for article in cluster])

    return {
        "status": "success",
        "clusters":
        [[article.id for article in cluster] for cluster in clusters]
    }, 200
