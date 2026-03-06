import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { WebClient as SlackWebClient } from '@slack/web-api';
import fetch from 'node-fetch';

// Integration types
export type IntegrationType = 'slack' | 'pagerduty' | 'webhook' | 'datadog' | 'grafana';

export interface Integration {
  id: string;
  type: IntegrationType;
  name: string;
  description: string;
  status: 'connected' | 'disconnected' | 'error';
  config: {
    [key: string]: any;
  };
  createdAt: string;
  lastUsed?: string;
  userId: string;
}

export interface SlackIntegrationConfig extends Integration {
  type: 'slack';
  config: {
    workspaceId: string;
    workspaceName: string;
    accessToken: string;
    botUserId: string;
    scope: string;
    channelId?: string;
    channelName?: string;
  };
}

export interface PagerDutyIntegrationConfig extends Integration {
  type: 'pagerduty';
  config: {
    apiToken: string;
    serviceIds: string[];
    userEmail: string;
    subdomain: string;
  };
}

export interface WebhookIntegrationConfig extends Integration {
  type: 'webhook';
  config: {
    url: string;
    method: 'GET' | 'POST' | 'PUT';
    headers: { [key: string]: string };
    secret?: string;
    events: string[];
  };
}

// Integration storage (replace with database in production)
const integrations = new Map<string, Integration>();
const userIntegrations = new Map<string, string[]>(); // userId -> integration IDs

// Slack configuration
const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID;
// const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET; // Reserved for OAuth flow
const SLACK_REDIRECT_URI = process.env.SLACK_REDIRECT_URI || 'http://localhost:18789/api/integrations/slack/callback';

// PagerDuty configuration
// const PAGERDUTY_APP_ID = process.env.PAGERDUTY_APP_ID; // Reserved for OAuth flow
// const PAGERDUTY_CLIENT_SECRET = process.env.PAGERDUTY_CLIENT_SECRET; // Reserved for OAuth flow
// const PAGERDUTY_REDIRECT_URI = process.env.PAGERDUTY_REDIRECT_URI || 'http://localhost:18789/api/integrations/pagerduty/callback'; // Reserved for OAuth flow

/**
 * Get available integrations
 */
export function getAvailableIntegrations(): Array<{
  type: IntegrationType;
  name: string;
  description: string;
  features: string[];
  requiredScopes?: string[];
  isPremium: boolean;
}> {
  return [
    {
      type: 'slack',
      name: 'Slack',
      description: 'Post messages and interactive buttons for approvals',
      features: [
        'Post approval requests to channels',
        'Interactive approve/deny buttons',
        'Status updates and notifications',
        'Custom slash commands'
      ],
      requiredScopes: ['chat:write', 'chat:write.public', 'channels:read'],
      isPremium: true
    },
    {
      type: 'pagerduty',
      name: 'PagerDuty',
      description: 'Incident management and escalation triggers',
      features: [
        'Fetch active incidents',
        'Acknowledge incidents',
        'Trigger escalations',
        'Create incidents from agent actions'
      ],
      isPremium: true
    },
    {
      type: 'webhook',
      name: 'Generic Webhook',
      description: 'Send HTTP requests to custom endpoints',
      features: [
        'POST/PUT/GET requests',
        'Custom headers and authentication',
        'Event filtering',
        'Signature verification'
      ],
      isPremium: false
    },
    {
      type: 'datadog',
      name: 'Datadog',
      description: 'Monitoring and alerting integration',
      features: [
        'Send custom metrics',
        'Create monitors from agent actions',
        'Query dashboards',
        'Alert acknowledgment'
      ],
      isPremium: true
    },
    {
      type: 'grafana',
      name: 'Grafana',
      description: 'Dashboard and visualization integration',
      features: [
        'Create annotations',
        'Query dashboard data',
        'Alert rule management',
        'Snapshot generation'
      ],
      isPremium: true
    }
  ];
}

/**
 * Create new integration
 */
