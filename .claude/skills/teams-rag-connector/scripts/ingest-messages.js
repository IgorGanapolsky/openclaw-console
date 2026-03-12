#!/usr/bin/env node
/**
 * Teams Message Ingestion Pipeline
 *
 * Fetches all messages from Teams channels and chats via Microsoft Graph,
 * then vectorizes and stores them in LanceDB for RAG queries.
 *
 * Usage:
 *   node ingest-messages.js --mode backfill    # Full historical ingestion
 *   node ingest-messages.js --mode incremental  # Since last sync timestamp
 *   node ingest-messages.js --mode single --team-id <id> --channel-id <id>
 */

const { graphFetch, graphFetchAll, getAuthMode, getAccessToken } = require('./graph-auth');
const { vectorizeAndStore } = require('./vectorize-content');
const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(
  process.env.HOME,
  '.shieldcortex',
  'teams_sync_state.json'
);

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return { lastSync: null, teamsIndexed: [], totalMessages: 0 };
  }
}

function saveState(state) {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// Known team/channel IDs (workaround until Channel.ReadBasic.All permission is granted)
const KNOWN_TEAMS = [
  { id: '380c2973-3dcc-466d-aaaa-d31c6ad69423', displayName: 'Phoenix' },
  { id: '5fd4ee7c-890c-4042-bfb3-2cf0e52a74ab', displayName: 'Technology Production Support' },
];

const KNOWN_CHANNELS = {
  '380c2973-3dcc-466d-aaaa-d31c6ad69423': [ // Phoenix
    { id: '19:003ecb6cee6d47238a3256d5c1e54022@thread.tacv2', displayName: 'Scope and Planning' },
    { id: '19:1adefece597b44e99e1935f769559ecc@thread.tacv2', displayName: 'Product Strategy' },
    { id: '19:2Prt0m21G4K-mH8T10L94dGdWu1vHjde1zCOS0B-OM01@thread.tacv2', displayName: 'Discussion' },
    { id: '19:7ef3e6e2586a46a89c77635e0cc104a4@thread.tacv2', displayName: 'PRs and Team Collaborations' },
    { id: '19:cd01e7b31d4c4160913c56a3cae5aa7f@thread.tacv2', displayName: 'Tech Strategy' },
    { id: '19:wuJInI898pNBxVUxhDIHBI--XWXc1QBEia6V4BWYFHs1@thread.tacv2', displayName: 'Miami fam' },
  ],
  '5fd4ee7c-890c-4042-bfb3-2cf0e52a74ab': [ // Technology Production Support
    { id: '19:0af589f05e1e4dfb9dd13e47a1be3e81@thread.skype', displayName: 'Service Intro' },
    { id: '19:27f7526c44c24691b93f61cd048a0612@thread.skype', displayName: 'Executive Comms' },
    { id: '19:382f97c970534aef91c4afa601ec8e7c@thread.skype', displayName: '02-Dynatrace-Alerts' },
    { id: '19:928f55e693ec4d889bcb3b859d236b7c@thread.skype', displayName: 'General' },
    { id: '19:b2a9f94207124996865c8b32d99d8e02@thread.skype', displayName: 'Deployments' },
    { id: '19:e87e3844146d40319eb4dd894251180a@thread.skype', displayName: '01-MIR' },
  ],
};

async function getJoinedTeams() {
  await getAccessToken();
  const mode = getAuthMode();

  if (mode === 'app') {
    // App mode: try API first, fall back to known teams list
    try {
      const teams = await graphFetchAll("/groups?$filter=resourceProvisioningOptions/Any(x:x eq 'Team')&$select=id,displayName,description");
      if (teams.length > 0) return teams;
    } catch {
      // Team.ReadBasic.All not granted — use hardcoded list
    }
    console.log(`  [app mode] Using ${KNOWN_TEAMS.length} known teams (Team.ReadBasic.All not yet granted)`);
    return KNOWN_TEAMS;
  }
  // Delegated: only the user's joined teams
  return graphFetchAll('/me/joinedTeams');
}

async function getTeamChannels(teamId) {
  try {
    return await graphFetchAll(`/teams/${teamId}/channels`);
  } catch {
    // Channel.ReadBasic.All not granted — use known channels
    if (KNOWN_CHANNELS[teamId]) {
      console.log(`    Using ${KNOWN_CHANNELS[teamId].length} known channels (Channel.ReadBasic.All not yet granted)`);
      return KNOWN_CHANNELS[teamId];
    }
    return [];
  }
}

async function getChannelMessages(teamId, channelId, since = null) {
  // Strategy 1: Try direct channel messages API (needs ChannelMessage.Read.All)
  try {
    let endpoint = `/teams/${teamId}/channels/${channelId}/messages`;
    if (since) {
      const sinceISO = new Date(since).toISOString();
      endpoint += `?$filter=lastModifiedDateTime gt ${sinceISO}`;
    }
    return await graphFetchAll(endpoint);
  } catch (err) {
    if (!err.message.includes('403')) throw err;
    // Fallback: not fatal, try group threads below
  }

  // Strategy 2: Use group threads/conversations (works with Group.ReadWrite.All)
  try {
    const threads = await graphFetchAll(`/groups/${teamId}/threads`);
    const messages = [];
    for (const thread of threads) {
      const posts = await graphFetchAll(
        `/groups/${teamId}/threads/${thread.id}/posts`
      );
      for (const post of posts) {
        messages.push({
          id: post.id,
          body: post.body,
          from: post.from,
          createdDateTime: post.receivedDateTime || post.createdDateTime,
          importance: post.importance,
          subject: thread.topic,
          attachments: post.attachments || [],
          _source: 'group_thread',
        });
      }
    }
    return messages;
  } catch (err) {
    console.warn(`  Could not read threads for team ${teamId}: ${err.message}`);
    return [];
  }
}

async function getChatMessages(since = null) {
  const mode = getAuthMode();
  // App permissions: use target user's UPN; delegated: use /me
  const userPath = mode === 'app'
    ? `/users/${process.env.TEAMS_RAG_USER_UPN || 'ganapolsky_i@subway.com'}`
    : '/me';
  let endpoint = `${userPath}/chats?$expand=members`;
  let chats;
  try {
    chats = await graphFetchAll(endpoint);
  } catch (err) {
    if (err.message.includes('403') || err.message.includes('404')) {
      console.warn(`  Chat.Read permission not available for ${userPath} — skipping chat messages`);
      return [];
    }
    throw err;
  }
  const allMessages = [];

  for (const chat of chats) {
    let msgEndpoint = `/chats/${chat.id}/messages`;
    if (since) {
      msgEndpoint += `?$filter=createdDateTime gt ${new Date(since).toISOString()}`;
    }

    const messages = await graphFetchAll(msgEndpoint);
    allMessages.push(
      ...messages.map((msg) => ({
        ...msg,
        _chatTopic: chat.topic || 'Direct Chat',
        _chatType: chat.chatType,
        _participants: (chat.members || [])
          .map((m) => m.displayName)
          .join(', '),
      }))
    );
  }

  return allMessages;
}

async function getMeetingTranscripts(since = null) {
  // Requires OnlineMeetingTranscript.Read.All or CallRecords.Read.All
  let endpoint = '/communications/callRecords';
  if (since) {
    endpoint += `?$filter=startDateTime gt ${new Date(since).toISOString()}`;
  }

  let records;
  try {
    records = await graphFetchAll(endpoint);
  } catch (err) {
    if (err.message.includes('403')) {
      console.warn('  CallRecords.Read permission not available — skipping meeting transcripts');
      return [];
    }
    throw err;
  }
  const transcripts = [];

  for (const record of records) {
    if (record.type === 'groupCall') {
      try {
        // Get transcript content if available
        const meetingTranscripts = await graphFetchAll(
          `/users/${record.organizer?.user?.id}/onlineMeetings?$filter=joinWebUrl eq '${record.joinWebUrl}'`
        );

        for (const meeting of meetingTranscripts) {
          const transcriptList = await graphFetchAll(
            `/me/onlineMeetings/${meeting.id}/transcripts`
          );
          for (const t of transcriptList) {
            const content = await graphFetch(
              `/me/onlineMeetings/${meeting.id}/transcripts/${t.id}/content?$format=text/vtt`
            );
            transcripts.push({
              meetingId: meeting.id,
              subject: meeting.subject,
              startTime: record.startDateTime,
              endTime: record.endDateTime,
              organizer: record.organizer?.user?.displayName,
              content: typeof content === 'string' ? content : JSON.stringify(content),
              participants: (record.participants || [])
                .map((p) => p.user?.displayName)
                .filter(Boolean),
            });
          }
        }
      } catch (err) {
        // Transcript not available for all meetings
        console.warn(`Transcript unavailable for record ${record.id}: ${err.message}`);
      }
    }
  }

  return transcripts;
}

function formatMessageForRAG(msg, source) {
  // Resolve sender from multiple Graph API response shapes
  const sender =
    msg.from?.user?.displayName ||
    msg.from?.application?.displayName ||
    msg.from?.emailAddress?.name ||
    msg.sender?.emailAddress?.name ||
    (msg.organizer ? msg.organizer : null) ||
    'Unknown';
  const timestamp = msg.createdDateTime || msg.startTime;
  const content = msg.body?.content || msg.content || '';

  // Strip HTML tags and &nbsp; from message content
  const plainText = content.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  if (!plainText) return null;

  return {
    id: msg.id || msg.meetingId,
    source,
    sender,
    timestamp,
    text: plainText,
    metadata: {
      teamName: msg._teamName,
      channelName: msg._channelName,
      chatTopic: msg._chatTopic,
      chatType: msg._chatType,
      participants: msg._participants || (msg.participants || []).join(', '),
      subject: msg.subject,
      importance: msg.importance,
      hasAttachments: (msg.attachments || []).length > 0,
      replyCount: msg.replies?.length || 0,
    },
  };
}

async function runBackfill() {
  console.log('Starting full Teams backfill...');
  const state = loadState();
  let totalIngested = 0;
  const seenMessageIds = new Set(); // Deduplicate across channels

  // 1. Channel messages
  console.log('Fetching joined teams...');
  const teams = await getJoinedTeams();
  console.log(`Found ${teams.length} teams`);

  for (const team of teams) {
    const channels = await getTeamChannels(team.id);
    console.log(`  Team "${team.displayName}": ${channels.length} channels`);

    for (const channel of channels) {
      const messages = await getChannelMessages(team.id, channel.id);
      const formatted = messages
        .map((msg) => {
          // Deduplicate: same message ID can appear via group threads across channels
          if (msg.id && seenMessageIds.has(msg.id)) return null;
          if (msg.id) seenMessageIds.add(msg.id);
          msg._teamName = team.displayName;
          msg._channelName = channel.displayName;
          return formatMessageForRAG(msg, 'channel');
        })
        .filter(Boolean);

      if (formatted.length > 0) {
        await vectorizeAndStore(formatted);
        totalIngested += formatted.length;
        console.log(`    Channel "${channel.displayName}": ${formatted.length} messages`);
      }
    }
  }

  // 2. Chat messages
  console.log('Fetching chat messages...');
  const chatMessages = await getChatMessages();
  const formattedChats = chatMessages
    .map((msg) => formatMessageForRAG(msg, 'chat'))
    .filter(Boolean);

  if (formattedChats.length > 0) {
    await vectorizeAndStore(formattedChats);
    totalIngested += formattedChats.length;
    console.log(`  Chats: ${formattedChats.length} messages`);
  }

  // 3. Meeting transcripts
  console.log('Fetching meeting transcripts...');
  const transcripts = await getMeetingTranscripts();
  const formattedTranscripts = transcripts
    .map((t) => formatMessageForRAG(t, 'meeting_transcript'))
    .filter(Boolean);

  if (formattedTranscripts.length > 0) {
    await vectorizeAndStore(formattedTranscripts);
    totalIngested += formattedTranscripts.length;
    console.log(`  Transcripts: ${formattedTranscripts.length} segments`);
  }

  state.lastSync = new Date().toISOString();
  state.totalMessages = (state.totalMessages || 0) + totalIngested;
  state.teamsIndexed = teams.map((t) => t.displayName);
  saveState(state);

  console.log(`\nBackfill complete. ${totalIngested} items ingested.`);
  return { totalIngested, teams: teams.length };
}

async function runIncremental() {
  const state = loadState();
  const since = state.lastSync;

  if (!since) {
    console.log('No previous sync found. Running full backfill instead.');
    return runBackfill();
  }

  console.log(`Incremental sync since ${since}...`);
  let totalIngested = 0;

  const teams = await getJoinedTeams();
  for (const team of teams) {
    const channels = await getTeamChannels(team.id);
    for (const channel of channels) {
      const messages = await getChannelMessages(team.id, channel.id, since);
      const formatted = messages
        .map((msg) => {
          msg._teamName = team.displayName;
          msg._channelName = channel.displayName;
          return formatMessageForRAG(msg, 'channel');
        })
        .filter(Boolean);

      if (formatted.length > 0) {
        await vectorizeAndStore(formatted);
        totalIngested += formatted.length;
      }
    }
  }

  const chatMessages = await getChatMessages(since);
  const formattedChats = chatMessages
    .map((msg) => formatMessageForRAG(msg, 'chat'))
    .filter(Boolean);

  if (formattedChats.length > 0) {
    await vectorizeAndStore(formattedChats);
    totalIngested += formattedChats.length;
  }

  state.lastSync = new Date().toISOString();
  state.totalMessages = (state.totalMessages || 0) + totalIngested;
  saveState(state);

  console.log(`Incremental sync complete. ${totalIngested} new items.`);
  return { totalIngested };
}

// CLI entry point
const args = process.argv.slice(2);
const mode = args.includes('--mode') ? args[args.indexOf('--mode') + 1] : 'incremental';

if (require.main === module) {
  (mode === 'backfill' ? runBackfill() : runIncremental())
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((err) => {
      console.error('Ingestion failed:', err.message);
      process.exit(1);
    });
}

module.exports = { runBackfill, runIncremental, formatMessageForRAG };
