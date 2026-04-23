/**
 * In-memory state manager for the OpenClaw gateway.
 *
 * Holds agents, tasks, incidents, and approval requests.
 * Emits events whenever state changes so the WebSocket layer
 * can broadcast updates to subscribed mobile clients.
 */

import EventEmitter from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
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
  BridgeSession,
  RecurringTask,
  AgentGovernanceState,
  AgentPlanStep,
  AgentPlanStepStatus,
  EnvironmentObservation,
  GovernanceEvent,
  GovernanceEventType,
  RollbackPoint,
  RiskLevel,
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
  bridge_session_new: [session: BridgeSession];
  bridge_session_update: [session: BridgeSession];
  recurring_task_updated: [task: RecurringTask];
  governance_event: [event: GovernanceEvent];
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

export interface StateManagerOptions {
  governanceEventLogPath?: string | null;
}

// ── StateManager ─────────────────────────────────────────────────────────────

/** Centralized in-memory store with event emission on mutations. */
export class StateManager implements IStateManager {
  public readonly events: TypedStateEmitter = new TypedStateEmitter();

  private agents: Map<string, Agent> = new Map();
  private tasks: Map<string, Task> = new Map();
  private incidents: Map<string, Incident> = new Map();
  private approvals: Map<string, PendingApproval> = new Map();
  private bridgeSessions: Map<string, BridgeSession> = new Map();
  private recurringTasks: Map<string, RecurringTask> = new Map();
  private governanceStates: Map<string, AgentGovernanceState> = new Map();
  private governanceEvents: GovernanceEvent[] = [];
  private readonly governanceEventLogPath: string | null;

  public constructor(options: StateManagerOptions = {}) {
    this.governanceEventLogPath = options.governanceEventLogPath ?? null;
    this.loadGovernanceEvents();
  }

  private governanceFor(agentId: string): AgentGovernanceState {
    let state = this.governanceStates.get(agentId);
    if (!state) {
      state = {
        agent_id: agentId,
        current_objective: null,
        objective_updated_at: null,
        plan: [],
        environment: [],
        rollback_points: [],
        events: [],
      };
      this.governanceStates.set(agentId, state);
    }
    return state;
  }

  private cloneGovernanceState(agentId: string): AgentGovernanceState {
    const state = this.governanceFor(agentId);
    return {
      agent_id: state.agent_id,
      current_objective: state.current_objective,
      objective_updated_at: state.objective_updated_at,
      plan: state.plan.map((step) => ({ ...step, evidence: [...step.evidence] })),
      environment: state.environment.map((observation) => ({ ...observation, metadata: { ...observation.metadata } })),
      rollback_points: state.rollback_points.map((point) => ({ ...point, metadata: { ...point.metadata } })),
      events: state.events.map((event) => ({ ...event, metadata: { ...event.metadata } })),
    };
  }

