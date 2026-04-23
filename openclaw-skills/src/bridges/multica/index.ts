/**
 * Multica Bridge Module
 *
 * High-ROI integration between OpenClaw and Multica for:
 * - Structured prompting via issues
 * - Biometric approval workflows
 * - Automated agent orchestration
 */

export { MulticaBridge } from './bridge.js';
export { MulticaClient } from './client.js';
export { MulticaWebhookHandler } from './webhook-handler.js';
export { DEFAULT_MULTICA_CONFIG, createMulticaConfig, validateMulticaConfig } from './config.js';
export * from './types.js';