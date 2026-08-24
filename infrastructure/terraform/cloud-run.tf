# Cloud Run services for global relay deployment

# Enable required APIs
resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "cloudkms.googleapis.com",
    "redis.googleapis.com",
    "secretmanager.googleapis.com",
    "monitoring.googleapis.com",
    "logging.googleapis.com",
    "vpcaccess.googleapis.com",
    "servicenetworking.googleapis.com",
  ])

  project = var.gcp_project_id
  service = each.value

  disable_on_destroy = false
}

# Service account for Cloud Run services
resource "google_service_account" "relay_service_account" {
  account_id   = "${local.app_name}-service-account"
  display_name = "OpenClaw Relay Service Account"
  description  = "Service account for OpenClaw Relay Cloud Run services"
}

# IAM bindings for the service account
resource "google_project_iam_member" "relay_service_account_bindings" {
  for_each = toset([
    "roles/redis.editor",
    "roles/secretmanager.secretAccessor",
    "roles/monitoring.metricWriter",
    "roles/logging.logWriter",
    "roles/cloudkms.cryptoKeyEncrypterDecrypter",
  ])

  project = var.gcp_project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.relay_service_account.email}"
}

# Cloud Run service for each region
resource "google_cloud_run_v2_service" "relay_service" {
  for_each = local.regions

  name     = "${local.app_name}-${each.key}"
  location = each.key
  project  = var.gcp_project_id

  description = "OpenClaw Relay Service - ${each.value}"
  labels      = local.labels

  template {
    service_account = google_service_account.relay_service_account.email

    # VPC configuration
    vpc_access {
      connector = google_vpc_access_connector.relay_connector[each.key].id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    # Scaling configuration
    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    # Container configuration
    containers {
      name  = "${local.app_name}-container"
      image = replace(var.container_image, "PROJECT_ID", var.gcp_project_id)

      # Resource limits
      resources {
        limits = {
          cpu    = var.cpu_limit
          memory = var.memory_limit
        }
        cpu_idle = true
      }

      # Environment variables
      env {
        name  = "NODE_ENV"
        value = var.environment
      }

      env {
        name  = "PORT"
        value = "8080"
      }

      env {
        name  = "METRICS_PORT"
        value = "9090"
      }

      env {
        name  = "REGION"
        value = each.key
      }

      env {
        name  = "MAX_CONNECTIONS"
        value = "10000"
      }

      env {
        name  = "CONNECTION_TIMEOUT_MS"
        value = "300000"
      }

      env {
        name  = "PING_INTERVAL_MS"
        value = "30000"
      }

      # Redis configuration from Secret Manager
      env {
        name = "REDIS_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.redis_url.secret_id
            version = "latest"
          }
        }
      }

      # Ports
      ports {
        name           = "http1"
        container_port = 8080
      }

      ports {
        name           = "metrics"
        container_port = 9090
      }

      # Health check
      startup_probe {
        http_get {
          path = "/health/ready"
          port = 8080
        }
        initial_delay_seconds = 5
        timeout_seconds       = 3
        period_seconds        = 10
        failure_threshold     = 3
      }

      liveness_probe {
        http_get {
          path = "/health/live"
          port = 8080
        }
        initial_delay_seconds = 30
        timeout_seconds       = 3
        period_seconds        = 30
        failure_threshold     = 3
      }
    }

    # Session affinity for WebSocket connections
    session_affinity = false

    # Timeout configuration
    timeout = "300s"

    # Annotations for Cloud Run configuration
    annotations = {
      "autoscaling.knative.dev/minScale" = tostring(var.min_instances)
      "autoscaling.knative.dev/maxScale" = tostring(var.max_instances)
      "run.googleapis.com/cpu-throttling" = "false"
      "run.googleapis.com/execution-environment" = "gen2"
    }
  }

  # Traffic configuration
  traffic {
    percent = 100
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
  }

  depends_on = [
    google_project_service.apis,
    google_vpc_access_connector.relay_connector,
    google_secret_manager_secret_version.redis_url,
  ]
}

# Create Redis URL secret
resource "google_secret_manager_secret" "redis_url" {
  secret_id = "${local.app_name}-redis-url"

  replication {
    auto {}
  }

  labels = local.labels
}

resource "google_secret_manager_secret_version" "redis_url" {
  secret = google_secret_manager_secret.redis_url.id
  secret_data = "rediss://:${random_password.redis_auth.result}@${google_redis_instance.relay_cache.host}:${google_redis_instance.relay_cache.port}"
}

# IAM policy for public access
resource "google_cloud_run_service_iam_member" "public_access" {
  for_each = local.regions

  service  = google_cloud_run_v2_service.relay_service[each.key].name
  location = google_cloud_run_v2_service.relay_service[each.key].location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Backend service for each region
resource "google_compute_region_network_endpoint_group" "relay_neg" {
  for_each = local.regions

  name                  = "${local.app_name}-neg-${each.key}"
  network_endpoint_type = "SERVERLESS"
  region                = each.key

  cloud_run {
    service = google_cloud_run_v2_service.relay_service[each.key].name
  }
}

# Add backends to the global backend service
resource "google_compute_backend_service" "relay_backend_with_regions" {
  name                            = "${local.app_name}-backend"
  description                     = "Backend service for OpenClaw Relay"
  protocol                        = "HTTP"
  port_name                       = "http"
  timeout_sec                     = 30
  enable_cdn                      = var.enable_cdn
  connection_draining_timeout_sec = 60
  load_balancing_scheme           = "EXTERNAL_MANAGED"

  # Add backends for each region
  dynamic "backend" {
    for_each = local.regions
    content {
      group           = google_compute_region_network_endpoint_group.relay_neg[backend.key].id
      balancing_mode  = "UTILIZATION"
      capacity_scaler = 1.0
      max_utilization = 0.8
    }
  }

  health_checks   = [google_compute_health_check.relay_health_check.id]
  security_policy = google_compute_security_policy.relay_security_policy.id

  # CDN configuration
  dynamic "cdn_policy" {
    for_each = var.enable_cdn ? [1] : []
    content {
      cache_mode        = "CACHE_ALL_STATIC"
      default_ttl       = 3600
      max_ttl           = 86400
      client_ttl        = 3600
      negative_caching  = true

      cache_key_policy {
        include_host         = true
        include_protocol     = true
        include_query_string = false
      }
    }
  }

  depends_on = [
    google_compute_region_network_endpoint_group.relay_neg
  ]
}