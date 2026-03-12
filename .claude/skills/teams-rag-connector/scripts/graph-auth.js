#!/usr/bin/env node

// Load .env.local from project root
const _fs = require('fs');
const _envPath = require('path').resolve(__dirname, '..', '..', '..', '..', '.env.local');
if (_fs.existsSync(_envPath)) {
  _fs.readFileSync(_envPath, 'utf8').split('\n').forEach((line) => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = (match[2] || '').replace(/^['"]|['"]$/g, '');
    }
  });
}

/**
 * Microsoft Graph Authentication for Teams RAG Connector
 *
 * Strategy (in priority order):
 *   1. Azure CLI token (`az account get-access-token`) — zero config, uses current login
 *   2. MSAL client credentials — requires app registration (AZURE_TENANT_ID, etc.)
 *
 * The az CLI approach works immediately with no app registration needed.
 * Token auto-refreshes via `az` on each call.
 */

const { execSync } = require('child_process');

let cachedToken = null;
let tokenExpiry = 0;
let authMode = null; // 'app' (MSAL client credentials) or 'delegated' (az CLI)

function getAuthMode() {
  return authMode;
}

/**
 * Get Graph access token from Azure CLI (delegated — user's own permissions).
 * This is the zero-config path. If az is logged in, it just works.
 */
function getTokenFromAzCli() {
  try {
    const output = execSync(
      'az account get-access-token --resource https://graph.microsoft.com --output json',
      { encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const data = JSON.parse(output);
    return {
      accessToken: data.accessToken,
      expiresOn: new Date(data.expiresOn).getTime(),
    };
  } catch {
    return null;
  }
}

/**
 * Get Graph access token from MSAL client credentials (application-level).
 * Requires AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET env vars.
 */
async function getTokenFromMSAL() {
  const { AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET } = process.env;

  if (!AZURE_TENANT_ID || !AZURE_CLIENT_ID || !AZURE_CLIENT_SECRET) {
    return null;
  }

  try {
    const { ConfidentialClientApplication } = require('@azure/msal-node');
    const client = new ConfidentialClientApplication({
      auth: {
        clientId: AZURE_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${AZURE_TENANT_ID}`,
        clientSecret: AZURE_CLIENT_SECRET,
      },
    });

    const result = await client.acquireTokenByClientCredential({
      scopes: ['https://graph.microsoft.com/.default'],
    });

    if (!result || !result.accessToken) return null;

    return {
      accessToken: result.accessToken,
      expiresOn: result.expiresOn?.getTime() || Date.now() + 3600000,
    };
  } catch {
    return null;
  }
}

async function getAccessToken() {
  // Return cached token if still valid (5 min buffer)
  if (cachedToken && tokenExpiry > Date.now() + 300000) {
    return cachedToken;
  }

  // Strategy 1: MSAL client credentials (app-level — sees all teams/chats)
  const msalToken = await getTokenFromMSAL();
  if (msalToken) {
    cachedToken = msalToken.accessToken;
    tokenExpiry = msalToken.expiresOn;
    authMode = 'app';
    return cachedToken;
  }

  // Strategy 2: Azure CLI fallback (delegated — only sees user's joined teams)
  const azToken = getTokenFromAzCli();
  if (azToken) {
    cachedToken = azToken.accessToken;
    tokenExpiry = azToken.expiresOn;
    authMode = 'delegated';
    return cachedToken;
  }

  throw new Error(
    'Cannot acquire Graph token. Either:\n' +
      '  1. Login with Azure CLI: az login\n' +
      '  2. Set AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET env vars'
  );
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1200; // ~8 req/10s, under the 10/10s limit

async function graphFetch(endpoint, options = {}, retries = 3) {
  const token = await getAccessToken();
  const baseUrl = 'https://graph.microsoft.com/v1.0';
  const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;

  // Throttle: ensure minimum interval between requests
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL) {
    await sleep(MIN_REQUEST_INTERVAL - elapsed);
  }
  lastRequestTime = Date.now();

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  // Handle 429 with retry-after
  if (response.status === 429 && retries > 0) {
    const retryAfter = parseInt(response.headers.get('retry-after') || '10', 10);
    console.warn(`  Rate limited, waiting ${retryAfter}s...`);
    await sleep(retryAfter * 1000);
    return graphFetch(endpoint, options, retries - 1);
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Graph API ${response.status}: ${error}`);
  }

  return response.json();
}

/**
 * Paginate through all results from a Graph API endpoint.
 * Follows @odata.nextLink automatically.
 */
async function graphFetchAll(endpoint) {
  const results = [];
  let url = endpoint;

  while (url) {
    const data = await graphFetch(url);
    if (data.value) {
      results.push(...data.value);
    }
    url = data['@odata.nextLink'] || null;
  }

  return results;
}

// CLI test: node graph-auth.js
if (require.main === module) {
  (async () => {
    try {
      const token = await getAccessToken();
      console.log(`Token acquired (${token.length} chars)`);

      // Test: get current user
      const me = await graphFetch('/me');
      console.log(`Authenticated as: ${me.displayName} (${me.mail || me.userPrincipalName})`);

      // Test: list joined teams
      const teams = await graphFetch('/me/joinedTeams');
      console.log(`Joined teams: ${teams.value.length}`);
      for (const team of teams.value) {
        console.log(`  - ${team.displayName}`);
      }
    } catch (err) {
      console.error('Auth test failed:', err.message);
      process.exit(1);
    }
  })();
}

module.exports = { getAccessToken, getAuthMode, graphFetch, graphFetchAll };
