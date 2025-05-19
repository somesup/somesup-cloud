data "archive_file" "source" {
  type        = "zip"
  source_dir  = var.source_dir
  output_path = "/tmp/${var.function_name}.zip"
}

resource "google_storage_bucket_object" "source" {
  name   = "${var.function_name}.zip"
  bucket = var.source_bucket_name
  source = data.archive_file.source.output_path
}

resource "google_cloudfunctions2_function" "main" {
  project  = var.project_id
  location = var.location
  name     = var.function_name

  build_config {
    source {
      storage_source {
        bucket = google_storage_bucket_object.source.bucket
        object = google_storage_bucket_object.source.name
      }
    }
    runtime               = var.runtime
    entry_point           = var.entry_point
    environment_variables = var.environment_variables
  }

  service_config {
    max_instance_count    = var.max_instance_count
    min_instance_count    = var.min_instance_count
    available_memory      = var.available_memory_mb
    available_cpu         = var.available_cpu
    timeout_seconds       = var.timeout
    environment_variables = var.environment_variables
    service_account_email = google_service_account.main.email
  }

  dynamic "event_trigger" {
    # Only create the event trigger if the trigger_event is not null
    for_each = var.trigger_event != null ? [1] : []
    content {
      trigger_region = var.trigger_region
      event_type     = var.trigger_event
      pubsub_topic   = var.trigger_pubsub_topic
      retry_policy   = var.retry_policy
    }
  }

  lifecycle {
    replace_triggered_by = [google_storage_bucket_object.source]
  }
}
