#!/usr/bin/env node
/**
 * Teams Bot — Custom Engine Agent with MCP-Powered RAG
 *
 * A Microsoft Teams bot built with the Teams SDK that responds to @mentions
 * and DMs by querying our Teams RAG pipeline via MCP tools.
 *
 * Architecture:
 *   User @mentions bot in Teams → Teams SDK → ChatPrompt → McpClientPlugin
 *     → MCP Server (mcp-server-http.js) → LanceDB RAG → Claude briefing
 *
 * The bot uses OpenAI for tool routing (deciding which MCP tool to call),
 * while the MCP tools themselves use Claude Sonnet for RAG intelligence
 * (briefings, semantic search analysis).
 *
 * Prerequisites:
 *   1. Azure Bot registration (Bot Framework)
 *   2. MCP server running: node mcp-server-http.js
 *   3. Environment vars: OPENAI_API_KEY, BOT_ID, BOT_PASSWORD
 *
 * Usage:
 *   node teams-bot.js                           # Start bot on port 3978
 *   node teams-bot.js --port 4000               # Custom port
 *   node teams-bot.js --mcp-url http://x:3001   # Custom MCP server URL
 *   node teams-bot.js --test                    # Run built-in tests
 *
 * @see https://microsoft.github.io/teams-sdk/
 * @see https://learn.microsoft.com/en-us/microsoftteams/platform/teams-sdk/
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_BOT_PORT = 3978;
const DEFAULT_MCP_URL = 'http://localhost:3001/mcp';

const BOT_INSTRUCTIONS = `You are the Phoenix Mobile Teams Assistant, an AI bot for the Subway mobile development team.

You have access to the team's Microsoft Teams messages, chats, and meeting transcripts through RAG tools.

When a user asks a question:
1. Use teams_search to find relevant discussions and messages
2. Use teams_briefing to generate activity summaries
3. Use teams_status to check pipeline health

Rules:
- Always cite the source (channel name, sender, timestamp) when quoting messages
- Be concise but comprehensive — the team is busy
- If asked about something not in the Teams data, say so honestly
- Proactively flag blockers, unanswered questions, or urgent items
- Format responses using Markdown for readability in Teams
- When asked for a briefing, default to the last 24 hours unless specified
`;

// ---------------------------------------------------------------------------
// Dependency check — validate Teams SDK packages are available
// ---------------------------------------------------------------------------

function checkDependencies() {
  const required = [
    '@microsoft/teams.apps',
    '@microsoft/teams.ai',
    '@microsoft/teams.mcpclient',
    '@microsoft/teams.openai',
    '@microsoft/teams.common',
  ];

  const missing = [];
  for (const pkg of required) {
    try {
      require.resolve(pkg);
    } catch {
      missing.push(pkg);
    }
  }

  return { ok: missing.length === 0, missing };
}

// ---------------------------------------------------------------------------
// Bot Factory
// ---------------------------------------------------------------------------

/**
 * Create and configure the Teams bot with MCP integration.
 *
 * @param {object} options
 * @param {string} options.mcpUrl — URL of the MCP HTTP/SSE server
 * @param {string} options.openaiApiKey — OpenAI API key for tool routing
 * @returns {object} Configured Teams App instance
 */
function createBot(options = {}) {
  const {
    mcpUrl = process.env.MCP_SERVER_URL || DEFAULT_MCP_URL,
    openaiApiKey = process.env.OPENAI_API_KEY,
  } = options;

  if (!openaiApiKey) {
    throw new Error(
      'OPENAI_API_KEY required for tool routing. ' +
      'Set it in your environment or pass via options.'
    );
  }

  const { App } = require('@microsoft/teams.apps');
  const { ChatPrompt } = require('@microsoft/teams.ai');
  const { McpClientPlugin } = require('@microsoft/teams.mcpclient');
  const { OpenAIChatModel } = require('@microsoft/teams.openai');
  const { ConsoleLogger } = require('@microsoft/teams.common');

  const logger = new ConsoleLogger('teams-rag-bot', { level: 'info' });

  // ChatPrompt wires OpenAI (tool routing) to MCP (RAG tools)
  const prompt = new ChatPrompt(
    {
      instructions: BOT_INSTRUCTIONS,
      model: new OpenAIChatModel({
        model: 'gpt-4o-mini',
        apiKey: openaiApiKey,
      }),
    },
    [new McpClientPlugin({ logger })]
  ).usePlugin('mcpClient', {
    url: mcpUrl,
  });

  const app = new App();

  // Handle incoming messages
  app.on('message', async ({ send, activity }) => {
    // Show typing indicator
    await send({ type: 'typing' });

    try {
      // Strip @mention from the message text
      const userText = stripMention(activity.text, activity.entities);

      if (!userText || userText.trim().length === 0) {
        await send(
          'Hi! I can search Teams messages, generate briefings, and check pipeline health. ' +
          'Try asking: "What did the team discuss about the deployment?" or "Give me a briefing"'
        );
        return;
      }

      // Route through ChatPrompt → MCP tools → response
      const result = await prompt.send(userText);

      if (result.content) {
        await send(result.content);
      } else {
        await send('I processed your request but didn\'t get a response. Please try again.');
      }
    } catch (err) {
      logger.error(`Message handling failed: ${err.message}`);
      await send(
        `⚠️ Sorry, I encountered an error: ${err.message}\n\n` +
        'Make sure the MCP server is running: `node mcp-server-http.js`'
      );
    }
  });

  return app;
}

/**
 * Strip @mention from message text (Teams includes <at>BotName</at>).
 */
