resource "google_storage_bucket" "tf_state" {
  project  = var.project
  name     = "${var.project}-tfstate"
  location = var.region

  force_destroy               = false
  public_access_prevention    = "enforced"
  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }
}
