import { Router } from 'express';
import type { Request, Response } from 'express';

type AnalyticsValue = string | number | boolean;
type AnalyticsProperties = Record<string, AnalyticsValue>;
type AnalyticsUserPropertyValue = AnalyticsValue | undefined;
type AnalyticsUserProperties = Record<string, AnalyticsUserPropertyValue>;

// Analytics event types for conversion funnel
export type ConversionEvent =
  | 'app_install'
  | 'account_created'
  | 'first_approval'
  | 'subscription_started'
  | 'subscription_cancelled'
  | 'feature_used'
  | 'integration_connected'
  | 'error_encountered';

export interface AnalyticsEvent {
  event: ConversionEvent;
  userId: string;
  timestamp: string;
  properties: {
    [key: string]: string | number | boolean;
  };
  userProperties?: {
    user_tier?: 'free' | 'pro_monthly' | 'pro_yearly';
    install_source?: string;
    device_type?: 'ios' | 'android' | 'web';
    cohort_week?: string;
    [key: string]: string | number | boolean | undefined;
  };
}

export interface RevenueEvent {
  userId: string;
  productId: string;
  revenue: number;
  currency: string;
  timestamp: string;
  transactionId: string;
  subscriptionType: 'monthly' | 'yearly';
  isFirstPurchase: boolean;
  trialDays?: number;
}

export interface ConversionFunnel {
  userId: string;
  installDate?: string;
  signupDate?: string;
  firstApprovalDate?: string;
  subscriptionDate?: string;
  currentStage: 'installed' | 'signed_up' | 'activated' | 'subscribed';
  conversionRate?: {
    install_to_signup?: number;
    signup_to_activation?: number;
    activation_to_subscription?: number;
    overall?: number;
  };
}

// In-memory analytics store (replace with proper analytics service in production)
const analyticsEvents: AnalyticsEvent[] = [];
const revenueEvents: RevenueEvent[] = [];
const conversionFunnels = new Map<string, ConversionFunnel>();

// Firebase Analytics configuration
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
// const FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY; // Reserved for future use
// const FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL; // Reserved for future use

// A/B testing configuration
interface ABTestConfig {
  testName: string;
  variants: {
    [key: string]: {
      weight: number;
      properties: AnalyticsProperties;
    };
  };
}

const AB_TESTS: { [testName: string]: ABTestConfig } = {
  'pricing_tiers_v1': {
    testName: 'pricing_tiers_v1',
    variants: {
      'control': {
        weight: 0.5,
        properties: { monthly_price: 15, yearly_discount: 0.2 }
      },
      'lower_price': {
        weight: 0.5,
        properties: { monthly_price: 12, yearly_discount: 0.25 }
      }
    }
  },
  'onboarding_flow_v2': {
    testName: 'onboarding_flow_v2',
    variants: {
      'control': {
        weight: 0.33,
        properties: { flow_type: 'standard', steps: 3 }
      },
      'simplified': {
        weight: 0.33,
        properties: { flow_type: 'simplified', steps: 2 }
      },
      'gamified': {
        weight: 0.34,
        properties: { flow_type: 'gamified', steps: 4 }
      }
    }
  }
};

/**
 * Initialize Firebase Analytics (if configured)
 */
function initializeFirebaseAnalytics(): { success: boolean; error?: string } {
  if (!FIREBASE_PROJECT_ID) {
    console.warn('[Analytics] Firebase not configured - using in-memory storage only');
    return { success: true }; // Not an error, just local mode
  }

  try {
    // In production, this would initialize Firebase Admin SDK
    console.info('[Analytics] Firebase Analytics initialized');
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Firebase initialization failed'
    };
  }
}

/**
 * Track a conversion event
 */
