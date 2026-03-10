import { jest } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import nodeFetch from 'node-fetch';
import { StateManager } from '../../src/gateway/state.js';
import { createGatewayServer } from '../../src/gateway/server.js';
import type { GatewayServer } from '../../src/gateway/server.js';
import type { GatewayConfig } from '../../src/config/default.js';
import { RemoteStateManager } from '../../src/skills/remote-client.js';

function makeConfig(tokenStorePath: string): GatewayConfig {
  return {
    port: 0,
    host: '127.0.0.1',
    version: 'test',
    tokenStorePath,
    wsPingInterval: 30_000,
    wsPongTimeout: 10_000,
    approvalTimeoutMs: 1_000,
    requireBiometric: false,
    enabledSkills: [],
    isolatedSkills: [],
    loadSeedData: false,
    simulateBridges: false,
    corsOrigins: '*',
  };
}

async function startGateway(): Promise<{
  gateway: GatewayServer;
  baseUrl: string;
  token: string;
  tempDir: string;
}> {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'openclaw-server-test-'));
  const config = makeConfig(path.join(tempDir, 'tokens.json'));
  const state = new StateManager();
  const gateway = createGatewayServer(config, state);
  await gateway.start();
  const address = gateway.httpServer.address();
  if (!address || typeof address === 'string') {
    throw new Error('Server did not bind to a TCP port');
  }

  const token = gateway.tokenManager.getDefaultDevToken();
  if (!token) {
    throw new Error('Default dev token was not created');
  }

  return {
    gateway,
    baseUrl: `http://127.0.0.1:${address.port}`,
    token,
    tempDir,
  };
}

describe('gateway server hardening', () => {
  test('remote-control returns 503 when the default dev token is unavailable', async () => {
    const { gateway, baseUrl, token, tempDir } = await startGateway();

    try {
      const accessToken = gateway.tokenManager.generate('test-client');
      expect(gateway.tokenManager.revoke(token)).toBe(true);

      const response = await fetch(`${baseUrl}/api/remote-control`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({
        error: { message: 'Default development token is unavailable' },
      });
    } finally {
      await gateway.stop();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('bridges upsert rejects payloads without an id', async () => {
    const { gateway, baseUrl, token, tempDir } = await startGateway();

    try {
      const response = await fetch(`${baseUrl}/api/bridges/upsert`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          agent_id: 'agent-1',
          type: 'codex',
          title: 'Bridge',
          cwd: '/tmp',
          closed: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metadata: {},
        }),
      });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: { message: 'Invalid bridge session payload' },
      });
    } finally {
      await gateway.stop();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('remote API requires bearer auth', async () => {
    const { gateway, baseUrl, tempDir } = await startGateway();

    try {
      const response = await fetch(`${baseUrl}/api/remote/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: 'agent-1',
          title: 'task',
          description: 'desc',
        }),
      });

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({
        error: { message: 'Missing or malformed Authorization header' },
      });
    } finally {
      await gateway.stop();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('billing webhook remains public and receives the raw request body', async () => {
    const { gateway, baseUrl, tempDir } = await startGateway();

    try {
      const response = await fetch(`${baseUrl}/api/billing/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_version: '1.0',
          event: {
            id: 'evt-1',
            type: 'INITIAL_PURCHASE',
            event_timestamp_ms: Date.now(),
            app_id: 'app-1',
            app_user_id: 'user-1',
            original_app_user_id: 'user-1',
            product_id: 'com.openclaw.console.pro.monthly',
            period_type: 'NORMAL',
            purchased_at_ms: Date.now(),
            expiration_at_ms: Date.now() + 1000,
            environment: 'SANDBOX',
            entitlement_ids: ['pro'],
            entitlement_id: 'pro',
            commission_percentage: 0,
            country_code: 'US',
            currency: 'USD',
            price: 9.99,
            price_in_purchased_currency: 9.99,
            subscriber_attributes: {},
            store: 'APP_STORE',
            takehome_percentage: 0,
            tax_percentage: 0,
            transaction_id: 'txn-1',
            original_transaction_id: 'txn-1',
          },
        }),
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ received: true });
    } finally {
      await gateway.stop();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('billing, analytics, and integrations routes require bearer auth', async () => {
    const { gateway, baseUrl, tempDir } = await startGateway();

    try {
      for (const path of [
        '/api/billing/status/test-user',
        '/api/analytics/conversion',
        '/api/integrations/available',
      ]) {
        const response = await fetch(`${baseUrl}${path}`);
        expect(response.status).toBe(401);
        await expect(response.json()).resolves.toMatchObject({
          error: { message: 'Missing or malformed Authorization header' },
        });
      }
    } finally {
      await gateway.stop();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('billing protected routes are rate-limited after authentication', async () => {
    const originalFetch = global.fetch;
    const originalMaxRequests = process.env.BILLING_RATE_LIMIT_MAX_REQUESTS;
    const originalWindowMs = process.env.BILLING_RATE_LIMIT_WINDOW_MS;
    process.env.BILLING_RATE_LIMIT_MAX_REQUESTS = '2';
    process.env.BILLING_RATE_LIMIT_WINDOW_MS = '60000';
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
      text: async () => 'upstream unavailable'
    })) as any;

    const { gateway, baseUrl, token, tempDir } = await startGateway();

    try {
      const request = () => nodeFetch(`${baseUrl}/api/billing/status/rate-limit-user`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      expect((await request()).status).toBe(200);
      expect((await request()).status).toBe(200);

      const limited = await request();
      expect(limited.status).toBe(429);
      await expect(limited.json()).resolves.toMatchObject({
        success: false,
        error: 'Too many requests'
      });
    } finally {
      global.fetch = originalFetch;
      if (originalMaxRequests === undefined) {
        delete process.env.BILLING_RATE_LIMIT_MAX_REQUESTS;
      } else {
        process.env.BILLING_RATE_LIMIT_MAX_REQUESTS = originalMaxRequests;
      }
      if (originalWindowMs === undefined) {
        delete process.env.BILLING_RATE_LIMIT_WINDOW_MS;
      } else {
        process.env.BILLING_RATE_LIMIT_WINDOW_MS = originalWindowMs;
      }
      await gateway.stop();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('remote state client authenticates isolated skill calls', async () => {
    const { gateway, baseUrl, token, tempDir } = await startGateway();

    try {
      const client = new RemoteStateManager(baseUrl, token);
      const task = await client.createTask({
        agent_id: 'agent-remote',
        title: 'remote task',
        description: 'created through remote state manager',
      });

      expect(task.title).toBe('remote task');
      expect(gateway.state.listAllTasks()).toHaveLength(1);
      expect(gateway.state.listAllTasks()[0]?.id).toBe(task.id);
    } finally {
      await gateway.stop();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
