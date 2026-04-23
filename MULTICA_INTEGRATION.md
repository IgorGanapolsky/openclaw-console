# OpenClaw + Multica Integration

🚀 **HIGH-ROI**: Complete enterprise AI agent orchestration platform with mobile-first approval workflows

## Overview

This integration transforms OpenClaw from a mobile monitoring tool into a **full-stack AI agent orchestration platform** by connecting with Multica's issue-based workflow system. 

### Business Value

- **Daily Active Approvers (DAA)**: Target metric driven by structured prompting workflows
- **Enterprise Revenue**: Multi-machine orchestration opens $50-200/month market vs $10-20
- **Automation Premium**: Scheduled runs and structured workflows justify higher Pro tiers
- **Mobile Differentiation**: Only mobile-first AI agent platform with biometric approval gates

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   OpenClaw      │◄──►│    Multica      │◄──►│  Agent Runtime  │
│  Mobile Apps    │    │   Orchestrator  │    │ (Claude Code,   │
│                 │    │                 │    │  OpenCode, etc) │
│ • Approvals     │    │ • Task Management│    │                 │
│ • Monitoring    │    │ • Scheduling     │    │                 │
│ • Incidents     │    │ • Agent Routing  │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## High-ROI Features

### 1. Structured Prompting (Mobile → Multica)
- **Issue-based workflows** replace ad-hoc chat
- **Agent assignment** with priority and scheduling
- **Template quick actions** for common workflows
- **Mobile-native creation** drives daily engagement

### 2. Biometric Approval Gates (Multica → Mobile)
- **Dangerous action detection** triggers mobile approval
- **Touch ID/Face ID required** for all approvals
- **Real-time notifications** via WebSocket
- **Audit trail** for compliance

### 3. Automated Orchestration
- **Autopilot scheduling** for recurring workflows
- **Multi-agent coordination** across machines
- **Progress tracking** with task timeline
- **Failure incident** creation

## Quick Start

### 1. Setup Integration
```bash
# Clone and setup
git clone <repo>
cd openclaw-console

# Run automated setup
./scripts/setup-multica.sh

# Validate integration
./scripts/validate-integration.js
```

### 2. Test End-to-End
```bash
# Run comprehensive testing
./scripts/test-multica-integration.sh
```

### 3. Access Services
- **Multica Web UI**: http://localhost:3000
- **OpenClaw Gateway**: http://localhost:18789  
- **Mobile Apps**: Use gateway URL + token from setup

## Mobile App Usage

### iOS/Android: Create Structured Prompt
1. Open OpenClaw app
2. Tap **"Prompts"** tab (replaced Loops)
3. Tap **"Create New Prompt"**
4. Fill form:
   - **Title**: What should this accomplish?
   - **Description**: Detailed task requirements
   - **Agent**: Select from available agents
   - **Priority**: Low/Medium/High/Critical
5. Tap **"Create Prompt"**
6. Monitor progress in **Tasks** tab

### Mobile Approval Workflow
1. Dangerous action triggers notification
2. Tap notification → Opens approval screen
3. Review action details and risk level
4. **Face ID/Touch ID** verification required
5. Tap **Approve** or **Deny**
6. Agent proceeds or stops based on decision

## API Integration

### Create Structured Prompt
```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Deploy to Production",
    "prompt": "Deploy latest changes with rollback plan",
    "agent_id": "deploy-manager",
    "priority": "High",
    "tags": ["deployment", "production"]
  }' \
  http://localhost:18789/api/multica/issues
```

### Webhook Events
```javascript
// Process Multica webhook
POST /api/webhooks/multica
{
  "type": "execution.started",
  "data": {
    "issue_id": "issue-123",
    "agent_id": "deploy-agent",
    "tool_calls": [...]
  }
}
```

## Configuration

### Environment Variables
```bash
# Required
MULTICA_API_URL=http://localhost:8080
MULTICA_API_TOKEN=your-multica-token
ENABLE_MULTICA_BRIDGE=true

# Optional
MULTICA_WEBHOOK_SECRET=webhook-secret
APPROVAL_TIMEOUT_MINUTES=5
```

