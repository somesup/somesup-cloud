data "google_secret_manager_secret_version" "mysql_summarizer_username" {
  project = var.project
  secret  = "MYSQL_SUMMARIZER_USERNAME"
}

data "google_secret_manager_secret_version" "mysql_summarizer_password" {
  project = var.project
  secret  = "MYSQL_SUMMARIZER_PASSWORD"
}

module "cluster_summarizer" {
  source = "./module/cloud_function"

  project_id          = var.project
  location            = var.region
  function_name       = "cluster-summarizer"
  source_dir          = "${path.module}/src/cluster_summarizer"
  source_bucket_name  = google_storage_bucket.cloud_function.name
  runtime             = "python313"
  available_memory_mb = "256Mi"
  entry_point         = "main"
  max_instance_count  = 20
  environment_variables = {
    PROJECT_ID                = var.project
    VERTEX_AI_REGION          = "us-central1" # Gemini 2.5 is only available in us-central1
    INSTANCE_CONNECTION_NAME  = google_sql_database_instance.mysql.connection_name
    MYSQL_SUMMARIZER_USERNAME = data.google_secret_manager_secret_version.mysql_summarizer_username.secret_data
    MYSQL_SUMMARIZER_PASSWORD = data.google_secret_manager_secret_version.mysql_summarizer_password.secret_data
  }
  roles = [
    "roles/cloudsql.client",
    "roles/cloudsql.instanceUser",
    "roles/aiplatform.user",
    "roles/aiplatform.endpointUser",
  ]
}
