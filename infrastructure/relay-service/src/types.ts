/**
 * Type definitions for the OpenClaw Relay Service
 */

import type WebSocket from 'ws';

export interface RelayConfig {
  port: number;
  host: string;
  metricsPort: number;
  redisUrl: string;
  maxConnections: number;
  connectionTimeoutMs: number;
  pingIntervalMs: number;
  region: string;
  environment: string;
  logLevel: string;
}

export interface ConnectionInfo {
  id: string;
  gatewayId: string;
  type: 'mobile' | 'gateway';
  connectedAt: Date;
  lastActivity: Date;
  remoteAddress?: string;
  userAgent?: string;
}

export interface RelaySession {
  gatewayId: string;
  mobileConnections: Map<string, ConnectionInfo>;
  gatewayConnection: ConnectionInfo | null;
  createdAt: Date;
  lastActivity: Date;
  messageCount: number;
}

export interface RelayMessage {
  type: 'connect' | 'message' | 'disconnect' | 'error' | 'ping' | 'pong';
  connectionId: string;
  gatewayId: string;
  timestamp: string;
  payload?: any;
}

export interface WebSocketConnection extends WebSocket {
  id: string;
  connectionInfo: ConnectionInfo;
  isAlive: boolean;
  lastPing: Date;
}

export interface RelayMetrics {
  totalConnections: number;
  activeSessions: number;
  messagesRelayed: number;
  bytesTransferred: number;
  connectionsByRegion: Record<string, number>;
  averageLatencyMs: number;
  errorCount: number;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: {
    redis: 'pass' | 'fail';
    websocket: 'pass' | 'fail';
    connections: 'pass' | 'fail';
    memory: 'pass' | 'fail';
  };
  metrics: {
    activeConnections: number;
    activeSessions: number;
    memoryUsageMB: number;
    uptimeSeconds: number;
  };
}