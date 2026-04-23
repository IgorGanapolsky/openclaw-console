/**
 * Multica Webhook Handler
 *
 * Processes incoming webhook events from Multica and routes them to the appropriate
 * bridge methods for high-performance integration.
 */

import crypto from 'node:crypto';
import { MulticaBridge } from './bridge.js';
import { MulticaBridgeConfig } from './types.js';

export interface MulticaWebhookEvent {
  type: string;
  data: any;
  timestamp: string;
  id: string;
}

export class MulticaWebhookHandler {
  private bridge: MulticaBridge;
  private config: MulticaBridgeConfig;

  constructor(bridge: MulticaBridge, config: MulticaBridgeConfig) {
    this.bridge = bridge;
    this.config = config;
  }

  /**
   * Verify webhook signature for security
   */
  verifySignature(payload: string, signature: string): boolean {
    if (!this.config.multica_webhook_secret) {
      console.warn('[webhook] No webhook secret configured - skipping signature verification');
      return true; // Allow unsigned webhooks if no secret configured
    }

    try {
      const expectedSignature = crypto
        .createHmac('sha256', this.config.multica_webhook_secret)
        .update(payload, 'utf8')
        .digest('hex');

      const providedSignature = signature.replace('sha256=', '');

      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'hex'),
        Buffer.from(providedSignature, 'hex')
      );
    } catch (error) {
      console.error('[webhook] Signature verification failed:', error);
      return false;
    }
  }

  /**
   * Process incoming webhook event
   */
  async processWebhook(payload: string, signature?: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Verify signature if provided
      if (signature && !this.verifySignature(payload, signature)) {
        return { success: false, error: 'Invalid signature' };
      }

      const event: MulticaWebhookEvent = JSON.parse(payload);
      console.info(`[webhook] Processing Multica event: ${event.type} (${event.id})`);

      await this.routeEvent(event);

      return { success: true };
    } catch (error) {
      console.error('[webhook] Event processing failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Route webhook event to appropriate handler
   */
  private async routeEvent(event: MulticaWebhookEvent): Promise<void> {
    switch (event.type) {
      case 'issue.created':
        await this.handleIssueCreated(event);
        break;

      case 'issue.updated':
        await this.handleIssueUpdated(event);
        break;

      case 'issue.assigned':
        await this.handleIssueAssigned(event);
        break;

      case 'execution.started':
        await this.handleExecutionStarted(event);
        break;

      case 'execution.progress':
        await this.handleExecutionProgress(event);
        break;

      case 'execution.completed':
        await this.handleExecutionCompleted(event);
        break;

      case 'execution.failed':
        await this.handleExecutionFailed(event);
        break;

      case 'agent.status_changed':
        await this.handleAgentStatusChanged(event);
        break;

      case 'autopilot.scheduled':
        await this.handleAutopilotScheduled(event);
        break;

      default:
        console.debug(`[webhook] Unhandled event type: ${event.type}`);
    }
  }

  // Event Handlers

  private async handleIssueCreated(event: MulticaWebhookEvent): Promise<void> {
    const issue = event.data;
    console.info(`[webhook] New issue created: ${issue.title} (${issue.id})`);

    // Sync issue to OpenClaw task for mobile display
    await this.bridge.syncIssueToTask(issue);
  }

  private async handleIssueUpdated(event: MulticaWebhookEvent): Promise<void> {
    const issue = event.data;
    console.info(`[webhook] Issue updated: ${issue.title} (${issue.id})`);

    // Update corresponding OpenClaw task
    await this.bridge.syncIssueToTask(issue);
  }

  private async handleIssueAssigned(event: MulticaWebhookEvent): Promise<void> {
    const { issue, assignee } = event.data;
    console.info(`[webhook] Issue assigned to ${assignee}: ${issue.title} (${issue.id})`);

    // Update task assignment in OpenClaw
    await this.bridge.syncIssueToTask(issue);
  }

  private async handleExecutionStarted(event: MulticaWebhookEvent): Promise<void> {
    const execution = event.data;
    console.info(`[webhook] Execution started for issue ${execution.issue_id} (${execution.id})`);

    // Check if this execution requires approval and route accordingly
    await this.bridge.handleMulticaExecution(execution);
  }

  private async handleExecutionProgress(event: MulticaWebhookEvent): Promise<void> {
    const execution = event.data;
    console.debug(`[webhook] Execution progress for issue ${execution.issue_id} (${execution.id})`);

    // Update task steps with progress
    await this.bridge.handleMulticaExecution(execution);
  }

  private async handleExecutionCompleted(event: MulticaWebhookEvent): Promise<void> {
    const execution = event.data;
    console.info(`[webhook] Execution completed for issue ${execution.issue_id} (${execution.id})`);

    // Update final task status and clean up any pending approvals
    await this.bridge.handleMulticaExecution(execution);
  }

  private async handleExecutionFailed(event: MulticaWebhookEvent): Promise<void> {
    const execution = event.data;
    console.warn(`[webhook] Execution failed for issue ${execution.issue_id} (${execution.id})`);

    // Create incident for failed execution
    await this.bridge.handleMulticaExecution(execution);

    // TODO: Create OpenClaw incident for mobile notification
    // await this.bridge.createIncidentFromFailedExecution(execution);
  }

  private async handleAgentStatusChanged(event: MulticaWebhookEvent): Promise<void> {
    const { agent_id, status, previous_status } = event.data;
    console.info(`[webhook] Agent ${agent_id} status changed: ${previous_status} -> ${status}`);

    // Sync agent status to OpenClaw (this would need StateManager access)
    // For now, the webhook endpoint in server.ts handles this directly
  }

  private async handleAutopilotScheduled(event: MulticaWebhookEvent): Promise<void> {
    const { run_id, agent_id, next_execution } = event.data;
    console.info(`[webhook] Autopilot run scheduled: ${run_id} for agent ${agent_id} at ${next_execution}`);

    // Could create a scheduled task in OpenClaw for mobile visibility
    // This is optional for MVP but valuable for user awareness
  }

  /**
   * Get webhook statistics for monitoring
   */
  getStats(): {
    total_events: number;
    events_by_type: Record<string, number>;
    last_event_time?: string;
  } {
    // In a production implementation, these would be tracked
    // For MVP, return placeholder stats
    return {
      total_events: 0,
      events_by_type: {},
      last_event_time: undefined
    };
  }
}