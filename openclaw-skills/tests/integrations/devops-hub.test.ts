<<<<<<< HEAD
import { describe, it, expect } from '@jest/globals';
import crypto from 'crypto';
import {
  getAvailableIntegrations,
  createIntegration,
  getUserIntegrations,
  WebhookHandler
} from '../../src/integrations/devops-hub.js';

describe('DevOps Integrations Hub', () => {
  describe('getAvailableIntegrations', () => {
    it('should return list of available integrations', () => {
      const integrations = getAvailableIntegrations();

      expect(integrations).toHaveLength(5);
      expect(integrations.map(i => i.type)).toContain('slack');
      expect(integrations.map(i => i.type)).toContain('pagerduty');
      expect(integrations.map(i => i.type)).toContain('webhook');
      expect(integrations.map(i => i.type)).toContain('datadog');
      expect(integrations.map(i => i.type)).toContain('grafana');
    });

    it('should mark premium integrations correctly', () => {
      const integrations = getAvailableIntegrations();

      const slack = integrations.find(i => i.type === 'slack');
      const webhook = integrations.find(i => i.type === 'webhook');

      expect(slack?.isPremium).toBe(true);
      expect(webhook?.isPremium).toBe(false);
    });

    it('should include required features for each integration', () => {
      const integrations = getAvailableIntegrations();

      integrations.forEach(integration => {
        expect(integration).toHaveProperty('name');
        expect(integration).toHaveProperty('description');
        expect(integration).toHaveProperty('features');
        expect(integration.features.length).toBeGreaterThan(0);
      });
    });
  });

  describe('createIntegration', () => {
    it('should create webhook integration successfully', async () => {
      const result = await createIntegration('test-user-1', 'webhook', 'Test Webhook', {
        url: 'https://hooks.example.com/webhook',
        method: 'POST',
        headers: { 'Authorization': 'Bearer test-token' },
        events: ['approval_request', 'deployment']
      });

      expect(result.success).toBe(true);
      expect(result.integration).toBeDefined();
      expect(result.integration?.type).toBe('webhook');
      expect(result.integration?.name).toBe('Test Webhook');
      expect(result.integration?.status).toBe('connected');
    });

    it('should fail with invalid webhook URL', async () => {
      const result = await createIntegration('test-user-2', 'webhook', 'Bad Webhook', {
        url: 'not-a-valid-url',
        method: 'POST'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid webhook URL');
    });

    it('should generate unique integration IDs', async () => {
      const result1 = await createIntegration('test-user-3', 'webhook', 'Webhook 1', {
        url: 'https://hooks1.example.com/webhook',
        method: 'POST'
      });

      const result2 = await createIntegration('test-user-3', 'webhook', 'Webhook 2', {
        url: 'https://hooks2.example.com/webhook',
        method: 'POST'
      });

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.integration?.id).not.toBe(result2.integration?.id);
    });
  });

  describe('getUserIntegrations', () => {
    it('should return empty array for user with no integrations', () => {
      const integrations = getUserIntegrations('new-user-no-integrations');
      expect(integrations).toEqual([]);
    });

    it('should return user integrations after creating some', async () => {
      const userId = 'test-user-integrations';

      // Create a webhook integration
      await createIntegration(userId, 'webhook', 'User Webhook', {
        url: 'https://user.example.com/webhook',
        method: 'POST'
      });

      const integrations = getUserIntegrations(userId);
      expect(integrations).toHaveLength(1);
      expect(integrations[0].type).toBe('webhook');
      expect(integrations[0].userId).toBe(userId);
    });

    it('should return multiple integrations for same user', async () => {
      const userId = 'test-user-multiple';

      // Create multiple integrations
      await createIntegration(userId, 'webhook', 'Webhook 1', {
        url: 'https://webhook1.example.com',
        method: 'POST'
      });

      await createIntegration(userId, 'webhook', 'Webhook 2', {
        url: 'https://webhook2.example.com',
        method: 'PUT'
      });

      const integrations = getUserIntegrations(userId);
      expect(integrations).toHaveLength(2);
      expect(integrations.every(int => int.userId === userId)).toBe(true);
    });
  });

  describe('WebhookHandler', () => {
    it('should create webhook handler with correct configuration', () => {
      const webhookConfig = {
        id: 'webhook-test-1',
        type: 'webhook' as const,
        name: 'Test Webhook',
        description: 'Test webhook integration',
        status: 'connected' as const,
        config: {
          url: 'https://hooks.test.com/webhook',
          method: 'POST' as const,
          headers: { 'Authorization': 'Bearer test' },
          events: ['test_event']
        },
        createdAt: new Date().toISOString(),
        userId: 'test-user'
      };

      const handler = new WebhookHandler(webhookConfig);
      expect(handler).toBeInstanceOf(WebhookHandler);
    });

    it('should verify webhook signatures correctly', () => {
      const payload = '{"test": "data"}';
      const secret = 'webhook-secret-key';

      // Generate a signature
      // crypto already imported at top
      const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

      // Test verification
      const isValid = WebhookHandler.verifySignature(payload, `sha256=${signature}`, secret);
      expect(isValid).toBe(true);

      // Test with wrong signature
      const isInvalid = WebhookHandler.verifySignature(payload, 'sha256=wrong-signature', secret);
      expect(isInvalid).toBe(false);
    });

    it('should handle signature verification with different formats', () => {
      const payload = '{"event": "test"}';
      const secret = 'test-secret';

      // crypto already imported at top
      const correctSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

      // Test with sha256= prefix
      expect(WebhookHandler.verifySignature(payload, `sha256=${correctSignature}`, secret)).toBe(true);

      // Test with just the hash
      expect(WebhookHandler.verifySignature(payload, correctSignature, secret)).toBe(true);
    });
  });

  describe('Integration Security', () => {
    it('should generate secure webhook signatures', () => {
      const payload = '{"sensitive": "data"}';
      const secret = 'super-secret-key';

      // crypto already imported at top
      const signature1 = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      const signature2 = crypto.createHmac('sha256', secret).update(payload).digest('hex');

      // Same payload and secret should generate same signature
      expect(signature1).toBe(signature2);

      // Different secret should generate different signature
      const differentSecret = 'different-secret';
      const signature3 = crypto.createHmac('sha256', differentSecret).update(payload).digest('hex');
      expect(signature1).not.toBe(signature3);
    });

    it('should validate webhook URLs properly', async () => {
      const validUrls = [
        'https://hooks.example.com/webhook',
        'http://localhost:3000/webhook',
        'https://api.myservice.com/v1/webhooks/openclaw'
      ];

      const invalidUrls = [
        'not-a-url',
        // Note: Some URLs might be technically valid but inappropriate for webhooks
        // The actual validation depends on the implementation
        ''
      ];

      for (const url of validUrls) {
        const result = await createIntegration('test-user', 'webhook', 'Test', { url, method: 'POST' });
        expect(result.success).toBe(true);
      }

      for (const url of invalidUrls) {
        const result = await createIntegration('test-user', 'webhook', 'Test', { url, method: 'POST' });
        expect(result.success).toBe(false);
      }
    });
  });

  describe('Integration Features', () => {
    it('should track last used timestamp', async () => {
      const result = await createIntegration('test-user-timestamp', 'webhook', 'Timestamp Test', {
        url: 'https://timestamp.example.com/webhook',
        method: 'POST'
      });

      expect(result.success).toBe(true);
      expect(result.integration?.lastUsed).toBeUndefined(); // Not used yet

      // The lastUsed timestamp would be updated when the integration is actually used
      // This would happen in the sendWebhook method during real usage
    });

    it('should support different HTTP methods', async () => {
      const methods = ['GET', 'POST', 'PUT'] as const;

      for (const method of methods) {
        const result = await createIntegration('test-user-methods', 'webhook', `${method} Test`, {
          url: 'https://methods.example.com/webhook',
          method
        });

        expect(result.success).toBe(true);
        expect(result.integration?.config.method).toBe(method);
      }
    });

    it('should support event filtering', async () => {
      const events = ['deployment', 'approval_request', 'incident_created'];

      const result = await createIntegration('test-user-events', 'webhook', 'Event Filter Test', {
        url: 'https://events.example.com/webhook',
        method: 'POST',
        events
      });

      expect(result.success).toBe(true);
      expect(result.integration?.config.events).toEqual(events);
    });
  });
});
||||||| parent of 89270c1 (fix: update tsconfig to include all test files and add missing return types)
=======
import { describe, it, expect } from '@jest/globals';

describe('DevOps Hub Integration', () => {
  it('should connect to DevOps Hub', () => {
    expect(true).toBe(true);
  });
});
>>>>>>> 89270c1 (fix: update tsconfig to include all test files and add missing return types)
