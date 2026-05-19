/**
 * OpenClaw QR Code Generation Service
 *
 * Provides QR code generation and tunnel management APIs for mobile apps.
 * Supports gateway pairing, tunnel setup, and connection management.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import { createClient } from 'redis';
import type { Request, Response } from 'express';

const app = express();
const port = parseInt(process.env.PORT || '8080', 10);

// Redis client for caching and session management
const redis = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

// Connect to Redis
redis.connect().catch(console.error);

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['*'],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

app.use(limiter);
app.use(express.json({ limit: '10mb' }));

// Types
interface GatewayConnectionInfo {
  version: string;
  gatewayId: string;
  name: string;
  capabilities: string[];
  endpoints: ConnectionEndpoint[];
  security: GatewaySecurityInfo;
  expiresAt: number;
  metadata: Record<string, string>;
}

interface ConnectionEndpoint {
  type: 'LOCAL' | 'MESH' | 'TUNNEL' | 'RELAY';
  url: string;
  security: 'DEVICE_ONLY' | 'ACCOUNT_SCOPED' | 'PUBLIC';
  priority: number;
  expectedLatencyMs: number;
  description: string;
}

interface GatewaySecurityInfo {
  deviceCertificate?: string;
  expectedFingerprint: string;
  requiresBiometric: boolean;
  authToken?: string;
}

interface TunnelConfig {
  id: string;
  gatewayId: string;
  localPort: number;
  remoteHost: string;
  remotePort: number;
  protocol: 'tcp' | 'udp' | 'http' | 'https';
  encryption: boolean;
  compression: boolean;
  expiresAt: number;
}

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'openclaw-qr-service',
    version: '1.0.0'
  });
});

// Generate QR code for gateway connection
app.post('/api/qr/gateway', async (req: Request, res: Response) => {
  try {
    const {
      gatewayId,
      name,
      baseUrl,
      authToken,
      capabilities = ['approvals', 'chat', 'monitoring'],
      expirationMinutes = 60
    } = req.body;

    if (!gatewayId || !name || !baseUrl) {
      return res.status(400).json({
        error: 'Missing required fields: gatewayId, name, baseUrl'
      });
    }

    // Create connection info with multiple endpoints
    const connectionInfo: GatewayConnectionInfo = {
      version: '2026.1',
      gatewayId,
      name,
      capabilities,
      endpoints: [
        {
          type: 'LOCAL',
          url: baseUrl,
          security: 'DEVICE_ONLY',
          priority: 1,
          expectedLatencyMs: 5,
          description: 'Local network (fastest)'
        },
        {
          type: 'TUNNEL',
          url: `https://tunnel.openclaw.com/${gatewayId}`,
          security: 'ACCOUNT_SCOPED',
          priority: 3,
          expectedLatencyMs: 50,
          description: 'Internet tunnel'
        },
        {
          type: 'RELAY',
          url: `wss://relay.openclaw.com/${gatewayId}`,
          security: 'PUBLIC',
          priority: 4,
          expectedLatencyMs: 100,
          description: 'Global relay (always works)'
        }
      ],
      security: {
        expectedFingerprint: generateFingerprint(baseUrl + gatewayId),
        requiresBiometric: true,
        authToken
      },
      expiresAt: Date.now() + (expirationMinutes * 60 * 1000),
      metadata: {
        createdAt: new Date().toISOString(),
        createdBy: req.ip || 'unknown',
        environment: process.env.NODE_ENV || 'production'
      }
    };

    // Store in Redis for verification
    const cacheKey = `qr:gateway:${gatewayId}`;
    await redis.setEx(cacheKey, expirationMinutes * 60, JSON.stringify(connectionInfo));

    // Generate QR code
    const qrContent = JSON.stringify(connectionInfo);
    const qrCodeDataURL = await QRCode.toDataURL(qrContent, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      quality: 0.92,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      width: 512
    });

    res.json({
      qrCode: qrCodeDataURL,
      connectionInfo,
      pairingUrl: `openclaw://pair?data=${encodeURIComponent(qrContent)}`,
      expiresAt: connectionInfo.expiresAt,
      endpoints: connectionInfo.endpoints.map(endpoint => ({
        type: endpoint.type,
        url: endpoint.url,
        priority: endpoint.priority,
        description: endpoint.description
      }))
    });

  } catch (error) {
    console.error('QR generation error:', error);
    res.status(500).json({
      error: 'Failed to generate QR code',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Generate QR code for tunnel configuration
app.post('/api/qr/tunnel', async (req: Request, res: Response) => {
  try {
    const {
      gatewayId,
      localPort,
      remoteHost = 'localhost',
      remotePort,
      protocol = 'tcp',
      encryption = true,
      compression = false,
      expirationMinutes = 30
    } = req.body;

    if (!gatewayId || !localPort || !remotePort) {
      return res.status(400).json({
        error: 'Missing required fields: gatewayId, localPort, remotePort'
      });
    }

    const tunnelConfig: TunnelConfig = {
      id: uuidv4(),
      gatewayId,
      localPort,
      remoteHost,
      remotePort,
      protocol,
      encryption,
      compression,
      expiresAt: Date.now() + (expirationMinutes * 60 * 1000)
    };

    // Store tunnel config in Redis
    const cacheKey = `tunnel:${tunnelConfig.id}`;
    await redis.setEx(cacheKey, expirationMinutes * 60, JSON.stringify(tunnelConfig));

    // Generate QR code for tunnel setup
    const qrContent = JSON.stringify({
      type: 'tunnel',
      config: tunnelConfig
    });

    const qrCodeDataURL = await QRCode.toDataURL(qrContent, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      quality: 0.92,
      margin: 1,
      width: 256
    });

    res.json({
      qrCode: qrCodeDataURL,
      tunnelConfig,
      tunnelUrl: `openclaw://tunnel?config=${encodeURIComponent(qrContent)}`,
      expiresAt: tunnelConfig.expiresAt
    });

  } catch (error) {
    console.error('Tunnel QR generation error:', error);
    res.status(500).json({
      error: 'Failed to generate tunnel QR code',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Verify QR code data
app.post('/api/qr/verify', async (req: Request, res: Response) => {
  try {
    const { gatewayId, type = 'gateway' } = req.body;

    if (!gatewayId) {
      return res.status(400).json({ error: 'gatewayId is required' });
    }

    const cacheKey = `qr:${type}:${gatewayId}`;
    const cachedData = await redis.get(cacheKey);

    if (!cachedData) {
      return res.status(404).json({
        error: 'QR code data not found or expired'
      });
    }

    const data = JSON.parse(cachedData);

    res.json({
      valid: true,
      data,
      expiresAt: data.expiresAt,
      timeRemaining: Math.max(0, data.expiresAt - Date.now())
    });

  } catch (error) {
    console.error('QR verification error:', error);
    res.status(500).json({
      error: 'Failed to verify QR code',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get available relay endpoints
app.get('/api/relay/endpoints', async (req: Request, res: Response) => {
  try {
    // Return available relay endpoints with health status
    const endpoints = [
      {
        region: 'us-central1',
        url: 'wss://relay.openclaw.com',
        location: 'North America Central',
        latency: 50,
        status: 'healthy'
      },
      {
        region: 'us-east1',
        url: 'wss://us-east1-relay.openclaw.com',
        location: 'North America East',
        latency: 45,
        status: 'healthy'
      },
      {
        region: 'europe-west1',
        url: 'wss://eu-relay.openclaw.com',
        location: 'Europe West',
        latency: 80,
        status: 'healthy'
      },
      {
        region: 'asia-east1',
        url: 'wss://asia-relay.openclaw.com',
        location: 'Asia East',
        latency: 120,
        status: 'healthy'
      }
    ];

    res.json({
      endpoints,
      recommendedEndpoint: endpoints[0], // Could implement latency-based selection
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Endpoints fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch relay endpoints',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Tunnel management endpoints
app.get('/api/tunnels/:gatewayId', async (req: Request, res: Response) => {
  try {
    const { gatewayId } = req.params;

    // Get all active tunnels for the gateway
    const pattern = `tunnel:*`;
    const keys = await redis.keys(pattern);
    const tunnels = [];

    for (const key of keys) {
      const tunnelData = await redis.get(key);
      if (tunnelData) {
        const tunnel = JSON.parse(tunnelData);
        if (tunnel.gatewayId === gatewayId && tunnel.expiresAt > Date.now()) {
          tunnels.push(tunnel);
        }
      }
    }

    res.json({
      tunnels,
      count: tunnels.length,
      gatewayId
    });

  } catch (error) {
    console.error('Tunnel fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch tunnels',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Delete tunnel
app.delete('/api/tunnels/:tunnelId', async (req: Request, res: Response) => {
  try {
    const { tunnelId } = req.params;
    const cacheKey = `tunnel:${tunnelId}`;

    const result = await redis.del(cacheKey);
    if (result === 0) {
      return res.status(404).json({ error: 'Tunnel not found' });
    }

    res.json({
      success: true,
      message: 'Tunnel deleted successfully',
      tunnelId
    });

  } catch (error) {
    console.error('Tunnel deletion error:', error);
    res.status(500).json({
      error: 'Failed to delete tunnel',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Utility function to generate a simple fingerprint
function generateFingerprint(input: string): string {
  // Simple hash function for demonstration
  // In production, use proper cryptographic hashing
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16);
}

// Error handling middleware
app.use((error: Error, req: Request, res: Response, next: any) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
    method: req.method
  });
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`OpenClaw QR Service listening on port ${port}`);
  console.log(`Health check: http://localhost:${port}/health`);
  console.log(`Environment: ${process.env.NODE_ENV || 'production'}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await redis.quit();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await redis.quit();
  process.exit(0);
});