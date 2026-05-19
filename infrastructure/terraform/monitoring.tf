# Monitoring and alerting for the OpenClaw Relay Service

# Uptime check for the relay service
resource "google_monitoring_uptime_check_config" "relay_uptime_check" {
  count = var.enable_monitoring ? 1 : 0

  display_name = "OpenClaw Relay Service Uptime"
  timeout      = "10s"
  period       = "60s"

  http_check {
    path           = "/health"
    port           = "443"
    use_ssl        = true
    validate_ssl   = true
    request_method = "GET"

    accepted_response_status_codes {
      status_value = 200
    }
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.gcp_project_id
      host       = var.domain_name
    }
  }

  checker_type = "STATIC_IP_CHECKERS"

  selected_regions = [
    "USA",
    "EUROPE",
    "ASIA_PACIFIC"
  ]

  content_matchers {
    content = "healthy"
    matcher = "CONTAINS_STRING"
  }
}

# WebSocket uptime check
resource "google_monitoring_uptime_check_config" "relay_websocket_check" {
  count = var.enable_monitoring ? 1 : 0

  display_name = "OpenClaw Relay WebSocket Check"
  timeout      = "10s"
  period       = "60s"

  tcp_check {
    port = 443
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.gcp_project_id
      host       = var.domain_name
    }
  }

  checker_type = "STATIC_IP_CHECKERS"

  selected_regions = [
    "USA",
    "EUROPE",
    "ASIA_PACIFIC"
  ]
}

# Notification channel for alerts (email)
resource "google_monitoring_notification_channel" "email_notifications" {
  count = var.enable_monitoring ? 1 : 0

  display_name = "OpenClaw Relay Email Alerts"
  type         = "email"

  labels = {
    email_address = "alerts@openclaw.com"
  }

  description = "Email notifications for OpenClaw Relay Service alerts"
  enabled     = true
}

