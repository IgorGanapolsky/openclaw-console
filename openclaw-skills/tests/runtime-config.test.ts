import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from '@jest/globals';
import DEFAULT_CONFIG from '../src/config/default.js';
import { StateManager } from '../src/gateway/state.js';
import { createGatewayServer, type GatewayServer } from '../src/gateway/server.js';
import type { GatewayConfig } from '../src/config/default.js';

const servers: GatewayServer[] = [];

afterEach(async () => {
  while (servers.length > 0) {
    await servers.pop()?.stop();
  }
});

function tempConfig(overrides: Partial<GatewayConfig> = {}): GatewayConfig {
  return {
    ...DEFAULT_CONFIG,
    host: '127.0.0.1',
    port: 0,
    tokenStorePath: path.join(os.tmpdir(), `openclaw-runtime-config-${Date.now()}-${Math.random().toString(36).slice(2)}.json`),
    loadSeedData: false,
    simulateBridges: false,
    ...overrides,
  };
}

async function start(config: GatewayConfig): Promise<{ server: GatewayServer; baseUrl: string; token: string }> {
  const server = createGatewayServer(config, new StateManager());
  servers.push(server);
  await server.start();
  const address = server.httpServer.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected TCP server address');
  }
  const token = server.tokenManager.getDefaultDevToken();
  if (!token) {
    throw new Error('Expected default dev token');
  }
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
    token,
  };
}

describe('runtime config API', () => {
  test('updates approval policy and heartbeat interval at runtime', async () => {
    const config = tempConfig({ approvalPolicyPreset: 'manual', heartbeatIntervalMs: 10_000 });
    const { baseUrl, token } = await start(config);

    const response = await fetch(`${baseUrl}/api/config/runtime`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        approval_policy_preset: 'repo-yolo',
        heartbeat_interval_ms: 1_000,
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(body['approval_policy_preset']).toBe('repo-yolo');
    expect(body['heartbeat_interval_ms']).toBe(1_000);
    expect(config.approvalPolicyPreset).toBe('repo-yolo');
    expect(config.heartbeatIntervalMs).toBe(1_000);

    fs.rmSync(config.tokenStorePath, { force: true });
  });

  test('rejects invalid approval presets', async () => {
    const config = tempConfig();
    const { baseUrl, token } = await start(config);

    const response = await fetch(`${baseUrl}/api/config/runtime`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ approval_policy_preset: 'blind-yolo' }),
    });

    expect(response.status).toBe(400);
    expect(config.approvalPolicyPreset).toBe(DEFAULT_CONFIG.approvalPolicyPreset);

    fs.rmSync(config.tokenStorePath, { force: true });
  });
});
