/**
 * GitClaw Agent Skill
 *
 * Integrates with git operations and provides approval gates for
 * dangerous git actions like commits, merges, pushes, and rollbacks.
 * Monitors git repository state and surfaces changes as tasks.
 */

import { simpleGit } from 'simple-git';
import type { SimpleGit, StatusResult } from 'simple-git';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { TaskManagerSkill } from './task-manager.js';
import { IncidentManagerSkill } from './incident-manager.js';
import { ApprovalGateSkill } from './approval-gate.js';
import type { IStateManager } from '../gateway/state-interface.js';
import type { GatewayConfig } from '../config/default.js';
import type { AgentGitState, ResourceLink } from '../types/protocol.js';

export interface GitClawOptions {
  /** ID of the agent representing this GitClaw instance */
  agentId: string;
  agentName: string;
  /** Path to the git repository to monitor */
  repositoryPath: string;
  /** Repository URL for display purposes */
  repositoryUrl: string;
  /** Polling interval for git state changes in milliseconds */
  pollIntervalMs?: number;
  /** Whether to enable MCP integration for advanced git operations */
  enableMcp?: boolean;
  /** MCP server command if enableMcp is true */
  mcpServerCommand?: string[];
}

export interface GitClawMetrics {
  commitsCreated: number;
  mergesPerformed: number;
  pushesExecuted: number;
  rollbacksExecuted: number;
  approvalsRequested: number;
  approvalsApproved: number;
  approvalsDenied: number;
}

/**
 * GitClaw agent skill that provides git operations with approval gates
 * and repository state monitoring.
 */
export class GitClawAgentSkill {
  private taskManager: TaskManagerSkill;
  private incidentManager: IncidentManagerSkill;
  private approvalGate: ApprovalGateSkill;
  private state: IStateManager;
  private options: Required<Omit<GitClawOptions, 'mcpServerCommand'>> & Pick<GitClawOptions, 'mcpServerCommand'>;
  private git: SimpleGit;
  private mcpClient: Client | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastKnownState: AgentGitState | null = null;
  private metrics: GitClawMetrics = {
    commitsCreated: 0,
    mergesPerformed: 0,
    pushesExecuted: 0,
    rollbacksExecuted: 0,
    approvalsRequested: 0,
    approvalsApproved: 0,
    approvalsDenied: 0,
  };

  constructor(
    state: IStateManager,
    config: GatewayConfig,
    options: GitClawOptions
  ) {
    this.state = state;
    this.taskManager = new TaskManagerSkill(state);
    this.incidentManager = new IncidentManagerSkill(state);
    this.approvalGate = new ApprovalGateSkill(state, config);

    this.options = {
      pollIntervalMs: 30_000,
      enableMcp: false,
      ...options,
    };

    this.git = simpleGit({
      baseDir: this.options.repositoryPath,
      binary: 'git',
      maxConcurrentProcesses: 1,
    });
  }

  /**
   * Start the GitClaw agent - initializes MCP client if enabled
   * and starts repository monitoring.
   */
  public async start(): Promise<void> {
    console.info(`[gitclaw] Starting GitClaw agent for ${this.options.repositoryUrl}`);

    if (this.options.enableMcp && this.options.mcpServerCommand) {
      try {
        await this.initializeMcpClient();
        console.info('[gitclaw] MCP client initialized');
      } catch (error) {
        console.warn('[gitclaw] Failed to initialize MCP client:', error);
        await this.incidentManager.createIncident({
          agentId: this.options.agentId,
          agentName: this.options.agentName,
          severity: 'warning',
          title: 'GitClaw MCP initialization failed',
          description: `Failed to initialize MCP client: ${error instanceof Error ? error.message : String(error)}`,
          actions: ['acknowledge'],
        });
      }
    }

    // Initial git state check
    await this.updateGitState();

    // Start monitoring loop
    void this.tick();
    this.timer = setInterval(() => { void this.tick(); }, this.options.pollIntervalMs);
  }

  /** Stop the GitClaw agent and clean up resources. */
  public async stop(): Promise<void> {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (this.mcpClient) {
      await this.mcpClient.close();
      this.mcpClient = null;
    }

    console.info(`[gitclaw] Stopped GitClaw agent for ${this.options.repositoryUrl}`);
  }

