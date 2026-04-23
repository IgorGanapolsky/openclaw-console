/**
 * Multica Bridge Service
 *
 * Bridges between Multica's issue-based workflow and OpenClaw's task/approval system.
 * High-ROI integration focusing on:
 * - Structured prompting via issues
 * - Biometric approval workflows
 * - Real-time status synchronization
 */

import { StateManager } from '../../gateway/state.js';
import { Task, TaskStep, ApprovalRequest } from '../../types/protocol.js';
import {
  MulticaIssue,
  MulticaExecution,
  MulticaBridgeConfig,
  IssueTranslationRequest
} from './types.js';
import { MulticaClient } from './client.js';

export class MulticaBridge {
  private stateManager: StateManager;
  private config: MulticaBridgeConfig;
  private client: MulticaClient;
  private approvalMappings: Map<string, string> = new Map(); // approvalId -> issueId

  constructor(stateManager: StateManager, config: MulticaBridgeConfig) {
    this.stateManager = stateManager;
    this.config = config;
    this.client = new MulticaClient(config);
  }

  /**
   * HIGH-ROI: Convert OpenClaw approval request into Multica issue
   * This drives the DAA (Daily Active Approvers) metric
   */
  async createIssueFromApproval(approval: ApprovalRequest): Promise<MulticaIssue> {
    const issueRequest: IssueTranslationRequest = {
      title: `🚨 APPROVAL REQUIRED: ${approval.title}`,
      description: this.formatApprovalDescription(approval),
      agent_id: this.mapOpenClawAgentToMultica(approval.agent_id),
      priority: approval.context.risk_level === 'critical' ? 'Critical' : 'High',
      labels: [
        'approval-required',
        `action:${approval.action_type}`,
        `risk:${approval.context.risk_level}`,
        ...(approval.context.environment ? [`env:${approval.context.environment}`] : []),
        ...(approval.context.service ? [`service:${approval.context.service}`] : [])
      ],
      require_approval: true,
      approval_context: {
        action_type: approval.action_type,
        risk_level: approval.context.risk_level,
        environment: approval.context.environment,
        service: approval.context.service
      }
    };

    const issue = await this.createMulticaIssue(issueRequest);

    // Store mapping for approval resolution
    await this.storeApprovalIssueMapping(approval.id, issue.id);

    return issue;
  }

  /**
   * HIGH-ROI: Convert Multica issue into OpenClaw task for mobile display
   */
  async syncIssueToTask(issue: MulticaIssue): Promise<Task> {
    const agent = await this.stateManager.getAgent(this.mapMulticaAgentToOpenClaw(issue.agent_id || ''));

    const task: Task = {
      id: `multica-${issue.id}`,
      agent_id: agent?.id || 'unknown',
      title: issue.title,
      description: issue.description,
      status: this.mapMulticaStatusToOpenClaw(issue.status),
      created_at: issue.created_at,
      updated_at: issue.updated_at,
      steps: [],
      links: [
        {
          label: 'View in Multica',
          url: `${this.config.multica_api_url}/issues/${issue.id}`,
          type: 'external'
        }
      ]
    };

    await this.stateManager.createTask({
      agent_id: task.agent_id,
      title: task.title,
      description: task.description
    });
    return task;
  }

  /**
   * HIGH-ROI: Handle Multica execution events and create approval requests
   */
  async handleMulticaExecution(execution: MulticaExecution): Promise<void> {
    // Check if this execution requires approval
    const issue = await this.getMulticaIssue(execution.issue_id);
    const requiresApproval = issue.labels.includes('approval-required') ||
                           this.detectDangerousAction(execution);

    if (requiresApproval && execution.status === 'pending') {
      const approval = await this.createApprovalFromExecution(execution, issue);

      // Queue approval with timeout and handle response
      this.stateManager.queueApproval(approval, this.config.approval_timeout_minutes * 60000)
        .then(async (response) => {
          console.info(`[multica] Approval ${approval.id}: ${response.decision}`);
          await this.processApprovalDecision(approval.id, response.decision, response.biometric_verified);
        })
        .catch((error) => {
          console.warn(`[multica] Approval ${approval.id} failed or expired:`, error);
        });

      // Approval creation event is emitted automatically by StateManager
    }

    // Sync execution progress as task steps
    await this.syncExecutionToTaskSteps(execution);
  }

