import collections
import contextlib
import datetime
import json
import logging
import os
from typing import Dict, Iterator, List, Optional, Sequence, Tuple, TypeVar

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

T = TypeVar("T")


def chunked(seq: Sequence[T], n: int) -> List[List[T]]:
    """Split a sequence into chunks of size n.

    Args:
        seq: Input sequence of any type.
        n: Chunk size (>0).

    Returns:
        List of chunks, preserving the element type.

    Raises:
        ValueError: If n <= 0.
    """
    if n <= 0:
        raise ValueError("Chunk size n must be > 0")
    return [list(seq[i:i + n]) for i in range(0, len(seq), n)]


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

    # Action weights
    LIKE_WEIGHT = 3
    SCRAP_WEIGHT = 5
    DETAIL_VIEW_WEIGHT = 2

    # Post-processing
    ENABLE_L2_NORMALIZE = True

    # Performance tuning
    SECTION_MEAN_SAMPLE_SIZE = int(os.getenv("SECTION_MEAN_SAMPLE_SIZE",
                                             "50"))  # per section
    BATCH_SIZE_BQ_UPSERT = int(os.getenv("BATCH_SIZE_BQ_UPSERT",
                                         "500"))  # rows per MERGE

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

    def get_all_user_ids(self) -> List[int]:
        """Fetch all user IDs.

        Returns:
            List of user IDs (ints).
        """
        query = "SELECT id FROM user"
        with self.get_connection() as conn:
            with conn.cursor(pymysql.cursors.DictCursor) as cursor:
                cursor.execute(query)
                rows = cursor.fetchall()
        return [int(row["id"]) for row in rows]

    def get_recent_likes_by_user(
        self,
        start_date: Optional[datetime.date] = None,
    ) -> dict[int, list[int]]:
        """Fetch likes by user since start_date.

        Args:
            start_date: Start date (defaults to 30 days ago).

        Returns:
            Mapping user_id -> list of liked article_ids.
        """
        if start_date is None:
            start_date = datetime.date.today() - datetime.timedelta(days=30)

        query = """
        SELECT p_article_id, user_id
        FROM `like`
        WHERE liked_at >= %s
        """

        user_likes: dict[int, list[int]] = collections.defaultdict(list)
        with self.get_connection() as conn:
            with conn.cursor(pymysql.cursors.DictCursor) as cursor:
                cursor.execute(query, (start_date, ))
                rows = cursor.fetchall()

        for row in rows:
            user_likes[int(row["user_id"])].append(int(row["p_article_id"]))
        return user_likes

    def get_recent_scraps_by_user(
        self,
        start_date: Optional[datetime.date] = None,
    ) -> dict[int, list[int]]:
        """Fetch scraps by user since start_date.

        Args:
            start_date: Start date (defaults to 30 days ago).

        Returns:
            Mapping user_id -> list of scrapped article_ids.
        """
        if start_date is None:
            start_date = datetime.date.today() - datetime.timedelta(days=30)

        query = """
        SELECT p_article_id, user_id
        FROM scrap
        WHERE scrapped_at >= %s
        """

        user_scraps: dict[int, list[int]] = collections.defaultdict(list)
        with self.get_connection() as conn:
            with conn.cursor(pymysql.cursors.DictCursor) as cursor:
                cursor.execute(query, (start_date, ))
                rows = cursor.fetchall()

        for row in rows:
            user_scraps[int(row["user_id"])].append(int(row["p_article_id"]))
        return user_scraps

    def get_recent_detail_view_by_user(
        self,
        start_date: Optional[datetime.date] = None,
    ) -> dict[int, list[int]]:
        """Fetch detail views by user since start_date.

        Args:
            start_date: Start date (defaults to 30 days ago).

        Returns:
            Mapping user_id -> list of viewed article_ids.
        """
        if start_date is None:
            start_date = datetime.date.today() - datetime.timedelta(days=30)

        query = """
        SELECT p_article_id, user_id
        FROM article_view_event
        WHERE event_at >= %s AND event_type = 'DETAIL_VIEW'
        """

        user_detail_views: dict[int, list[int]] = collections.defaultdict(list)
        with self.get_connection() as conn:
            with conn.cursor(pymysql.cursors.DictCursor) as cursor:
                cursor.execute(query, (start_date, ))
                rows = cursor.fetchall()

        for row in rows:
            user_detail_views[int(row["user_id"])].append(
                int(row["p_article_id"]))
        return user_detail_views

    def get_user_section_preferences_batch(
            self, user_ids: list[int]) -> dict[int, dict[int, float]]:
        """Fetch section preferences for a list of users.

        Args:
            user_ids: List of user IDs.

        Returns:
            Mapping user_id -> {section_id: preference}.
        """
        if not user_ids:
            return {}

        placeholders = ",".join(["%s"] * len(user_ids))
        query = f"""
        SELECT user_id, section_id, preference
        FROM user_article_section_preference
        WHERE user_id IN ({placeholders})
        """

        user_section_preferences: dict[int, dict[
            int, float]] = collections.defaultdict(dict)
        with self.get_connection() as conn:
            with conn.cursor(pymysql.cursors.DictCursor) as cursor:
                cursor.execute(query, user_ids)
                rows = cursor.fetchall()

        for row in rows:
            uid = int(row["user_id"])
            sid = int(row["section_id"])
            pref = float(row["preference"])
            user_section_preferences[uid][sid] = pref
        return user_section_preferences

    def get_article_sections_batch(self,
                                   article_ids: list[int]) -> dict[int, int]:
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

    def get_section_sample_articles(
            self, limit_per_section: int) -> dict[int, list[int]]:
        """Fetch a small sample of article IDs per section.

        This is used to approximate section mean embeddings without scanning all articles.

        Args:
            limit_per_section: Number of articles to sample per section.

        Returns:
            Mapping section_id -> list of sampled article_ids.
        """
        query = f"""
        SELECT section_id, id
        FROM (
            SELECT
              section_id,
              id,
              ROW_NUMBER() OVER (PARTITION BY section_id ORDER BY id DESC) AS rn
            FROM processed_article
        ) t
        WHERE rn <= %s
        """
        by_section: dict[int, list[int]] = collections.defaultdict(list)
        with self.get_connection() as conn:
            with conn.cursor(pymysql.cursors.DictCursor) as cursor:
                cursor.execute(query, (limit_per_section, ))
                rows = cursor.fetchall()
        for row in rows:
            by_section[int(row["section_id"])].append(int(row["id"]))
        return by_section


