# OpenClaw Work Console Protocol v1.0

## Overview

The OpenClaw Work Console communicates with an OpenClaw gateway over **WebSocket (WSS)** and **HTTPS**. All messages use JSON.

## Authentication

### HTTP: Token-based
```
Authorization: Bearer <gateway-token>
```

### WebSocket: Token in query param on connect
```
wss://gateway.example.com/ws?token=<gateway-token>
```

## HTTP Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Gateway health check |
| GET | `/api/agents` | List all agents |
| GET | `/api/agents/:id` | Agent details |
| GET | `/api/agents/:id/tasks` | Tasks for an agent |
| GET | `/api/agents/:id/tasks/:taskId` | Task detail with timeline |
| GET | `/api/incidents` | All incidents across agents |
| GET | `/api/approvals/pending` | Pending approval requests |
| POST | `/api/approvals/:id/respond` | Submit approval decision |
| POST | `/api/agents/:id/chat` | Send message to agent |

## WebSocket Events

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `subscribe` | `{ agents: string[] }` | Subscribe to updates for agents |
| `unsubscribe` | `{ agents: string[] }` | Unsubscribe |
| `approval_response` | `{ approval_id, decision, biometric_verified }` | Respond to approval |
| `chat_message` | `{ agent_id, message, task_id? }` | Send message to agent |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `agent_update` | `AgentStatus` | Agent came online/offline |
| `task_update` | `TaskUpdate` | Task status changed |
| `task_step` | `TaskStep` | New step in a task timeline |
| `incident_new` | `Incident` | New incident |
| `incident_update` | `IncidentUpdate` | Incident status changed |
| `approval_request` | `ApprovalRequest` | Dangerous action needs approval |
| `chat_response` | `ChatMessage` | Agent response |
| `connected` | `{ session_id, gateway_version }` | Connection confirmed |
| `error` | `{ code, message }` | Error |

## Data Models

### Agent
```json
{
  "id": "string",
  "name": "string",
  "description": "string",
  "status": "online" | "offline" | "busy",
  "workspace": "string",
  "tags": ["string"],
  "last_active": "ISO8601",
  "active_tasks": 0,
  "pending_approvals": 0
}
```

### Task
```json
{
  "id": "string",
  "agent_id": "string",
  "title": "string",
  "description": "string",
  "status": "queued" | "running" | "done" | "failed",
  "created_at": "ISO8601",
  "updated_at": "ISO8601",
  "steps": [TaskStep],
  "links": [ResourceLink]
}
```

### TaskStep
```json
{
  "id": "string",
  "task_id": "string",
  "type": "log" | "tool_call" | "output" | "error" | "info",
  "content": "string",
  "timestamp": "ISO8601",
  "metadata": {}
}
```

### ResourceLink
```json
{
  "label": "string",
  "url": "string",
  "type": "github_pr" | "github_run" | "dashboard" | "external"
}
```

### Incident
```json
{
  "id": "string",
  "agent_id": "string",
  "agent_name": "string",
  "severity": "critical" | "warning" | "info",
  "title": "string",
  "description": "string",
  "status": "open" | "acknowledged" | "resolved",
  "created_at": "ISO8601",
  "updated_at": "ISO8601",
  "actions": ["ask_root_cause", "propose_fix", "acknowledge"]
}
```

### ApprovalRequest
```json
{
  "id": "string",
  "agent_id": "string",
  "agent_name": "string",
  "action_type": "deploy" | "shell_command" | "config_change" | "key_rotation" | "trade_execution" | "destructive",
  "title": "string",
  "description": "string",
  "command": "string",
  "context": {
    "service": "string",
    "environment": "string",
    "repository": "string",
    "risk_level": "high" | "critical"
  },
  "created_at": "ISO8601",
  "expires_at": "ISO8601"
}
```

### ApprovalResponse
```json
{
  "approval_id": "string",
  "decision": "approved" | "denied",
  "biometric_verified": true,
  "responded_at": "ISO8601"
}
```

### ChatMessage
```json
{
  "id": "string",
  "agent_id": "string",
  "task_id": "string | null",
  "role": "user" | "agent",
  "content": "string",
  "timestamp": "ISO8601"
}
```

## WebSocket Message Envelope

All WebSocket messages use this envelope:
```json
{
  "type": "event_name",
  "payload": { ... },
  "timestamp": "ISO8601"
}
```

## Error Codes

| Code | Meaning |
|------|---------|
| 1001 | Invalid token |
| 1002 | Agent not found |
| 1003 | Approval expired |
| 1004 | Approval already responded |
| 1005 | Rate limited |
| 1006 | Gateway unavailable |

## Security Requirements

- All connections MUST use TLS (HTTPS/WSS)
- Tokens MUST be stored in platform secure storage (Keychain / Android Keystore)
- Tokens MUST NOT appear in logs
- Approval responses MUST include biometric verification flag
- Plain HTTP/WS connections require explicit user opt-in with warning
