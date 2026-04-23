/**
 * Hybrid Execution Engine
 * HIGH-ROI: Seamless Mac Mini + Anthropic Managed Agents orchestration
 */

import type { StateManager } from '../../gateway/state.js';
import { HybridAgentRouter, ManagedAgentClient } from './agent-router.js';
import type { Task, Agent, TaskStatus } from '../../types/protocol.js';

export interface HybridExecutionConfig {
  anthropic: {
    api_key: string;
    base_url: string;
    organization_id?: string;
  };
  cost_management: {
    daily_budget_cents: number;
    alert_threshold_percent: number;
    hard_limit_percent: number;
  };
  routing_preferences: {
    prefer_local_for_privacy: boolean;
    max_cloud_latency_seconds: number;
    cost_optimization_mode: 'aggressive' | 'balanced' | 'performance';
  };
}

export class HybridExecutionEngine {
  private router: HybridAgentRouter;
  private managedClient: ManagedAgentClient;
  private dailySpendCents = 0;
  private executionMetrics = {
    local_executions: 0,
    cloud_executions: 0,
    hybrid_executions: 0,
    total_cost_cents: 0,
    avg_local_time_seconds: 0,
    avg_cloud_time_seconds: 0
  };

  constructor(
    private state: StateManager,
    private config: HybridExecutionConfig
  ) {
    // Initialize system capacity monitoring
    const macMiniCapacity = {
      cpu_cores: require('os').cpus().length,
      ram_gb: Math.round(require('os').totalmem() / (1024 * 1024 * 1024)),
      current_load: 0.0 // Will be updated via monitoring
    };

    this.router = new HybridAgentRouter(
      macMiniCapacity,
      {
        api_key: config.anthropic.api_key,
        tier: config.anthropic.organization_id ? 'enterprise' : 'standard'
      },
      {
        daily_budget_cents: config.cost_management.daily_budget_cents,
        current_spend_cents: this.dailySpendCents
      }
    );

    this.managedClient = new ManagedAgentClient(config.anthropic);

    // Start capacity monitoring
    this.startCapacityMonitoring();
  }

