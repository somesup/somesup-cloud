import dataclasses
import datetime
import json
import logging
import os
from contextlib import contextmanager
from typing import Any, Iterator, Optional

import functions_framework
import google.cloud.logging
import google.cloud.sql.connector
import pymysql
import pymysql.connections
import requests
from requests.exceptions import RequestException

# Configure logging to Google Cloud Logging
logging_client = google.cloud.logging.Client()
logging_client.setup_logging()
logger = logging.getLogger(__name__)


class Config:
    """Configuration class for managing environment variables and default values.
    
    This class centralizes all configuration parameters required for the Guardian
    news fetching service, including API keys, database connection details, and
    default values for article fetching.
    
    Attributes:
        GUARDIAN_API_KEY: API key for accessing the Guardian API service.
        GUARDIAN_API_URL: Base URL for the Guardian API.
        INSTANCE_CONNECTION_NAME: Google Cloud SQL instance connection name.
        MYSQL_USERNAME: MySQL database username for authentication.
        MYSQL_PASSWORD: MySQL database password for authentication.
        MYSQL_DATABASE: Name of the MySQL database to connect to.
        DEFAULT_NUM_ARTICLES: Default number of articles to fetch per request.
        GUARDIAN_PROVIDER_NAME: Name of the Guardian provider for database storage.
    """

    GUARDIAN_API_KEY = os.getenv('GUARDIAN_API_KEY', '')
    GUARDIAN_API_URL = "https://content.guardianapis.com/search"

    INSTANCE_CONNECTION_NAME = os.getenv('INSTANCE_CONNECTION_NAME', '')
    MYSQL_USERNAME = os.getenv('MYSQL_FETCHER_USERNAME', '')
    MYSQL_PASSWORD = os.getenv('MYSQL_FETCHER_PASSWORD', '')
    MYSQL_DATABASE = 'somesup'

    DEFAULT_NUM_ARTICLES = 5
    GUARDIAN_PROVIDER_NAME = "The Guardian"

    def validate(self) -> None:
        """Validates that all required configuration values are set.
        
        Raises:
            ValueError: If any required environment variable is not set or empty.
        """
        if not self.GUARDIAN_API_KEY:
            raise ValueError("GUARDIAN_API_KEY is not set.")
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
    retrieved from the Guardian API, providing a structured way to handle article data
    throughout the application.
    
    Attributes:
        title: The headline or title of the article.
        body: The main content/body text of the article.
        lang: Language code of the article (e.g., 'en' for English).
        image: URL of the article's thumbnail or featured image.
        url: Direct URL link to the original article.
        section: The section/category of the article (e.g., 'world', 'politics').
    """

    title: str
    body: str
    lang: str
    image: str
    url: str
    section: str

    @classmethod
    def from_api_response(cls, article: dict[str, Any]) -> 'Article':
        """Creates an Article instance from Guardian API response data.
        
        Args:
            article: Dictionary containing article data from the Guardian API response.
                Expected to contain keys like 'webUrl', 'sectionId', and nested 'fields'
                dictionary with 'headline', 'bodyText', 'lang', 'thumbnail'.
        
        Returns:
            Article: A new Article instance populated with data from the API response.
        """
        fields = article.get('fields', {})
        return cls(title=fields.get('headline', ''),
                   body=fields.get('bodyText', ''),
                   lang=fields.get('lang', 'en'),
                   image=fields.get('thumbnail', ''),
                   url=article.get('webUrl', ''),
                   section=article.get('sectionId', ''))


class GuardianApiClient:
    """Client for interacting with the Guardian API.
    
    This class provides methods to authenticate with and fetch articles from
    the Guardian API service, handling query construction and response processing.
    
    Attributes:
        _api_key: Private API key for authentication.
        _api_url: Base URL for the Guardian API.
    """

    def __init__(self, api_key: str, api_url: str) -> None:
        """Initializes the GuardianApiClient with the provided API key and URL.
        
        Args:
            api_key: Valid API key for accessing the Guardian service.
            api_url: Base URL for the Guardian API.
            
        Raises:
            ValueError: If the API key is empty or None.
        """
        if not api_key:
            raise ValueError("API key must be provided.")
        self._api_key = api_key
        self._api_url = api_url

    def fetch_articles(
        self,
        from_date: datetime.date,
        to_date: datetime.date,
        num_articles: int,
    ) -> list[Article]:
        """Fetches articles from the Guardian API within the specified date range.
        
        Args:
            from_date: Start date for article search (inclusive).
            to_date: End date for article search (inclusive).
            num_articles: Maximum number of articles to retrieve.
        
        Returns:
            List of Article objects containing the fetched news articles.
            Returns an empty list if no articles are found or if an error occurs.
        """
        params = {
            'api-key': self._api_key,
            'from-date': from_date.isoformat(),
            'to-date': to_date.isoformat(),
            'show-fields': 'headline,thumbnail,bodyText,lang,lastModified',
            'section': 'world',
            'page-size': num_articles,
        }

        try:
            response = requests.get(self._api_url, params=params)
            response.raise_for_status()
            api_articles = response.json().get('response',
                                               {}).get('results', [])

            articles = [
                Article.from_api_response(article) for article in api_articles
            ]
            logger.info(f"Fetched {len(articles)} articles from Guardian API.")
            return articles

        except RequestException as e:
            logger.error(f"Error fetching articles from Guardian API: {e}")
            return []
        except Exception as e:
            logger.error(f"Unexpected error: {e}")
            return []


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
            cursor.execute("SELECT id FROM article_provider WHERE name = %s",
                           (provider_name, ))
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
            cursor.execute("INSERT INTO article_provider (name) VALUES (%s)",
                           (provider_name, ))
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
                    (provider_id, title))
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
                        "INSERT INTO article (provider_id, title, content, language, section, thumbnail_url, news_url) "
                        "VALUES (%s, %s, %s, %s, %s, %s, %s)", (
                            provider_id,
                            article.title,
                            article.body,
                            article.lang,
                            article.section,
                            article.image,
                            article.url,
                        ))
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
    
    This class combines the GuardianApiClient and DatabaseClient to provide a
    high-level interface for the complete news fetching workflow, including
    article retrieval, provider management, and database storage.
    """

    def __init__(
        self,
        guardian_client: GuardianApiClient,
        db_client: DatabaseClient,
    ) -> None:
        """Initializes the NewsFetcher with required client dependencies.
        
        Args:
            guardian_client: Configured GuardianApiClient for article fetching.
            db_client: Configured DatabaseClient for data persistence.
        """
        self._guardian_client = guardian_client
        self._db_client = db_client

    def fetch_and_store(
        self,
        from_date: datetime.date,
        to_date: datetime.date,
        num_articles: int,
        provider_name: str,
    ) -> tuple[int, int]:
        """Fetches articles from Guardian API and stores them in the database.
        
        This method performs the complete workflow of fetching articles from the
        Guardian API, managing the Guardian provider record, checking for duplicates, 
        and storing new articles in the database.
        
        Args:
            from_date: Start date for article fetching.
            to_date: End date for article fetching.
            num_articles: Maximum number of articles to fetch and process.
            provider_name: Name of the Guardian provider.
            
        Returns:
            A tuple containing (stored_count, total_count)
                - stored_count: The number of articles successfully stored
                - total_count: The total number of articles fetched from the API.
        """
        articles = self._guardian_client.fetch_articles(
            from_date=from_date,
            to_date=to_date,
            num_articles=num_articles,
        )

        if not articles:
            logger.warning("No articles found for the given date range.")
            return 0, 0

        # Get or create the Guardian provider (cache it since all articles are from Guardian)
        provider_id = self._db_client.get_or_create_provider(provider_name)
        logger.info(f"Using provider ID {provider_id} for {provider_name}")

        stored_count = 0
        for article in articles:
            if self._db_client.check_article_exists(provider_id,
                                                    article.title):
                logger.info("Article '%s' already exists. Skipping.",
                            article.title)
                continue

            if self._db_client.create_article(provider_id, article):
                stored_count += 1

        return stored_count, len(articles)