  /**
   * Execute a git commit operation with approval gate.
   */
  public async commitChanges(
    message: string,
    files?: string[],
    riskLevel: 'high' | 'critical' = 'high'
  ): Promise<boolean> {
    const filesArg = files ? files.join(' ') : '.';
    const command = `git add ${filesArg} && git commit -m "${message}"`;

    this.metrics.approvalsRequested++;
    const approved = await this.approvalGate.requestApproval({
      agentId: this.options.agentId,
      agentName: this.options.agentName,
      actionType: 'git_commit',
      title: `Git Commit: ${message}`,
      description: `Commit changes with message: "${message}"\nFiles: ${files?.join(', ') || 'all staged files'}`,
      command,
      context: {
        service: 'git',
        environment: 'development',
        repository: this.options.repositoryUrl,
        riskLevel,
        git_operation: {
          operation_type: 'commit',
          commit_message: message,
          file_changes: files,
        },
      },
    });

    if (!approved.approved) {
      this.metrics.approvalsDenied++;
      return false;
    }

    this.metrics.approvalsApproved++;

    try {
      if (files) {
        await this.git.add(files);
      } else {
        await this.git.add('.');
      }

      await this.git.commit(message);
      this.metrics.commitsCreated++;

      // Create task for the commit
      const task = await this.taskManager.createTask({
        agentId: this.options.agentId,
        title: `Git Commit: ${message}`,
        description: `Committed changes to ${this.options.repositoryUrl}`,
        initialStatus: 'done',
      });

      await this.taskManager.log(task.id, `Successfully committed with message: "${message}"`);
      if (files) {
        await this.taskManager.log(task.id, `Files committed: ${files.join(', ')}`);
      }

      await this.updateGitState();
      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      await this.incidentManager.createIncident({
        agentId: this.options.agentId,
        agentName: this.options.agentName,
        severity: 'warning',
        title: 'Git commit failed',
        description: `Failed to commit changes: ${errorMsg}\nMessage: "${message}"`,
        actions: ['acknowledge', 'propose_fix'],
      });

      throw error;
    }
  }

  /**
   * Execute a git merge operation with approval gate.
   */
  public async mergeBranch(
    sourceBranch: string,
    targetBranch: string = 'main',
    riskLevel: 'high' | 'critical' = 'critical'
  ): Promise<boolean> {
    const command = `git checkout ${targetBranch} && git merge ${sourceBranch}`;

    this.metrics.approvalsRequested++;
    const approved = await this.approvalGate.requestApproval({
      agentId: this.options.agentId,
      agentName: this.options.agentName,
      actionType: 'git_merge',
      title: `Git Merge: ${sourceBranch} → ${targetBranch}`,
      description: `Merge branch "${sourceBranch}" into "${targetBranch}"`,
      command,
      context: {
        service: 'git',
        environment: targetBranch === 'main' || targetBranch === 'master' ? 'production' : 'development',
        repository: this.options.repositoryUrl,
        riskLevel,
        git_operation: {
          operation_type: 'merge',
          branch_from: sourceBranch,
          branch_to: targetBranch,
        },
      },
    });

    if (!approved.approved) {
      this.metrics.approvalsDenied++;
      return false;
    }

    this.metrics.approvalsApproved++;

    try {
      await this.git.checkout(targetBranch);
      await this.git.merge([sourceBranch]);
      this.metrics.mergesPerformed++;

      const task = await this.taskManager.createTask({
        agentId: this.options.agentId,
        title: `Git Merge: ${sourceBranch} → ${targetBranch}`,
        description: `Merged branch "${sourceBranch}" into "${targetBranch}"`,
        initialStatus: 'done',
      });

      await this.taskManager.log(task.id, `Successfully merged ${sourceBranch} into ${targetBranch}`);
      await this.updateGitState();
      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      await this.incidentManager.createIncident({
        agentId: this.options.agentId,
        agentName: this.options.agentName,
        severity: 'critical',
        title: 'Git merge failed',
        description: `Failed to merge ${sourceBranch} into ${targetBranch}: ${errorMsg}`,
        actions: ['acknowledge', 'agent_rollback', 'propose_fix'],
      });

      throw error;
    }
  }

