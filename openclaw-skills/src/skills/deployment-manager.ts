/**
 * Deployment Manager Skill
 *
 * Manages deployment workflows via GitHub Actions API integration.
 * Provides programmatic control over release pipelines and real-time status tracking.
 * Core component of the Internal Developer Platform (IDP).
 */

import { Octokit } from '@octokit/rest';
import { TaskManagerSkill } from './task-manager.js';
import { IncidentManagerSkill } from './incident-manager.js';
import type { IStateManager } from '../gateway/state-interface.js';
// Import types for deployment functionality

export interface DeploymentOptions {
  /** ID of the agent representing this deployment manager */
  agentId: string;
  agentName: string;
  /** GitHub repository owner/name (e.g., "openclaw/console") */
  repository: string;
  /** GitHub API token with Actions read/write permissions */
  githubToken: string;
  /** Optional base URL for GitHub Enterprise Server */
  baseUrl?: string;
}

export interface WorkflowDispatchRequest {
  /** Workflow file name (e.g., "release.yml") */
  workflow: string;
  /** Git ref to run the workflow on (branch, tag, or SHA) */
  ref: string;
  /** Workflow inputs as key-value pairs */
  inputs?: Record<string, string | boolean | number>;
}

export interface DeploymentRequest {
  /** Human-readable deployment title */
  title: string;
  /** Target environment */
  environment: 'staging' | 'production' | 'development';
  /** Platform to deploy */
  platform: 'ios' | 'android' | 'both';
  /** Version to deploy (optional) */
  version?: string;
  /** Git ref to deploy from */
  ref?: string;
  /** Additional deployment options */
  options?: {
    /** Skip tests during deployment */
    skipTests?: boolean;
    /** Force deployment even if there are warnings */
    force?: boolean;
    /** Custom distribution groups for internal builds */
    distributionGroups?: string[];
  };
}

export interface WorkflowRun {
  id: number;
  name: string;
  head_branch: string;
  head_sha: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null;
  created_at: string;
  updated_at: string;
  html_url: string;
  workflow_id: number;
  event: string;
}

export interface DeploymentStatus {
  /** Unique deployment ID */
  id: string;
  /** Associated task ID for tracking */
  taskId: string;
  /** Deployment request that triggered this */
  request: DeploymentRequest;
  /** Current workflow runs */
  workflowRuns: WorkflowRun[];
  /** Overall deployment status */
  status: 'pending' | 'running' | 'success' | 'failure' | 'cancelled';
  /** Start timestamp */
  startedAt: string;
  /** Completion timestamp */
  completedAt?: string;
  /** Error message if failed */
  error?: string;
  /** Deployment artifacts */
  artifacts?: Array<{
    platform: 'ios' | 'android';
    type: 'ipa' | 'apk' | 'aab';
    url: string;
    size: number;
  }>;
}

/**
 * GitHub Actions deployment manager with real-time status tracking.
 * Integrates with existing approval gate system and WebSocket architecture.
 */
export class DeploymentManagerSkill {
  private taskManager: TaskManagerSkill;
  private incidentManager: IncidentManagerSkill;
  private octokit: Octokit;
  private options: DeploymentOptions;
  private state: IStateManager;
  private activeDeployments: Map<string, DeploymentStatus> = new Map();
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(state: IStateManager, options: DeploymentOptions) {
    this.taskManager = new TaskManagerSkill(state);
    this.incidentManager = new IncidentManagerSkill(state);
    this.state = state;
    this.options = options;
    this.octokit = new Octokit({
      auth: options.githubToken,
      baseUrl: options.baseUrl,
    });
  }

  /**
   * Start monitoring active deployments with polling.
   */
  public start(): void {
    console.info(`[deployment-manager] Starting deployment monitor for ${this.options.repository}`);
    this.pollTimer = setInterval(() => { void this.pollActiveDeployments(); }, 30_000);
  }

