import { TaskManagerSkill } from './task-manager.js';
import { IncidentManagerSkill } from './incident-manager.js';
import type { IStateManager } from '../gateway/state-interface.js';
import type { Incident } from '../types/protocol.js';

export interface DailyBriefOptions {
  agentId: string;
  agentName: string;
  intervalMs?: number;
}

export class DailyBriefSkill {
  private taskManager: TaskManagerSkill;
  private incidentManager: IncidentManagerSkill;
  private timer: ReturnType<typeof setInterval> | null = null;
  private options: Required<DailyBriefOptions>;
  private loopId: string;

  constructor(private state: IStateManager, options: DailyBriefOptions) {
    this.taskManager = new TaskManagerSkill(state);
    this.incidentManager = new IncidentManagerSkill(state);
    this.options = {
      intervalMs: 86400000, // 24 hours default
      ...options,
    };
    this.loopId = `loop-brief-${this.options.agentId}`;
  }

  public async start(): Promise<void> {
    console.info(`[daily-brief] Starting autonomous loop for ${this.options.agentName}`);
    
    // Register the loop in state
    if (this.state.upsertRecurringTask) {
      await this.state.upsertRecurringTask({
        id: this.loopId,
        agent_id: this.options.agentId,
        name: 'Morning Cockpit Summary',
        description: 'Triage loop across active bridges, repos, and trading logs.',
        schedule: { type: 'interval', value: this.options.intervalMs },
        last_run: null,
        next_run: new Date(Date.now() + this.options.intervalMs).toISOString(),
        status: 'active',
        error_count: 0
      });
    }

    // Run first tick after 5 seconds to let system boot, then on interval
    setTimeout(() => { void this.tick(); }, 5000);
    this.timer = setInterval(() => { void this.tick(); }, this.options.intervalMs);
  }

  public async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    
    if (this.state.upsertRecurringTask && this.state.listRecurringTasks) {
      const tasks = await this.state.listRecurringTasks();
      const myTask = tasks.find(t => t.id === this.loopId);
      if (myTask) {
        await this.state.upsertRecurringTask({ ...myTask, status: 'paused' });
      }
    }
  }

  private async tick(): Promise<void> {
    console.info(`[daily-brief] Running proactive background check...`);
    const now = new Date().toISOString();

    if (this.state.upsertRecurringTask && this.state.listRecurringTasks) {
      const tasks = await this.state.listRecurringTasks();
      const myTask = tasks.find(t => t.id === this.loopId);
      if (myTask) {
        await this.state.upsertRecurringTask({
          ...myTask,
          last_run: now,
          next_run: new Date(Date.now() + this.options.intervalMs).toISOString()
        });
      }
    }

    try {
      // Create a task to represent the triage process
      const task = await this.taskManager.createTask({
        agentId: this.options.agentId,
        title: 'Morning Cockpit Summary',
        description: 'Aggregating system state across all connected skills and bridges.',
        initialStatus: 'running'
      });

      // Gather state
      let openIncidents: Incident[] = [];
      if (this.state.listIncidents) {
        const allIncidents = await this.state.listIncidents();
        openIncidents = allIncidents.filter(i => i.status === 'open');
      }

      await this.taskManager.log(task.id, `Found ${openIncidents.length} open incidents requiring attention.`);

      let bridgesCount = 0;
      if (this.state.listBridgeSessions) {
        const bridges = await this.state.listBridgeSessions();
        bridgesCount = bridges.filter(b => !b.closed).length;
      }
      
      await this.taskManager.log(task.id, `Detected ${bridgesCount} active IDE/Terminal bridge sessions.`);

      // Send the summary (simulated via an incident with info severity)
      await this.incidentManager.createIncident({
        agentId: this.options.agentId,
        agentName: this.options.agentName,
        severity: 'info',
        title: 'Executive Daily Brief',
        description: [
          `Good morning! Here is your system summary:`,
          ``,
          `🔴 Critical Decisions Needed: ${openIncidents.length}`,
          `🌉 Active Remote Sessions: ${bridgesCount}`,
          ``,
          `Top priorities:`,
          ...(openIncidents.slice(0, 3).map(i => `- [${i.severity.toUpperCase()}] ${i.title}`)),
          openIncidents.length === 0 ? `- All systems nominal. No immediate action required.` : ''
        ].join('\n'),
        actions: ['acknowledge']
      });

      await this.taskManager.complete(task.id, 'Daily brief generated successfully.');

    } catch (err: any) {
      console.error(`[daily-brief] Failed to run triage: ${err.message}`);
      if (this.state.upsertRecurringTask && this.state.listRecurringTasks) {
        const tasks = await this.state.listRecurringTasks();
        const myTask = tasks.find(t => t.id === this.loopId);
        if (myTask) {
          await this.state.upsertRecurringTask({ ...myTask, error_count: myTask.error_count + 1 });
        }
      }
    }
  }
}
