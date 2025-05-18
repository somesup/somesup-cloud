variable "project_id" {
  type        = string
  description = "The ID of the GCP project where the Cloud Function will be deployed."
}

variable "location" {
  type        = string
  description = "The GCP region where the Cloud Function will be deployed."
}

variable "function_name" {
  type        = string
  description = "The name of the Cloud Function."
}

variable "source_archive_bucket" {
  type        = string
  description = "The name of the GCS bucket where the source code is stored."
}

variable "source_archive_object" {
  type        = string
  description = "The name of the GCS object (zip file) containing the source code."
}

variable "source_archive_hash" {
  type        = string
  description = "The hash of the source archive for verification."
}

variable "runtime" {
  type        = string
  description = "The runtime environment for the Cloud Function."
}

variable "entry_point" {
  type        = string
  description = "The name of the function (entry point) in the source code."
}

variable "environment_variables" {
  type        = map(string)
  description = "A map of environment variables to set in the Cloud Function."
  default     = {}
}

variable "secret_environment_variables" {
  type        = map(string)
  description = "A map of secret environment variables to set in the Cloud Function."
  default     = {}
}

variable "max_instance_count" {
  type        = number
  description = "The maximum number of instances for the Cloud Function."
  default     = 3
}

variable "min_instance_count" {
  type        = number
  description = "The minimum number of instances for the Cloud Function."
  default     = 0
}

variable "available_memory_mb" {
  type        = string
  description = "The amount of memory allocated to the Cloud Function in MB."
  default     = "128Mi"
}

variable "available_cpu" {
  type        = string
  description = "The amount of CPU allocated to the Cloud Function."
  default     = "1"
}

variable "timeout" {
  type        = number
  description = "The maximum duration (in seconds) for the function to run before timing out."
  default     = 60
}

variable "trigger_event" {
  type        = string
  description = "The event that will trigger the Cloud Function."
  nullable    = true
  default     = null
}

variable "trigger_region" {
  type        = string
  description = "The region where the trigger is located."
  default     = null
}

variable "trigger_pubsub_topic" {
  type        = string
  description = "The Pub/Sub topic that will trigger the Cloud Function."
  nullable    = true
  default     = null
}

variable "retry_policy" {
  type        = string
  description = "The retry policy for the Cloud Function."
  default     = "RETRY_POLICY_RETRY"
}

variable "roles" {
  type        = list(string)
  description = "List of IAM roles to assign to the service account."
  default     = []
}
