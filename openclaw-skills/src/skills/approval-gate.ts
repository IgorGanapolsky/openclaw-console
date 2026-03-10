/**
 * Approval Gate Skill
 *
 * Registers dangerous actions that require explicit human approval
 * before execution. Sends approval_request events to mobile clients,
 * waits for an approval_response, then proceeds or cancels.
 */

import { v4 as uuidv4 } from 'uuid';
import type { ApprovalRequest, ApprovalResponse, ActionType, RiskLevel } from '../types/protocol.js';
import type { IStateManager } from '../gateway/state-interface.js';
import type { GatewayConfig } from '../config/default.js';

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
    };

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
    });
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
}
