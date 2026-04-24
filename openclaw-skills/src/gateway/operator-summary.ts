import type { GatewayConfig } from '../config/default.js';
import type { BridgeSession, Incident, ApprovalRequest, Task, Agent, OperatorSummaryResponse, OperatorSummaryCounts, OperatorSummaryAgent, OperatorSummaryApproval, OperatorSummaryBridge, OperatorSummaryIncident, OperatorSummaryTask } from '../types/protocol.js';
import type { StateManager } from './state.js';
import type { WebSocketRuntimeSnapshot } from './websocket.js';

const AGENT_STALE_AFTER_MS = 15 * 60 * 1000;
const BRIDGE_STALE_AFTER_MS = 10 * 60 * 1000;
const DEFAULT_LIMIT = 5;

interface BuildOperatorSummaryParams {
  config: GatewayConfig;
  state: StateManager;
  startedAtIso: string;
  wsSnapshot: WebSocketRuntimeSnapshot;
  now?: Date;
  limit?: number;
}

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function minutesSince(value: string | null | undefined, nowMs: number): number | null {
  const parsed = parseTime(value);
  if (parsed === null) return null;
  return Math.max(0, Math.floor((nowMs - parsed) / 60_000));
}

function severityRank(severity: Incident['severity']): number {
  if (severity === 'critical') return 0;
  if (severity === 'warning') return 1;
  return 2;
}

function statusRank(status: Task['status']): number {
  if (status === 'failed') return 0;
  if (status === 'running') return 1;
  if (status === 'queued') return 2;
  return 3;
}

function clampLimit(raw: number | undefined): number {
  if (!Number.isInteger(raw) || !raw) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(10, raw));
}

function summarizeAgent(
  agent: Agent,
  nowMs: number,
  activeTasks: number,
  pendingApprovals: number,
): OperatorSummaryAgent {
  const lastSeenMinutes = minutesSince(agent.last_active, nowMs);
  const stale = lastSeenMinutes !== null && lastSeenMinutes >= 15;
  return {
    id: agent.id,
    name: agent.name,
    status: agent.status,
    last_active: agent.last_active,
    last_active_minutes_ago: lastSeenMinutes,
    stale,
    active_tasks: activeTasks,
    pending_approvals: pendingApprovals,
    workspace: agent.workspace,
    current_branch: agent.git_state?.current_branch ?? null,
    uncommitted_changes: agent.git_state?.uncommitted_changes ?? 0,
    ahead_by: agent.git_state?.ahead_by ?? 0,
    behind_by: agent.git_state?.behind_by ?? 0,
  };
}

function summarizeTask(task: Task): OperatorSummaryTask {
  const latestStep = task.steps.at(-1);
  return {
    id: task.id,
    agent_id: task.agent_id,
    title: task.title,
    status: task.status,
    updated_at: task.updated_at,
    step_count: task.steps.length,
    latest_step_type: latestStep?.type ?? null,
    latest_step_preview: latestStep?.content.slice(0, 140) ?? null,
  };
}

function summarizeIncident(incident: Incident): OperatorSummaryIncident {
  return {
    id: incident.id,
    agent_id: incident.agent_id,
    agent_name: incident.agent_name,
    severity: incident.severity,
    status: incident.status,
    title: incident.title,
    updated_at: incident.updated_at,
  };
}

function summarizeApproval(approval: ApprovalRequest): OperatorSummaryApproval {
  return {
    id: approval.id,
    agent_id: approval.agent_id,
    agent_name: approval.agent_name,
    action_type: approval.action_type,
    title: approval.title,
    created_at: approval.created_at,
    expires_at: approval.expires_at,
    risk_level: approval.context.risk_level,
    environment: approval.context.environment,
    service: approval.context.service,
  };
}

function summarizeBridge(bridge: BridgeSession, nowMs: number): OperatorSummaryBridge {
  const updatedMinutes = minutesSince(bridge.updated_at, nowMs);
  return {
    id: bridge.id,
    agent_id: bridge.agent_id,
    title: bridge.title,
    type: bridge.type,
    cwd: bridge.cwd,
    closed: bridge.closed,
    updated_at: bridge.updated_at,
    updated_minutes_ago: updatedMinutes,
    stale: !bridge.closed && updatedMinutes !== null && updatedMinutes >= 10,
  };
}

