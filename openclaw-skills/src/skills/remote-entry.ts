/**
 * remote-entry.ts — Entry point for isolated "Nanoclaw-style" skill containers.
 * 
 * This script initializes a RemoteStateManager and boots the requested skill.
 */

import { RemoteStateManager } from './remote-client.js';
import { CiMonitorSkill } from './ci-monitor.js';
import { TradingMonitorSkill } from './trading-monitor.js';
import type { IStateManager } from '../gateway/state-interface.js';
import type { GatewayConfig } from '../config/default.js';

async function main(): Promise<void> {
  const agentId = process.env['AGENT_ID'];
  const skillName = process.env['SKILL_NAME'];
  const gatewayUrl = process.env['GATEWAY_URL'] || 'http://host.docker.internal:18789';

  if (!agentId || !skillName) {
    console.error('[remote] Missing AGENT_ID or SKILL_NAME environment variables');
    process.exit(1);
  }

  console.info(`[remote] Booting isolated skill: ${skillName} for agent ${agentId}`);
  console.info(`[remote] Gateway URL: ${gatewayUrl}`);

  const state = new RemoteStateManager(gatewayUrl);

  // Skill Factory
  let skill: { start(): void; stop(): void };

  switch (skillName) {
    case 'ci-monitor':
      skill = new CiMonitorSkill(state as unknown as IStateManager, {
        agentId,
        agentName: 'GitHub Ops (Isolated)',
        repository: process.env['GITHUB_REPO'] || 'myorg/myservice',
        pollIntervalMs: parseInt(process.env['POLL_INTERVAL'] || '30000', 10),
      });
      break;
    case 'trading-monitor':
      skill = new TradingMonitorSkill(
        state as unknown as IStateManager, 
        {} as unknown as GatewayConfig, 
        {
          agentId,
          agentName: 'Trading Bot (Isolated)',
          symbols: (process.env['SYMBOLS'] || 'BTC-USD,ETH-USD').split(','),
          pollIntervalMs: parseInt(process.env['POLL_INTERVAL'] || '60000', 10),
        }
      );
      break;
    default:
      console.error(`[remote] Unknown skill name: ${skillName}`);
      process.exit(1);
  }

  console.info(`[remote] Starting ${skillName}...`);
  skill.start();

  // Handle shutdown
  const shutdown = (): void => {
    console.info(`[remote] Stopping ${skillName}...`);
    skill.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err: unknown) => {
  console.error('[remote] Fatal error:', err);
  process.exit(1);
});
