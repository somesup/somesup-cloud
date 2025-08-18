import collections
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
import hdbscan
import numpy as np
import pymysql
import pymysql.cursors

# Configure logging to Google Cloud Logging
logging_client = google.cloud.logging.Client()
logging_client.setup_logging()
logger = logging.getLogger(__name__)


class Config:
    """Configuration for the application."""

    PROJECT_ID = os.getenv("PROJECT_ID", "")
    LOCATION = os.getenv("LOCATION", "us-west1")

    INSTANCE_CONNECTION_NAME = os.getenv("INSTANCE_CONNECTION_NAME", "")
    MYSQL_USERNAME = os.getenv("MYSQL_FETCHER_USERNAME", "")
    MYSQL_PASSWORD = os.getenv("MYSQL_FETCHER_PASSWORD", "")
    MYSQL_DATABASE = "somesup"

    SIMILARITY_THRESHOLD = float(os.getenv("SIMILARITY_THRESHOLD", "0.9"))

    MAX_BATCH_SIZE = int(os.getenv("MAX_BATCH_SIZE", "20"))
    MAX_CONTENT_LENGTH = int(os.getenv("MAX_CONTENT_LENGTH", "2000"))

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
    def from_api_response(cls, article: dict[str, Any]) -> "SimpleArticle":
        """Create a SimpleArticle instance from an API response.

        Args:
            article: The article data from the API response.
        Returns:
            An instance of SimpleArticle populated with the article data.
        """
        return cls(
            id=article.get("id", 0),
            title=article.get("title", ""),
            content=article.get("content", ""),
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
                "pymysql",
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
                articles = [SimpleArticle.from_api_response(row) for row in rows]
                return articles


class GeminiClient:

    EMBEDDING_MODEL = "gemini-embedding-001"
    OUTPUT_DIMENSIONALITY = 768

    def __init__(
        self,
        project: str,
        location: str,
        max_content_length: int,
        max_batch_size: int,
    ):
        """Initialize the GeminiClient."""
        self._project = project
        self._location = location
        self._max_content_length = max_content_length
        self._max_batch_size = max_batch_size

        self._client = google.genai.Client(
            vertexai=True,
            project=self._project,
            location=self._location,
        )

    def _truncate_embed_contents(
        self,
        article: SimpleArticle,
    ) -> str:
        """Truncate the article content for embedding.

        This method truncates the article content to a maximum length to ensure
        it fits within the limits of the embedding model.

        Args:
            article: The SimpleArticle instance to truncate.

        Returns:
            A string containing the truncated content of the article.
        """
        return article.title[: self._max_content_length].strip()

    def _estimate_token_count(self, content: str) -> int:
        """Estimate token count for content.

        Simple heuristic: 1 token ≈ 4 characters for Korean/English mixed content.
        """
        return len(content) // 4

    def _create_smart_batches(
        self, articles: list[SimpleArticle]
    ) -> list[list[SimpleArticle]]:
        """Create batches of articles that respect token limits.

        Args:
            articles: List of articles to batch.

        Returns:
            List of article batches.
        """
        batches = []
        current_batch = []
        current_token_count = 0
        max_tokens_per_batch = 18000

        for article in articles:
            content = self._truncate_embed_contents(article)
            estimated_tokens = self._estimate_token_count(content)

            # 현재 배치에 추가했을 때 토큰 한계를 초과하거나 배치 크기 한계를 초과하는 경우
            if (
                current_token_count + estimated_tokens > max_tokens_per_batch
                or len(current_batch) >= self._max_batch_size
            ):

                if current_batch:  # 현재 배치가 비어있지 않으면 저장
                    batches.append(current_batch)
                current_batch = [article]
                current_token_count = estimated_tokens
            else:
                current_batch.append(article)
                current_token_count += estimated_tokens

        # 마지막 배치 추가
        if current_batch:
            batches.append(current_batch)

        return batches

    def _get_embeddings_batch(
        self,
        articles: list[SimpleArticle],
    ) -> list[google.genai.types.ContentEmbedding] | None:
        """Get embeddings for a batch of articles.

        Args:
            articles: A list of SimpleArticle instances to get embeddings for.

        Returns:
            A list of ContentEmbedding instances containing the embeddings for
            each article, or None if no articles are provided or no embeddings are returned.
        """
        if not articles:
            return []

        article_contents = [
            self._truncate_embed_contents(article) for article in articles
        ]

        try:
            result = self._client.models.embed_content(
                contents=article_contents,
                model=self.EMBEDDING_MODEL,
                config=google.genai.types.EmbedContentConfig(
                    output_dimensionality=self.OUTPUT_DIMENSIONALITY,
                    task_type="CLUSTERING",
                ),
            )
            return result.embeddings
        except Exception as e:
            logger.error(f"Error getting embeddings for batch: {e}")
            # 배치가 여전히 너무 크면 개별적으로 처리
            if "token count" in str(e) and len(articles) > 1:
                logger.info("Batch too large, processing articles individually")
                return self._get_embeddings_individually(articles)
            raise

    def _get_embeddings_individually(
        self,
        articles: list[SimpleArticle],
    ) -> list[google.genai.types.ContentEmbedding]:
        """Get embeddings for articles one by one as fallback.

        Args:
            articles: A list of SimpleArticle instances to get embeddings for.

        Returns:
            A list of ContentEmbedding instances.
        """
        embeddings = []
        for article in articles:
            try:
                content = self._truncate_embed_contents(article)
                result = self._client.models.embed_content(
                    contents=[content],
                    model=self.EMBEDDING_MODEL,
                    config=google.genai.types.EmbedContentConfig(
                        output_dimensionality=self.OUTPUT_DIMENSIONALITY,
                        task_type="CLUSTERING",
                    ),
                )
                if result.embeddings:
                    embeddings.append(result.embeddings[0])
                else:
                    logger.warning(f"No embedding returned for article {article.id}")
                    # 빈 임베딩 벡터 생성 (768차원)
                    dummy_embedding = google.genai.types.ContentEmbedding(
                        values=[0.0] * self.OUTPUT_DIMENSIONALITY
                    )
                    embeddings.append(dummy_embedding)
            except Exception as e:
                logger.error(f"Error getting embedding for article {article.id}: {e}")
                # 오류 발생 시 더미 임베딩 추가
                dummy_embedding = google.genai.types.ContentEmbedding(
                    values=[0.0] * self.OUTPUT_DIMENSIONALITY
                )
                embeddings.append(dummy_embedding)

        return embeddings

    def map_embeddings(
        self,
        articles: list[SimpleArticle],
    ) -> None:
        """Map embeddings to articles using batch processing.

        This method retrieves embeddings for the provided articles in batches
        and maps them to the corresponding SimpleArticle instances.

        Args:
            articles: A list of SimpleArticle instances to map embeddings to.

        Returns:
            None: This method does not return a value. It updates the articles
            in place with their corresponding embeddings.
        """
        if not articles:
            logger.info("No articles to process for embeddings.")
            return

        logger.info(f"Processing embeddings for {len(articles)} articles")

        # 스마트 배치 생성
        batches = self._create_smart_batches(articles)
        logger.info(f"Created {len(batches)} batches for processing")

        # 각 배치별로 임베딩 처리
        article_index = 0
        for batch_idx, batch in enumerate(batches):
            logger.info(
                f"Processing batch {batch_idx + 1}/{len(batches)} with {len(batch)} articles"
            )

            try:
                embeddings = self._get_embeddings_batch(batch)
                if embeddings and len(embeddings) == len(batch):
                    for article, embedding in zip(batch, embeddings):
                        article.embedding_vector = embedding.values
                        article_index += 1
                else:
                    logger.warning(f"Mismatch in embedding count for batch {batch_idx}")
                    # 개별 처리로 fallback
                    individual_embeddings = self._get_embeddings_individually(batch)
                    for article, embedding in zip(batch, individual_embeddings):
                        article.embedding_vector = embedding.values
                        article_index += 1
            except Exception as e:
                logger.error(f"Failed to process batch {batch_idx}: {e}")
                # 해당 배치의 모든 기사에 더미 임베딩 할당
                for article in batch:
                    article.embedding_vector = [0.0] * 768
                    article_index += 1

        logger.info(f"Completed embedding processing for {article_index} articles")


class ClusterClient:

    MIN_CLUSTER_SIZE = 2
    MIN_SAMPLES = 1
    CLUSTER_SELECTION_EPSILON = 0.0

    def __init__(self):
        """Initialize the ClusterClient."""
        pass

    def cluster_articles(
        self,
        articles: list[SimpleArticle],
    ) -> list[list[SimpleArticle]]:
        """Cluster articles based on their embeddings.

        This method uses HDBSCAN to cluster articles based on their embedding vectors.
        It filters out articles with dummy embeddings (all zeros) and performs
        L2 normalization on the embedding vectors before clustering.

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
            article
            for article in articles
            if article.embedding_vector
            and sum(article.embedding_vector) != 0  # 더미 임베딩 제외
        ]
        if not valid_articles:
            logger.info("No valid articles with embeddings to cluster.")
            return []

        vectors = np.array([article.embedding_vector for article in valid_articles])

        # L2 정규화
        norms = np.linalg.norm(vectors, axis=1, keepdims=True)
        safe_norms = np.where(norms == 0, 1, norms)  # 0으로 나누는 것을 방지
        vectors = vectors / safe_norms

        clusterer = hdbscan.HDBSCAN(
            min_cluster_size=self.MIN_CLUSTER_SIZE,
            min_samples=self.MIN_SAMPLES,
            metric="euclidean",
            cluster_selection_method="leaf",  # Excess of Mass
            cluster_selection_epsilon=self.CLUSTER_SELECTION_EPSILON,
        )

        labels = clusterer.fit_predict(vectors)

        clusters: dict[int, list[SimpleArticle]] = collections.defaultdict(list)
        for i, label in enumerate(labels):
            if label == -1:
                continue
            clusters[label].append(valid_articles[i])

        return list(clusters.values())


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
        max_content_length=config.MAX_CONTENT_LENGTH,
        max_batch_size=config.MAX_BATCH_SIZE,
    )

    cluster_client = ClusterClient()

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
        "total_articles": len(unprocessed_articles),
        "total_clusters": len(clusters),
        "clusters": [[article.id for article in cluster] for cluster in clusters],
    }, 200
