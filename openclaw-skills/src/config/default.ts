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
};

export default DEFAULT_CONFIG;
