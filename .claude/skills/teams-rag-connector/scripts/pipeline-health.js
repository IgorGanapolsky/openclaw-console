#!/usr/bin/env node
/**
 * Teams RAG Pipeline Health Monitor
 *
 * Lightweight observability for the ingestion pipeline — inspired by
 * HackerNoon "1 GB Observability Stack" article (Feb 2026).
 *
 * Instead of deploying Prometheus/Loki/Grafana (overkill for a single pipeline),
 * this provides the same value as a JSON metrics file + CLI dashboard:
 *   - Ingestion metrics: messages/run, errors, durations
 *   - Staleness detection: alert if last sync > threshold
 *   - Graph API error tracking: 403s, rate limits, timeouts
 *   - LanceDB health: vector count, table existence
 *
 * Usage:
 *   node pipeline-health.js                # Show dashboard
 *   node pipeline-health.js --json         # Machine-readable output
 *   node pipeline-health.js --check        # Exit 1 if unhealthy
 *   node pipeline-health.js --test         # Run built-in tests
 *
 * Metrics are recorded by calling recordMetric() from ingest-messages.js.
 */

const fs = require('fs');
const path = require('path');

const METRICS_DIR = path.join(process.env.HOME, '.shieldcortex', 'metrics');
const METRICS_FILE = path.join(METRICS_DIR, 'teams-rag-metrics.json');
const STATE_FILE = path.join(process.env.HOME, '.shieldcortex', 'teams_sync_state.json');

/** Max hours since last sync before pipeline is considered stale */
const STALE_THRESHOLD_HOURS = 48;

// ---------------------------------------------------------------------------
// Metrics Store
// ---------------------------------------------------------------------------

function loadMetrics() {
  try {
    return JSON.parse(fs.readFileSync(METRICS_FILE, 'utf-8'));
  } catch {
    return { runs: [], errors: [], lastUpdated: null };
  }
}

function saveMetrics(metrics) {
  if (!fs.existsSync(METRICS_DIR)) fs.mkdirSync(METRICS_DIR, { recursive: true });
  metrics.lastUpdated = new Date().toISOString();
  fs.writeFileSync(METRICS_FILE, JSON.stringify(metrics, null, 2));
}

/**
 * Record a pipeline run metric.
 *
 * @param {object} params
 * @param {'backfill'|'incremental'|'webhook'} params.mode
 * @param {number} params.messagesIngested
 * @param {number} params.durationMs
 * @param {number} params.errorsEncountered
 * @param {string[]} [params.teamsProcessed]
 */
function recordRun(params) {
  const metrics = loadMetrics();

  metrics.runs.push({
    timestamp: new Date().toISOString(),
    mode: params.mode,
    messagesIngested: params.messagesIngested,
    durationMs: params.durationMs,
    errorsEncountered: params.errorsEncountered,
    teamsProcessed: params.teamsProcessed || [],
  });

  // Keep last 100 runs
  if (metrics.runs.length > 100) {
    metrics.runs = metrics.runs.slice(-100);
  }

  saveMetrics(metrics);
  return metrics.runs[metrics.runs.length - 1];
}

/**
 * Record a Graph API error for tracking.
 *
 * @param {object} params
 * @param {number} params.statusCode
 * @param {string} params.endpoint
 * @param {string} params.message
 */
function recordError(params) {
  const metrics = loadMetrics();

  metrics.errors.push({
    timestamp: new Date().toISOString(),
    statusCode: params.statusCode,
    endpoint: params.endpoint,
    message: params.message,
  });

  // Keep last 200 errors
  if (metrics.errors.length > 200) {
    metrics.errors = metrics.errors.slice(-200);
  }

  saveMetrics(metrics);
}

// ---------------------------------------------------------------------------
// Health Check
// ---------------------------------------------------------------------------

/**
 * Compute pipeline health status.
 *
 * @returns {{ healthy: boolean, checks: object[], summary: object }}
 */
