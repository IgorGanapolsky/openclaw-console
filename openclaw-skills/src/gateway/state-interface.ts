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
  ResourceLink,
  ActionType,
  ApprovalRequest,
  ApprovalResponse,
  BridgeSession,
  RecurringTask,
  SkillWorkflowSystem,
  AgentGovernanceState,
  AgentPlanStep,
  AgentPlanStepStatus,
  EnvironmentObservation,
  GovernanceEvent,
  GovernanceEventType,
  RollbackPoint,
} from '../types/protocol.js';

/**
 * IStateManager — Common interface for both local (in-process) and remote (isolated) state management.
 * 
 * Local: StateManager
 * Remote: RemoteStateManager
 */
export interface IStateManager {
  updateAgentStatus(agentId: string, status: AgentStatus): Promise<Agent | null | void>;

  getAgent(id: string): Promise<Agent | undefined> | Agent | undefined;
  upsertAgent(agent: Agent): Promise<Agent>;

  createTask(params: {
    agent_id: string;
    title: string;
    description: string;
    links?: ResourceLink[];
  }): Promise<Task>;
  
  updateTaskStatus(taskId: string, status: TaskStatus): Promise<Task | null>;
  
  addTaskStep(params: {
    task_id: string;
    type: StepType;
    content: string;
    metadata?: Record<string, unknown>;
  }): Promise<TaskStep | null>;
  
  createIncident(params: {
    agent_id: string;
    agent_name: string;
    severity: IncidentSeverity;
    title: string;
    description: string;
    actions?: ActionType[];
  }): Promise<Incident>;
  
  queueApproval(request: ApprovalRequest, timeoutMs: number): Promise<ApprovalResponse>;
  
  updateIncidentStatus?(incidentId: string, status: IncidentStatus): Promise<Incident | null>;
  
  getTask?(taskId: string): Promise<Task | undefined> | Task | undefined;
  listTasksForAgent?(agentId: string): Promise<Task[]> | Task[];
  getIncident?(incidentId: string): Promise<Incident | undefined> | Incident | undefined;
  listIncidents?(): Promise<Incident[]> | Incident[];

  upsertBridgeSession(session: BridgeSession): Promise<BridgeSession>;
  listBridgeSessions?(): Promise<BridgeSession[]> | BridgeSession[];

  upsertRecurringTask?(task: RecurringTask): Promise<RecurringTask>;
  listRecurringTasks?(): Promise<RecurringTask[]> | RecurringTask[];

  upsertSkillWorkflowSystem?(workflow: SkillWorkflowSystem): Promise<SkillWorkflowSystem>;
  listSkillWorkflowSystems?(agentId?: string): Promise<SkillWorkflowSystem[]> | SkillWorkflowSystem[];
  getSkillWorkflowSystem?(id: string): Promise<SkillWorkflowSystem | undefined> | SkillWorkflowSystem | undefined;

  getAgentGovernance?(agentId: string): Promise<AgentGovernanceState> | AgentGovernanceState;
  updateAgentObjective?(agentId: string, objective: string, actor?: GovernanceEvent['actor']): Promise<AgentGovernanceState>;
  upsertAgentPlanStep?(params: {
    agent_id: string;
    id?: string;
    title: string;
    details?: string;
    status?: AgentPlanStepStatus;
    owner?: string | null;
    evidence?: AgentPlanStep['evidence'];
    actor?: GovernanceEvent['actor'];
  }): Promise<AgentPlanStep>;
  recordEnvironmentObservation?(params: {
    agent_id: string;
    source: string;
    summary: string;
    metadata?: Record<string, unknown>;
    actor?: GovernanceEvent['actor'];
  }): Promise<EnvironmentObservation>;
  addRollbackPoint?(params: {
    agent_id: string;
    action_type: ActionType;
    title: string;
    description: string;
    command: string;
    metadata?: Record<string, unknown>;
    actor?: GovernanceEvent['actor'];
  }): Promise<RollbackPoint>;
  recordGovernanceEvent?(params: {
    agent_id: string;
    type: GovernanceEventType;
    title: string;
    summary: string;
    actor: GovernanceEvent['actor'];
    risk_level?: GovernanceEvent['risk_level'];
    approval_id?: string;
    task_id?: string;
    incident_id?: string;
    rollback_point_id?: string;
    metadata?: Record<string, unknown>;
  }): Promise<GovernanceEvent>;
  listGovernanceEvents?(agentId?: string, limit?: number): Promise<GovernanceEvent[]> | GovernanceEvent[];
}
