import contextlib
import datetime
import json
import logging
import os
from typing import Iterator, Optional

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
    """Configuration loaded from environment variables."""

    PROJECT_ID = os.getenv("PROJECT_ID", "")

    INSTANCE_CONNECTION_NAME = os.getenv("INSTANCE_CONNECTION_NAME", "")
    MYSQL_USERNAME = os.getenv("MYSQL_USERNAME", "")
    MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "")
    MYSQL_DATABASE = "somesup"

    RECOMMENDATION_DATASET = os.getenv("RECOMMENDATION_DATASET", "")
    P_ARTICLE_EMBEDDING_TABLE = os.getenv("P_ARTICLE_EMBEDDING_TABLE", "")
    USER_EMBEDDING_TABLE = os.getenv("USER_EMBEDDING_TABLE", "")
    SECTION_AVG_EMBEDDINGS_TABLE = os.getenv("SECTION_AVG_EMBEDDINGS_TABLE", "")

    # Action weights
    LIKE_WEIGHT = 3
    SCRAP_WEIGHT = 5
    DETAIL_VIEW_WEIGHT = 2

    # Post-processing
    ENABLE_L2_NORMALIZE = True

    @classmethod
    def validate(cls) -> None:
        """Validate required configuration values.

        Raises:
            ValueError: If any required configuration is missing.
        """
        if not cls.PROJECT_ID:
            raise ValueError("PROJECT_ID is not set.")
        if not cls.INSTANCE_CONNECTION_NAME:
            raise ValueError("INSTANCE_CONNECTION_NAME is not set.")
        if not cls.MYSQL_USERNAME:
            raise ValueError("MYSQL_USERNAME is not set.")
        if not cls.MYSQL_PASSWORD:
            raise ValueError("MYSQL_PASSWORD is not set.")
        if not cls.RECOMMENDATION_DATASET:
            raise ValueError("RECOMMENDATION_DATASET is not set.")
        if not cls.P_ARTICLE_EMBEDDING_TABLE:
            raise ValueError("P_ARTICLE_EMBEDDING_TABLE is not set.")
        if not cls.USER_EMBEDDING_TABLE:
            raise ValueError("USER_EMBEDDING_TABLE is not set.")
        if not cls.SECTION_AVG_EMBEDDINGS_TABLE:
            raise ValueError("SECTION_AVG_EMBEDDINGS_TABLE is not set.")


