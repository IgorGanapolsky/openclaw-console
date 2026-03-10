import fetch from 'node-fetch';
import type { 
  AgentStatus, 
  TaskStatus, 
  StepType, 
  IncidentSeverity,
  Task,
  TaskStep,
  Incident,
  ResourceLink,
  ActionType,
  ApprovalRequest,
  ApprovalResponse,
} from '../types/protocol.js';

/**
 * RemoteStateManager — Client for isolated skills to update state via the gateway's remote API.
 * 
 * This class provides a similar interface to StateManager but uses HTTP calls 
 * to synchronize state with the main gateway process.
 */
export class RemoteStateManager {
  constructor(
    private gatewayUrl: string,
    private gatewayToken: string,
  ) {}

  private async post<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.gatewayUrl}${path}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.gatewayToken}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Remote API error (${response.status}): ${errorText}`);
    }

    return await response.json() as T;
  }

  public async updateAgentStatus(agentId: string, status: AgentStatus): Promise<void> {
    await this.post(`/api/remote/agents/${agentId}/status`, { status });
  }

  public async createTask(params: {
    agent_id: string;
    title: string;
    description: string;
    links?: ResourceLink[];
  }): Promise<Task> {
    return this.post<Task>('/api/remote/tasks', params);
  }

  public async updateTaskStatus(taskId: string, status: TaskStatus): Promise<Task> {
    return this.post<Task>(`/api/remote/tasks/${taskId}/status`, { status });
  }

  public async addTaskStep(params: {
    task_id: string;
    type: StepType;
    content: string;
    metadata?: Record<string, unknown>;
  }): Promise<TaskStep> {
    return this.post<TaskStep>(`/api/remote/tasks/${params.task_id}/steps`, params);
  }

  public async createIncident(params: {
    agent_id: string;
    agent_name: string;
    severity: IncidentSeverity;
    title: string;
    description: string;
    actions?: ActionType[];
  }): Promise<Incident> {
    return this.post<Incident>('/api/remote/incidents', params);
  }

  public async queueApproval(request: ApprovalRequest, timeoutMs: number): Promise<ApprovalResponse> {
    return this.post<ApprovalResponse>('/api/remote/approvals/queue', { request, timeoutMs });
  }
}
