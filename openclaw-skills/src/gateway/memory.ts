/**
 * Memory Gateway Service for OpenClaw Console
 *
 * Bridges OpenClaw state management with mcp-memory-gateway for persistent memory,
 * context retention, and feedback-driven improvements.
 */

import type { Agent, Task, ApprovalRequest, ApprovalResponse } from '../types/protocol.js';

// Import from rlhf-feedback-loop package
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - No types available for rlhf-feedback-loop
import { captureFeedback, feedbackSummary } from 'rlhf-feedback-loop';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - No types available for rlhf-feedback-loop
import { searchSimilar } from 'rlhf-feedback-loop/scripts/vector-store.js';

export interface MemoryConfig {
  /** Directory for memory storage (default: .openclaw-memory) */
  dataDir?: string;
  /** Enable automatic feedback capture on agent events */
  autoCapture?: boolean;
  /** Max memory entries to return in context recall */
  maxRecallItems?: number;
}

export interface MemoryContext {
  /** Past similar situations from memory */
  memories: Array<{
    context: string;
    outcome: 'positive' | 'negative';
    tags: string[];
    timestamp: string;
    confidence: number;
  }>;
  /** Active prevention rules to follow */
  preventionRules: string[];
  /** Recent feedback summary */
  recentSummary: string;
}

/**
 * Memory Gateway Service - Provides persistent memory and learning capabilities
 * for the OpenClaw Console system.
 */
export class MemoryGatewayService {
  private config: Required<MemoryConfig>;

  constructor(config: MemoryConfig = {}) {
    this.config = {
      dataDir: config.dataDir || '.openclaw-memory',
      autoCapture: config.autoCapture ?? true,
      maxRecallItems: config.maxRecallItems || 5,
    };

    // Set environment variables for rlhf-feedback-loop
    process.env.RLHF_DATA_DIR = this.config.dataDir;
  }