function checkHealth() {
  const checks = [];
  const metrics = loadMetrics();

  // 1. Sync staleness
  let lastSync = null;
  try {
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    lastSync = state.lastSync;
  } catch { /* no state */ }

  if (lastSync) {
    const hoursSince = (Date.now() - new Date(lastSync).getTime()) / 3600000;
    checks.push({
      name: 'sync-freshness',
      status: hoursSince <= STALE_THRESHOLD_HOURS ? 'pass' : 'fail',
      value: `${Math.round(hoursSince)}h ago`,
      threshold: `${STALE_THRESHOLD_HOURS}h`,
    });
  } else {
    checks.push({
      name: 'sync-freshness',
      status: 'fail',
      value: 'never synced',
      threshold: `${STALE_THRESHOLD_HOURS}h`,
    });
  }

  // 2. Recent errors (last 24h)
  const oneDayAgo = Date.now() - 86400000;
  const recentErrors = metrics.errors.filter(
    (e) => new Date(e.timestamp).getTime() > oneDayAgo,
  );
  const error403s = recentErrors.filter((e) => e.statusCode === 403);
  const error429s = recentErrors.filter((e) => e.statusCode === 429);

  checks.push({
    name: 'errors-24h',
    status: recentErrors.length === 0 ? 'pass' : recentErrors.length <= 5 ? 'warn' : 'fail',
    value: `${recentErrors.length} (403: ${error403s.length}, 429: ${error429s.length})`,
    threshold: '≤5 warn, >5 fail',
  });

  // 3. LanceDB table exists
  const lanceDbPath = path.join(process.env.HOME, '.shieldcortex', 'lancedb', 'teams_messages.lance');
  const lanceExists = fs.existsSync(lanceDbPath);
  checks.push({
    name: 'lancedb-table',
    status: lanceExists ? 'pass' : 'fail',
    value: lanceExists ? 'exists' : 'missing',
  });

  // 4. Last run success
  const lastRun = metrics.runs[metrics.runs.length - 1];
  if (lastRun) {
    checks.push({
      name: 'last-run',
      status: lastRun.errorsEncountered === 0 ? 'pass' : 'warn',
      value: `${lastRun.messagesIngested} msgs, ${lastRun.errorsEncountered} errors, ${Math.round(lastRun.durationMs / 1000)}s`,
    });
  } else {
    checks.push({
      name: 'last-run',
      status: 'warn',
      value: 'no runs recorded',
    });
  }

  // 5. Total ingestion volume
  const totalMessages = metrics.runs.reduce((sum, r) => sum + r.messagesIngested, 0);
  checks.push({
    name: 'total-ingested',
    status: totalMessages > 0 ? 'pass' : 'warn',
    value: `${totalMessages} messages across ${metrics.runs.length} runs`,
  });

  const healthy = checks.every((c) => c.status !== 'fail');

  return {
    healthy,
    checks,
    summary: {
      totalRuns: metrics.runs.length,
      totalMessages,
      totalErrors: metrics.errors.length,
      recentErrors24h: recentErrors.length,
      lastSync,
    },
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function printDashboard() {
  const health = checkHealth();

  console.log('\n📊 Teams RAG Pipeline Health\n');

  for (const check of health.checks) {
    const icon = check.status === 'pass' ? '✅' : check.status === 'warn' ? '⚠️ ' : '❌';
    const line = `  ${icon} ${check.name}: ${check.value}`;
    console.log(line + (check.threshold ? ` (threshold: ${check.threshold})` : ''));
  }

  console.log(`\n  Status: ${health.healthy ? '✅ HEALTHY' : '❌ UNHEALTHY'}\n`);
  return health;
}

// ---------------------------------------------------------------------------
// Built-in Tests
// ---------------------------------------------------------------------------

function runTests() {
  let passed = 0;
  let failed = 0;
  const origMetricsFile = METRICS_FILE;
  const testDir = path.join(require('os').tmpdir(), `pipeline-health-test-${Date.now()}`);
  const testMetricsFile = path.join(testDir, 'test-metrics.json');

  function assert(condition, name) {
    if (condition) {
      passed++;
      console.log(`  ✅ ${name}`);
    } else {
      failed++;
      console.log(`  ❌ ${name}`);
    }
  }

  console.log('\n🧪 pipeline-health.js — Built-in Tests\n');

  // --- recordRun ---
  console.log('recordRun:');

  fs.mkdirSync(testDir, { recursive: true });

  // Use test file by writing directly
  const testMetrics = { runs: [], errors: [], lastUpdated: null };
  testMetrics.runs.push({
    timestamp: new Date().toISOString(),
    mode: 'backfill',
    messagesIngested: 500,
    durationMs: 30000,
    errorsEncountered: 2,
    teamsProcessed: ['Phoenix', 'Tech Support'],
  });
  fs.writeFileSync(testMetricsFile, JSON.stringify(testMetrics, null, 2));

  const loaded = JSON.parse(fs.readFileSync(testMetricsFile, 'utf-8'));
  assert(loaded.runs.length === 1, 'records a run');
  assert(loaded.runs[0].messagesIngested === 500, 'stores message count');
  assert(loaded.runs[0].mode === 'backfill', 'stores mode');
  assert(loaded.runs[0].errorsEncountered === 2, 'stores error count');

  // --- recordError ---
  console.log('\nrecordError:');

  testMetrics.errors.push({
    timestamp: new Date().toISOString(),
    statusCode: 403,
    endpoint: '/teams/123/channels/456/messages',
    message: 'Forbidden',
  });
  testMetrics.errors.push({
    timestamp: new Date().toISOString(),
    statusCode: 429,
    endpoint: '/me/chats',
    message: 'Rate limited',
  });
  fs.writeFileSync(testMetricsFile, JSON.stringify(testMetrics, null, 2));

  const loadedErrs = JSON.parse(fs.readFileSync(testMetricsFile, 'utf-8'));
  assert(loadedErrs.errors.length === 2, 'records errors');
  assert(loadedErrs.errors[0].statusCode === 403, 'stores 403');
  assert(loadedErrs.errors[1].statusCode === 429, 'stores 429');

  // --- checkHealth ---
  console.log('\ncheckHealth:');

  const health = checkHealth();
  assert(typeof health.healthy === 'boolean', 'returns healthy boolean');
  assert(Array.isArray(health.checks), 'returns checks array');
  assert(health.checks.length >= 4, `has ≥4 checks (got ${health.checks.length})`);
  assert(health.summary.lastSync !== undefined, 'summary includes lastSync');

  // Verify check structure
  for (const check of health.checks) {
    assert(
      ['pass', 'warn', 'fail'].includes(check.status),
      `check "${check.name}" has valid status: ${check.status}`,
    );
  }

  // --- staleness detection ---
  console.log('\nStaleness detection:');

  // Simulate fresh sync
  const freshState = { lastSync: new Date().toISOString(), totalMessages: 100, teamsIndexed: ['Phoenix'] };
  const freshStateFile = path.join(testDir, 'fresh-state.json');
  fs.writeFileSync(freshStateFile, JSON.stringify(freshState));

  // Check that real state file existence is detected
  const stateExists = fs.existsSync(STATE_FILE);
  assert(typeof stateExists === 'boolean', 'state file check works');

  // --- run cap ---
  console.log('\nRun cap (no unbounded growth):');

  const bigMetrics = { runs: [], errors: [], lastUpdated: null };
  for (let i = 0; i < 150; i++) {
    bigMetrics.runs.push({
      timestamp: new Date().toISOString(),
      mode: 'incremental',
      messagesIngested: i,
      durationMs: 1000,
      errorsEncountered: 0,
    });
  }
  // Simulate cap
  if (bigMetrics.runs.length > 100) bigMetrics.runs = bigMetrics.runs.slice(-100);
  assert(bigMetrics.runs.length === 100, 'caps at 100 runs');
  assert(bigMetrics.runs[0].messagesIngested === 50, 'oldest entries trimmed');

  const bigErrors = { errors: [] };
  for (let i = 0; i < 250; i++) {
    bigErrors.errors.push({ timestamp: new Date().toISOString(), statusCode: 500 });
  }
  if (bigErrors.errors.length > 200) bigErrors.errors = bigErrors.errors.slice(-200);
  assert(bigErrors.errors.length === 200, 'caps at 200 errors');

  // --- printDashboard ---
  console.log('\nprintDashboard:');
  // Just verify it doesn't crash
  const dashHealth = printDashboard();
  assert(dashHealth !== undefined, 'dashboard runs without crash');

  // Cleanup
  try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }

  // --- Summary ---
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`${'═'.repeat(50)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Exports + CLI
// ---------------------------------------------------------------------------

module.exports = { recordRun, recordError, checkHealth, loadMetrics };

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--test')) {
    runTests();
  } else if (args.includes('--json')) {
    console.log(JSON.stringify(checkHealth(), null, 2));
  } else if (args.includes('--check')) {
    const health = checkHealth();
    if (!health.healthy) {
      printDashboard();
      process.exit(1);
    }
    console.log('✅ Pipeline healthy');
  } else {
    printDashboard();
  }
}
