output "relay_service_url" {
  description = "URL of the OpenClaw Relay Service"
  value       = "https://${var.domain_name}"
}

output "relay_websocket_url" {
  description = "WebSocket URL for the OpenClaw Relay Service"
  value       = "wss://${var.domain_name}/<gatewayId>"
}

output "load_balancer_ip" {
  description = "Global Load Balancer IP address"
  value       = google_compute_global_address.relay_lb_ip.address
}

output "regional_endpoints" {
  description = "Regional Cloud Run service endpoints"
  value = {
    for region, service in google_cloud_run_v2_service.relay_service :
    region => service.uri
  }
}

output "redis_host" {
  description = "Redis instance host"
  value       = google_redis_instance.relay_cache.host
  sensitive   = true
}

output "redis_port" {
  description = "Redis instance port"
  value       = google_redis_instance.relay_cache.port
}

output "service_account_email" {
  description = "Service account email for the relay service"
  value       = google_service_account.relay_service_account.email
}

output "health_check_urls" {
  description = "Health check URLs for monitoring"
  value = {
    global = "https://${var.domain_name}/health"
    regional = {
      for region, service in google_cloud_run_v2_service.relay_service :
      region => "${service.uri}/health"
    }
  }
}

output "metrics_endpoints" {
  description = "Prometheus metrics endpoints"
  value = {
    for region, service in google_cloud_run_v2_service.relay_service :
    region => "${service.uri}:9090/metrics"
  }
}

output "dns_records" {
  description = "DNS records created"
  value = {
    main_record    = "${cloudflare_record.relay_dns.name}.${cloudflare_record.relay_dns.zone_id}"
    health_record  = "${cloudflare_record.relay_health_dns.name}.${cloudflare_record.relay_health_dns.zone_id}"
    regional_records = {
      for region, record in cloudflare_record.relay_regional_health :
      region => "${record.name}.${record.zone_id}"
    }
  }
}

output "api_endpoints" {
  description = "API endpoints for the relay service"
  value = {
    relay_info      = "https://${var.domain_name}/api/relay/info"
    health          = "https://${var.domain_name}/health"
    ready           = "https://${var.domain_name}/health/ready"
    live            = "https://${var.domain_name}/health/live"
  }
}

output "deployment_info" {
  description = "Deployment information"
  value = {
    environment     = var.environment
    regions        = keys(local.regions)
    min_instances  = var.min_instances
    max_instances  = var.max_instances
    container_image = replace(var.container_image, "PROJECT_ID", var.gcp_project_id)
  }
}