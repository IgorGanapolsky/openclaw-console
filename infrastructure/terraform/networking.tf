# Networking configuration for the OpenClaw Relay Service

# VPC Network
resource "google_compute_network" "relay_network" {
  name                    = "${local.app_name}-network"
  auto_create_subnetworks = false
  mtu                     = 1500
}

# Private subnet for Cloud Run and Redis
resource "google_compute_subnetwork" "relay_subnet" {
  name          = "${local.app_name}-subnet"
  ip_cidr_range = "10.0.1.0/24"
  region        = var.gcp_region
  network       = google_compute_network.relay_network.id

  # Enable private Google access for serverless services
  private_ip_google_access = true
}

# Private service connection for Redis
resource "google_compute_global_address" "private_ip_address" {
  name          = "${local.app_name}-private-ip"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.relay_network.id
}

resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.relay_network.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_address.name]
}

# VPC Connector for Cloud Run to access VPC resources
resource "google_vpc_access_connector" "relay_connector" {
  for_each = local.regions

  name          = "${local.app_name}-connector-${each.key}"
  region        = each.key
  ip_cidr_range = "10.${index(keys(local.regions), each.key) + 10}.0.0/28"
  network       = google_compute_network.relay_network.name

  # Performance configuration
  min_throughput = 200
  max_throughput = 1000

  depends_on = [
    google_compute_subnetwork.relay_subnet
  ]
}

# Global Load Balancer for multi-region deployment
resource "google_compute_global_address" "relay_lb_ip" {
  name = "${local.app_name}-lb-ip"
}

resource "google_compute_managed_ssl_certificate" "relay_ssl_cert" {
  name = "${local.app_name}-ssl-cert"

  managed {
    domains = [var.domain_name]
  }
}

# Backend service for load balancer
resource "google_compute_backend_service" "relay_backend" {
  name                            = "${local.app_name}-backend"
  description                     = "Backend service for OpenClaw Relay"
  protocol                        = "HTTP"
  port_name                       = "http"
  timeout_sec                     = 30
  enable_cdn                      = var.enable_cdn
  connection_draining_timeout_sec = 60

  # Global load balancing
  load_balancing_scheme = "EXTERNAL_MANAGED"

  # Health check
  health_checks = [google_compute_health_check.relay_health_check.id]

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

  # Security policy
  security_policy = google_compute_security_policy.relay_security_policy.id
}

# Health check for the backend service
resource "google_compute_health_check" "relay_health_check" {
  name                = "${local.app_name}-health-check"
  description         = "Health check for OpenClaw Relay Service"
  timeout_sec         = 5
  check_interval_sec  = 10
  healthy_threshold   = 2
  unhealthy_threshold = 3

  http_health_check {
    request_path = "/health"
    port         = "8080"
  }
}

# URL map for routing
resource "google_compute_url_map" "relay_url_map" {
  name            = "${local.app_name}-url-map"
  description     = "URL map for OpenClaw Relay Service"
  default_service = google_compute_backend_service.relay_backend.id

  # WebSocket upgrade support
  path_matcher {
    name            = "websocket"
    default_service = google_compute_backend_service.relay_backend.id

    path_rule {
      paths   = ["/ws", "/ws/*"]
      service = google_compute_backend_service.relay_backend.id
    }
  }

  # API routes
  path_matcher {
    name            = "api"
    default_service = google_compute_backend_service.relay_backend.id

    path_rule {
      paths   = ["/api/*"]
      service = google_compute_backend_service.relay_backend.id
    }
  }
}

# HTTPS target proxy
resource "google_compute_target_https_proxy" "relay_https_proxy" {
  name             = "${local.app_name}-https-proxy"
  url_map          = google_compute_url_map.relay_url_map.id
  ssl_certificates = [google_compute_managed_ssl_certificate.relay_ssl_cert.id]
}

# Global forwarding rule
resource "google_compute_global_forwarding_rule" "relay_https_forwarding_rule" {
  name       = "${local.app_name}-https-forwarding-rule"
  target     = google_compute_target_https_proxy.relay_https_proxy.id
  port_range = "443"
  ip_address = google_compute_global_address.relay_lb_ip.address
}

# HTTP to HTTPS redirect
resource "google_compute_url_map" "relay_https_redirect" {
  name = "${local.app_name}-https-redirect"

  default_url_redirect {
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    https_redirect         = true
    strip_query            = false
  }
}

resource "google_compute_target_http_proxy" "relay_http_proxy" {
  name    = "${local.app_name}-http-proxy"
  url_map = google_compute_url_map.relay_https_redirect.id
}

resource "google_compute_global_forwarding_rule" "relay_http_forwarding_rule" {
  name       = "${local.app_name}-http-forwarding-rule"
  target     = google_compute_target_http_proxy.relay_http_proxy.id
  port_range = "80"
  ip_address = google_compute_global_address.relay_lb_ip.address
}

# Security policy
resource "google_compute_security_policy" "relay_security_policy" {
  name        = "${local.app_name}-security-policy"
  description = "Security policy for OpenClaw Relay Service"

  # Rate limiting
  rule {
    action   = "throttle"
    priority = "1000"

    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }

    description = "Rate limiting rule"

    rate_limit_options {
      conform_action = "allow"
      exceed_action  = "deny(429)"

      rate_limit_threshold {
        count        = 100
        interval_sec = 60
      }

      enforce_on_key = "IP"
    }
  }

  # Default allow rule
  rule {
    action   = "allow"
    priority = "2147483647"

    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }

    description = "Default allow rule"
  }
}