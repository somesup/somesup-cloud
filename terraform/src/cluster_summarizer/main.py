import contextlib
import dataclasses
import datetime
import io
import logging
import os
import urllib.request
from typing import Any, Iterator, Optional

import functions_framework
import google.cloud.logging
import google.cloud.sql.connector
import google.genai
import google.genai.types
import pymysql
import pymysql.cursors
from google.cloud import bigquery
from PIL import Image

# Configure logging to Google Cloud Logging
logging_client = google.cloud.logging.Client()
logging_client.setup_logging()
logger = logging.getLogger(__name__)

SECTIONS = {
    1: "politics",
    2: "economy",
    3: "society",
    4: "culture",
    5: "tech",
    6: "world",
}


class Config:
    """Configuration class for environment variables and settings."""

    PROJECT_ID = os.getenv("PROJECT_ID", "")
    VERTEX_AI_REGION = os.getenv("VERTEX_AI_REGION", "us-west1")
    INSTANCE_CONNECTION_NAME = os.getenv("INSTANCE_CONNECTION_NAME", "")
    MYSQL_USERNAME = os.getenv('MYSQL_SUMMARIZER_USERNAME', '')
    MYSQL_PASSWORD = os.getenv('MYSQL_SUMMARIZER_PASSWORD', '')
    MYSQL_DATABASE = 'somesup'
    BQ_EMBEDDING_DATASET = os.getenv("BQ_EMBEDDING_DATASET", "")
    BQ_EMBEDDING_TABLE = os.getenv("BQ_EMBEDDING_TABLE", "")

    @classmethod
    def validate(cls) -> None:
        """Validate that all required configuration values are set."""
        required_configs = [
            (cls.PROJECT_ID, "PROJECT_ID"),
            (cls.INSTANCE_CONNECTION_NAME, "INSTANCE_CONNECTION_NAME"),
            (cls.MYSQL_USERNAME, "MYSQL_USERNAME"),
            (cls.MYSQL_PASSWORD, "MYSQL_PASSWORD"),
            (cls.BQ_EMBEDDING_DATASET, "BQ_EMBEDDING_DATASET"),
            (cls.BQ_EMBEDDING_TABLE, "BQ_EMBEDDING_TABLE"),
        ]

        for value, name in required_configs:
            if not value:
                raise ValueError("%s is not set" % name)


@dataclasses.dataclass
class SimpleArticle:
    """Represents a simple article with basic information."""

    id: int
    title: str
    content: str
    thumbnail_url: str

    @classmethod
    def from_dict(cls, response: dict[str, Any]) -> 'SimpleArticle':
        """Create a SimpleArticle instance from a database row."""
        return cls(id=response['id'],
                   title=response['title'],
                   content=response['content'],
                   thumbnail_url=response['thumbnail_url'])


@dataclasses.dataclass
class ProcessedArticle:
    """Represents a processed article with summaries and metadata."""

    title: str
    one_line_summary: str
    full_summary: str
    language: str
    section_id: int
    thumbnail_url: str
    region: Optional[str] = None

    @classmethod
    def from_dict(cls, response: dict[Any, Any]) -> 'ProcessedArticle':
        """Create a ProcessedArticle instance from a database row."""
        return cls(title=response['title'],
                   one_line_summary=response['one_line_summary'],
                   full_summary=response['full_summary'],
                   language=response['language'],
                   section_id=response['section_id'],
                   region=response.get('region'),
                   thumbnail_url=response['thumbnail_url'])


@dataclasses.dataclass
class AiResponse:
    """Represents the AI model's response."""

    title: str
    one_line_summary: str
    full_summary: str
    section_id: int

    @classmethod
    def from_dict(cls, response: Any) -> 'AiResponse':
        """Create an AiResponse instance from AI model response."""
        return cls(
            title=response['title'],
            one_line_summary=response['one_line_summary'],
            full_summary=response['full_summary'],
            section_id=response['section_id'],
        )


