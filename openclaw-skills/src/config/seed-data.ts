/**
 * Seed data for demo and local testing.
 *
 * Provides 3 agents, 5 tasks with steps, 3 incidents, and 2 pending
 * approval requests. Loaded at startup when LOAD_SEED_DATA !== 'false'.
 */

import { v4 as uuidv4 } from 'uuid';
import type { Agent, Task, Incident } from '../types/protocol.js';
import { AGENT_IDS } from './agents.js';

// ── Helper factories ──────────────────────────────────────────────────────────

function iso(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

// ── Seed Agents ───────────────────────────────────────────────────────────────

export const SEED_AGENTS: Agent[] = [
  {
    id: AGENT_IDS.GITHUB_OPS,
    name: 'GitHub Ops',
    description: 'Monitors GitHub Actions workflows, PR checks, and repository health.',
    status: 'online',
    workspace: 'github.com/myorg',
    tags: ['ci', 'github', 'automation', 'devops'],
    last_active: iso(-120_000),
    active_tasks: 2,
    pending_approvals: 0,
  },
  {
    id: AGENT_IDS.TRADING_BOT,
    name: 'Trading Bot',
    description: 'Monitors algorithmic trading strategies and requests approval for large trades.',
    status: 'busy',
    workspace: 'trading-desk-prod',
    tags: ['trading', 'finance', 'algo', 'risk'],
    last_active: iso(-30_000),
    active_tasks: 1,
    pending_approvals: 1,
  },
  {
    id: AGENT_IDS.DEPLOY_MANAGER,
    name: 'Deploy Manager',
    description: 'Orchestrates deployments across staging and production environments.',
    status: 'online',
    workspace: 'deploy.myorg.internal',
    tags: ['deploy', 'k8s', 'infrastructure', 'devops'],
    last_active: iso(-600_000),
    active_tasks: 0,
    pending_approvals: 1,
  },
];

// ── Seed Tasks ────────────────────────────────────────────────────────────────

const task1Id = uuidv4();
const task2Id = uuidv4();
const task3Id = uuidv4();
const task4Id = uuidv4();
const task5Id = uuidv4();

export const SEED_TASKS: Task[] = [
  {
    id: task1Id,
    agent_id: AGENT_IDS.GITHUB_OPS,
    title: 'CI: build-and-test (main@a3b4f1e)',
    description: 'GitHub Actions workflow run on main branch',
    status: 'running',
    created_at: iso(-180_000),
    updated_at: iso(-60_000),
    steps: [
      { id: uuidv4(), task_id: task1Id, type: 'log', content: 'Workflow "CI" triggered on branch "main"', timestamp: iso(-180_000), metadata: {} },
      { id: uuidv4(), task_id: task1Id, type: 'log', content: 'Commit: a3b4f1e7d2c891ab', timestamp: iso(-175_000), metadata: {} },
      { id: uuidv4(), task_id: task1Id, type: 'tool_call', content: 'Tool: github_api.get_workflow_run', timestamp: iso(-170_000), metadata: { tool: 'github_api.get_workflow_run', args: { run_id: '9001', repo: 'myorg/myservice' } } },
      { id: uuidv4(), task_id: task1Id, type: 'log', content: 'Step: Checkout code ✓', timestamp: iso(-165_000), metadata: { step: 'checkout', status: 'success' } },
      { id: uuidv4(), task_id: task1Id, type: 'log', content: 'Step: Install dependencies ✓', timestamp: iso(-150_000), metadata: { step: 'install', status: 'success' } },
      { id: uuidv4(), task_id: task1Id, type: 'log', content: 'Step: Run tests — in progress…', timestamp: iso(-60_000), metadata: { step: 'test', status: 'in_progress' } },
    ],
    links: [
      { label: 'Run #9001', url: 'https://github.com/myorg/myservice/actions/runs/9001', type: 'github_run' },
    ],
  },
  {
    id: task2Id,
    agent_id: AGENT_IDS.GITHUB_OPS,
    title: 'CI: lint-check (feature/auth@f9c2a11)',
    description: 'Linting workflow on feature branch',
    status: 'done',
    created_at: iso(-3600_000),
    updated_at: iso(-3300_000),
    steps: [
      { id: uuidv4(), task_id: task2Id, type: 'log', content: 'Workflow "Lint" triggered on branch "feature/auth"', timestamp: iso(-3600_000), metadata: {} },
      { id: uuidv4(), task_id: task2Id, type: 'log', content: 'Step: ESLint ✓ — 0 errors, 2 warnings', timestamp: iso(-3500_000), metadata: { errors: 0, warnings: 2 } },
      { id: uuidv4(), task_id: task2Id, type: 'output', content: '✓ Lint check passed', timestamp: iso(-3300_000), metadata: {} },
    ],
    links: [
      { label: 'Run #8988', url: 'https://github.com/myorg/myservice/actions/runs/8988', type: 'github_run' },
      { label: 'PR #142', url: 'https://github.com/myorg/myservice/pull/142', type: 'github_pr' },
    ],
  },
  {
    id: task3Id,
    agent_id: AGENT_IDS.GITHUB_OPS,
    title: 'CI: build-and-test (main@9d1e3c0) — FAILED',
    description: 'GitHub Actions workflow — test suite failure',
    status: 'failed',
    created_at: iso(-7200_000),
    updated_at: iso(-6900_000),
    steps: [
      { id: uuidv4(), task_id: task3Id, type: 'log', content: 'Workflow "CI" triggered on branch "main"', timestamp: iso(-7200_000), metadata: {} },
      { id: uuidv4(), task_id: task3Id, type: 'log', content: 'Step: Checkout code ✓', timestamp: iso(-7100_000), metadata: {} },
      { id: uuidv4(), task_id: task3Id, type: 'log', content: 'Step: Install dependencies ✓', timestamp: iso(-7000_000), metadata: {} },
      { id: uuidv4(), task_id: task3Id, type: 'error', content: 'Step: Run tests FAILED — 3 tests failed in auth.spec.ts', timestamp: iso(-6900_000), metadata: { failed_tests: ['login.test.ts:42', 'session.test.ts:18', 'token.test.ts:7'] } },
    ],
    links: [
      { label: 'Run #8971', url: 'https://github.com/myorg/myservice/actions/runs/8971', type: 'github_run' },
    ],
  },
  {
    id: task4Id,
    agent_id: AGENT_IDS.TRADING_BOT,
    title: 'BUY 2.21 BTC-USD @ $44,850.00',
    description: 'Strategy: MomentumBreakout-v3 — Bullish breakout signal confirmed',
    status: 'running',
    created_at: iso(-120_000),
    updated_at: iso(-10_000),
    steps: [
      { id: uuidv4(), task_id: task4Id, type: 'log', content: 'Trade proposal: buy 2.21 BTC-USD', timestamp: iso(-120_000), metadata: {} },
      { id: uuidv4(), task_id: task4Id, type: 'log', content: 'Notional value: $99,118.50', timestamp: iso(-119_000), metadata: { notional: 99118.50 } },
      { id: uuidv4(), task_id: task4Id, type: 'log', content: 'Order exceeds $50,000 threshold — requesting human approval', timestamp: iso(-118_000), metadata: { requires_approval: true } },
      { id: uuidv4(), task_id: task4Id, type: 'info', content: 'Awaiting approval decision…', timestamp: iso(-10_000), metadata: {} },
    ],
    links: [
      { label: 'Trading Dashboard', url: 'https://trading.internal/orders/trade-001', type: 'dashboard' },
    ],
  },
  {
    id: task5Id,
    agent_id: AGENT_IDS.DEPLOY_MANAGER,
    title: 'Deploy myservice v2.4.1 → production',
    description: 'Kubernetes rolling update for myservice in production namespace',
    status: 'done',
    created_at: iso(-86400_000),
    updated_at: iso(-86100_000),
    steps: [
      { id: uuidv4(), task_id: task5Id, type: 'log', content: 'Deployment started: myservice v2.4.1 → production', timestamp: iso(-86400_000), metadata: {} },
      { id: uuidv4(), task_id: task5Id, type: 'tool_call', content: 'Tool: kubectl.set_image', timestamp: iso(-86300_000), metadata: { image: 'myservice:2.4.1', namespace: 'production' } },
      { id: uuidv4(), task_id: task5Id, type: 'log', content: 'Rolling update: 0/4 pods ready', timestamp: iso(-86280_000), metadata: {} },
      { id: uuidv4(), task_id: task5Id, type: 'log', content: 'Rolling update: 2/4 pods ready', timestamp: iso(-86220_000), metadata: {} },
      { id: uuidv4(), task_id: task5Id, type: 'log', content: 'Rolling update: 4/4 pods ready', timestamp: iso(-86160_000), metadata: {} },
      { id: uuidv4(), task_id: task5Id, type: 'output', content: '✓ Deployment complete: myservice v2.4.1 running in production', timestamp: iso(-86100_000), metadata: {} },
    ],
    links: [
      { label: 'K8s Dashboard', url: 'https://k8s.internal/namespaces/production/deployments/myservice', type: 'dashboard' },
    ],
  },
];

// ── Seed Incidents ────────────────────────────────────────────────────────────

export const SEED_INCIDENTS: Incident[] = [
  {
    id: uuidv4(),
    agent_id: AGENT_IDS.GITHUB_OPS,
    agent_name: 'GitHub Ops',
    severity: 'warning',
    title: 'CI failure: build-and-test on main',
    description: [
      'Workflow "CI" failed on branch "main".',
      'Commit: 9d1e3c0',
      '3 tests failed in auth.spec.ts',
      'Repository: myorg/myservice',
      'Run URL: https://github.com/myorg/myservice/actions/runs/8971',
    ].join('\n'),
    status: 'open',
    created_at: iso(-6900_000),
    updated_at: iso(-6900_000),
    actions: ['ask_root_cause', 'propose_fix', 'acknowledge'],
  },
  {
    id: uuidv4(),
    agent_id: AGENT_IDS.TRADING_BOT,
    agent_name: 'Trading Bot',
    severity: 'critical',
    title: 'Trading anomaly: price spike on BTC-USD',
    description: 'BTC-USD price moved +12.4% in under 60 seconds — potential manipulation or news event.',
    status: 'acknowledged',
    created_at: iso(-300_000),
    updated_at: iso(-240_000),
    actions: ['ask_root_cause', 'propose_fix'],
  },
  {
    id: uuidv4(),
    agent_id: AGENT_IDS.DEPLOY_MANAGER,
    agent_name: 'Deploy Manager',
    severity: 'info',
    title: 'Deployment rollback candidate: myservice v2.4.1',
    description: 'Error rate for myservice v2.4.1 in production is 0.8% — above the 0.5% threshold. Consider rollback.',
    status: 'open',
    created_at: iso(-3600_000),
    updated_at: iso(-3600_000),
    actions: ['ask_root_cause', 'propose_fix', 'acknowledge'],
  },
];

// ── Seed Approvals (pending) ──────────────────────────────────────────────────
// Note: these are ApprovalRequest objects for display only.
// The real approval promises are registered via StateManager.queueApproval().
// Seed approvals are loaded via bulkLoad and shown in /api/approvals/pending
// but their Promises are not wired — they'll simply expire if not responded to.

import type { ApprovalRequest } from '../types/protocol.js';

export const SEED_APPROVAL_REQUESTS: ApprovalRequest[] = [
  {
    id: uuidv4(),
    agent_id: AGENT_IDS.TRADING_BOT,
    agent_name: 'Trading Bot',
    action_type: 'trade_execution',
    title: 'Approve trade: BUY 2.21 BTC-USD',
    description: [
      'Strategy "MomentumBreakout-v3" is requesting execution of a large order.',
      '',
      'Symbol:   BTC-USD',
      'Side:     BUY',
      'Quantity: 2.21',
      'Price:    $44,850.00',
      'Notional: $99,118.50',
      '',
      'Rationale: Bullish breakout signal confirmed by 3/5 indicators on BTC-USD',
    ].join('\n'),
    command: 'trade.execute({ id: "trade-seed-001", symbol: "BTC-USD", side: "buy", qty: 2.21, price: 44850 })',
    context: {
      service: 'trading-engine',
      environment: 'production',
      repository: 'myorg/trading-bot',
      risk_level: 'critical',
    },
    created_at: iso(-120_000),
    expires_at: iso(180_000), // Expires 3 min from now
  },
  {
    id: uuidv4(),
    agent_id: AGENT_IDS.DEPLOY_MANAGER,
    agent_name: 'Deploy Manager',
    action_type: 'deploy',
    title: 'Deploy auth-service v3.1.0 → production',
    description: [
      'Deploy Manager is requesting a production deployment.',
      '',
      'Service:     auth-service',
      'Version:     v3.1.0',
      'Environment: production',
      'Risk:        Config changes included (OIDC provider update)',
    ].join('\n'),
    command: 'kubectl set image deployment/auth-service auth-service=auth-service:3.1.0 -n production',
    context: {
      service: 'auth-service',
      environment: 'production',
      repository: 'myorg/auth-service',
      risk_level: 'critical',
    },
    created_at: iso(-300_000),
    expires_at: iso(0), // Expires now — will be shown as expiring soon
  },
];
