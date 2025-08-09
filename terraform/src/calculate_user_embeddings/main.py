import collections
import contextlib
import datetime
import logging
import os
from typing import Dict, Iterator, List, Optional

import functions_framework
import google.cloud.logging
import google.cloud.sql.connector
import numpy as np
import pymysql
import pymysql.connections
from google.cloud import bigquery

# Configure logging to Google Cloud Logging
logging_client = google.cloud.logging.Client()
logging_client.setup_logging()
logger = logging.getLogger(__name__)


class Config:
    PROJECT_ID = os.getenv("PROJECT_ID", "")

    INSTANCE_CONNECTION_NAME = os.getenv("INSTANCE_CONNECTION_NAME", '')
    MYSQL_USERNAME = os.getenv('MYSQL_USERNAME', '')
    MYSQL_PASSWORD = os.getenv('MYSQL_PASSWORD', '')
    MYSQL_DATABASE = 'somesup'

    RECOMMENDATION_DATASET = os.getenv("RECOMMENDATION_DATASET", "")
    P_ARTICLE_EMBEDDING_TABLE = os.getenv("P_ARTICLE_EMBEDDING_TABLE", "")
    USER_EMBEDDING_TABLE = os.getenv("USER_EMBEDDING_TABLE", "")

    # Action weights
    LIKE_WEIGHT = 3
    SCRAP_WEIGHT = 5
    DETAIL_VIEW_WEIGHT = 2

    @classmethod
    def validate(cls) -> None:
        """Validates the configuration by checking required environment variables."""
        if not cls.PROJECT_ID:
            raise ValueError("PROJECT_ID is not set.")
        if not cls.INSTANCE_CONNECTION_NAME:
            raise ValueError("INSTANCE_CONNECTION_NAME is not set.")
        if not cls.MYSQL_USERNAME:
            raise ValueError("MYSQL_FETCHER_USERNAME is not set.")
        if not cls.MYSQL_PASSWORD:
            raise ValueError("MYSQL_FETCHER_PASSWORD is not set.")
        if not cls.RECOMMENDATION_DATASET:
            raise ValueError("RECOMMENDATION_DATASET is not set.")
        if not cls.P_ARTICLE_EMBEDDING_TABLE:
            raise ValueError("P_ARTICLE_EMBEDDING_TABLE is not set.")
        if not cls.USER_EMBEDDING_TABLE:
            raise ValueError("USER_EMBEDDING_TABLE is not set.")


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

    @contextlib.contextmanager
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

    def get_recent_likes_by_user(
        self,
        start_date: Optional[datetime.date] = None,
    ) -> dict[str, list[int]]:
        """Fetches recent likes by users from the database.

        This method retrieves likes made by users since a specified start date.
        If no start date is provided, it defaults to 30 days ago.

        Args:
            start_date: The date from which to start fetching likes. (defaults to 30 days ago)

        Returns:
            A dictionary mapping user IDs to lists of article IDs they have liked.
        """
        if start_date is None:
            start_date = datetime.date.today() - datetime.timedelta(days=30)

        query = """
        SELECT p_article_id, user_id
        FROM `like`
        WHERE liked_at >= %s
        """

        user_likes = collections.defaultdict(list[int])

        with self.get_connection() as conn:
            with conn.cursor(pymysql.cursors.DictCursor) as cursor:
                cursor.execute(query, (start_date, ))
                rows = cursor.fetchall()

        for row in rows:
            user_likes[row["user_id"]].append(row["p_article_id"])

        return user_likes

    def get_recent_scraps_by_user(
        self,
        start_date: Optional[datetime.date] = None,
    ) -> dict[str, list[int]]:
        """Fetches recent scraps by users from the database.

        This method retrieves scraps made by users since a specified start date.
        If no start date is provided, it defaults to 30 days ago.

        Args:
            start_date: The date from which to start fetching scraps. (defaults to 30 days ago)

        Returns:
            A dictionary mapping user IDs to lists of article IDs they have scraped.
        """
        if start_date is None:
            start_date = datetime.date.today() - datetime.timedelta(days=30)

        query = """
        SELECT p_article_id, user_id
        FROM scrap
        WHERE scrapped_at >= %s
        """

        user_scraps = collections.defaultdict(list[int])

        with self.get_connection() as conn:
            with conn.cursor(pymysql.cursors.DictCursor) as cursor:
                cursor.execute(query, (start_date, ))
                rows = cursor.fetchall()

        for row in rows:
            user_scraps[row["user_id"]].append(row["p_article_id"])

        return user_scraps

    def get_recent_detail_view_by_user(
        self,
        start_date: Optional[datetime.date] = None,
    ) -> dict[str, list[int]]:
        """Fetches recent detail views by users from the database.

        This method retrieves detail views made by users since a specified start date.
        If no start date is provided, it defaults to 30 days ago.

        Args:
            start_date: The date from which to start fetching detail views. (defaults to 30 days ago)

        Returns:
            A dictionary mapping user IDs to lists of article IDs they have viewed.
        """
        if start_date is None:
            start_date = datetime.date.today() - datetime.timedelta(days=30)

        query = """
        SELECT p_article_id, user_id
        FROM article_view_event
        WHERE event_at >= %s AND event_type = 'DETAIL_VIEW'
        """

        user_detail_views = collections.defaultdict(list[int])

        with self.get_connection() as conn:
            with conn.cursor(pymysql.cursors.DictCursor) as cursor:
                cursor.execute(query, (start_date, ))
                rows = cursor.fetchall()

        for row in rows:
            user_detail_views[row["user_id"]].append(row["p_article_id"])

        return user_detail_views

    def get_user_section_preferences_batch(
        self,
        user_ids: list[str],
    ) -> dict[str, dict[int, int]]:
        """Fetches section preferences for multiple users in a single query.

        Args:
            user_ids: List of user IDs to fetch preferences for.

        Returns:
            A dictionary mapping user IDs to their section preferences.
        """
        if not user_ids:
            return {}

        # Create placeholders for the IN clause
        placeholders = ','.join(['%s'] * len(user_ids))
        query = f"""
        SELECT user_id, section_id, preference
        FROM user_article_section_preference
        WHERE user_id IN ({placeholders})
        """

        user_section_preferences = collections.defaultdict(dict)

        with self.get_connection() as conn:
            with conn.cursor(pymysql.cursors.DictCursor) as cursor:
                cursor.execute(query, user_ids)
                rows = cursor.fetchall()

        for row in rows:
            user_id = row["user_id"]
            section_id = row["section_id"]
            preference_score = row["preference"]
            user_section_preferences[user_id][section_id] = preference_score

        return user_section_preferences

    def get_article_sections_batch(
        self,
        article_ids: list[int],
    ) -> dict[int, int]:
        """Fetches section information for multiple articles in a single query.

        Args:
            article_ids: List of article IDs to fetch sections for.

        Returns:
            A dictionary mapping article IDs to their section IDs.
        """
        if not article_ids:
            return {}

        placeholders = ','.join(['%s'] * len(article_ids))
        query = f"""
        SELECT id, section_id
        FROM processed_article
        WHERE id IN ({placeholders})
        """

        article_sections = {}

        with self.get_connection() as conn:
            with conn.cursor(pymysql.cursors.DictCursor) as cursor:
                cursor.execute(query, article_ids)
                rows = cursor.fetchall()

        for row in rows:
            article_sections[row["id"]] = row["section_id"]

        return article_sections


