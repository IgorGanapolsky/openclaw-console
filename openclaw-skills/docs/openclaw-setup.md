# OpenClaw Setup Guide

This guide covers installing the OpenClaw Work Console skills on your existing OpenClaw instance.

## Prerequisites

- An OpenClaw instance running on a server you control (VPS, home lab, etc.)
- Node.js 20+ installed on the same server
- Network access from your phone to the server (VPN recommended)

## Step 1: Install the Skills Package

Copy the `openclaw-skills/` directory to your OpenClaw server:

```bash
# From the monorepo root
scp -r openclaw-skills/ user@your-server:~/openclaw-console-skills/
```

Or clone the repo on your server:

```bash
git clone git@github.com:YOUR_USERNAME/openclaw-console.git
cd openclaw-console/openclaw-skills
```

## Step 2: Install Dependencies and Build

```bash
cd openclaw-console-skills  # or openclaw-console/openclaw-skills
npm install
npm run build
```

## Step 3: Configure

Edit environment variables or create a `.env` file:

```bash
# .env
PORT=18789                    # Gateway port (default: 18789)
HOST=0.0.0.0                 # Bind address
TOKEN_FILE=./tokens.json     # Token storage path
APPROVAL_TIMEOUT_MS=300000   # 5 minutes approval expiry
WS_PING_INTERVAL_MS=30000    # WebSocket keepalive
```

### Agent Configuration

Edit `src/config/agents.ts` to define your agents:

```typescript
export const AGENT_CONFIGS: AgentConfig[] = [
  {
    id: 'github-ops',
    name: 'GitHub Ops',
    description: 'Monitors repositories and CI/CD pipelines',
    workspace: '~/repos',
    tags: ['ci', 'github', 'devops'],
  },
  {
    id: 'trading-bot',
    name: 'Trading Bot',
    description: 'Monitors options strategies and market conditions',
    workspace: '~/trading',
    tags: ['trading', 'alpaca', 'options'],
  },
  // Add your own agents here
];
```

## Step 4: Start the Gateway

### Development

```bash
npm run dev
```

This starts the gateway with hot reload and seed data for testing.

### Production

```bash
npm run build
node dist/index.js
```

### Using systemd (recommended for production)

Create `/etc/systemd/system/openclaw-console.service`:

```ini
[Unit]
Description=OpenClaw Work Console Gateway
After=network.target

[Service]
Type=simple
User=openclaw
WorkingDirectory=/home/openclaw/openclaw-console/openclaw-skills
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=18789

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable openclaw-console
sudo systemctl start openclaw-console
```

## Step 5: Secure the Gateway

### Option A: Tailscale (Recommended)

If you use Tailscale, the gateway only needs to listen on the Tailscale interface:

```bash
HOST=100.x.x.x  # Your Tailscale IP
```

Your phone connects via Tailscale → no ports exposed to the internet.

### Option B: Reverse Proxy with TLS

Use Caddy or Nginx to terminate TLS:

```
# Caddyfile
agent.yourdomain.com {
    reverse_proxy localhost:18789
}
```

### Option C: Direct with TLS (not recommended for production)

You can configure the gateway to use TLS directly, but a reverse proxy is usually easier to manage.

## Step 6: Generate a Token

On first startup, the gateway generates a dev token and prints it to the console:

```
[Gateway] Dev token: ocw_abc123...
```

For production, generate a proper token:

```bash
# The dev token is printed on first start. Use it to generate more:
curl -X POST http://localhost:18789/api/tokens/generate \
  -H "Authorization: Bearer <DEV_TOKEN>"
```

## Step 7: Connect the Mobile App

1. Open the OpenClaw Work Console app on your phone
2. Go to **Settings** → **Add Gateway**
3. Enter:
   - **Name**: e.g., "My Server"
   - **URL**: `https://agent.yourdomain.com` (or `http://100.x.x.x:18789` via Tailscale)
   - **Token**: The token from Step 6
4. Tap **Test & Save**
5. You should see your agents appear on the Agents tab

## Step 8: Enable Approval Gates

To require mobile approval for dangerous actions, configure your OpenClaw skills to use the Approval Gate:

```typescript
import { ApprovalGateSkill } from './skills/approval-gate';

// In your custom skill:
const approved = await approvalGate.requestApproval({
  agentId: 'deploy-manager',
  actionType: 'deploy',
  title: 'Deploy api-service to production',
  description: 'Rolling deployment of api-service v2.3.1',
  command: 'kubectl rollout restart deployment/api-service -n production',
  context: {
    service: 'api-service',
    environment: 'production',
    repository: 'myorg/api-service',
    riskLevel: 'high',
  },
});

if (approved) {
  // Execute the deployment
} else {
  // Cancelled by user
}
```

## Step 9: Integrate with Your OpenClaw Instance

The skills in this package are standalone examples. To integrate with your actual OpenClaw setup:

1. **CI Monitor**: Point it at your real GitHub repos by setting the `GITHUB_TOKEN` env var and modifying `ci-monitor.ts`
2. **Trading Monitor**: Wire it to your actual Alpaca/broker API by modifying `trading-monitor.ts`
3. **Custom Skills**: Create new skills following the pattern in `src/skills/` — they just need to call `stateManager.createTask()`, `stateManager.createIncident()`, or `approvalGate.requestApproval()`

## Troubleshooting

### App can't connect to gateway

1. Verify the gateway is running: `curl http://YOUR_SERVER:18789/api/health`
2. Check firewall rules allow the port (or use VPN)
3. Verify the token is correct
4. Check that the URL uses the right protocol (https:// or http://)

### WebSocket disconnects frequently

1. Check your network stability
2. The app auto-reconnects with exponential backoff
3. If behind a proxy, ensure WebSocket upgrade is allowed
4. Check gateway logs for errors

### Approvals not showing up

1. Verify the agent creating the approval is one you're subscribed to
2. Check that the gateway's WebSocket connection is active (green dot in Settings)
3. Verify biometric is enabled on your device
4. Check the approval hasn't expired (default: 5 minutes)

### Biometric not working

- **iOS**: Ensure Face ID / Touch ID is enabled in device Settings
- **Android**: Ensure at least one fingerprint or face is enrolled in device Settings
- The app falls back to device PIN/passcode if biometric fails
