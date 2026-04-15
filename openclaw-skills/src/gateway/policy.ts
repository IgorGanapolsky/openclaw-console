import type { GatewayConfig } from '../config/default.js';
import type { ActionType, ApprovalContext } from '../types/protocol.js';

export interface ApprovalPolicyDecision {
  autoApproved: boolean;
  preset: GatewayConfig['approvalPolicyPreset'];
  reason: string;
}

export interface ApprovalPolicyInput {
  actionType: ActionType;
  command: string;
  context: ApprovalContext;
}

const SAFE_READ_ONLY_COMMANDS = [
  /^git\s+(status|diff|log|show|branch|remote|rev-parse|ls-files)\b/,
  /^gh\s+(pr|run|repo|api)\s+(view|list|checks|status)\b/,
  /^npm\s+(test|run\s+(test|lint|build|typecheck))\b/,
  /^pnpm\s+(test|exec|run)\b/,
  /^yarn\s+(test|lint|build)\b/,
  /^make\s+(test|lint|check)\b/,
];

const REPO_WRITE_ACTIONS = new Set<ActionType>(['git_commit', 'git_push', 'propose_fix']);
const CI_ACTIONS = new Set<ActionType>(['ask_root_cause', 'propose_fix', 'acknowledge', 'shell_command']);
const NEVER_AUTO_APPROVE = new Set<ActionType>(['destructive', 'deploy', 'key_rotation', 'trade_execution']);
const PROTECTED_BRANCHES = new Set(['main', 'master', 'production', 'prod']);

export function evaluateApprovalPolicy(
  preset: GatewayConfig['approvalPolicyPreset'],
  input: ApprovalPolicyInput,
): ApprovalPolicyDecision {
  if (preset === 'manual') {
    return deny(preset, 'manual policy requires explicit approval');
  }

  if (NEVER_AUTO_APPROVE.has(input.actionType)) {
    return deny(preset, `${input.actionType} is never auto-approved`);
  }

  if (input.context.risk_level === 'critical' && preset !== 'danger-yolo') {
    return deny(preset, 'critical risk requires explicit approval');
  }

  if (preset === 'safe-yolo') {
    return isReadOnlyCommand(input.command)
      ? allow(preset, 'safe-yolo read-only command')
      : deny(preset, 'safe-yolo only allows read-only commands');
  }

  if (preset === 'ci-yolo') {
    if (!CI_ACTIONS.has(input.actionType)) {
      return deny(preset, `ci-yolo does not allow ${input.actionType}`);
    }
    return isReadOnlyCommand(input.command) || isCiCommand(input.command)
      ? allow(preset, 'ci-yolo allowed CI/read-only command')
      : deny(preset, 'ci-yolo command is not in the CI allowlist');
  }

  if (preset === 'repo-yolo') {
    if (targetsProtectedBranch(input.context)) {
      return deny(preset, 'protected branch writes require explicit approval');
    }
    if (REPO_WRITE_ACTIONS.has(input.actionType) || isReadOnlyCommand(input.command) || isCiCommand(input.command)) {
      return allow(preset, 'repo-yolo allowed repository operation');
    }
    return deny(preset, `repo-yolo does not allow ${input.actionType}`);
  }

  if (preset === 'danger-yolo') {
    return allow(preset, 'danger-yolo auto-approved non-destructive action');
  }

  return deny(preset, 'unknown policy preset');
}

function allow(preset: GatewayConfig['approvalPolicyPreset'], reason: string): ApprovalPolicyDecision {
  return { autoApproved: true, preset, reason };
}

function deny(preset: GatewayConfig['approvalPolicyPreset'], reason: string): ApprovalPolicyDecision {
  return { autoApproved: false, preset, reason };
}

function isReadOnlyCommand(command: string): boolean {
  const normalized = command.trim();
  return SAFE_READ_ONLY_COMMANDS.some((pattern) => pattern.test(normalized));
}

function isCiCommand(command: string): boolean {
  const normalized = command.trim();
  return /^(npm|pnpm|yarn)\s+(test|run\s+(test|lint|build|typecheck))\b/.test(normalized) ||
    /^(\.\/gradlew|gradle)\s+.+\b(test|lint|assemble|check)\b/.test(normalized) ||
    /^xcodebuild\s+.+\b(build|test)\b/.test(normalized);
}

function targetsProtectedBranch(context: ApprovalContext): boolean {
  const branch = context.git_operation?.branch_to ?? context.git_operation?.branch_from ?? '';
  return PROTECTED_BRANCHES.has(branch.toLowerCase());
}
