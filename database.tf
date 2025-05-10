resource "google_sql_database_instance" "mysql" {
  project             = var.project
  region              = var.region
  name                = "${var.project}-mysql"
  database_version    = "MYSQL_8_0"
  deletion_protection = false

  settings {
    tier = "db-f1-micro"

    ip_configuration {
      ipv4_enabled = true
    }
  }
}

data "google_secret_manager_secret_version" "mysql_admin_username" {
  project = var.project
  secret  = "MYSQL_ADMIN_USERNAME"
  version = "latest"
}

data "google_secret_manager_secret_version" "mysql_admin_password" {
  project = var.project
  secret  = "MYSQL_ADMIN_PASSWORD"
  version = "latest"
}

resource "google_sql_user" "admin" {
  project  = var.project
  instance = google_sql_database_instance.mysql.name
  name     = data.google_secret_manager_secret_version.mysql_admin_username.secret_data
  password = data.google_secret_manager_secret_version.mysql_admin_password.secret_data
}
