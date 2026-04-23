/**
 * Hybrid Execution Engine
 * HIGH-ROI: Seamless Mac Mini + Anthropic Managed Agents orchestration
 */

import { HybridAgentRouter, ManagedAgentClient } from './agent-router.js';

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
        daily_budget_cents: config.cost_management.daily_budget_cents,
        current_spend_cents: this.dailySpendCents
      }
    );

    this.managedClient = new ManagedAgentClient(config.anthropic);

    // Start capacity monitoring
    this.startCapacityMonitoring();
  }

  /**
   * Test managed agents connection
   */
  async testManagedAgentsConnection(): Promise<{
    success: boolean;
    available_agents: number;
    connection_time_ms: number;
    error?: string;
  }> {
    const startTime = Date.now();

    try {
      const agents = await this.managedClient.listAvailableAgents();
      const connectionTime = Date.now() - startTime;

      return {
        success: true,
        available_agents: agents.length,
        connection_time_ms: connectionTime
      };
    } catch (error) {
      return {
        success: false,
        available_agents: 0,
        connection_time_ms: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Execute a test workload to validate hybrid routing
   */
  async testHybridExecution(): Promise<{
    success: boolean;
    routing_decision: string;
    execution_target: 'local' | 'managed' | 'hybrid';
    cost_estimate_cents: number;
    error?: string;
  }> {
    try {
      const testTask = {
        action_type: 'code_analysis',
        description: 'Analyze a TypeScript file for security vulnerabilities and code quality issues',
        context: { file_type: 'typescript', size_kb: 15 },
        priority: 'Medium' as const
      };

      const routing = this.router.routeWorkload(testTask);

      return {
        success: true,
        routing_decision: routing.reasoning,
        execution_target: routing.target === 'mac_mini' ? 'local' :
                          routing.target === 'anthropic_managed' ? 'managed' : 'hybrid',
        cost_estimate_cents: routing.cost_estimate_cents
      };
    } catch (error) {
      return {
        success: false,
        routing_decision: 'Error during routing',
        execution_target: 'local',
        cost_estimate_cents: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
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

  private startCapacityMonitoring(): void {
    // Monitor Mac Mini capacity every 30 seconds
    setInterval(() => {
      const loadAvg = require('os').loadavg()[0]; // 1-minute average
      const cpuCount = require('os').cpus().length;
      this.router['macMiniCapacity'].current_load = loadAvg / cpuCount;
    }, 30000);
  }
}