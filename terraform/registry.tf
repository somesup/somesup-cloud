resource "google_artifact_registry_repository" "server" {
  project       = var.project
  location      = var.region
  repository_id = "server"
  format        = "DOCKER"
  description   = "somes-up Server Repository"
}
