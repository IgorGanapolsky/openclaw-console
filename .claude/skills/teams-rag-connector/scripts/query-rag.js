#!/usr/bin/env node
/**
 * Teams RAG Query Interface
 *
 * Semantic search across all ingested Teams content.
 * Can be used standalone or as an MCP tool exposed to Claude Code.
 *
 * Usage:
 *   node query-rag.js "What did the team decide about the deployment?"
 *   node query-rag.js "Who mentioned the menu API issue?"
 *   node query-rag.js --status   # Show ingestion stats
 */

const { queryTeamsRAG, getStats } = require('./vectorize-content');

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--status')) {
    const stats = await getStats();
    console.log('Teams RAG Status');
    console.log('================');
    console.log(`Vectors indexed: ${stats.vectorCount}`);
    console.log(`Total messages:  ${stats.totalMessages}`);
    console.log(`Last sync:       ${stats.lastSync}`);
    console.log(`Teams indexed:   ${stats.teamsIndexed.join(', ') || 'none'}`);
    return;
  }

  const question = args.join(' ');
  if (!question) {
    console.log('Usage: node query-rag.js "your question here"');
    console.log('       node query-rag.js --status');
    return;
  }

  console.log(`Searching Teams RAG for: "${question}"\n`);
  const results = await queryTeamsRAG(question, 10);

  if (results.length === 0) {
    console.log('No results found. Run ingestion first:');
    console.log('  node ingest-messages.js --mode backfill');
    return;
  }

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const source =
      r.source === 'channel'
        ? `${r.teamName}/${r.channelName}`
        : r.source === 'chat'
          ? `Chat: ${r.chatTopic || 'Direct'}`
          : 'Meeting Transcript';

    console.log(`[${i + 1}] ${r.sender} — ${source}`);
    console.log(`    ${new Date(r.timestamp).toLocaleString()}`);
    console.log(`    ${r.text.slice(0, 200)}${r.text.length > 200 ? '...' : ''}`);
    console.log(`    Score: ${(1 - r.score).toFixed(4)}`);
    console.log();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Query failed:', err.message);
    process.exit(1);
  });
}
