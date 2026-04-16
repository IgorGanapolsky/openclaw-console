package com.openclaw.console.service.subscription

import android.app.Activity
import android.content.Context
import android.util.Log
import com.revenuecat.purchases.CustomerInfo
import com.revenuecat.purchases.LogLevel
import com.revenuecat.purchases.Offerings
import com.revenuecat.purchases.Package
import com.revenuecat.purchases.PurchasesConfiguration
import com.revenuecat.purchases.PurchasesError
import com.revenuecat.purchases.PurchasesErrorCode
import com.revenuecat.purchases.Purchases
import com.revenuecat.purchases.interfaces.PurchaseCallback
import com.revenuecat.purchases.interfaces.ReceiveCustomerInfoCallback
import com.revenuecat.purchases.interfaces.ReceiveOfferingsCallback
import com.revenuecat.purchases.models.StoreTransaction
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/**
 * RevenueCat-backed subscription service for Android. Mirrors the iOS
 * [ios/.../SubscriptionService.swift] contract — same product IDs, same `pro` entitlement,
 * same status model — so a user's Pro access is portable across platforms.
 *
 * Usage:
 * 1. Call [configure] once at app start (from Application.onCreate) with the Play-Store
 *    RevenueCat public key (build-time config).
 * 2. Observe [status] as a StateFlow for UI binding.
 * 3. Call [loadOfferings] to populate paywall, [purchase] to buy, [restore] to restore.
 */
class SubscriptionService private constructor(private val appContext: Context) {

    companion object {
        private const val TAG = "SubscriptionService"

        /** Entitlement ID configured in RevenueCat dashboard. MUST match iOS. */
        const val PRO_ENTITLEMENT_ID = "pro"
        const val PRO_MONTHLY_PRODUCT_ID = "com.openclaw.console.pro.monthly"
        const val PRO_YEARLY_PRODUCT_ID = "com.openclaw.console.pro.yearly"

        @Volatile
        private var INSTANCE: SubscriptionService? = null

        fun getInstance(context: Context): SubscriptionService =
            INSTANCE ?: synchronized(this) {
                INSTANCE ?: SubscriptionService(context.applicationContext).also { INSTANCE = it }
            }
    }

    private val _status = MutableStateFlow(SubscriptionStatus())
    val status: StateFlow<SubscriptionStatus> = _status.asStateFlow()

    private val _offerings = MutableStateFlow<List<SubscriptionPackage>>(emptyList())
    val offerings: StateFlow<List<SubscriptionPackage>> = _offerings.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    /** Raw RevenueCat packages, kept for [purchase]. Maps productId -> Package. */
    private var packageCache: Map<String, Package> = emptyMap()

    private var configured = false

    /**
     * Idempotent initialization. Safe to call from Application.onCreate before the API
     * key is known — pass an empty string to no-op.
     */
    fun configure(apiKey: String, appUserId: String? = null) {
        if (apiKey.isBlank()) {
            Log.w(TAG, "Skipping RevenueCat configure: apiKey is blank (paywall will be disabled)")
            return
        }
        if (configured) {
            Log.d(TAG, "RevenueCat already configured; skipping")
            return
        }

        Purchases.logLevel = LogLevel.INFO
        val config = PurchasesConfiguration.Builder(appContext, apiKey)
            .apply { if (!appUserId.isNullOrBlank()) appUserID(appUserId) }
            .build()
        Purchases.configure(config)
        configured = true
        Log.i(TAG, "RevenueCat configured")

        refreshCustomerInfo()
    }

    /** True iff [configure] was called with a valid key. */
    fun isConfigured(): Boolean = configured

    /** Pull the latest entitlement state from RevenueCat and update [status]. */
    fun refreshCustomerInfo() {
        if (!configured) return
        Purchases.sharedInstance.getCustomerInfo(object : ReceiveCustomerInfoCallback {
            override fun onReceived(customerInfo: CustomerInfo) {
                applyCustomerInfo(customerInfo)
            }

            override fun onError(error: PurchasesError) {
                Log.w(TAG, "refreshCustomerInfo failed: ${error.message}")
            }
        })
    }

