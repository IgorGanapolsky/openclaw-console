import { describe, expect, test } from '@jest/globals';
import { normalizeProjectBridgeSession } from '../src/gateway/project-session.js';
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
});