  /**
   * Execute a git push operation with approval gate.
   */
  public async pushChanges(
    branch?: string,
    riskLevel: 'high' | 'critical' = 'high'
  ): Promise<boolean> {
    const currentBranch = branch || (await this.git.branch()).current;
    const command = `git push origin ${currentBranch}`;

    this.metrics.approvalsRequested++;
    const approved = await this.approvalGate.requestApproval({
      agentId: this.options.agentId,
      agentName: this.options.agentName,
      actionType: 'git_push',
      title: `Git Push: ${currentBranch}`,
      description: `Push branch "${currentBranch}" to remote origin`,
      command,
      context: {
        service: 'git',
        environment: currentBranch === 'main' || currentBranch === 'master' ? 'production' : 'development',
        repository: this.options.repositoryUrl,
        riskLevel: currentBranch === 'main' || currentBranch === 'master' ? 'critical' : riskLevel,
        git_operation: {
          operation_type: 'push',
          branch_to: currentBranch,
        },
      },
    });

    if (!approved.approved) {
      this.metrics.approvalsDenied++;
      return false;
    }

    this.metrics.approvalsApproved++;

    try {
      await this.git.push('origin', currentBranch);
      this.metrics.pushesExecuted++;

      const task = await this.taskManager.createTask({
        agentId: this.options.agentId,
        title: `Git Push: ${currentBranch}`,
        description: `Pushed branch "${currentBranch}" to remote`,
        initialStatus: 'done',
        links: this.generateRepoLinks(),
      });

      await this.taskManager.log(task.id, `Successfully pushed ${currentBranch} to origin`);
      await this.updateGitState();
      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      await this.incidentManager.createIncident({
        agentId: this.options.agentId,
        agentName: this.options.agentName,
        severity: 'warning',
        title: 'Git push failed',
        description: `Failed to push ${currentBranch}: ${errorMsg}`,
        actions: ['acknowledge', 'propose_fix'],
      });

      throw error;
    }
  }

  /**
   * Execute a git rollback operation with approval gate.
   */
  public async rollbackToCommit(
    commitHash: string,
    riskLevel: 'critical' = 'critical'
  ): Promise<boolean> {
    const command = `git reset --hard ${commitHash}`;

    this.metrics.approvalsRequested++;
    const approved = await this.approvalGate.requestApproval({
      agentId: this.options.agentId,
      agentName: this.options.agentName,
      actionType: 'agent_rollback',
      title: `Git Rollback: ${commitHash}`,
      description: `Rollback repository to commit ${commitHash}. WARNING: This will discard all changes after this commit!`,
      command,
      context: {
        service: 'git',
        environment: 'production',
        repository: this.options.repositoryUrl,
        riskLevel,
        git_operation: {
          operation_type: 'rollback',
          commit_message: `Rollback to ${commitHash}`,
        },
      },
    });

    if (!approved.approved) {
      this.metrics.approvalsDenied++;
      return false;
    }

    this.metrics.approvalsApproved++;

    try {
      await this.git.reset(['--hard', commitHash]);
      this.metrics.rollbacksExecuted++;

      const task = await this.taskManager.createTask({
        agentId: this.options.agentId,
        title: `Git Rollback: ${commitHash}`,
        description: `Rolled back repository to commit ${commitHash}`,
        initialStatus: 'done',
      });

      await this.taskManager.log(task.id, `Successfully rolled back to commit ${commitHash}`);
      await this.updateGitState();
      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      await this.incidentManager.createIncident({
        agentId: this.options.agentId,
        agentName: this.options.agentName,
        severity: 'critical',
        title: 'Git rollback failed',
        description: `Failed to rollback to ${commitHash}: ${errorMsg}`,
        actions: ['acknowledge', 'propose_fix'],
      });

      throw error;
    }
  }

  /** Get current GitClaw metrics. */
  public getMetrics(): GitClawMetrics {
    return { ...this.metrics };
  }

  // ── Private Methods ────────────────────────────────────────────────────────

  private async initializeMcpClient(): Promise<void> {
    if (!this.options.mcpServerCommand) {
      throw new Error('MCP server command not provided');
    }

    const transport = new StdioClientTransport({
      command: this.options.mcpServerCommand[0]!,
      args: this.options.mcpServerCommand.slice(1),
    });

    this.mcpClient = new Client({
      name: 'gitclaw-agent',
      version: '1.0.0',
    }, {
      capabilities: {},
    });

    await this.mcpClient.connect(transport);
  }

  private async tick(): Promise<void> {
    try {
      await this.updateGitState();
      await this.detectChanges();
    } catch (error) {
      console.warn('[gitclaw] Error during monitoring tick:', error);
    }
  }