    /** Suspend variant of [loadOfferings] so paywall screens can await the result. */
    suspend fun loadOfferings(): List<SubscriptionPackage> {
        if (!configured) return emptyList()
        _isLoading.value = true
        return try {
            val offerings = fetchOfferings() ?: return emptyList()
            val current = offerings.current ?: return emptyList()

            val mapped = mutableMapOf<String, Package>()
            val exposed = mutableListOf<SubscriptionPackage>()

            current.availablePackages.forEach { pkg ->
                val productId = pkg.product.id
                mapped[productId] = pkg
                val isYearly = productId.contains("yearly", ignoreCase = true) ||
                    pkg == current.annual
                exposed += SubscriptionPackage(
                    productId = productId,
                    title = pkg.product.title.ifBlank { if (isYearly) "Yearly" else "Monthly" },
                    priceString = pkg.product.price.formatted,
                    periodDescription = if (isYearly) "per year" else "per month",
                    isYearly = isYearly
                )
            }

            packageCache = mapped
            _offerings.value = exposed
            exposed
        } finally {
            _isLoading.value = false
        }
    }

    /**
     * Kick off the Play Billing purchase flow for the given product ID.
     * Must be called with a real Activity context (Play Billing requires it).
     */
    suspend fun purchase(activity: Activity, productId: String): PurchaseResult {
        if (!configured) return PurchaseResult.Error("Subscriptions not configured")
        val pkg = packageCache[productId]
            ?: return PurchaseResult.Error("Package $productId not available — try reloading offerings")

        _isLoading.value = true
        return try {
            suspendCancellableCoroutine { cont ->
                Purchases.sharedInstance.purchase(
                    com.revenuecat.purchases.PurchaseParams.Builder(activity, pkg).build(),
                    object : PurchaseCallback {
                        override fun onCompleted(storeTransaction: StoreTransaction, customerInfo: CustomerInfo) {
                            applyCustomerInfo(customerInfo)
                            cont.resume(PurchaseResult.Success)
                        }

                        override fun onError(error: PurchasesError, userCancelled: Boolean) {
                            if (userCancelled || error.code == PurchasesErrorCode.PurchaseCancelledError) {
                                cont.resume(PurchaseResult.UserCancelled)
                            } else {
                                Log.w(TAG, "Purchase failed: ${error.message}")
                                cont.resume(PurchaseResult.Error(error.message))
                            }
                        }
                    }
                )
            }
        } finally {
            _isLoading.value = false
        }
    }

    suspend fun restore(): PurchaseResult {
        if (!configured) return PurchaseResult.Error("Subscriptions not configured")
        _isLoading.value = true
        return try {
            suspendCancellableCoroutine { cont ->
                Purchases.sharedInstance.restorePurchases(object : ReceiveCustomerInfoCallback {
                    override fun onReceived(customerInfo: CustomerInfo) {
                        applyCustomerInfo(customerInfo)
                        cont.resume(PurchaseResult.Success)
                    }

                    override fun onError(error: PurchasesError) {
                        Log.w(TAG, "Restore failed: ${error.message}")
                        cont.resume(PurchaseResult.Error(error.message))
                    }
                })
            }
        } finally {
            _isLoading.value = false
        }
    }

    /**
     * Feature-gate check. Mirrors iOS `checkProFeatureAccess(feature:)` — keep the
     * feature string catalog in sync across platforms.
     */
    fun hasAccess(feature: String): Boolean {
        val hasPro = _status.value.hasProEntitlement
        return when (feature) {
            "basic_approvals", "agent_monitoring", "simple_notifications" -> true
            "devops_integrations", "advanced_analytics", "custom_webhooks",
            "priority_support", "unlimited_agents" -> hasPro
            else -> true
        }
    }

    // region Internal helpers

    private suspend fun fetchOfferings(): Offerings? = suspendCancellableCoroutine { cont ->
        Purchases.sharedInstance.getOfferings(object : ReceiveOfferingsCallback {
            override fun onReceived(offerings: Offerings) {
                cont.resume(offerings)
            }

            override fun onError(error: PurchasesError) {
                Log.w(TAG, "getOfferings failed: ${error.message}")
                cont.resume(null)
            }
        })
    }

    private fun applyCustomerInfo(info: CustomerInfo) {
        val entitlement = info.entitlements[PRO_ENTITLEMENT_ID]
        val hasPro = entitlement?.isActive == true
        val productId = entitlement?.productIdentifier
        val tier = if (hasPro) SubscriptionTier.fromProductId(productId) else SubscriptionTier.FREE

        _status.value = SubscriptionStatus(
            tier = tier,
            isActive = info.activeSubscriptions.isNotEmpty(),
            willRenew = entitlement?.willRenew == true,
            expirationDateMillis = entitlement?.expirationDate?.time,
            productIdentifier = productId,
            hasProEntitlement = hasPro
        )
        Log.d(TAG, "Subscription status updated: tier=$tier active=$hasPro")
    }

    // endregion
}