class DatabaseClient:
    """Client for managing MySQL (Cloud SQL) operations."""

    def __init__(
        self,
        instance_name: str,
        username: str,
        password: str,
        database: str,
    ) -> None:
        """Initialize the DatabaseClient.

        Args:
            instance_name: Cloud SQL instance connection name.
            username: MySQL username.
            password: MySQL password.
            database: Database name.
        """
        self._instance_name = instance_name
        self._username = username
        self._password = password
        self._database = database
        self._connector = google.cloud.sql.connector.Connector()

    @contextlib.contextmanager
    def get_connection(self) -> Iterator[pymysql.connections.Connection]:
        """Context manager that yields a MySQL connection and closes it after use."""
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
        finally:
            if connection:
                connection.close()

    def get_user_recent_likes(
        self,
        user_id: int,
        start_date: Optional[datetime.date] = None,
    ) -> list[int]:
        """Fetch likes by specific user since start_date.

        Args:
            user_id: User ID to fetch likes for.
            start_date: Start date (defaults to 30 days ago).

        Returns:
            List of liked article_ids.
        """
        if start_date is None:
            start_date = datetime.date.today() - datetime.timedelta(days=30)

        query = """
        SELECT p_article_id
        FROM `like`
        WHERE user_id = %s AND liked_at >= %s
        """

        with self.get_connection() as conn:
            with conn.cursor(pymysql.cursors.DictCursor) as cursor:
                cursor.execute(query, (user_id, start_date))
                rows = cursor.fetchall()

        return [int(row["p_article_id"]) for row in rows]

    def get_user_recent_scraps(
        self,
        user_id: int,
        start_date: Optional[datetime.date] = None,
    ) -> list[int]:
        """Fetch scraps by specific user since start_date.

        Args:
            user_id: User ID to fetch scraps for.
            start_date: Start date (defaults to 30 days ago).

        Returns:
            List of scrapped article_ids.
        """
        if start_date is None:
            start_date = datetime.date.today() - datetime.timedelta(days=30)

        query = """
        SELECT p_article_id
        FROM scrap
        WHERE user_id = %s AND scrapped_at >= %s
        """

        with self.get_connection() as conn:
            with conn.cursor(pymysql.cursors.DictCursor) as cursor:
                cursor.execute(query, (user_id, start_date))
                rows = cursor.fetchall()

        return [int(row["p_article_id"]) for row in rows]

    def get_user_recent_detail_views(
        self,
        user_id: int,
        start_date: Optional[datetime.date] = None,
    ) -> list[int]:
        """Fetch detail views by specific user since start_date.

        Args:
            user_id: User ID to fetch detail views for.
            start_date: Start date (defaults to 30 days ago).

        Returns:
            List of viewed article_ids.
        """
        if start_date is None:
            start_date = datetime.date.today() - datetime.timedelta(days=30)

        query = """
        SELECT p_article_id
        FROM article_view_event
        WHERE user_id = %s AND event_at >= %s AND event_type = 'DETAIL_VIEW'
        """

        with self.get_connection() as conn:
            with conn.cursor(pymysql.cursors.DictCursor) as cursor:
                cursor.execute(query, (user_id, start_date))
                rows = cursor.fetchall()

        return [int(row["p_article_id"]) for row in rows]

    def get_user_section_preferences(self, user_id: int) -> dict[int, float]:
        """Fetch section preferences for a specific user.

        Args:
            user_id: User ID.

        Returns:
            Mapping section_id -> preference.
        """
        query = """
        SELECT section_id, preference
        FROM user_article_section_preference
        WHERE user_id = %s
        """

        user_section_preferences: dict[int, float] = {}
        with self.get_connection() as conn:
            with conn.cursor(pymysql.cursors.DictCursor) as cursor:
                cursor.execute(query, (user_id,))
                rows = cursor.fetchall()

        for row in rows:
            sid = int(row["section_id"])
            pref = float(row["preference"])
            user_section_preferences[sid] = pref
        return user_section_preferences

    def get_article_sections_batch(self, article_ids: list[int]) -> dict[int, int]:
        """Fetch section_id for each article in a single IN-clause query.

        Args:
            article_ids: List of article IDs.

        Returns:
            Mapping article_id -> section_id.
        """
        if not article_ids:
            return {}

        placeholders = ",".join(["%s"] * len(article_ids))
        query = f"""
        SELECT id, section_id
        FROM processed_article
        WHERE id IN ({placeholders})
        """

        article_sections: dict[int, int] = {}
        with self.get_connection() as conn:
            with conn.cursor(pymysql.cursors.DictCursor) as cursor:
                cursor.execute(query, article_ids)
                rows = cursor.fetchall()
                for row in rows:
                    article_sections[int(row["id"])] = int(row["section_id"])
        return article_sections


