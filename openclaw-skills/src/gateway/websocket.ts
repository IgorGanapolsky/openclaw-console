/**
 * WebSocket connection handler for the OpenClaw gateway.
 *
 * Manages client connections, subscriptions, keepalive, and
 * broadcasting of server→client events.
 */

import { WebSocket } from 'ws';
import type { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import type {
  WebSocketMessage,
  ServerEventType,
  ClientEventType,
  SubscribePayload,
  UnsubscribePayload,
  WsApprovalResponse,
  WsChatMessage,
  ConnectedPayload,
  ErrorPayload,
  Agent,
  Task,
  TaskStep,
  Incident,
  ApprovalRequest,
  ChatMessage,
  ApprovalResponse,
} from '../types/protocol.js';
import { ERROR_CODES } from '../types/protocol.js';
import type { StateManager } from './state.js';
import type { GatewayConfig } from '../config/default.js';

// ── Client session ────────────────────────────────────────────────────────────

interface ClientSession {
  id: string;
  ws: WebSocket;
  subscribedAgents: Set<string>;
  pingTimer: ReturnType<typeof setInterval>;
  pongDeadline: ReturnType<typeof setTimeout> | null;
  connectedAt: string;
}

// ── WebSocket Manager ─────────────────────────────────────────────────────────

/** Manages all WebSocket sessions and broadcasts for the gateway. */
export class WebSocketManager {
  private wss: WebSocketServer;
  private clients: Map<string, ClientSession> = new Map();
  private config: GatewayConfig;
  private state: StateManager;

  constructor(wss: WebSocketServer, state: StateManager, config: GatewayConfig) {
    this.wss = wss;
    this.state = state;
    this.config = config;
    this.attachStateListeners();
  }

  // ── State → Broadcast bridge ─────────────────────────────────────────────

  private attachStateListeners(): void {
    this.state.events.on('agent_updated', (agent: Agent) => {
      this.broadcastToSubscribers(agent.id, 'agent_update', agent);
    });

    this.state.events.on('task_created', (task: Task) => {
      this.broadcastToSubscribers(task.agent_id, 'task_update', {
        id: task.id,
        agent_id: task.agent_id,
        status: task.status,
        title: task.title,
        updated_at: task.updated_at,
      });
    });

    this.state.events.on('task_updated', (task: Task) => {
      this.broadcastToSubscribers(task.agent_id, 'task_update', {
        id: task.id,
        agent_id: task.agent_id,
        status: task.status,
        title: task.title,
        updated_at: task.updated_at,
      });
    });

    this.state.events.on('task_step_added', (step: TaskStep) => {
      const task = this.state.getTask(step.task_id);
      if (task) {
        this.broadcastToSubscribers(task.agent_id, 'task_step', step);
      }
    });

    this.state.events.on('incident_created', (incident: Incident) => {
      this.broadcastToSubscribers(incident.agent_id, 'incident_new', incident);
    });

    this.state.events.on('incident_updated', (incident: Incident) => {
      this.broadcastToSubscribers(incident.agent_id, 'incident_update', {
        id: incident.id,
        status: incident.status,
        updated_at: incident.updated_at,
      });
    });

    this.state.events.on('approval_created', (approval: ApprovalRequest) => {
      this.broadcastToSubscribers(approval.agent_id, 'approval_request', approval);
    });
  }

  // ── Connection handling ───────────────────────────────────────────────────

  /**
   * Accept a new authenticated WebSocket connection.
   * Call this after token validation in the HTTP upgrade handler.
   */
  public acceptConnection(ws: WebSocket): void {
    const sessionId = uuidv4();

    const pingTimer = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) return;

      // Set a pong deadline; disconnect if no pong arrives in time
      const pongDeadline = setTimeout(() => {
        console.warn(`[ws] Client ${sessionId} missed pong — terminating`);
        ws.terminate();
      }, this.config.wsPongTimeout);

      session.pongDeadline = pongDeadline;
      ws.ping();
    }, this.config.wsPingInterval);

    const session: ClientSession = {
      id: sessionId,
      ws,
      subscribedAgents: new Set(),
      pingTimer,
      pongDeadline: null,
      connectedAt: new Date().toISOString(),
    };
    this.clients.set(sessionId, session);

    ws.on('pong', () => {
      if (session.pongDeadline) {
        clearTimeout(session.pongDeadline);
        session.pongDeadline = null;
      }
    });

    ws.on('message', (raw) => {
      const text =
        typeof raw === 'string'
          ? raw
          : Buffer.isBuffer(raw)
            ? raw.toString('utf8')
            : Array.isArray(raw)
              ? Buffer.concat(raw).toString('utf8')
              : '';
      if (text.length > 0) this.handleMessage(session, text);
    });

    ws.on('close', () => {
      this.cleanupSession(session);
    });

    ws.on('error', (err) => {
      console.error(`[ws] Session ${sessionId} error:`, err.message);
      this.cleanupSession(session);
    });

    // Confirm connection
    const connected: ConnectedPayload = {
      session_id: sessionId,
      gateway_version: this.config.version,
    };
    this.send(session, 'connected', connected);

    console.info(`[ws] Client connected: ${sessionId}`);
  }

  private cleanupSession(session: ClientSession): void {
    clearInterval(session.pingTimer);
    if (session.pongDeadline) clearTimeout(session.pongDeadline);
    this.clients.delete(session.id);
    console.info(`[ws] Client disconnected: ${session.id}`);
  }

  // ── Incoming message routing ─────────────────────────────────────────────

  private handleMessage(session: ClientSession, raw: string): void {
    let msg: WebSocketMessage;
    try {
      msg = JSON.parse(raw) as WebSocketMessage;
    } catch {
      this.sendError(session, ERROR_CODES.GATEWAY_UNAVAILABLE, 'Invalid JSON');
      return;
    }

    const type = msg.type as ClientEventType;

    switch (type) {
      case 'subscribe':
        this.handleSubscribe(session, msg.payload as SubscribePayload);
        break;
      case 'unsubscribe':
        this.handleUnsubscribe(session, msg.payload as UnsubscribePayload);
        break;
      case 'approval_response':
        this.handleApprovalResponse(session, msg.payload as WsApprovalResponse);
        break;
      case 'chat_message':
        this.handleChatMessage(session, msg.payload as WsChatMessage);
        break;
      default:
        this.sendError(session, ERROR_CODES.GATEWAY_UNAVAILABLE, `Unknown event type: ${String(msg.type)}`);
    }
  }

  private handleSubscribe(session: ClientSession, payload: SubscribePayload): void {
    payload.agents.forEach((id) => session.subscribedAgents.add(id));
    console.info(`[ws] ${session.id} subscribed to agents: ${payload.agents.join(', ')}`);
  }

  private handleUnsubscribe(session: ClientSession, payload: UnsubscribePayload): void {
    payload.agents.forEach((id) => session.subscribedAgents.delete(id));
    console.info(`[ws] ${session.id} unsubscribed from agents: ${payload.agents.join(', ')}`);
  }

  private handleApprovalResponse(session: ClientSession, payload: WsApprovalResponse): void {
    const response: ApprovalResponse = {
      ...payload,
      responded_at: new Date().toISOString(),
    };
    const request = this.state.respondToApproval(response);
    if (!request) {
      this.sendError(session, ERROR_CODES.APPROVAL_EXPIRED, `Approval ${payload.approval_id} not found or expired`);
      return;
    }
    console.info(`[ws] Approval ${payload.approval_id} ${payload.decision} by session ${session.id}`);
  }

  private handleChatMessage(session: ClientSession, payload: WsChatMessage): void {
    const agent = this.state.getAgent(payload.agent_id);
    if (!agent) {
      this.sendError(session, ERROR_CODES.AGENT_NOT_FOUND, `Agent ${payload.agent_id} not found`);
      return;
    }

    // Echo response (skills can hook into state events to provide real responses)
    const reply: ChatMessage = {
      id: uuidv4(),
      agent_id: payload.agent_id,
      task_id: payload.task_id ?? null,
      role: 'agent',
      content: `[${agent.name}] Received: "${payload.message}"`,
      timestamp: new Date().toISOString(),
    };
    this.send(session, 'chat_response', reply);
  }

  // ── Broadcasting ──────────────────────────────────────────────────────────

  /**
   * Send a typed event to a single client session.
   */
  public send<T>(session: ClientSession, type: ServerEventType, payload: T): void {
    if (session.ws.readyState !== WebSocket.OPEN) return;
    const envelope: WebSocketMessage<T> = {
      type,
      payload,
      timestamp: new Date().toISOString(),
    };
    session.ws.send(JSON.stringify(envelope));
  }

  /**
   * Broadcast an event to all clients subscribed to a given agent.
   */
  public broadcastToSubscribers<T>(agentId: string, type: ServerEventType, payload: T): void {
    for (const session of this.clients.values()) {
      if (session.subscribedAgents.has(agentId)) {
        this.send(session, type, payload);
      }
    }
  }

  /**
   * Broadcast an event to ALL connected clients.
   */
  public broadcastToAll<T>(type: ServerEventType, payload: T): void {
    for (const session of this.clients.values()) {
      this.send(session, type, payload);
    }
  }

  private sendError(session: ClientSession, code: number, message: string): void {
    const payload: ErrorPayload = { code, message };
    this.send(session, 'error', payload);
  }

  // ── Metrics ───────────────────────────────────────────────────────────────

  /** Count of active WebSocket connections. */
  public get connectionCount(): number {
    return this.clients.size;
  }

  /** WebSocketServer instance (for attaching to HTTP server). */
  public get server(): WebSocketServer {
    return this.wss;
  }
}

/**
 * Factory: create and configure a WebSocketServer attached to the given HTTP server.
 */
export function createWebSocketManager(
  wss: WebSocketServer,
  state: StateManager,
  config: GatewayConfig,
): WebSocketManager {
  return new WebSocketManager(wss, state, config);
}
