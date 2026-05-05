/**
 * OpenClaw Gateway HTTP + WebSocket server.
 *
 * Serves all REST endpoints and manages WebSocket upgrades.
 * All business logic delegates to StateManager; this module only
 * handles routing, serialisation, and auth middleware.
 */

import http from 'node:http';
import express from 'express';
import { WebSocketServer } from 'ws';
import type { Request, Response } from 'express';
import { bearerAuthMiddleware, TokenManager } from './auth.js';
import type { StateManager } from './state.js';
import type { WebSocketManager } from './websocket.js';
import { createWebSocketManager } from './websocket.js';
import type { GatewayConfig } from '../config/default.js';
import { DockerContainerManager } from './container-manager.js';
import { registerRemoteApi } from './remote-api.js';
import { SkillGenerator } from './skill-generator.js';
import { McpManager } from './mcp-manager.js';
import type {
  ChatRequest,
  ApprovalRespondRequest,
  HealthResponse,
  OperatorSummaryResponse,
  ApprovalResponse,
  RuntimeConfigResponse,
  RuntimeConfigUpdateRequest,
  ActionType,
  AgentPlanStepStatus,
  GovernanceEvent,
} from '../types/protocol.js';
import { ERROR_CODES } from '../types/protocol.js';
import { createBillingRouter } from '../billing/revenuecat.js';
import { createAnalyticsRouter } from '../analytics/events.js';
import { createIntegrationsRouter } from '../integrations/devops-hub.js';
import { getConfiguredLocalModel, probeLocalModelProvider } from './model-provider.js';
import {
  isApprovalPolicyPreset,
  isResponseProfile,
  isResponseVerbosity,
} from '../config/default.js';
import {
  applyBridgeSessionControl,
  isBridgeSessionControlAction,
  normalizeProjectBridgeSession,
} from './project-session.js';
import {
  buildGatewayPairingPayload,
  pairingUri,
  rejectNonLocalPairing,
  renderPairingPage,
  renderTerminalPairingQr,
} from './pairing.js';
import { normalizeSkillWorkflowSystem } from './skill-workflow.js';
import { buildOperatorSummary } from './operator-summary.js';
import { presentTaskForOperator } from '../utils/response-style.js';
import {
  assessAgentCommerceRisk,
  assessSupplyChainRisk,
  scanSecretExposureInventory,
} from '../security/supply-chain-guardrails.js';
import { IncidentManagerSkill } from '../skills/incident-manager.js';

export interface GatewayServer {
  httpServer: http.Server;
  wsManager: WebSocketManager;
  state: StateManager;
  tokenManager: TokenManager;
  containerManager: DockerContainerManager;
  mcpManager: McpManager;
  start(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Build and configure the OpenClaw gateway server.
 */
export function createGatewayServer(
  config: GatewayConfig,
  state: StateManager,
): GatewayServer {
  const app = express();
  const tokenManager = new TokenManager(config.tokenStorePath);
  const auth = bearerAuthMiddleware(tokenManager);
  const containerManager = new DockerContainerManager(config);
  const mcpManager = new McpManager();
  const skillGenerator = new SkillGenerator(containerManager, mcpManager, state);
  const incidentManager = new IncidentManagerSkill(state);

  // ── Middleware ───────────────────────────────────────────────────────────

  app.use(express.json());
  
  // Register Remote API for isolated skills
  registerRemoteApi(app, state);
  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', config.corsOrigins);
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    next();
  });
  // app.options('/*', (_req, res) => { res.sendStatus(204); }); // Disabled due to Express 5 path-to-regexp issue

  // ── Health ───────────────────────────────────────────────────────────────

  const startedAt = Date.now();
  const startedAtIso = new Date(startedAt).toISOString();

