#!/usr/bin/env node
/**
 * Webhook Handler — Azure Function for Real-Time Teams Message Ingestion
 *
 * Deploy as Azure Function (HTTP trigger) to receive Graph change notifications
 * and immediately vectorize new messages into LanceDB.
 *
 * This is the "up to the minute" piece — every new Teams message arrives here
 * within seconds and gets indexed for RAG queries.
 *
 * Azure Function deployment:
 *   func init TeamsRAGWebhook --javascript
 *   func new --name webhook --template "HTTP trigger"
 *   Copy this file as index.js
 *   func azure functionapp publish <app-name>
 */

const { graphFetch } = require('./graph-auth');
const { vectorizeAndStore } = require('./vectorize-content');

/**
 * Azure Function HTTP trigger handler.
 * Handles both validation and notification requests.
 */
async function webhookHandler(req) {
  // 1. Validation request — Graph sends this when creating subscription
  const validationToken = req.query?.validationToken || req.query?.get?.('validationToken');
  if (validationToken) {
    console.log('Subscription validation received');
    return {
      status: 200,
      body: validationToken,
      headers: { 'Content-Type': 'text/plain' },
    };
  }

  // 2. Notification request — new message(s) arrived
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const notifications = body?.value || [];

  console.log(`Received ${notifications.length} notifications`);

  const processedMessages = [];

  for (const notification of notifications) {
    try {
      const { resource, changeType, clientState } = notification;

      // Verify client state (anti-spoofing)
      if (!clientState || !clientState.startsWith('teams-rag-')) {
        console.warn('Invalid clientState, skipping notification');
        continue;
      }

      // Fetch the full message using the resource URL
      const message = await graphFetch(`/${resource}`);

      if (!message || !message.body?.content) {
        console.warn(`Empty message for resource: ${resource}`);
        continue;
      }

      // Format for RAG
      const sender =
        message.from?.user?.displayName ||
        message.from?.application?.displayName ||
        'Unknown';
      const plainText = message.body.content.replace(/<[^>]*>/g, '').trim();

      if (!plainText) continue;

      // Determine source context
      let source = 'channel';
      let metadata = {};

      if (resource.includes('/chats/')) {
        source = 'chat';
        // Fetch chat details for context
        const chatId = resource.split('/chats/')[1]?.split('/')[0];
        if (chatId) {
          try {
            const chat = await graphFetch(`/chats/${chatId}`);
            metadata.chatTopic = chat.topic || 'Direct Chat';
            metadata.chatType = chat.chatType;
          } catch {
            // Chat details unavailable
          }
        }
      } else if (resource.includes('/teams/')) {
        const parts = resource.match(/teams\/([^/]+)\/channels\/([^/]+)/);
        if (parts) {
          try {
            const team = await graphFetch(`/teams/${parts[1]}`);
            const channel = await graphFetch(
              `/teams/${parts[1]}/channels/${parts[2]}`
            );
            metadata.teamName = team.displayName;
            metadata.channelName = channel.displayName;
          } catch {
            // Team/channel details unavailable
          }
        }
      }

      const formatted = {
        id: message.id,
        source,
        sender,
        timestamp: message.createdDateTime,
        text: plainText,
        metadata: {
          ...metadata,
          importance: message.importance,
          hasAttachments: (message.attachments || []).length > 0,
          changeType,
        },
      };

      processedMessages.push(formatted);
    } catch (err) {
      console.error(`Failed to process notification: ${err.message}`);
    }
  }

  // Batch vectorize all processed messages
  if (processedMessages.length > 0) {
    try {
      const count = await vectorizeAndStore(processedMessages);
      console.log(`Real-time ingested: ${count} vectors from ${processedMessages.length} messages`);
    } catch (err) {
      console.error(`Vectorization failed: ${err.message}`);
    }
  }

  // Must return 202 Accepted quickly (within 3 seconds)
  return {
    status: 202,
    body: JSON.stringify({
      processed: processedMessages.length,
      total: notifications.length,
    }),
  };
}

/**
 * Express-compatible middleware (for local dev with ngrok).
 */
function expressHandler(req, res) {
  webhookHandler(req)
    .then((result) => {
      res.status(result.status);
      if (result.headers) {
        Object.entries(result.headers).forEach(([k, v]) => res.set(k, v));
      }
      res.send(result.body);
    })
    .catch((err) => {
      console.error('Webhook handler error:', err);
      res.status(500).send('Internal error');
    });
}

module.exports = { webhookHandler, expressHandler };

// Local dev server (use with ngrok for testing)
if (require.main === module) {
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.post('/api/webhook', expressHandler);
  app.get('/api/webhook', (req, res) => {
    // Handle validation GET requests
    const token = req.query.validationToken;
    if (token) {
      res.type('text/plain').send(token);
    } else {
      res.json({ status: 'Teams RAG webhook handler running' });
    }
  });

  const PORT = process.env.PORT || 7071;
  app.listen(PORT, () => {
    console.log(`Webhook handler listening on port ${PORT}`);
    console.log(`Notification URL: http://localhost:${PORT}/api/webhook`);
    console.log(`Use ngrok to expose: ngrok http ${PORT}`);
  });
}