  /**
   * Initialize the memory gateway service
   */
  async initialize(): Promise<void> {
    try {
      // Ensure data directory exists
      const fs = await import('node:fs/promises');
      await fs.mkdir(this.config.dataDir, { recursive: true });
      console.info(`[memory] Initialized with data directory: ${this.config.dataDir}`);
    } catch (error) {
      console.warn('[memory] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Capture feedback about an agent action or task outcome
   */
  async captureFeedback(params: {
    signal: 'up' | 'down';
    context: string;
    agentId?: string;
    taskId?: string;
    incidentId?: string;
    tags?: string[];
    whatWentWrong?: string;
    whatWorked?: string;
  }): Promise<{ accepted: boolean; reason?: string; memoryId?: string }> {
    try {
      const tags = [
        'openclaw-console',
        ...(params.tags || []),
        ...(params.agentId ? [`agent:${params.agentId}`] : []),
        ...(params.taskId ? [`task:${params.taskId}`] : []),
        ...(params.incidentId ? [`incident:${params.incidentId}`] : []),
      ];

      const result = await captureFeedback({
        signal: params.signal,
        context: params.context,
        whatWentWrong: params.whatWentWrong,
        whatWorked: params.whatWorked,
        tags,
      });

      return {
        accepted: result.accepted || false,
        reason: result.reason,
        memoryId: result.memoryRecord?.id,
      };
    } catch (error) {
      console.warn('[memory] Failed to capture feedback:', error);
      return { accepted: false, reason: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Recall relevant context for a given situation
   */
  async recallContext(params: {
    query: string;
    agentId?: string;
    taskType?: string;
    tags?: string[];
  }): Promise<MemoryContext> {
    try {
      // Build context-aware query
      const contextQuery = [
        params.query,
        ...(params.agentId ? [`agent:${params.agentId}`] : []),
        ...(params.taskType ? [`type:${params.taskType}`] : []),
        ...(params.tags || []),
      ].join(' ');

      const searchResults = await searchSimilar(contextQuery, this.config.maxRecallItems);

      const summary = await feedbackSummary(10);

      // Convert search results to memory format
      const memories = this.parseSearchResults(searchResults);

      return {
        memories,
        preventionRules: [], // Rules would come from a separate query
        recentSummary: summary || 'No recent feedback available',
      };
    } catch (error) {
      console.warn('[memory] Failed to recall context:', error);
      return {
        memories: [],
        preventionRules: [],
        recentSummary: 'Memory recall temporarily unavailable',
      };
    }
  }

  /**
   * Auto-capture feedback when agent events occur
   */
  async onAgentStatusChange(agent: Agent, previousStatus: string): Promise<void> {
    if (!this.config.autoCapture) return;

    try {
      let signal: 'up' | 'down' | null = null;
      let context = '';

      // Determine if this status change indicates success or failure
      if (previousStatus === 'busy' && agent.status === 'online') {
        signal = 'up';
        context = `Agent ${agent.name} completed work successfully`;
      } else if (agent.status === 'offline') {
        signal = 'down';
        context = `Agent ${agent.name} went offline unexpectedly`;
      }

      if (signal) {
        await this.captureFeedback({
          signal,
          context,
          agentId: agent.id,
          tags: ['agent-status', 'auto-capture'],
        });
      }
    } catch (error) {
      console.warn('[memory] Failed to auto-capture agent status change:', error);
    }
  }

  /**
   * Auto-capture feedback when task completes
   */
  async onTaskComplete(task: Task): Promise<void> {
    if (!this.config.autoCapture) return;

    try {
      const signal = task.status === 'done' ? 'up' : 'down';
      const context = task.status === 'done'
        ? `Task "${task.title}" completed successfully`
        : `Task "${task.title}" failed or was cancelled`;

      await this.captureFeedback({
        signal,
        context,
        agentId: task.agent_id,
        taskId: task.id,
        tags: ['task-completion', 'auto-capture'],
      });
    } catch (error) {
      console.warn('[memory] Failed to auto-capture task completion:', error);
    }
  }

  /**
   * Auto-capture feedback when approval is responded to
   */
  async onApprovalResponse(approval: ApprovalRequest, response: ApprovalResponse): Promise<void> {
    if (!this.config.autoCapture) return;

    try {
      const approved = response.decision === 'approved';
      const signal = approved ? 'up' : 'down';
      const context = approved
        ? `Approval for "${approval.title}" was granted - user trusted agent decision`
        : `Approval for "${approval.title}" was rejected - user didn't trust agent decision`;

      await this.captureFeedback({
        signal,
        context,
        agentId: approval.agent_id,
        tags: ['approval-response', 'auto-capture'],
        whatWorked: approved ? approval.description : undefined,
        whatWentWrong: approved ? undefined : approval.description,
      });
    } catch (error) {
      console.warn('[memory] Failed to auto-capture approval response:', error);
    }
  }

  /**
   * Parse the search results into structured memories
   */
  private parseSearchResults(searchResults: any[]): MemoryContext['memories'] {
    const memories: MemoryContext['memories'] = [];

    try {
      for (const result of searchResults) {
        const memory = {
          context: result.context || result.text || '',
          outcome: result.signal === 'positive' ? 'positive' as const : 'negative' as const,
          tags: result.tags || [],
          timestamp: result.timestamp || new Date().toISOString(),
          confidence: result._distance ? Math.max(0, (1 - result._distance) * 100) : 75,
        };

        if (memory.context) {
          memories.push(memory);
        }
      }
    } catch (error) {
      console.warn('[memory] Failed to parse search results:', error);
    }

    return memories;
  }

  // Removed prevention rules extraction for now - would need more complex integration

  /**
   * Get memory statistics
   */
  async getStats(): Promise<{
    totalMemories: number;
    positiveMemories: number;
    negativeMemories: number;
    recentTrend: string;
  }> {
    try {
      const summary = await feedbackSummary(50);

      // Parse basic stats from summary text
      // This is a simple implementation - could be enhanced with actual stats from the library
      const positiveCount = (summary.match(/positive/gi) || []).length;
      const negativeCount = (summary.match(/negative/gi) || []).length;

      return {
        totalMemories: positiveCount + negativeCount,
        positiveMemories: positiveCount,
        negativeMemories: negativeCount,
        recentTrend: positiveCount > negativeCount ? 'improving' : 'declining',
      };
    } catch (error) {
      console.warn('[memory] Failed to get stats:', error);
      return {
        totalMemories: 0,
        positiveMemories: 0,
        negativeMemories: 0,
        recentTrend: 'unknown',
      };
    }
  }
}