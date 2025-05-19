resource "google_project_service" "secret_manager" {
  project = var.project
  service = "secretmanager.googleapis.com"
}

resource "google_project_service" "sql_admin" {
  project = var.project
  service = "sqladmin.googleapis.com"
}

resource "google_project_service" "run" {
  project = var.project
  service = "run.googleapis.com"
}

resource "google_project_service" "cloud_functions" {
  project = var.project
  service = "cloudfunctions.googleapis.com"
}

resource "google_project_service" "cloud_build" {
  project = var.project
  service = "cloudbuild.googleapis.com"
}

resource "google_project_service" "vertex_ai" {
  project = var.project
  service = "aiplatform.googleapis.com"
}
