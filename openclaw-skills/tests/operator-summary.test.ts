import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from '@jest/globals';
import DEFAULT_CONFIG from '../src/config/default.js';
import { StateManager } from '../src/gateway/state.js';
import { createGatewayServer, type GatewayServer } from '../src/gateway/server.js';
import type { GatewayConfig, ApprovalPolicyPreset } from '../src/config/default.js';
import type { ApprovalRequest, BridgeSession, OperatorSummaryResponse } from '../src/types/protocol.js';

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
    tokenStorePath: path.join(os.tmpdir(), `openclaw-operator-summary-${Date.now()}-${Math.random().toString(36).slice(2)}.json`),
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

function approvalRequest(agentId: string, agentName: string): ApprovalRequest {
  const createdAt = new Date(Date.now() - 2 * 60_000).toISOString();
  return {
    id: 'approval-1',
    agent_id: agentId,
    agent_name: agentName,
    action_type: 'deploy',
    title: 'Approve production deploy',
    description: 'Ship the hotfix',
    command: 'deploy --env production',
    context: {
      service: 'openclaw-console',
      environment: 'production',
      repository: 'IgorGanapolsky/openclaw-console',
      risk_level: 'critical',
    },
    created_at: createdAt,
    expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
  };
}

function bridgeSession(agentId: string): BridgeSession {
  return {
    id: 'bridge-1',
    agent_id: agentId,
    type: 'codex',
    title: 'Codex Session',
    cwd: '/workspace/openclaw-console',
    closed: false,
    created_at: new Date(Date.now() - 30 * 60_000).toISOString(),
    updated_at: new Date(Date.now() - 20 * 60_000).toISOString(),
    metadata: {},
  };
}

async function seedSummaryState(state: StateManager): Promise<{ approvalId: string }> {
  await state.upsertAgent({
    id: 'agent-1',
    name: 'Gateway Agent',
    description: 'Handles releases',
    status: 'busy',
    workspace: '/workspace/openclaw-console',
    tags: ['release'],
    last_active: new Date(Date.now() - 5 * 60_000).toISOString(),
    active_tasks: 0,
    pending_approvals: 0,
    git_state: {
      repository_url: 'https://github.com/IgorGanapolsky/openclaw-console',
      current_branch: 'develop',
      current_commit: '6397ccd',
      uncommitted_changes: 2,
      ahead_by: 1,
      behind_by: 0,
      last_sync: new Date().toISOString(),
    },
  });

  await state.upsertAgent({
    id: 'agent-2',
    name: 'Offline Agent',
    description: 'Needs attention',
    status: 'offline',
    workspace: '/workspace/other',
    tags: ['stale'],
    last_active: new Date(Date.now() - 30 * 60_000).toISOString(),
    active_tasks: 0,
    pending_approvals: 0,
  });

  const runningTask = await state.createTask({
    agent_id: 'agent-1',
    title: 'Release candidate',
    description: 'Build and validate artifacts',
  });
  await state.updateTaskStatus(runningTask.id, 'running');
  await state.addTaskStep({
    task_id: runningTask.id,
    type: 'info',
    content: 'Artifacts staged for review',
  });

  const failedTask = await state.createTask({
    agent_id: 'agent-2',
    title: 'Broken sync',
    description: 'Sync failed',
  });
  await state.updateTaskStatus(failedTask.id, 'failed');
  await state.addTaskStep({
    task_id: failedTask.id,
    type: 'error',
    content: 'Git fetch failed on stale credentials',
  });

  await state.createIncident({
    agent_id: 'agent-2',
    agent_name: 'Offline Agent',
    severity: 'critical',
    title: 'Distribution stalled',
    description: 'TestFlight upload blocked',
  });

  const pendingApproval = approvalRequest('agent-1', 'Gateway Agent');
  void state.queueApproval(pendingApproval, 60 * 60 * 1000);
  await state.upsertBridgeSession(bridgeSession('agent-1'));
  return { approvalId: pendingApproval.id };
}

describe('dashboard operator summary API', () => {
  test('returns a compact, authenticated operator summary', async () => {
    const config = tempConfig({ approvalPolicyPreset: 'manual' as ApprovalPolicyPreset });
    const state = new StateManager();
    const seeded = await seedSummaryState(state);
    const { baseUrl, token } = await start(config, state);

    const response = await fetch(`${baseUrl}/api/dashboard/summary?limit=3`, {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    const body = await response.json() as OperatorSummaryResponse;

    expect(body.headline).toContain('critical incident');
    expect(body.counts.incidents_critical).toBe(1);
    expect(body.counts.approvals_pending).toBe(1);
    expect(body.counts.tasks_failed).toBe(1);
    expect(body.counts.bridges_stale).toBe(1);
    expect(body.summary_lines).toContain('1 critical incident open');
    expect(body.needs_attention).toContain('1 pending approval');
    expect(body.tasks[0]?.status).toBe('failed');
    expect(body.incidents[0]?.severity).toBe('critical');
    expect(body.approvals[0]?.risk_level).toBe('critical');
    expect(body.bridges[0]?.stale).toBe(true);
    expect(body.agents[0]?.name).toBe('Offline Agent');

    state.respondToApproval({
      approval_id: seeded.approvalId,
      decision: 'approved',
      biometric_verified: true,
      responded_at: new Date().toISOString(),
    });

    fs.rmSync(config.tokenStorePath, { force: true });
  });

  test('requires auth for operator summary', async () => {
    const config = tempConfig();
    const { baseUrl } = await start(config);

    const response = await fetch(`${baseUrl}/api/dashboard/summary`);

    expect(response.status).toBe(401);
    fs.rmSync(config.tokenStorePath, { force: true });
  });
});
