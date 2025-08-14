data "google_secret_manager_secret_version" "coolsms_api_key" {
  project = var.project
  secret  = "COOLSMS_API_KEY"
  version = "latest"
}

data "google_secret_manager_secret_version" "coolsms_api_secret" {
  project = var.project
  secret  = "COOLSMS_API_SECRET"
  version = "latest"
}

data "google_secret_manager_secret_version" "coolsms_from_phone_number" {
  project = var.project
  secret  = "COOLSMS_FROM_PHONE_NUMBER"
  version = "latest"
}

data "google_secret_manager_secret_version" "jwt_secret" {
  project = var.project
  secret  = "JWT_SECRET"
  version = "latest"
}

data "google_secret_manager_secret_version" "jwt_refresh_secret" {
  project = var.project
  secret  = "JWT_REFRESH_SECRET"
  version = "latest"
}

resource "google_service_account" "server" {
  project      = var.project
  account_id   = "server-sa"
  display_name = "Service account for server"
}

resource "google_cloud_run_v2_service" "server" {
  project  = var.project
  name     = "somesup-server"
  location = var.region

  deletion_protection = false

  template {
    service_account = google_service_account.server.email
    vpc_access {
      network_interfaces {
        network    = "default"
        subnetwork = "default"
      }
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project}/server/server:latest"

      ports {
        name           = "http1"
        container_port = 8000
      }

      env {
        name  = "DATABASE_URL"
        value = "mysql://${google_sql_user.server.name}:${google_sql_user.server.password}@localhost/somesup?socket=/cloudsql/${google_sql_database_instance.mysql.connection_name}"
      }
      env {
        name  = "COOLSMS_API_KEY"
        value = data.google_secret_manager_secret_version.coolsms_api_key.secret_data
      }
      env {
        name  = "COOLSMS_API_SECRET"
        value = data.google_secret_manager_secret_version.coolsms_api_secret.secret_data
      }
      env {
        name  = "COOLSMS_FROM_PHONE_NUMBER"
        value = data.google_secret_manager_secret_version.coolsms_from_phone_number.secret_data
      }
      env {
        name  = "REDIS_URL"
        value = "redis://${google_redis_instance.redis.host}:${google_redis_instance.redis.port}"
      }
      env {
        name  = "JWT_SECRET"
        value = data.google_secret_manager_secret_version.jwt_secret.secret_data
      }
      env {
        name  = "JWT_REFRESH_TOKEN"
        value = data.google_secret_manager_secret_version.jwt_refresh_secret.secret_data
      }
      env {
        name  = "JWT_EXPIRES_IN"
        value = "1h"
      }
      env {
        name  = "JWT_REFRESH_EXPIRES_IN"
        value = "30d"
      }
      env {
        name  = "RECALCULATE_USER_EMBEDDING_URL"
        value = module.recalculate_user_embeddings.function_url
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
    }

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.mysql.connection_name]
      }
    }
  }

}

resource "google_cloud_run_service_iam_member" "invoker" {
  project  = google_cloud_run_v2_service.server.project
  service  = google_cloud_run_v2_service.server.name
  location = google_cloud_run_v2_service.server.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_project_iam_member" "server_sql_user" {
  project = var.project
  role    = "roles/cloudsql.client"
  member  = google_service_account.server.member
}

resource "google_project_iam_member" "server_bigquery_user" {
  project = var.project
  role    = "roles/bigquery.jobUser"
  member  = google_service_account.server.member
}

resource "google_project_iam_member" "server_bigquery_editor" {
  project = var.project
  role    = "roles/bigquery.dataEditor"
  member  = google_service_account.server.member
}