class ImageClient:

    def __init__(self):
        pass

    def _get_image_size(self, url):
        try:
            response = urllib.request.urlopen(url)
            img = Image.open(io.BytesIO(response.read()))
            width, height = img.size
            return (width, height)
        except Exception as e:
            print(f"Error loading {url}: {e}")
            return (0, 0)

    def get_highest_resolution_image(
        self,
        image_urls: list[str],
    ) -> Optional[str]:
        if not image_urls:
            raise ValueError("Image URLs list cannot be empty")

        max_resolution = 0
        best_url = None
        for url in image_urls:
            width, height = self._get_image_size(url)
            resolution = width * height
            if resolution > max_resolution:
                max_resolution = resolution
                best_url = url

        return best_url


class DatabaseClient:
    """Client for managing database operations."""

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
        self._connector = google.cloud.sql.connector.Connector()

    @contextlib.contextmanager
    def _get_connection(self) -> Iterator[pymysql.connections.Connection]:
        """Get a connection to the MySQL database with automatic cleanup."""
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
            logger.error("Error connecting to the database: %s", e)
            raise
        finally:
            if connection:
                connection.close()

    def get_articles(self, article_ids: list[int]) -> list[SimpleArticle]:
        """Fetch articles from the database by their IDs."""
        if not article_ids:
            logger.warning("No article IDs provided")
            return []

        try:
            with self._get_connection() as connection:
                with connection.cursor(pymysql.cursors.DictCursor) as cursor:
                    placeholders = ', '.join(['%s'] * len(article_ids))
                    query = f"""
                        SELECT id, title, content, thumbnail_url
                        FROM article
                        WHERE id IN ({placeholders})
                    """
                    cursor.execute(query, article_ids)
                    rows = cursor.fetchall()
                    articles = [SimpleArticle.from_dict(row) for row in rows]

                    logger.info("Retrieved %d articles from database",
                                len(articles))
                    return articles

        except Exception as e:
            logger.error("Error fetching articles: %s", e)
            raise

    def save_processed_article_with_references(
            self, article: ProcessedArticle,
            articles: list[SimpleArticle]) -> int:
        """Save a processed article and update article references in a single transaction."""
        if not articles:
            raise ValueError("Articles list cannot be empty")

        try:
            with self._get_connection() as connection:
                with connection.cursor() as cursor:

                    # Insert processed article
                    insert_sql = """
                        INSERT INTO processed_article (title, one_line_summary, full_summary, language, region, section_id, thumbnail_url)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """
                    cursor.execute(insert_sql, (
                        article.title,
                        article.one_line_summary,
                        article.full_summary,
                        article.language,
                        article.region,
                        article.section_id,
                        articles[0].thumbnail_url,
                    ))

                    new_processed_id = cursor.lastrowid
                    logger.info("Processed article saved with ID: %s",
                                new_processed_id)

                    # Update article references
                    placeholders = ', '.join(['%s'] * len(articles))
                    update_sql = f"""
                        UPDATE article
                        SET processed_id = %s,
                            is_processed = TRUE
                        WHERE id IN ({placeholders})
                    """
                    cursor.execute(
                        update_sql,
                        [new_processed_id] +
                        [article.id for article in articles],
                    )

                    updated_count = cursor.rowcount
                    logger.info("Updated %d article references", updated_count)

                    # Both operations succeed - commit the transaction
                    connection.commit()
                    logger.info(
                        "Transaction completed successfully for processed_id: %s",
                        new_processed_id)

                    return new_processed_id

        except Exception as e:
            logger.error(
                "Error in transaction (processed article + references update): %s",
                e)
            # Connection will be automatically rolled back when context exits
            raise

    def update_article_references(self, articles: list[SimpleArticle],
                                  processed_id: int) -> None:
        """Update article references to point to the processed article."""
        if not articles:
            logger.warning("No articles to update")
            return

        try:
            with self._get_connection() as connection:
                with connection.cursor() as cursor:
                    placeholders = ', '.join(['%s'] * len(articles))
                    update_sql = f"""
                        UPDATE article
                        SET processed_id = %s
                        WHERE id IN ({placeholders})
                    """
                    cursor.execute(
                        update_sql,
                        [processed_id] + [article.id for article in articles],
                    )

                    updated_count = cursor.rowcount
                    logger.info("Updated %d article references", updated_count)

                connection.commit()

        except Exception as e:
            logger.error("Error updating article references: %s", e)
            raise