  app.get('/api/health', (_req: Request, res: Response) => {
    const tasks = state.listAllTasks();
    const wsSnapshot = wsManager.getRuntimeSnapshot();
    const body: HealthResponse = {
      status: 'ok',
      version: config.version,
      started_at: startedAtIso,
      checked_at: new Date().toISOString(),
      uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
      agent_count: state.listAgents().length,
      active_tasks: tasks.filter((t) => t.status === 'running' || t.status === 'queued').length,
      open_incidents: state.listIncidents().filter((i) => i.status === 'open').length,
      pending_approvals: state.listPendingApprovals().length,
      websocket_clients: wsSnapshot.connected_clients,
      last_inbound_ws_at: wsSnapshot.last_inbound_at,
      last_outbound_ws_at: wsSnapshot.last_outbound_at,
      approval_policy_preset: config.approvalPolicyPreset,
      response_profile: config.responseProfile,
      response_verbosity: config.responseVerbosity,
      local_model: getConfiguredLocalModel(config),
    };
    res.json(body);
  });

  app.get('/api/pairing', (req: Request, res: Response) => {
    if (rejectNonLocalPairing(req, res)) return;

    const payload = buildGatewayPairingPayload(req, config, tokenManager);
    res.json({
      ...payload,
      pairing_uri: pairingUri(payload),
    });
  });

  app.get('/pair', async (req: Request, res: Response) => {
    if (rejectNonLocalPairing(req, res)) return;

    const payload = buildGatewayPairingPayload(req, config, tokenManager);
    res.type('html').send(await renderPairingPage(payload));
  });

  app.get('/api/runtime/status', auth, (_req: Request, res: Response) => {
    res.json({
      checked_at: new Date().toISOString(),
      gateway: {
        status: 'ok',
        version: config.version,
        started_at: startedAtIso,
        uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
      },
      websocket: wsManager.getRuntimeSnapshot(),
      approval_policy: {
        preset: config.approvalPolicyPreset,
        require_biometric: config.requireBiometric,
      },
      response_style: {
        profile: config.responseProfile,
        verbosity: config.responseVerbosity,
      },
      local_model: getConfiguredLocalModel(config),
    });
  });

  app.get('/api/dashboard/summary', auth, (req: Request, res: Response) => {
    const rawLimit = Number.parseInt(String(req.query['limit'] ?? ''), 10);
    const body: OperatorSummaryResponse = buildOperatorSummary({
      config,
      state,
      startedAtIso,
      wsSnapshot: wsManager.getRuntimeSnapshot(),
      limit: Number.isNaN(rawLimit) ? undefined : rawLimit,
    });
    res.json(body);
  });

  app.get('/api/model/status', auth, async (_req: Request, res: Response) => {
    res.json(await probeLocalModelProvider(config));
  });

  function runtimeConfigResponse(): RuntimeConfigResponse {
    return {
      approval_policy_preset: config.approvalPolicyPreset,
      heartbeat_interval_ms: config.heartbeatIntervalMs,
      response_profile: config.responseProfile,
      response_verbosity: config.responseVerbosity,
      require_biometric: config.requireBiometric,
      local_model: getConfiguredLocalModel(config),
    };
  }

  app.get('/api/config/runtime', auth, (_req: Request, res: Response) => {
    res.json(runtimeConfigResponse());
  });

  app.patch('/api/config/runtime', auth, (req: Request, res: Response) => {
    const body = req.body as RuntimeConfigUpdateRequest;

    if (body.approval_policy_preset !== undefined) {
      if (!isApprovalPolicyPreset(body.approval_policy_preset)) {
        res.status(400).json({ error: { code: 4000, message: 'Invalid approval_policy_preset' } });
        return;
      }
      config.approvalPolicyPreset = body.approval_policy_preset;
    }

    if (body.heartbeat_interval_ms !== undefined) {
      if (!Number.isInteger(body.heartbeat_interval_ms) || body.heartbeat_interval_ms < 1_000 || body.heartbeat_interval_ms > 60_000) {
        res.status(400).json({ error: { code: 4000, message: 'heartbeat_interval_ms must be an integer from 1000 to 60000' } });
        return;
      }
      wsManager.updateHeartbeatInterval(body.heartbeat_interval_ms);
    }

    if (body.response_profile !== undefined) {
      if (!isResponseProfile(body.response_profile)) {
        res.status(400).json({ error: { code: 4000, message: 'Invalid response_profile' } });
        return;
      }
      config.responseProfile = body.response_profile;
    }

    if (body.response_verbosity !== undefined) {
      if (!isResponseVerbosity(body.response_verbosity)) {
        res.status(400).json({ error: { code: 4000, message: 'Invalid response_verbosity' } });
        return;
      }
      config.responseVerbosity = body.response_verbosity;
    }

    res.json(runtimeConfigResponse());
  });

