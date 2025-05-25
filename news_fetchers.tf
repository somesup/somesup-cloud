data "google_secret_manager_secret_version" "guardian_api" {
  project = var.project
  secret  = "GUARDIAN_API_KEY"
}

data "google_secret_manager_secret_version" "mysql_fetcher_username" {
  project = var.project
  secret  = "MYSQL_FETCHER_USERNAME"
}

data "google_secret_manager_secret_version" "mysql_fetcher_password" {
  project = var.project
  secret  = "MYSQL_FETCHER_PASSWORD"
}

module "guardian_fetcher" {
  source = "./module/cloud_function"

  project_id          = var.project
  location            = var.region
  function_name       = "guardian-fetcher"
  source_dir          = "${path.module}/src/guardian_fetcher"
  source_bucket_name  = google_storage_bucket.cloud_function.name
  runtime             = "python313"
  available_memory_mb = "256Mi"
  entry_point         = "main"
  environment_variables = {
    "GUARDIAN_API_KEY"         = data.google_secret_manager_secret_version.guardian_api.secret_data
    "INSTANCE_CONNECTION_NAME" = google_sql_database_instance.mysql.connection_name
    "MYSQL_FETCHER_USERNAME"   = data.google_secret_manager_secret_version.mysql_fetcher_username.secret_data
    "MYSQL_FETCHER_PASSWORD"   = data.google_secret_manager_secret_version.mysql_fetcher_password.secret_data
  }
  roles = [
    "roles/cloudsql.client",
    "roles/cloudsql.instanceUser",
  ]
}

data "google_secret_manager_secret_version" "newsapi_api" {
  project = var.project
  secret  = "NEWSAPI_API_KEY"
}

module "newsapi_fetcher" {
  source = "./module/cloud_function"

  project_id          = var.project
  location            = var.region
  function_name       = "newsapi-fetcher"
  source_dir          = "${path.module}/src/newsapi_fetcher"
  source_bucket_name  = google_storage_bucket.cloud_function.name
  runtime             = "python313"
  available_memory_mb = "256Mi"
  entry_point         = "main"
  environment_variables = {
    "NEWSAPI_API_KEY"          = data.google_secret_manager_secret_version.newsapi_api.secret_data
    "INSTANCE_CONNECTION_NAME" = google_sql_database_instance.mysql.connection_name
    "MYSQL_FETCHER_USERNAME"   = data.google_secret_manager_secret_version.mysql_fetcher_username.secret_data
    "MYSQL_FETCHER_PASSWORD"   = data.google_secret_manager_secret_version.mysql_fetcher_password.secret_data
  }
  roles = [
    "roles/cloudsql.client",
    "roles/cloudsql.instanceUser",
  ]

}