class BigQueryClient:
    """Client for managing BigQuery operations."""

    def __init__(
        self,
        project: str,
        recommendation_dataset: str,
        p_article_embedding_table: str,
        user_embedding_table: str,
    ):
        """Initialize BigQuery client.

        Args:
            project: GCP Project ID.
            recommendation_dataset: Dataset name.
            p_article_embedding_table: Table name for article embeddings.
            user_embedding_table: Table name for user embeddings.
        """
        self._project = project
        self._recommendation_dataset = recommendation_dataset
        self._p_article_embedding_table = p_article_embedding_table
        self._user_embedding_table = user_embedding_table
        self._bq_client = bigquery.Client(project=self._project)

    def get_p_article_embeddings_batch(
            self, article_ids: list[int]) -> dict[int, list[float]]:
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
        job_config = bigquery.QueryJobConfig(query_parameters=[
            bigquery.ArrayQueryParameter("article_ids", "INT64", article_ids)
        ])
        results = self._bq_client.query(query, job_config=job_config).result()

        embeddings: dict[int, list[float]] = {}
        for row in results:
            if row.embedding_vector:
                embeddings[int(row.p_article_id)] = list(row.embedding_vector)
        return embeddings

    def upsert_user_embeddings_bulk(
            self, rows: List[Tuple[int, List[float]]]) -> None:
        """Bulk upsert user embeddings with a single MERGE using inline arrays.

        Args:
            rows: List of tuples (user_id, embedding_vector).
        """
        if not rows:
            return

        user_ids = [r[0] for r in rows]
        embedding_jsons = [json.dumps(r[1]) for r in rows]

        query = f"""
        MERGE `{self._project}.{self._recommendation_dataset}.{self._user_embedding_table}` T
        USING (
          SELECT
            user_id,
            (SELECT ARRAY(
              SELECT CAST(x AS FLOAT64)
              FROM UNNEST(JSON_EXTRACT_ARRAY(embedding_json)) AS s
              CROSS JOIN UNNEST([CAST(s AS STRING)]) AS x
            )) AS embedding_vector
          FROM UNNEST(@user_ids) AS user_id
          WITH OFFSET o
          JOIN UNNEST(@embedding_jsons) AS embedding_json WITH OFFSET o2
          ON o = o2
        ) S
        ON T.user_id = S.user_id
        WHEN MATCHED THEN
          UPDATE SET embedding_vector = S.embedding_vector, updated_at = CURRENT_TIMESTAMP()
        WHEN NOT MATCHED THEN
          INSERT (user_id, embedding_vector) VALUES (S.user_id, S.embedding_vector)
        """

        job_config = bigquery.QueryJobConfig(query_parameters=[
            bigquery.ArrayQueryParameter("user_ids", "INT64", user_ids),
            bigquery.ArrayQueryParameter("embedding_jsons", "STRING",
                                         embedding_jsons),
        ])
        self._bq_client.query(query, job_config=job_config).result()

    def upsert_user_embeddings_batch(
            self, user_embeddings: Dict[int, List[float]]) -> None:
        """Upsert user embeddings in batches to reduce query count.

        Args:
            user_embeddings: Mapping user_id -> embedding vector.
        """
        if not user_embeddings:
            return
        items: List[Tuple[int, List[float]]] = list(user_embeddings.items())
        for batch in chunked(items, Config.BATCH_SIZE_BQ_UPSERT):
            self.upsert_user_embeddings_bulk(batch)


