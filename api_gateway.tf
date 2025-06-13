resource "google_service_account" "api_gateway_sa" {
  project      = var.project
  account_id   = var.project
  display_name = "${var.project} API Gateway Service Account"
}

resource "google_project_iam_member" "invoker" {
  project = var.project
  role    = "roles/run.invoker"
  member  = google_service_account.api_gateway_sa.member
}

resource "google_api_gateway_api" "api_gateway" {
  provider = google-beta
  project  = var.project
  api_id   = "${var.project}-api-gateway"
}

resource "google_api_gateway_api_config" "api_gateway_config" {
  provider      = google-beta
  project       = var.project
  api           = google_api_gateway_api.api_gateway.api_id
  api_config_id = "${var.project}-api-gateway-config"
  gateway_config {
    backend_config {
      google_service_account = google_service_account.api_gateway_sa.email
    }
  }
  openapi_documents {
    document {
      path = "openapi.yaml"
      contents = base64encode(templatefile("${path.module}/src/api_gateway/openapi.yaml.tmpl", {
        title = "${var.project}-api-gateway",
      }))
    }
  }
}

resource "google_api_gateway_gateway" "api_gateway" {
  provider   = google-beta
  project    = var.project
  region     = "asia-northeast1" # asia-northeast3 is not supported by API Gateway
  gateway_id = "${var.project}-api-gateway"
  api_config = google_api_gateway_api_config.api_gateway_config.id

  lifecycle {
    replace_triggered_by = [google_api_gateway_api_config.api_gateway_config]
  }
}
