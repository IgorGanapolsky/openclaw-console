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
import { createBillingRouter } from '../billing/revenuecat.js';
import { createAnalyticsRouter } from '../analytics/events.js';
import { createIntegrationsRouter } from '../integrations/devops-hub.js';
import type {
  ChatRequest,
  ApprovalRespondRequest,
  HealthResponse,
  ApprovalResponse,
  RuntimeConfigResponse,
  RuntimeConfigUpdateRequest,
} from '../types/protocol.js';
import { ERROR_CODES } from '../types/protocol.js';
import { getConfiguredLocalModel, probeLocalModelProvider } from './model-provider.js';
import { isApprovalPolicyPreset } from '../config/default.js';
import { normalizeProjectBridgeSession } from './project-session.js';

export interface GatewayServer {
  httpServer: http.Server;
  wsManager: WebSocketManager;
  state: StateManager;
  tokenManager: TokenManager;
  containerManager: DockerContainerManager;
  mcpManager: McpManager;
  setMulticaBridge: (bridge: any) => void;
  setDeploymentManager: (manager: any) => void;
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

  // Create a placeholder for wsManager that will be properly initialized later
  let wsManagerRef: WebSocketManager | null = null;

  
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
    // wsManager is created later in the file, so we need to reference it conditionally
    const wsSnapshot = wsManagerRef ? wsManagerRef.getRuntimeSnapshot() : {
      connected_clients: 0,
      last_inbound_at: null,
      last_outbound_at: null
    };
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