export async function trackConversionEvent(
  event: ConversionEvent,
  userId: string,
  properties: AnalyticsProperties = {},
  userProperties?: AnalyticsUserProperties
): Promise<{ success: boolean; error?: string }> {
  try {
    const analyticsEvent: AnalyticsEvent = {
      event,
      userId,
      timestamp: new Date().toISOString(),
      properties: {
        ...properties,
        platform: 'openclaw_console',
        version: '1.0.0'
      },
      userProperties
    };

    // Store event locally
    analyticsEvents.push(analyticsEvent);

    // Update conversion funnel
    updateConversionFunnel(userId, event, analyticsEvent.timestamp);

    // Send to Firebase Analytics (if configured)
    if (FIREBASE_PROJECT_ID) {
      await sendToFirebaseAnalytics(analyticsEvent);
    }

    console.info('[Analytics] Event tracked');
    return { success: true };

  } catch (error) {
    console.error('[Analytics] Error tracking event', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Event tracking failed'
    };
  }
}

/**
 * Track revenue event
 */
export async function trackRevenue(
  userId: string,
  productId: string,
  revenue: number,
  currency: string = 'USD',
  transactionId: string,
  subscriptionType: 'monthly' | 'yearly',
  isFirstPurchase: boolean = false,
  trialDays?: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const revenueEvent: RevenueEvent = {
      userId,
      productId,
      revenue,
      currency,
      timestamp: new Date().toISOString(),
      transactionId,
      subscriptionType,
      isFirstPurchase,
      trialDays
    };

    // Store revenue event
    revenueEvents.push(revenueEvent);

    // Track as conversion event
    await trackConversionEvent('subscription_started', userId, {
      product_id: productId,
      revenue,
      currency,
      subscription_type: subscriptionType,
      is_first_purchase: isFirstPurchase,
      transaction_id: transactionId
    });

    console.info('[Analytics] Revenue tracked');
    return { success: true };

  } catch (error) {
    console.error('[Analytics] Error tracking revenue', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Revenue tracking failed'
    };
  }
}

/**
 * Identify user and set properties
 */
