resource "google_service_account" "scheduler" {
  project     = var.project
  account_id  = "scheduler-sa"
  description = "Service Account for Scheduler"
}

resource "google_project_iam_member" "workflow_invoker" {
  project = var.project
  role    = "roles/workflows.invoker"
  member  = google_service_account.scheduler.member
}

resource "google_project_iam_member" "cloud_function_invoker" {
  project = var.project
  role    = "roles/run.invoker"
  member  = google_service_account.scheduler.member
}

resource "google_cloud_scheduler_job" "daily_article_processing" {
  project     = var.project
  region      = var.region
  name        = "daily-article-processing-trigger"
  description = "Trigger article-processing-workflow daily at midnight KST"

  schedule  = "0 0 * * *"
  time_zone = "Asia/Seoul"

  http_target {
    uri         = "https://${var.region}-workflowexecutions.googleapis.com/v1/projects/${var.project}/locations/${var.region}/workflows/${google_workflows_workflow.article_processing.name}:execute"
    http_method = "POST"

    oidc_token {
      service_account_email = google_service_account.scheduler.email
    }
  }
}

resource "google_cloud_scheduler_job" "calculate_user_embeddings" {
  project     = var.project
  region      = var.region
  name        = "calculate-user-embeddings-trigger"
  description = "Trigger calculate-user-embeddings every 12:00, 00:00 KST"

  schedule  = "0 0,12 * * *"
  time_zone = "Asia/Seoul"

  http_target {
    http_method = "POST"
    uri         = module.calculate_user_embeddings.function_url

    oidc_token {
      service_account_email = google_service_account.scheduler.email
    }
  }
}
