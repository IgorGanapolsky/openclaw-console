/**
 * Default configuration for the OpenClaw gateway.
 */

export interface GatewayConfig {
  /** HTTP/WS listen port */
  port: number;
  /** HTTP/WS bind host */
  host: string;
  /** Gateway version reported in /health and WS connected event */
  version: string;
  /** Path to the JSON file storing tokens */
  tokenStorePath: string;
  /** WebSocket ping interval in milliseconds */
  wsPingInterval: number;
  /** How long (ms) a WebSocket client can miss pongs before disconnect */
  wsPongTimeout: number;
  /** Default approval expiry in milliseconds */
  approvalTimeoutMs: number;
  /** Whether approval responses must include biometric_verified=true */
  requireBiometric: boolean;
  /** Enabled skill names */
  enabledSkills: string[];
  /** Isolated skill names (Nanoclaw mode) */
  isolatedSkills: string[];
  /** Whether to load seed data on startup */
  loadSeedData: boolean;
  /** Whether to simulate bridge sessions for demo */
  simulateBridges: boolean;
  /** MCP Server configurations (name:command:args) */
  mcpServers: string[];
  /** CORS allowed origins ('*' for all) */
  corsOrigins: string;
  /** Approval automation preset. manual keeps every gate human-driven. */
  approvalPolicyPreset: 'manual' | 'safe-yolo' | 'repo-yolo' | 'ci-yolo' | 'danger-yolo';
  /** How frequently WebSocket clients receive heartbeat/status events */
  heartbeatIntervalMs: number;
  /** Local OpenAI-compatible model endpoint, e.g. vLLM on Jetson */
  localModelBaseUrl: string | null;
  /** Local model identifier to display and use for local chat calls */
  localModelName: string | null;
  /** Local model status probe timeout in milliseconds */
  localModelTimeoutMs: number;
}

const DEFAULT_CONFIG: GatewayConfig = {
  port: parseInt(process.env['PORT'] ?? '18789', 10),
  host: process.env['HOST'] ?? '0.0.0.0',
  version: '1.0.0',
  tokenStorePath: process.env['TOKEN_STORE'] ?? './data/tokens.json',
  wsPingInterval: 30_000,
  wsPongTimeout: 10_000,
  approvalTimeoutMs: 5 * 60 * 1000, // 5 minutes
  requireBiometric: process.env['REQUIRE_BIOMETRIC'] !== 'false',
  enabledSkills: ['ci-monitor', 'incident-manager', 'approval-gate', 'task-manager', 'trading-monitor', 'gitclaw-agent'],
  isolatedSkills: process.env['ISOLATED_SKILLS']?.split(',') ?? [],
  loadSeedData: process.env['LOAD_SEED_DATA'] !== 'false',
  simulateBridges: process.env['SIMULATE_BRIDGES'] !== 'false',
  mcpServers: process.env['MCP_SERVERS']?.split(';') ?? [],
  corsOrigins: process.env['CORS_ORIGINS'] ?? '*',
  approvalPolicyPreset: parseApprovalPolicyPreset(process.env['OPENCLAW_APPROVAL_POLICY'] ?? 'manual'),
  heartbeatIntervalMs: parseInt(process.env['OPENCLAW_HEARTBEAT_INTERVAL_MS'] ?? '10000', 10),
  localModelBaseUrl: process.env['OPENCLAW_LOCAL_MODEL_BASE_URL'] ?? process.env['OPENAI_BASE_URL'] ?? null,
  localModelName: process.env['OPENCLAW_LOCAL_MODEL_NAME'] ?? null,
  localModelTimeoutMs: parseInt(process.env['OPENCLAW_LOCAL_MODEL_TIMEOUT_MS'] ?? '2500', 10),
};

function parseApprovalPolicyPreset(raw: string): GatewayConfig['approvalPolicyPreset'] {
  if (raw === 'safe-yolo' || raw === 'repo-yolo' || raw === 'ci-yolo' || raw === 'danger-yolo') {
    return raw;
  }
  return 'manual';
}

export default DEFAULT_CONFIG;