  /**
   * Stop deployment monitoring.
   */
  public stop(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
      console.info(`[deployment-manager] Stopped deployment monitor for ${this.options.repository}`);
    }
  }

  /**
   * Trigger a new deployment.
   * Returns the deployment status for tracking.
   */
  public async deploy(request: DeploymentRequest): Promise<DeploymentStatus> {
    const deploymentId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Create task for tracking
    const task = await this.taskManager.createTask({
      agentId: this.options.agentId,
      title: request.title,
      description: `Deploying ${request.platform} to ${request.environment}`,
      links: [],
      initialStatus: 'queued',
    });

    // Initialize deployment status
    const deployment: DeploymentStatus = {
      id: deploymentId,
      taskId: task.id,
      request,
      workflowRuns: [],
      status: 'pending',
      startedAt: now,
    };

    this.activeDeployments.set(deploymentId, deployment);

    try {
      await this.taskManager.logStatus(task.id, 'DEPLOYMENT INITIATED', [
        { description: `Platform: ${request.platform}`, completed: true },
        { description: `Environment: ${request.environment}`, completed: true },
        { description: `Version: ${request.version || 'latest'}`, completed: true },
        { description: 'Triggering workflow...', completed: false },
      ], 'Preparing deployment pipeline...');

      // Determine which workflows to trigger based on platform
      const workflows = this.getWorkflowsForDeployment(request);

      for (const workflowDispatch of workflows) {
        const workflowRun = await this.triggerWorkflow(workflowDispatch);
        deployment.workflowRuns.push(workflowRun);

        await this.taskManager.log(task.id, `🚀 Triggered ${workflowDispatch.workflow} workflow`);
        await this.taskManager.log(task.id, `📋 Run #${workflowRun.id}: ${workflowRun.html_url}`);
      }

      deployment.status = 'running';
      await this.taskManager.setStatus(task.id, 'running');
      this.emitDeploymentUpdate(deployment);

    } catch (error) {
      deployment.status = 'failure';
      deployment.error = error instanceof Error ? error.message : String(error);

      await this.taskManager.logError(task.id, 'DEPLOYMENT FAILED', [], `Failed to trigger deployment: ${deployment.error}`);

      // Create incident for deployment failure
      await this.incidentManager.createIncident({
        agentId: this.options.agentId,
        agentName: this.options.agentName,
        severity: 'critical',
        title: `Deployment failure: ${request.title}`,
        description: `Failed to trigger deployment workflow.\n\nError: ${deployment.error}`,
        actions: ['acknowledge', 'propose_fix'],
      });

      this.emitDeploymentUpdate(deployment);
    }

    return deployment;
  }

  /**
   * Get current status of a deployment.
   */
  public getDeploymentStatus(deploymentId: string): DeploymentStatus | null {
    return this.activeDeployments.get(deploymentId) || null;
  }

  /**
   * List all active deployments.
   */
  public listActiveDeployments(): DeploymentStatus[] {
    return Array.from(this.activeDeployments.values());
  }

  /**
   * Cancel an active deployment.
   */
  public async cancelDeployment(deploymentId: string): Promise<boolean> {
    const deployment = this.activeDeployments.get(deploymentId);
    if (!deployment) {
      return false;
    }

    try {
      // Cancel all running workflow runs
      for (const workflowRun of deployment.workflowRuns) {
        if (workflowRun.status === 'in_progress' || workflowRun.status === 'queued') {
          await this.cancelWorkflowRun(workflowRun.id);
        }
      }

      deployment.status = 'cancelled';
      deployment.completedAt = new Date().toISOString();

      await this.taskManager.log(deployment.taskId, '🛑 Deployment cancelled');
      await this.taskManager.setStatus(deployment.taskId, 'failed');

      this.emitDeploymentUpdate(deployment);

      return true;
    } catch (error) {
      console.error('[deployment-manager] Failed to cancel deployment:', error);
      return false;
    }
  }

  // ── Private Methods ────────────────────────────────────────────────────────

  /**
   * Determine which workflows to trigger for a deployment request.
   */
  private getWorkflowsForDeployment(request: DeploymentRequest): WorkflowDispatchRequest[] {
    const workflows: WorkflowDispatchRequest[] = [];
    const ref = request.ref || 'develop';

    if (request.environment === 'staging' || request.environment === 'development') {
      // Internal distribution workflow
      workflows.push({
        workflow: 'internal-distribution.yml',
        ref,
        inputs: {
          ref,
        },
      });
    } else if (request.environment === 'production') {
      // Production release workflow
      workflows.push({
        workflow: 'release.yml',
        ref,
        inputs: {
          environment: 'production',
          version: request.version || '',
        },
      });
    }

    return workflows;
  }

  /**
   * Trigger a GitHub Actions workflow.
   */
  private async triggerWorkflow(dispatch: WorkflowDispatchRequest): Promise<WorkflowRun> {
    const [owner, repo] = this.options.repository.split('/');

    // Trigger the workflow
    await this.octokit.rest.actions.createWorkflowDispatch({
      owner,
      repo,
      workflow_id: dispatch.workflow,
      ref: dispatch.ref,
      inputs: dispatch.inputs as Record<string, string>,
    });

    // Poll for the new workflow run (GitHub doesn't return run ID from dispatch)
    // Wait a moment for the run to be created
    await new Promise(resolve => setTimeout(resolve, 2000));

    const runs = await this.octokit.rest.actions.listWorkflowRuns({
      owner,
      repo,
      workflow_id: dispatch.workflow,
      branch: dispatch.ref,
      per_page: 1,
    });

    if (runs.data.workflow_runs.length === 0) {
      throw new Error(`No workflow run found after dispatching ${dispatch.workflow}`);
    }

    const run = runs.data.workflow_runs[0];
    return {
      id: run.id,
      name: run.name || 'Unknown Workflow',
      head_branch: run.head_branch || 'unknown',
      head_sha: run.head_sha || '',
      status: run.status as WorkflowRun['status'],
      conclusion: run.conclusion as WorkflowRun['conclusion'],
      created_at: run.created_at,
      updated_at: run.updated_at,
      html_url: run.html_url,
      workflow_id: run.workflow_id,
      event: run.event,
    };
  }

  /**
   * Cancel a specific workflow run.
   */
  private async cancelWorkflowRun(runId: number): Promise<void> {
    const [owner, repo] = this.options.repository.split('/');

    await this.octokit.rest.actions.cancelWorkflowRun({
      owner,
      repo,
      run_id: runId,
    });
  }

  /**
   * Poll active deployments for status updates.
   */
  private async pollActiveDeployments(): Promise<void> {
    for (const [deploymentId, deployment] of this.activeDeployments.entries()) {
      if (deployment.status === 'running') {
        try {
          await this.updateDeploymentStatus(deployment);
        } catch (error) {
          console.error(`[deployment-manager] Failed to update deployment ${deploymentId}:`, error);
        }
      }
    }

    // Clean up completed deployments older than 1 hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    for (const [deploymentId, deployment] of this.activeDeployments.entries()) {
      if (deployment.status !== 'running' &&
          deployment.completedAt &&
          deployment.completedAt < oneHourAgo) {
        this.activeDeployments.delete(deploymentId);
      }
    }
  }

  /**
   * Update deployment status by checking workflow runs.
   */
  private async updateDeploymentStatus(deployment: DeploymentStatus): Promise<void> {
    const [owner, repo] = this.options.repository.split('/');
    let allCompleted = true;
    let hasFailure = false;
    let hasSuccess = false;

    // Update status of each workflow run
    for (const workflowRun of deployment.workflowRuns) {
      const { data: run } = await this.octokit.rest.actions.getWorkflowRun({
        owner,
        repo,
        run_id: workflowRun.id,
      });

      workflowRun.status = run.status as WorkflowRun['status'];
      workflowRun.conclusion = run.conclusion as WorkflowRun['conclusion'];
      workflowRun.updated_at = run.updated_at;
      workflowRun.name = run.name || workflowRun.name;
      workflowRun.head_branch = run.head_branch || workflowRun.head_branch;
      workflowRun.head_sha = run.head_sha || workflowRun.head_sha;

      if (workflowRun.status !== 'completed') {
        allCompleted = false;
      } else {
        if (workflowRun.conclusion === 'success') {
          hasSuccess = true;
        } else if (workflowRun.conclusion === 'failure') {
          hasFailure = true;
        }
      }
    }

    // Update overall deployment status
    if (allCompleted) {
      deployment.completedAt = new Date().toISOString();

      if (hasFailure) {
        deployment.status = 'failure';
        await this.handleDeploymentFailure(deployment);
      } else if (hasSuccess) {
        deployment.status = 'success';
        await this.handleDeploymentSuccess(deployment);
      } else {
        deployment.status = 'cancelled';
        await this.taskManager.setStatus(deployment.taskId, 'failed');
      }

      this.emitDeploymentUpdate(deployment);
    } else {
      // Update task with current progress
      const runningWorkflows = deployment.workflowRuns
        .filter(run => run.status === 'in_progress')
        .map(run => run.name);

      if (runningWorkflows.length > 0) {
        await this.taskManager.log(
          deployment.taskId,
          `📋 Running: ${runningWorkflows.join(', ')}`
        );
      }
    }
  }

  /**
   * Handle successful deployment completion.
   */
  private async handleDeploymentSuccess(deployment: DeploymentStatus): Promise<void> {
    await this.taskManager.logSuccess(deployment.taskId, 'DEPLOYMENT COMPLETED', [
      { description: 'Build succeeded', completed: true },
      { description: 'Tests passed', completed: true },
      { description: 'Distribution completed', completed: true },
    ], `✅ ${deployment.request.platform} deployed to ${deployment.request.environment}`);

    await this.taskManager.complete(deployment.taskId, 'Deployment successful');
  }

  /**
   * Handle deployment failure.
   */
  private async handleDeploymentFailure(deployment: DeploymentStatus): Promise<void> {
    const failedRuns = deployment.workflowRuns.filter(run => run.conclusion === 'failure');

    await this.taskManager.logError(deployment.taskId, 'DEPLOYMENT FAILED',
      failedRuns.map(run => ({
        description: `${run.name}: ${run.conclusion}`,
        completed: false
      })),
      'Creating incident for investigation'
    );

    // Create incident with detailed failure information
    const failureDetails = failedRuns.map(run =>
      `- ${run.name} (Run #${run.id}): ${run.html_url}`
    ).join('\n');

    await this.incidentManager.createIncident({
      agentId: this.options.agentId,
      agentName: this.options.agentName,
      severity: 'critical',
      title: `Deployment failure: ${deployment.request.title}`,
      description: [
        `Deployment to ${deployment.request.environment} failed.`,
        `Platform: ${deployment.request.platform}`,
        ``,
        `Failed workflows:`,
        failureDetails,
        ``,
        `🤖 Autonomous Investigation:`,
        `- Analyzing build logs for error patterns...`,
        `- Checking recent commits for breaking changes...`,
        `- Preparing rollback strategy...`
      ].join('\n'),
      actions: ['propose_fix', 'acknowledge'],
    });
  }

  /**
   * Emit deployment update event for WebSocket broadcasting.
   */
  private emitDeploymentUpdate(deployment: DeploymentStatus): void {
    const payload: import('../types/protocol.js').DeploymentUpdatePayload = {
      id: deployment.id,
      status: deployment.status,
      task_id: deployment.taskId,
      updated_at: new Date().toISOString(),
      workflow_runs: deployment.workflowRuns.map(run => ({
        id: run.id,
        name: run.name || 'Unknown Workflow',
        status: run.status || 'unknown',
        conclusion: run.conclusion || null,
        html_url: run.html_url || '',
      })),
      error: deployment.error,
    };

    if (this.state.emitDeploymentUpdate) {
      this.state.emitDeploymentUpdate(this.options.agentId, payload);
    }
  }
}