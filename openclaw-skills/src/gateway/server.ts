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
import { parse as parseQs } from 'node:url';
import type { Request, Response } from 'express';
import { bearerAuthMiddleware, validateWsToken, TokenManager } from './auth.js';
import type { StateManager } from './state.js';
import type { WebSocketManager } from './websocket.js';
import { createWebSocketManager } from './websocket.js';
import type { GatewayConfig } from '../config/default.js';
import type {
  ChatRequest,
  ApprovalRespondRequest,
  HealthResponse,
  ApprovalResponse,
} from '../types/protocol.js';
import { ERROR_CODES } from '../types/protocol.js';

export interface GatewayServer {
  httpServer: http.Server;
  wsManager: WebSocketManager;
  state: StateManager;
  tokenManager: TokenManager;
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
  const firstParam = (value: string | string[] | undefined): string =>
    Array.isArray(value) ? (value[0] ?? '') : (value ?? '');

  const app = express();
  const tokenManager = new TokenManager(config.tokenStorePath);
  const auth = bearerAuthMiddleware(tokenManager);

  // ── Middleware ───────────────────────────────────────────────────────────

  app.use(express.json());
  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', config.corsOrigins);
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    next();
  });
  app.options('*', (_req, res) => { res.sendStatus(204); });

  // ── Health ───────────────────────────────────────────────────────────────

  const startedAt = Date.now();

  app.get('/api/health', (_req: Request, res: Response) => {
    const tasks = state.listAllTasks();
    const body: HealthResponse = {
      status: 'ok',
      version: config.version,
      uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
      agent_count: state.listAgents().length,
      active_tasks: tasks.filter((t) => t.status === 'running' || t.status === 'queued').length,
      open_incidents: state.listIncidents().filter((i) => i.status === 'open').length,
      pending_approvals: state.listPendingApprovals().length,
    };
    res.json(body);
  });

  // ── Agents ───────────────────────────────────────────────────────────────

  app.get('/api/agents', auth, (_req: Request, res: Response) => {
    res.json(state.listAgents());
  });

  app.get('/api/agents/:id', auth, (req: Request, res: Response) => {
    const agent = state.getAgent(firstParam(req.params['id']));
    if (!agent) {
      res.status(404).json({ error: { code: ERROR_CODES.AGENT_NOT_FOUND, message: 'Agent not found' } });
      return;
    }
    res.json(agent);
  });

  // ── Tasks ─────────────────────────────────────────────────────────────────

  app.get('/api/agents/:id/tasks', auth, (req: Request, res: Response) => {
    const agentId = firstParam(req.params['id']);
    if (!state.getAgent(agentId)) {
      res.status(404).json({ error: { code: ERROR_CODES.AGENT_NOT_FOUND, message: 'Agent not found' } });
      return;
    }
    res.json(state.listTasksForAgent(agentId));
  });

  app.get('/api/agents/:id/tasks/:taskId', auth, (req: Request, res: Response) => {
    const agentId = firstParam(req.params['id']);
    const taskId = firstParam(req.params['taskId']);
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

  app.post('/api/approvals/:id/respond', auth, (req: Request, res: Response) => {
    const approvalId = firstParam(req.params['id']);
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
    const agentId = firstParam(req.params['id']);
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

  // ── HTTP + WS Server ──────────────────────────────────────────────────────

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });
  const wsManager = createWebSocketManager(wss, state, config);

  // Upgrade HTTP connections to WebSocket with token auth
  httpServer.on('upgrade', (request, socket, head) => {
    const { query } = parseQs(request.url ?? '');
    const qs = (query ?? {}) as Record<string, string | string[] | undefined>;
    const token = validateWsToken(tokenManager, qs);

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
    start(): Promise<void> {
      return new Promise((resolve) => {
        httpServer.listen(config.port, config.host, () => {
          console.info(`[gateway] OpenClaw gateway listening on configured host ${config.host}:${config.port}`);
          console.info('[gateway] WebSocket endpoint available at /ws (authentication required)');
          const devToken = tokenManager.getDefaultDevToken();
          if (devToken) {
            console.info(`[gateway] Dev token configured (${devToken.length} chars)`);
          }
          resolve();
        });
      });
    },
    stop(): Promise<void> {
      return new Promise((resolve, reject) => {
        wss.close();
        httpServer.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },
  };
}
