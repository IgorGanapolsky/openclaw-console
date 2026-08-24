# DNS configuration for relay.openclaw.com

# Cloudflare DNS record for the relay service
resource "cloudflare_record" "relay_dns" {
  zone_id = var.cloudflare_zone_id
  name    = "relay"
  type    = "A"
  content = google_compute_global_address.relay_lb_ip.address
  ttl     = 300
  proxied = true # Enable Cloudflare proxy for additional DDoS protection

  comment = "OpenClaw Relay Service - Global Load Balancer IP"
}

# Health check subdomain for monitoring
resource "cloudflare_record" "relay_health_dns" {
  zone_id = var.cloudflare_zone_id
  name    = "relay-health"
  type    = "A"
  content = google_compute_global_address.relay_lb_ip.address
  ttl     = 60
  proxied = false # Direct connection for health checks

  comment = "OpenClaw Relay Service - Health Check Endpoint"
}

# Regional health check records for direct monitoring
resource "cloudflare_record" "relay_regional_health" {
  for_each = local.regions

  zone_id = var.cloudflare_zone_id
  name    = "relay-${each.key}"
  type    = "CNAME"
  content = google_cloud_run_v2_service.relay_service[each.key].uri
  ttl     = 300
  proxied = false

  comment = "OpenClaw Relay Service - ${each.value} Regional Endpoint"
}

# CAA record for SSL certificate authority
resource "cloudflare_record" "relay_caa" {
  zone_id = var.cloudflare_zone_id
  name    = "relay"
  type    = "CAA"
  content = "0 issue \"letsencrypt.org\""
  ttl     = 3600

  comment = "CAA record for SSL certificate authority"
}

# TXT record for domain verification
resource "cloudflare_record" "relay_txt_verification" {
  zone_id = var.cloudflare_zone_id
  name    = "_openclaw-relay-verification"
  type    = "TXT"
  content = "v=openclaw-relay1; service=relay-service; environment=${var.environment}"
  ttl     = 300

  comment = "OpenClaw Relay Service verification record"
}