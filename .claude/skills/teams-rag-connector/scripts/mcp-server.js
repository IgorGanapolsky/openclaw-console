#!/usr/bin/env node

// Load .env.local from project root (no dotenv dependency)
const fs = require('fs');
const envPath = require('path').resolve(__dirname, '..', '..', '..', '..', '.env.local');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = (match[2] || '').replace(/^['"]|['"]$/g, '');
    }
  });
}

/**
 * MCP Server — Exposes Teams RAG as tools for Claude Code and Teams Bot
 *
 * This MCP server provides three tools:
 *   1. teams_search    — Semantic search across all Teams messages
 *   2. teams_briefing  — Generate daily/hourly briefing
 *   3. teams_status    — Show ingestion pipeline health
 *
 * Integration:
 *   Add to ~/.claude/mcp.json:
 *   {
 *     "mcpServers": {
 *       "teams-rag": {
 *         "command": "node",
 *         "args": [".claude/skills/teams-rag-connector/scripts/mcp-server.js"],
 *         "cwd": "/path/to/project"
 *       }
 *     }
 *   }
 *
 *   Or for Teams SDK bot (remote MCP):
 *   Teams SDK McpClientPlugin with Azure Function URL
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

const { queryTeamsRAG, getStats } = require('./vectorize-content');
const { generateBriefing } = require('./daily-briefing');

const server = new Server(
  {
    name: 'teams-rag',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'teams_search',
      description:
        'Search across all Microsoft Teams messages, chats, and meeting transcripts. ' +
        'Returns semantically relevant results from the RAG vector store.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Natural language search query',
          },
          limit: {
            type: 'number',
            description: 'Maximum results to return (default: 10)',
            default: 10,
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'teams_briefing',
      description:
        'Generate an executive briefing from Teams activity. ' +
        'Includes priority alerts, decisions, action items, and team pulse.',
      inputSchema: {
        type: 'object',
        properties: {
          hours: {
            type: 'number',
            description: 'Hours to look back (default: 24)',
            default: 24,
          },
          focus: {
            type: 'string',
            description: 'Optional topic focus (e.g., "deployment", "sprint review")',
          },
        },
      },
    },
    {
      name: 'teams_status',
      description:
        'Show Teams RAG pipeline health: vectors indexed, last sync time, teams covered.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'teams_search': {
      const results = await queryTeamsRAG(args.query, args.limit || 10);
      const formatted = results
        .map((r, i) => {
          const source =
            r.source === 'channel'
              ? `${r.teamName}/${r.channelName}`
              : r.source === 'chat'
                ? `Chat: ${r.chatTopic || 'Direct'}`
                : 'Meeting Transcript';

          return (
            `[${i + 1}] ${r.sender} — ${source}\n` +
            `    ${new Date(r.timestamp).toLocaleString()}\n` +
            `    ${r.text.slice(0, 300)}${r.text.length > 300 ? '...' : ''}\n` +
            `    Relevance: ${(1 - r.score).toFixed(4)}`
          );
        })
        .join('\n\n');

      return {
        content: [
          {
            type: 'text',
            text:
              results.length > 0
                ? `Found ${results.length} results for "${args.query}":\n\n${formatted}`
                : `No results found for "${args.query}". Run ingestion first.`,
          },
        ],
      };
    }

    case 'teams_briefing': {
      try {
        const result = await generateBriefing({
          hours: args.hours || 24,
          focus: args.focus || null,
        });

        return {
          content: [
            {
              type: 'text',
              text: result
                ? result.briefing
                : 'No messages found in the requested time window.',
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `Briefing generation failed: ${err.message}`,
            },
          ],
        };
      }
    }

    case 'teams_status': {
      const stats = await getStats();
      return {
        content: [
          {
            type: 'text',
            text:
              `Teams RAG Pipeline Status\n` +
              `========================\n` +
              `Vectors indexed:  ${stats.vectorCount}\n` +
              `Total messages:   ${stats.totalMessages}\n` +
              `Last sync:        ${stats.lastSync}\n` +
              `Teams indexed:    ${stats.teamsIndexed.join(', ') || 'none'}\n` +
              `LanceDB path:     ~/.shieldcortex/lancedb/teams_messages.lance`,
          },
        ],
      };
    }

    default:
      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true,
      };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Teams RAG MCP server running on stdio');
}

main().catch((err) => {
  console.error('MCP server failed to start:', err);
  process.exit(1);
});
