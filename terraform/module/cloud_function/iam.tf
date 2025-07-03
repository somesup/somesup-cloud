resource "google_service_account" "main" {
  project      = var.project_id
  account_id   = "${var.function_name}-sa"
  display_name = "${var.function_name} Service Account"
}

resource "google_project_iam_member" "log_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = google_service_account.main.member
}

resource "google_project_iam_member" "roles" {
  for_each = toset(var.roles)

  project = var.project_id
  role    = each.value
  member  = google_service_account.main.member
}
