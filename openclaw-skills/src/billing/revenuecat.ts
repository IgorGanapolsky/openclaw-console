import express, { Router } from 'express';
import crypto from 'crypto';
import type { Request, RequestHandler, Response } from 'express';

// RevenueCat types
export interface CustomerInfo {
  id: string;
  originalAppUserId: string;
  entitlements: {
    [key: string]: {
      isActive: boolean;
      willRenew: boolean;
      expirationDate: string | null;
      productIdentifier: string;
    };
  };
  subscriptions: {
    [key: string]: {
      isActive: boolean;
      willRenew: boolean;
      expirationDate: string | null;
      productId: string;
    };
  };
}

export interface SubscriptionStatus {
  userId: string;
  isPro: boolean;
  hasActiveSubscription: boolean;
  subscriptionType: 'free' | 'pro_monthly' | 'pro_yearly';
  expirationDate: string | null;
  willRenew: boolean;
  trialActive: boolean;
}

export interface WebhookEvent {
  api_version: string;
  event: {
    id: string;
    type: 'INITIAL_PURCHASE' | 'RENEWAL' | 'CANCELLATION' | 'EXPIRATION' | 'BILLING_ISSUE';
    event_timestamp_ms: number;
    app_id: string;
    app_user_id: string;
    original_app_user_id: string;
    product_id: string;
    period_type: 'NORMAL' | 'INTRO' | 'TRIAL';
    purchased_at_ms: number;
    expiration_at_ms: number | null;
    environment: 'PRODUCTION' | 'SANDBOX';
    entitlement_ids: string[];
    entitlement_id: string | null;
    commission_percentage: number;
    country_code: string;
    currency: string;
    price: number;
    price_in_purchased_currency: number;
    subscriber_attributes: Record<string, unknown>;
    store: 'APP_STORE' | 'PLAY_STORE' | 'STRIPE' | 'PROMOTIONAL';
    takehome_percentage: number;
    tax_percentage: number;
    transaction_id: string;
    original_transaction_id: string;
  };
}

// In-memory cache for subscription status (replace with Redis in production)
const subscriptionCache = new Map<string, SubscriptionStatus>();

// RevenueCat configuration
const REVENUECAT_SECRET_KEY = process.env.REVENUECAT_SECRET_KEY;
const REVENUECAT_WEBHOOK_SECRET = process.env.REVENUECAT_WEBHOOK_SECRET;
const REVENUECAT_API_BASE_URL = new URL('https://api.revenuecat.com/v1/');

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

function parsePositiveIntEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function normalizeRevenueCatUserId(userId: string): string {
  const normalizedUserId = String(userId);
  const hasControlCharacters = Array.from(normalizedUserId).some((character) => {
    const codePoint = character.charCodeAt(0);
    return codePoint < 32 || codePoint === 127;
  });

  if (!normalizedUserId || normalizedUserId.length > 128 || hasControlCharacters) {
    throw new Error('Invalid RevenueCat userId');
  }

  return normalizedUserId;
}

function getSubscriberUrl(userId: string): string {
  const normalizedUserId = normalizeRevenueCatUserId(userId);
  return new URL(`subscribers/${encodeURIComponent(normalizedUserId)}`, REVENUECAT_API_BASE_URL).toString();
}

function buildSubscriptionStatus(userId: string, customerInfo: CustomerInfo): SubscriptionStatus {
  return {
    userId,
    isPro: hasProEntitlement(customerInfo),
    hasActiveSubscription: hasActiveSubscription(customerInfo),
    subscriptionType: getSubscriptionType(customerInfo),
    expirationDate: getExpirationDate(customerInfo),
    willRenew: getWillRenew(customerInfo),
    trialActive: hasActiveTrial(customerInfo)
  };
}

function cacheSubscriptionStatus(userId: string, status: SubscriptionStatus): void {
  subscriptionCache.set(userId, status);
  const evictionTimer = setTimeout(() => subscriptionCache.delete(userId), 5 * 60 * 1000);
  evictionTimer.unref?.();
}

