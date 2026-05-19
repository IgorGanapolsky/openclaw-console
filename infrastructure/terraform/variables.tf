variable "gcp_project_id" {
  description = "Google Cloud Project ID"
  type        = string
}

variable "gcp_region" {
  description = "Primary Google Cloud region"
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Environment name (production, staging, development)"
  type        = string
  default     = "production"
}

variable "cloudflare_api_token" {
  description = "Cloudflare API token for DNS management"
  type        = string
  sensitive   = true
}

variable "cloudflare_zone_id" {
  description = "Cloudflare Zone ID for openclaw.com"
  type        = string
}

variable "domain_name" {
  description = "Domain name for the relay service"
  type        = string
  default     = "relay.openclaw.com"
}

variable "container_image" {
  description = "Container image for the relay service"
  type        = string
  default     = "gcr.io/PROJECT_ID/openclaw-relay:latest"
}

variable "min_instances" {
  description = "Minimum number of instances per region"
  type        = number
  default     = 1
}

variable "max_instances" {
  description = "Maximum number of instances per region"
  type        = number
  default     = 10
}

variable "cpu_limit" {
  description = "CPU limit for each instance"
  type        = string
  default     = "1000m"
}

variable "memory_limit" {
  description = "Memory limit for each instance"
  type        = string
  default     = "512Mi"
}

variable "redis_memory_size_gb" {
  description = "Redis memory size in GB"
  type        = number
  default     = 1
}

variable "enable_monitoring" {
  description = "Enable Google Cloud Monitoring and Alerting"
  type        = bool
  default     = true
}

variable "enable_cdn" {
  description = "Enable CDN for mobile app distribution"
  type        = bool
  default     = true
}