export async function createIntegration(
  userId: string,
  type: IntegrationType,
  name: string,
  config: any
): Promise<{ success: boolean; integration?: Integration; error?: string }> {
  try {
    const integrationId = crypto.randomUUID();

    const integration: Integration = {
      id: integrationId,
      type,
      name,
      description: getAvailableIntegrations().find(i => i.type === type)?.description || '',
      status: 'connected',
      config,
      createdAt: new Date().toISOString(),
      userId
    };

    // Validate integration config
    const validationResult = await validateIntegrationConfig(integration);
    if (!validationResult.valid) {
      return {
        success: false,
        error: validationResult.error
      };
    }

    // Store integration
    integrations.set(integrationId, integration);

    // Update user's integration list
    const userInts = userIntegrations.get(userId) || [];
    userInts.push(integrationId);
    userIntegrations.set(userId, userInts);

    console.log(`[Integrations] Created ${type} integration for user ${userId}`);
    return { success: true, integration };

  } catch (error) {
    console.error(`[Integrations] Error creating integration:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Integration creation failed'
    };
  }
}

/**
 * Get user integrations
 */
export function getUserIntegrations(userId: string): Integration[] {
  const userIntIds = userIntegrations.get(userId) || [];
  return userIntIds.map(id => integrations.get(id)).filter(Boolean) as Integration[];
}

/**
 * Validate integration configuration
 */
async function validateIntegrationConfig(integration: Integration): Promise<{ valid: boolean; error?: string }> {
  switch (integration.type) {
    case 'slack':
      return validateSlackConfig(integration as SlackIntegrationConfig);
    case 'pagerduty':
      return validatePagerDutyConfig(integration as PagerDutyIntegrationConfig);
    case 'webhook':
      return validateWebhookConfig(integration as WebhookIntegrationConfig);
    default:
      return { valid: true };
  }
}

/**
 * Slack Integration Implementation
 */
export class SlackIntegration {
  private client: SlackWebClient;

  constructor(private integration: SlackIntegrationConfig) {
    this.client = new SlackWebClient(integration.config.accessToken);
  }

  async postMessage(channel: string, text: string, blocks?: any[]): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await this.client.chat.postMessage({
        channel,
        text,
        blocks
      });

      if (result.ok) {
        // Update last used timestamp
        this.integration.lastUsed = new Date().toISOString();
        integrations.set(this.integration.id, this.integration);

        console.log(`[Slack] Message posted to ${channel}`);
        return { success: true };
      } else {
        return { success: false, error: result.error || 'Slack API error' };
      }
    } catch (error) {
      console.error('[Slack] Post message error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to post message'
      };
    }
  }

  async createApprovalMessage(
    channel: string,
    approvalId: string,
    title: string,
    description: string
  ): Promise<{ success: boolean; error?: string }> {
    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${title}*\n${description}`
        }
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '✅ Approve'
            },
            style: 'primary',
            action_id: 'approve',
            value: approvalId
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '❌ Deny'
            },
            style: 'danger',
            action_id: 'deny',
            value: approvalId
          }
        ]
      }
    ];

    return this.postMessage(channel, title, blocks);
  }

  async getChannels(): Promise<{ success: boolean; channels?: any[]; error?: string }> {
    try {
      const result = await this.client.conversations.list({
        types: 'public_channel,private_channel'
      });

      if (result.ok) {
        return { success: true, channels: result.channels };
      } else {
        return { success: false, error: result.error || 'Failed to fetch channels' };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch channels'
      };
    }
  }
}

/**
 * PagerDuty Integration Implementation
 */
export class PagerDutyIntegration {
  private baseUrl: string;
  private headers: { [key: string]: string };

  constructor(private integration: PagerDutyIntegrationConfig) {
    this.baseUrl = `https://${integration.config.subdomain}.pagerduty.com/api/v1`;
    this.headers = {
      'Authorization': `Token token=${integration.config.apiToken}`,
      'Content-Type': 'application/json'
    };
  }

  async getIncidents(status: string = 'open'): Promise<{ success: boolean; incidents?: any[]; error?: string }> {
    try {
      const url = `${this.baseUrl}/incidents?status=${status}`;
      const response = await fetch(url, {
        headers: this.headers
      });

      if (response.ok) {
        const data = await response.json() as any;

        // Update last used timestamp
        this.integration.lastUsed = new Date().toISOString();
        integrations.set(this.integration.id, this.integration);

        console.log(`[PagerDuty] Fetched ${data.incidents?.length || 0} incidents`);
        return { success: true, incidents: data.incidents || [] };
      } else {
        return { success: false, error: `PagerDuty API error: ${response.status}` };
      }
    } catch (error) {
      console.error('[PagerDuty] Get incidents error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch incidents'
      };
    }
  }