  // ── Agents ───────────────────────────────────────────────────────────────

  app.get('/api/agents', auth, (_req: Request, res: Response) => {
    res.json(state.listAgents());
  });

  app.get('/api/agents/:id', auth, (req: Request, res: Response) => {
    const agent = state.getAgent(String(req.params['id'] ?? ''));
    if (!agent) {
      res.status(404).json({ error: { code: ERROR_CODES.AGENT_NOT_FOUND, message: 'Agent not found' } });
      return;
    }
    res.json(agent);
  });

  // ── Tasks ─────────────────────────────────────────────────────────────────

  app.get('/api/agents/:id/tasks', auth, (req: Request, res: Response) => {
    const agentId = String(req.params['id'] ?? '');
    if (!state.getAgent(agentId)) {
      res.status(404).json({ error: { code: ERROR_CODES.AGENT_NOT_FOUND, message: 'Agent not found' } });
      return;
    }
    res.json(state.listTasksForAgent(agentId).map((task) => presentTaskForOperator(task, config)));
  });

  app.get('/api/agents/:id/tasks/:taskId', auth, (req: Request, res: Response) => {
    const agentId = String(req.params['id'] ?? '');
    const taskId = String(req.params['taskId'] ?? '');
    if (!state.getAgent(agentId)) {
      res.status(404).json({ error: { code: ERROR_CODES.AGENT_NOT_FOUND, message: 'Agent not found' } });
      return;
    }
    const task = state.getTask(taskId);
    if (!task || task.agent_id !== agentId) {
      res.status(404).json({ error: { code: 4040, message: 'Task not found' } });
      return;
    }
    res.json(presentTaskForOperator(task, config));
  });

  // ── Agent Governance ─────────────────────────────────────────────────────

  app.get('/api/agents/:id/governance', auth, (req: Request, res: Response) => {
    const agentId = String(req.params['id'] ?? '');
    if (!state.getAgent(agentId)) {
      res.status(404).json({ error: { code: ERROR_CODES.AGENT_NOT_FOUND, message: 'Agent not found' } });
      return;
    }
    res.json(state.getAgentGovernance(agentId));
  });

  app.post('/api/agents/:id/governance/objective', auth, async (req: Request, res: Response) => {
    const agentId = String(req.params['id'] ?? '');
    if (!state.getAgent(agentId)) {
      res.status(404).json({ error: { code: ERROR_CODES.AGENT_NOT_FOUND, message: 'Agent not found' } });
      return;
    }
    const objective = typeof req.body?.objective === 'string' ? req.body.objective.trim() : '';
    if (!objective) {
      res.status(400).json({ error: { code: 4000, message: 'objective is required' } });
      return;
    }
    res.json(await state.updateAgentObjective(agentId, objective, parseActor(req.body?.actor)));
  });

