/**
 * Anthropic Managed Agents Integration
 * HIGH-ROI: Complete hybrid agent orchestration for OpenClaw
 */

export { HybridAgentRouter, ManagedAgentClient } from './agent-router.js';
export { HybridExecutionEngine } from './hybrid-executor.js';

import { HybridExecutionEngine, type HybridExecutionConfig } from './hybrid-executor.js';

/**
 * Factory function to create managed agents integration
 * Integrates seamlessly with existing OpenClaw infrastructure
 */
export function createManagedAgentsIntegration(
  config?: Partial<HybridExecutionConfig>
): HybridExecutionEngine | null {
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_MANAGED_AGENT_KEY;

  if (!anthropicApiKey) {
    console.warn('[managed-agents] No Anthropic API key found. Managed agents integration disabled.');
    console.warn('[managed-agents] Set ANTHROPIC_API_KEY or ANTHROPIC_MANAGED_AGENT_KEY environment variable.');
    return null;
  }

  const defaultConfig: HybridExecutionConfig = {
    anthropic: {
      api_key: anthropicApiKey,
      base_url: process.env.ANTHROPIC_MANAGED_AGENTS_URL || 'https://api.anthropic.com/v1/managed-agents',
      organization_id: process.env.ANTHROPIC_ORGANIZATION_ID
    },
    cost_management: {
      daily_budget_cents: parseInt(process.env.ANTHROPIC_DAILY_BUDGET_CENTS || '1000', 10), // $10/day default
      alert_threshold_percent: parseInt(process.env.ANTHROPIC_ALERT_THRESHOLD_PERCENT || '80', 10),
      hard_limit_percent: parseInt(process.env.ANTHROPIC_HARD_LIMIT_PERCENT || '95', 10)
    },
    routing_preferences: {
      prefer_local_for_privacy: process.env.ANTHROPIC_PREFER_LOCAL_PRIVACY !== 'false',
      max_cloud_latency_seconds: parseInt(process.env.ANTHROPIC_MAX_CLOUD_LATENCY || '60', 10),
      cost_optimization_mode: (process.env.ANTHROPIC_COST_MODE as any) || 'balanced'
    }
  };

  const mergedConfig = {
    ...defaultConfig,
    ...config,
    anthropic: { ...defaultConfig.anthropic, ...config?.anthropic },
    cost_management: { ...defaultConfig.cost_management, ...config?.cost_management },
    routing_preferences: { ...defaultConfig.routing_preferences, ...config?.routing_preferences }
  };

  try {
    const engine = new HybridExecutionEngine(mergedConfig);
    console.info('[managed-agents] ✅ Hybrid execution engine initialized');
    console.info(`[managed-agents] Daily budget: $${mergedConfig.cost_management.daily_budget_cents / 100}`);
    console.info(`[managed-agents] Cost mode: ${mergedConfig.routing_preferences.cost_optimization_mode}`);
    return engine;
  } catch (error) {
    console.error('[managed-agents] Failed to initialize managed agents integration:', error);
    return null;
  }
}

/**
 * Validate managed agents configuration
 */
export function validateManagedAgentsConfig(): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required environment variables
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_MANAGED_AGENT_KEY) {
    errors.push('Missing required environment variable: ANTHROPIC_API_KEY or ANTHROPIC_MANAGED_AGENT_KEY');
  }

  // Budget validation
  const dailyBudget = parseInt(process.env.ANTHROPIC_DAILY_BUDGET_CENTS || '1000', 10);
  if (dailyBudget < 100) {
    warnings.push('Daily budget is very low (<$1). Consider increasing for better performance.');
  }
  if (dailyBudget > 10000) {
    warnings.push('Daily budget is high (>$100). Ensure cost monitoring is enabled.');
  }

  // URL validation
  const baseUrl = process.env.ANTHROPIC_MANAGED_AGENTS_URL;
  if (baseUrl && !baseUrl.startsWith('https://')) {
    warnings.push('Managed agents URL should use HTTPS for security.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Get environment-specific managed agents configuration
 */
export function getManagedAgentsEnvConfig(): Record<string, string> {
  return {
    // Anthropic Managed Agents Configuration
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
    ANTHROPIC_MANAGED_AGENT_KEY: process.env.ANTHROPIC_MANAGED_AGENT_KEY || '',
    ANTHROPIC_MANAGED_AGENTS_URL: process.env.ANTHROPIC_MANAGED_AGENTS_URL || 'https://api.anthropic.com/v1/managed-agents',
    ANTHROPIC_ORGANIZATION_ID: process.env.ANTHROPIC_ORGANIZATION_ID || '',

    // Cost Management
    ANTHROPIC_DAILY_BUDGET_CENTS: process.env.ANTHROPIC_DAILY_BUDGET_CENTS || '1000',
    ANTHROPIC_ALERT_THRESHOLD_PERCENT: process.env.ANTHROPIC_ALERT_THRESHOLD_PERCENT || '80',
    ANTHROPIC_HARD_LIMIT_PERCENT: process.env.ANTHROPIC_HARD_LIMIT_PERCENT || '95',

    // Routing Preferences
    ANTHROPIC_PREFER_LOCAL_PRIVACY: process.env.ANTHROPIC_PREFER_LOCAL_PRIVACY || 'true',
    ANTHROPIC_MAX_CLOUD_LATENCY: process.env.ANTHROPIC_MAX_CLOUD_LATENCY || '60',
    ANTHROPIC_COST_MODE: process.env.ANTHROPIC_COST_MODE || 'balanced',

    // Integration Flags
    ENABLE_ANTHROPIC_MANAGED_AGENTS: process.env.ENABLE_ANTHROPIC_MANAGED_AGENTS || 'false'
  };
}