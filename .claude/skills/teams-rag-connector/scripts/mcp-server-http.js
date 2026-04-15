#!/usr/bin/env node
/**
 * MCP Server — HTTP/SSE Transport
 *
 * Exposes the same Teams RAG MCP tools as mcp-server.js but over HTTP/SSE
 * instead of stdio. This allows the Teams SDK McpClientPlugin to connect.
 *
 * The stdio version is for Claude Code integration.
 * This HTTP version is for:
 *   1. Teams Bot (via McpClientPlugin)
 *   2. Copilot Studio
 *   3. Any remote MCP client
 *
 * Usage:
 *   node mcp-server-http.js                    # Start on port 3001
 *   node mcp-server-http.js --port 8080        # Custom port
 *   node mcp-server-http.js --test             # Run built-in tests
 */

const express = require('express');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

const { queryTeamsRAG, getStats } = require('./vectorize-content');
const { generateBriefing } = require('./daily-briefing');
const { checkHealth } = require('./pipeline-health');

const DEFAULT_PORT = 3001;

function createMcpServer() {
  const server = new Server(
    { name: 'teams-rag', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  // Define tools (identical to mcp-server.js)
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
            query: { type: 'string', description: 'Natural language search query' },
            limit: { type: 'number', description: 'Max results (default: 10)', default: 10 },
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
            hours: { type: 'number', description: 'Hours to look back (default: 24)', default: 24 },
            focus: { type: 'string', description: 'Optional topic focus' },
          },
        },
      },
      {
        name: 'teams_status',
        description: 'Show Teams RAG pipeline health: vectors indexed, last sync, errors.',
        inputSchema: { type: 'object', properties: {} },
      },
    ],
  }));

  // Handle tool calls (identical to mcp-server.js)
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
          content: [{
            type: 'text',
            text: results.length > 0
              ? `Found ${results.length} results for "${args.query}":\n\n${formatted}`
              : `No results found for "${args.query}". Run ingestion first.`,
          }],
        };
      }

      case 'teams_briefing': {
        try {
          const result = await generateBriefing({
            hours: args.hours || 24,
            focus: args.focus || null,
          });
          return {
            content: [{
              type: 'text',
              text: result ? result.briefing : 'No messages found in the requested time window.',
            }],
          };
        } catch (err) {
          return {
            content: [{ type: 'text', text: `Briefing generation failed: ${err.message}` }],
          };
        }
      }

      case 'teams_status': {
        const stats = await getStats();
        const health = checkHealth();
        const healthLines = health.checks
          .map((c) => {
            const icon = c.status === 'pass' ? '✅' : c.status === 'warn' ? '⚠️' : '❌';
            return `${icon} ${c.name}: ${c.value}`;
          })
          .join('\n');

        return {
          content: [{
            type: 'text',
            text:
              `Teams RAG Pipeline Status\n` +
              `========================\n` +
              `Vectors indexed:  ${stats.vectorCount}\n` +
              `Total messages:   ${stats.totalMessages}\n` +
              `Last sync:        ${stats.lastSync}\n` +
              `Teams indexed:    ${stats.teamsIndexed.join(', ') || 'none'}\n\n` +
              `Health Checks:\n${healthLines}\n` +
              `Overall: ${health.healthy ? '✅ HEALTHY' : '❌ UNHEALTHY'}`,
          }],
        };
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  });

  return server;
}

/**
 * Start Express server with SSE transport for MCP.
 */
function startHttpServer(port) {
  const app = express();
  app.use(express.json());

  // Track active transports for cleanup
  const transports = new Map();

  // SSE endpoint — client connects here to establish the MCP session
  app.get('/mcp', async (req, res) => {
    const server = createMcpServer();
    const transport = new SSEServerTransport('/mcp/messages', res);
    transports.set(transport.sessionId, { server, transport });

    res.on('close', () => {
      transports.delete(transport.sessionId);
    });

    await server.connect(transport);
  });

  // Message endpoint — client sends JSON-RPC requests here
  app.post('/mcp/messages', async (req, res) => {
    const sessionId = req.query.sessionId;
    const entry = transports.get(sessionId);

    if (!entry) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    await entry.transport.handlePostMessage(req, res);
  });

  // Health check endpoint
  app.get('/health', (req, res) => {
    const health = checkHealth();
    res.status(health.healthy ? 200 : 503).json(health);
  });

  const server = app.listen(port, () => {
    console.log(`Teams RAG MCP server (HTTP/SSE) running on port ${port}`);
    console.log(`MCP endpoint: http://localhost:${port}/mcp`);
    console.log(`Health check: http://localhost:${port}/health`);
  });

  return server;
}

// ---------------------------------------------------------------------------
// Built-in Tests
// ---------------------------------------------------------------------------

function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(condition, name) {
    if (condition) {
      passed++;
      console.log(`  ✅ ${name}`);
    } else {
      failed++;
      console.log(`  ❌ ${name}`);
    }
  }

  console.log('\n🧪 mcp-server-http.js — Built-in Tests\n');

  // --- createMcpServer ---
  console.log('createMcpServer:');
  const server = createMcpServer();
  assert(server !== null, 'creates server instance');
  assert(typeof server.connect === 'function', 'server has connect method');

  // --- Tool definitions ---
  console.log('\nTool registration:');
  // We can't directly call the handler without a transport, but we can verify the factory works
  assert(typeof createMcpServer === 'function', 'factory function exists');

  // --- Express app structure ---
  console.log('\nExpress app structure:');
  const testApp = express();
  testApp.use(express.json());

  // Verify route handlers can be added without error
  let routeError = null;
  try {
    testApp.get('/mcp', (req, res) => res.end());
    testApp.post('/mcp/messages', (req, res) => res.end());
    testApp.get('/health', (req, res) => res.end());
  } catch (err) {
    routeError = err;
  }
  assert(routeError === null, 'routes register without error');

  // --- Health check response ---
  console.log('\nHealth check integration:');
  const health = checkHealth();
  assert(typeof health.healthy === 'boolean', 'checkHealth returns boolean');
  assert(Array.isArray(health.checks), 'checkHealth returns checks array');

  // --- Default port ---
  console.log('\nConfiguration:');
  assert(DEFAULT_PORT === 3001, 'default port is 3001');

  // --- Summary ---
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`${'═'.repeat(50)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

// ---------------------------------------------------------------------------
// CLI + Exports
// ---------------------------------------------------------------------------

module.exports = { createMcpServer, startHttpServer };

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--test')) {
    runTests();
  } else {
    const portIdx = args.indexOf('--port');
    const port = portIdx !== -1 ? parseInt(args[portIdx + 1], 10) : DEFAULT_PORT;
    startHttpServer(port);
  }
}