class BigQueryClient:

    def __init__(
        self,
        project: str,
        recommendation_dataset: str,
        p_article_embedding_table: str,
        user_embedding_table: str,
    ):
        self._project = project

        self._recommendation_dataset = recommendation_dataset
        self._p_article_embedding_table = p_article_embedding_table
        self._user_embedding_table = user_embedding_table

        self._bq_client = bigquery.Client(project=self._project)

    def get_p_article_embeddings_batch(
        self,
        article_ids: list[int],
    ) -> dict[int, list[float]]:
        """Fetches embeddings for multiple P articles in a single query.

        Args:
            article_ids: List of article IDs to fetch embeddings for.

        Returns:
            A dictionary mapping article IDs to their embedding vectors.
        """
        if not article_ids:
            return {}

        # Convert list to string for BigQuery array parameter
        article_ids_str = [str(id) for id in article_ids]

        query = f"""
        SELECT p_article_id, embedding_vector
        FROM `{self._project}.{self._recommendation_dataset}.{self._p_article_embedding_table}`
        WHERE p_article_id IN UNNEST(@article_ids)
        """

        job_config = bigquery.QueryJobConfig(query_parameters=[
            bigquery.ArrayQueryParameter("article_ids", "INT64", article_ids)
        ])

        query_job = self._bq_client.query(query, job_config=job_config)
        results = query_job.result()

        embeddings = {}
        for row in results:
            if row.embedding_vector:
                embeddings[row.p_article_id] = row.embedding_vector

        return embeddings

    def upsert_user_embeddings_batch(
        self,
        user_embeddings: dict[str, list[float]],
    ) -> None:
        """Inserts or updates multiple user embeddings in BigQuery using individual queries.

        Args:
            user_embeddings: Dictionary mapping user IDs to their embedding vectors.
        """
        if not user_embeddings:
            return

        successful_updates = 0

        for user_id, embedding_vector in user_embeddings.items():
            try:
                merge_sql = f"""
                MERGE `{self._project}.{self._recommendation_dataset}.{self._user_embedding_table}` T
                USING (SELECT @user_id as user_id, @embedding_vector as embedding_vector) S
                ON T.user_id = S.user_id
                WHEN MATCHED THEN
                    UPDATE SET
                        embedding_vector = S.embedding_vector,
                        updated_at = CURRENT_TIMESTAMP()
                WHEN NOT MATCHED THEN
                    INSERT (user_id, embedding_vector)
                    VALUES (S.user_id, S.embedding_vector)
                """

                job_config = bigquery.QueryJobConfig(query_parameters=[
                    bigquery.ScalarQueryParameter("user_id", "INT64",
                                                  int(user_id)),
                    bigquery.ArrayQueryParameter("embedding_vector", "FLOAT64",
                                                 embedding_vector)
                ])

                job = self._bq_client.query(merge_sql, job_config=job_config)
                job.result()
                successful_updates += 1

            except Exception as e:
                logger.warning(
                    f"Failed to upsert embedding for user {user_id}: {e}")
                continue

        logger.info(
            "Successfully upserted %d out of %d user embeddings to BigQuery",
            successful_updates,
            len(user_embeddings),
        )