  /**
   * Process approval decision from mobile app
   */
  async processApprovalDecision(approvalId: string, decision: 'approved' | 'denied', biometricVerified: boolean): Promise<void> {
    if (!biometricVerified) {
      throw new Error('Biometric verification required for all approvals');
    }

    const issueId = await this.getIssueIdFromApproval(approvalId);
    if (!issueId) {
      throw new Error(`No Multica issue found for approval ${approvalId}`);
    }

    // Update Multica issue with approval decision
    await this.updateMulticaIssue(issueId, {
      status: decision === 'approved' ? 'In Progress' : 'Todo',
      labels: decision === 'approved' ?
        ['approved', 'biometric-verified'] :
        ['denied', 'requires-review']
    });

    // Add comment about approval decision
    await this.client.addIssueComment(
      issueId,
      `Approval ${decision} via OpenClaw mobile app (biometric verified)`,
      'openclaw-bridge'
    );

    // If approved, signal Multica to proceed with execution
    if (decision === 'approved') {
      await this.triggerMulticaExecution(issueId);
    }
  }

  /**
   * HIGH-ROI: Create structured prompt issue from mobile app
   * Drives user engagement and structured workflows
   */
  async createStructuredPrompt(request: {
    title: string;
    prompt: string;
    agent_id: string;
    priority?: 'Low' | 'Medium' | 'High' | 'Critical';
    schedule?: string; // For autopilot
    tags?: string[];
  }): Promise<MulticaIssue> {
    const issueRequest: IssueTranslationRequest = {
      title: request.title,
      description: request.prompt,
      agent_id: this.mapOpenClawAgentToMultica(request.agent_id),
      priority: request.priority || 'Medium',
      labels: [
        'structured-prompt',
        'mobile-created',
        ...(request.tags || [])
      ]
    };

    const issue = await this.createMulticaIssue(issueRequest);

    // If schedule provided, create autopilot run
    if (request.schedule) {
      await this.createAutopilotRun({
        name: request.title,
        agent_id: issue.agent_id || '',
        schedule: request.schedule,
        prompt: request.prompt,
        enabled: true
      });
    }

    // Create corresponding OpenClaw task for mobile monitoring
    await this.syncIssueToTask(issue);

    return issue;
  }

  // Private helper methods
  private formatApprovalDescription(approval: ApprovalRequest): string {
    return `
**Action:** ${approval.action_type}
**Risk Level:** ${approval.context.risk_level}
**Command:** \`${approval.command || 'N/A'}\`
**Environment:** ${approval.context.environment || 'N/A'}
**Service:** ${approval.context.service || 'N/A'}

**Description:**
${approval.description}

**⚠️ This action requires biometric approval via OpenClaw mobile app**
    `.trim();
  }

  private mapOpenClawAgentToMultica(openclawAgentId: string): string {
    return this.config.default_agent_mapping[openclawAgentId] || 'default-agent';
  }

  private mapMulticaAgentToOpenClaw(multicaAgentId: string): string {
    const reverseMapping = Object.entries(this.config.default_agent_mapping)
      .find(([_, multica]) => multica === multicaAgentId);
    return reverseMapping?.[0] || 'unknown';
  }

  private mapMulticaStatusToOpenClaw(status: MulticaIssue['status']): Task['status'] {
    switch (status) {
      case 'Todo': return 'queued';
      case 'In Progress': return 'running';
      case 'Done': return 'done';
      case 'In Review': return 'running';
      default: return 'queued';
    }
  }

  private detectDangerousAction(execution: MulticaExecution): boolean {
    // Analyze tool calls for dangerous operations
    return execution.tool_calls.some(call => {
      const dangerousTools = [
        'shell_command',
        'docker_run',
        'kubectl_apply',
        'git_push',
        'database_execute',
        'file_delete',
        'deploy_trigger'
      ];
      return dangerousTools.includes(call.tool_name);
    });
  }

