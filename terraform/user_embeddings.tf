module "calculate_user_embeddings" {
  source = "./module/cloud_function"

  project_id          = var.project
  location            = var.region
  function_name       = "calculate-user-embeddings"
  source_dir          = "${path.module}/src/calculate_user_embeddings"
  source_bucket_name  = google_storage_bucket.cloud_function.name
  runtime             = "python313"
  available_memory_mb = "1Gi"
  entry_point         = "main"

  environment_variables = {
    PROJECT_ID               = var.project
    INSTANCE_CONNECTION_NAME = google_sql_database_instance.mysql.connection_name
    MYSQL_USERNAME           = data.google_secret_manager_secret_version.mysql_embedding_calculator_username.secret_data
    MYSQL_PASSWORD           = data.google_secret_manager_secret_version.mysql_embedding_calculator_password.secret_data

    RECOMMENDATION_DATASET    = google_bigquery_dataset.recommendation.dataset_id
    P_ARTICLE_EMBEDDING_TABLE = google_bigquery_table.p_article_embeddings.table_id
    USER_EMBEDDING_TABLE      = google_bigquery_table.user_embeddings.table_id
  }

  roles = [
    "roles/cloudsql.client",
    "roles/cloudsql.instanceUser",
    "roles/bigquery.dataEditor",
    "roles/bigquery.jobUser",
  ]
}
