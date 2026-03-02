/**
 * OpenClaw Work Console Protocol v1.0 - TypeScript Type Definitions
 *
 * All types mirror the protocol spec in /docs/protocol.md exactly.
 */

// ─── Agent ────────────────────────────────────────────────────────────────────

/** Operational status of an agent. */
export type AgentStatus = 'online' | 'offline' | 'busy';

/** An OpenClaw agent registered on the gateway. */
export interface Agent {
  id: string;
  name: string;
  description: string;
  status: AgentStatus;
  workspace: string;
  tags: string[];
  last_active: string; // ISO8601
  active_tasks: number;
  pending_approvals: number;
}

// ─── Task ─────────────────────────────────────────────────────────────────────

/** Lifecycle status of a task. */
export type TaskStatus = 'queued' | 'running' | 'done' | 'failed';

/** Type of a step in a task timeline. */
export type StepType = 'log' | 'tool_call' | 'output' | 'error' | 'info';

/** A link to an external resource associated with a task. */
export interface ResourceLink {
  label: string;
  url: string;
  type: 'github_pr' | 'github_run' | 'dashboard' | 'external';
}

/** A single step in a task timeline. */
export interface TaskStep {
  id: string;
  task_id: string;
  type: StepType;
  content: string;
  timestamp: string; // ISO8601
  metadata: Record<string, unknown>;
}

/** A task tracked by an agent. */
export interface Task {
  id: string;
  agent_id: string;
  title: string;
  description: string;
  status: TaskStatus;
  created_at: string; // ISO8601
  updated_at: string; // ISO8601
  steps: TaskStep[];
  links: ResourceLink[];
}

/** Partial update payload for task_update WS event. */
export interface TaskUpdate {
  id: string;
  agent_id: string;
  status: TaskStatus;
  title: string;
  updated_at: string;
  active_steps?: number;
}

// ─── Incident ─────────────────────────────────────────────────────────────────

/** Severity of an incident. */
export type IncidentSeverity = 'critical' | 'warning' | 'info';

/** Lifecycle status of an incident. */
export type IncidentStatus = 'open' | 'acknowledged' | 'resolved';

/** An incident raised by an agent. */
export interface Incident {
  id: string;
  agent_id: string;
  agent_name: string;
  severity: IncidentSeverity;
  title: string;
  description: string;
  status: IncidentStatus;
  created_at: string; // ISO8601
  updated_at: string; // ISO8601
  actions: ActionType[];
}

/** Partial update payload for incident_update WS event. */
export interface IncidentUpdate {
  id: string;
  status: IncidentStatus;
  updated_at: string;
  resolution?: string;
}

// ─── Approval ─────────────────────────────────────────────────────────────────

/** Category of action requiring approval. */
export type ActionType =
  | 'deploy'
  | 'shell_command'
  | 'config_change'
  | 'key_rotation'
  | 'trade_execution'
  | 'destructive'
  | 'ask_root_cause'
  | 'propose_fix'
  | 'acknowledge';

/** Risk classification of an approval context. */
export type RiskLevel = 'high' | 'critical';

/** Context metadata for an approval request. */
export interface ApprovalContext {
  service: string;
  environment: string;
  repository: string;
  risk_level: RiskLevel;
}

/** An approval request pending human decision. */
export interface ApprovalRequest {
  id: string;
  agent_id: string;
  agent_name: string;
  action_type: ActionType;
  title: string;
  description: string;
  command: string;
  context: ApprovalContext;
  created_at: string; // ISO8601
  expires_at: string; // ISO8601
}

/** A human's response to an approval request. */
export interface ApprovalResponse {
  approval_id: string;
  decision: 'approved' | 'denied';
  biometric_verified: boolean;
  responded_at: string; // ISO8601
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

/** A chat message between user and agent. */
export interface ChatMessage {
  id: string;
  agent_id: string;
  task_id: string | null;
  role: 'user' | 'agent';
  content: string;
  timestamp: string; // ISO8601
}

// ─── WebSocket Message Envelope ───────────────────────────────────────────────

/** All server→client WebSocket event type names. */
export type ServerEventType =
  | 'agent_update'
  | 'task_update'
  | 'task_step'
  | 'incident_new'
  | 'incident_update'
  | 'approval_request'
  | 'chat_response'
  | 'connected'
  | 'error';

/** All client→server WebSocket event type names. */
export type ClientEventType =
  | 'subscribe'
  | 'unsubscribe'
  | 'approval_response'
  | 'chat_message';

/** Generic WebSocket message envelope. */
export interface WebSocketMessage<T = unknown> {
  type: ServerEventType | ClientEventType;
  payload: T;
  timestamp: string; // ISO8601
}

// ─── Client → Server Payloads ─────────────────────────────────────────────────

export interface SubscribePayload {
  agents: string[];
}

export interface UnsubscribePayload {
  agents: string[];
}

export interface WsApprovalResponse {
  approval_id: string;
  decision: 'approved' | 'denied';
  biometric_verified: boolean;
}

export interface WsChatMessage {
  agent_id: string;
  message: string;
  task_id?: string;
}

// ─── Server → Client Payloads ─────────────────────────────────────────────────

export interface ConnectedPayload {
  session_id: string;
  gateway_version: string;
}

export interface ErrorPayload {
  code: number;
  message: string;
}

// ─── HTTP Request / Response Types ────────────────────────────────────────────

/** POST /api/agents/:id/chat request body. */
export interface ChatRequest {
  message: string;
  task_id?: string;
}

/** POST /api/approvals/:id/respond request body. */
export interface ApprovalRespondRequest {
  decision: 'approved' | 'denied';
  biometric_verified: boolean;
}

/** GET /api/health response. */
export interface HealthResponse {
  status: 'ok' | 'degraded';
  version: string;
  uptime_seconds: number;
  agent_count: number;
  active_tasks: number;
  open_incidents: number;
  pending_approvals: number;
}

// ─── Error Codes ─────────────────────────────────────────────────────────────

export const ERROR_CODES = {
  INVALID_TOKEN: 1001,
  AGENT_NOT_FOUND: 1002,
  APPROVAL_EXPIRED: 1003,
  APPROVAL_ALREADY_RESPONDED: 1004,
  RATE_LIMITED: 1005,
  GATEWAY_UNAVAILABLE: 1006,
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
