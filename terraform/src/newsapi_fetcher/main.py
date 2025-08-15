import dataclasses
import datetime
import json
import logging
import os
from contextlib import contextmanager
from typing import Any, Iterator, Optional

import eventregistry
import functions_framework
import google.cloud.logging
import google.cloud.sql.connector
import pymysql
import pymysql.connections

# Configure logging to Google Cloud Logging
logging_client = google.cloud.logging.Client()
logging_client.setup_logging()
logger = logging.getLogger(__name__)


class Config:
    """Configuration class for managing environment variables and default values.

    This class centralizes all configuration parameters required for the news
    fetching service, including API keys, database connection details, and
    default values for article fetching.

    Attributes:
        NEWSAPI_API_KEY: API key for accessing the News API service.
        INSTANCE_CONNECTION_NAME: Google Cloud SQL instance connection name.
        MYSQL_USERNAME: MySQL database username for authentication.
        MYSQL_PASSWORD: MySQL database password for authentication.
        MYSQL_DATABASE: Name of the MySQL database to connect to.
        DEFAULT_NUM_ARTICLES: Default number of articles to fetch per request.
    """

    NEWSAPI_API_KEY = os.getenv("NEWSAPI_API_KEY", "")

    INSTANCE_CONNECTION_NAME = os.getenv("INSTANCE_CONNECTION_NAME", "")
    MYSQL_USERNAME = os.getenv("MYSQL_FETCHER_USERNAME", "")
    MYSQL_PASSWORD = os.getenv("MYSQL_FETCHER_PASSWORD", "")
    MYSQL_DATABASE = "somesup"

    DEFAULT_NUM_ARTICLES = 5

    def validate(self) -> None:
        """Validates that all required configuration values are set.

        Raises:
            ValueError: If any required environment variable is not set or empty.
        """
        if not self.NEWSAPI_API_KEY:
            raise ValueError("NEWSAPI_API_KEY is not set.")
        if not self.INSTANCE_CONNECTION_NAME:
            raise ValueError("INSTANCE_CONNECTION_NAME is not set.")
        if not self.MYSQL_USERNAME:
            raise ValueError("MYSQL_FETCHER_USERNAME is not set.")
        if not self.MYSQL_PASSWORD:
            raise ValueError("MYSQL_FETCHER_PASSWORD is not set.")


@dataclasses.dataclass
class Article:
    """Data class representing a news article.

    This class encapsulates all the essential information about a news article
    retrieved from the News API, providing a structured way to handle article data
    throughout the application.

    Attributes:
        title: The headline or title of the article.
        body: The main content/body text of the article.
        lang: Language code of the article (e.g., 'eng' for English).
        image: URL of the article's thumbnail or featured image.
        url: Direct URL link to the original article.
        source_name: Name of the news source or publication.
    """

    title: str
    body: str
    lang: str
    image: str
    url: str
    source_name: str

    @classmethod
    def from_api_response(cls, article: dict[str, Any]) -> "Article":
        """Creates an Article instance from API response data.

        Args:
            article: Dictionary containing article data from the API response.
                Expected to contain keys like 'title', 'body', 'lang', 'image',
                'url', and a nested 'source' dictionary with 'title'.

        Returns:
            Article: A new Article instance populated with data from the API response.
        """
        source = article.get("source", {})
        return cls(
            title=article.get("title", ""),
            body=article.get("body", ""),
            lang=article.get("lang", "eng"),
            image=article.get("image", ""),
            url=article.get("url", ""),
            source_name=source.get("title", "Unknown"),
        )


class NewsApiClient:
    """Client for interacting with the EventRegistry News API.

    This class provides methods to authenticate with and fetch articles from
    the EventRegistry API service, handling query construction and response
    processing.

    Attributes:
        _api_key: Private API key for authentication.
        _er: EventRegistry client instance for making API calls.
    """

    def __init__(self, api_key: str) -> None:
        """Initializes the NewsApiClient with the provided API key.

        Args:
            api_key: Valid API key for accessing the EventRegistry service.

        Raises:
            ValueError: If the API key is empty or None.
        """
        if not api_key:
            raise ValueError("API key must be provided.")
        self._api_key = api_key
        self._er = eventregistry.EventRegistry(apiKey=self._api_key)

    def fetch_articles(
        self,
        start_date: str,
        end_date: str,
        num_articles: int,
        source_uri: Optional[str],
    ) -> list[Article]:
        """Fetches articles from the News API within the specified date range.

        Args:
            start_date: Start date for article search in ISO format (YYYY-MM-DD).
            end_date: End date for article search in ISO format (YYYY-MM-DD).
            num_articles: Maximum number of articles to retrieve.
            source_uri: Optional URI of the news source to filter articles by.

        Returns:
            List of Article objects containing the fetched news articles.
            Returns an empty list if no articles are found or if an error occurs.
        """
        query = {
            "$query": {
                "$and": [
                    {
                        "dateStart": start_date,
                        "dateEnd": end_date,
                    },
                ],
            }
        }
        if source_uri is not None:
            query["$query"]["$and"].append(
                {
                    "sourceUri": source_uri,
                }
            )

        q = eventregistry.QueryArticlesIter.initWithComplexQuery(query)
        raw_articles = q.execQuery(self._er, maxItems=num_articles)

        return [Article.from_api_response(article) for article in raw_articles]


