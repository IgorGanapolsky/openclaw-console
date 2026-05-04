import { describe, expect, test } from '@jest/globals';
import { applyBridgeSessionControl, normalizeProjectBridgeSession } from '../src/gateway/project-session.js';
import type { BridgeSession } from '../src/types/protocol.js';

function bridge(overrides: Partial<BridgeSession> = {}): BridgeSession {
  const now = new Date().toISOString();
  return {
    id: 'openclaw-tui',
    agent_id: 'agent-main',
    type: 'terminal',
    title: 'OpenClaw TUI',
    cwd: '/Users/test/work/repo-a',
    closed: false,
    created_at: now,
    updated_at: now,
    metadata: {},
    ...overrides,
  };
}

describe('project-scoped bridge sessions', () => {
  test('derives stable project session id from cwd', () => {
    const first = normalizeProjectBridgeSession(bridge());
    const second = normalizeProjectBridgeSession(bridge({ id: 'another-global-id' }));

    expect(first.id).toMatch(/^project:repo-a:[a-f0-9]{10}$/);
    expect(second.id).toBe(first.id);
    expect(first.metadata['original_session_id']).toBe('openclaw-tui');
    expect(first.metadata['project_name']).toBe('repo-a');
    expect(first.metadata['session_scope']).toBe('project');
  });

  test('uses different sessions for different projects', () => {
    const repoA = normalizeProjectBridgeSession(bridge({ cwd: '/Users/test/work/repo-a' }));
    const repoB = normalizeProjectBridgeSession(bridge({ cwd: '/Users/test/work/repo-b' }));

    expect(repoA.id).not.toBe(repoB.id);
    expect(repoB.metadata['project_name']).toBe('repo-b');
  });

  test('tracks background agent lifecycle controls', () => {
    const session = normalizeProjectBridgeSession(bridge({
      type: 'background_agent',
      execution: {
        provider: 'vercel_open_agents',
        workflow_id: 'wf_123',
        sandbox_id: 'sbx_123',
        sandbox_state: 'running',
        repository: 'IgorGanapolsky/openclaw-console',
        branch: 'feat/background-agent',
      },
    }));

    const paused = applyBridgeSessionControl(session, 'pause', { actor: 'human' });
    expect(paused.lifecycle).toBe('paused');
    expect(paused.execution?.sandbox_state).toBe('paused');
    expect(paused.controls?.can_resume).toBe(true);

    const shared = applyBridgeSessionControl(paused, 'share_readonly', {
      actor: 'human',
      readOnlyShareUrl: 'https://example.com/share/session',
    });
    expect(shared.execution?.read_only_share_url).toBe('https://example.com/share/session');

    const cancelled = applyBridgeSessionControl(shared, 'cancel', { actor: 'human' });
    expect(cancelled.closed).toBe(true);
    expect(cancelled.lifecycle).toBe('cancelled');
    expect(cancelled.controls?.can_cancel).toBe(false);
  });
});
