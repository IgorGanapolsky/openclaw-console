/**
 * OpenClaw Relay Service Infrastructure
 *
 * Production deployment with:
 * - Global Cloud Run deployments for low latency
 * - Redis for session management
 * - Load balancing and auto-scaling
 * - Monitoring and alerting
 * - CDN for mobile app distribution
 */

terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }

  backend "gcs" {
    bucket = "openclaw-console-terraform-state"
    prefix = "relay-service"
  }
}

# Configure providers
provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

# Local values
locals {
  app_name = "openclaw-relay"
  environment = var.environment

  # Global regions for low latency
  regions = {
    "us-central1"    = "North America Central"
    "us-east1"       = "North America East"
    "us-west1"       = "North America West"
    "europe-west1"   = "Europe West"
    "europe-west2"   = "Europe Central"
    "asia-east1"     = "Asia East"
    "asia-southeast1" = "Asia Southeast"
  }

  # Common labels
  labels = {
    app         = local.app_name
    environment = local.environment
    component   = "relay-service"
    managed-by  = "terraform"
  }
}