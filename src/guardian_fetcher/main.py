import datetime
import sys
import json
import logging
import os
from typing import Any

import flask
import google.cloud.sql.connector
import pymysql
import pymysql.connections
import pymysql.cursors
import requests
from requests.exceptions import RequestException


# Constants
class Config:
    """Application configuration management"""
    GUARDIAN_API_URL = "https://content.guardianapis.com/search"
    GUARDIAN_API_KEY = os.getenv('GUARDIAN_API_KEY')
    GUARDIAN_PROVIDER_ID = 1  # Guardian Provider ID in article_provider table

    INSTANCE_CONNECTION_NAME = os.getenv('INSTANCE_CONNECTION_NAME')
    MYSQL_USERNAME = os.getenv('MYSQL_FETCHER_USERNAME')
    MYSQL_PASSWORD = os.getenv('MYSQL_FETCHER_PASSWORD')
    MYSQL_DATABASE = 'somesup'

    DEFAULT_NUM_ARTICLES = 5


# Logging configuration
logging.basicConfig(
    level=logging.INFO,
    stream=sys.stdout,
    format='%(levelname)s %(asctime)s %(message)s',
)
logger = logging.getLogger(__name__)


class GuardianClient:
    """Client for interacting with the Guardian API"""

    def __init__(self, api_key: str, api_url: str):
        self._api_key = api_key
        self._api_url = api_url

    def fetch_articles(
        self,
        from_date: datetime.date,
        to_date: datetime.date,
        num_articles: int,
    ) -> list[dict[str, Any]]:
        """
        Fetch articles from the Guardian API within the specified date range.
        
        Args:
            from_date: The start date for fetching articles (inclusive)
            to_date: The end date for fetching articles (inclusive)
            num_articles: Number of articles to fetch
            
        Returns:
            List of article data dictionaries
        """
        if not self._api_key:
            logger.error("Guardian API key is not set.")
            return []

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
            articles = response.json().get('response', {}).get('results', [])
            logger.info(f"Fetched {len(articles)} articles from Guardian API.")
            return articles
        except RequestException as e:
            logger.error(f"Error fetching articles from Guardian API: {e}")
            return []
        except Exception as e:
            logger.error(f"Unexpected error: {e}")
            return []


class DatabaseClient:
    """Client for interacting with the MySQL database"""

    def __init__(
        self,
        instance_name: str,
        username: str,
        password: str,
        database: str,
    ):
        self._instance_name = instance_name
        self._username = username
        self._password = password
        self._database = database

    def get_connection(self) -> pymysql.connections.Connection:
        """
        Establish a connection to the MySQL database using Cloud SQL Connector.
        
        Returns:
            A connection object to the MySQL database
        """
        try:
            connector = google.cloud.sql.connector.Connector()
            connection = connector.connect(
                self._instance_name,
                "pymysql",
                user=self._username,
                password=self._password,
                db=self._database,
            )
            return connection
        except Exception as e:
            logger.error(f"Error connecting to database: {e}")
            raise

    def article_exists(
        self,
        cursor: pymysql.cursors.Cursor,
        provider_id: int,
        title: str,
    ) -> bool:
        """
        Check if an article already exists in the database.
        
        Args:
            cursor: Database cursor
            provider_id: Provider ID
            title: Article title
            
        Returns:
            True if article exists, False otherwise
        """
        check_sql = """
            SELECT COUNT(*) FROM article WHERE provider_id = %s AND title = %s
        """
        cursor.execute(check_sql, (provider_id, title))
        count = cursor.fetchone()[0]
        return count > 0

    def insert_article(
        self,
        cursor,
        provider_id: int,
        article: dict[str, Any],
    ) -> bool:
        """
        Insert an article into the database.
        
        Args:
            cursor: Database cursor
            provider_id: Provider ID
            article: Article data
            
        Returns:
            True on success, False on failure
        """
        insert_sql = """
            INSERT INTO article (provider_id, title, content, language, section, thumbnail_url, news_url)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """

        fields = article.get('fields', {})

        try:
            cursor.execute(insert_sql, (
                provider_id,
                fields.get('headline'),
                fields.get('bodyText'),
                fields.get('lang'),
                article.get('sectionId'),
                fields.get('thumbnail'),
                article.get('webUrl'),
            ))
            return True
        except pymysql.err.IntegrityError as e:
            logger.warning(f"Duplicate article entry: {e}")
            return False
        except Exception as e:
            logger.error(f"Error inserting article: {e}")
            return False

    def store_articles(
        self,
        articles: list[dict[str, Any]],
        provider_id: int,
    ) -> int:
        """
        Store a list of articles in the MySQL database.
        
        Args:
            articles: List of articles to store
            provider_id: Provider ID
            
        Returns:
            Number of articles successfully stored
        """
        if not articles:
            return 0

        conn = None
        stored_count = 0

        try:
            conn = self.get_connection()
            with conn.cursor() as cursor:
                for article in articles:
                    title = article.get('fields', {}).get('headline')
                    if self.article_exists(cursor, provider_id, title):
                        logger.warning(
                            f"Article '{title}' already exists in the database."
                        )
                        continue

                    if self.insert_article(cursor, provider_id, article):
                        stored_count += 1

            conn.commit()
            logger.info(f"{stored_count} articles stored successfully.")
            return stored_count

        except Exception as e:
            logger.error(f"Error storing articles: {e}")
            if conn:
                conn.rollback()
            return stored_count

        finally:
            if conn:
                conn.close()