class BigQueryClient:
    """Client for managing BigQuery operations."""

    def __init__(
        self,
        project: str,
        recommendation_dataset: str,
        p_article_embedding_table: str,
        user_embedding_table: str,
        section_avg_embeddings_table: str,
    ):
        """Initialize BigQuery client.

        Args:
            project: GCP Project ID.
            recommendation_dataset: Dataset name.
            p_article_embedding_table: Table name for article embeddings.
            user_embedding_table: Table name for user embeddings.
            section_avg_embeddings_table: Table name for section average embeddings.
        """
        self._project = project
        self._recommendation_dataset = recommendation_dataset
        self._p_article_embedding_table = p_article_embedding_table
        self._user_embedding_table = user_embedding_table
        self._section_avg_embeddings_table = section_avg_embeddings_table
        self._bq_client = bigquery.Client(project=self._project)

    def get_p_article_embeddings_batch(
        self, article_ids: list[int]
    ) -> dict[int, list[float]]:
        """Fetch embeddings for given article IDs.

        Args:
            article_ids: List of article IDs.

        Returns:
            Mapping article_id -> embedding vector (list of floats).
        """
        if not article_ids:
            return {}

        query = f"""
        SELECT p_article_id, embedding_vector
        FROM `{self._project}.{self._recommendation_dataset}.{self._p_article_embedding_table}`
        WHERE p_article_id IN UNNEST(@article_ids)
        """
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ArrayQueryParameter("article_ids", "INT64", article_ids)
            ]
        )
        results = self._bq_client.query(query, job_config=job_config).result()

        embeddings: dict[int, list[float]] = {}
        for row in results:
            if row.embedding_vector:
                embeddings[int(row.p_article_id)] = list(row.embedding_vector)
        return embeddings

    def get_section_avg_embeddings(self) -> dict[int, list[float]]:
        """Fetch average embeddings for each section.

        Returns:
            Mapping section_id -> avg_embedding_vector.
        """
        query = f"""
        SELECT section_id, avg_embedding_vector
        FROM `{self._project}.{self._recommendation_dataset}.{self._section_avg_embeddings_table}`
        """
        results = self._bq_client.query(query).result()
        section_means = {}
        for row in results:
            section_means[int(row.section_id)] = list(row.avg_embedding_vector)

        return section_means

    def upsert_user_embedding(
        self, user_id: int, embedding_vector: list[float]
    ) -> None:
        """Upsert a single user embedding.

        Args:
            user_id: User ID.
            embedding_vector: Embedding vector for the user.
        """
        embedding_json = json.dumps(embedding_vector)

        query = f"""
        MERGE `{self._project}.{self._recommendation_dataset}.{self._user_embedding_table}` T
        USING (
          SELECT
            @user_id AS user_id,
            (SELECT ARRAY(
              SELECT CAST(x AS FLOAT64)
              FROM UNNEST(JSON_EXTRACT_ARRAY(@embedding_json)) AS s
              CROSS JOIN UNNEST([CAST(s AS STRING)]) AS x
            )) AS embedding_vector
        ) S
        ON T.user_id = S.user_id
        WHEN MATCHED THEN
          UPDATE SET embedding_vector = S.embedding_vector, updated_at = CURRENT_TIMESTAMP()
        WHEN NOT MATCHED THEN
          INSERT (user_id, embedding_vector) VALUES (S.user_id, S.embedding_vector)
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("user_id", "INT64", user_id),
                bigquery.ScalarQueryParameter(
                    "embedding_json", "STRING", embedding_json
                ),
            ]
        )
        self._bq_client.query(query, job_config=job_config).result()


class UserEmbeddingGenerator:
    """Generate user embeddings using interactions and section preferences."""

    def __init__(self, db_client: DatabaseClient, bq_client: BigQueryClient):
        """Initialize the generator with DB and BQ clients."""
        self.db_client = db_client
        self.bq_client = bq_client

    def generate_user_embedding(
        self, user_id: int, start_date: Optional[datetime.date] = None
    ) -> Optional[list[float]]:
        """Generate embedding for a specific user.

        Strategy:
        - If user has interactions: weighted average of interacted article embeddings
          using action weights multiplied by user's section preference.
        - If user has no interactions: section-preference-weighted average of section mean embeddings.

        Args:
            user_id: User ID to generate embedding for.
            start_date: Interactions since this date (default: 30 days ago).

        Returns:
            User embedding vector or None if generation fails.
        """
        logger.info("Generating embedding for user %d", user_id)

        # Step 1: Fetch user interactions
        likes = self.db_client.get_user_recent_likes(user_id, start_date)
        scraps = self.db_client.get_user_recent_scraps(user_id, start_date)
        detail_views = self.db_client.get_user_recent_detail_views(user_id, start_date)

        # Collect all interacted article IDs
        interacted_article_ids: set[int] = set()
        interacted_article_ids.update(likes)
        interacted_article_ids.update(scraps)
        interacted_article_ids.update(detail_views)
        interacted_article_ids_list = list(interacted_article_ids)

        # Step 2: Fetch user section preferences
        user_section_preferences = self.db_client.get_user_section_preferences(user_id)

        # Step 3: Try interaction-based embedding first
        if interacted_article_ids_list:
            # Fetch article embeddings and sections for interacted articles
            article_embeddings = self.bq_client.get_p_article_embeddings_batch(
                interacted_article_ids_list
            )
            article_sections = self.db_client.get_article_sections_batch(
                interacted_article_ids_list
            )

            emb = self._compute_user_embedding(
                likes,
                scraps,
                detail_views,
                article_embeddings,
                article_sections,
                user_section_preferences,
            )
            if emb is not None:
                return self._postprocess(emb)

        # Step 4: Fallback to section-preference based embedding
        section_means = self.bq_client.get_section_avg_embeddings()
        cold_emb = self._section_preference_embedding(
            user_section_preferences, section_means
        )

        if cold_emb is None:
            # Final fallback: global mean from section means
            if section_means:
                global_mean_embedding = np.mean(
                    np.array(list(section_means.values())), axis=0
                ).tolist()
                return self._postprocess(global_mean_embedding)
            else:
                logger.warning(
                    "No section means found and no interactions for user %d", user_id
                )
                return None

        return self._postprocess(cold_emb)

    def _compute_user_embedding(
        self,
        liked_articles: list[int],
        scraped_articles: list[int],
        viewed_articles: list[int],
        article_embeddings: dict[int, list[float]],
        article_sections: dict[int, int],
        user_section_preferences: dict[int, float],
    ) -> Optional[list[float]]:
        """Compute interaction-based user embedding using weighted average.

        Args:
            liked_articles: Article IDs liked by the user.
            scraped_articles: Article IDs scrapped by the user.
            viewed_articles: Article IDs viewed in detail by the user.
            article_embeddings: Mapping article_id -> embedding vector.
            article_sections: Mapping article_id -> section_id.
            user_section_preferences: Mapping section_id -> preference weight.

        Returns:
            User embedding vector or None if no valid interactions.
        """
        weighted_embeddings = []
        total_weight = 0.0

        interactions = [
            (liked_articles, Config.LIKE_WEIGHT),
            (scraped_articles, Config.SCRAP_WEIGHT),
            (viewed_articles, Config.DETAIL_VIEW_WEIGHT),
        ]

        for articles, base_weight in interactions:
            for article_id in articles:
                emb = article_embeddings.get(article_id)
                if emb is None:
                    continue
                section_id = article_sections.get(article_id)
                section_pref = 1.0
                if section_id is not None and section_id in user_section_preferences:
                    section_pref = float(user_section_preferences[section_id])
                final_weight = float(base_weight) * section_pref
                weighted_embeddings.append(np.array(emb) * final_weight)
                total_weight += final_weight

        if not weighted_embeddings or total_weight == 0:
            return None

        user_embedding = np.sum(weighted_embeddings, axis=0) / total_weight
        return user_embedding.tolist()

    def _section_preference_embedding(
        self,
        user_section_preferences: dict[int, float],
        section_means: dict[int, list[float]],
    ) -> Optional[list[float]]:
        """Compute section-preference weighted embedding for cold-start users.

        Args:
            user_section_preferences: Mapping section_id -> preference weight.
            section_means: Mapping section_id -> section mean embedding.

        Returns:
            User embedding vector or None if no valid sections.
        """
        weighted = []
        total_w = 0.0
        for sid, w in user_section_preferences.items():
            emb = section_means.get(int(sid))
            if emb is None:
                continue
            ww = float(w)
            if ww <= 0:
                continue
            weighted.append(np.array(emb) * ww)
            total_w += ww

        if not weighted or total_w <= 0:
            return None
        return (np.sum(weighted, axis=0) / total_w).tolist()

    def _postprocess(self, embedding: list[float]) -> list[float]:
        """Optionally L2-normalize embedding vector.

        Args:
            embedding: Raw embedding vector.

        Returns:
            Post-processed embedding vector.
        """
        if not Config.ENABLE_L2_NORMALIZE:
            return embedding
        arr = np.array(embedding, dtype=np.float32)
        norm = np.linalg.norm(arr)
        if norm > 0:
            arr = arr / norm
        return arr.astype(float).tolist()


@functions_framework.http
def main(request):
    """HTTP Cloud Function entry point.

    Expects JSON request body with:
    {
        "userId": 123
    }

    Workflow:
    1) Validate config and parse request.
    2) Initialize DB/BQ clients.
    3) Generate embedding for the specific user.
    4) Upsert result to BigQuery.
    5) Return JSON status.

    Args:
        request: Flask Request object.

    Returns:
        Tuple of (response JSON dict, HTTP status code).
    """
    try:
        Config.validate()
    except ValueError as e:
        logger.error("Configuration validation error: %s", e)
        return {
            "status": "error",
            "message": f"Configuration validation error: {e}",
        }, 500

    # Parse request body
    try:
        request_json = request.get_json()
        if not request_json or "userId" not in request_json:
            return {
                "status": "error",
                "message": "Request body must contain 'userId' field",
            }, 400

        user_id = int(request_json["userId"])
    except (ValueError, TypeError) as e:
        logger.error("Invalid userId in request: %s", e)
        return {"status": "error", "message": "Invalid userId format"}, 400

    try:
        # Initialize clients
        db_client = DatabaseClient(
            Config.INSTANCE_CONNECTION_NAME,
            Config.MYSQL_USERNAME,
            Config.MYSQL_PASSWORD,
            Config.MYSQL_DATABASE,
        )
        bq_client = BigQueryClient(
            Config.PROJECT_ID,
            Config.RECOMMENDATION_DATASET,
            Config.P_ARTICLE_EMBEDDING_TABLE,
            Config.USER_EMBEDDING_TABLE,
            Config.SECTION_AVG_EMBEDDINGS_TABLE,
        )

        # Generate embedding for the specific user
        embedding_generator = UserEmbeddingGenerator(db_client, bq_client)
        user_embedding = embedding_generator.generate_user_embedding(user_id)

        if user_embedding is None:
            logger.warning("Failed to generate embedding for user %d", user_id)
            return {
                "status": "error",
                "message": f"Failed to generate embedding for user {user_id}",
            }, 500

        # Upsert to BigQuery
        logger.info("Saving embedding for user %d to BigQuery...", user_id)
        bq_client.upsert_user_embedding(user_id, user_embedding)

        return {
            "status": "success",
            "userId": user_id,
            "message": f"Successfully recalculated and saved embedding for user {user_id}",
        }, 200

    except Exception as e:
        logger.error("Error in user embedding recalculation: %s", str(e), exc_info=True)
        return {
            "status": "error",
            "message": f"Failed to recalculate user embedding: {str(e)}",
        }, 500
