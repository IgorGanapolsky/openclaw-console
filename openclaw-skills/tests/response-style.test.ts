import { describe, expect, test } from '@jest/globals';
import DEFAULT_CONFIG from '../src/config/default.js';
import type { Task } from '../src/types/protocol.js';
import { presentTaskForOperator, shouldBroadcastTaskStep } from '../src/utils/response-style.js';

function makeTask(): Task {
  return {
    id: 'task-1',
    agent_id: 'agent-1',
    title: 'Deploy release',
    description: 'Ship the latest build',
    status: 'running',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    steps: [
      {
        id: 'step-1',
        task_id: 'task-1',
        type: 'log',
        content: 'Workflow "ios" triggered on branch "develop"',
        timestamp: new Date().toISOString(),
        metadata: {},
      },
      {
        id: 'step-2',
        task_id: 'task-1',
        type: 'log',
        content: 'Commit: 1234567',
        timestamp: new Date().toISOString(),
        metadata: {},
      },
      {
        id: 'step-3',
        task_id: 'task-1',
        type: 'output',
        content: 'Workflow completed successfully.',
        timestamp: new Date().toISOString(),
        metadata: {},
      },
    ],
    links: [],
  };
}

describe('response-style', () => {
  test('builds an operator view and hides low-signal steps in terse mode', () => {
    const task = presentTaskForOperator(makeTask(), {
      ...DEFAULT_CONFIG,
      responseProfile: 'codex',
      responseVerbosity: 'terse',
    });

    expect(task.operator_view?.profile).toBe('codex');
    expect(task.operator_view?.verbosity).toBe('terse');
    expect(task.operator_view?.summary).toContain('Workflow completed successfully');
    expect(task.operator_view?.raw_step_count).toBe(3);
    expect(task.steps.length).toBeLessThan(3);
  });

  test('broadcasts important steps but suppresses low-signal terse logs', () => {
    const task = makeTask();
    expect(shouldBroadcastTaskStep(task.steps[0]!, {
      ...DEFAULT_CONFIG,
      responseProfile: 'codex',
      responseVerbosity: 'terse',
    })).toBe(false);
    expect(shouldBroadcastTaskStep(task.steps[2]!, {
      ...DEFAULT_CONFIG,
      responseProfile: 'codex',
      responseVerbosity: 'terse',
    })).toBe(true);
  });
});
