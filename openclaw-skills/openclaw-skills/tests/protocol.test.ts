/**
 * Protocol model tests
 *
 * Validates type serialisation/deserialisation, the WS envelope,
 * and end-to-end flows for approvals, incidents, and tasks.
 */

import { jest } from '@jest/globals';
import { StateManager } from '../src/gateway/state';
import type {
  Agent,
  Task,
  Incident,
  ApprovalRequest,
  ApprovalResponse,
  WebSocketMessage,
  ConnectedPayload,
} from '../src/types/protocol';
import { ERROR_CODES } from '../src/types/protocol';
import { AGENT_IDS } from '../src/config/agents';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent-test-001',
    name: 'Test Agent',
    description: 'A test agent',
    status: 'online',
    workspace: 'test.workspace',
    tags: ['test'],
    last_active: new Date().toISOString(),
    active_tasks: 0,
    pending_approvals: 0,
    ...overrides,
  };
}

// ── Model serialisation ───────────────────────────────────────────────────────

describe('Protocol model serialisation', () => {
  test('Agent round-trips through JSON', () => {
    const agent = makeAgent();
    const json = JSON.stringify(agent);
    const parsed = JSON.parse(json) as Agent;
    expect(parsed.id).toBe(agent.id);
    expect(parsed.status).toBe('online');
    expect(Array.isArray(parsed.tags)).toBe(true);
  });

  test('Agent status values are a closed set', () => {
    const validStatuses: Agent['status'][] = ['online', 'offline', 'busy'];
    for (const s of validStatuses) {
      const a = makeAgent({ status: s });
      const parsed = JSON.parse(JSON.stringify(a)) as Agent;
      expect(parsed.status).toBe(s);
    }
  });

  test('Task serialises steps and links', async () => {
    const state = new StateManager();
    await state.upsertAgent(makeAgent());
    const task = await state.createTask({
      agent_id: 'agent-test-001',
      title: 'Test task',
      description: 'desc',
      links: [{ label: 'PR', url: 'https://github.com/test/pr/1', type: 'github_pr' }],
    });
    await state.addTaskStep({ task_id: task.id, type: 'log', content: 'hello' });

    const json = JSON.stringify(await state.getTask(task.id));
    const parsed = JSON.parse(json) as Task;
    expect(parsed.steps).toHaveLength(1);
    expect(parsed.steps[0]?.type).toBe('log');
    expect(parsed.links).toHaveLength(1);
    expect(parsed.links[0]?.type).toBe('github_pr');
  });

  test('Incident serialises all required fields', async () => {
    const state = new StateManager();
    await state.upsertAgent(makeAgent({ id: AGENT_IDS.GITHUB_OPS, name: 'GitHub Ops' }));
    const incident = await state.createIncident({
      agent_id: AGENT_IDS.GITHUB_OPS,
      agent_name: 'GitHub Ops',
      severity: 'critical',
      title: 'Test incident',
      description: 'Something broke',
    });

    const json = JSON.stringify(incident);
    const parsed = JSON.parse(json) as Incident;
    expect(parsed.severity).toBe('critical');
    expect(parsed.status).toBe('open');
    expect(Array.isArray(parsed.actions)).toBe(true);
    expect(parsed.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('ApprovalRequest serialises context correctly', () => {
    const req: ApprovalRequest = {
      id: 'approval-001',
      agent_id: 'agent-001',
      agent_name: 'Deploy Manager',
      action_type: 'deploy',
      title: 'Deploy v2',
      description: 'Deploy to prod',
      command: 'kubectl apply ...',
      context: {
        service: 'myservice',
        environment: 'production',
        repository: 'myorg/myservice',
        risk_level: 'critical',
      },
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 300_000).toISOString(),
    };

    const parsed = JSON.parse(JSON.stringify(req)) as ApprovalRequest;
    expect(parsed.context.risk_level).toBe('critical');
    expect(parsed.action_type).toBe('deploy');
  });

  test('Error codes are numeric constants', () => {
    expect(ERROR_CODES.INVALID_TOKEN).toBe(1001);
    expect(ERROR_CODES.AGENT_NOT_FOUND).toBe(1002);
    expect(ERROR_CODES.APPROVAL_EXPIRED).toBe(1003);
    expect(ERROR_CODES.APPROVAL_ALREADY_RESPONDED).toBe(1004);
    expect(ERROR_CODES.RATE_LIMITED).toBe(1005);
    expect(ERROR_CODES.GATEWAY_UNAVAILABLE).toBe(1006);
  });
});

// ── WebSocket envelope ────────────────────────────────────────────────────────

describe('WebSocket message envelope', () => {
  test('Envelope wraps payload with type and timestamp', () => {
    const payload: ConnectedPayload = { session_id: 'abc', gateway_version: '1.0.0' };
    const msg: WebSocketMessage<ConnectedPayload> = {
      type: 'connected',
      payload,
      timestamp: new Date().toISOString(),
    };
    const parsed = JSON.parse(JSON.stringify(msg)) as WebSocketMessage<ConnectedPayload>;
    expect(parsed.type).toBe('connected');
    expect(parsed.payload.session_id).toBe('abc');
    expect(parsed.timestamp).toBeTruthy();
  });

  test('Unknown payload field is preserved through JSON round-trip', () => {
    const msg = { type: 'agent_update', payload: { id: 'x', extra: 42 }, timestamp: new Date().toISOString() };
    const parsed = JSON.parse(JSON.stringify(msg)) as typeof msg;
    expect((parsed.payload as Record<string, unknown>)['extra']).toBe(42);
  });
});

// ── Approval flow ─────────────────────────────────────────────────────────────

describe('Approval flow (request → response)', () => {
  test('Approved decision resolves the promise', async () => {
    const state = new StateManager();
    state.upsertAgent(makeAgent({ id: 'agent-a' }));

    const req: ApprovalRequest = {
      id: 'appr-001',
      agent_id: 'agent-a',
      agent_name: 'Test Agent',
      action_type: 'shell_command',
      title: 'Run command',
      description: 'test',
      command: 'echo hello',
      context: { service: 'svc', environment: 'staging', repository: 'org/repo', risk_level: 'high' },
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    };

    const promise = state.queueApproval(req, 10_000);

    // Simulate immediate response
    const response: ApprovalResponse = {
      approval_id: 'appr-001',
      decision: 'approved',
      biometric_verified: true,
      responded_at: new Date().toISOString(),
    };
    state.respondToApproval(response);

    const result = await promise;
    expect(result.decision).toBe('approved');
    expect(result.biometric_verified).toBe(true);
  });

  test('Denied decision still resolves (not rejects)', async () => {
    const state = new StateManager();
    state.upsertAgent(makeAgent({ id: 'agent-b' }));

    const req: ApprovalRequest = {
      id: 'appr-002',
      agent_id: 'agent-b',
      agent_name: 'Test Agent',
      action_type: 'deploy',
      title: 'Deploy',
      description: 'test',
      command: 'kubectl ...',
      context: { service: 's', environment: 'prod', repository: 'r', risk_level: 'critical' },
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    };

    const promise = state.queueApproval(req, 10_000);
    state.respondToApproval({
      approval_id: 'appr-002',
      decision: 'denied',
      biometric_verified: false,
      responded_at: new Date().toISOString(),
    });

    const result = await promise;
    expect(result.decision).toBe('denied');
  });

  test('Approval times out and rejects', async () => {
    const state = new StateManager();
    state.upsertAgent(makeAgent({ id: 'agent-c' }));

    const req: ApprovalRequest = {
      id: 'appr-003',
      agent_id: 'agent-c',
      agent_name: 'Test Agent',
      action_type: 'config_change',
      title: 'Config',
      description: 'test',
      command: 'change x=y',
      context: { service: 's', environment: 'prod', repository: 'r', risk_level: 'high' },
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 50).toISOString(),
    };

    await expect(state.queueApproval(req, 50)).rejects.toThrow('expired');
  });

  test('Responding to non-existent approval returns null', () => {
    const state = new StateManager();
    const result = state.respondToApproval({
      approval_id: 'does-not-exist',
      decision: 'approved',
      biometric_verified: true,
      responded_at: new Date().toISOString(),
    });
    expect(result).toBeNull();
  });
});

// ── Incident lifecycle ────────────────────────────────────────────────────────

describe('Incident lifecycle (create → acknowledge → resolve)', () => {
  async function createState(): Promise<StateManager> {
    const s = new StateManager();
    await s.upsertAgent(makeAgent({ id: 'agent-d', name: 'Ops Agent' }));
    return s;
  }

  test('Incident created with status open', async () => {
    const state = await createState();
    const i = await state.createIncident({
      agent_id: 'agent-d',
      agent_name: 'Ops Agent',
      severity: 'warning',
      title: 'Test',
      description: 'desc',
    });
    expect(i.status).toBe('open');
    expect(i.id).toBeTruthy();
  });

  test('Acknowledge transitions to acknowledged', async () => {
    const state = await createState();
    const i = await state.createIncident({ agent_id: 'agent-d', agent_name: 'Ops Agent', severity: 'info', title: 'T', description: 'd' });
    const updated = await state.updateIncidentStatus(i.id, 'acknowledged');
    expect(updated?.status).toBe('acknowledged');
  });

  test('Resolve transitions to resolved', async () => {
    const state = await createState();
    const i = await state.createIncident({ agent_id: 'agent-d', agent_name: 'Ops Agent', severity: 'critical', title: 'T', description: 'd' });
    await state.updateIncidentStatus(i.id, 'acknowledged');
    const resolved = await state.updateIncidentStatus(i.id, 'resolved');
    expect(resolved?.status).toBe('resolved');
    expect(resolved?.updated_at).toBeTruthy();
  });

  test('Updating non-existent incident returns null', async () => {
    const state = await createState();
    expect(await state.updateIncidentStatus('fake-id', 'resolved')).toBeNull();
  });

  test('incident_created event fires', async () => {
    const state = await createState();
    const handler = jest.fn();
    state.events.on('incident_created', handler);
    await state.createIncident({ agent_id: 'agent-d', agent_name: 'Ops Agent', severity: 'info', title: 'T', description: 'd' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('incident_updated event fires on status change', async () => {
    const state = await createState();
    const handler = jest.fn();
    const i = await state.createIncident({ agent_id: 'agent-d', agent_name: 'Ops Agent', severity: 'info', title: 'T', description: 'd' });
    state.events.on('incident_updated', handler);
    await state.updateIncidentStatus(i.id, 'acknowledged');
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

// ── Task lifecycle ────────────────────────────────────────────────────────────

describe('Task lifecycle (create → steps → complete)', () => {
  async function createState(): Promise<StateManager> {
    const s = new StateManager();
    await s.upsertAgent(makeAgent({ id: 'agent-e', name: 'Task Agent' }));
    return s;
  }

  test('Task created with queued status', async () => {
    const state = await createState();
    const t = await state.createTask({ agent_id: 'agent-e', title: 'Test task', description: 'desc' });
    expect(t.status).toBe('queued');
    expect(t.steps).toHaveLength(0);
    expect(t.links).toHaveLength(0);
  });

  test('Status transitions: queued → running → done', async () => {
    const state = await createState();
    const t = await state.createTask({ agent_id: 'agent-e', title: 'T', description: 'd' });
    await state.updateTaskStatus(t.id, 'running');
    await state.updateTaskStatus(t.id, 'done');
    const task = await state.getTask(t.id);
    expect(task?.status).toBe('done');
  });

  test('Steps are appended in order', async () => {
    const state = await createState();
    const t = await state.createTask({ agent_id: 'agent-e', title: 'T', description: 'd' });
    await state.addTaskStep({ task_id: t.id, type: 'log', content: 'step 1' });
    await state.addTaskStep({ task_id: t.id, type: 'tool_call', content: 'step 2' });
    await state.addTaskStep({ task_id: t.id, type: 'output', content: 'step 3' });

    const task = await state.getTask(t.id);
    expect(task?.steps).toHaveLength(3);
    expect(task?.steps[0]?.content).toBe('step 1');
    expect(task?.steps[2]?.content).toBe('step 3');
  });

  test('Step metadata is stored', async () => {
    const state = await createState();
    const t = await state.createTask({ agent_id: 'agent-e', title: 'T', description: 'd' });
    const step = await state.addTaskStep({ task_id: t.id, type: 'tool_call', content: 'tool', metadata: { tool: 'git', args: { ref: 'main' } } });
    expect((step?.metadata as Record<string, unknown>)?.['tool']).toBe('git');
  });

  test('task_created event fires', async () => {
    const state = await createState();
    const handler = jest.fn();
    state.events.on('task_created', handler);
    await state.createTask({ agent_id: 'agent-e', title: 'T', description: 'd' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('task_step_added event fires', async () => {
    const state = await createState();
    const t = await state.createTask({ agent_id: 'agent-e', title: 'T', description: 'd' });
    const handler = jest.fn();
    state.events.on('task_step_added', handler);
    await state.addTaskStep({ task_id: t.id, type: 'log', content: 'hello' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('agent active_tasks counter updates', async () => {
    const state = await createState();
    await state.createTask({ agent_id: 'agent-e', title: 'T1', description: 'd' });
    const t2 = await state.createTask({ agent_id: 'agent-e', title: 'T2', description: 'd' });
    // Both queued — count should be 2
    expect(state.getAgent('agent-e')?.active_tasks).toBe(2);
    await state.updateTaskStatus(t2.id, 'done');
    expect(state.getAgent('agent-e')?.active_tasks).toBe(1);
  });
});

// ── Bridge Session management ──────────────────────────────────────────────────

describe('Bridge Session management', () => {
  test('Bridge session creation and update', async () => {
    const state = new StateManager();
    const sessionId = 'bridge-001';
    
    const handlerNew = jest.fn();
    const handlerUpdate = jest.fn();
    state.events.on('bridge_session_new', handlerNew);
    state.events.on('bridge_session_update', handlerUpdate);

    const session = {
      id: sessionId,
      agent_id: 'agent-a',
      type: 'codex' as const,
      title: 'Codex Bridge',
      cwd: '/path/to/project',
      closed: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: {},
    };

    await state.upsertBridgeSession(session);
    expect(handlerNew).toHaveBeenCalledTimes(1);
    expect(state.listBridgeSessions()).toHaveLength(1);

    // Update
    const updated = { ...session, title: 'Updated Title' };
    await state.upsertBridgeSession(updated);
    expect(handlerUpdate).toHaveBeenCalledTimes(1);
    expect(state.listBridgeSessions()[0]?.title).toBe('Updated Title');
  });
});