class VertexAiClient:
    """Client for interacting with Vertex AI for content generation."""

    # Constants for better maintainability
    MODEL_NAME = "google/gemini-2.5-pro"

    def __init__(self, project: str, location: str):
        self._project = project
        self._location = location
        self._client = google.genai.Client(
            project=self._project,
            location=self._location,
            vertexai=True,
        )

    def _build_prompt(self, titles: list[str], contents: list[str]) -> str:
        """Build the prompt for AI content generation."""
        articles_text = ""
        for i, (title, content) in enumerate(zip(titles, contents), 1):
            articles_text += f"\n\n=== 기사 {i} ===\n제목: {title}\n내용: {content}"

        return f"""
            다음 뉴스 기사들을 분석하여 한국어로 통합 요약해주세요.

            분석 지침:
            - 여러 기사의 핵심 정보를 종합하고 서로 다른 관점을 균형있게 반영
            - 중복 내용은 통합하되 각 기사의 고유한 세부사항은 포함
            - 편향되지 않게 모든 시각을 공정하게 제시

            전체 요약 작성 지침:
            - 뉴스 스타일의 문단 구성으로 작성, 각 문단은 헤더를 가져야 하고, `이모티콘 + 제목` 형식
            - 개요 문단으로 시작하고, 각 기사의 핵심 주제를 자세하게 설명
            - 마크다운 기호를 그대로 포함하여 바로 사용 가능하게 작성 (예: # 이모티콘 제목, ## 소제목, - 목록 등)
            - 가독성을 위해 너무 많은 Bullet Point는 자제

            기사 내용:
            {articles_text}

            다음 JSON 형식으로 응답해주세요:
            {{
              "title": "핵심 주제 제목 (40자 이내)",
              "oneLineSummary": "핵심 내용 한 문장 요약 (60자 이내)",
              "full_summary": "마크다운 형식 상세 내용 (1000자 이내)",
              "section": "1: politics, 2: economy, 3: society, 4: culture, 5:tech, 6: world 중 선택하여 integer 반환"
            }}
        """

    def _get_response_schema(self) -> dict:
        """Get the JSON schema for AI response validation."""
        return {
            "type":
            "object",
            "properties": {
                "title": {
                    "type": "string"
                },
                "one_line_summary": {
                    "type": "string"
                },
                "full_summary": {
                    "type": "string"
                },
                "section_id": {
                    "type": "integer",
                }
            },
            "required":
            ["title", "one_line_summary", "full_summary", "section_id"],
        }

    def generate_summary(
        self,
        titles: list[str],
        contents: list[str],
    ) -> AiResponse:
        """Generate a summary using AI based on article titles and contents."""
        if not titles or not contents or len(titles) != len(contents):
            raise ValueError(
                "Titles and contents must be non-empty and have the same length"
            )

        try:
            content = self._build_prompt(titles, contents)
            response_schema = self._get_response_schema()

            logger.info("Generating summary for %d articles", len(titles))

            response = self._client.models.generate_content(
                model=self.MODEL_NAME,
                contents=content,
                config={
                    "response_mime_type": "application/json",
                    "response_schema": response_schema,
                })

            print("Response:", response.parsed)

            ai_response = AiResponse.from_dict(response.parsed)
            logger.info("Successfully generated summary: '%s'",
                        ai_response.title)

            return ai_response

        except Exception as e:
            logger.error("Error generating AI summary: %s", e)
            raise

    def get_embeddings(
        self,
        article: ProcessedArticle,
    ) -> list[google.genai.types.ContentEmbedding] | None:
        result = self._client.models.embed_content(
            contents=f"{article.title}\n\n{article.full_summary}",
            model="text-embedding-004",
            config=google.genai.types.EmbedContentConfig(
                output_dimensionality=768),
        )

        return result.embeddings


