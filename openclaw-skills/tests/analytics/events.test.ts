import { afterEach, describe, expect, it, jest } from '@jest/globals';
import {
  trackConversionEvent,
  trackRevenue,
  identifyUser,
  getConversionAnalytics,
  getABTestAssignment,
  getAnalyticsProviderStatus
} from '../../src/analytics/events.js';

describe('Analytics Events', () => {
  describe('trackConversionEvent', () => {
    it('should track app install event successfully', async () => {
      const result = await trackConversionEvent('app_install', 'test-user-1', {
        source: 'app_store',
        version: '1.0.0'
      });

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should track subscription started event with properties', async () => {
      const result = await trackConversionEvent('subscription_started', 'test-user-2', {
        product_id: 'pro_monthly',
        revenue: 15,
        currency: 'USD'
      }, {
        user_tier: 'pro_monthly',
        device_type: 'ios'
      });

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should track first approval event', async () => {
      const result = await trackConversionEvent('first_approval', 'test-user-3', {
        action_type: 'deployment',
        agent_id: 'deploy-bot'
      });

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should track approval completed as an activation event', async () => {
      const result = await trackConversionEvent('approval_completed', 'test-user-approval-completed', {
        action_type: 'shell_command',
        agent_id: 'approval-gate'
      });

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('trackRevenue', () => {
    it('should track monthly subscription revenue', async () => {
      const result = await trackRevenue(
        'test-user-revenue-1',
        'pro_monthly',
        15,
        'USD',
        'txn-123-monthly',
        'monthly',
        true
      );

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should track yearly subscription revenue with trial', async () => {
      const result = await trackRevenue(
        'test-user-revenue-2',
        'pro_yearly',
        144,
        'USD',
        'txn-456-yearly',
        'yearly',
        false,
        7
      );

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('identifyUser', () => {
    it('should identify user with basic properties', async () => {
      const result = await identifyUser('test-user-identify-1', {
        user_tier: 'free',
        install_source: 'app_store',
        device_type: 'ios',
        email: 'test@example.com'
      });

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should identify user with signup date and generate cohort', async () => {
      const signupDate = '2026-03-06T12:00:00Z';
      const result = await identifyUser('test-user-identify-2', {
        user_tier: 'pro_monthly',
        install_source: 'google_play',
        device_type: 'android',
        signup_date: signupDate
      });

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('getConversionAnalytics', () => {
    it('should return conversion analytics structure', () => {
      const analytics = getConversionAnalytics();

      expect(analytics).toHaveProperty('totalUsers');
      expect(analytics).toHaveProperty('conversionRates');
      expect(analytics).toHaveProperty('revenueMetrics');

      expect(analytics.conversionRates).toHaveProperty('install_to_signup');
      expect(analytics.conversionRates).toHaveProperty('signup_to_activation');
      expect(analytics.conversionRates).toHaveProperty('activation_to_subscription');
      expect(analytics.conversionRates).toHaveProperty('overall');

      expect(analytics.revenueMetrics).toHaveProperty('totalRevenue');
      expect(analytics.revenueMetrics).toHaveProperty('averageRevenuePerUser');
      expect(analytics.revenueMetrics).toHaveProperty('monthlyRecurringRevenue');

      expect(typeof analytics.totalUsers).toBe('number');
      expect(typeof analytics.conversionRates.overall).toBe('number');
      expect(typeof analytics.revenueMetrics.totalRevenue).toBe('number');
    });

    it('should return meaningful metrics after tracking events', async () => {
      // Track some events to generate data
      await trackConversionEvent('app_install', 'analytics-user-1');
      await trackConversionEvent('account_created', 'analytics-user-1');
      await trackConversionEvent('first_approval', 'analytics-user-1');
      await trackRevenue('analytics-user-1', 'pro_monthly', 15, 'USD', 'txn-analytics-1', 'monthly', true);

      const analytics = getConversionAnalytics();
      expect(analytics.totalUsers).toBeGreaterThan(0);
      expect(analytics.revenueMetrics.totalRevenue).toBeGreaterThan(0);
    });
  });

  describe('getABTestAssignment', () => {
    it('should return consistent assignment for same user and test', () => {
      const assignment1 = getABTestAssignment('consistent-user', 'pricing_tiers_v1');
      const assignment2 = getABTestAssignment('consistent-user', 'pricing_tiers_v1');

      expect(assignment1.variant).toBe(assignment2.variant);
      expect(assignment1.properties).toEqual(assignment2.properties);
    });

    it('should return different assignments for different users', () => {
      const assignment1 = getABTestAssignment('user-a', 'pricing_tiers_v1');
      const assignment2 = getABTestAssignment('user-b', 'pricing_tiers_v1');

      // Due to hashing, these might be different (not guaranteed, but likely)
      expect(assignment1).toHaveProperty('variant');
      expect(assignment1).toHaveProperty('properties');
      expect(assignment2).toHaveProperty('variant');
      expect(assignment2).toHaveProperty('properties');
    });

    it('should return control variant for unknown test', () => {
      const assignment = getABTestAssignment('test-user', 'unknown_test');

      expect(assignment.variant).toBe('control');
      expect(assignment.properties).toEqual({});
    });

    it('should return valid variant for onboarding test', () => {
      const assignment = getABTestAssignment('onboarding-user', 'onboarding_flow_v2');

      expect(['control', 'simplified', 'gamified']).toContain(assignment.variant);
      expect(assignment.properties).toHaveProperty('flow_type');
      expect(assignment.properties).toHaveProperty('steps');
    });
  });

  describe('PostHog integration', () => {
    const originalEnv = { ...process.env };
    const originalFetch = global.fetch;

    afterEach(() => {
      process.env = { ...originalEnv };
      global.fetch = originalFetch;
    });

    it('should report PostHog disabled when no project API key is configured', () => {
      delete process.env.POSTHOG_PROJECT_API_KEY;
      delete process.env.POSTHOG_PROJECT_TOKEN;
      delete process.env.POSTHOG_API_KEY;

      const status = getAnalyticsProviderStatus();

      expect(status.posthog.enabled).toBe(false);
      expect(status.posthog.host).toBe('https://us.i.posthog.com');
      expect(status.posthog.projectApiKeyConfigured).toBe(false);
    });

    it('should treat legacy POSTHOG_API_KEY as a capture project key', () => {
      delete process.env.POSTHOG_PROJECT_API_KEY;
      delete process.env.POSTHOG_PROJECT_TOKEN;
      process.env.POSTHOG_API_KEY = 'phc_legacy_project_key';

      const status = getAnalyticsProviderStatus();

      expect(status.posthog.enabled).toBe(true);
      expect(status.posthog.projectApiKeyConfigured).toBe(true);
    });

    it('should send conversion events to PostHog capture API when configured', async () => {
      process.env.POSTHOG_PROJECT_API_KEY = 'phc_test_project_key';
      process.env.POSTHOG_HOST = 'https://eu.i.posthog.com';

      const calls: Array<{ url: string; body: unknown }> = [];
      global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({
          url: String(url),
          body: init?.body ? JSON.parse(String(init.body)) : undefined
        });
        return new Response('{}', { status: 200 });
      }) as typeof fetch;

      const result = await trackConversionEvent('approval_completed', 'posthog-user-1', {
        action_type: 'deployment'
      }, {
        user_tier: 'pro_monthly',
        email: 'private@example.com'
      });

      expect(result.success).toBe(true);
      expect(calls).toHaveLength(1);
      expect(calls[0]?.url).toBe('https://eu.i.posthog.com/capture/');
      expect(calls[0]?.body).toMatchObject({
        api_key: 'phc_test_project_key',
        event: 'approval_completed',
        distinct_id: 'posthog-user-1',
        properties: {
          action_type: 'deployment',
          platform: 'openclaw_console',
          version: '1.0.0',
          $set: {
            user_tier: 'pro_monthly'
          }
        }
      });
      expect(JSON.stringify(calls[0]?.body)).not.toContain('private@example.com');
    });

    it('should not fail product behavior when PostHog capture is unavailable', async () => {
      process.env.POSTHOG_PROJECT_API_KEY = 'phc_test_project_key';
      global.fetch = jest.fn(async () => new Response('unavailable', { status: 503 })) as typeof fetch;

      const result = await trackConversionEvent('approval_completed', 'posthog-outage-user');

      expect(result.success).toBe(true);
    });

    it('should send identify events with sanitized person properties', async () => {
      process.env.POSTHOG_PROJECT_TOKEN = 'phc_test_project_token';

      const calls: Array<{ body: unknown }> = [];
      global.fetch = jest.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        calls.push({
          body: init?.body ? JSON.parse(String(init.body)) : undefined
        });
        return new Response('{}', { status: 200 });
      }) as typeof fetch;

      const result = await identifyUser('posthog-identify-user', {
        user_tier: 'free',
        install_source: 'app_store',
        device_type: 'ios',
        email: 'private@example.com',
        signup_date: '2026-03-06T12:00:00Z'
      });

      expect(result.success).toBe(true);
      expect(calls[0]?.body).toMatchObject({
        event: '$identify',
        distinct_id: 'posthog-identify-user',
        properties: {
          $set: {
            user_tier: 'free',
            install_source: 'app_store',
            device_type: 'ios',
            signup_date: '2026-03-06T12:00:00Z',
            cohort_week: '2026-W10'
          }
        }
      });
      expect(JSON.stringify(calls[0]?.body)).not.toContain('private@example.com');
    });
  });
});
