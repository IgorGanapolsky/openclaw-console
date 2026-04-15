import { describe, expect, test } from '@jest/globals';
import { evaluateApprovalPolicy } from '../src/gateway/policy.js';
import type { ApprovalContext } from '../src/types/protocol.js';

const baseContext: ApprovalContext = {
  service: 'repo',
  environment: 'development',
  repository: 'IgorGanapolsky/openclaw-console',
  risk_level: 'high',
};

describe('approval policy presets', () => {
  test('manual preset never auto-approves', () => {
    const decision = evaluateApprovalPolicy('manual', {
      actionType: 'shell_command',
      command: 'git status',
      context: baseContext,
    });

    expect(decision.autoApproved).toBe(false);
    expect(decision.reason).toContain('manual');
  });

  test('safe-yolo auto-approves read-only repository inspection', () => {
    const decision = evaluateApprovalPolicy('safe-yolo', {
      actionType: 'shell_command',
      command: 'git status --short',
      context: baseContext,
    });

    expect(decision.autoApproved).toBe(true);
    expect(decision.reason).toContain('read-only');
  });

  test('ci-yolo auto-approves test commands', () => {
    const decision = evaluateApprovalPolicy('ci-yolo', {
      actionType: 'shell_command',
      command: 'npm test',
      context: baseContext,
    });

    expect(decision.autoApproved).toBe(true);
  });

  test('repo-yolo blocks protected branch pushes', () => {
    const decision = evaluateApprovalPolicy('repo-yolo', {
      actionType: 'git_push',
      command: 'git push origin main',
      context: {
        ...baseContext,
        git_operation: {
          operation_type: 'push',
          branch_to: 'main',
        },
      },
    });

    expect(decision.autoApproved).toBe(false);
    expect(decision.reason).toContain('protected branch');
  });

  test('danger-yolo still blocks destructive operations', () => {
    const decision = evaluateApprovalPolicy('danger-yolo', {
      actionType: 'destructive',
      command: 'rm -rf /',
      context: baseContext,
    });

    expect(decision.autoApproved).toBe(false);
    expect(decision.reason).toContain('never');
  });
});