  app.post('/api/agents/:id/governance/plan-steps', auth, async (req: Request, res: Response) => {
    const agentId = String(req.params['id'] ?? '');
    if (!state.getAgent(agentId)) {
      res.status(404).json({ error: { code: ERROR_CODES.AGENT_NOT_FOUND, message: 'Agent not found' } });
      return;
    }
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    if (!title) {
      res.status(400).json({ error: { code: 4000, message: 'title is required' } });
      return;
    }
    const status = req.body?.status === undefined
      ? undefined
      : isPlanStepStatus(req.body.status) ? req.body.status : null;
    if (status === null) {
      res.status(400).json({ error: { code: 4000, message: 'Invalid plan step status' } });
      return;
    }
    const step = await state.upsertAgentPlanStep({
      agent_id: agentId,
      id: typeof req.body?.id === 'string' ? req.body.id : undefined,
      title,
      details: typeof req.body?.details === 'string' ? req.body.details : undefined,
      status,
      owner: typeof req.body?.owner === 'string' ? req.body.owner : null,
      evidence: Array.isArray(req.body?.evidence) ? req.body.evidence : undefined,
      actor: parseActor(req.body?.actor),
    });
    res.json(step);
  });

  app.post('/api/agents/:id/governance/environment-observations', auth, async (req: Request, res: Response) => {
    const agentId = String(req.params['id'] ?? '');
    if (!state.getAgent(agentId)) {
      res.status(404).json({ error: { code: ERROR_CODES.AGENT_NOT_FOUND, message: 'Agent not found' } });
      return;
    }
    const source = typeof req.body?.source === 'string' ? req.body.source.trim() : '';
    const summary = typeof req.body?.summary === 'string' ? req.body.summary.trim() : '';
    if (!source || !summary) {
      res.status(400).json({ error: { code: 4000, message: 'source and summary are required' } });
      return;
    }
    res.json(await state.recordEnvironmentObservation({
      agent_id: agentId,
      source,
      summary,
      metadata: typeof req.body?.metadata === 'object' && req.body.metadata !== null ? req.body.metadata : undefined,
      actor: parseActor(req.body?.actor),
    }));
  });

  app.post('/api/agents/:id/governance/rollback-points', auth, async (req: Request, res: Response) => {
    const agentId = String(req.params['id'] ?? '');
    if (!state.getAgent(agentId)) {
      res.status(404).json({ error: { code: ERROR_CODES.AGENT_NOT_FOUND, message: 'Agent not found' } });
      return;
    }
    const actionType = req.body?.action_type;
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
    const command = typeof req.body?.command === 'string' ? req.body.command.trim() : '';
    if (!isActionType(actionType) || !title || !description || !command) {
      res.status(400).json({ error: { code: 4000, message: 'action_type, title, description, and command are required' } });
      return;
    }
    res.json(await state.addRollbackPoint({
      agent_id: agentId,
      action_type: actionType,
      title,
      description,
      command,
      metadata: typeof req.body?.metadata === 'object' && req.body.metadata !== null ? req.body.metadata : undefined,
      actor: parseActor(req.body?.actor),
    }));
  });

  app.get('/api/governance/events', auth, (req: Request, res: Response) => {
    const agentId = typeof req.query['agent_id'] === 'string' ? req.query['agent_id'] : undefined;
    const limitRaw = typeof req.query['limit'] === 'string' ? Number.parseInt(req.query['limit'], 10) : 100;
    res.json(state.listGovernanceEvents(agentId, Number.isFinite(limitRaw) ? limitRaw : 100));
  });

  // ── Incidents ─────────────────────────────────────────────────────────────

  app.get('/api/incidents', auth, (_req: Request, res: Response) => {
    res.json(state.listIncidents());
  });

  // ── Supply-Chain Guardrails ──────────────────────────────────────────────

  app.post('/api/security/supply-chain/assess', auth, (req: Request, res: Response) => {
    const command = typeof req.body?.command === 'string' ? req.body.command : '';
    const fileChanges = Array.isArray(req.body?.file_changes)
      ? req.body.file_changes.filter((item: unknown): item is string => typeof item === 'string')
      : undefined;
    const actionType = isActionType(req.body?.action_type) ? req.body.action_type : 'shell_command';
    if (!command && (!fileChanges || fileChanges.length === 0)) {
      res.status(400).json({ error: { code: 4000, message: 'command or file_changes is required' } });
      return;
    }
    const risk = assessSupplyChainRisk({ actionType, command, fileChanges });
    res.json({
      checked_at: new Date().toISOString(),
      detected: risk !== null,
      risk,
    });
  });

