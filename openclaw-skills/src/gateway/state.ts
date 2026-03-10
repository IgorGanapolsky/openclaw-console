/**
 * In-memory state manager for the OpenClaw gateway.
 *
 * Holds agents, tasks, incidents, and approval requests.
 * Emits events whenever state changes so the WebSocket layer
 * can broadcast updates to subscribed mobile clients.
 */

import EventEmitter from 'node:events';
import { v4 as uuidv4 } from 'uuid';
import type {
  Agent,
  AgentStatus,
  Task,
  TaskStatus,
  TaskStep,
  StepType,
  Incident,
  IncidentSeverity,
  IncidentStatus,
  ActionType,
  ApprovalRequest,
  ApprovalResponse,
  ResourceLink,
} from '../types/protocol.js';
import type { IStateManager } from './state-interface.js';

// ── Event map for type-safe EventEmitter ─────────────────────────────────────

export interface StateEvents {
  agent_updated: [agent: Agent];
  task_created: [task: Task];
  task_updated: [task: Task];
  task_step_added: [step: TaskStep];
  incident_created: [incident: Incident];
  incident_updated: [incident: Incident];
  approval_created: [approval: ApprovalRequest];
  approval_responded: [response: ApprovalResponse, approval: ApprovalRequest];
  approval_expired: [approval: ApprovalRequest];
  bridge_session_new: [session: import('../types/protocol.js').BridgeSession];
  bridge_session_update: [session: import('../types/protocol.js').BridgeSession];
}

export type StateEventName = keyof StateEvents;

/** Typed EventEmitter wrapper for state changes. */
class TypedStateEmitter extends EventEmitter {
  emit<K extends StateEventName>(event: K, ...args: StateEvents[K]): boolean {
    return super.emit(event, ...args);
  }

  on<K extends StateEventName>(event: K, listener: (...args: StateEvents[K]) => void): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  once<K extends StateEventName>(event: K, listener: (...args: StateEvents[K]) => void): this {
    return super.once(event, listener as (...args: unknown[]) => void);
  }
}

// ── Approval pending map ─────────────────────────────────────────────────────

interface PendingApproval {
  request: ApprovalRequest;
  /** Node timeout handle for expiry */
  expiryTimer: ReturnType<typeof setTimeout>;
  /** Resolve/reject for callers awaiting the decision */
  resolve: (response: ApprovalResponse) => void;
  reject: (reason: Error) => void;
}

// ── StateManager ─────────────────────────────────────────────────────────────

/** Centralized in-memory store with event emission on mutations. */
export class StateManager implements IStateManager {
  public readonly events: TypedStateEmitter = new TypedStateEmitter();

  private agents: Map<string, Agent> = new Map();
  private tasks: Map<string, Task> = new Map();
  private incidents: Map<string, Incident> = new Map();
  private approvals: Map<string, PendingApproval> = new Map();
  private bridgeSessions: Map<string, import('../types/protocol.js').BridgeSession> = new Map();

  // ── Agent ─────────────────────────────────────────────────────────────────

  /**
   * Register or fully replace an agent in the registry.
   */
  public async upsertAgent(agent: Agent): Promise<Agent> {
    this.agents.set(agent.id, agent);
    this.events.emit('agent_updated', agent);
    return agent;
  }

  /**
   * Update specific fields on an agent. Emits agent_updated.
   */
  public async updateAgentStatus(agentId: string, status: AgentStatus): Promise<Agent | null> {
    const agent = this.agents.get(agentId);
    if (!agent) return null;
    agent.status = status;
    agent.last_active = new Date().toISOString();
    this.agents.set(agentId, agent);
    this.events.emit('agent_updated', agent);
    return agent;
  }