### Agent Mapping
```javascript
// openclaw-skills/src/bridges/multica/config.ts
default_agent_mapping: {
  'github-ops': 'github-ops-agent',
  'deploy-manager': 'deploy-manager-agent',
  'trading-bot': 'trading-bot-agent'
}
```

## Development

### Project Structure
```
openclaw-skills/src/bridges/multica/
├── bridge.ts          # Main integration logic
├── client.ts          # HTTP API client
├── webhook-handler.ts # Event processing
├── types.ts           # TypeScript definitions
├── config.ts          # Configuration management
└── index.ts           # Module exports

ios/OpenClawConsole/OpenClawConsole/Views/StructuredPrompts/
├── StructuredPromptsListView.swift  # Main prompts UI
├── CreatePromptSheet.swift          # Creation form
└── APIService+StructuredPrompts.swift

android/app/src/main/java/com/openclaw/console/ui/structured/
├── StructuredPromptsScreen.kt    # Main prompts UI
├── CreatePromptDialog.kt         # Creation dialog
└── StructuredPromptsViewModel.kt # State management
```

### Adding Custom Skills
```typescript
// Create new skill in openclaw-skills/src/skills/
export class CustomSkill {
  async handleMulticaIssue(issue: MulticaIssue) {
    // Process issue and execute actions
    if (issue.labels.includes('approval-required')) {
      // Trigger approval workflow
      await this.requestApproval(issue);
    }
  }
}
```

## Troubleshooting

### Common Issues

**1. "Multica integration not available" (503 error)**
```bash
# Check bridge is enabled
echo $ENABLE_MULTICA_BRIDGE  # Should be 'true'

# Verify Multica is running
curl http://localhost:8080/api/health

# Check gateway logs
docker-compose -f docker-compose.multica.yml logs openclaw-gateway
```

**2. Mobile app shows no agents**
```bash
# Verify gateway connection
curl -H "Authorization: Bearer $TOKEN" http://localhost:18789/api/agents

# Check WebSocket connection
# Mobile app should show "Connected" status
```

**3. Approvals not triggering**
```bash
# Check dangerous action detection
# Only shell_command, docker_run, kubectl_apply, etc. trigger approvals

# Verify webhook processing
docker-compose -f docker-compose.multica.yml logs openclaw-gateway | grep webhook
```

### Validation Commands
```bash
# Quick health check
./scripts/validate-integration.js

# Full integration test
./scripts/test-multica-integration.sh

# Manual API test
curl -H "Authorization: Bearer $TOKEN" http://localhost:18789/api/multica/issues
```

## Production Deployment

### Security Checklist
- [ ] Change all default tokens in `.env.multica`
- [ ] Enable webhook signature verification
- [ ] Use TLS for all connections (WSS/HTTPS)
- [ ] Deploy behind VPN (Tailscale recommended)
- [ ] Enable biometric requirement: `REQUIRE_BIOMETRIC=true`
- [ ] Configure proper CORS origins
- [ ] Set up monitoring and alerting

### Scaling Considerations
- **Multi-Machine**: Deploy Multica agents on multiple servers
- **Load Balancing**: Use nginx for high-traffic deployments
- **Database**: Switch from in-memory to PostgreSQL/Redis
- **Monitoring**: Add Prometheus/Grafana for observability

### Business Metrics
Track these KPIs for ROI validation:
- **Daily Active Approvers (DAA)**: Unique users approving actions daily
- **Structured Prompt Adoption**: % of work going through issue workflow
- **Automation Ratio**: Scheduled vs manual prompt execution
- **Enterprise Conversion**: Users upgrading to multi-machine plans

## Support

- **Documentation**: This file + `/docs/protocol.md`
- **Issues**: Create GitHub issue with integration logs
- **Testing**: Run validation scripts before reporting bugs
- **Feature Requests**: Include business impact in description

---

**Built with ❤️ for the OpenClaw community**

*This integration represents the future of AI agent orchestration: powerful backend automation with mobile-first human oversight.*