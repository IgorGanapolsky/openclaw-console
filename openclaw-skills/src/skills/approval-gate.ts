/**
 * Approval Gate Skill
 *
 * Registers dangerous actions that require explicit human approval
 * before execution. Sends approval_request events to mobile clients,
 * waits for an approval_response, then proceeds or cancels.
 */

import { v4 as uuidv4 } from 'uuid';
import type { ApprovalRequest, ApprovalResponse, ActionType, RiskLevel, GitOperation } from '../types/protocol.js';
import type { IStateManager } from '../gateway/state-interface.js';
import type { GatewayConfig } from '../config/default.js';
import { evaluateApprovalPolicy } from '../gateway/policy.js';

export interface DangerousActionOptions {
  agentId: string;
  agentName: string;
  actionType: ActionType;
  title: string;
  description: string;
  /** The exact command or mutation that will be executed */
  command: string;
  context: {
    service: string;
    environment: string;
    repository: string;
    riskLevel: RiskLevel;
    git_operation?: GitOperation;
  };
  /** Timeout override in milliseconds (falls back to config default) */
  timeoutMs?: number;
}

export interface ApprovalGateResult {
  approved: boolean;
  response: ApprovalResponse | null;
  timedOut: boolean;
}

/** Decision log entry for audit trail */
export interface ApprovalLogEntry {
  approvalId: string;
  agentId: string;
  actionType: ActionType;
  title: string;
  decision: 'approved' | 'denied' | 'timed_out';
  biometricVerified: boolean;
  requestedAt: string;
  respondedAt: string | null;
  autoApproved: boolean;
  policyPreset: GatewayConfig['approvalPolicyPreset'];
  policyReason: string | null;
}

/**
 * Guards dangerous agent actions behind human approval.
 *
 * Usage:
 * ```ts
 * const gate = new ApprovalGateSkill(state, config);
 * const result = await gate.requestApproval({ ... });
 * if (result.approved) { ... execute ... }
 * ```
 */
export class ApprovalGateSkill {
  private decisionLog: ApprovalLogEntry[] = [];

  constructor(
    private readonly state: IStateManager,
    private readonly config: GatewayConfig,
  ) {}

  /**
   * Register a dangerous action and block until the user approves or denies it.
   *
   * The gateway automatically broadcasts an `approval_request` WS event
   * to all clients subscribed to the agent. The Promise resolves when
   * a response is received or the timeout elapses.
   */
  public async requestApproval(options: DangerousActionOptions): Promise<ApprovalGateResult> {
    const now = new Date();
    const timeoutMs = options.timeoutMs ?? this.config.approvalTimeoutMs;
    const expiresAt = new Date(now.getTime() + timeoutMs);

    const request: ApprovalRequest = {
      id: uuidv4(),
      agent_id: options.agentId,
      agent_name: options.agentName,
      action_type: options.actionType,
      title: options.title,
      description: options.description,
      command: options.command,
      context: {
        service: options.context.service,
        environment: options.context.environment,
        repository: options.context.repository,
        risk_level: options.context.riskLevel,
        git_operation: options.context.git_operation,
      },
      created_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    };

    const logEntry: ApprovalLogEntry = {
      approvalId: request.id,
      agentId: request.agent_id,
      actionType: request.action_type,
      title: request.title,
      decision: 'timed_out',
      biometricVerified: false,
      requestedAt: request.created_at,
      respondedAt: null,
      autoApproved: false,
      policyPreset: this.config.approvalPolicyPreset,
      policyReason: null,
    };

    const policy = evaluateApprovalPolicy(this.config.approvalPolicyPreset, {
      actionType: request.action_type,
      command: request.command,
      context: request.context,
    });

    if (policy.autoApproved) {
      const response: ApprovalResponse = {
        approval_id: request.id,
        decision: 'approved',
        biometric_verified: true,
        responded_at: now.toISOString(),
      };
      this.decisionLog.push({
        ...logEntry,
        decision: 'approved',
        biometricVerified: true,
        respondedAt: response.responded_at,
        autoApproved: true,
        policyReason: policy.reason,
      });
      console.info(`[approval-gate] Auto-approved ${request.id} via ${policy.preset}: ${policy.reason}`);
      return { approved: true, response, timedOut: false };
    }

    console.info(`[approval-gate] Requesting approval: "${options.title}" (${request.id})`);

    try {
      const response = await this.state.queueApproval(request, timeoutMs);

      logEntry.decision = response.decision;
      logEntry.biometricVerified = response.biometric_verified;
      logEntry.respondedAt = response.responded_at;
      this.decisionLog.push(logEntry);

      const approved = response.decision === 'approved' &&
        (!this.config.requireBiometric || response.biometric_verified);

      if (!approved && response.decision === 'approved' && !response.biometric_verified) {
        console.warn(`[approval-gate] Approval ${request.id} approved but biometric NOT verified — rejecting`);
      }

      console.info(`[approval-gate] Approval ${request.id}: ${approved ? 'APPROVED' : 'DENIED'}`);
      return { approved, response, timedOut: false };
    } catch {
      logEntry.decision = 'timed_out';
      this.decisionLog.push(logEntry);
      console.warn(`[approval-gate] Approval ${request.id} timed out`);
      return { approved: false, response: null, timedOut: true };
    }
  }

