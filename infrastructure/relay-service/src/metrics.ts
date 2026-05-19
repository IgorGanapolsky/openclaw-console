/**
 * Prometheus metrics server for the OpenClaw Relay Service
 */

import http from 'node:http';
import type { RelayManager } from './relay-manager.js';

export function createMetricsServer(port: number, relayManager: RelayManager): http.Server {
  const server = http.createServer((req, res) => {
    if (req.url === '/metrics') {
      const metrics = relayManager.getMetrics();
      const memUsage = process.memoryUsage();

      // Prometheus format metrics
      const prometheusMetrics = `
# HELP relay_connections_total Total number of active connections
# TYPE relay_connections_total gauge
relay_connections_total ${metrics.totalConnections}

# HELP relay_sessions_total Total number of active relay sessions
# TYPE relay_sessions_total gauge
relay_sessions_total ${metrics.activeSessions}

# HELP relay_messages_relayed_total Total number of messages relayed
# TYPE relay_messages_relayed_total counter
relay_messages_relayed_total ${metrics.messagesRelayed}

# HELP relay_bytes_transferred_total Total bytes transferred
# TYPE relay_bytes_transferred_total counter
relay_bytes_transferred_total ${metrics.bytesTransferred}

# HELP relay_errors_total Total number of errors
# TYPE relay_errors_total counter
relay_errors_total ${metrics.errorCount}

# HELP relay_memory_heap_used_bytes Memory heap used in bytes
# TYPE relay_memory_heap_used_bytes gauge
relay_memory_heap_used_bytes ${memUsage.heapUsed}

# HELP relay_memory_heap_total_bytes Memory heap total in bytes
# TYPE relay_memory_heap_total_bytes gauge
relay_memory_heap_total_bytes ${memUsage.heapTotal}

# HELP relay_memory_external_bytes Memory external in bytes
# TYPE relay_memory_external_bytes gauge
relay_memory_external_bytes ${memUsage.external}

# HELP relay_memory_rss_bytes Resident set size in bytes
# TYPE relay_memory_rss_bytes gauge
relay_memory_rss_bytes ${memUsage.rss}

# HELP relay_uptime_seconds Server uptime in seconds
# TYPE relay_uptime_seconds gauge
relay_uptime_seconds ${process.uptime()}
`.trim();

      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Length': Buffer.byteLength(prometheusMetrics),
      });
      res.end(prometheusMetrics);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  });

  server.listen(port, '0.0.0.0', () => {
    console.info(`[metrics] Metrics server listening on port ${port}`);
  });

  return server;
}