function createBillingRateLimiter(): RequestHandler {
  const windowMs = parsePositiveIntEnv('BILLING_RATE_LIMIT_WINDOW_MS', 60_000);
  const maxRequests = parsePositiveIntEnv('BILLING_RATE_LIMIT_MAX_REQUESTS', 60);
  const requests = new Map<string, RateLimitEntry>();

  return (req, res, next) => {
    const now = Date.now();
    const clientKey = req.ip || req.socket.remoteAddress || 'unknown';
    const entry = requests.get(clientKey);

    if (!entry || entry.resetAt <= now) {
      requests.set(clientKey, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (entry.count >= maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({
        success: false,
        error: 'Too many requests'
      });
      return;
    }

    entry.count += 1;
    next();
  };
}

/**
 * Initialize RevenueCat configuration
 */
export function initializeRevenueCat(): { success: boolean; error?: string } {
  const publicKey = process.env.REVENUECAT_PUBLIC_KEY;
  const secretKey = process.env.REVENUECAT_SECRET_KEY;

  if (!publicKey || !secretKey) {
    return {
      success: false,
      error: 'RevenueCat API keys not configured. Set REVENUECAT_PUBLIC_KEY and REVENUECAT_SECRET_KEY'
    };
  }

  console.info('[RevenueCat] Initialized');
  return { success: true };
}

/**
 * Get subscription status for a user
 */
export async function getSubscriptionStatus(userId: string): Promise<SubscriptionStatus> {
  const normalizedUserId = normalizeRevenueCatUserId(userId);

  // Check cache first
  const cached = subscriptionCache.get(normalizedUserId);
  if (cached) {
    console.info('[RevenueCat] Cache hit');
    return cached;
  }

  try {
    // In production, make actual RevenueCat API call
    const response = await fetch(getSubscriberUrl(normalizedUserId), {
      headers: {
        'Authorization': `Bearer ${REVENUECAT_SECRET_KEY}`,
        'X-Platform': 'server'
      }
    });

    if (!response.ok) {
      throw new Error(`RevenueCat API error: ${response.status}`);
    }

    const customerInfo = await response.json() as CustomerInfo;
    const status = buildSubscriptionStatus(normalizedUserId, customerInfo);
    cacheSubscriptionStatus(normalizedUserId, status);

    console.info('[RevenueCat] Status retrieved');
    return status;

  } catch (error) {
    console.error('[RevenueCat] Error fetching status', { error });

    // Return default free status on error
    const defaultStatus: SubscriptionStatus = {
      userId: normalizedUserId,
      isPro: false,
      hasActiveSubscription: false,
      subscriptionType: 'free',
      expirationDate: null,
      willRenew: false,
      trialActive: false
    };

    return defaultStatus;
  }
}

/**
 * Purchase subscription (mobile apps call this via HTTP)
 */
export async function purchaseSubscription(userId: string, _productId: string, receipt: string): Promise<{ success: boolean; error?: string }> {
  try {
    const normalizedUserId = normalizeRevenueCatUserId(userId);
    console.info('[RevenueCat] Processing purchase');

    const response = await fetch('https://api.revenuecat.com/v1/receipts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REVENUECAT_SECRET_KEY}`,
        'X-Platform': 'server',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        app_user_id: normalizedUserId,
        fetch_token: receipt,
        attributes: {
          install_source: 'openclaw_console',
          device_type: 'mobile'
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Purchase failed with status ${response.status}`);
    }

    await response.json(); // Purchase response data
    console.info('[RevenueCat] Purchase successful');

    // Invalidate cache to force refresh
    subscriptionCache.delete(normalizedUserId);

    return { success: true };

  } catch (error) {
    console.error('[RevenueCat] Purchase error', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown purchase error'
    };
  }
}

/**
 * Restore purchases for a user
 */
export async function restorePurchases(userId: string): Promise<{ success: boolean; customerInfo?: CustomerInfo; error?: string }> {
  try {
    const normalizedUserId = normalizeRevenueCatUserId(userId);
    console.info('[RevenueCat] Restoring purchases');

    const response = await fetch(getSubscriberUrl(normalizedUserId), {
      headers: {
        'Authorization': `Bearer ${REVENUECAT_SECRET_KEY}`,
        'X-Platform': 'server'
      }
    });

    if (!response.ok) {
      throw new Error(`Restore failed: ${response.status}`);
    }

    const customerInfo = await response.json() as CustomerInfo;

    // Refresh cache using the restored customer info we already fetched.
    cacheSubscriptionStatus(normalizedUserId, buildSubscriptionStatus(normalizedUserId, customerInfo));

    console.info('[RevenueCat] Purchases restored');
    return { success: true, customerInfo };

  } catch (error) {
    console.error('[RevenueCat] Restore error', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown restore error'
    };
  }
}

/**
 * Check if user has pro entitlement
 */
export function hasProEntitlement(customerInfo: CustomerInfo): boolean {
  const proEntitlement = customerInfo.entitlements['pro'];
  return proEntitlement?.isActive ?? false;
}

/**
 * Check premium feature access
 */
export async function checkPremiumAccess(userId: string, feature: string): Promise<boolean> {
  const status = await getSubscriptionStatus(userId);

  // Free tier features (always allowed)
  const freeTierFeatures = [
    'basic_approvals',
    'agent_monitoring',
    'simple_notifications'
  ];

  if (freeTierFeatures.includes(feature)) {
    return true;
  }

  // Pro features require active subscription
  const proFeatures = [
    'devops_integrations',
    'advanced_analytics',
    'custom_webhooks',
    'priority_support',
    'unlimited_agents'
  ];

  if (proFeatures.includes(feature)) {
    return status.isPro && status.hasActiveSubscription;
  }

  // Unknown feature defaults to free
  console.warn('[RevenueCat] Unknown feature access check');
  return true;
}

// Helper functions for CustomerInfo parsing
function hasActiveSubscription(customerInfo: CustomerInfo): boolean {
  return Object.values(customerInfo.subscriptions).some(sub => sub.isActive);
}

function getSubscriptionType(customerInfo: CustomerInfo): 'free' | 'pro_monthly' | 'pro_yearly' {
  const activeSubscriptions = Object.values(customerInfo.subscriptions).filter(sub => sub.isActive);

  if (activeSubscriptions.length === 0) {
    return 'free';
  }

  const productId = activeSubscriptions[0].productId;
  if (productId.includes('yearly')) {
    return 'pro_yearly';
  } else if (productId.includes('monthly')) {
    return 'pro_monthly';
  }

  return 'free';
}

function getExpirationDate(customerInfo: CustomerInfo): string | null {
  const activeSubscriptions = Object.values(customerInfo.subscriptions).filter(sub => sub.isActive);
  return activeSubscriptions.length > 0 ? activeSubscriptions[0].expirationDate : null;
}

function getWillRenew(customerInfo: CustomerInfo): boolean {
  const activeSubscriptions = Object.values(customerInfo.subscriptions).filter(sub => sub.isActive);
  return activeSubscriptions.length > 0 ? activeSubscriptions[0].willRenew : false;
}

function hasActiveTrial(customerInfo: CustomerInfo): boolean {
  // Simple heuristic: if subscription is active but started recently (within 7 days)
  const activeSubscriptions = Object.values(customerInfo.subscriptions).filter(sub => sub.isActive);
  if (activeSubscriptions.length === 0) return false;

  // In production, RevenueCat provides trial information in the webhook/API response
  // For now, we'll return false as trial detection requires more sophisticated logic
  return false;
}

/**
 * Verify RevenueCat webhook signature
 */
function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  if (!REVENUECAT_WEBHOOK_SECRET) {
    console.warn('[RevenueCat] Webhook secret not configured - skipping signature verification');
    return true; // Allow in development
  }

  const expectedSignature = crypto
    .createHmac('sha256', REVENUECAT_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  const signatureBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  if (signatureBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
}

/**
 * Process RevenueCat webhook event
 */
async function processWebhookEvent(event: WebhookEvent): Promise<void> {
  const { app_user_id, type } = event.event;

  console.info('[RevenueCat] Processing webhook event', { type });

  // Invalidate cache for affected user
  subscriptionCache.delete(app_user_id);

  switch (type) {
    case 'INITIAL_PURCHASE':
      console.info('[RevenueCat] New subscription received');
      // Trigger welcome flow, analytics event, etc.
      break;

    case 'RENEWAL':
      console.info('[RevenueCat] Subscription renewed');
      break;

    case 'CANCELLATION':
      console.info('[RevenueCat] Subscription cancelled');
      break;

    case 'EXPIRATION':
      console.info('[RevenueCat] Subscription expired');
      break;

    case 'BILLING_ISSUE':
      console.info('[RevenueCat] Billing issue received');
      break;

    default:
      console.warn('[RevenueCat] Unknown webhook event type');
  }
}

/**
 * Create Express router with RevenueCat billing endpoints
 */
export function createBillingRouter(auth?: RequestHandler): Router {
  const router = Router();
  const webhookRateLimiter = createBillingRateLimiter();
  const protectedRateLimiter = createBillingRateLimiter();

  // RevenueCat webhook endpoint stays public but requires the raw body.
  router.post('/webhook', webhookRateLimiter, express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
    try {
      const rawBody = req.body.toString('utf8');
      const signature = req.get('X-Revenuecat-Signature') || '';

      // Verify webhook signature
      if (!verifyWebhookSignature(rawBody, signature)) {
        console.error('[RevenueCat] Invalid webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      const event: WebhookEvent = JSON.parse(rawBody);

      // Process webhook event
      await processWebhookEvent(event);

      res.json({ received: true });
      return;
    } catch (error) {
      console.error('[RevenueCat] Webhook processing error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Webhook processing failed'
      });
      return;
    }
  });

  if (auth) {
    router.use(auth);
  }
  router.use(protectedRateLimiter);

  // Get subscription status
  router.get('/status/:userId', async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const userIdString = String(userId);
      const status = await getSubscriptionStatus(userIdString);
      res.json({ success: true, status });
    } catch (error) {
      console.error('[RevenueCat] Status endpoint error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
      return;
    }
  });

  // Purchase subscription
  router.post('/subscribe', async (req: Request, res: Response) => {
    try {
      const { userId, productId, receipt } = req.body;

      if (!userId || !productId || !receipt) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: userId, productId, receipt'
        });
      }

      const result = await purchaseSubscription(userId, productId, receipt);

      if (result.success) {
        res.json({ success: true, message: 'Subscription purchased successfully' });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
      return;
    } catch (error) {
      console.error('[RevenueCat] Subscribe endpoint error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
      return;
    }
  });

  // Restore purchases
  router.post('/restore', async (req: Request, res: Response) => {
    try {
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: userId'
        });
      }

      const result = await restorePurchases(userId);

      if (result.success) {
        res.json({
          success: true,
          message: 'Purchases restored successfully',
          customerInfo: result.customerInfo
        });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
      return;
    } catch (error) {
      console.error('[RevenueCat] Restore endpoint error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
      return;
    }
  });

  // Check feature access
  router.get('/access/:userId/:feature', async (req: Request, res: Response) => {
    try {
      const { userId, feature } = req.params;
      const userIdString = String(userId);
      const featureString = String(feature);
      const hasAccess = await checkPremiumAccess(userIdString, featureString);

      res.json({
        success: true,
        hasAccess,
        feature: featureString,
        userId: userIdString
      });
      return;
    } catch (error) {
      console.error('[RevenueCat] Access check endpoint error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
      return;
    }
  });

  return router;
}

// Initialize on module load
const initResult = initializeRevenueCat();
if (!initResult.success) {
  console.warn('[RevenueCat] Initialization failed:', initResult.error);
}