function buildCounts(agents: Agent[], tasks: Task[], incidents: Incident[], approvals: ApprovalRequest[], bridges: BridgeSession[], wsSnapshot: WebSocketRuntimeSnapshot, nowMs: number): OperatorSummaryCounts {
  const openIncidents = incidents.filter((incident) => incident.status === 'open');
  const openBridges = bridges.filter((bridge) => !bridge.closed);
  return {
    agents_total: agents.length,
    agents_online: agents.filter((agent) => agent.status === 'online').length,
    agents_busy: agents.filter((agent) => agent.status === 'busy').length,
    agents_offline: agents.filter((agent) => agent.status === 'offline').length,
    agents_stale: agents.filter((agent) => {
      const lastActive = parseTime(agent.last_active);
      return lastActive !== null && nowMs - lastActive >= AGENT_STALE_AFTER_MS;
    }).length,
    tasks_running: tasks.filter((task) => task.status === 'running').length,
    tasks_queued: tasks.filter((task) => task.status === 'queued').length,
    tasks_failed: tasks.filter((task) => task.status === 'failed').length,
    approvals_pending: approvals.length,
    incidents_open: openIncidents.length,
    incidents_critical: openIncidents.filter((incident) => incident.severity === 'critical').length,
    bridges_open: openBridges.length,
    bridges_stale: openBridges.filter((bridge) => {
      const updatedAt = parseTime(bridge.updated_at);
      return updatedAt !== null && nowMs - updatedAt >= BRIDGE_STALE_AFTER_MS;
    }).length,
    websocket_clients: wsSnapshot.connected_clients,
  };
}

function buildHeadline(counts: OperatorSummaryCounts): string {
  if (counts.incidents_critical > 0) {
    return `${counts.incidents_critical} critical incident${counts.incidents_critical === 1 ? '' : 's'} need attention`;
  }
  if (counts.approvals_pending > 0) {
    return `${counts.approvals_pending} approval${counts.approvals_pending === 1 ? '' : 's'} waiting for review`;
  }
  if (counts.tasks_failed > 0) {
    return `${counts.tasks_failed} failed task${counts.tasks_failed === 1 ? '' : 's'} need triage`;
  }
  return `System nominal: ${counts.agents_online}/${counts.agents_total} agents online, ${counts.tasks_running} task${counts.tasks_running === 1 ? '' : 's'} running`;
}

function buildAttentionLines(counts: OperatorSummaryCounts): string[] {
  const lines: string[] = [];
  if (counts.incidents_critical > 0) {
    lines.push(`${counts.incidents_critical} critical incident${counts.incidents_critical === 1 ? '' : 's'} open`);
  }
  if (counts.approvals_pending > 0) {
    lines.push(`${counts.approvals_pending} pending approval${counts.approvals_pending === 1 ? '' : 's'}`);
  }
  if (counts.tasks_failed > 0) {
    lines.push(`${counts.tasks_failed} failed task${counts.tasks_failed === 1 ? '' : 's'}`);
  }
  if (counts.agents_offline > 0) {
    lines.push(`${counts.agents_offline} agent${counts.agents_offline === 1 ? '' : 's'} offline`);
  }
  if (counts.bridges_stale > 0) {
    lines.push(`${counts.bridges_stale} stale bridge session${counts.bridges_stale === 1 ? '' : 's'}`);
  }
  return lines;
}

function buildSummaryLines(counts: OperatorSummaryCounts): string[] {
  const lines = buildAttentionLines(counts);
  if (lines.length > 0) {
    return lines;
  }
  return [
    `${counts.agents_online}/${counts.agents_total} agents online`,
    `${counts.tasks_running} running task${counts.tasks_running === 1 ? '' : 's'}, ${counts.tasks_queued} queued`,
    `${counts.websocket_clients} websocket client${counts.websocket_clients === 1 ? '' : 's'} connected`,
  ];
}

