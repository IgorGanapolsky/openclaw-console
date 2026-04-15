import { describe, expect, test } from '@jest/globals';
import DEFAULT_CONFIG from '../src/config/default.js';
import { StateManager } from '../src/gateway/state.js';
import { ApprovalGateSkill } from '../src/skills/approval-gate.js';
import type { Agent } from '../src/types/protocol.js';

function makeAgent(): Agent {
  return {
    id: 'agent-policy',
    name: 'Policy Agent',
    description: 'Policy test agent',
    status: 'online',
    workspace: 'test',
    tags: ['test'],
    last_active: new Date().toISOString(),
    active_tasks: 0,
    pending_approvals: 0,
  };
}

describe('ApprovalGateSkill policy presets', () => {
  test('safe-yolo auto-approves read-only commands without queuing approval', async () => {
    const state = new StateManager();
    await state.upsertAgent(makeAgent());
    const gate = new ApprovalGateSkill(state, {
      ...DEFAULT_CONFIG,
      approvalPolicyPreset: 'safe-yolo',
    });

    const result = await gate.requestApproval({
      agentId: 'agent-policy',
      agentName: 'Policy Agent',
      actionType: 'shell_command',
      title: 'Inspect git status',
      description: 'Read repository status',
      command: 'git status --short',
      context: {
        service: 'git',
        environment: 'development',
        repository: 'IgorGanapolsky/openclaw-console',
        riskLevel: 'high',
      },
    });

    expect(result.approved).toBe(true);
    expect(result.timedOut).toBe(false);
    expect(state.listPendingApprovals()).toHaveLength(0);
    expect(gate.getDecisionLog()[0]?.autoApproved).toBe(true);
  });

  test('manual preset still queues approval requests', async () => {
    const state = new StateManager();
    await state.upsertAgent(makeAgent());
    const gate = new ApprovalGateSkill(state, {
      ...DEFAULT_CONFIG,
      approvalPolicyPreset: 'manual',
    });

    const promise = gate.requestApproval({
      agentId: 'agent-policy',
      agentName: 'Policy Agent',
      actionType: 'shell_command',
      title: 'Run command',
      description: 'Needs approval',
      command: 'git status --short',
      timeoutMs: 10_000,
      context: {
        service: 'git',
        environment: 'development',
        repository: 'IgorGanapolsky/openclaw-console',
        riskLevel: 'high',
      },
    });

    const pending = state.listPendingApprovals();
    expect(pending).toHaveLength(1);
    state.respondToApproval({
      approval_id: pending[0]!.id,
      decision: 'approved',
      biometric_verified: true,
      responded_at: new Date().toISOString(),
    });

    const result = await promise;
    expect(result.approved).toBe(true);
    expect(gate.getDecisionLog()[0]?.autoApproved).toBe(false);
  });
});
