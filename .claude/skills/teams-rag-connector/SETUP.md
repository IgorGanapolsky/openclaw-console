# Teams RAG Connector — Setup Guide

## Prerequisites

1. **Azure AD App Registration** with these API permissions (admin consent required):
   - `ChannelMessage.Read.All` (Application)
   - `Chat.Read.All` (Application)
   - `CallRecords.Read.All` (Application)
   - `OnlineMeetingTranscript.Read.All` (Application)
   - `User.Read.All` (Application)

2. **Environment Variables** (add to `~/.zshrc` or `.env`):
   ```bash
   export AZURE_TENANT_ID="your-tenant-id"
   export AZURE_CLIENT_ID="your-app-client-id"
   export AZURE_CLIENT_SECRET="your-client-secret"
   export ANTHROPIC_API_KEY="your-anthropic-key"  # For embeddings + briefings
   export WEBHOOK_URL="https://your-function.azurewebsites.net/api/webhook"
   ```

3. **Node.js 20+**

## Quick Start

```bash
cd .claude/skills/teams-rag-connector/scripts
npm install

# 1. Test connection
node graph-auth.js  # Should print "Authentication successful"

# 2. Full historical backfill
node ingest-messages.js --mode backfill

# 3. Set up real-time webhooks
node subscribe-webhooks.js --create

# 4. Generate first briefing
node daily-briefing.js

# 5. Query the RAG store
node query-rag.js "What did the team discuss about the deployment?"
```

## MCP Integration (Claude Code)

Add to `~/.claude/mcp.json`:
```json
{
  "mcpServers": {
    "teams-rag": {
      "command": "node",
      "args": [".claude/skills/teams-rag-connector/scripts/mcp-server.js"],
      "env": {
        "AZURE_TENANT_ID": "your-tenant-id",
        "AZURE_CLIENT_ID": "your-client-id",
        "AZURE_CLIENT_SECRET": "your-secret",
        "ANTHROPIC_API_KEY": "your-key"
      }
    }
  }
}
```

Then in Claude Code:
- `teams_search "what did engineering decide about the API migration?"`
- `teams_briefing` — generates full daily briefing
- `teams_status` — shows pipeline health

## Teams Bot Integration (Custom Engine Agent)

The bot uses the Teams SDK with McpClientPlugin to connect to our RAG tools:

```bash
cd .claude/skills/teams-rag-connector/scripts
npm install

# 1. Start the MCP server (HTTP/SSE transport)
node mcp-server-http.js              # Runs on port 3001

# 2. Start the Teams bot (in another terminal)
npm install @microsoft/teams.ai@^2.0.8 @microsoft/teams.apps@^2.0.8 @microsoft/teams.common@^2.0.8 @microsoft/teams.mcpclient@^2.0.8 @microsoft/teams.openai@^2.0.8
OPENAI_API_KEY=sk-... node teams-bot.js  # Runs on port 3978

# Or start both together:
npm run bot:dev

# 3. Expose locally via ngrok for Teams
ngrok http 3978
```

Architecture: `Teams @mention → Bot (OpenAI routes) → MCP tools → Claude RAG`

Required env vars: `OPENAI_API_KEY` (tool routing), `ANTHROPIC_API_KEY` (briefings)

## Automation (Cron / Azure Function Timer)

### Daily Briefing (7am every weekday)
```bash
# crontab -e
0 7 * * 1-5 cd /path/to/scripts && node daily-briefing.js >> ~/.shieldcortex/briefings/cron.log 2>&1
```

### Incremental Sync (every 15 minutes)
```bash
*/15 * * * * cd /path/to/scripts && node ingest-messages.js --mode incremental >> ~/.shieldcortex/teams_sync.log 2>&1
```

### Webhook Renewal (every 45 minutes — subscriptions expire in 60min)
```bash
*/45 * * * * cd /path/to/scripts && node subscribe-webhooks.js --renew >> ~/.shieldcortex/teams_webhook_renew.log 2>&1
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Microsoft Teams                           │
│  Channels │ Chats │ Meetings │ Files │ Reactions            │
└────────┬──────────┬──────────────────────────────────────────┘
         │          │
         │ Graph Webhooks (real-time)
         │ Graph API (backfill/incremental)
         │          │
┌────────▼──────────▼──────────────────────────────────────────┐
│              Ingestion Layer (Node.js)                        │
│  graph-auth.js → ingest-messages.js → vectorize-content.js  │
│                    ↕                                         │
│  subscribe-webhooks.js ↔ webhook-handler.js (Azure Func)    │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              LanceDB Vector Store                            │
│  ~/.shieldcortex/lancedb/teams_messages.lance               │
│  Voyage-3 / text-embedding-3-small embeddings               │
│  Chunked: 1500 chars, 200 overlap                           │
└────────────────────┬─────────────────────────────────────────┘
                     │
         ┌───────────┼───────────┐
         │           │           │
         ▼           ▼           ▼
┌──────────┐ ┌────────────┐ ┌─────────────┐
│ Claude   │ │ Daily      │ │ Teams Bot   │
│ Code MCP │ │ Briefing   │ │ (Custom     │
│ Server   │ │ Generator  │ │  Engine     │
│          │ │ (Claude    │ │  Agent)     │
│ tools:   │ │  Sonnet)   │ │             │
│ search   │ │            │ │ @mentions → │
│ briefing │ │ Cron 7am   │ │ RAG query → │
│ status   │ │ weekdays   │ │ response    │
└──────────┘ └────────────┘ └─────────────┘
```

## What This Gets You (vs. Hue)

| Feature | Hue (WIRED article) | Teams RAG Connector |
|---------|---------------------|---------------------|
| Email summary | Yes | Yes (via Graph) |
| Calendar summary | Yes | Yes + meeting transcripts |
| Teams messages | No | **All channels + chats** |
| Meeting content | No | **Full transcript RAG** |
| Real-time | Daily batch | **Webhook — seconds** |
| AI model | Unknown | **Claude (your choice)** |
| Queryable | No | **Semantic search** |
| Actionable | Summary only | **Decisions, blockers, AIs** |
| ADO correlation | No | **Sprint work item linking** |
| Privacy | Cloud only | **Your infrastructure** |
