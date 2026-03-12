#!/usr/bin/env node
/**
 * Teams Daily Briefing Generator
 *
 * Analyzes all Teams activity from the past 24 hours and generates
 * an actionable briefing using Claude. Goes far beyond Hue's email summary:
 *
 * - Summarizes channel discussions by topic/urgency
 * - Highlights unanswered questions
 * - Extracts action items and decisions
 * - Correlates with ADO work items in current sprint
 * - Flags blockers and escalations
 * - Identifies sentiment shifts and team dynamics
 *
 * Usage:
 *   node daily-briefing.js                     # Full briefing
 *   node daily-briefing.js --hours 4           # Last 4 hours only
 *   node daily-briefing.js --focus "deployment" # Topic-focused briefing
 */

const fs = require('fs');
const path = require('path');
const { queryTeamsRAG, getStats } = require('./vectorize-content');
const Anthropic = require('@anthropic-ai/sdk');

const BRIEFING_SYSTEM_PROMPT = `You are an executive briefing AI for a mobile development team at Subway.
You analyze Microsoft Teams messages and produce actionable intelligence.

Your briefing must include these sections:

## Priority Alerts
Items requiring immediate attention — blockers, escalations, unanswered questions
from leadership, CI/CD failures mentioned, production incidents.

## Key Decisions Made
Decisions captured in team discussions. Include WHO decided, WHAT was decided,
and WHICH messages/channels this came from.

## Action Items Extracted
Tasks mentioned or assigned in conversations. Format: [Owner] — [Action] — [Source channel]

## Sprint-Relevant Discussions
Conversations related to current sprint work items. Correlate with any ADO work item
IDs mentioned (AB#XXXXXX pattern).

## Unanswered Questions
Questions asked in channels/chats that haven't received a reply. These are potential
blockers or knowledge gaps.

## Team Pulse
Brief sentiment analysis — is the team stressed, blocked, productive, celebrating?
Based on message tone, frequency, and content patterns.

## Recommended Actions
Top 3 things the reader should do based on this briefing.

Rules:
- Be concise. Each section should be 3-5 bullet points max.
- Include timestamps and channel/chat names for traceability.
- Prioritize by business impact, not chronological order.
- Flag anything that mentions "blocked", "urgent", "help", "broken", "down".
`;

async function generateBriefing(options = {}) {
  const { hours = 24, focus = null } = options;

  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  // Get stats for context
  const stats = await getStats();
  console.log(`Teams RAG Status: ${stats.vectorCount} vectors, last sync: ${stats.lastSync}`);

  // Build focused query
  let query = `What happened on Microsoft Teams in the last ${hours} hours?`;
  if (focus) {
    query = `What happened related to "${focus}" on Microsoft Teams in the last ${hours} hours?`;
  }

  // Retrieve relevant messages from RAG
  const ragResults = await queryTeamsRAG(query, 50);

  // Filter to requested time window
  const recentResults = ragResults.filter((r) => {
    if (!r.timestamp) return true;
    return new Date(r.timestamp) >= new Date(since);
  });

  if (recentResults.length === 0) {
    console.log('No Teams messages found in the requested time window.');
    console.log('Run `node ingest-messages.js --mode incremental` to sync latest messages.');
    return null;
  }

  // Format context for Claude
  const context = recentResults
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .map((r) => {
      const source =
        r.source === 'channel'
          ? `[${r.teamName}/${r.channelName}]`
          : r.source === 'chat'
            ? `[Chat: ${r.chatTopic || 'Direct'}]`
            : `[Meeting Transcript]`;

      return `${source} ${r.sender} (${r.timestamp}):\n${r.text}`;
    })
    .join('\n\n---\n\n');

  // Generate briefing with Claude
  const client = new Anthropic();
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    system: BRIEFING_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Generate a briefing from these ${recentResults.length} Teams messages (last ${hours} hours):\n\n${context}`,
      },
    ],
  });

  const briefingText = response.content[0].text;

  // Output
  console.log('\n' + '='.repeat(60));
  console.log(`  TEAMS DAILY BRIEFING — ${new Date().toLocaleDateString()}`);
  console.log(`  Scope: Last ${hours} hours | ${recentResults.length} messages analyzed`);
  if (focus) console.log(`  Focus: ${focus}`);
  console.log('='.repeat(60) + '\n');
  console.log(briefingText);

  // Save briefing to file
  const briefingDir = path.join(process.env.HOME, '.shieldcortex', 'briefings');
  if (!fs.existsSync(briefingDir)) fs.mkdirSync(briefingDir, { recursive: true });

  const briefingFile = path.join(
    briefingDir,
    `teams-briefing-${new Date().toISOString().slice(0, 10)}.md`
  );

  fs.writeFileSync(
    briefingFile,
    `# Teams Briefing — ${new Date().toLocaleDateString()}\n\n` +
      `> ${recentResults.length} messages analyzed | Last ${hours} hours\n\n` +
      briefingText
  );
  console.log(`\nBriefing saved to: ${briefingFile}`);

  return { briefing: briefingText, messagesAnalyzed: recentResults.length, savedTo: briefingFile };
}

// CLI
const args = process.argv.slice(2);
const hours = args.includes('--hours')
  ? parseInt(args[args.indexOf('--hours') + 1], 10)
  : 24;
const focus = args.includes('--focus')
  ? args[args.indexOf('--focus') + 1]
  : null;

if (require.main === module) {
  generateBriefing({ hours, focus })
    .then((result) => {
      if (result) {
        console.log(`\nAnalyzed ${result.messagesAnalyzed} messages.`);
      }
    })
    .catch((err) => {
      console.error('Briefing generation failed:', err.message);
      process.exit(1);
    });
}

module.exports = { generateBriefing };
