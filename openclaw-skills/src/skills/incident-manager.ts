/**
 * Incident Manager Skill
 *
 * Creates and manages incidents, handles agent actions
 * (ask_root_cause, propose_fix, acknowledge), and updates
 * incident status throughout its lifecycle.
 */

import type { Incident, IncidentSeverity, IncidentStatus, ActionType } from '../types/protocol.js';
import type { StateManager } from '../gateway/state.js';

export interface CreateIncidentOptions {
  agentId: string;
  agentName: string;
  severity: IncidentSeverity;
  title: string;
  description: string;
  actions?: ActionType[];
}

export interface ActionResult {
  incidentId: string;
  action: ActionType;
  output: string;
  updatedAt: string;
}

/**
 * Manages incident lifecycle and action handling.
 */
export class IncidentManagerSkill {
  constructor(private readonly state: StateManager) {}

  /**
   * Open a new incident.
   */
  public createIncident(options: CreateIncidentOptions): Incident {
    return this.state.createIncident({
      agent_id: options.agentId,
      agent_name: options.agentName,
      severity: options.severity,
      title: options.title,
      description: options.description,
      actions: options.actions ?? ['ask_root_cause', 'propose_fix', 'acknowledge'],
    });
  }

  /**
   * Execute an action on an incident.
   * Returns a structured result with the action's output narrative.
   */
  public async executeAction(incidentId: string, action: ActionType): Promise<ActionResult | null> {
    const incident = this.state.getIncident(incidentId);
    if (!incident) return null;

    let output = '';
    let newStatus: IncidentStatus | null = null;

    switch (action) {
      case 'ask_root_cause':
        output = await this.analyzeRootCause(incident);
        break;
      case 'propose_fix':
        output = await this.proposeFix(incident);
        break;
      case 'acknowledge':
        output = `Incident acknowledged. An engineer has been paged.`;
        newStatus = 'acknowledged';
        break;
      default:
        output = `Action "${action}" executed on incident "${incident.title}".`;
    }

    if (newStatus) {
      this.state.updateIncidentStatus(incidentId, newStatus);
    }

    return {
      incidentId,
      action,
      output,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Mark an incident as resolved.
   */
  public resolve(incidentId: string): Incident | null {
    return this.state.updateIncidentStatus(incidentId, 'resolved');
  }

  /**
   * Acknowledge an incident.
   */
  public acknowledge(incidentId: string): Incident | null {
    return this.state.updateIncidentStatus(incidentId, 'acknowledged');
  }

  /** List all incidents. */
  public listAll(): Incident[] {
    return this.state.listIncidents();
  }

  /** List open incidents only. */
  public listOpen(): Incident[] {
    return this.state.listIncidents().filter((i) => i.status === 'open');
  }

  // ── Action implementations ────────────────────────────────────────────────

  private async analyzeRootCause(incident: Incident): Promise<string> {
    // In production, this would call an LLM or log analysis tool.
    // Here we return a realistic-looking synthetic analysis.
    await sleep(200);
    return [
      `Root cause analysis for "${incident.title}":`,
      ``,
      `Severity: ${incident.severity.toUpperCase()}`,
      ``,
      `Likely cause: ${getSyntheticRootCause(incident.severity)}`,
      ``,
      `Evidence:`,
      `  - Error rate spike detected at ${new Date(Date.now() - 5 * 60_000).toISOString()}`,
      `  - Latency p99 increased by 340% in the 2 min prior to incident`,
      `  - Memory utilization on worker-3 reached 94% before the incident`,
      ``,
      `Recommendation: Review recent deployment and consider rollback.`,
    ].join('\n');
  }

  private async proposeFix(incident: Incident): Promise<string> {
    await sleep(200);
    return [
      `Proposed remediation for "${incident.title}":`,
      ``,
      `1. Immediate: ${getImmediateFix(incident.severity)}`,
      `2. Short-term: Increase autoscaling thresholds and add memory alerts.`,
      `3. Long-term: Profile the service under load and optimize hot paths.`,
      ``,
      `Estimated resolution time: 15–30 minutes.`,
      `Rollback plan: \`kubectl rollout undo deployment/${incident.agent_name.toLowerCase().replace(/\s+/g, '-')}\``,
    ].join('\n');
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function getSyntheticRootCause(severity: IncidentSeverity): string {
  switch (severity) {
    case 'critical': return 'OOM kill of primary service pod due to memory leak in v2.4.1';
    case 'warning':  return 'Degraded database connection pool — max connections approaching limit';
    case 'info':     return 'Elevated retry rate from upstream dependency (non-critical path)';
  }
}

function getImmediateFix(severity: IncidentSeverity): string {
  switch (severity) {
    case 'critical': return 'Rollback to previous stable version immediately';
    case 'warning':  return 'Restart connection pool and alert on-call DBA';
    case 'info':     return 'Monitor retry rate; no immediate action required';
  }
}
