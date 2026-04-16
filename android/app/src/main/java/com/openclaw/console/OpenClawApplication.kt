package com.openclaw.console

import android.app.Application
import android.util.Log
import com.openclaw.console.service.subscription.SubscriptionService

/**
 * OpenClaw Console Application class
 *
 * Handles app-wide initialization including:
 * - Subscription service (RevenueCat) configuration
 */
class OpenClawApplication : Application() {

    companion object {
        private const val TAG = "OpenClawApplication"
    }

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "OpenClaw Console starting...")

        // Configure RevenueCat. The key is baked in via BuildConfig at build time
        // (set in CI from the REVENUECAT_PUBLIC_KEY secret). When the key is blank
        // (e.g. local debug builds without the secret), SubscriptionService.configure
        // no-ops and the paywall UI shows a "not configured" notice.
        val key = BuildConfig.REVENUECAT_PUBLIC_KEY
        SubscriptionService.getInstance(this).configure(apiKey = key)
    }
}