  function runtimeConfigResponse(): RuntimeConfigResponse {
    return {
      approval_policy_preset: config.approvalPolicyPreset,
      heartbeat_interval_ms: config.heartbeatIntervalMs,
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
    const session = await state.upsertBridgeSession(normalizeProjectBridgeSession(req.body));
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

  // ── Deployment Management ────────────────────────────────────────────────

  // Placeholder for deployment manager - will be injected after server creation
  let deploymentManager: any = null;

  console.log('[debug] Registering POST /api/deployments route');
  app.post('/api/deployments', auth, async (req: Request, res: Response) => {
    try {
      if (!deploymentManager) {
        res.status(503).json({ error: { code: 5030, message: 'Deployment manager not initialized' } });
        return;
      }

      const request = req.body as import('../types/protocol.js').DeploymentRequest;

      // Validate required fields
      if (!request.title || !request.environment || !request.platform) {
        res.status(400).json({ error: { code: 4000, message: 'title, environment, and platform are required' } });
        return;
      }

      const deployment = await deploymentManager.deploy(request);

      const response: import('../types/protocol.js').DeploymentResponse = {
        id: deployment.id,
        task_id: deployment.taskId,
        status: deployment.status,
        started_at: deployment.startedAt,
      };

      res.json(response);
    } catch (error) {
      console.error('[deployments] Deployment creation failed:', error);
      res.status(500).json({ error: { code: 5000, message: 'Deployment creation failed' } });
    }
  });


  console.log('[debug] Registering GET /api/deployments route');
  app.get('/api/deployments', auth, async (_req: Request, res: Response) => {
    console.log('[debug] GET /api/deployments handler called');
    try {
      if (!deploymentManager) {
        res.status(503).json({ error: { code: 5030, message: 'Deployment manager not initialized' } });
        return;
      }

      const deployments = deploymentManager.listActiveDeployments();

      const response: import('../types/protocol.js').DeploymentsListResponse = {
        deployments: deployments.map((d: any) => ({
          id: d.id,
          task_id: d.taskId,
          request: d.request,
          status: d.status,
          started_at: d.startedAt,
          completed_at: d.completedAt,
          error: d.error,
        })),
      };

      res.json(response);
    } catch (error) {
      console.error('[deployments] Failed to list deployments:', error);
      res.status(500).json({ error: { code: 5000, message: 'Failed to list deployments' } });
    }
  });

  app.get('/api/deployments/:id', auth, async (req: Request, res: Response) => {
    try {
      if (!deploymentManager) {
        res.status(503).json({ error: { code: 5030, message: 'Deployment manager not initialized' } });
        return;
      }

      const deploymentId = String(req.params['id'] ?? '');
      const deployment = deploymentManager.getDeploymentStatus(deploymentId);

      if (!deployment) {
        res.status(404).json({ error: { code: ERROR_CODES.DEPLOYMENT_NOT_FOUND, message: 'Deployment not found' } });
        return;
      }

      res.json({
        id: deployment.id,
        task_id: deployment.taskId,
        request: deployment.request,
        status: deployment.status,
        started_at: deployment.startedAt,
        completed_at: deployment.completedAt,
        workflow_runs: deployment.workflowRuns,
        error: deployment.error,
      });
    } catch (error) {
      console.error('[deployments] Failed to get deployment:', error);
      res.status(500).json({ error: { code: 5000, message: 'Failed to get deployment' } });
    }
  });

  app.post('/api/deployments/:id/cancel', auth, async (req: Request, res: Response) => {
    try {
      if (!deploymentManager) {
        res.status(503).json({ error: { code: 5030, message: 'Deployment manager not initialized' } });
        return;
      }

      const deploymentId = String(req.params['id'] ?? '');
      const cancelled = await deploymentManager.cancelDeployment(deploymentId);

      if (!cancelled) {
        res.status(404).json({ error: { code: ERROR_CODES.DEPLOYMENT_NOT_FOUND, message: 'Deployment not found or cannot be cancelled' } });
        return;
      }

      res.json({ ok: true, cancelled: true });
    } catch (error) {
      console.error('[deployments] Failed to cancel deployment:', error);
      res.status(500).json({ error: { code: 5000, message: 'Failed to cancel deployment' } });
    }
  });

  // ── Multica Integration Webhooks ──────────────────────────────────────────

  // Webhook endpoint for Multica events (HIGH-ROI integration)
  let multicaBridge: any = null; // Will be injected after server creation

  app.post('/api/webhooks/multica', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
    try {
      if (!multicaBridge) {
        res.status(503).json({ error: { code: 5030, message: 'Multica bridge not initialized' } });
        return;
      }

      // Verify webhook signature if secret is configured
      const signature = req.headers['x-multica-signature'] as string;
      const payload = req.body;

      // Basic webhook verification (simplified for MVP)
      if (config.enableMulticaBridge && signature) {
        // TODO: Implement proper HMAC signature verification
        console.debug('[webhook] Multica webhook received with signature:', signature?.substring(0, 10) + '...');
      }

      const event = JSON.parse(payload.toString());
      console.info(`[webhook] Multica event: ${event.type} for ${event.data?.id || 'unknown'}`);

      switch (event.type) {
        case 'issue.updated':
          await multicaBridge.syncIssueToTask(event.data);
          break;
        case 'execution.started':
        case 'execution.completed':
        case 'execution.failed':
          await multicaBridge.handleMulticaExecution(event.data);
          break;
        case 'agent.status_changed':
          // Sync agent status to OpenClaw
          await state.updateAgentStatus(event.data.id, event.data.status);
          wsManager.broadcastToSubscribers(event.data.id, 'agent_update', event.data);
          break;
        default:
          console.debug(`[webhook] Unhandled Multica event type: ${event.type}`);
      }

      res.json({ ok: true, processed: true });
    } catch (error) {
      console.error('[webhook] Multica webhook processing failed:', error);
      res.status(500).json({ error: { code: 5000, message: 'Webhook processing failed' } });
    }
  });

  // Multica structured prompting endpoint (HIGH-ROI for mobile apps)
  app.post('/api/multica/issues', auth, async (req: Request, res: Response) => {
    try {
      if (!multicaBridge) {
        res.status(503).json({ error: { code: 5030, message: 'Multica bridge not initialized' } });
        return;
      }

      const issueRequest = req.body;
      if (!issueRequest.title || !issueRequest.prompt || !issueRequest.agent_id) {
        res.status(400).json({ error: { code: 4000, message: 'title, prompt, and agent_id are required' } });
        return;
      }

      const issue = await multicaBridge.createStructuredPrompt({
        title: issueRequest.title,
        prompt: issueRequest.prompt,
        agent_id: issueRequest.agent_id,
        priority: issueRequest.priority || 'Medium',
        schedule: issueRequest.schedule,
        tags: issueRequest.tags || []
      });

      res.json({ ok: true, issue });
    } catch (error) {
      console.error('[multica] Issue creation failed:', error);
      res.status(500).json({ error: { code: 5000, message: 'Issue creation failed' } });
    }
  });

  // Utility function to inject Multica bridge after server creation
  function setMulticaBridge(bridge: any) {
    multicaBridge = bridge;
  }

  // ── HTTP + WS Server ──────────────────────────────────────────────────────

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });
  const wsManager = createWebSocketManager(wss, state, config);
  wsManagerRef = wsManager;

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
    setMulticaBridge,
    setDeploymentManager(manager: any) {
      deploymentManager = manager;
    },
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