class UserEmbeddingGenerator:
    """Generates user embeddings based on their interactions with articles."""

    def __init__(self, db_client: DatabaseClient, bq_client: BigQueryClient):
        self.db_client = db_client
        self.bq_client = bq_client

    def generate_user_embeddings(
        self,
        start_date: Optional[datetime.date] = None,
    ) -> dict[str, list[float]]:
        """Generates embeddings for all users based on their recent interactions.
        
        Args:
            start_date: The date from which to consider interactions (defaults to 30 days ago)
            
        Returns:
            Dictionary mapping user IDs to their computed embedding vectors.
        """
        logger.info("Starting user embedding generation...")

        # Step 1: Get all user interactions
        logger.info("Fetching user interactions...")
        likes = self.db_client.get_recent_likes_by_user(start_date)
        scraps = self.db_client.get_recent_scraps_by_user(start_date)
        detail_views = self.db_client.get_recent_detail_view_by_user(
            start_date)

        # Get all unique users and articles
        all_users = set(likes.keys()) | set(scraps.keys()) | set(
            detail_views.keys())
        all_articles = set()
        for user_articles in likes.values():
            all_articles.update(user_articles)
        for user_articles in scraps.values():
            all_articles.update(user_articles)
        for user_articles in detail_views.values():
            all_articles.update(user_articles)

        all_articles = list(all_articles)
        all_users = list(all_users)

        logger.info(
            f"Found {len(all_users)} users and {len(all_articles)} unique articles"
        )

        # Step 2: Batch fetch article embeddings and sections
        logger.info("Fetching article embeddings and sections...")
        article_embeddings = self.bq_client.get_p_article_embeddings_batch(
            all_articles)
        article_sections = self.db_client.get_article_sections_batch(
            all_articles)

        # Step 3: Batch fetch user section preferences
        logger.info("Fetching user section preferences...")
        user_section_preferences = self.db_client.get_user_section_preferences_batch(
            all_users)

        # Step 4: Generate user embeddings
        logger.info("Computing user embeddings...")
        user_embeddings = {}

        for user_id in all_users:
            user_embedding = self._compute_user_embedding(
                likes.get(user_id, []),
                scraps.get(user_id, []),
                detail_views.get(user_id, []),
                article_embeddings,
                article_sections,
                user_section_preferences.get(user_id, {}),
            )

            if user_embedding is not None:
                user_embeddings[user_id] = user_embedding

        logger.info(f"Generated embeddings for {len(user_embeddings)} users")
        return user_embeddings

    def _compute_user_embedding(
        self,
        liked_articles: List[int],
        scraped_articles: List[int],
        viewed_articles: List[int],
        article_embeddings: Dict[int, List[float]],
        article_sections: Dict[int, int],
        user_section_preferences: dict[int, int],
    ) -> Optional[List[float]]:
        """Computes a user's embedding based on their interactions.
        
        Args:
            user_id: The user ID
            liked_articles: List of article IDs the user liked
            scraped_articles: List of article IDs the user scraped
            viewed_articles: List of article IDs the user viewed in detail
            article_embeddings: Mapping of article IDs to their embeddings
            article_sections: Mapping of article IDs to their section IDs
            user_section_preferences: User's section preference scores
            
        Returns:
            The computed user embedding vector, or None if no valid articles found.
        """
        weighted_embeddings = []
        total_weight = 0.0

        # Process each interaction type
        interactions = [(liked_articles, Config.LIKE_WEIGHT),
                        (scraped_articles, Config.SCRAP_WEIGHT),
                        (viewed_articles, Config.DETAIL_VIEW_WEIGHT)]

        for articles, base_weight in interactions:
            for article_id in articles:
                # Skip if we don't have embedding for this article
                if article_id not in article_embeddings:
                    continue

                embedding = article_embeddings[article_id]
                section_id = article_sections.get(article_id)

                # Calculate final weight (base weight * section preference)
                section_preference = 1  # Default preference
                if section_id and section_id in user_section_preferences:
                    section_preference = user_section_preferences[section_id]

                final_weight = base_weight * section_preference

                # Add weighted embedding
                weighted_embedding = np.array(embedding) * final_weight
                weighted_embeddings.append(weighted_embedding)
                total_weight += final_weight

        if not weighted_embeddings or total_weight == 0:
            return None

        # Compute weighted average
        user_embedding = np.sum(weighted_embeddings, axis=0) / total_weight
        return user_embedding.tolist()