  app.post('/api/security/agent-commerce/assess', auth, (req: Request, res: Response) => {
    const command = typeof req.body?.command === 'string' ? req.body.command : '';
    const actionType = isActionType(req.body?.action_type) ? req.body.action_type : 'shell_command';
    const estimatedMonthlyUsd = parseOptionalUsd(req.body?.estimated_monthly_usd);
    const monthlyBudgetLimitUsd = parseOptionalUsd(req.body?.monthly_budget_limit_usd);
    if (!command) {
      res.status(400).json({ error: { code: 4000, message: 'command is required' } });
      return;
    }
    const risk = assessAgentCommerceRisk({
      actionType,
      command,
      estimatedMonthlyUsd,
      monthlyBudgetLimitUsd,
    });
    res.json({
      checked_at: new Date().toISOString(),
      detected: risk !== null,
      risk,
    });
  });

  app.get('/api/security/secret-inventory', auth, (_req: Request, res: Response) => {
    res.json(scanSecretExposureInventory({ rootDir: process.cwd() }));
  });

  app.post('/api/security/supply-chain/incidents', auth, async (req: Request, res: Response) => {
    const agentId = typeof req.body?.agent_id === 'string' ? req.body.agent_id : '';
    const agent = agentId ? state.getAgent(agentId) : null;
    if (!agent) {
      res.status(404).json({ error: { code: ERROR_CODES.AGENT_NOT_FOUND, message: 'Agent not found' } });
      return;
    }
    const title = typeof req.body?.title === 'string' && req.body.title.trim()
      ? req.body.title.trim()
      : 'Suspected developer-machine supply-chain exposure';
    const command = typeof req.body?.command === 'string' ? req.body.command : undefined;
    const repository = typeof req.body?.repository === 'string' ? req.body.repository : undefined;
    const inventory = scanSecretExposureInventory({ rootDir: process.cwd() });
    const incident = await incidentManager.createSupplyChainIncident({
      agentId,
      agentName: agent.name,
      title,
      command,
      repository,
      inventory,
    });
    res.json({
      incident,
      inventory_counts: inventory.counts,
    });
  });

  // ── Approvals ─────────────────────────────────────────────────────────────

  app.get('/api/approvals/pending', auth, (_req: Request, res: Response) => {
    res.json(state.listPendingApprovals());
  });

  // ── Bridge Sessions ───────────────────────────────────────────────────────

  app.get('/api/bridges', auth, (_req: Request, res: Response) => {
    res.json(state.listBridgeSessions());
  });

  app.post('/api/bridges/upsert', auth, async (req: Request, res: Response) => {
    const session = await state.upsertBridgeSession(normalizeProjectBridgeSession(req.body));
    res.json(session);
  });

  app.post('/api/bridges/:id/control', auth, async (req: Request, res: Response) => {
    const bridgeId = String(req.params['id'] ?? '');
    const session = state.listBridgeSessions().find((item) => item.id === bridgeId);
    if (!session) {
      res.status(404).json({ error: { code: 4040, message: 'Bridge session not found' } });
      return;
    }
    if (!isBridgeSessionControlAction(req.body?.action)) {
      res.status(400).json({ error: { code: 4000, message: 'action must be cancel, pause, resume, hibernate, or share_readonly' } });
      return;
    }
    const actor = parseActor(req.body?.actor);
    const updated = applyBridgeSessionControl(session, req.body.action, {
      actor,
      readOnlyShareUrl: typeof req.body?.read_only_share_url === 'string' ? req.body.read_only_share_url : undefined,
    });
    const stored = await state.upsertBridgeSession(updated);
    await state.recordGovernanceEvent?.({
      agent_id: stored.agent_id,
      type: 'environment_observed',
      title: `Bridge session ${req.body.action}`,
      summary: `Applied ${req.body.action} to ${stored.title}`,
      actor,
      risk_level: 'high',
      metadata: {
        bridge_id: stored.id,
        lifecycle: stored.lifecycle,
        execution: stored.execution,
      },
    });
    res.json(stored);
  });