class NewsFetcher:
    """Class for fetching and storing news articles"""

    def __init__(
        self,
        guardian_client: GuardianClient,
        db_client: DatabaseClient,
    ):
        self._guardian_client = guardian_client
        self._db_client = db_client

    def fetch_and_store(
        self,
        from_date: datetime.date,
        to_date: datetime.date,
        num_articles: int,
        provider_id: int,
    ) -> dict[str, Any]:
        """
        Fetch news articles and store them in the database.
        
        Args:
            from_date: Start date for articles
            to_date: End date for articles
            num_articles: Number of articles to fetch
            provider_id: Provider ID
            
        Returns:
            Dictionary with operation results
        """
        # Fetch articles from Guardian API
        articles = self._guardian_client.fetch_articles(
            from_date, to_date, num_articles)

        if not articles:
            logger.warning("No articles found.")
            return {
                'statusCode': 200,
                'body': json.dumps({"message": "No articles found."}),
                'headers': {
                    'Content-Type': 'application/json'
                }
            }

        # Store articles in database
        stored_count = self._db_client.store_articles(articles, provider_id)

        return {
            'statusCode': 200,
            'body':
            f"Fetched {len(articles)} articles and successfully stored {stored_count}.",
            'headers': {
                'Content-Type': 'application/json'
            }
        }


def main(request: flask.Request) -> dict[str, Any]:
    """
    Main entry point for the Cloud Function.
    
    Args:
        request: The incoming request object
        
    Returns:
        A response dictionary with status code, body, and headers
    """
    try:
        # Get the number of articles to fetch from the request (default to 5)
        request_json = request.get_json(silent=True) or {}
        num_articles = int(
            request_json.get('num_articles', Config.DEFAULT_NUM_ARTICLES))

        # Set the date range for fetching articles (1 day)
        to_date = datetime.date.today()
        from_date = to_date - datetime.timedelta(days=1)

        guardian_client = GuardianClient(
            api_key=Config.GUARDIAN_API_KEY,
            api_url=Config.GUARDIAN_API_URL,
        )

        db_client = DatabaseClient(
            instance_name=Config.INSTANCE_CONNECTION_NAME,
            username=Config.MYSQL_USERNAME,
            password=Config.MYSQL_PASSWORD,
            database=Config.MYSQL_DATABASE,
        )

        news_fetcher = NewsFetcher(guardian_client, db_client)

        result = news_fetcher.fetch_and_store(
            from_date=from_date,
            to_date=to_date,
            num_articles=num_articles,
            provider_id=Config.GUARDIAN_PROVIDER_ID)

        return result

    except Exception as e:
        logger.error(f"Error executing Cloud Function: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps({"error": f"Internal server error: {str(e)}"}),
            'headers': {
                'Content-Type': 'application/json'
            }
        }