class UserEmbeddingGenerator:
    """Generate user embeddings using interactions and section preferences."""

    def __init__(self, db_client: DatabaseClient, bq_client: BigQueryClient):
        """Initialize the generator with DB and BQ clients."""
        self.db_client = db_client
        self.bq_client = bq_client

    def generate_all_user_embeddings(
            self,
            start_date: Optional[datetime.date] = None
    ) -> Dict[int, List[float]]:
        """Generate embeddings for all users.

        Strategy:
        - Users with interactions: weighted average of interacted article embeddings
          using action weights multiplied by user's section preference.
        - Users without interactions: section-preference-weighted average of section mean embeddings.
          Section means are approximated via small samples per section.

        Args:
            start_date: Interactions since this date (default: 30 days ago).

        Returns:
            Mapping user_id -> embedding vector.
        """
        logger.info("Starting all-user embedding generation...")

        # Step 0: Users
        all_user_ids = self.db_client.get_all_user_ids()
        logger.info("Total users: %d", len(all_user_ids))

        # Step 1: Interactions
        likes = self.db_client.get_recent_likes_by_user(start_date)
        scraps = self.db_client.get_recent_scraps_by_user(start_date)
        detail_views = self.db_client.get_recent_detail_view_by_user(
            start_date)

        interacted_user_ids = set(likes.keys()) | set(scraps.keys()) | set(
            detail_views.keys())
        logger.info("Users with interactions: %d", len(interacted_user_ids))

        # Collect interacted article IDs
        interacted_article_ids: set[int] = set()
        for lst in likes.values():
            interacted_article_ids.update(lst)
        for lst in scraps.values():
            interacted_article_ids.update(lst)
        for lst in detail_views.values():
            interacted_article_ids.update(lst)
        interacted_article_ids_list = list(interacted_article_ids)

        # Step 2: Fetch article embeddings and sections for interacted articles only
        article_embeddings_interacted = self.bq_client.get_p_article_embeddings_batch(
            interacted_article_ids_list)
        article_sections_interacted = self.db_client.get_article_sections_batch(
            interacted_article_ids_list)

        # Step 3: Fetch user section preferences for all users
        user_section_preferences = self.db_client.get_user_section_preferences_batch(
            all_user_ids)

        # Step 4: Interaction-based embeddings
        user_embeddings: Dict[int, List[float]] = {}
        for user_id in interacted_user_ids:
            emb = self._compute_user_embedding(
                likes.get(user_id, []),
                scraps.get(user_id, []),
                detail_views.get(user_id, []),
                article_embeddings_interacted,
                article_sections_interacted,
                user_section_preferences.get(user_id, {}),
            )
            if emb is not None:
                user_embeddings[user_id] = self._postprocess(emb)

        # Step 5: Section means via sampled articles (avoid full table scan)
        section_sample_articles = self.db_client.get_section_sample_articles(
            Config.SECTION_MEAN_SAMPLE_SIZE)
        sample_article_ids: List[int] = [
            aid for lst in section_sample_articles.values() for aid in lst
        ]
        sample_embeddings = self.bq_client.get_p_article_embeddings_batch(
            sample_article_ids)

        section_means = self._calculate_section_means_sampled(
            section_sample_articles, sample_embeddings)

        # Fallback global mean (from samples as well)
        global_mean_embedding: Optional[List[float]] = (self._mean_embedding(
            list(sample_embeddings.values())) if sample_embeddings else None)

        # Step 6: Cold-start users using section preferences
        for user_id in all_user_ids:
            if user_id in user_embeddings:
                continue
            prefs = user_section_preferences.get(user_id, {})
            cold_emb = self._section_preference_embedding(prefs, section_means)
            if cold_emb is None and global_mean_embedding is not None:
                cold_emb = list(global_mean_embedding)
            if cold_emb is not None:
                user_embeddings[user_id] = self._postprocess(cold_emb)

        logger.info(
            "Generated embeddings for %d users (including cold-start).",
            len(user_embeddings),
        )
        return user_embeddings

    def _compute_user_embedding(
        self,
        liked_articles: List[int],
        scraped_articles: List[int],
        viewed_articles: List[int],
        article_embeddings: Dict[int, List[float]],
        article_sections: Dict[int, int],
        user_section_preferences: Dict[int, float],
    ) -> Optional[List[float]]:
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
            self, user_section_preferences: Dict[int, float],
            section_means: Dict[int, List[float]]) -> Optional[List[float]]:
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

    def _calculate_section_means_sampled(
            self, section_sample_articles: Dict[int, List[int]],
            sample_embeddings: Dict[int,
                                    List[float]]) -> Dict[int, List[float]]:
        """Compute section mean embeddings from sampled articles per section.

        Args:
            section_sample_articles: Mapping section_id -> list of sampled article_ids.
            sample_embeddings: Mapping article_id -> embedding vector for those samples.

        Returns:
            Mapping section_id -> mean embedding vector.
        """
        section_means: Dict[int, List[float]] = {}
        for sid, article_ids in section_sample_articles.items():
            embs = [
                sample_embeddings[aid] for aid in article_ids
                if aid in sample_embeddings
            ]
            if embs:
                section_means[sid] = np.mean(np.array(embs), axis=0).tolist()
        return section_means

    def _mean_embedding(self, embeddings: List[List[float]]) -> List[float]:
        """Compute mean vector."""
        return np.mean(np.array(embeddings), axis=0).tolist()

    def _postprocess(self, embedding: List[float]) -> List[float]:
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

    Workflow:
    1) Validate config.
    2) Initialize DB/BQ clients.
    3) Generate embeddings for all users (interaction-based or cold-start).
    4) Upsert results to BigQuery in batches (single MERGE per batch).
    5) Return JSON status.

    Args:
        request: Flask Request object (unused).

    Returns:
        Tuple of (response JSON dict, HTTP status code).
    """
    try:
        Config.validate()
    except ValueError as e:
        logger.error("Configuration validation error: %s", e)
        return f"Configuration validation error: {e}", 500

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
        )

        # Generate embeddings for all users
        embedding_generator = UserEmbeddingGenerator(db_client, bq_client)
        user_embeddings = embedding_generator.generate_all_user_embeddings()

        # Upsert to BigQuery with fewer queries (batched MERGE)
        if user_embeddings:
            logger.info("Saving %d user embeddings to BigQuery...",
                        len(user_embeddings))
            bq_client.upsert_user_embeddings_batch(user_embeddings)

        return {
            "status":
            "success",
            "processed_users":
            len(user_embeddings),
            "message":
            f"Successfully generated and saved embeddings for {len(user_embeddings)} users",
        }, 200

    except Exception as e:
        logger.error("Error in user embedding generation: %s",
                     str(e),
                     exc_info=True)
        return {
            "status": "error",
            "message": f"Failed to generate user embeddings: {str(e)}",
        }, 500
