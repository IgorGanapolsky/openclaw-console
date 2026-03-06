package com.openclaw.console

import android.app.Application
import android.util.Log
import com.openclaw.console.billing.SubscriptionManager

/**
 * OpenClaw Console Application class
 *
 * Handles app-wide initialization including:
 * - RevenueCat subscription management
 * - Global services setup
 */
class OpenClawApplication : Application() {

    companion object {
        private const val TAG = "OpenClawApplication"
    }

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "OpenClaw Console starting...")

        // Initialize subscription manager
        initializeSubscriptionManager()
    }

    private fun initializeSubscriptionManager() {
        try {
            val subscriptionManager = SubscriptionManager.getInstance(this)

            // Get RevenueCat API key from environment or use development key
            val apiKey = getRevenueCatApiKey()

            if (apiKey.isNotEmpty()) {
                subscriptionManager.initializePurchases(apiKey)
                Log.i(TAG, "RevenueCat initialized successfully")
            } else {
                Log.w(TAG, "RevenueCat API key not configured - subscription features disabled")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize subscription manager", e)
        }
    }

    /**
     * Get RevenueCat API key from build config or environment
     * In production, this should come from secure build configuration
     */
    private fun getRevenueCatApiKey(): String {
        // Try BuildConfig first (if set during build)
        val buildConfigKey = try {
            val buildConfigClass = Class.forName("${packageName}.BuildConfig")
            val field = buildConfigClass.getDeclaredField("REVENUECAT_API_KEY")
            field.get(null) as? String
        } catch (e: Exception) {
            Log.d(TAG, "BuildConfig.REVENUECAT_API_KEY not found")
            null
        }

        if (!buildConfigKey.isNullOrEmpty()) {
            return buildConfigKey
        }

        // For development, use a placeholder (in production this would be injected at build time)
        return System.getProperty("revenuecat.api.key", "")
    }
}