  private loadGovernanceEvents(): void {
    if (!this.governanceEventLogPath || !fs.existsSync(this.governanceEventLogPath)) return;

    const contents = fs.readFileSync(this.governanceEventLogPath, 'utf8');
    for (const line of contents.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const event = JSON.parse(trimmed) as GovernanceEvent;
        this.applyGovernanceEvent(event, false);
      } catch (err) {
        console.warn('[state] Skipping invalid governance event log line:', err);
      }
    }
  }

  private persistGovernanceEvent(event: GovernanceEvent): void {
    if (!this.governanceEventLogPath) return;
    try {
      fs.mkdirSync(path.dirname(this.governanceEventLogPath), { recursive: true });
      fs.appendFileSync(this.governanceEventLogPath, `${JSON.stringify(event)}\n`, 'utf8');
    } catch (err) {
      console.warn('[state] Failed to persist governance event:', err);
    }
  }

  private applyGovernanceEvent(event: GovernanceEvent, emit: boolean): GovernanceEvent {
    this.governanceEvents.push(event);
    const state = this.governanceFor(event.agent_id);

    switch (event.type) {
      case 'agent_objective_updated':
        if (typeof event.metadata['objective'] === 'string') {
          state.current_objective = event.metadata['objective'];
          state.objective_updated_at = event.created_at;
        }
        break;
      case 'agent_plan_step_upserted': {
        const step = event.metadata['plan_step'] as AgentPlanStep | undefined;
        if (step?.id) {
          const index = state.plan.findIndex((item) => item.id === step.id);
          if (index >= 0) {
            state.plan[index] = step;
          } else {
            state.plan.push(step);
          }
        }
        break;
      }
      case 'environment_observed': {
        const observation = event.metadata['observation'] as EnvironmentObservation | undefined;
        if (observation?.id && !state.environment.some((item) => item.id === observation.id)) {
          state.environment.push(observation);
          state.environment = state.environment.slice(-100);
        }
        break;
      }
      case 'rollback_point_added': {
        const point = event.metadata['rollback_point'] as RollbackPoint | undefined;
        if (point?.id && !state.rollback_points.some((item) => item.id === point.id)) {
          state.rollback_points.push(point);
        }
        break;
      }
      default:
        break;
    }

    state.events.push(event);
    if (state.events.length > 250) {
      state.events = state.events.slice(-250);
    }
    this.governanceStates.set(event.agent_id, state);
    if (emit) {
      this.events.emit('governance_event', event);
    }
    return event;
  }

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
    await this.recordGovernanceEvent({
      agent_id: params.agent_id,
      type: 'task_state_changed',
      title: task.title,
      summary: 'Task queued',
      actor: 'gateway',
      task_id: task.id,
      metadata: { status: task.status },
    });
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
    await this.recordGovernanceEvent({
      agent_id: task.agent_id,
      type: 'task_state_changed',
      title: task.title,
      summary: `Task ${status}`,
      actor: 'gateway',
      task_id: task.id,
      metadata: { status },
    });
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
    await this.recordGovernanceEvent({
      agent_id: params.agent_id,
      type: 'incident_state_changed',
      title: params.title,
      summary: `Incident opened: ${params.severity}`,
      actor: 'gateway',
      incident_id: incident.id,
      metadata: { status: incident.status, severity: params.severity },
    });
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
    await this.recordGovernanceEvent({
      agent_id: incident.agent_id,
      type: 'incident_state_changed',
      title: incident.title,
      summary: `Incident ${status}`,
      actor: 'gateway',
      incident_id: incident.id,
      metadata: { status },
    });
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
  public async upsertBridgeSession(session: BridgeSession): Promise<BridgeSession> {
    const exists = this.bridgeSessions.has(session.id);
    this.bridgeSessions.set(session.id, session);
    
    if (exists) {
      this.events.emit('bridge_session_update', session);
    } else {
      this.events.emit('bridge_session_new', session);
    }
    
    return session;
  }

  public listBridgeSessions(): BridgeSession[] {
    return Array.from(this.bridgeSessions.values());
  }

  // ── Recurring Tasks ───────────────────────────────────────────────────────

  public async upsertRecurringTask(task: RecurringTask): Promise<RecurringTask> {
    this.recurringTasks.set(task.id, task);
    this.events.emit('recurring_task_updated', task);
    return task;
  }

  public listRecurringTasks(): RecurringTask[] {
    return Array.from(this.recurringTasks.values());
  }

  // ── Governance ───────────────────────────────────────────────────────────

  public getAgentGovernance(agentId: string): AgentGovernanceState {
    return this.cloneGovernanceState(agentId);
  }

  public async updateAgentObjective(
    agentId: string,
    objective: string,
    actor: GovernanceEvent['actor'] = 'agent',
  ): Promise<AgentGovernanceState> {
    const now = new Date().toISOString();
    const state = this.governanceFor(agentId);
    state.current_objective = objective;
    state.objective_updated_at = now;
    this.governanceStates.set(agentId, state);
    await this.recordGovernanceEvent({
      agent_id: agentId,
      type: 'agent_objective_updated',
      title: 'Agent objective updated',
      summary: objective,
      actor,
      metadata: { objective },
    });
    return this.cloneGovernanceState(agentId);
  }

  public async upsertAgentPlanStep(params: {
    agent_id: string;
    id?: string;
    title: string;
    details?: string;
    status?: AgentPlanStepStatus;
    owner?: string | null;
    evidence?: AgentPlanStep['evidence'];
    actor?: GovernanceEvent['actor'];
  }): Promise<AgentPlanStep> {
    const now = new Date().toISOString();
    const state = this.governanceFor(params.agent_id);
    const existingIndex = params.id ? state.plan.findIndex((step) => step.id === params.id) : -1;
    const existing = existingIndex >= 0 ? state.plan[existingIndex] : null;
    const step: AgentPlanStep = {
      id: existing?.id ?? params.id ?? uuidv4(),
      agent_id: params.agent_id,
      title: params.title,
      details: params.details ?? existing?.details ?? '',
      status: params.status ?? existing?.status ?? 'pending',
      owner: params.owner ?? existing?.owner ?? null,
      evidence: params.evidence ?? existing?.evidence ?? [],
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };

    if (existingIndex >= 0) {
      state.plan[existingIndex] = step;
    } else {
      state.plan.push(step);
    }
    this.governanceStates.set(params.agent_id, state);
    await this.recordGovernanceEvent({
      agent_id: params.agent_id,
      type: 'agent_plan_step_upserted',
      title: step.title,
      summary: `Plan step is ${step.status}`,
      actor: params.actor ?? 'agent',
      metadata: { plan_step: step, plan_step_id: step.id, status: step.status, owner: step.owner },
    });
    return step;
  }

  public async recordEnvironmentObservation(params: {
    agent_id: string;
    source: string;
    summary: string;
    metadata?: Record<string, unknown>;
    actor?: GovernanceEvent['actor'];
  }): Promise<EnvironmentObservation> {
    const observation: EnvironmentObservation = {
      id: uuidv4(),
      agent_id: params.agent_id,
      source: params.source,
      summary: params.summary,
      observed_at: new Date().toISOString(),
      metadata: params.metadata ?? {},
    };
    const state = this.governanceFor(params.agent_id);
    state.environment.push(observation);
    state.environment = state.environment.slice(-100);
    this.governanceStates.set(params.agent_id, state);
    await this.recordGovernanceEvent({
      agent_id: params.agent_id,
      type: 'environment_observed',
      title: params.source,
      summary: params.summary,
      actor: params.actor ?? 'agent',
      metadata: { observation, observation_id: observation.id, ...observation.metadata },
    });
    return observation;
  }

  public async addRollbackPoint(params: {
    agent_id: string;
    action_type: ActionType;
    title: string;
    description: string;
    command: string;
    metadata?: Record<string, unknown>;
    actor?: GovernanceEvent['actor'];
  }): Promise<RollbackPoint> {
    const point: RollbackPoint = {
      id: uuidv4(),
      agent_id: params.agent_id,
      action_type: params.action_type,
      title: params.title,
      description: params.description,
      command: params.command,
      created_at: new Date().toISOString(),
      metadata: params.metadata ?? {},
    };
    const state = this.governanceFor(params.agent_id);
    state.rollback_points.push(point);
    this.governanceStates.set(params.agent_id, state);
    await this.recordGovernanceEvent({
      agent_id: params.agent_id,
      type: 'rollback_point_added',
      title: params.title,
      summary: params.description,
      actor: params.actor ?? 'agent',
      rollback_point_id: point.id,
      metadata: { rollback_point: point, action_type: params.action_type, ...point.metadata },
    });
    return point;
  }

  public async recordGovernanceEvent(params: {
    agent_id: string;
    type: GovernanceEventType;
    title: string;
    summary: string;
    actor: GovernanceEvent['actor'];
    risk_level?: RiskLevel;
    approval_id?: string;
    task_id?: string;
    incident_id?: string;
    rollback_point_id?: string;
    metadata?: Record<string, unknown>;
  }): Promise<GovernanceEvent> {
    const event: GovernanceEvent = {
      id: uuidv4(),
      agent_id: params.agent_id,
      type: params.type,
      title: params.title,
      summary: params.summary,
      created_at: new Date().toISOString(),
      actor: params.actor,
      risk_level: params.risk_level,
      approval_id: params.approval_id,
      task_id: params.task_id,
      incident_id: params.incident_id,
      rollback_point_id: params.rollback_point_id,
      metadata: params.metadata ?? {},
    };
    const applied = this.applyGovernanceEvent(event, true);
    this.persistGovernanceEvent(applied);
    return applied;
  }

  public listGovernanceEvents(agentId?: string, limit = 100): GovernanceEvent[] {
    const events = agentId
      ? this.governanceEvents.filter((event) => event.agent_id === agentId)
      : this.governanceEvents;
    return events.slice(-Math.max(1, Math.min(limit, 500)));
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
        void this.recordGovernanceEvent({
          agent_id: request.agent_id,
          type: 'approval_expired',
          title: request.title,
          summary: 'Approval expired without a human decision',
          actor: 'gateway',
          risk_level: request.context.risk_level,
          approval_id: request.id,
          metadata: { action_type: request.action_type, command: request.command },
        });
        reject(new Error(`Approval ${request.id} expired`));
      }, timeoutMs);

      this.approvals.set(request.id, { request, expiryTimer, resolve, reject });
      this.recomputeAgentCounters(request.agent_id);
      void this.recordGovernanceEvent({
        agent_id: request.agent_id,
        type: 'approval_requested',
        title: request.title,
        summary: request.description,
        actor: 'agent',
        risk_level: request.context.risk_level,
        approval_id: request.id,
        metadata: {
          action_type: request.action_type,
          command: request.command,
          context: request.context,
          expires_at: request.expires_at,
        },
      });
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
    void this.recordGovernanceEvent({
      agent_id: pending.request.agent_id,
      type: 'approval_decided',
      title: pending.request.title,
      summary: `Approval ${response.decision}`,
      actor: 'human',
      risk_level: pending.request.context.risk_level,
      approval_id: response.approval_id,
      metadata: {
        action_type: pending.request.action_type,
        biometric_verified: response.biometric_verified,
        responded_at: response.responded_at,
      },
    });
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
