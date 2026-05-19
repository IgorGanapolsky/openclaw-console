# Redis Memorystore for session management and cross-region coordination

resource "google_redis_instance" "relay_cache" {
  name           = "${local.app_name}-cache"
  tier           = "STANDARD_HA"
  memory_size_gb = var.redis_memory_size_gb
  region         = var.gcp_region

  # Network configuration
  authorized_network = google_compute_network.relay_network.id
  connect_mode       = "PRIVATE_SERVICE_ACCESS"

  # Redis configuration
  redis_version = "REDIS_7_0"
  display_name  = "OpenClaw Relay Cache"

  # High availability
  replica_count            = 1
  read_replicas_mode      = "READ_REPLICAS_ENABLED"
  secondary_ip_range      = "10.0.0.0/28"

  # Maintenance
  maintenance_policy {
    weekly_maintenance_window {
      day = "SUNDAY"
      start_time {
        hours   = 2
        minutes = 0
        seconds = 0
        nanos   = 0
      }
    }
  }

  # Security
  auth_enabled               = true
  transit_encryption_mode    = "SERVER_AUTHENTICATION"
  customer_managed_key      = google_kms_crypto_key.relay_key.id

  labels = local.labels

  depends_on = [
    google_service_networking_connection.private_vpc_connection
  ]
}

# Generate Redis auth token
resource "google_secret_manager_secret" "redis_auth" {
  secret_id = "${local.app_name}-redis-auth"

  replication {
    auto {}
  }

  labels = local.labels
}

resource "google_secret_manager_secret_version" "redis_auth" {
  secret      = google_secret_manager_secret.redis_auth.id
  secret_data = random_password.redis_auth.result
}

resource "random_password" "redis_auth" {
  length  = 32
  special = true
}

# KMS key for Redis encryption
resource "google_kms_key_ring" "relay_keyring" {
  name     = "${local.app_name}-keyring"
  location = var.gcp_region
}

resource "google_kms_crypto_key" "relay_key" {
  name     = "${local.app_name}-key"
  key_ring = google_kms_key_ring.relay_keyring.id

  purpose = "ENCRYPT_DECRYPT"

  version_template {
    algorithm        = "GOOGLE_SYMMETRIC_ENCRYPTION"
    protection_level = "SOFTWARE"
  }

  lifecycle {
    prevent_destroy = true
  }
}