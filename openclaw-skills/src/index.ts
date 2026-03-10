/**
 * OpenClaw Gateway — Main Entry Point
 *
 * Bootstraps the gateway server, registers agents and skills,
 * optionally loads seed data, and starts listening.
 */

import DEFAULT_CONFIG from './config/default.js';
import { StateManager } from './gateway/state.js';
import { createGatewayServer } from './gateway/server.js';
import { AGENT_CONFIGS, agentConfigToAgent } from './config/agents.js';
import { SEED_AGENTS, SEED_TASKS, SEED_INCIDENTS } from './config/seed-data.js';
import { CiMonitorSkill } from './skills/ci-monitor.js';
import { TradingMonitorSkill } from './skills/trading-monitor.js';
import { AGENT_IDS } from './config/agents.js';

async function main(): Promise<void> {
  console.info('='.repeat(60));
  console.info('  OpenClaw Work Console Gateway');
  console.info(`  Version: ${DEFAULT_CONFIG.version}`);
  console.info('='.repeat(60));

  // ── 1. Initialize state ─────────────────────────────────────────────────

  const state = new StateManager();

  // ── 2. Register configured agents ───────────────────────────────────────

  if (DEFAULT_CONFIG.loadSeedData) {
    console.info('[startup] Loading seed data...');
    state.bulkLoad({
      agents: SEED_AGENTS,
      tasks: SEED_TASKS,
      incidents: SEED_INCIDENTS,
    });
    console.info(`[startup] Loaded ${SEED_AGENTS.length} agents, ${SEED_TASKS.length} tasks, ${SEED_INCIDENTS.length} incidents`);
  } else {
    // Register agents from config (offline by default)
    for (const cfg of AGENT_CONFIGS) {
      await state.upsertAgent(agentConfigToAgent(cfg));
    }
    console.info(`[startup] Registered ${AGENT_CONFIGS.length} agents`);
  }

  // ── 3. Start gateway server ─────────────────────────────────────────────

  const gateway = createGatewayServer(DEFAULT_CONFIG, state);
  await gateway.start();

  // ── 4. Nanoclaw Isolation Setup (Docker) ────────────────────────────────

  const isolatedSkills = new Set(DEFAULT_CONFIG.isolatedSkills);
  if (isolatedSkills.size > 0) {
    try {
      await gateway.containerManager.buildBaseImage();
    } catch (err) {
      console.warn('[startup] Failed to build Docker base image. Isolated skills may not start.', err);
    }
  }

  // Print dev token for easy curl testing
  const devToken = gateway.tokenManager.getDefaultDevToken();
  if (devToken) {
    console.info('');
    console.info('Quick-start:');
    console.info(`  curl -H "Authorization: Bearer ${devToken}" http://localhost:${DEFAULT_CONFIG.port}/api/health`);
    console.info(`  curl -H "Authorization: Bearer ${devToken}" http://localhost:${DEFAULT_CONFIG.port}/api/agents`);
    console.info('');
  }

  // ── 5. Register and start skills ────────────────────────────────────────

  const enabledSkills = new Set(DEFAULT_CONFIG.enabledSkills);

  // --- CI Monitor ---
  if (enabledSkills.has('ci-monitor')) {
    if (isolatedSkills.has('ci-monitor')) {
      await gateway.containerManager.startSkill({
        skillName: 'ci-monitor',
        agentId: AGENT_IDS.GITHUB_OPS,
        env: { GITHUB_REPO: 'myorg/myservice' }
      });
      console.info('[startup] CI Monitor skill started (ISOLATED/CONTAINER)');
    } else {
      const ciMonitor = new CiMonitorSkill(state, {
        agentId: AGENT_IDS.GITHUB_OPS,
        agentName: 'GitHub Ops',
        repository: 'myorg/myservice',
        pollIntervalMs: 45_000,
      });
      ciMonitor.start();
      console.info('[startup] CI Monitor skill started (IN-PROCESS)');
    }
    await state.updateAgentStatus(AGENT_IDS.GITHUB_OPS, 'online');
  }

  // --- Trading Monitor ---
  if (enabledSkills.has('trading-monitor')) {
    if (isolatedSkills.has('trading-monitor')) {
      await gateway.containerManager.startSkill({
        skillName: 'trading-monitor',
        agentId: AGENT_IDS.TRADING_BOT,
        env: { SYMBOLS: 'BTC-USD,ETH-USD,AAPL,TSLA' }
      });
      console.info('[startup] Trading Monitor skill started (ISOLATED/CONTAINER)');
    } else {
      const tradingMonitor = new TradingMonitorSkill(state, DEFAULT_CONFIG, {
        agentId: AGENT_IDS.TRADING_BOT,
        agentName: 'Trading Bot',
        symbols: ['BTC-USD', 'ETH-USD', 'AAPL', 'TSLA'],
        pollIntervalMs: 60_000,
      });
      tradingMonitor.start();
      console.info('[startup] Trading Monitor skill started (IN-PROCESS)');
    }
    await state.updateAgentStatus(AGENT_IDS.TRADING_BOT, 'busy');
  }

  // Mark Deploy Manager as online
  await state.updateAgentStatus(AGENT_IDS.DEPLOY_MANAGER, 'online');

  console.info('[startup] All skills initialized. Gateway ready.');
  console.info('');

  // ── 6. Graceful shutdown ─────────────────────────────────────────────────

  const shutdown = async (): Promise<void> => {
    console.info('\n[shutdown] Shutting down...');
    
    // Stop containers
    for (const skillName of isolatedSkills) {
      await gateway.containerManager.stopSkill(skillName);
    }
    
    await gateway.stop();
    console.info('[shutdown] Goodbye.');
    process.exit(0);
  };

  process.on('SIGINT', () => { void shutdown(); });
  process.on('SIGTERM', () => { void shutdown(); });
}

main().catch((err: unknown) => {
  console.error('[fatal]', err);
  process.exit(1);
});
