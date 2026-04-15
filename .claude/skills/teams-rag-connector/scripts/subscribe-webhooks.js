#!/usr/bin/env node
/**
 * Microsoft Graph Webhook Subscriptions for Real-Time Teams Ingestion
 *
 * Creates and manages webhook subscriptions so every new Teams message
 * is immediately vectorized and available for RAG queries.
 *
 * Usage:
 *   node subscribe-webhooks.js --create     # Create all subscriptions
 *   node subscribe-webhooks.js --renew      # Renew expiring subscriptions
 *   node subscribe-webhooks.js --list       # List active subscriptions
 *   node subscribe-webhooks.js --delete-all # Remove all subscriptions
 *
 * Required env:
 *   WEBHOOK_URL — Public HTTPS endpoint for receiving notifications
 *                 (e.g., Azure Function URL or ngrok for local dev)
 */

const { graphFetch, graphFetchAll } = require('./graph-auth');
const fs = require('fs');
const path = require('path');

const SUBS_FILE = path.join(
  process.env.HOME,
  '.shieldcortex',
  'teams_subscriptions.json'
);

// Graph webhook subscription max lifetime varies by resource:
// chatMessage: 60 minutes (with /chats) or up to 4230 minutes with encryption
// For simplicity, renew every 50 minutes
const SUBSCRIPTION_LIFETIME_MINUTES = 50;

const SUBSCRIPTION_RESOURCES = [
  {
    resource: '/teams/getAllMessages',
    changeType: 'created,updated',
    description: 'All channel messages across all teams',
  },
  {
    resource: '/chats/getAllMessages',
    changeType: 'created,updated',
    description: 'All chat messages (1:1 and group)',
  },
  {
    resource: '/communications/callRecords',
    changeType: 'created',
    description: 'New call/meeting records',
  },
];

function loadSubscriptions() {
  try {
    return JSON.parse(fs.readFileSync(SUBS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function saveSubscriptions(subs) {
  const dir = path.dirname(SUBS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SUBS_FILE, JSON.stringify(subs, null, 2));
}

async function createSubscription(resource, changeType, webhookUrl) {
  const expiration = new Date(
    Date.now() + SUBSCRIPTION_LIFETIME_MINUTES * 60 * 1000
  ).toISOString();

  const subscription = await graphFetch('/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      changeType,
      notificationUrl: webhookUrl,
      resource,
      expirationDateTime: expiration,
      clientState: `teams-rag-${Date.now()}`,
      // Include resource data for rich notifications (requires encryption)
      includeResourceData: false,
    }),
  });

  return subscription;
}

async function createAllSubscriptions() {
  const webhookUrl = process.env.WEBHOOK_URL;
  if (!webhookUrl) {
    throw new Error('WEBHOOK_URL env var required. Set to your Azure Function or ngrok URL.');
  }

  console.log(`Creating subscriptions → ${webhookUrl}`);
  const created = [];

  for (const sub of SUBSCRIPTION_RESOURCES) {
    try {
      const result = await createSubscription(sub.resource, sub.changeType, webhookUrl);
      created.push({
        id: result.id,
        resource: sub.resource,
        description: sub.description,
        expirationDateTime: result.expirationDateTime,
        createdAt: new Date().toISOString(),
      });
      console.log(`  [OK] ${sub.description}`);
      console.log(`       Resource: ${sub.resource}`);
      console.log(`       Expires: ${result.expirationDateTime}`);
    } catch (err) {
      console.error(`  [FAIL] ${sub.description}: ${err.message}`);
    }
  }

  saveSubscriptions(created);
  console.log(`\n${created.length}/${SUBSCRIPTION_RESOURCES.length} subscriptions created.`);
  return created;
}

async function renewSubscriptions() {
  const subs = loadSubscriptions();
  if (subs.length === 0) {
    console.log('No subscriptions to renew. Run --create first.');
    return [];
  }

  const renewed = [];
  for (const sub of subs) {
    try {
      const newExpiration = new Date(
        Date.now() + SUBSCRIPTION_LIFETIME_MINUTES * 60 * 1000
      ).toISOString();

      await graphFetch(`/subscriptions/${sub.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ expirationDateTime: newExpiration }),
      });

      sub.expirationDateTime = newExpiration;
      renewed.push(sub);
      console.log(`  [RENEWED] ${sub.description} → ${newExpiration}`);
    } catch (err) {
      console.error(`  [FAIL] ${sub.description}: ${err.message}`);
      // Subscription may have expired — recreate it
      if (err.message.includes('404')) {
        console.log(`  Recreating expired subscription...`);
        const resource = SUBSCRIPTION_RESOURCES.find((r) => r.resource === sub.resource);
        if (resource) {
          try {
            const result = await createSubscription(
              resource.resource,
              resource.changeType,
              process.env.WEBHOOK_URL
            );
            renewed.push({
              ...sub,
              id: result.id,
              expirationDateTime: result.expirationDateTime,
            });
            console.log(`  [RECREATED] ${sub.description}`);
          } catch (recreateErr) {
            console.error(`  [RECREATE FAIL]: ${recreateErr.message}`);
          }
        }
      }
    }
  }

  saveSubscriptions(renewed);
  console.log(`\n${renewed.length} subscriptions renewed.`);
  return renewed;
}

async function listSubscriptions() {
  // List from Graph (source of truth)
  const graphSubs = await graphFetchAll('/subscriptions');
  const teamsSubs = graphSubs.filter(
    (s) =>
      s.resource.includes('Message') ||
      s.resource.includes('messages') ||
      s.resource.includes('callRecords')
  );

  console.log(`Active Teams-related subscriptions: ${teamsSubs.length}`);
  for (const sub of teamsSubs) {
    const expires = new Date(sub.expirationDateTime);
    const remaining = Math.round((expires - Date.now()) / 60000);
    console.log(`  ${sub.resource}`);
    console.log(`    ID: ${sub.id}`);
    console.log(`    Expires: ${sub.expirationDateTime} (${remaining} min remaining)`);
    console.log(`    Notification URL: ${sub.notificationUrl}`);
  }

  return teamsSubs;
}

async function deleteAllSubscriptions() {
  const subs = loadSubscriptions();
  let deleted = 0;

  for (const sub of subs) {
    try {
      await graphFetch(`/subscriptions/${sub.id}`, { method: 'DELETE' });
      deleted++;
      console.log(`  [DELETED] ${sub.description}`);
    } catch (err) {
      console.warn(`  [SKIP] ${sub.id}: ${err.message}`);
    }
  }

  saveSubscriptions([]);
  console.log(`\n${deleted} subscriptions deleted.`);
}

// CLI
const args = process.argv.slice(2);

if (require.main === module) {
  let action;
  if (args.includes('--create')) action = createAllSubscriptions;
  else if (args.includes('--renew')) action = renewSubscriptions;
  else if (args.includes('--list')) action = listSubscriptions;
  else if (args.includes('--delete-all')) action = deleteAllSubscriptions;
  else {
    console.log('Usage: node subscribe-webhooks.js --create|--renew|--list|--delete-all');
    process.exit(0);
  }

  action()
    .catch((err) => {
      console.error('Webhook operation failed:', err.message);
      process.exit(1);
    });
}

module.exports = {
  createAllSubscriptions,
  renewSubscriptions,
  listSubscriptions,
  deleteAllSubscriptions,
};