class BigQueryClient:

    def __init__(
        self,
        project: str,
        bq_dataset: str,
        bq_table: str,
    ):
        self._project = project
        self._bq_dataset = bq_dataset
        self._bq_table = bq_table

        self._bq_client = bigquery.Client(project=self._project)

    def upload_embedding_to_bq(
        self,
        processed_id: int,
        section_id: int,
        embedding: list[google.genai.types.ContentEmbedding] | None,
    ) -> None:
        """Upload the embedding vector to BigQuery.

        Args:
            processed_id: The ID of the processed article.
            section_id: The section ID of the processed article.
            embedding: The embedding vector to upload.
        """
        if embedding is None or len(embedding) == 0:
            logging.warning(
                "Embedding Vector is None. Skipping upload to BigQuery.")
            return

        table_id = f"{self._project}.{self._bq_dataset}.{self._bq_table}"
        now = datetime.datetime.now(tz=datetime.timezone.utc)

        rows_to_insert = [{
            "p_article_id": processed_id,
            "section_id": section_id,
            "embedding_vector": embedding[0].values,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
        }]

        errors = self._bq_client.insert_rows_json(
            table_id,
            rows_to_insert,
        )

        if errors:
            logger.error("Error inserting embeddings into BigQuery: %s",
                         errors)
            raise RuntimeError(f"BigQuery insert errors: {errors}")
        else:
            logger.info(
                "Inserted embedding vector for processed article id %d into BigQuery",
                processed_id)


class ArticleSummarizer:
    """Main service class that orchestrates the article summarization process."""

    def __init__(self, config: Config):
        self.db_client = DatabaseClient(
            instance_name=config.INSTANCE_CONNECTION_NAME,
            username=config.MYSQL_USERNAME,
            password=config.MYSQL_PASSWORD,
            database=config.MYSQL_DATABASE,
        )

        self.ai_client = VertexAiClient(
            project=config.PROJECT_ID,
            location=config.VERTEX_AI_REGION,
        )

        self._image_client = ImageClient()

        self._bq_client = BigQueryClient(
            project=config.PROJECT_ID,
            bq_dataset=config.BQ_EMBEDDING_DATASET,
            bq_table=config.BQ_EMBEDDING_TABLE,
        )

    def process_articles(
            self, article_ids: list[int]) -> tuple[ProcessedArticle, int]:
        """Process articles by generating summaries and saving to database."""
        if not article_ids:
            raise ValueError("Article IDs cannot be empty")

        logger.info("Processing %d articles: %s", len(article_ids),
                    article_ids)

        # Fetch articles from database
        articles = self.db_client.get_articles(article_ids)
        if not articles:
            raise ValueError("No articles found for the provided IDs")

        # Generate AI summary
        titles = [article.title for article in articles]
        contents = [article.content for article in articles]
        ai_response = self.ai_client.generate_summary(titles, contents)

        # Determine the best thumbnail URL by resolution
        best_thumbnail_url = self._image_client.get_highest_resolution_image(
            [article.thumbnail_url for article in articles])

        # Create processed article
        processed_article = ProcessedArticle(
            title=ai_response.title,
            one_line_summary=ai_response.one_line_summary,
            full_summary=ai_response.full_summary,
            language="ko",  # TODO: Determine language dynamically if needed
            section_id=ai_response.section_id,
            thumbnail_url=best_thumbnail_url or articles[0].thumbnail_url,
            region=None,  # TODO: Find a good way to determine region
        )

        # Save to database in a single transaction
        processed_id = self.db_client.save_processed_article_with_references(
            processed_article, articles)

        # Generate and upload embeddings to BigQuery
        embeddings = self.ai_client.get_embeddings(processed_article)

        self._bq_client.upload_embedding_to_bq(
            processed_id,
            processed_article.section_id,
            embeddings,
        )

        return processed_article, processed_id


@functions_framework.http
def main(request):
    try:
        # Validate configuration
        Config.validate()

    except ValueError as e:
        logger.error("Configuration validation error: %s", e)
        return "Configuration validation error: %s" % e, 500

    try:
        # Parse request
        request_json = request.get_json(silent=True)
        if not request_json:
            logger.error("Invalid JSON request")
            return "Invalid JSON request", 400

        article_ids = request_json.get("article_ids")
        if not article_ids or not isinstance(article_ids, list):
            logger.error("Missing or invalid article_ids in request")
            return "Missing or invalid article_ids", 400

        # Process articles
        summarizer = ArticleSummarizer(Config())
        processed_article, processed_id = summarizer.process_articles(
            article_ids)

        return f'Processed Article Successfully with title: {processed_article.title}, ID: {processed_id}', 200
    except Exception as e:
        logger.error("Unexpected error: %s", e)
        return f"Internal server error: {e}", 500
