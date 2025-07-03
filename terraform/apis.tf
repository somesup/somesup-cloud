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

resource "google_project_service" "workflows" {
  project = var.project
  service = "workflows.googleapis.com"
}

resource "google_project_service" "cloud_tasks" {
  project = var.project
  service = "cloudtasks.googleapis.com"
}

resource "google_project_service" "api_gateway" {
  project = var.project
  service = "apigateway.googleapis.com"
}

resource "google_project_service" "service_control" {
  project = var.project
  service = "servicecontrol.googleapis.com"
}