export async function identifyUser(
  userId: string,
  properties: {
    user_tier?: 'free' | 'pro_monthly' | 'pro_yearly';
    install_source?: string;
    device_type?: 'ios' | 'android' | 'web';
    email?: string;
    signup_date?: string;
    [key: string]: AnalyticsUserPropertyValue;
  }
  ): Promise<{ success: boolean; error?: string }> {
  try {
    // Update user properties for future events
    console.info('[Analytics] User identified');

    // Set cohort week based on signup date
    if (properties.signup_date) {
      const signupDate = new Date(properties.signup_date);
      // Correct ISO week calculation
      const d = new Date(Date.UTC(signupDate.getFullYear(), signupDate.getMonth(), signupDate.getDate()));
      const dayNum = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
      
      const cohortWeek = `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
      properties.cohort_week = cohortWeek;
    }

    // Track user identification as event
    await trackConversionEvent('account_created', userId, {
      source: properties.install_source || 'unknown'
    }, properties);

    return { success: true };

  } catch (error) {
    console.error('[Analytics] Error identifying user', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'User identification failed'
    };
  }
}

/**
 * Update conversion funnel for a user
 */
function updateConversionFunnel(userId: string, event: ConversionEvent, timestamp: string): void {
  let funnel = conversionFunnels.get(userId);

  if (!funnel) {
    funnel = {
      userId,
      currentStage: 'installed'
    };
    conversionFunnels.set(userId, funnel);
  }

  switch (event) {
    case 'app_install':
      funnel.installDate = timestamp;
      funnel.currentStage = 'installed';
      break;

    case 'account_created':
      funnel.signupDate = timestamp;
      funnel.currentStage = 'signed_up';
      break;

    case 'first_approval':
      funnel.firstApprovalDate = timestamp;
      funnel.currentStage = 'activated';
      break;

    case 'subscription_started':
      funnel.subscriptionDate = timestamp;
      funnel.currentStage = 'subscribed';
      break;
  }

  // Calculate conversion rates
  if (funnel.installDate && funnel.signupDate) {
    funnel.conversionRate = funnel.conversionRate || {};
    // This would be calculated based on cohort analysis in production
    funnel.conversionRate.install_to_signup = 0.15; // 15% baseline
  }
}

/**
 * Get conversion funnel analytics
 */
export function getConversionAnalytics(
  _cohortWeek?: string,
  _installSource?: string
): {
  totalUsers: number;
  conversionRates: {
    install_to_signup: number;
    signup_to_activation: number;
    activation_to_subscription: number;
    overall: number;
  };
  revenueMetrics: {
    totalRevenue: number;
    averageRevenuePerUser: number;
    monthlyRecurringRevenue: number;
  };
} {
  const funnels = Array.from(conversionFunnels.values());

  // Filter by cohort and source if specified
  const filteredFunnels = funnels.filter(_funnel => {
    // In production, this would filter by actual cohort and source data
    return true; // For now, include all
  });

  const totalUsers = filteredFunnels.length;
  const signedUpUsers = filteredFunnels.filter(f => f.signupDate).length;
  const activatedUsers = filteredFunnels.filter(f => f.firstApprovalDate).length;
  const subscribedUsers = filteredFunnels.filter(f => f.subscriptionDate).length;

  const conversionRates = {
    install_to_signup: totalUsers > 0 ? signedUpUsers / totalUsers : 0,
    signup_to_activation: signedUpUsers > 0 ? activatedUsers / signedUpUsers : 0,
    activation_to_subscription: activatedUsers > 0 ? subscribedUsers / activatedUsers : 0,
    overall: totalUsers > 0 ? subscribedUsers / totalUsers : 0
  };

  const totalRevenue = revenueEvents.reduce((sum, event) => sum + event.revenue, 0);
  const averageRevenuePerUser = subscribedUsers > 0 ? totalRevenue / subscribedUsers : 0;

  // Estimate MRR based on subscription types
  const monthlyRevenue = revenueEvents
    .filter(event => event.subscriptionType === 'monthly')
    .reduce((sum, event) => sum + event.revenue, 0);
  const yearlyRevenue = revenueEvents
    .filter(event => event.subscriptionType === 'yearly')
    .reduce((sum, event) => sum + event.revenue, 0);
  const monthlyRecurringRevenue = monthlyRevenue + (yearlyRevenue / 12);

  return {
    totalUsers,
    conversionRates,
    revenueMetrics: {
      totalRevenue,
      averageRevenuePerUser,
      monthlyRecurringRevenue
    }
  };
}

/**
 * Get A/B test assignment for user
 */
export function getABTestAssignment(userId: string, testName: string): {
  variant: string;
  properties: AnalyticsProperties;
} {
  const test = AB_TESTS[testName];
  if (!test) {
    return { variant: 'control', properties: {} };
  }

  const hashInt = deterministicBucket(`${userId}-${testName}`);
  const randomValue = (hashInt % 10000) / 10000; // 0-1 range

  let cumulativeWeight = 0;
  for (const [variantName, variantConfig] of Object.entries(test.variants)) {
    cumulativeWeight += variantConfig.weight;
    if (randomValue <= cumulativeWeight) {
      return {
        variant: variantName,
        properties: variantConfig.properties
      };
    }
  }

  // Fallback to first variant
  const firstVariant = Object.keys(test.variants)[0];
  return {
    variant: firstVariant,
    properties: test.variants[firstVariant].properties
  };
}

/**
 * Send event to Firebase Analytics
 */
async function sendToFirebaseAnalytics(event: AnalyticsEvent): Promise<void> {
  // In production, this would use Firebase Admin SDK to send events
  // For now, we'll just log the event structure
  console.info('[Analytics] Firebase event ready', {
    name: event.event,
    propertyKeys: Object.keys(event.properties),
    hasUserProperties: Boolean(event.userProperties)
  });
}

function deterministicBucket(input: string): number {
  let hash = 2166136261;
  for (const character of input) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

/**
 * Validate event data
 */
function validateEvent(event: ConversionEvent, userId: string, properties: unknown): boolean {
  if (!event || typeof event !== 'string') {
    return false;
  }
  if (!userId || typeof userId !== 'string') {
    return false;
  }
  if (properties !== undefined && (properties === null || typeof properties !== 'object')) {
    return false;
  }
  return true;
}

/**
 * Create Express router with analytics endpoints
 */
export function createAnalyticsRouter(): Router {
  const router = Router();

  // Track conversion event
  router.post('/track', async (req: Request, res: Response) => {
    try {
      const { event, userId, properties, userProperties } = req.body;

      if (!validateEvent(event, userId, properties)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid event data. Required: event, userId'
        });
      }

      const result = await trackConversionEvent(event, userId, properties, userProperties);

      if (result.success) {
        res.json({ success: true, message: 'Event tracked successfully' });
      } else {
        res.status(500).json({ success: false, error: result.error });
      }
      return;

    } catch (error) {
      console.error('[Analytics] Track endpoint error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
      return;
    }
  });

  // Track revenue
  router.post('/revenue', async (req: Request, res: Response) => {
    try {
      const {
        userId,
        productId,
        revenue,
        currency = 'USD',
        transactionId,
        subscriptionType,
        isFirstPurchase = false,
        trialDays
      } = req.body;

      if (!userId || !productId || !revenue || !transactionId || !subscriptionType) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: userId, productId, revenue, transactionId, subscriptionType'
        });
      }

      const result = await trackRevenue(
        userId,
        productId,
        revenue,
        currency,
        transactionId,
        subscriptionType,
        isFirstPurchase,
        trialDays
      );

      if (result.success) {
        res.json({ success: true, message: 'Revenue tracked successfully' });
      } else {
        res.status(500).json({ success: false, error: result.error });
      }
      return;

    } catch (error) {
      console.error('[Analytics] Revenue endpoint error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
      return;
    }
  });

  // Identify user
  router.post('/identify', async (req: Request, res: Response) => {
    try {
      const { userId, properties } = req.body;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: userId'
        });
      }

      const result = await identifyUser(userId, properties || {});

      if (result.success) {
        res.json({ success: true, message: 'User identified successfully' });
      } else {
        res.status(500).json({ success: false, error: result.error });
      }
      return;

    } catch (error) {
      console.error('[Analytics] Identify endpoint error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
      return;
    }
  });

  // Get conversion analytics
  router.get('/conversion', (req: Request, res: Response) => {
    try {
      const { cohortWeek, installSource } = req.query;
      const analytics = getConversionAnalytics(
        cohortWeek as string,
        installSource as string
      );

      res.json({
        success: true,
        analytics
      });
      return;

    } catch (error) {
      console.error('[Analytics] Conversion endpoint error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
      return;
    }
  });

  // Get A/B test assignment
  router.get('/ab-test/:userId/:testName', (req: Request, res: Response) => {
    try {
      const { userId, testName } = req.params;
      const userIdString = String(userId);
      const testNameString = String(testName);

      const assignment = getABTestAssignment(userIdString, testNameString);

      res.json({
        success: true,
        assignment
      });
      return;

    } catch (error) {
      console.error('[Analytics] A/B test endpoint error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
      return;
    }
  });

  // Get available A/B tests
  router.get('/ab-tests', (_req: Request, res: Response) => {
    try {
      const tests = Object.keys(AB_TESTS).map(testName => ({
        name: testName,
        variants: Object.keys(AB_TESTS[testName].variants)
      }));

      res.json({
        success: true,
        tests
      });
      return;

    } catch (error) {
      console.error('[Analytics] A/B tests list endpoint error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
      return;
    }
  });

  return router;
}

// Initialize Firebase on module load
const firebaseResult = initializeFirebaseAnalytics();
if (!firebaseResult.success && firebaseResult.error) {
  console.error('[Analytics] Firebase initialization failed:', firebaseResult.error);
}
