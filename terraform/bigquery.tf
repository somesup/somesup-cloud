locals {
  section_avg_embeddings_limit = 20
}

resource "google_bigquery_dataset" "recommendation" {
  project     = var.project
  dataset_id  = "recommendation"
  location    = var.region
  description = "Dataset for article recommendations"
}

resource "google_bigquery_table" "p_article_embeddings" {
  project             = var.project
  dataset_id          = google_bigquery_dataset.recommendation.dataset_id
  table_id            = "p_article_embeddings"
  schema              = file("${path.module}/src/schema/p_article_embeddings.json")
  deletion_protection = false

  time_partitioning {
    type  = "DAY"
    field = "created_at"
  }

}

resource "google_bigquery_table" "user_embeddings" {
  project             = var.project
  dataset_id          = google_bigquery_dataset.recommendation.dataset_id
  table_id            = "user_embeddings"
  schema              = file("${path.module}/src/schema/user_embeddings.json")
  deletion_protection = false

  time_partitioning {
    type  = "DAY"
    field = "updated_at"
  }
}

resource "google_bigquery_table" "section_avg_embeddings" {
  project             = var.project
  dataset_id          = google_bigquery_dataset.recommendation.dataset_id
  table_id            = "section_avg_embeddings"
  deletion_protection = false
}

resource "google_service_account" "bq_data_transfer_service_account" {
  account_id   = "bq-data-transfer-sa"
  display_name = "BigQuery Data Transfer Service Account"
  project      = var.project
}

resource "google_project_iam_member" "bq_data_transfer_service_account_role" {
  project = var.project
  role    = "roles/bigquery.dataEditor"
  member  = google_service_account.bq_data_transfer_service_account.member
}

resource "google_project_iam_member" "bq_data_transfer_service_account_bigquery_user" {
  project = var.project
  role    = "roles/bigquery.user"
  member  = google_service_account.bq_data_transfer_service_account.member
}

resource "google_bigquery_data_transfer_config" "section_avg_embeddings_update" {
  project              = var.project
  location             = var.region
  display_name         = "Update Section Avg Embeddings"
  data_source_id       = "scheduled_query"
  service_account_name = google_service_account.bq_data_transfer_service_account.email

  schedule = "every 24 hours"

  destination_dataset_id = google_bigquery_dataset.recommendation.dataset_id
  params = {
    destination_table_name_template = google_bigquery_table.section_avg_embeddings.table_id
    write_disposition               = "WRITE_TRUNCATE"

    query = <<-SQL
    WITH exploded AS (
      SELECT
        section_id,
        OFFSET AS dim_idx,
        dim_val
      FROM (
        SELECT
          section_id,
          embedding_vector
        FROM `${google_bigquery_dataset.recommendation.dataset_id}.${google_bigquery_table.p_article_embeddings.table_id}`
        QUALIFY ROW_NUMBER() OVER (
          PARTITION BY section_id
          ORDER BY updated_at DESC
        ) <= ${local.section_avg_embeddings_limit}
      ), UNNEST(embedding_vector) AS dim_val WITH OFFSET
    )
    SELECT
      section_id,
      ARRAY_AGG(avg_dim ORDER BY dim_idx) AS avg_embedding_vector,
      CURRENT_TIMESTAMP() AS updated_at
    FROM (
      SELECT
        section_id,
        dim_idx,
        AVG(dim_val) AS avg_dim
      FROM exploded
      GROUP BY section_id, dim_idx
    )
    GROUP BY section_id;
    SQL
  }
}