  async acknowledgeIncident(incidentId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const url = `${this.baseUrl}/incidents/${incidentId}/acknowledge`;
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          ...this.headers,
          'From': this.integration.config.userEmail
        },
        body: JSON.stringify({
          requester_id: this.integration.config.userEmail
        })
      });

      if (response.ok) {
        console.log(`[PagerDuty] Incident ${incidentId} acknowledged`);
        return { success: true };
      } else {
        return { success: false, error: `PagerDuty API error: ${response.status}` };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to acknowledge incident'
      };
    }
  }

  async createIncident(
    title: string,
    description: string,
    serviceId: string,
    urgency: 'high' | 'low' = 'high'
  ): Promise<{ success: boolean; incident?: any; error?: string }> {
    try {
      const url = `${this.baseUrl}/incidents`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          ...this.headers,
          'From': this.integration.config.userEmail
        },
        body: JSON.stringify({
          incident: {
            type: 'incident',
            title,
            service: {
              id: serviceId,
              type: 'service_reference'
            },
            urgency,
            body: {
              type: 'incident_body',
              details: description
            }
          }
        })
      });

      if (response.ok) {
        const data = await response.json() as any;
        console.log(`[PagerDuty] Incident created: ${data.incident?.id}`);
        return { success: true, incident: data.incident };
      } else {
        return { success: false, error: `PagerDuty API error: ${response.status}` };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create incident'
      };
    }
  }
}

/**
 * Generic Webhook Handler
 */
export class WebhookHandler {
  constructor(private integration: WebhookIntegrationConfig) {}

  async sendWebhook(event: string, payload: any): Promise<{ success: boolean; error?: string }> {
    try {
      // Check if this event should be sent
      if (this.integration.config.events.length > 0 && !this.integration.config.events.includes(event)) {
        return { success: true }; // Ignored, not an error
      }

      const headers: { [key: string]: string } = { ...this.integration.config.headers };

      // Add signature if secret is configured
      if (this.integration.config.secret) {
        const signature = this.generateSignature(JSON.stringify(payload), this.integration.config.secret);
        headers['X-Hub-Signature-256'] = `sha256=${signature}`;
      }

      headers['Content-Type'] = 'application/json';
      headers['User-Agent'] = 'OpenClaw-Console/1.0';

      const response = await fetch(this.integration.config.url, {
        method: this.integration.config.method,
        headers,
        body: JSON.stringify({
          event,
          payload,
          timestamp: new Date().toISOString(),
          source: 'openclaw_console'
        })
      });

      if (response.ok) {
        // Update last used timestamp
        this.integration.lastUsed = new Date().toISOString();
        integrations.set(this.integration.id, this.integration);

        console.log(`[Webhook] Event ${event} sent to ${this.integration.config.url}`);
        return { success: true };
      } else {
        return { success: false, error: `Webhook failed: ${response.status}` };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Webhook request failed'
      };
    }
  }

  private generateSignature(payload: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  static verifySignature(payload: string, signature: string, secret: string): boolean {
    try {
      const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      const providedSignature = signature.replace('sha256=', '');

      // Ensure both signatures have the same length before comparison
      if (expectedSignature.length !== providedSignature.length) {
        return false;
      }

      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'hex'),
        Buffer.from(providedSignature, 'hex')
      );
    } catch {
      // Return false for any errors (invalid hex, etc.)
      return false;
    }
  }
}

/**
 * Integration configuration validators
 */
async function validateSlackConfig(integration: SlackIntegrationConfig): Promise<{ valid: boolean; error?: string }> {
  if (!integration.config.accessToken) {
    return { valid: false, error: 'Slack access token is required' };
  }

  // Test the token by calling the Slack API
  try {
    const client = new SlackWebClient(integration.config.accessToken);
    const result = await client.auth.test();

    if (result.ok) {
      // Update integration with workspace info
      integration.config.workspaceId = result.team_id as string;
      integration.config.workspaceName = result.team as string;
      integration.config.botUserId = result.user_id as string;
      return { valid: true };
    } else {
      return { valid: false, error: result.error || 'Invalid Slack token' };
    }
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Slack validation failed'
    };
  }
}

async function validatePagerDutyConfig(integration: PagerDutyIntegrationConfig): Promise<{ valid: boolean; error?: string }> {
  if (!integration.config.apiToken || !integration.config.subdomain) {
    return { valid: false, error: 'PagerDuty API token and subdomain are required' };
  }

  // Test the API token
  try {
    const url = `https://${integration.config.subdomain}.pagerduty.com/api/v1/users/me`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Token token=${integration.config.apiToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      return { valid: true };
    } else {
      return { valid: false, error: `PagerDuty API error: ${response.status}` };
    }
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'PagerDuty validation failed'
    };
  }
}

async function validateWebhookConfig(integration: WebhookIntegrationConfig): Promise<{ valid: boolean; error?: string }> {
  if (!integration.config.url) {
    return { valid: false, error: 'Webhook URL is required' };
  }

  try {
    const url = new URL(integration.config.url);

    // Only allow HTTP and HTTPS protocols for webhooks
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { valid: false, error: 'Only HTTP and HTTPS protocols are allowed for webhooks' };
    }

    // Reject empty or very short URLs
    if (integration.config.url.length < 10) {
      return { valid: false, error: 'Webhook URL is too short' };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid webhook URL' };
  }
}

