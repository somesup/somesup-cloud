resource "google_storage_bucket" "cloud_function" {
  project                     = var.project
  location                    = var.region
  name                        = "${var.project}-cloud-function-source"
  uniform_bucket_level_access = true
}