export function buildOperatorSummary({
  config,
  state,
  startedAtIso,
  wsSnapshot,
  now = new Date(),
  limit,
}: BuildOperatorSummaryParams): OperatorSummaryResponse {
  const nowMs = now.getTime();
  const cappedLimit = clampLimit(limit);
  const agents = state.listAgents();
  const tasks = state.listAllTasks();
  const incidents = state.listIncidents();
  const approvals = state.listPendingApprovals();
  const bridges = state.listBridgeSessions();
  const activeTaskCounts = new Map<string, number>();
  const approvalCounts = new Map<string, number>();

  for (const task of tasks) {
    if (task.status === 'running' || task.status === 'queued') {
      activeTaskCounts.set(task.agent_id, (activeTaskCounts.get(task.agent_id) ?? 0) + 1);
    }
  }

  for (const approval of approvals) {
    approvalCounts.set(approval.agent_id, (approvalCounts.get(approval.agent_id) ?? 0) + 1);
  }

  const counts = buildCounts(agents, tasks, incidents, approvals, bridges, wsSnapshot, nowMs);
  const attention = buildAttentionLines(counts);
  const summaryLines = buildSummaryLines(counts);

  return {
    checked_at: now.toISOString(),
    started_at: startedAtIso,
    approval_policy_preset: config.approvalPolicyPreset,
    headline: buildHeadline(counts),
    needs_attention: attention,
    summary_lines: summaryLines,
    counts,
    agents: [...agents]
      .sort((left, right) => {
        const leftSummary = summarizeAgent(
          left,
          nowMs,
          activeTaskCounts.get(left.id) ?? 0,
          approvalCounts.get(left.id) ?? 0,
        );
        const rightSummary = summarizeAgent(
          right,
          nowMs,
          activeTaskCounts.get(right.id) ?? 0,
          approvalCounts.get(right.id) ?? 0,
        );
        const leftScore = (leftSummary.status === 'offline' ? 100 : 0)
          + (leftSummary.stale ? 50 : 0)
          + leftSummary.pending_approvals * 10
          + leftSummary.active_tasks;
        const rightScore = (rightSummary.status === 'offline' ? 100 : 0)
          + (rightSummary.stale ? 50 : 0)
          + rightSummary.pending_approvals * 10
          + rightSummary.active_tasks;
        return rightScore - leftScore;
      })
      .slice(0, cappedLimit)
      .map((agent) => summarizeAgent(
        agent,
        nowMs,
        activeTaskCounts.get(agent.id) ?? 0,
        approvalCounts.get(agent.id) ?? 0,
      )),
    tasks: [...tasks]
      .sort((left, right) => {
        const rankDelta = statusRank(left.status) - statusRank(right.status);
        if (rankDelta !== 0) return rankDelta;
        return right.updated_at.localeCompare(left.updated_at);
      })
      .slice(0, cappedLimit)
      .map(summarizeTask),
    incidents: incidents
      .filter((incident) => incident.status === 'open')
      .sort((left, right) => {
        const rankDelta = severityRank(left.severity) - severityRank(right.severity);
        if (rankDelta !== 0) return rankDelta;
        return right.updated_at.localeCompare(left.updated_at);
      })
      .slice(0, cappedLimit)
      .map(summarizeIncident),
    approvals: [...approvals]
      .sort((left, right) => right.created_at.localeCompare(left.created_at))
      .slice(0, cappedLimit)
      .map(summarizeApproval),
    bridges: bridges
      .sort((left, right) => {
        if (left.closed !== right.closed) return Number(left.closed) - Number(right.closed);
        return right.updated_at.localeCompare(left.updated_at);
      })
      .slice(0, cappedLimit)
      .map((bridge) => summarizeBridge(bridge, nowMs)),
    websocket: {
      gateway_version: config.version,
      connected_clients: wsSnapshot.connected_clients,
      last_inbound_at: wsSnapshot.last_inbound_at,
      last_outbound_at: wsSnapshot.last_outbound_at,
      uptime_seconds: Math.max(0, Math.floor((nowMs - Date.parse(startedAtIso)) / 1000)),
      sessions: wsSnapshot.sessions,
    },
  };
}