@functions_framework.http
def main(request) -> dict[str, Any]:
    """Main entry point for the Google Cloud Function.
    
    This function serves as the HTTP endpoint for the Guardian news fetching service.
    It initializes the required components, fetches articles from the previous day,
    and stores them in the database.
    
    Args:
        request: HTTP request object from the Cloud Functions framework.
            Supports query parameters:
                - num_articles: Number of articles to fetch (default: 5)
    
    Returns:
        HTTP response dictionary containing:
            - statusCode: HTTP status code (200 for success, 500 for error)
            - body: JSON string containing either success data or error message
            
        Success response includes:
            - stored_count: Number of articles successfully stored
            - total_count: Total number of articles fetched
            - from_date: Start date of the fetch operation (ISO format)
            - to_date: End date of the fetch operation (ISO format)
            - provider: Name of the news provider
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
    num_articles = int(
        request.args.get('num_articles', Config.DEFAULT_NUM_ARTICLES))

    guardian_client = GuardianApiClient(
        api_key=config.GUARDIAN_API_KEY,
        api_url=config.GUARDIAN_API_URL,
    )

    db_client = DatabaseClient(
        instance_name=config.INSTANCE_CONNECTION_NAME,
        username=config.MYSQL_USERNAME,
        password=config.MYSQL_PASSWORD,
        database=config.MYSQL_DATABASE,
    )

    news_fetcher = NewsFetcher(guardian_client, db_client)

    # Set the date range for fetching articles (previous day)
    to_date = datetime.date.today()
    from_date = to_date - datetime.timedelta(days=1)

    stored_count, total_count = news_fetcher.fetch_and_store(
        from_date=from_date,
        to_date=to_date,
        num_articles=num_articles,
        provider_name=config.GUARDIAN_PROVIDER_NAME,
    )

    return {
        "statusCode":
        200,
        "body":
        json.dumps({
            "stored_count": stored_count,
            "total_count": total_count,
            "from_date": from_date.isoformat(),
            "to_date": to_date.isoformat(),
            "provider": config.GUARDIAN_PROVIDER_NAME,
        }),
    }
