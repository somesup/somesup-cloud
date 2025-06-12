terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0.0"
    }
  }

  backend "gcs" {
    bucket = "somesup-462506-tfstate"
    prefix = "terraform/state"
  }
}
