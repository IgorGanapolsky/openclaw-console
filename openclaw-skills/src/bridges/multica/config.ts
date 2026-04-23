/**
 * Multica Bridge Configuration
 */

import { MulticaBridgeConfig } from './types.js';
import { AGENT_IDS } from '../../config/agents.js';

export const DEFAULT_MULTICA_CONFIG: MulticaBridgeConfig = {
  multica_api_url: process.env.MULTICA_API_URL || 'http://localhost:8080',
  multica_api_token: process.env.MULTICA_API_TOKEN || '',
  multica_webhook_secret: process.env.MULTICA_WEBHOOK_SECRET || '',
  approval_timeout_minutes: 5, // 5 minutes for approval decisions
  auto_translate_priorities: true,

  // Map OpenClaw agents to Multica agents
  default_agent_mapping: {
    [AGENT_IDS.GITHUB_OPS]: 'github-ops-agent',
    [AGENT_IDS.DEPLOY_MANAGER]: 'deploy-manager-agent',
    [AGENT_IDS.TRADING_BOT]: 'trading-bot-agent',
    [AGENT_IDS.GITCLAW_AGENT]: 'gitclaw-agent',
  },

  // Risk level detection from Multica labels
  risk_level_mapping: {
    high: [
      'production',
      'deploy',
      'database',
      'shell-command',
      'config-change'
    ],
    critical: [
      'destructive',
      'delete',
      'drop-table',
      'force-push',
      'key-rotation',
      'trade-execution'
    ]
  }
};

export function createMulticaConfig(overrides?: Partial<MulticaBridgeConfig>): MulticaBridgeConfig {
  return {
    ...DEFAULT_MULTICA_CONFIG,
    ...overrides
  };
}

// Validation helper
export function validateMulticaConfig(config: MulticaBridgeConfig): string[] {
  const errors: string[] = [];

  if (!config.multica_api_url) {
    errors.push('multica_api_url is required');
  }

  if (!config.multica_api_token) {
    errors.push('multica_api_token is required');
  }

  if (config.approval_timeout_minutes <= 0) {
    errors.push('approval_timeout_minutes must be positive');
  }

  if (Object.keys(config.default_agent_mapping).length === 0) {
    errors.push('at least one agent mapping is required');
  }

  try {
    new URL(config.multica_api_url);
  } catch {
    errors.push('multica_api_url must be a valid URL');
  }

  return errors;
}