  private async updateGitState(): Promise<void> {
    try {
      const status: StatusResult = await this.git.status();
      const branch = await this.git.branch();
      const log = await this.git.log({ maxCount: 1 });

      const gitState: AgentGitState = {
        repository_url: this.options.repositoryUrl,
        current_branch: branch.current || 'unknown',
        current_commit: log.latest?.hash.substring(0, 8) || 'unknown',
        uncommitted_changes: status.files.length,
        ahead_by: status.ahead,
        behind_by: status.behind,
        last_sync: new Date().toISOString(),
      };

      // Update agent with git state in state manager
      const agent = await this.state.getAgent(this.options.agentId);
      if (agent) {
        const previousState = this.lastKnownState;
        agent.git_state = gitState;
        await this.state.upsertAgent(agent);

        // Detect significant changes and broadcast
        if (previousState && this.hasSignificantChanges(previousState, gitState)) {
          const changes = this.describeChanges(previousState, gitState);
          await this.broadcastGitStateUpdate(gitState, changes);
        }
      }

      this.lastKnownState = gitState;
    } catch (error) {
      console.warn('[gitclaw] Failed to update git state:', error);
    }
  }

  /** Check if git state has significant changes that should trigger notifications. */
  private hasSignificantChanges(previous: AgentGitState, current: AgentGitState): boolean {
    return (
      previous.current_branch !== current.current_branch ||
      previous.current_commit !== current.current_commit ||
      previous.uncommitted_changes !== current.uncommitted_changes ||
      Math.abs(previous.ahead_by - current.ahead_by) > 0 ||
      Math.abs(previous.behind_by - current.behind_by) > 0
    );
  }

  /** Describe changes between git states for human-readable notifications. */
  private describeChanges(previous: AgentGitState, current: AgentGitState): string[] {
    const changes: string[] = [];

    if (previous.current_branch !== current.current_branch) {
      changes.push(`Branch changed: ${previous.current_branch} → ${current.current_branch}`);
    }
    if (previous.current_commit !== current.current_commit) {
      changes.push(`New commit: ${current.current_commit}`);
    }
    if (previous.uncommitted_changes !== current.uncommitted_changes) {
      changes.push(`Uncommitted files: ${previous.uncommitted_changes} → ${current.uncommitted_changes}`);
    }
    if (previous.ahead_by !== current.ahead_by) {
      changes.push(`Commits ahead: ${previous.ahead_by} → ${current.ahead_by}`);
    }
    if (previous.behind_by !== current.behind_by) {
      changes.push(`Commits behind: ${previous.behind_by} → ${current.behind_by}`);
    }

    return changes;
  }

  /** Broadcast git state update via WebSocket to connected clients. */
  private async broadcastGitStateUpdate(_gitState: AgentGitState, changes: string[]): Promise<void> {
    // Note: This would be implemented by the gateway's WebSocket manager
    console.info(`[gitclaw] Git state update: ${changes.join(', ')}`);

    // In a full implementation, this would send a WebSocket message like:
    // {
    //   type: 'git_state_update',
    //   payload: {
    //     agent_id: this.options.agentId,
    //     git_state: gitState,
    //     changes: changes,
    //     requires_action: gitState.uncommitted_changes > 0 || gitState.behind_by > 0
    //   }
    // }
  }

  private async detectChanges(): Promise<void> {
    if (!this.lastKnownState) return;

    try {
      const status = await this.git.status();

      // Check for new commits that aren't ours
      if (status.ahead > 0) {
        const task = await this.taskManager.createTask({
          agentId: this.options.agentId,
          title: `Git changes detected: ${status.ahead} commits ahead`,
          description: `Repository has ${status.ahead} new commits to push`,
          initialStatus: 'running',
        });

        await this.taskManager.log(task.id, `Current branch: ${this.lastKnownState.current_branch}`);
        await this.taskManager.log(task.id, `Uncommitted changes: ${status.files.length}`);
        await this.taskManager.complete(task.id, 'Git state updated');
      }

      // Check for conflicts or issues
      if (status.conflicted.length > 0) {
        await this.incidentManager.createIncident({
          agentId: this.options.agentId,
          agentName: this.options.agentName,
          severity: 'warning',
          title: 'Git conflicts detected',
          description: `${status.conflicted.length} conflicted files detected: ${status.conflicted.join(', ')}`,
          actions: ['acknowledge', 'propose_fix'],
        });
      }
    } catch (error) {
      console.warn('[gitclaw] Error detecting changes:', error);
    }
  }

  private generateRepoLinks(): ResourceLink[] {
    const links: ResourceLink[] = [];

    if (this.options.repositoryUrl.includes('github.com')) {
      links.push({
        label: 'Repository',
        url: this.options.repositoryUrl,
        type: 'github_run',
      });
    }

    return links;
  }
}