  /**
   * Return the full audit log of all approval decisions.
   * Useful for compliance reporting.
   */
  public getDecisionLog(): ApprovalLogEntry[] {
    return [...this.decisionLog];
  }

  /**
   * Example: guard a shell command execution.
   * Returns true if approved and safe to proceed.
   */
  public async guardShellCommand(
    agentId: string,
    agentName: string,
    command: string,
    service: string,
    environment: string,
  ): Promise<boolean> {
    const result = await this.requestApproval({
      agentId,
      agentName,
      actionType: 'shell_command',
      title: `Execute shell command on ${service}`,
      description: `Agent "${agentName}" wants to run a shell command on ${service} in ${environment}.`,
      command,
      context: {
        service,
        environment,
        repository: '',
        riskLevel: environment === 'production' ? 'critical' : 'high',
      },
    });
    return result.approved;
  }

  /**
   * Example: guard a deployment operation.
   */
  public async guardDeploy(
    agentId: string,
    agentName: string,
    service: string,
    version: string,
    environment: string,
    repository: string,
  ): Promise<boolean> {
    const result = await this.requestApproval({
      agentId,
      agentName,
      actionType: 'deploy',
      title: `Deploy ${service} ${version} to ${environment}`,
      description: `Agent "${agentName}" is about to deploy version ${version} of ${service} to ${environment}.`,
      command: `kubectl set image deployment/${service} ${service}=${service}:${version} -n ${environment}`,
      context: {
        service,
        environment,
        repository,
        riskLevel: environment === 'production' ? 'critical' : 'high',
      },
    }); // Type cast due to small differences in options naming in protocol
    return result.approved;
  }

  /**
   * Example: guard a config change.
   */
  public async guardConfigChange(
    agentId: string,
    agentName: string,
    service: string,
    change: string,
    environment: string,
  ): Promise<boolean> {
    const result = await this.requestApproval({
      agentId,
      agentName,
      actionType: 'config_change',
      title: `Config change on ${service} in ${environment}`,
      description: `Agent "${agentName}" wants to apply the following config change: ${change}`,
      command: change,
      context: {
        service,
        environment,
        repository: '',
        riskLevel: 'high',
      },
    });
    return result.approved;
  }

  /**
   * Guard a git commit operation with enhanced context.
   */
  public async guardGitCommit(
    agentId: string,
    agentName: string,
    repository: string,
    commitMessage: string,
    fileChanges: string[],
    diffSummary: string,
  ): Promise<boolean> {
    const environment = this.determineGitEnvironment(repository);
    const riskLevel = this.assessGitRiskLevel(fileChanges, diffSummary);

    const result = await this.requestApproval({
      agentId,
      agentName,
      actionType: 'git_commit',
      title: `Git commit in ${repository}`,
      description: `Agent "${agentName}" wants to commit changes: "${commitMessage}"\n\nChanges: ${diffSummary}\nFiles: ${fileChanges.slice(0, 5).join(', ')}${fileChanges.length > 5 ? ` and ${fileChanges.length - 5} more...` : ''}`,
      command: `git commit -m "${commitMessage}"`,
      context: {
        service: 'git',
        environment,
        repository,
        riskLevel,
        git_operation: {
          operation_type: 'commit',
          commit_message: commitMessage,
          file_changes: fileChanges,
          diff_summary: diffSummary,
        },
      },
    });
    return result.approved;
  }

