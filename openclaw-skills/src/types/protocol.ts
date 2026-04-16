/**
 * OpenClaw Work Console Protocol v1.0 - TypeScript Type Definitions
 *
 * All types mirror the protocol spec in /docs/protocol.md exactly.
 */

// ─── Agent ────────────────────────────────────────────────────────────────────

/** Operational status of an agent. */
export type AgentStatus = 'online' | 'offline' | 'busy';

/** Git repository state for an agent. */
export interface AgentGitState {
  repository_url: string;
  current_branch: string;
  current_commit: string;
  uncommitted_changes: number;
  ahead_by: number;
  behind_by: number;
  last_sync: string; // ISO8601
}

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
  git_state?: AgentGitState;
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
  | 'acknowledge'
  | 'git_commit'
  | 'git_merge'
  | 'git_push'
  | 'agent_skill_install'
  | 'agent_rollback';

/** Risk classification of an approval context. */
export type RiskLevel = 'high' | 'critical';

/** Git operation details for approval requests. */
export interface GitOperation {
  operation_type: 'commit' | 'merge' | 'push' | 'rollback';
  branch_from?: string;
  branch_to?: string;
  commit_message?: string;
  file_changes?: string[];
  diff_summary?: string;
}

/** Context metadata for an approval request. */
export interface ApprovalContext {
  service: string;
  environment: string;
  repository: string;
  risk_level: RiskLevel;
  git_operation?: GitOperation;
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

// ─── Bridge Session ───────────────────────────────────────────────────────────

/** Metadata for an external IDE or terminal bridge session (e.g. Codex/acpx) */
export interface BridgeSession {
  id: string;
  agent_id: string;
  type: 'codex' | 'terminal' | 'other';
  title: string;
  cwd: string;
  closed: boolean;
  created_at: string; // ISO8601
  updated_at: string; // ISO8601
  metadata: Record<string, unknown>;
}

export interface RuntimeConfigResponse {
  approval_policy_preset: string;
  heartbeat_interval_ms: number;
  require_biometric: boolean;
  local_model: {
    enabled: boolean;
    base_url: string | null;
    model: string | null;
  };
}

export interface RuntimeConfigUpdateRequest {
  approval_policy_preset?: string;
  heartbeat_interval_ms?: number;
}

// ─── Scheduled Loops ──────────────────────────────────────────────────────────

/** Schedule definition for recurring tasks. */
export interface Schedule {
  type: 'cron' | 'interval';
  value: string | number; // cron expression or ms interval
}

/** A background loop/cron assigned to an agent. */
export interface RecurringTask {
  id: string;
  agent_id: string;
  name: string;
  description: string;
  schedule: Schedule;
  last_run: string | null; // ISO8601
  next_run: string | null; // ISO8601
  status: 'active' | 'paused' | 'failed';
  error_count: number;
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
  | 'bridge_session_new'
  | 'bridge_session_update'
  | 'recurring_task_updated'
  | 'git_state_update'
  | 'git_conflict'
  | 'git_operation_complete'
  | 'heartbeat'
  | 'connected'
  | 'error';

/** All client→server WebSocket event type names. */
export type ClientEventType =
  | 'subscribe'
  | 'unsubscribe'
  | 'approval_response'
  | 'chat_message'
  | 'git_conflict_resolve';

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
  heartbeat_interval_ms: number;
}

export interface ErrorPayload {
  code: number;
  message: string;
}

export interface GatewayHeartbeatPayload {
  gateway_version: string;
  connected_clients: number;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  uptime_seconds: number;
}

// ─── Git WebSocket Payloads ───────────────────────────────────────────────────

/** git_state_update WebSocket event payload. */
export interface GitStateUpdatePayload {
  agent_id: string;
  git_state: AgentGitState;
  changes: string[];
  requires_action: boolean;
}

/** git_conflict WebSocket event payload. */
export interface GitConflictPayload {
  agent_id: string;
  repository_path: string;
  conflicted_files: string[];
  conflict_details: string;
  resolution_suggestions: string[];
  operation: GitOperation;
}

/** git_operation_complete WebSocket event payload. */
export interface GitOperationCompletePayload {
  agent_id: string;
  operation: GitOperation;
  success: boolean;
  output: string;
  error?: string;
  approval_id?: string;
}

/** git_conflict_resolve client message payload. */
export interface GitConflictResolvePayload {
  agent_id: string;
  conflict_id: string;
  resolution: 'manual' | 'accept_theirs' | 'accept_ours' | 'abort';
  resolved_files?: string[];
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
  started_at: string;
  checked_at: string;
  uptime_seconds: number;
  agent_count: number;
  active_tasks: number;
  open_incidents: number;
  pending_approvals: number;
  websocket_clients: number;
  last_inbound_ws_at: string | null;
  last_outbound_ws_at: string | null;
  approval_policy_preset: string;
  local_model: {
    enabled: boolean;
    base_url: string | null;
    model: string | null;
  };
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