@functions_framework.http
def main(request):
    try:
        Config.validate()
    except ValueError as e:
        logger.error(f"Configuration validation error: {e}")
        return f"Configuration validation error: {e}", 500

    try:
        # Initialize clients
        db_client = DatabaseClient(Config.INSTANCE_CONNECTION_NAME,
                                   Config.MYSQL_USERNAME,
                                   Config.MYSQL_PASSWORD,
                                   Config.MYSQL_DATABASE)

        bq_client = BigQueryClient(
            Config.PROJECT_ID,
            Config.RECOMMENDATION_DATASET,
            Config.P_ARTICLE_EMBEDDING_TABLE,
            Config.USER_EMBEDDING_TABLE,
        )
        # Generate user embeddings
        embedding_generator = UserEmbeddingGenerator(db_client, bq_client)
        user_embeddings = embedding_generator.generate_user_embeddings()

        # Save embeddings to BigQuery
        if user_embeddings:
            logger.info(
                f"Saving {len(user_embeddings)} user embeddings to BigQuery..."
            )
            bq_client.upsert_user_embeddings_batch(user_embeddings)

        return {
            "status":
            "success",
            "processed_users":
            len(user_embeddings),
            "message":
            f"Successfully generated and saved embeddings for {len(user_embeddings)} users"
        }, 200

    except Exception as e:
        logger.error(f"Error in user embedding generation: {str(e)}",
                     exc_info=True)
        return {
            "status": "error",
            "message": f"Failed to generate user embeddings: {str(e)}"
        }, 500
