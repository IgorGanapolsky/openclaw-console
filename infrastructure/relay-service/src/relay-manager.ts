/**
 * OpenClaw Relay Manager
 *
 * Manages WebSocket connections between mobile apps and OpenClaw gateways.
 * Provides connection pooling, message routing, and session management.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import type { Redis } from 'redis';
import type {
  RelayConfig,
  ConnectionInfo,
  RelaySession,
  RelayMessage,
  WebSocketConnection,
  RelayMetrics
} from './types.js';

export interface RelayManager {
  getMetrics(): RelayMetrics;
  shutdown(): void;
}

export function createRelayManager(
  wss: WebSocketServer,
  redis: Redis,
  config: RelayConfig
): RelayManager {

  const sessions = new Map<string, RelaySession>();
  const connections = new Map<string, WebSocketConnection>();
  const startTime = Date.now();

  let totalMessageCount = 0;
  let totalBytesTransferred = 0;
  let errorCount = 0;

  // Connection cleanup interval
  const cleanupInterval = setInterval(cleanupStaleConnections, 60000); // 1 minute

  wss.on('connection', (ws: WebSocket, req) => {
    handleNewConnection(ws as WebSocketConnection, req);
  });

  function handleNewConnection(ws: WebSocketConnection, req: any) {
    const url = new URL(req.url || '', `wss://relay.openclaw.com`);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const gatewayId = pathParts[0];

    if (!gatewayId) {
      ws.close(1008, 'Missing gateway ID in URL path');
      return;
    }

    // Create connection info
    const connectionId = uuidv4();
    const connectionInfo: ConnectionInfo = {
      id: connectionId,
      gatewayId,
      type: determineConnectionType(req),
      connectedAt: new Date(),
      lastActivity: new Date(),
      remoteAddress: req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
    };

    // Extend WebSocket with our properties
    ws.id = connectionId;
    ws.connectionInfo = connectionInfo;
    ws.isAlive = true;
    ws.lastPing = new Date();

    // Add to connections map
    connections.set(connectionId, ws);

    // Add to session or create new one
    let session = sessions.get(gatewayId);
    if (!session) {
      session = {
        gatewayId,
        mobileConnections: new Map(),
        gatewayConnection: null,
        createdAt: new Date(),
        lastActivity: new Date(),
        messageCount: 0,
      };
      sessions.set(gatewayId, session);
    }

    // Add connection to session
    if (connectionInfo.type === 'mobile') {
      session.mobileConnections.set(connectionId, connectionInfo);
    } else {
      // Only one gateway connection per session
      if (session.gatewayConnection) {
        // Close existing gateway connection
        const existingGatewayId = session.gatewayConnection.id;
        const existingWs = connections.get(existingGatewayId);
        if (existingWs) {
          existingWs.close(1008, 'New gateway connection established');
        }
      }
      session.gatewayConnection = connectionInfo;
    }

    console.info(`[relay] New ${connectionInfo.type} connection: ${connectionId} for gateway: ${gatewayId}`);

    // Set up message handling
    ws.on('message', (data) => handleMessage(ws, data));
    ws.on('close', () => handleDisconnection(ws));
    ws.on('error', (error) => handleError(ws, error));
    ws.on('pong', () => {
      ws.isAlive = true;
      ws.lastPing = new Date();
    });

    // Send connection acknowledgment
    const connectMsg: RelayMessage = {
      type: 'connect',
      connectionId,
      gatewayId,
      timestamp: new Date().toISOString(),
      payload: {
        session_id: connectionId,
        gateway_id: gatewayId,
        connection_type: connectionInfo.type,
        relay_region: config.region,
      }
    };

    sendMessage(ws, connectMsg);

    // Store connection info in Redis for cross-region awareness
    storeConnectionInRedis(connectionInfo).catch(console.error);
  }

  function handleMessage(ws: WebSocketConnection, data: any) {
    try {
      ws.connectionInfo.lastActivity = new Date();
      const session = sessions.get(ws.connectionInfo.gatewayId);
      if (!session) return;

      session.lastActivity = new Date();
      session.messageCount++;
      totalMessageCount++;
      totalBytesTransferred += Buffer.byteLength(data);

      // Parse message - could be JSON or binary data
      let message: any;
      try {
        message = JSON.parse(data.toString());
      } catch {
        // Binary data or non-JSON message, relay as-is
        message = { type: 'binary', data: data.toString('base64') };
      }

      // Route message to appropriate connections
      if (ws.connectionInfo.type === 'mobile') {
        // Mobile -> Gateway: relay to gateway connection
        if (session.gatewayConnection) {
          const gatewayWs = connections.get(session.gatewayConnection.id);
          if (gatewayWs && gatewayWs.readyState === WebSocket.OPEN) {
            gatewayWs.send(data);
          }
        }
      } else {
        // Gateway -> Mobile: relay to all mobile connections
        for (const mobileConnId of session.mobileConnections.keys()) {
          const mobileWs = connections.get(mobileConnId);
          if (mobileWs && mobileWs.readyState === WebSocket.OPEN) {
            mobileWs.send(data);
          }
        }
      }
    } catch (error) {
      console.error('[relay] Message handling error:', error);
      errorCount++;
      handleError(ws, error as Error);
    }
  }

  function handleDisconnection(ws: WebSocketConnection) {
    const { id, gatewayId, type } = ws.connectionInfo;
    console.info(`[relay] Connection disconnected: ${id} (${type}) for gateway: ${gatewayId}`);

    connections.delete(id);

    const session = sessions.get(gatewayId);
    if (session) {
      if (type === 'mobile') {
        session.mobileConnections.delete(id);
      } else {
        session.gatewayConnection = null;
      }

      // Clean up empty sessions
      if (!session.gatewayConnection && session.mobileConnections.size === 0) {
        sessions.delete(gatewayId);
        console.info(`[relay] Session cleaned up: ${gatewayId}`);
      }
    }

    // Remove from Redis
    removeConnectionFromRedis(id).catch(console.error);
  }

  function handleError(ws: WebSocketConnection, error: Error) {
    console.error(`[relay] Connection error for ${ws.connectionInfo.id}:`, error.message);
    errorCount++;

    const errorMsg: RelayMessage = {
      type: 'error',
      connectionId: ws.connectionInfo.id,
      gatewayId: ws.connectionInfo.gatewayId,
      timestamp: new Date().toISOString(),
      payload: {
        error: error.message,
        code: 'RELAY_ERROR'
      }
    };

    sendMessage(ws, errorMsg);
  }

  function sendMessage(ws: WebSocketConnection, message: RelayMessage) {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    } catch (error) {
      console.error('[relay] Failed to send message:', error);
    }
  }

  function determineConnectionType(req: any): 'mobile' | 'gateway' {
    const userAgent = req.headers['user-agent'] || '';

    // OpenClaw mobile apps include specific user agent
    if (userAgent.includes('OpenClawConsole')) {
      return 'mobile';
    }

    // Default to gateway for server connections
    return 'gateway';
  }

  function cleanupStaleConnections() {
    const now = Date.now();
    const timeoutMs = config.connectionTimeoutMs;

    for (const [connectionId, ws] of connections.entries()) {
      if (!ws.isAlive || (now - ws.lastPing.getTime()) > timeoutMs) {
        console.info(`[relay] Terminating stale connection: ${connectionId}`);
        ws.terminate();
        connections.delete(connectionId);
      } else {
        ws.isAlive = false;
        ws.ping();
      }
    }
  }

  async function storeConnectionInRedis(connectionInfo: ConnectionInfo) {
    const key = `relay:connection:${connectionInfo.id}`;
    const data = {
      ...connectionInfo,
      region: config.region,
      connectedAt: connectionInfo.connectedAt.toISOString(),
      lastActivity: connectionInfo.lastActivity.toISOString(),
    };

    await redis.setEx(key, 300, JSON.stringify(data)); // 5 minute TTL
  }

  async function removeConnectionFromRedis(connectionId: string) {
    const key = `relay:connection:${connectionId}`;
    await redis.del(key);
  }

  function getMetrics(): RelayMetrics {
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

    return {
      totalConnections: connections.size,
      activeSessions: sessions.size,
      messagesRelayed: totalMessageCount,
      bytesTransferred: totalBytesTransferred,
      connectionsByRegion: { [config.region]: connections.size },
      averageLatencyMs: 0, // TODO: Implement latency tracking
      errorCount,
    };
  }

  function shutdown() {
    clearInterval(cleanupInterval);

    // Close all connections gracefully
    for (const ws of connections.values()) {
      ws.close(1001, 'Server shutting down');
    }

    connections.clear();
    sessions.clear();
  }

  return {
    getMetrics,
    shutdown,
  };
}