  private async createApprovalFromExecution(execution: MulticaExecution, issue: MulticaIssue): Promise<ApprovalRequest> {
    const dangerousTool = execution.tool_calls.find(call =>
      this.detectDangerousAction({ ...execution, tool_calls: [call] })
    );

    return {
      id: `multica-exec-${execution.id}`,
      agent_id: this.mapMulticaAgentToOpenClaw(execution.agent_id),
      agent_name: issue.assignee || 'Multica Agent',
      action_type: this.mapToolToActionType(dangerousTool?.tool_name || 'unknown'),
      title: `Execute: ${issue.title}`,
      description: `Multica agent wants to execute dangerous action:\n\n${issue.description}`,
      command: JSON.stringify(dangerousTool?.parameters || {}),
      context: {
        service: issue.labels.find(l => l.startsWith('service:'))?.split(':')[1] || 'unknown',
        environment: issue.labels.find(l => l.startsWith('env:'))?.split(':')[1] || 'unknown',
        repository: issue.labels.find(l => l.startsWith('repo:'))?.split(':')[1] || 'unknown',
        risk_level: issue.labels.includes('risk:critical') ? 'critical' : 'high'
      },
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + this.config.approval_timeout_minutes * 60000).toISOString()
    };
  }

  private mapToolToActionType(toolName: string): ApprovalRequest['action_type'] {
    const mapping: Record<string, ApprovalRequest['action_type']> = {
      'shell_command': 'shell_command',
      'docker_run': 'deploy',
      'kubectl_apply': 'deploy',
      'git_push': 'deploy',
      'database_execute': 'destructive',
      'file_delete': 'destructive',
      'deploy_trigger': 'deploy'
    };
    return mapping[toolName] || 'destructive';
  }

  // API integration methods - implemented with MulticaClient
  private async createMulticaIssue(request: IssueTranslationRequest): Promise<MulticaIssue> {
    return await this.client.createIssue(request);
  }

  private async getMulticaIssue(issueId: string): Promise<MulticaIssue> {
    return await this.client.getIssue(issueId);
  }

  private async updateMulticaIssue(issueId: string, updates: Partial<MulticaIssue>): Promise<void> {
    await this.client.updateIssue(issueId, updates);
  }

  private async triggerMulticaExecution(issueId: string): Promise<void> {
    await this.client.triggerExecution(issueId);
  }

  private async createAutopilotRun(config: {
    name: string;
    agent_id: string;
    schedule: string;
    prompt: string;
    enabled: boolean;
  }): Promise<void> {
    await this.client.createAutopilotRun(config);
  }

  private async storeApprovalIssueMapping(approvalId: string, issueId: string): Promise<void> {
    // Store in-memory mapping for MVP
    // In production, this should be persisted to a database
    this.approvalMappings.set(approvalId, issueId);
    console.debug(`[multica] Stored approval mapping: ${approvalId} -> ${issueId}`);
  }

  private async getIssueIdFromApproval(approvalId: string): Promise<string | null> {
    const issueId = this.approvalMappings.get(approvalId);
    if (issueId) {
      console.debug(`[multica] Retrieved approval mapping: ${approvalId} -> ${issueId}`);
    }
    return issueId || null;
  }

  private async syncExecutionToTaskSteps(execution: MulticaExecution): Promise<void> {
    const taskId = `multica-${execution.issue_id}`;

    for (const toolCall of execution.tool_calls) {
      const step: TaskStep = {
        id: `multica-tool-${toolCall.id}`,
        task_id: taskId,
        type: toolCall.error ? 'error' : 'tool_call',
        content: `Tool: ${toolCall.tool_name}\nParams: ${JSON.stringify(toolCall.parameters)}\n${toolCall.result ? `Result: ${JSON.stringify(toolCall.result)}` : ''}`,
        timestamp: toolCall.timestamp,
        metadata: {
          tool_name: toolCall.tool_name,
          multica_execution_id: execution.id
        }
      };

      await this.stateManager.addTaskStep(step);
    }
  }
}