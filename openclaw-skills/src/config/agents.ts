/**
 * Example agent configurations for the OpenClaw gateway.
 *
 * These are registered on startup via the state manager.
 */

import { v4 as uuidv4 } from 'uuid';
import type { Agent } from '../types/protocol.js';

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  workspace: string;
  tags: string[];
}

/** Well-known agent IDs so seed data and skills can reference them. */
export const AGENT_IDS = {
  GITHUB_OPS: 'agent-github-ops-001',
  TRADING_BOT: 'agent-trading-bot-001',
  DEPLOY_MANAGER: 'agent-deploy-mgr-001',
  GITCLAW_AGENT: 'agent-gitclaw-001',
} as const;

export type WellKnownAgentId = (typeof AGENT_IDS)[keyof typeof AGENT_IDS];

export const AGENT_CONFIGS: AgentConfig[] = [
  {
    id: AGENT_IDS.GITHUB_OPS,
    name: 'GitHub Ops',
    description: 'Monitors GitHub Actions workflows, PR checks, and repository health across all services.',
    workspace: 'github.com/myorg',
    tags: ['ci', 'github', 'automation', 'devops'],
  },
  {
    id: AGENT_IDS.TRADING_BOT,
    name: 'Trading Bot',
    description: 'Monitors algorithmic trading strategies, detects anomalies, and requests approval for significant trade executions.',
    workspace: 'trading-desk-prod',
    tags: ['trading', 'finance', 'algo', 'risk'],
  },
  {
    id: AGENT_IDS.DEPLOY_MANAGER,
    name: 'Deploy Manager',
    description: 'Orchestrates deployments across staging and production environments, manages rollbacks and configuration changes.',
    workspace: 'deploy.myorg.internal',
    tags: ['deploy', 'k8s', 'infrastructure', 'devops'],
  },
  {
    id: AGENT_IDS.GITCLAW_AGENT,
    name: 'GitClaw Agent',
    description: 'Provides git operations with approval gates, monitors repository state, and manages code workflow automation.',
    workspace: 'git.repository.local',
    tags: ['git', 'vcs', 'automation', 'approval-gates', 'repository'],
  },
];

/**
 * Convert an AgentConfig into a full Agent with default runtime values.
 */
export function agentConfigToAgent(config: AgentConfig): Agent {
  return {
    id: config.id,
    name: config.name,
    description: config.description,
    status: 'offline',
    workspace: config.workspace,
    tags: config.tags,
    last_active: new Date().toISOString(),
    active_tasks: 0,
    pending_approvals: 0,
  };
}

/**
 * Generate a unique agent ID with an optional prefix.
 */
export function generateAgentId(prefix = 'agent'): string {
  return `${prefix}-${uuidv4()}`;
}
