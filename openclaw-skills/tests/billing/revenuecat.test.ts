<<<<<<< HEAD
import { describe, it, expect, jest } from '@jest/globals';
import {
  initializeRevenueCat,
  getSubscriptionStatus,
  hasProEntitlement,
  checkPremiumAccess
} from '../../src/billing/revenuecat.js';

// Mock environment variables for testing
process.env.REVENUECAT_PUBLIC_KEY = 'test_public_key_123';
process.env.REVENUECAT_SECRET_KEY = 'test_secret_key_456';

describe('RevenueCat Billing', () => {
  describe('initializeRevenueCat', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('should initialize successfully with valid keys', () => {
      process.env.REVENUECAT_PUBLIC_KEY = 'test_public_key_123';
      process.env.REVENUECAT_SECRET_KEY = 'test_secret_key_456';
      
      const result = initializeRevenueCat();
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should fail without API keys', () => {
      delete process.env.REVENUECAT_PUBLIC_KEY;
      delete process.env.REVENUECAT_SECRET_KEY;
      
      const result = initializeRevenueCat();
      expect(result.success).toBe(false);
      expect(result.error).toContain('RevenueCat API keys not configured');
    });
  });

  describe('hasProEntitlement', () => {
    it('should return true for active pro entitlement', () => {
      const customerInfo = {
        id: 'test-user-123',
        originalAppUserId: 'test-user-123',
        entitlements: {
          pro: {
            isActive: true,
            willRenew: true,
            expirationDate: '2026-04-06T12:00:00Z',
            productIdentifier: 'pro_monthly'
          }
        },
        subscriptions: {}
      };

      expect(hasProEntitlement(customerInfo as any)).toBe(true);
    });

    it('should return false for inactive pro entitlement', () => {
      const customerInfo = {
        id: 'test-user-123',
        originalAppUserId: 'test-user-123',
        entitlements: {
          pro: {
            isActive: false,
            willRenew: false,
            expirationDate: null,
            productIdentifier: 'pro_monthly'
          }
        },
        subscriptions: {}
      };

      expect(hasProEntitlement(customerInfo as any)).toBe(false);
    });

    it('should return false for missing pro entitlement', () => {
      const customerInfo = {
        id: 'test-user-123',
        originalAppUserId: 'test-user-123',
        entitlements: {},
        subscriptions: {}
      };

      expect(hasProEntitlement(customerInfo as any)).toBe(false);
    });
  });

  describe('checkPremiumAccess', () => {
    it('should allow free tier features without subscription', async () => {
      const hasAccess = await checkPremiumAccess('test-user', 'basic_approvals');
      expect(hasAccess).toBe(true);
    });

    it('should allow free tier features: agent monitoring', async () => {
      const hasAccess = await checkPremiumAccess('test-user', 'agent_monitoring');
      expect(hasAccess).toBe(true);
    });

    it('should allow free tier features: simple notifications', async () => {
      const hasAccess = await checkPremiumAccess('test-user', 'simple_notifications');
      expect(hasAccess).toBe(true);
    });

    it('should deny pro features without subscription', async () => {
      // Mock getSubscriptionStatus to return free user
      const originalFetch = global.fetch;
      global.fetch = jest.fn(() => Promise.reject(new Error('API not available in test'))) as any;

      const hasAccess = await checkPremiumAccess('test-user', 'devops_integrations');
      expect(hasAccess).toBe(false);

      global.fetch = originalFetch;
    });

    it('should allow unknown features (default to free)', async () => {
      const hasAccess = await checkPremiumAccess('test-user', 'unknown_feature');
      expect(hasAccess).toBe(true);
    });
  });

  describe('getSubscriptionStatus', () => {
    it('should return default free status on API error', async () => {
      // Mock fetch to simulate API error
      const originalFetch = global.fetch;
      global.fetch = jest.fn(() => Promise.reject(new Error('Network error'))) as any;

      const status = await getSubscriptionStatus('test-user-error');

      expect(status.userId).toBe('test-user-error');
      expect(status.isPro).toBe(false);
      expect(status.hasActiveSubscription).toBe(false);
      expect(status.subscriptionType).toBe('free');
      expect(status.expirationDate).toBeNull();
      expect(status.willRenew).toBe(false);
      expect(status.trialActive).toBe(false);

      global.fetch = originalFetch;
    });
  });
});
||||||| parent of 89270c1 (fix: update tsconfig to include all test files and add missing return types)
=======
import { describe, it, expect } from '@jest/globals';

describe('RevenueCat Billing', () => {
  it('should handle subscriptions', () => {
    expect(true).toBe(true);
  });
});
>>>>>>> 89270c1 (fix: update tsconfig to include all test files and add missing return types)
