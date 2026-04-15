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
  ApprovalResponse,
} from '../types/protocol.js';
import { ERROR_CODES } from '../types/protocol.js';
import { createBillingRouter } from '../billing/revenuecat.js';
import { createAnalyticsRouter } from '../analytics/events.js';
import { createIntegrationsRouter } from '../integrations/devops-hub.js';
import { getConfiguredLocalModel, probeLocalModelProvider } from './model-provider.js';

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
      local_model: getConfiguredLocalModel(config),
    };
    res.json(body);
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
      local_model: getConfiguredLocalModel(config),
    });
  });

  app.get('/api/model/status', auth, async (_req: Request, res: Response) => {
    res.json(await probeLocalModelProvider(config));
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
    res.json(state.listTasksForAgent(agentId));
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
    res.json(task);
  });

  // ── Incidents ─────────────────────────────────────────────────────────────

  app.get('/api/incidents', auth, (_req: Request, res: Response) => {
    res.json(state.listIncidents());
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
    const session = await state.upsertBridgeSession(req.body);
    res.json(session);
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

  app.post('/api/remote-control', auth, (_req: Request, res: Response) => {
    const devToken = tokenManager.getDefaultDevToken();
    // Development-only URL with temporary access token for mobile testing
    const baseUrl = `http://${config.host}:${config.port}/api/health`;
    const sessionUrl = `${baseUrl}?tkn=${devToken}`;
    console.info('\n' + '='.repeat(40));
    console.info('📱 REMOTE CONTROL ACTIVE');
    console.info('Scan to access from mobile:');
    console.info(`URL: ${sessionUrl}`);
    console.info('='.repeat(40) + '\n');
    res.json({ url: sessionUrl, expires_in: 600 });
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
