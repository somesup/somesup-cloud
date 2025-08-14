resource "google_sql_database_instance" "mysql" {
  project             = var.project
  region              = var.region
  name                = "${var.project}-mysql"
  database_version    = "MYSQL_8_0"
  deletion_protection = false

  settings {
    tier      = "db-f1-micro"
    disk_size = 10

    ip_configuration {
      ipv4_enabled = true
    }

    backup_configuration {
      enabled = false
    }
  }
}

resource "google_redis_instance" "redis" {
  project        = var.project
  name           = "${var.project}-redis"
  tier           = "BASIC"
  memory_size_gb = 2
  region         = var.region
  redis_version  = "REDIS_6_X"
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

data "google_secret_manager_secret_version" "mysql_fetcher_username" {
  project = var.project
  secret  = "MYSQL_FETCHER_USERNAME"
  version = "latest"
}

data "google_secret_manager_secret_version" "mysql_fetcher_password" {
  project = var.project
  secret  = "MYSQL_FETCHER_PASSWORD"
  version = "latest"
}

data "google_secret_manager_secret_version" "mysql_summarizer_username" {
  project = var.project
  secret  = "MYSQL_SUMMARIZER_USERNAME"
  version = "latest"
}

data "google_secret_manager_secret_version" "mysql_summarizer_password" {
  project = var.project
  secret  = "MYSQL_SUMMARIZER_PASSWORD"
  version = "latest"
}

data "google_secret_manager_secret_version" "mysql_embedding_calculator_username" {
  project = var.project
  secret  = "MYSQL_EMBEDDING_CALCULATOR_USERNAME"
  version = "latest"
}

data "google_secret_manager_secret_version" "mysql_embedding_calculator_password" {
  project = var.project
  secret  = "MYSQL_EMBEDDING_CALCULATOR_PASSWORD"
  version = "latest"
}

resource "google_sql_user" "admin" {
  project  = var.project
  instance = google_sql_database_instance.mysql.name
  name     = data.google_secret_manager_secret_version.mysql_admin_username.secret_data
  password = data.google_secret_manager_secret_version.mysql_admin_password.secret_data
}

resource "google_sql_user" "fetcher" {
  project  = var.project
  instance = google_sql_database_instance.mysql.name
  name     = data.google_secret_manager_secret_version.mysql_fetcher_username.secret_data
  password = data.google_secret_manager_secret_version.mysql_fetcher_password.secret_data
}

resource "google_sql_user" "summarizer" {
  project  = var.project
  instance = google_sql_database_instance.mysql.name
  name     = data.google_secret_manager_secret_version.mysql_summarizer_username.secret_data
  password = data.google_secret_manager_secret_version.mysql_summarizer_password.secret_data
}

resource "google_sql_user" "embedding_calculator" {
  project  = var.project
  instance = google_sql_database_instance.mysql.name
  name     = data.google_secret_manager_secret_version.mysql_embedding_calculator_username.secret_data
  password = data.google_secret_manager_secret_version.mysql_embedding_calculator_password.secret_data
}

# NOTE: There are SQL codes that configures schema in src/sql.
# I didn't implement it yet since we don't expect much schema changes,
# But if so, consider to implement auto apply of those SQL codes.
# Maybe using local-exec provisioner.