  public getAgent(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  public listAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  /** Recompute derived counters (active_tasks, pending_approvals) for an agent. */
  public recomputeAgentCounters(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    agent.active_tasks = Array.from(this.tasks.values()).filter(
      (t) => t.agent_id === agentId && (t.status === 'running' || t.status === 'queued'),
    ).length;
    agent.pending_approvals = Array.from(this.approvals.values()).filter(
      (a) => a.request.agent_id === agentId,
    ).length;
    this.agents.set(agentId, agent);
    this.events.emit('agent_updated', agent);
  }

  // ── Task ─────────────────────────────────────────────────────────────────

  /**
   * Create a new task and emit task_created.
   */
  public async createTask(params: {
    agent_id: string;
    title: string;
    description: string;
    links?: ResourceLink[];
  }): Promise<Task> {
    const now = new Date().toISOString();
    const task: Task = {
      id: uuidv4(),
      agent_id: params.agent_id,
      title: params.title,
      description: params.description,
      status: 'queued',
      created_at: now,
      updated_at: now,
      steps: [],
      links: params.links ?? [],
    };
    this.tasks.set(task.id, task);
    this.events.emit('task_created', task);
    this.recomputeAgentCounters(params.agent_id);
    return task;
  }

  /**
   * Update the status of a task. Emits task_updated.
   */
  public async updateTaskStatus(taskId: string, status: TaskStatus): Promise<Task | null> {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    task.status = status;
    task.updated_at = new Date().toISOString();
    this.tasks.set(taskId, task);
    this.events.emit('task_updated', task);
    this.recomputeAgentCounters(task.agent_id);
    return task;
  }

  /**
   * Append a step to a task timeline. Emits task_step_added.
   */
  public async addTaskStep(params: {
    task_id: string;
    type: StepType;
    content: string;
    metadata?: Record<string, unknown>;
  }): Promise<TaskStep | null> {
    const task = this.tasks.get(params.task_id);
    if (!task) return null;
    const step: TaskStep = {
      id: uuidv4(),
      task_id: params.task_id,
      type: params.type,
      content: params.content,
      timestamp: new Date().toISOString(),
      metadata: params.metadata ?? {},
    };
    task.steps.push(step);
    task.updated_at = step.timestamp;
    this.tasks.set(task.id, task);
    this.events.emit('task_step_added', step);
    return step;
  }

  public getTask(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  public listTasksForAgent(agentId: string): Task[] {
    return Array.from(this.tasks.values()).filter((t) => t.agent_id === agentId);
  }

  public listAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  // ── Incident ──────────────────────────────────────────────────────────────

  /**
   * Create a new incident. Emits incident_created.
   */
  public async createIncident(params: {
    agent_id: string;
    agent_name: string;
    severity: IncidentSeverity;
    title: string;
    description: string;
    actions?: ActionType[];
  }): Promise<Incident> {
    const now = new Date().toISOString();
    const incident: Incident = {
      id: uuidv4(),
      agent_id: params.agent_id,
      agent_name: params.agent_name,
      severity: params.severity,
      title: params.title,
      description: params.description,
      status: 'open',
      created_at: now,
      updated_at: now,
      actions: params.actions ?? ['ask_root_cause', 'propose_fix', 'acknowledge'],
    };
    this.incidents.set(incident.id, incident);
    this.events.emit('incident_created', incident);
    return incident;
  }

  /**
   * Update an incident's status. Emits incident_updated.
   */
  public async updateIncidentStatus(incidentId: string, status: IncidentStatus): Promise<Incident | null> {
    const incident = this.incidents.get(incidentId);
    if (!incident) return null;
    incident.status = status;
    incident.updated_at = new Date().toISOString();
    this.incidents.set(incidentId, incident);
    this.events.emit('incident_updated', incident);
    return incident;
  }

  public getIncident(id: string): Incident | undefined {
    return this.incidents.get(id);
  }

  public listIncidents(): Incident[] {
    return Array.from(this.incidents.values());
  }

  // ── Bridge Session ────────────────────────────────────────────────────────

  /**
   * Register or update an external bridge session (IDE/terminal).
   */
  public async upsertBridgeSession(session: import('../types/protocol.js').BridgeSession): Promise<import('../types/protocol.js').BridgeSession> {
    const exists = this.bridgeSessions.has(session.id);
    this.bridgeSessions.set(session.id, session);
    
    if (exists) {
      this.events.emit('bridge_session_update', session);
    } else {
      this.events.emit('bridge_session_new', session);
    }
    
    return session;
  }

  public listBridgeSessions(): import('../types/protocol.js').BridgeSession[] {
    return Array.from(this.bridgeSessions.values());
  }

  // ── Approval ──────────────────────────────────────────────────────────────

  /**
   * Queue an approval request with an expiry timer.
   * Returns a Promise that resolves/rejects when the user responds or time runs out.
   */
  public queueApproval(
    request: ApprovalRequest,
    timeoutMs: number,
  ): Promise<ApprovalResponse> {
    return new Promise<ApprovalResponse>((resolve, reject) => {
      const expiryTimer = setTimeout(() => {
        this.approvals.delete(request.id);
        this.recomputeAgentCounters(request.agent_id);
        this.events.emit('approval_expired', request);
        reject(new Error(`Approval ${request.id} expired`));
      }, timeoutMs);

      this.approvals.set(request.id, { request, expiryTimer, resolve, reject });
      this.recomputeAgentCounters(request.agent_id);
      this.events.emit('approval_created', request);
    });
  }

  /**
   * Respond to a pending approval. Resolves or rejects the queued Promise.
   * Returns the ApprovalRequest if found, null otherwise.
   */
  public respondToApproval(response: ApprovalResponse): ApprovalRequest | null {
    const pending = this.approvals.get(response.approval_id);
    if (!pending) return null;

    clearTimeout(pending.expiryTimer);
    this.approvals.delete(response.approval_id);
    this.recomputeAgentCounters(pending.request.agent_id);
    this.events.emit('approval_responded', response, pending.request);
    pending.resolve(response);
    return pending.request;
  }

  public getPendingApproval(id: string): ApprovalRequest | undefined {
    return this.approvals.get(id)?.request;
  }

  public listPendingApprovals(): ApprovalRequest[] {
    return Array.from(this.approvals.values()).map((p) => p.request);
  }

  // ── Bulk load (seed data) ─────────────────────────────────────────────────

  /**
   * Load pre-built agents, tasks, incidents, and approvals silently
   * (no event emission) for seed data bootstrap.
   */
  public bulkLoad(data: {
    agents?: Agent[];
    tasks?: Task[];
    incidents?: Incident[];
  }): void {
    data.agents?.forEach((a) => this.agents.set(a.id, a));
    data.tasks?.forEach((t) => this.tasks.set(t.id, t));
    data.incidents?.forEach((i) => this.incidents.set(i.id, i));
  }
}
