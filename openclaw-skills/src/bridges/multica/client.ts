/**
 * Multica API Client
 *
 * Handles HTTP communication with Multica backend API
 */

import {
  MulticaIssue,
  MulticaAgent,
  MulticaExecution,
  MulticaAutopilotRun,
  MulticaBridgeConfig,
  IssueTranslationRequest
} from './types.js';

export class MulticaClient {
  private config: MulticaBridgeConfig;
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(config: MulticaBridgeConfig) {
    this.config = config;
    this.baseUrl = config.multica_api_url.replace(/\/$/, ''); // Remove trailing slash
    this.headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.multica_api_token}`,
    };
  }

  // Issue Management
  async createIssue(request: IssueTranslationRequest): Promise<MulticaIssue> {
    const response = await this.fetch('/api/issues', {
      method: 'POST',
      body: JSON.stringify({
        title: request.title,
        description: request.description,
        assignee: request.agent_id,
        priority: request.priority || 'Medium',
        labels: request.labels || [],
        metadata: {
          source: 'openclaw',
          require_approval: request.require_approval || false,
          approval_context: request.approval_context
        }
      })
    });

    return response.json() as Promise<MulticaIssue>;
  }

  async getIssue(issueId: string): Promise<MulticaIssue> {
    const response = await this.fetch(`/api/issues/${issueId}`);
    return response.json() as Promise<MulticaIssue>;
  }

  async updateIssue(issueId: string, updates: Partial<MulticaIssue>): Promise<MulticaIssue> {
    const response = await this.fetch(`/api/issues/${issueId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });

    return response.json() as Promise<MulticaIssue>;
  }

  async listIssues(filters?: {
    agent_id?: string;
    status?: MulticaIssue['status'];
    labels?: string[];
    limit?: number;
    offset?: number;
  }): Promise<{ issues: MulticaIssue[]; total: number }> {
    const params = new URLSearchParams();
    if (filters?.agent_id) params.set('agent_id', filters.agent_id);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.labels) params.set('labels', filters.labels.join(','));
    if (filters?.limit) params.set('limit', filters.limit.toString());
    if (filters?.offset) params.set('offset', filters.offset.toString());

    const response = await this.fetch(`/api/issues?${params}`);
    return response.json() as Promise<{ issues: MulticaIssue[]; total: number }>;
  }

  async addIssueComment(issueId: string, content: string, author: string = 'openclaw'): Promise<void> {
    await this.fetch(`/api/issues/${issueId}/comments`, {
      method: 'POST',
      body: JSON.stringify({
        content,
        author,
        created_at: new Date().toISOString()
      })
    });
  }

  // Agent Management
  async listAgents(): Promise<MulticaAgent[]> {
    const response = await this.fetch('/api/agents');
    return response.json() as Promise<MulticaAgent[]>;
  }

  async getAgent(agentId: string): Promise<MulticaAgent> {
    const response = await this.fetch(`/api/agents/${agentId}`);
    return response.json() as Promise<MulticaAgent>;
  }

  // Execution Management
  async getExecution(executionId: string): Promise<MulticaExecution> {
    const response = await this.fetch(`/api/executions/${executionId}`);
    return response.json() as Promise<MulticaExecution>;
  }

  async listExecutions(filters?: {
    issue_id?: string;
    agent_id?: string;
    status?: MulticaExecution['status'];
    limit?: number;
  }): Promise<{ executions: MulticaExecution[]; total: number }> {
    const params = new URLSearchParams();
    if (filters?.issue_id) params.set('issue_id', filters.issue_id);
    if (filters?.agent_id) params.set('agent_id', filters.agent_id);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.limit) params.set('limit', filters.limit.toString());

    const response = await this.fetch(`/api/executions?${params}`);
    return response.json() as Promise<{ executions: MulticaExecution[]; total: number }>;
  }

  async triggerExecution(issueId: string): Promise<MulticaExecution> {
    const response = await this.fetch(`/api/issues/${issueId}/execute`, {
      method: 'POST'
    });

    return response.json() as Promise<MulticaExecution>;
  }

  async stopExecution(executionId: string): Promise<void> {
    await this.fetch(`/api/executions/${executionId}/stop`, {
      method: 'POST'
    });
  }

  // Autopilot Management
  async createAutopilotRun(config: {
    name: string;
    agent_id: string;
    schedule: string;
    prompt: string;
    enabled: boolean;
  }): Promise<MulticaAutopilotRun> {
    const response = await this.fetch('/api/autopilot', {
      method: 'POST',
      body: JSON.stringify({
        name: config.name,
        agent_id: config.agent_id,
        schedule: config.schedule,
        prompt: config.prompt,
        enabled: config.enabled,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
    });

    return response.json() as Promise<MulticaAutopilotRun>;
  }

  async listAutopilotRuns(agentId?: string): Promise<MulticaAutopilotRun[]> {
    const params = new URLSearchParams();
    if (agentId) params.set('agent_id', agentId);

    const response = await this.fetch(`/api/autopilot?${params}`);
    return response.json() as Promise<MulticaAutopilotRun[]>;
  }

  async updateAutopilotRun(runId: string, updates: Partial<MulticaAutopilotRun>): Promise<MulticaAutopilotRun> {
    const response = await this.fetch(`/api/autopilot/${runId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        ...updates,
        updated_at: new Date().toISOString()
      })
    });

    return response.json() as Promise<MulticaAutopilotRun>;
  }

  // Webhook Management
  async setupWebhook(callbackUrl: string, events: string[] = ['issue.updated', 'execution.completed']): Promise<void> {
    await this.fetch('/api/webhooks', {
      method: 'POST',
      body: JSON.stringify({
        url: callbackUrl,
        events,
        secret: this.config.multica_webhook_secret
      })
    });
  }

  // Health and Status
  async health(): Promise<{ status: string; version?: string }> {
    const response = await this.fetch('/api/health');
    return response.json() as Promise<{ status: string; version?: string }>;
  }

  // Private helper methods
  private async fetch(path: string, options: RequestInit = {}): Promise<Response> {
    const url = `${this.baseUrl}${path}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.headers,
        ...options.headers
      }
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Multica API error ${response.status}: ${errorText}`);
    }

    return response;
  }

  // Connection testing
  async testConnection(): Promise<boolean> {
    try {
      const health = await this.health();
      return health.status === 'ok' || health.status === 'healthy';
    } catch (error) {
      console.error('Multica connection test failed:', error);
      return false;
    }
  }

  // Batch operations for efficiency
  async syncMultipleIssues(issueIds: string[]): Promise<MulticaIssue[]> {
    // For efficiency, batch multiple issue requests
    const promises = issueIds.map(id => this.getIssue(id));
    return Promise.all(promises);
  }

  async batchUpdateIssues(updates: Array<{ id: string; updates: Partial<MulticaIssue> }>): Promise<MulticaIssue[]> {
    // If Multica supports batch updates, use that endpoint
    // Otherwise fall back to individual updates
    const promises = updates.map(({ id, updates: issueUpdates }) =>
      this.updateIssue(id, issueUpdates)
    );
    return Promise.all(promises);
  }
}