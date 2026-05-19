/**
 * Redis client configuration for the OpenClaw Relay Service
 */

import { createClient } from 'redis';
import type { RedisClientType } from 'redis';

export function createRedisClient(url: string): RedisClientType {
  const client = createClient({
    url,
    socket: {
      reconnectStrategy: (retries) => {
        if (retries > 20) {
          console.error('[redis] Too many reconnection attempts, giving up');
          return new Error('Too many reconnection attempts');
        }
        const delay = Math.min(retries * 50, 500); // Max 500ms delay
        console.info(`[redis] Reconnecting in ${delay}ms (attempt ${retries})`);
        return delay;
      },
      connectTimeout: 5000,
      commandTimeout: 5000,
    },
    retryDelayOnFailover: 100,
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
  });

  client.on('connect', () => {
    console.info('[redis] Connected to Redis server');
  });

  client.on('ready', () => {
    console.info('[redis] Redis client ready');
  });

  client.on('error', (err) => {
    console.error('[redis] Redis client error:', err);
  });

  client.on('end', () => {
    console.info('[redis] Redis connection closed');
  });

  client.on('reconnecting', () => {
    console.info('[redis] Reconnecting to Redis server');
  });

  // Connect immediately
  client.connect().catch((err) => {
    console.error('[redis] Failed to connect to Redis:', err);
    process.exit(1);
  });

  return client;
}