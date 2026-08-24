/**
 * Health check implementation for the OpenClaw Relay Service
 */

import type { Request, Response } from 'express';
import type { RedisClientType } from 'redis';
import type { HealthStatus } from './types.js';

const startTime = Date.now();

export function createHealthCheck(redis: RedisClientType) {
  return async (req: Request, res: Response) => {
    const checks: HealthStatus['checks'] = {
      redis: 'fail',
      websocket: 'pass', // Simplified - assume WS is healthy if server is running
      connections: 'pass',
      memory: 'pass',
    };

    let status: HealthStatus['status'] = 'healthy';

    // Test Redis connection
    try {
      await redis.ping();
      checks.redis = 'pass';
    } catch (error) {
      checks.redis = 'fail';
      status = 'degraded';
      console.error('[health] Redis health check failed:', error);
    }

    // Check memory usage
    const memUsage = process.memoryUsage();
    const memUsageMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const memLimitMB = 1024; // 1GB limit

    if (memUsageMB > memLimitMB * 0.9) {
      checks.memory = 'fail';
      status = 'degraded';
    } else if (memUsageMB > memLimitMB * 0.7) {
      status = 'degraded';
    }

    // Calculate uptime
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

    const healthStatus: HealthStatus = {
      status,
      timestamp: new Date().toISOString(),
      checks,
      metrics: {
        activeConnections: 0, // TODO: Get from relay manager
        activeSessions: 0,    // TODO: Get from relay manager
        memoryUsageMB,
        uptimeSeconds,
      },
    };

    // Set appropriate HTTP status code
    const httpStatus = status === 'healthy' ? 200 : status === 'degraded' ? 200 : 503;

    res.status(httpStatus).json(healthStatus);
  };
}