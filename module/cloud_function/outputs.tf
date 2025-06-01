output "function_name" {
  value       = google_cloudfunctions2_function.main.name
  description = "The name of the deployed Cloud Function."
}

output "function_location" {
  value       = google_cloudfunctions2_function.main.location
  description = "The location where the Cloud Function is deployed."
}

output "function_url" {
  value       = google_cloudfunctions2_function.main.service_config[0].uri
  description = "The HTTPS endpoint of the deployed Cloud Function (if HTTP trigger)."
}

output "function_state" {
  value       = google_cloudfunctions2_function.main.state
  description = "The current state of the Cloud Function."
}

output "service_account_email" {
  value       = google_cloudfunctions2_function.main.service_config[0].service_account_email
  description = "The email of the service account used by the Cloud Function."
}
