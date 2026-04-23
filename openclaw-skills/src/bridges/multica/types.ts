/**
 * Type definitions for Multica API integration
 */

export interface MulticaIssue {
  id: string;
  title: string;
  description: string;
  status: 'Todo' | 'In Progress' | 'In Review' | 'Done';
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  assignee?: string;
  agent_id?: string;
  created_at: string;
  updated_at: string;
  due_date?: string;
  labels: string[];
  comments: MulticaComment[];
  metadata?: Record<string, unknown>;
}

export interface MulticaComment {
  id: string;
  issue_id: string;
  content: string;
  author: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

export interface MulticaAgent {
  id: string;
  name: string;
  description: string;
  status: 'online' | 'offline' | 'busy';
  capabilities: string[];
  system_prompt: string;
  skills: string[];
  runtimes: string[];
  created_at: string;
  updated_at: string;
}

export interface MulticaAutopilotRun {
  id: string;
  name: string;
  agent_id: string;
  schedule: string; // Cron format
  prompt: string;
  enabled: boolean;
  last_run?: string;
  next_run?: string;
  created_at: string;
  updated_at: string;
}

export interface MulticaExecution {
  id: string;
  issue_id: string;
  agent_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  tool_calls: MulticaToolCall[];
  output?: string;
  error?: string;
  started_at?: string;
  completed_at?: string;
}

export interface MulticaToolCall {
  id: string;
  execution_id: string;
  tool_name: string;
  parameters: Record<string, unknown>;
  result?: unknown;
  error?: string;
  timestamp: string;
}

// OpenClaw → Multica translation interfaces
export interface IssueTranslationRequest {
  title: string;
  description: string;
  agent_id: string;
  priority?: 'Low' | 'Medium' | 'High' | 'Critical';
  due_date?: string;
  labels?: string[];
  require_approval?: boolean;
  approval_context?: {
    action_type: string;
    risk_level: 'high' | 'critical';
    environment?: string;
    service?: string;
  };
}

export interface ApprovalTranslationRequest {
  multica_issue_id: string;
  multica_execution_id: string;
  action_type: 'deploy' | 'shell_command' | 'config_change' | 'key_rotation' | 'trade_execution' | 'destructive';
  title: string;
  description: string;
  command?: string;
  context: {
    service?: string;
    environment?: string;
    repository?: string;
    risk_level: 'high' | 'critical';
  };
}

export interface MulticaBridgeConfig {
  multica_api_url: string;
  multica_api_token: string;
  multica_webhook_secret?: string;
  approval_timeout_minutes: number;
  auto_translate_priorities: boolean;
  default_agent_mapping: Record<string, string>; // OpenClaw agent ID → Multica agent ID
  risk_level_mapping: {
    high: string[]; // Multica labels that indicate high risk
    critical: string[]; // Multica labels that indicate critical risk
  };
}