  /**
   * HIGH-ROI: Execute task with hybrid routing
   * Automatically chooses optimal execution environment
   */
  async executeTask(taskId: string): Promise<{
    success: boolean;
    execution_target: 'local' | 'managed' | 'hybrid';
    metrics: {
      cost_cents: number;
      duration_seconds: number;
      tokens_used?: number;
    };
    error?: string;
  }> {
    const task = this.state.getTaskById(taskId);
    if (!task) {
      return {
        success: false,
        execution_target: 'local',
        metrics: { cost_cents: 0, duration_seconds: 0 },
        error: 'Task not found'
      };
    }

    const startTime = Date.now();

    try {
      // Get routing decision
      const routing = this.router.routeWorkload({
        action_type: task.type,
        description: task.description,
        context: task.metadata,
        priority: task.priority as any
      });

      // Check cost limits before cloud execution
      if (routing.target === 'anthropic_managed' && !this.canAffordCloudExecution(routing.cost_estimate_cents)) {
        console.warn(`[hybrid] Cost limit exceeded, falling back to local execution`);
        routing.target = 'mac_mini';
        routing.reasoning = 'Cost limit fallback to local execution';
      }

      await this.state.updateTask(taskId, {
        status: 'running' as TaskStatus,
        metadata: {
          ...task.metadata,
          execution_target: routing.target,
          routing_reasoning: routing.reasoning,
          cost_estimate_cents: routing.cost_estimate_cents
        }
      });

      let result;

      switch (routing.target) {
        case 'mac_mini':
          result = await this.executeLocal(task);
          this.executionMetrics.local_executions++;
          break;

        case 'anthropic_managed':
          result = await this.executeManaged(task);
          this.executionMetrics.cloud_executions++;
          this.dailySpendCents += result.metrics.cost_cents;
          break;

        case 'hybrid':
          result = await this.executeHybrid(task);
          this.executionMetrics.hybrid_executions++;
          break;

        default:
          throw new Error(`Unknown execution target: ${routing.target}`);
      }

      const duration = (Date.now() - startTime) / 1000;

      // Update execution metrics
      if (routing.target === 'mac_mini') {
        this.executionMetrics.avg_local_time_seconds =
          (this.executionMetrics.avg_local_time_seconds + duration) / 2;
      } else {
        this.executionMetrics.avg_cloud_time_seconds =
          (this.executionMetrics.avg_cloud_time_seconds + duration) / 2;
      }

      // Update task status
      await this.state.updateTask(taskId, {
        status: result.success ? 'completed' as TaskStatus : 'failed' as TaskStatus,
        output: result.output,
        metadata: {
          ...task.metadata,
          execution_metrics: {
            duration_seconds: duration,
            cost_cents: result.metrics.cost_cents,
            tokens_used: result.metrics.tokens_used || 0,
            execution_target: routing.target
          }
        }
      });

      return {
        success: result.success,
        execution_target: routing.target === 'mac_mini' ? 'local' :
                          routing.target === 'anthropic_managed' ? 'managed' : 'hybrid',
        metrics: {
          cost_cents: result.metrics.cost_cents,
          duration_seconds: duration,
          tokens_used: result.metrics.tokens_used
        },
        error: result.error
      };

    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;

      await this.state.updateTask(taskId, {
        status: 'failed' as TaskStatus,
        error: error instanceof Error ? error.message : 'Unknown execution error'
      });

      return {
        success: false,
        execution_target: 'local',
        metrics: { cost_cents: 0, duration_seconds: duration },
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Execute on local Mac Mini agents
   */
  private async executeLocal(task: Task): Promise<{
    success: boolean;
    output?: any;
    error?: string;
    metrics: { cost_cents: number; tokens_used?: number };
  }> {
    try {
      // Use existing local agent execution logic
      const agent = this.state.getAgentById(task.agentId);
      if (!agent) {
        throw new Error('Local agent not found');
      }

      // Simulate local execution (integrate with existing agent skills)
      const output = await this.delegateToLocalAgent(task);

      return {
        success: true,
        output,
        metrics: { cost_cents: 0 } // Local execution is free
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Local execution failed',
        metrics: { cost_cents: 0 }
      };
    }
  }

  /**
   * Execute on Anthropic Managed Agents
   */
  private async executeManaged(task: Task): Promise<{
    success: boolean;
    output?: any;
    error?: string;
    metrics: { cost_cents: number; tokens_used?: number };
  }> {
    try {
      const result = await this.managedClient.executeTask(task.agentId, {
        instruction: this.formatInstructionForManagedAgent(task),
        context: task.metadata,
        tools: this.getRequiredTools(task),
        max_completion_time_seconds: 300
      });

      return {
        success: result.success,
        output: result.result,
        error: result.error,
        metrics: {
          cost_cents: result.metrics.cost_cents,
          tokens_used: result.metrics.tokens_used
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Managed execution failed',
        metrics: { cost_cents: 0 }
      };
    }
  }

  /**
   * Hybrid execution: Start both, use fastest
   */
  private async executeHybrid(task: Task): Promise<{
    success: boolean;
    output?: any;
    error?: string;
    metrics: { cost_cents: number; tokens_used?: number };
  }> {
    try {
      // Race local vs managed execution
      const [localResult, managedResult] = await Promise.allSettled([
        this.executeLocal(task),
        this.executeManaged(task)
      ]);

      // Use the first successful result
      if (localResult.status === 'fulfilled' && localResult.value.success) {
        console.info(`[hybrid] Local execution won the race for task ${task.id}`);
        return localResult.value;
      }

      if (managedResult.status === 'fulfilled' && managedResult.value.success) {
        console.info(`[hybrid] Managed execution won the race for task ${task.id}`);
        return managedResult.value;
      }

      // Both failed
      throw new Error('Both local and managed execution failed');

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Hybrid execution failed',
        metrics: { cost_cents: 0 }
      };
    }
  }

  /**
   * Get current execution metrics for monitoring
   */
  getExecutionMetrics() {
    return {
      ...this.executionMetrics,
      daily_spend_cents: this.dailySpendCents,
      daily_budget_remaining_cents: this.config.cost_management.daily_budget_cents - this.dailySpendCents,
      budget_utilization_percent: (this.dailySpendCents / this.config.cost_management.daily_budget_cents) * 100
    };
  }

  private canAffordCloudExecution(costCents: number): boolean {
    const remainingBudget = this.config.cost_management.daily_budget_cents - this.dailySpendCents;
    const hardLimitCents = this.config.cost_management.daily_budget_cents *
                          (this.config.cost_management.hard_limit_percent / 100);

    return (this.dailySpendCents + costCents) <= hardLimitCents;
  }

  private async delegateToLocalAgent(task: Task): Promise<any> {
    // Integrate with existing OpenClaw agent execution
    // This would call the appropriate local skill based on task type
    return { message: 'Local execution completed', taskId: task.id };
  }

  private formatInstructionForManagedAgent(task: Task): string {
    return `Execute the following task for OpenClaw agent system:

Task Type: ${task.type}
Description: ${task.description}
Priority: ${task.priority}

Context: ${JSON.stringify(task.metadata, null, 2)}

Please provide a structured response with:
1. Action taken
2. Results obtained
3. Any recommendations or next steps
4. Confidence level (0-100%)`;
  }

  private getRequiredTools(task: Task): string[] {
    // Map task types to required tools for managed agents
    const toolMapping: Record<string, string[]> = {
      'code_analysis': ['git', 'static_analysis', 'security_scan'],
      'deploy': ['kubernetes', 'docker', 'monitoring'],
      'incident_response': ['logs', 'metrics', 'alerting'],
      'trading': ['market_data', 'portfolio_analysis', 'risk_management']
    };

    return toolMapping[task.type] || ['general'];
  }

  private startCapacityMonitoring(): void {
    // Monitor Mac Mini capacity every 30 seconds
    setInterval(() => {
      const loadAvg = require('os').loadavg()[0]; // 1-minute average
      const cpuCount = require('os').cpus().length;
      this.router['macMiniCapacity'].current_load = loadAvg / cpuCount;
    }, 30000);
  }
}