# Alert policy for service down
resource "google_monitoring_alert_policy" "relay_service_down" {
  count = var.enable_monitoring ? 1 : 0

  display_name = "OpenClaw Relay Service Down"
  combiner     = "OR"
  enabled      = true

  conditions {
    display_name = "Uptime check failure"

    condition_threshold {
      filter          = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND resource.type=\"uptime_url\""
      duration        = "300s"
      comparison      = "COMPARISON_EQUAL"
      threshold_value = 0

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_NEXT_OLDER"
      }
    }
  }

  conditions {
    display_name = "High error rate"

    condition_threshold {
      filter          = "resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/request_count\""
      duration        = "300s"
      comparison      = "COMPARISON_GREATER_THAN"
      threshold_value = 10

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_RATE"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email_notifications[0].id]

  documentation {
    content   = "The OpenClaw Relay Service is experiencing issues. Check the service health and logs."
    mime_type = "text/markdown"
  }
}

# Alert policy for high latency
resource "google_monitoring_alert_policy" "relay_high_latency" {
  count = var.enable_monitoring ? 1 : 0

  display_name = "OpenClaw Relay High Latency"
  combiner     = "OR"
  enabled      = true

  conditions {
    display_name = "High request latency"

    condition_threshold {
      filter          = "resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/request_latencies\""
      duration        = "300s"
      comparison      = "COMPARISON_GREATER_THAN"
      threshold_value = 5000 # 5 seconds

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_DELTA"
        cross_series_reducer = "REDUCE_PERCENTILE_95"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email_notifications[0].id]

  documentation {
    content   = "The OpenClaw Relay Service is experiencing high latency. Check for performance issues."
    mime_type = "text/markdown"
  }
}

# Alert policy for high memory usage
resource "google_monitoring_alert_policy" "relay_high_memory" {
  count = var.enable_monitoring ? 1 : 0

  display_name = "OpenClaw Relay High Memory Usage"
  combiner     = "OR"
  enabled      = true

  conditions {
    display_name = "High memory utilization"

    condition_threshold {
      filter          = "resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/container/memory/utilizations\""
      duration        = "300s"
      comparison      = "COMPARISON_GREATER_THAN"
      threshold_value = 0.8 # 80%

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_MEAN"
        cross_series_reducer = "REDUCE_MEAN"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email_notifications[0].id]

  documentation {
    content   = "The OpenClaw Relay Service is using high memory. Consider scaling up or optimizing memory usage."
    mime_type = "text/markdown"
  }
}

# Alert policy for Redis connection issues
resource "google_monitoring_alert_policy" "redis_connection_issues" {
  count = var.enable_monitoring ? 1 : 0

  display_name = "OpenClaw Relay Redis Issues"
  combiner     = "OR"
  enabled      = true

  conditions {
    display_name = "Redis high memory usage"

    condition_threshold {
      filter          = "resource.type=\"redis_instance\" AND metric.type=\"redis.googleapis.com/stats/memory/usage_ratio\""
      duration        = "300s"
      comparison      = "COMPARISON_GREATER_THAN"
      threshold_value = 0.8 # 80%

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }

  conditions {
    display_name = "Redis connection count high"

    condition_threshold {
      filter          = "resource.type=\"redis_instance\" AND metric.type=\"redis.googleapis.com/clients/connected\""
      duration        = "300s"
      comparison      = "COMPARISON_GREATER_THAN"
      threshold_value = 1000

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email_notifications[0].id]

  documentation {
    content   = "Redis is experiencing high load. Check connection patterns and consider scaling."
    mime_type = "text/markdown"
  }
}

# Dashboard for relay service metrics
resource "google_monitoring_dashboard" "relay_dashboard" {
  count = var.enable_monitoring ? 1 : 0

  dashboard_json = jsonencode({
    displayName = "OpenClaw Relay Service Dashboard"
    mosaicLayout = {
      tiles = [
        {
          width  = 6
          height = 4
          widget = {
            title = "Request Rate"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/request_count\""
                    aggregation = {
                      alignmentPeriod    = "60s"
                      perSeriesAligner   = "ALIGN_RATE"
                      crossSeriesReducer = "REDUCE_SUM"
                    }
                  }
                }
              }]
              timeshiftDuration = "0s"
              yAxis = {
                label = "Requests/sec"
                scale = "LINEAR"
              }
            }
          }
        },
        {
          width  = 6
          height = 4
          xPos   = 6
          widget = {
            title = "Response Latency"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/request_latencies\""
                    aggregation = {
                      alignmentPeriod    = "60s"
                      perSeriesAligner   = "ALIGN_DELTA"
                      crossSeriesReducer = "REDUCE_PERCENTILE_95"
                    }
                  }
                }
              }]
              timeshiftDuration = "0s"
              yAxis = {
                label = "Latency (ms)"
                scale = "LINEAR"
              }
            }
          }
        },
        {
          width  = 6
          height = 4
          yPos   = 4
          widget = {
            title = "Active Instances"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/container/instance_count\""
                    aggregation = {
                      alignmentPeriod    = "60s"
                      perSeriesAligner   = "ALIGN_MEAN"
                      crossSeriesReducer = "REDUCE_SUM"
                    }
                  }
                }
              }]
              timeshiftDuration = "0s"
              yAxis = {
                label = "Instances"
                scale = "LINEAR"
              }
            }
          }
        },
        {
          width  = 6
          height = 4
          xPos   = 6
          yPos   = 4
          widget = {
            title = "Memory Usage"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/container/memory/utilizations\""
                    aggregation = {
                      alignmentPeriod    = "60s"
                      perSeriesAligner   = "ALIGN_MEAN"
                      crossSeriesReducer = "REDUCE_MEAN"
                    }
                  }
                }
              }]
              timeshiftDuration = "0s"
              yAxis = {
                label = "Memory Utilization"
                scale = "LINEAR"
              }
            }
          }
        }
      ]
    }
  })
}