class DatabaseClient:
    """Client for managing database operations with Google Cloud SQL."""

    def __init__(
        self,
        instance_name: str,
        username: str,
        password: str,
        database: str,
    ) -> None:
        """Initializes the DatabaseClient with connection parameters."""
        self._instance_name = instance_name
        self._username = username
        self._password = password
        self._database = database

        self._connector = google.cloud.sql.connector.Connector()

    @contextmanager
    def get_connection(self) -> Iterator[pymysql.connections.Connection]:
        """Context manager for database connections.

        Provides a secure way to manage database connections with automatic
        cleanup. The connection is automatically closed when exiting the
        context, even if an exception occurs.

        Yields:
            pymysql.connections.Connection: Active database connection.

        Raises:
            Exception: Re-raises any database connection errors after logging.
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
            raise e
        finally:
            if connection:
                connection.close()

    def get_or_create_provider(self, provider_name: str) -> int:
        """Retrieves or creates a news provider record in the database.

        This method first attempts to find an existing provider with the given name.
        If no provider is found, it creates a new one and returns the new ID.

        Args:
            provider_name: Name of the news provider/source.

        Returns:
            int: The database ID of the provider (existing or newly created).
        """
        with self.get_connection() as conn:
            provider_id = self._get_provider_id(conn, provider_name)
            if provider_id is not None:
                return provider_id

            return self._create_provider(conn, provider_name)

    def _get_provider_id(
        self,
        connection: pymysql.connections.Connection,
        provider_name: str,
    ) -> Optional[int]:
        """Retrieves the ID of an existing provider from the database.

        Args:
            connection: Active database connection.
            provider_name: Name of the provider to search for.

        Returns:
            Article Provider ID if found, None otherwise.
        """
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT id FROM article_provider WHERE name = %s", (provider_name,)
            )
            result = cursor.fetchone()
            return result[0] if result else None

    def _create_provider(
        self,
        connection: pymysql.connections.Connection,
        provider_name: str,
    ) -> int:
        """Creates a new provider record in the database.

        Args:
            connection: Active database connection.
            provider_name: Name of the provider to create.

        Returns:
            The Article Provider ID of the newly created provider.
        """
        with connection.cursor() as cursor:
            cursor.execute(
                "INSERT INTO article_provider (name) VALUES (%s)", (provider_name,)
            )
            connection.commit()
            return cursor.lastrowid

    def check_article_exists(
        self,
        provider_id: int,
        title: str,
    ) -> bool:
        """Checks if an article with the given title already exists for a provider.

        Args:
            provider_id: Database ID of the article provider.
            title: Title of the article to check for.

        Returns:
            True if the article exists, False otherwise.
        """
        with self.get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    "SELECT COUNT(*) FROM article WHERE provider_id = %s AND title = %s",
                    (provider_id, title),
                )
                count = cursor.fetchone()[0]
                return count > 0

    def create_article(
        self,
        provider_id: int,
        article: Article,
    ) -> bool:
        """Creates a new article record in the database.

        This method handles duplicate articles gracefully by logging a warning
        and returning False rather than raising an exception.

        Args:
            provider_id: Database ID of the article provider.
            article: Article object containing the article data to store.

        Returns:
            True if the article was successfully created, False otherwise.
        """
        with self.get_connection() as conn:
            with conn.cursor() as cursor:
                try:
                    cursor.execute(
                        "INSERT INTO article (provider_id, title, content, language, thumbnail_url, news_url) "
                        "VALUES (%s, %s, %s, %s, %s, %s)",
                        (
                            provider_id,
                            article.title,
                            article.body,
                            article.lang,
                            article.image,
                            article.url,
                        ),
                    )
                    conn.commit()
                    return True
                except pymysql.err.IntegrityError as e:
                    logger.warning("Article already exists: %s", e)
                    return False
                except Exception as e:
                    logger.error("Error inserting article: %s", e)
                    return False


class NewsFetcher:
    """Orchestrator class for fetching and storing news articles.

    This class combines the NewsApiClient and DatabaseClient to provide a
    high-level interface for the complete news fetching workflow, including
    article retrieval, provider management, and database storage.
    """

    def __init__(
        self,
        newsapi_client: NewsApiClient,
        db_client: DatabaseClient,
    ) -> None:
        """Initializes the NewsFetcher with required client dependencies.

        Args:
            newsapi_client: Configured NewsApiClient for article fetching.
            db_client: Configured DatabaseClient for data persistence.
        """
        self._newsapi_client = newsapi_client
        self._db_client = db_client

    def fetch_and_store(
        self,
        fromt_date: datetime.date,
        to_date: datetime.date,
        num_articles: int,
        source_uri: Optional[str],
    ) -> tuple[int, int]:
        """Fetches articles from API and stores them in the database.

        This method performs the complete workflow of fetching articles from the
        News API, managing provider records, checking for duplicates, and storing
        new articles in the database.

        Args:
            fromt_date: Start date for article fetching.
            to_date: End date for article fetching.
            num_articles: Maximum number of articles to fetch and process.

        Returns:
            A tuple containing (stored_count, total_count)
                - stored_count: The number of articles successfully stored
                - total_count: The total number of articles fetched from the API.
        """

        articles = self._newsapi_client.fetch_articles(
            start_date=fromt_date.isoformat(),
            end_date=to_date.isoformat(),
            num_articles=num_articles,
            source_uri=source_uri,
        )

        if not articles:
            logger.warning("No articles found for the given date range.")
            return 0, 0

        # Cache provider name and ID to avoid redundant database queries
        provider_cache: dict[str, int] = {}
        for article in articles:
            if article.source_name not in provider_cache:
                provider_id = self._db_client.get_or_create_provider(
                    article.source_name
                )
                provider_cache[article.source_name] = provider_id

        stored_count = 0
        for article in articles:
            provider_id = provider_cache.get(article.source_name)

            if provider_id is None:
                logger.error(
                    "Provider ID not found for %s. Skipping article.",
                    article.source_name,
                )
                continue

            if self._db_client.check_article_exists(provider_id, article.title):
                logger.info("Article '%s' already exists. Skipping.", article.title)
                continue

            if self._db_client.create_article(provider_id, article):
                stored_count += 1

        return stored_count, len(articles)


@functions_framework.http
def main(request) -> dict[str, Any]:
    """Main entry point for the Google Cloud Function.

    This function serves as the HTTP endpoint for the news fetching service.
    It initializes the required components, fetches articles from the previous day,
    and stores them in the database.

    Args:
        request: HTTP request object from the Cloud Functions framework.
            Currently unused but required by the framework interface.

    Returns:
        HTTP response dictionary containing:
            - statusCode: HTTP status code (200 for success, 500 for error)
            - body: JSON string containing either success data or error message

        Success response includes:
            - stored_count: Number of articles successfully stored
            - total_count: Total number of articles fetched
            - from_date: Start date of the fetch operation (ISO format)
            - to_date: End date of the fetch operation (ISO format)
    """
    try:
        config = Config()
        config.validate()
    except ValueError as e:
        logger.error("Configuration error: %s", e)
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
        }

    # Parse query parameters with defaults
    num_articles = int(request.args.get("num_articles", Config.DEFAULT_NUM_ARTICLES))
    source_uri = request.args.get("source_uri", None)

    newsapi_client = NewsApiClient(config.NEWSAPI_API_KEY)
    db_client = DatabaseClient(
        instance_name=config.INSTANCE_CONNECTION_NAME,
        username=config.MYSQL_USERNAME,
        password=config.MYSQL_PASSWORD,
        database=config.MYSQL_DATABASE,
    )
    news_fetcher = NewsFetcher(newsapi_client, db_client)

    from_date = datetime.date.today() - datetime.timedelta(days=1)
    to_date = datetime.date.today()

    stored_count, total_count = news_fetcher.fetch_and_store(
        fromt_date=from_date,
        to_date=to_date,
        num_articles=num_articles,
        source_uri=source_uri,
    )

    return {
        "statusCode": 200,
        "body": json.dumps(
            {
                "stored_count": stored_count,
                "total_count": total_count,
                "from_date": from_date.isoformat(),
                "to_date": to_date.isoformat(),
            }
        ),
    }