  // ── Skill Workflow Systems ───────────────────────────────────────────────

  app.get('/api/skill-workflows', auth, (req: Request, res: Response) => {
    const agentId = typeof req.query['agent_id'] === 'string' ? req.query['agent_id'] : undefined;
    res.json(state.listSkillWorkflowSystems(agentId));
  });

  app.post('/api/skill-workflows/upsert', auth, async (req: Request, res: Response) => {
    const agentId = typeof req.body?.agent_id === 'string' ? req.body.agent_id : '';
    if (!agentId || !state.getAgent(agentId)) {
      res.status(404).json({ error: { code: ERROR_CODES.AGENT_NOT_FOUND, message: 'Agent not found' } });
      return;
    }
    if (typeof req.body?.name !== 'string' || typeof req.body?.trigger_prompt !== 'string' || !Array.isArray(req.body?.steps)) {
      res.status(400).json({ error: { code: 4000, message: 'agent_id, name, trigger_prompt, and steps are required' } });
      return;
    }
    const existing = typeof req.body?.id === 'string' ? state.getSkillWorkflowSystem(req.body.id) : undefined;
    const workflow = normalizeSkillWorkflowSystem(req.body, existing);
    const stored = await state.upsertSkillWorkflowSystem(workflow);
    res.status(stored.validation.valid ? 200 : 422).json(stored);
  });

  // ── Recurring Tasks (Loops) ───────────────────────────────────────────────

  app.get('/api/loops', auth, (_req: Request, res: Response) => {
    res.json(state.listRecurringTasks());
  });

  app.post('/api/approvals/:id/respond', auth, (req: Request, res: Response) => {
    const approvalId = String(req.params['id'] ?? '');
    const pending = state.getPendingApproval(approvalId);
    if (!pending) {
      res.status(404).json({ error: { code: ERROR_CODES.APPROVAL_EXPIRED, message: 'Approval not found or expired' } });
      return;
    }

    const body = req.body as ApprovalRespondRequest;
    if (!body.decision || !['approved', 'denied'].includes(body.decision)) {
      res.status(400).json({ error: { code: 4000, message: 'Invalid decision value' } });
      return;
    }

    const response: ApprovalResponse = {
      approval_id: approvalId,
      decision: body.decision,
      biometric_verified: body.biometric_verified ?? false,
      responded_at: new Date().toISOString(),
    };

    const request = state.respondToApproval(response);
    if (!request) {
      res.status(409).json({ error: { code: ERROR_CODES.APPROVAL_ALREADY_RESPONDED, message: 'Already responded' } });
      return;
    }

    res.json({ ok: true, response });
  });

  // ── Chat ──────────────────────────────────────────────────────────────────

  app.post('/api/agents/:id/chat', auth, (req: Request, res: Response) => {
    const agentId = String(req.params['id'] ?? '');
    const agent = state.getAgent(agentId);
    if (!agent) {
      res.status(404).json({ error: { code: ERROR_CODES.AGENT_NOT_FOUND, message: 'Agent not found' } });
      return;
    }
    const body = req.body as ChatRequest;
    if (!body.message || typeof body.message !== 'string') {
      res.status(400).json({ error: { code: 4000, message: 'message is required' } });
      return;
    }

    // Return a stub response; skills hook into state events for richer replies
    res.json({
      id: crypto.randomUUID(),
      agent_id: agentId,
      task_id: body.task_id ?? null,
      role: 'agent',
      content: `[${agent.name}] Acknowledged: "${body.message}"`,
      timestamp: new Date().toISOString(),
    });
  });

