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

async function start(
  config: GatewayConfig,
  state: StateManager = new StateManager(),
): Promise<{ server: GatewayServer; baseUrl: string; token: string; state: StateManager }> {
  const server = createGatewayServer(config, state);
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
    state,
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
        response_profile: 'claude-code',
        response_verbosity: 'terse',
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(body['approval_policy_preset']).toBe('repo-yolo');
    expect(body['heartbeat_interval_ms']).toBe(1_000);
    expect(body['response_profile']).toBe('claude-code');
    expect(body['response_verbosity']).toBe('terse');
    expect(config.approvalPolicyPreset).toBe('repo-yolo');
    expect(config.heartbeatIntervalMs).toBe(1_000);
    expect(config.responseProfile).toBe('claude-code');
    expect(config.responseVerbosity).toBe('terse');

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

  test('rejects invalid response settings', async () => {
    const config = tempConfig();
    const { baseUrl, token } = await start(config);

    const response = await fetch(`${baseUrl}/api/config/runtime`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ response_profile: 'essay-mode' }),
    });

    expect(response.status).toBe(400);
    expect(config.responseProfile).toBe(DEFAULT_CONFIG.responseProfile);

    fs.rmSync(config.tokenStorePath, { force: true });
  });

  test('returns authenticated governance state for an agent', async () => {
    const config = tempConfig();
    const state = new StateManager();
    await state.upsertAgent({
      id: 'agent-http-governance',
      name: 'HTTP Governance Agent',
      description: 'Test agent',
      status: 'online',
      workspace: 'test',
      tags: ['test'],
      last_active: new Date().toISOString(),
      active_tasks: 0,
      pending_approvals: 0,
    });
    await state.updateAgentObjective('agent-http-governance', 'Verify governance endpoint', 'gateway');
    const { baseUrl, token } = await start(config, state);

    const response = await fetch(`${baseUrl}/api/agents/agent-http-governance/governance`, {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(body['current_objective']).toBe('Verify governance endpoint');
    expect(Array.isArray(body['events'])).toBe(true);

    fs.rmSync(config.tokenStorePath, { force: true });
  });

  test('exposes supply-chain assessment and secret inventory APIs', async () => {
    process.env['OPENCLAW_TEST_SECRET_KEY'] = 'hidden-runtime-test-value';
    const config = tempConfig();
    const { baseUrl, token } = await start(config);

    const assessResponse = await fetch(`${baseUrl}/api/security/supply-chain/assess`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ command: 'docker run --rm untrusted/image:latest' }),
    });

    expect(assessResponse.status).toBe(200);
    const assessBody = await assessResponse.json() as Record<string, unknown>;
    expect(assessBody['detected']).toBe(true);

    const commerceResponse = await fetch(`${baseUrl}/api/security/agent-commerce/assess`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        command: 'stripe projects add cloudflare/registrar:domain openclaw.dev',
        estimated_monthly_usd: 12,
        monthly_budget_limit_usd: 10,
      }),
    });

    expect(commerceResponse.status).toBe(200);
    const commerceBody = await commerceResponse.json() as Record<string, unknown>;
    expect(commerceBody['detected']).toBe(true);
    expect(JSON.stringify(commerceBody)).toContain('domain_registration');

    const inventoryResponse = await fetch(`${baseUrl}/api/security/secret-inventory`, {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(inventoryResponse.status).toBe(200);
    const inventoryBody = await inventoryResponse.json() as Record<string, unknown>;
    expect(JSON.stringify(inventoryBody)).toContain('OPENCLAW_TEST_SECRET_KEY');
    expect(JSON.stringify(inventoryBody)).not.toContain('hidden-runtime-test-value');

    delete process.env['OPENCLAW_TEST_SECRET_KEY'];
    fs.rmSync(config.tokenStorePath, { force: true });
  });

  test('registers skill workflow systems for orchestrator skills', async () => {
    const config = tempConfig();
    const state = new StateManager();
    await state.upsertAgent({
      id: 'agent-skill-workflow',
      name: 'Skill Workflow Agent',
      description: 'Test agent',
      status: 'online',
      workspace: 'test',
      tags: ['test'],
      last_active: new Date().toISOString(),
      active_tasks: 0,
      pending_approvals: 0,
    });
    const { baseUrl, token } = await start(config, state);

    const response = await fetch(`${baseUrl}/api/skill-workflows/upsert`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        agent_id: 'agent-skill-workflow',
        name: 'Research orchestrator',
        trigger_prompt: 'Research and implement high-ROI items',
        steps: [
          {
            skill_name: 'source-reader',
            input_requirements: ['url'],
            output_contract: ['verified source notes'],
            produces: ['source_notes'],
          },
          {
            skill_name: 'implementation-planner',
            consumes_from: ['source_notes'],
            input_requirements: ['source_notes'],
            output_contract: ['ranked implementation plan'],
            produces: ['implementation_plan'],
          },
        ],
        checkpoints: [
          {
            title: 'Approve implementation plan',
            after_step_id: 'step-2',
            required: true,
          },
        ],
        artifacts: [
          {
            label: 'Plan markdown',
            type: 'markdown',
            path: 'docs/plan.md',
          },
        ],
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(JSON.stringify(body)).toContain('Research orchestrator');
    expect(JSON.stringify(body)).toContain('ordered_step_ids');

    const listResponse = await fetch(`${baseUrl}/api/skill-workflows?agent_id=agent-skill-workflow`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(listResponse.status).toBe(200);
    const listBody = await listResponse.json() as unknown[];
    expect(listBody).toHaveLength(1);

    fs.rmSync(config.tokenStorePath, { force: true });
  });
});
