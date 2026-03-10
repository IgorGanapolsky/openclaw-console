import { describe, it, expect, jest } from '@jest/globals';
import {
  initializeRevenueCat,
  getSubscriptionStatus,
  restorePurchases,
  hasProEntitlement,
  type CustomerInfo,
  checkPremiumAccess
} from '../../src/billing/revenuecat.js';

// Mock environment variables for testing
process.env.REVENUECAT_PUBLIC_KEY = 'test_public_key_123';
process.env.REVENUECAT_SECRET_KEY = 'test_secret_key_456';

describe('RevenueCat Billing', () => {
  function makeCustomerInfo(isActive: boolean): CustomerInfo {
    return {
      id: 'test-user-123',
      originalAppUserId: 'test-user-123',
      entitlements: {
        pro: {
          isActive,
          willRenew: isActive,
          expirationDate: isActive ? '2026-04-06T12:00:00Z' : null,
          productIdentifier: 'pro_monthly'
        }
      },
      subscriptions: {
        pro_monthly: {
          isActive,
          willRenew: isActive,
          expirationDate: isActive ? '2026-04-06T12:00:00Z' : null,
          productId: 'pro_monthly'
        }
      }
    };
  }

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

    it('should encode the subscriber userId in the RevenueCat API URL', async () => {
      const originalFetch = global.fetch;
      const fetchMock = jest.fn(async () => ({
        ok: true,
        json: async (): Promise<CustomerInfo> => makeCustomerInfo(true)
      })) as any;
      global.fetch = fetchMock;

      await getSubscriptionStatus('user/with spaces?');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.revenuecat.com/v1/subscribers/user%2Fwith%20spaces%3F',
        expect.any(Object)
      );

      global.fetch = originalFetch;
    });
  });

  describe('restorePurchases', () => {
    it('should refresh cached subscription status from restored customer info', async () => {
      const originalFetch = global.fetch;
      const cachedUserId = 'restore-cache-user';
      const fetchMock = jest.fn() as any;
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => makeCustomerInfo(false)
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => makeCustomerInfo(true)
        });
      global.fetch = fetchMock;

      const initialStatus = await getSubscriptionStatus(cachedUserId);
      expect(initialStatus.isPro).toBe(false);

      const restoreResult = await restorePurchases(cachedUserId);
      expect(restoreResult.success).toBe(true);

      const refreshedStatus = await getSubscriptionStatus(cachedUserId);
      expect(refreshedStatus.isPro).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      global.fetch = originalFetch;
    });
  });
});
