/**
 * CI/CD Monitoring Skill
 *
 * Watches GitHub Actions workflows (simulated polling loop).
 * Creates Task entries for CI runs, Incident entries for failures,
 * and annotates tasks with steps as CI progresses.
 */

import { TaskManagerSkill } from './task-manager.js';
import { IncidentManagerSkill } from './incident-manager.js';
import type { IStateManager } from '../gateway/state-interface.js';
import type { Task, ResourceLink } from '../types/protocol.js';

export interface CiMonitorOptions {
  /** ID of the agent representing this CI monitor */
  agentId: string;
  agentName: string;
  /** GitHub org/repo slug, e.g. "myorg/myservice" */
  repository: string;
  /** Polling interval in milliseconds */
  pollIntervalMs?: number;
}

export interface SimulatedWorkflowRun {
  runId: string;
  workflow: string;
  branch: string;
  commit: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'cancelled' | null;
  startedAt: string;
  updatedAt: string;
}

/**
 * CI/CD monitoring skill that tracks workflow runs and surfaces failures
 * as incidents on the mobile console.
 */
export class CiMonitorSkill {
  private taskManager: TaskManagerSkill;
  private incidentManager: IncidentManagerSkill;
  private options: Required<CiMonitorOptions>;
  private activeTasks: Map<string, string> = new Map(); // runId → taskId
  private timer: ReturnType<typeof setInterval> | null = null;
  private runCounter = 0;

  constructor(state: IStateManager, options: CiMonitorOptions) {
    this.taskManager = new TaskManagerSkill(state);
    this.incidentManager = new IncidentManagerSkill(state);
    this.options = {
      pollIntervalMs: 30_000,
      ...options,
    };
  }

  /**
   * Start the polling loop. Fires an immediate tick, then repeats.
   */
  public start(): void {
    console.info(`[ci-monitor] Starting monitor for ${this.options.repository}`);
    void this.tick();
    this.timer = setInterval(() => { void this.tick(); }, this.options.pollIntervalMs);
  }

  /** Stop the polling loop. */
  public stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
      console.info(`[ci-monitor] Stopped monitor for ${this.options.repository}`);
    }
  }

  // ── Simulated poll ────────────────────────────────────────────────────────

  private async tick(): Promise<void> {
    const runs = await this.fetchWorkflowRuns();
    for (const run of runs) {
      await this.processRun(run);
    }
  }

  /**
   * Simulate fetching workflow runs from the GitHub API.
   * In production, replace with actual API calls using octokit.
   */
  private async fetchWorkflowRuns(): Promise<SimulatedWorkflowRun[]> {
    this.runCounter++;
    const now = new Date().toISOString();

    // Simulate one new run every other tick; every 5th run fails
    const runs: SimulatedWorkflowRun[] = [];

    if (this.runCounter % 2 === 0) {
      const runId = `run-${this.runCounter}`;
      const isFailing = this.runCounter % 5 === 0;

      runs.push({
        runId,
        workflow: 'CI',
        branch: 'main',
        commit: `abc${this.runCounter.toString(16).padStart(4, '0')}ef`,
        status: 'completed',
        conclusion: isFailing ? 'failure' : 'success',
        startedAt: new Date(Date.now() - 120_000).toISOString(),
        updatedAt: now,
      });
    }

    return runs;
  }

  private async processRun(run: SimulatedWorkflowRun): Promise<void> {
    const runUrl = `https://github.com/${this.options.repository}/actions/runs/${run.runId}`;

    const links: ResourceLink[] = [
      {
        label: `Run #${run.runId}`,
        url: runUrl,
        type: 'github_run',
      },
    ];

    if (!this.activeTasks.has(run.runId)) {
      // First time seeing this run — create a task
      const task: Task = await this.taskManager.createTask({
        agentId: this.options.agentId,
        title: `CI: ${run.workflow} (${run.branch}@${run.commit.slice(0, 7)})`,
        description: `GitHub Actions workflow "${run.workflow}" on ${this.options.repository}`,
        links,
        initialStatus: run.status === 'queued' ? 'queued' : 'running',
      });
      this.activeTasks.set(run.runId, task.id);

      await this.taskManager.log(task.id, `Workflow "${run.workflow}" triggered on branch "${run.branch}"`);
      await this.taskManager.log(task.id, `Commit: ${run.commit}`);
      await this.taskManager.recordToolCall(task.id, 'github_api.get_workflow_run', { run_id: run.runId, repo: this.options.repository });
    }

    const taskId = this.activeTasks.get(run.runId);
    if (!taskId) return;

    if (run.status === 'completed') {
      if (run.conclusion === 'success') {
        await this.taskManager.log(taskId, `Workflow completed successfully`, { conclusion: 'success' });
        await this.taskManager.complete(taskId, `✓ CI passed for ${run.branch}@${run.commit.slice(0, 7)}`);
      } else if (run.conclusion === 'failure') {
        await this.taskManager.log(taskId, `Workflow FAILED`, { conclusion: 'failure' });
        await this.taskManager.recordError(taskId, `CI failure on ${run.branch} — commit ${run.commit.slice(0, 7)}`);

        // Surface as incident with proactive triage
        const incident = await this.incidentManager.createIncident({
          agentId: this.options.agentId,
          agentName: this.options.agentName,
          severity: 'warning',
          title: `CI failure: ${run.workflow} on ${run.branch}`,
          description: [
            `Workflow "${run.workflow}" failed on branch "${run.branch}".`,
            `Commit: ${run.commit}`,
            `Repository: ${this.options.repository}`,
            `Run URL: ${runUrl}`,
            ``,
            `🤖 Autonomous Triage Loop Initiated:`,
            `- Extracting build logs...`,
            `- Searching for known error patterns...`,
            `- Formulating proposed fix...`
          ].join('\n'),
          actions: ['ask_root_cause', 'propose_fix', 'acknowledge'],
        });
        
        // Simulate background triage process
        setTimeout(async () => {
          console.info(`[ci-monitor] Proactive triage complete for incident ${incident.id}`);
          
          // Enhanced: If we have an MCP research tool, log that we used it
          await this.taskManager.log(taskId, "🤖 Proactive Research: Querying internal knowledge base for similar CI failures...");
          await this.taskManager.recordToolCall(taskId, "mcp.research_failure", { error: "exit code 1", context: runUrl });

          if (this.incidentManager.executeAction) {
            await this.incidentManager.executeAction(incident.id, 'propose_fix');
          }
        }, 5000);
      } else {
        await this.taskManager.log(taskId, `Workflow ${run.conclusion ?? 'ended'}`);
        await this.taskManager.setStatus(taskId, 'done');
      }

      this.activeTasks.delete(run.runId);
    }
  }
}
