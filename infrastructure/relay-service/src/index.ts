/**
 * OpenClaw Relay Service
 *
 * A production WebSocket relay service that provides the "always works" fallback connection
 * for OpenClaw mobile console cross-network connectivity.
 *
 * Features:
 * - WebSocket relay between mobile apps and OpenClaw gateways
 * - Connection pooling and load balancing
 * - Health monitoring and metrics
 * - Redis-based session management
 * - Global edge deployment ready
 */

import http from 'node:http';
import express from 'express';
import { WebSocketServer } from 'ws';
import { createRelayManager } from './relay-manager.js';
import { createMetricsServer } from './metrics.js';
import { createHealthCheck } from './health.js';
import { createRedisClient } from './redis-client.js';
import type { RelayConfig } from './types.js';

const config: RelayConfig = {
  port: parseInt(process.env.PORT || '8080', 10),
  host: process.env.HOST || '0.0.0.0',
  metricsPort: parseInt(process.env.METRICS_PORT || '9090', 10),
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  maxConnections: parseInt(process.env.MAX_CONNECTIONS || '10000', 10),
  connectionTimeoutMs: parseInt(process.env.CONNECTION_TIMEOUT_MS || '300000', 10), // 5 minutes
  pingIntervalMs: parseInt(process.env.PING_INTERVAL_MS || '30000', 10), // 30 seconds
  region: process.env.REGION || 'us-central1',
  environment: process.env.NODE_ENV || 'production',
  logLevel: process.env.LOG_LEVEL || 'info',
};

async function main() {
  try {
    console.info('[relay] Starting OpenClaw Relay Service');
    console.info('[relay] Config:', {
      port: config.port,
      host: config.host,
      region: config.region,
      environment: config.environment,
      maxConnections: config.maxConnections
    });

    // Initialize Redis connection
    const redis = createRedisClient(config.redisUrl);
    await redis.ping();
    console.info('[relay] Redis connection established');

    // Create Express app for HTTP endpoints
    const app = express();
    app.use(express.json());

    // Health check endpoint
    const healthCheck = createHealthCheck(redis);
    app.get('/health', healthCheck);
    app.get('/health/ready', healthCheck);
    app.get('/health/live', healthCheck);

    // Relay info endpoint
    app.get('/api/relay/info', (_req, res) => {
      res.json({
        service: 'openclaw-relay',
        version: '1.0.0',
        region: config.region,
        environment: config.environment,
        timestamp: new Date().toISOString(),
        connections: {
          max: config.maxConnections,
          timeout_ms: config.connectionTimeoutMs,
          ping_interval_ms: config.pingIntervalMs,
        }
      });
    });

    // Create HTTP server
    const httpServer = http.createServer(app);

    // Create WebSocket server
    const wss = new WebSocketServer({
      server: httpServer,
      perMessageDeflate: true,
      maxPayload: 1024 * 1024, // 1MB max message size
    });

    // Initialize relay manager
    const relayManager = createRelayManager(wss, redis, config);

    // Start metrics server
    const metricsServer = createMetricsServer(config.metricsPort, relayManager);

    // Graceful shutdown
    const shutdown = async () => {
      console.info('[relay] Shutting down gracefully...');

      // Stop accepting new connections
      httpServer.close();
      wss.close();

      // Close existing connections
      relayManager.shutdown();

      // Close metrics server
      metricsServer.close();

      // Close Redis connection
      await redis.quit();

      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    // Start the server
    httpServer.listen(config.port, config.host, () => {
      console.info(`[relay] OpenClaw Relay Service listening on http://${config.host}:${config.port}`);
      console.info(`[relay] WebSocket endpoint: wss://relay.openclaw.com/<gatewayId>`);
      console.info(`[relay] Metrics endpoint: http://${config.host}:${config.metricsPort}/metrics`);
      console.info(`[relay] Health endpoint: http://${config.host}:${config.port}/health`);
    });

  } catch (error) {
    console.error('[relay] Failed to start relay service:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('[relay] Unhandled error:', error);
  process.exit(1);
});