/**
 * Create Express router with DevOps integration endpoints
 */
export function createIntegrationsRouter(): Router {
  const router = Router();

  // Get available integrations
  router.get('/available', (_req: Request, res: Response) => {
    try {
      const integrations = getAvailableIntegrations();
      res.json({ success: true, integrations });
      return;
    } catch (error) {
      console.error('[Integrations] Available integrations endpoint error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
      return;
    }
  });

  // Get user integrations
  router.get('/user/:userId', (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const userIdString = String(userId);
      const integrations = getUserIntegrations(userIdString);

      res.json({ success: true, integrations });
      return;
    } catch (error) {
      console.error('[Integrations] User integrations endpoint error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
      return;
    }
  });

  // Slack OAuth initiation
  router.get('/slack/auth', (req: Request, res: Response) => {
    try {
      const { userId } = req.query;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'Missing userId parameter'
        });
      }

      if (!SLACK_CLIENT_ID) {
        return res.status(500).json({
          success: false,
          error: 'Slack OAuth not configured'
        });
      }

      const scopes = 'chat:write,chat:write.public,channels:read,commands';
      const state = Buffer.from(JSON.stringify({ userId })).toString('base64');

      const authUrl = `https://slack.com/oauth/v2/authorize?client_id=${SLACK_CLIENT_ID}&scope=${scopes}&redirect_uri=${encodeURIComponent(SLACK_REDIRECT_URI)}&state=${state}`;

      res.json({ success: true, authUrl });
      return;
    } catch (error) {
      console.error('[Integrations] Slack auth endpoint error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
      return;
    }
  });

  // PagerDuty incidents
  router.get('/pagerduty/incidents', async (req: Request, res: Response) => {
    try {
      const { userId } = req.query;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'Missing userId parameter'
        });
      }

      const userIdString = String(userId);
      const userInts = getUserIntegrations(userIdString);
      const pagerDutyInt = userInts.find(int => int.type === 'pagerduty') as PagerDutyIntegrationConfig;

      if (!pagerDutyInt) {
        return res.status(404).json({
          success: false,
          error: 'PagerDuty integration not found'
        });
      }

      const pd = new PagerDutyIntegration(pagerDutyInt);
      const result = await pd.getIncidents();

      if (result.success) {
        res.json({ success: true, incidents: result.incidents });
      } else {
        res.status(500).json({ success: false, error: result.error });
      }
      return;
    } catch (error) {
      console.error('[Integrations] PagerDuty incidents endpoint error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
      return;
    }
  });

  // Create webhook integration
  router.post('/webhook/create', async (req: Request, res: Response) => {
    try {
      const { userId, name, url, method = 'POST', headers = {}, secret, events = [] } = req.body;

      if (!userId || !name || !url) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: userId, name, url'
        });
      }

      const result = await createIntegration(userId, 'webhook', name, {
        url,
        method,
        headers,
        secret,
        events
      });

      if (result.success) {
        res.json({ success: true, integration: result.integration });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
      return;
    } catch (error) {
      console.error('[Integrations] Webhook create endpoint error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
      return;
    }
  });

  // Test integration
  router.post('/test/:integrationId', async (req: Request, res: Response) => {
    try {
      const { integrationId } = req.params;
      const integrationIdString = String(integrationId);
      const integration = integrations.get(integrationIdString);

      if (!integration) {
        return res.status(404).json({
          success: false,
          error: 'Integration not found'
        });
      }

      let testResult: { success: boolean; error?: string };

      switch (integration.type) {
        case 'slack':
          const slack = new SlackIntegration(integration as SlackIntegrationConfig);
          testResult = await slack.postMessage('#general', 'OpenClaw Console test message 🚀');
          break;

        case 'webhook':
          const webhook = new WebhookHandler(integration as WebhookIntegrationConfig);
          testResult = await webhook.sendWebhook('test', { message: 'OpenClaw Console test' });
          break;

        default:
          testResult = { success: false, error: 'Integration type not supported for testing' };
      }

      if (testResult.success) {
        res.json({ success: true, message: 'Integration test successful' });
      } else {
        res.status(500).json({ success: false, error: testResult.error });
      }
      return;
    } catch (error) {
      console.error('[Integrations] Test integration endpoint error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
      return;
    }
  });

  return router;
}

// Integration classes are already exported above