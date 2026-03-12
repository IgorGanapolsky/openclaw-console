# Teams RAG Connector

> Full-automation MS Teams integration: ingest every message, meeting transcript,
> and channel post into a RAG pipeline so Claude is always aware of everything said.

## Trigger
- User says "teams rag", "sync teams", "teams briefing", "what's happening on teams"
- Scheduled: daily briefing automation (cron or Azure Function timer)

## Architecture (March 2026 — Best Practice)

```
MS Teams Channels/Chats/Meetings
        │
        ▼
Microsoft Graph API (Change Notifications / Webhooks)
        │
        ▼
Ingestion Service (Node.js Azure Function)
        │
        ├── Historical backfill: GET /teams/{id}/channels/{id}/messages
        ├── Real-time stream: Graph webhook subscriptions (chatMessage resource)
        └── Meeting transcripts: GET /communications/callRecords/{id}
        │
        ▼
Vectorization Pipeline (text-embedding-3-small or Anthropic embeddings)
        │
        ▼
LanceDB Vector Store (~/.shieldcortex/lancedb/teams_messages.lance)
        │
        ▼
Claude RAG Query Layer (MCP Server → Claude Code / Teams Bot)
```

## Why This Approach (Not Copilot Studio)

| Factor | Custom Engine Agent (Teams SDK + Claude) | Copilot Studio |
|--------|------------------------------------------|----------------|
| LLM | Claude (Anthropic) — our choice | GPT only |
| Orchestration | Full control (LangChain/LangGraph) | Limited low-code |
| MCP support | Native in Teams SDK (Feb 2026 GA) | No |
| RAG pipeline | Custom LanceDB + own embeddings | Azure AI Search only |
| Cost | Pay-per-use (API calls) | M365 Copilot license ($30/user/mo) |
| Data residency | Our infrastructure | Microsoft tenant |

## Implementation Stack

- **Teams SDK** (formerly Teams AI Library) — GA for TypeScript/C#, MCP-native
- **Microsoft Graph API** — message ingestion + webhook subscriptions
- **LanceDB** — vector storage (already in use for RLHF)
- **Claude API** — LLM backbone for RAG responses
- **Azure Functions** — serverless webhook receiver + scheduled ingestion
- **MCP Server** — exposes RAG tools to Teams bot and Claude Code

## Data Sources Ingested

1. **Channel messages** — all public channel posts across joined teams
2. **Chat messages** — 1:1 and group chats (requires RSC permissions)
3. **Meeting transcripts** — auto-generated transcripts from Teams meetings
4. **Meeting chat** — in-meeting chat messages
5. **Files shared** — document metadata + content extraction (SharePoint/OneDrive)
6. **Reactions/replies** — thread context for sentiment analysis

## Permissions Required (Microsoft Graph)

```
ChannelMessage.Read.All          — Read all channel messages
Chat.Read.All                     — Read all chat messages (application-level)
CallRecords.Read.All              — Meeting metadata + transcripts
OnlineMeetingTranscript.Read.All  — Meeting transcript content
Files.Read.All                    — Shared file content
User.Read.All                     — Resolve user display names
```

## Commands

### `teams-rag sync`
Full historical backfill of all Teams messages into LanceDB.

### `teams-rag subscribe`
Set up Graph webhook subscriptions for real-time message ingestion.

### `teams-rag query <question>`
Semantic search across all ingested Teams content.

### `teams-rag briefing`
Generate daily briefing summary of all Teams activity.

### `teams-rag status`
Show ingestion stats: messages indexed, last sync time, subscription health.

## How This Helps (Reference: WIRED/Hue Article)

The Hue app reads email + calendar → produces audio summary.
Our system goes far beyond:

1. **Reads EVERYTHING** — not just email/calendar, but every Teams message,
   meeting transcript, shared file, and reaction
2. **Real-time** — webhook subscriptions, not daily batch. Up-to-the-minute awareness
3. **Actionable** — Claude doesn't just summarize, it comprehends context and can:
   - Draft responses to unanswered questions
   - Flag blockers mentioned in channels
   - Correlate ADO work items with team discussions
   - Surface decisions made in meetings that affect current sprint work
4. **Integrated** — feeds directly into our existing RLHF/RAG infrastructure
   (ShieldCortex + LanceDB), so Claude's memory is persistent and learning

## Privacy & Compliance

- All data stays on our infrastructure (LanceDB local or Azure-hosted)
- Graph API respects tenant DLP policies
- Application permissions require admin consent
- Audit trail via ShieldCortex SQLite
- No data sent to third parties beyond Anthropic API (for query responses)
