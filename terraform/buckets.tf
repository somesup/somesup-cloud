resource "google_storage_bucket" "cloud_function" {
  project                     = var.project
  location                    = var.region
  name                        = "${var.project}-cloud-function-source"
  uniform_bucket_level_access = true
}

resource "google_storage_bucket" "provider_logo" {
  project                     = var.project
  location                    = var.region
  name                        = "${var.project}-provider-logo"
  uniform_bucket_level_access = true
}

resource "google_storage_bucket_iam_member" "public_read" {
  bucket = google_storage_bucket.provider_logo.name
  role   = "roles/storage.objectViewer"
  member = "allUsers" # 공개 접근 허용
}

resource "null_resource" "upload_provider_logos" {
  provisioner "local-exec" {
    command = "gsutil -m cp -r assets/provider_logos/* ${google_storage_bucket.provider_logo.url}"
  }

  triggers = {
    dir_hash = sha1(join("", [for f in fileset("assets/provider_logos", "**") : filesha1("${path.module}/assets/provider_logos/${f}")]))
  }
}