  app.post('/api/remote-control', auth, async (req: Request, res: Response) => {
    const payload = buildGatewayPairingPayload(req, config, tokenManager);
    const pairingLink = pairingUri(payload);
    const pairingPage = `${payload.base_url}/pair`;
    const terminalQr = await renderTerminalPairingQr(payload);
    console.info('\n' + '='.repeat(40));
    console.info('📱 REMOTE CONTROL ACTIVE');
    console.info('Scan this QR in OpenClaw Console:');
    console.info(terminalQr);
    console.info(`QR page: ${pairingPage}`);
    console.info(`Pairing link: ${pairingLink}`);
    console.info('='.repeat(40) + '\n');
    res.json({
      url: pairingLink,
      pairing_uri: pairingLink,
      pairing_page: pairingPage,
    });
  });

  // ── Revenue Infrastructure ────────────────────────────────────────────────

  // Mount billing endpoints (RevenueCat integration)
  app.use('/api/billing', createBillingRouter());

  // Mount analytics endpoints (conversion tracking)
  app.use('/api/analytics', createAnalyticsRouter());

  // Mount integrations endpoints (DevOps hub)
  app.use('/api/integrations', createIntegrationsRouter());

  // ── Git Operations ────────────────────────────────────────────────────────
  // Note: gitApiHandler is initialized after wsManager is created below

  // ── Skill Generation ──────────────────────────────────────────────────────

  app.post('/api/skills/generate', auth, async (req: Request, res: Response) => {
    try {
      const response = await skillGenerator.generateAndDeploy(req.body);
      if (response.success) {
        res.json(response);
      } else {
        res.status(500).json({ error: response.error });
      }
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── HTTP + WS Server ──────────────────────────────────────────────────────

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });
  const wsManager = createWebSocketManager(wss, state, config);

  // Upgrade HTTP connections to WebSocket with token auth
  httpServer.on('upgrade', (request, socket, head) => {
    let tokenStr: string | null = null;
    try {
      const url = new URL(request.url ?? '', `http://${request.headers.host || 'localhost'}`);
      tokenStr = url.searchParams.get('token');
    } catch {
      // Ignore URL parse errors
    }

    const token = tokenStr ? tokenManager.validate(tokenStr) ? tokenStr : null : null;

    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wsManager.acceptConnection(ws);
    });
  });

  return {
    httpServer,
    wsManager,
    state,
    tokenManager,
    containerManager,
    mcpManager,
    start(): Promise<void> {
      return new Promise((resolve) => {
        httpServer.listen(config.port, config.host, () => {
          console.info(`[gateway] OpenClaw gateway listening on http://${config.host}:${config.port}`); // local-dev-only
          // Dev hint: connect via WebSocket using your dev auth bearer credential
          const wsEndpoint = `ws://${config.host}:${config.port}/ws`; // local-dev-only
          console.info(`[gateway] WebSocket endpoint: ${wsEndpoint} (add bearer auth header)`); // local-dev-only
          const devToken = tokenManager.getDefaultDevToken();
          if (devToken) {
            console.info(`[gateway] Dev credential prefix: ${devToken.slice(0, 8)}…`);
          }
          resolve();
        });
      });
    },
    stop(): Promise<void> {
      return new Promise((resolve, reject) => {
        wsManager.stop();
        wss.close();
        httpServer.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      },
    };
  }

  function isActionType(value: unknown): value is ActionType {
    return typeof value === 'string' && [
      'deploy',
      'shell_command',
      'config_change',
      'key_rotation',
      'trade_execution',
      'destructive',
      'ask_root_cause',
      'propose_fix',
      'acknowledge',
      'git_commit',
      'git_merge',
      'git_push',
      'agent_skill_install',
      'agent_rollback',
    ].includes(value);
  }

  function isPlanStepStatus(value: unknown): value is AgentPlanStepStatus {
    return typeof value === 'string' && ['pending', 'running', 'done', 'blocked', 'skipped'].includes(value);
  }

  function parseActor(value: unknown): GovernanceEvent['actor'] {
    return value === 'human' || value === 'gateway' || value === 'policy' ? value : 'agent';
  }

  function parseOptionalUsd(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
    if (!Number.isFinite(parsed) || parsed < 0) return undefined;
    return Math.round(parsed * 100) / 100;
  }