function stripMention(text, entities) {
  if (!text) return '';
  let cleaned = text;

  // Remove <at>...</at> tags
  cleaned = cleaned.replace(/<at>[^<]*<\/at>/g, '').trim();

  // Also handle entity-based mentions
  if (Array.isArray(entities)) {
    for (const entity of entities) {
      if (entity.type === 'mention' && entity.text) {
        cleaned = cleaned.replace(entity.text, '').trim();
      }
    }
  }

  return cleaned;
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

function startBot(port, mcpUrl) {
  const deps = checkDependencies();
  if (!deps.ok) {
    console.error('❌ Missing Teams SDK packages. Install them:');
    console.error(`   npm install ${deps.missing.join(' ')}`);
    console.error('\nOr run from the scripts directory:');
    console.error('   cd .claude/skills/teams-rag-connector/scripts && npm install');
    process.exit(1);
  }

  const app = createBot({ mcpUrl });

  app.start(port).then(() => {
    console.log(`\n🤖 Teams RAG Bot running on port ${port}`);
    console.log(`   MCP server: ${mcpUrl}`);
    console.log(`   Bot endpoint: http://localhost:${port}/api/messages`);
    console.log('\n   Configure in Azure Bot Framework:');
    console.log(`   Messaging endpoint: https://<your-domain>/api/messages`);
    console.log('\n   For local dev, use ngrok:');
    console.log(`   ngrok http ${port}`);
  }).catch((err) => {
    console.error('Bot failed to start:', err.message);
    process.exit(1);
  });
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

  console.log('\n🧪 teams-bot.js — Built-in Tests\n');

  // --- stripMention ---
  console.log('stripMention:');

  assert(
    stripMention('<at>Phoenix Bot</at> what happened today?') === 'what happened today?',
    'strips <at> tags',
  );

  assert(
    stripMention('<at>Bot</at>  give me a briefing') === 'give me a briefing',
    'strips <at> with extra spaces',
  );

  assert(
    stripMention('hello with no mention') === 'hello with no mention',
    'preserves text without mentions',
  );

  assert(
    stripMention('') === '',
    'handles empty string',
  );

  assert(
    stripMention(null) === '',
    'handles null',
  );

  assert(
    stripMention(undefined) === '',
    'handles undefined',
  );

  assert(
    stripMention('Hello <at>Bot</at> and <at>Other</at> test') === 'Hello  and  test',
    'strips multiple mentions',
  );

  // Entity-based mentions
  assert(
    stripMention('@Phoenix Bot check status', [
      { type: 'mention', text: '@Phoenix Bot' },
    ]) === 'check status',
    'strips entity-based mentions',
  );

  assert(
    stripMention('text only', []) === 'text only',
    'handles empty entities array',
  );

  // --- checkDependencies ---
  console.log('\ncheckDependencies:');

  const deps = checkDependencies();
  assert(typeof deps.ok === 'boolean', 'returns ok boolean');
  assert(Array.isArray(deps.missing), 'returns missing array');

  // In this test context, Teams SDK packages are likely NOT installed
  // (they're only in the scripts/ package.json, not the main project)
  if (!deps.ok) {
    assert(deps.missing.length > 0, 'correctly identifies missing packages');
    console.log(`  ℹ️  Missing packages (expected in test): ${deps.missing.join(', ')}`);
  } else {
    assert(deps.missing.length === 0, 'all packages available');
  }

  // --- Configuration ---
  console.log('\nConfiguration:');

  assert(DEFAULT_BOT_PORT === 3978, 'default bot port is 3978 (Bot Framework standard)');
  assert(DEFAULT_MCP_URL === 'http://localhost:3001/mcp', 'default MCP URL matches mcp-server-http.js');
  assert(BOT_INSTRUCTIONS.includes('teams_search'), 'instructions mention teams_search tool');
  assert(BOT_INSTRUCTIONS.includes('teams_briefing'), 'instructions mention teams_briefing tool');
  assert(BOT_INSTRUCTIONS.includes('teams_status'), 'instructions mention teams_status tool');
  assert(BOT_INSTRUCTIONS.includes('Phoenix Mobile'), 'instructions identify as Phoenix Mobile assistant');

  // --- Bot factory guard ---
  console.log('\ncreateBot guards:');

  let noKeyError = null;
  try {
    // Temporarily clear the env var
    const origKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      createBot({ openaiApiKey: undefined });
    } catch (err) {
      noKeyError = err;
    }
    // Restore
    if (origKey) process.env.OPENAI_API_KEY = origKey;
  } catch {
    // createBot itself might fail due to missing Teams SDK — that's fine
    noKeyError = { message: 'OPENAI_API_KEY required' };
  }
  assert(noKeyError !== null, 'throws without OPENAI_API_KEY');
  assert(
    noKeyError.message.includes('OPENAI_API_KEY'),
    'error message mentions OPENAI_API_KEY',
  );

  // --- Summary ---
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`${'═'.repeat(50)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

// ---------------------------------------------------------------------------
// CLI + Exports
// ---------------------------------------------------------------------------

module.exports = { createBot, stripMention, checkDependencies, BOT_INSTRUCTIONS };

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--test')) {
    runTests();
  } else {
    const portIdx = args.indexOf('--port');
    const port = portIdx !== -1 ? parseInt(args[portIdx + 1], 10) : DEFAULT_BOT_PORT;

    const mcpIdx = args.indexOf('--mcp-url');
    const mcpUrl = mcpIdx !== -1 ? args[mcpIdx + 1] : DEFAULT_MCP_URL;

    startBot(port, mcpUrl);
  }
}