  /**
   * Guard a git merge operation.
   */
  public async guardGitMerge(
    agentId: string,
    agentName: string,
    repository: string,
    fromBranch: string,
    toBranch: string,
    fileChanges: string[],
    diffSummary: string,
  ): Promise<boolean> {
    const environment = this.determineGitEnvironment(repository, toBranch);
    const riskLevel = this.assessGitMergeRiskLevel(toBranch, fileChanges, diffSummary);

    const result = await this.requestApproval({
      agentId,
      agentName,
      actionType: 'git_merge',
      title: `Git merge from ${fromBranch} to ${toBranch}`,
      description: `Agent "${agentName}" wants to merge "${fromBranch}" into "${toBranch}"\n\nChanges: ${diffSummary}\nFiles: ${fileChanges.slice(0, 5).join(', ')}${fileChanges.length > 5 ? ` and ${fileChanges.length - 5} more...` : ''}`,
      command: `git merge ${fromBranch}`,
      context: {
        service: 'git',
        environment,
        repository,
        riskLevel,
        git_operation: {
          operation_type: 'merge',
          branch_from: fromBranch,
          branch_to: toBranch,
          file_changes: fileChanges,
          diff_summary: diffSummary,
        },
      },
    });
    return result.approved;
  }

  /**
   * Guard a git push operation.
   */
  public async guardGitPush(
    agentId: string,
    agentName: string,
    repository: string,
    branch: string,
    fileChanges: string[],
    diffSummary: string,
  ): Promise<boolean> {
    const environment = this.determineGitEnvironment(repository, branch);
    const riskLevel = this.assessGitPushRiskLevel(branch, fileChanges, diffSummary);

    const result = await this.requestApproval({
      agentId,
      agentName,
      actionType: 'git_push',
      title: `Git push to ${branch}`,
      description: `Agent "${agentName}" wants to push changes to "${branch}"\n\nChanges: ${diffSummary}\nFiles: ${fileChanges.slice(0, 5).join(', ')}${fileChanges.length > 5 ? ` and ${fileChanges.length - 5} more...` : ''}`,
      command: `git push origin ${branch}`,
      context: {
        service: 'git',
        environment,
        repository,
        riskLevel,
        git_operation: {
          operation_type: 'push',
          branch_to: branch,
          file_changes: fileChanges,
          diff_summary: diffSummary,
        },
      },
    });
    return result.approved;
  }

  /**
   * Determine environment based on git repository or branch patterns.
   */
  private determineGitEnvironment(repository: string, branch?: string): string {
    const repoLower = repository.toLowerCase();
    const branchLower = branch?.toLowerCase() || '';

    // Check branch patterns first (more specific)
    if (branch) {
      if (['main', 'master', 'production', 'prod'].includes(branchLower)) {
        return 'production';
      }
      if (['staging', 'stage'].includes(branchLower) || branchLower.includes('staging')) {
        return 'staging';
      }
      if (['develop', 'development', 'dev'].includes(branchLower) || branchLower.includes('develop')) {
        return 'development';
      }
    }

    // Check repository patterns
    if (repoLower.includes('prod') || repoLower.includes('main') || repoLower.includes('master')) {
      return 'production';
    }
    if (repoLower.includes('staging') || repoLower.includes('stage')) {
      return 'staging';
    }
    if (repoLower.includes('dev') || repoLower.includes('develop')) {
      return 'development';
    }

    return 'feature';
  }

  /**
   * Assess risk level for git operations based on changes.
   */
  private assessGitRiskLevel(fileChanges: string[], diffSummary: string): RiskLevel {
    // Check for critical files
    const criticalPatterns = [
      /package\.json$/,
      /\.env/,
      /config\./,
      /Dockerfile/,
      /docker-compose/,
      /\.github\/workflows/,
      /\.gitlab-ci\./,
      /Makefile$/,
      /\.sql$/,
      /migration/i,
    ];

    const hasCriticalFiles = fileChanges.some(file =>
      criticalPatterns.some(pattern => pattern.test(file))
    );

    // Check for large changes
    const hasLargeChanges = diffSummary.includes('+') && (
      parseInt(diffSummary.match(/\+(\d+)/)?.[1] || '0') > 1000 ||
      parseInt(diffSummary.match(/-(\d+)/)?.[1] || '0') > 1000
    );

    if (hasCriticalFiles || hasLargeChanges || fileChanges.length > 50) {
      return 'critical';
    }

    return 'high';
  }

  /**
   * Assess risk level specifically for merge operations.
   */
  private assessGitMergeRiskLevel(toBranch: string, fileChanges: string[], diffSummary: string): RiskLevel {
    // Merging to main/master is always critical
    const branchLower = toBranch.toLowerCase();
    if (['main', 'master', 'production', 'prod'].includes(branchLower)) {
      return 'critical';
    }

    return this.assessGitRiskLevel(fileChanges, diffSummary);
  }

  /**
   * Assess risk level specifically for push operations.
   */
  private assessGitPushRiskLevel(branch: string, fileChanges: string[], diffSummary: string): RiskLevel {
    // Same logic as merge for now
    return this.assessGitMergeRiskLevel(branch, fileChanges, diffSummary);
  }
}
