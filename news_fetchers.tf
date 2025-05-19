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

data "archive_file" "guardian_fetcher" {
  type        = "zip"
  source_dir  = "${path.module}/src/guardian_fetcher"
  output_path = "/tmp/guardian_fetcher.zip"
}

resource "google_storage_bucket_object" "guardian_fetcher" {
  name   = "guardian_fetcher.zip"
  bucket = google_storage_bucket.cloud_function.name
  source = data.archive_file.guardian_fetcher.output_path
}

module "guardian_fetcher" {
  source = "./module/cloud_function"

  project_id            = var.project
  location              = var.region
  function_name         = "guardian-fetcher"
  source_archive_bucket = google_storage_bucket.cloud_function.name
  source_archive_object = google_storage_bucket_object.guardian_fetcher.name
  source_archive_hash   = google_storage_bucket_object.guardian_fetcher.md5hash
  runtime               = "python313"
  available_memory_mb   = "256Mi"
  entry_point           = "main"
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
