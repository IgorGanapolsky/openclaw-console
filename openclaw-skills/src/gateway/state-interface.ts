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
} from '../types/protocol.js';

/**
 * IStateManager — Common interface for both local (in-process) and remote (isolated) state management.
 * 
 * Local: StateManager
 * Remote: RemoteStateManager
 */
export interface IStateManager {
  updateAgentStatus(agentId: string, status: AgentStatus): Promise<Agent | null | void>;
  
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

  upsertBridgeSession(session: import('../types/protocol.js').BridgeSession): Promise<import('../types/protocol.js').BridgeSession>;
  listBridgeSessions?(): Promise<import('../types/protocol.js').BridgeSession[]> | import('../types/protocol.js').BridgeSession[];
}
