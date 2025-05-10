resource "google_project_service" "secret_manager" {
  project = var.project
  service = "secretmanager.googleapis.com"
}

resource "google_project_service" "sql_admin" {
  project = var.project
  service = "sqladmin.googleapis.com"
}
