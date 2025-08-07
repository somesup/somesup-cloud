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

resource "google_bigquery_table" "user_p_article_scores" {
  project             = var.project
  dataset_id          = google_bigquery_dataset.recommendation.dataset_id
  table_id            = "user_p_article_scores"
  schema              = file("${path.module}/src/schema/user_embeddings.json")
  deletion_protection = false

  time_partitioning {
    type  = "DAY"
    field = "updated_at"
  }
}
