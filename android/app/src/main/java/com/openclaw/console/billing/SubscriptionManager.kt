package com.openclaw.console.billing

import android.app.Activity
import android.app.Application
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import com.revenuecat.purchases.CustomerInfo
import com.revenuecat.purchases.Package
import com.revenuecat.purchases.Purchases
import com.revenuecat.purchases.PurchasesConfiguration
import com.revenuecat.purchases.PurchasesError
import com.revenuecat.purchases.PurchasesErrorCode
import com.revenuecat.purchases.getCustomerInfoWith
import com.revenuecat.purchases.getOfferingsWith
import com.revenuecat.purchases.interfaces.PurchaseCallback
import com.revenuecat.purchases.interfaces.ReceiveCustomerInfoCallback
import com.revenuecat.purchases.interfaces.ReceiveOfferingsCallback
import com.revenuecat.purchases.interfaces.UpdatedCustomerInfoListener
import com.revenuecat.purchases.models.StoreTransaction
import com.revenuecat.purchases.purchasePackageWith
import com.revenuecat.purchases.restorePurchasesWith
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Subscription tiers supported by OpenClaw Console
 */
enum class SubscriptionTier {
    FREE,
    PRO_MONTHLY,
    PRO_YEARLY
}

/**
 * Subscription status data class
 */
data class SubscriptionStatus(
    val tier: SubscriptionTier = SubscriptionTier.FREE,
    val isActive: Boolean = false,
    val willRenew: Boolean = false,
    val expirationDate: String? = null,
    val productIdentifier: String? = null,
    val originalTransactionId: String? = null,
    val hasProEntitlement: Boolean = false
)

/**
 * Purchase result for UI handling
 */
sealed class PurchaseResult {
    object Success : PurchaseResult()
    data class Error(val message: String, val code: PurchasesErrorCode? = null) : PurchaseResult()
    object UserCancelled : PurchaseResult()
}

/**
 * Manages RevenueCat subscription integration for Android
 *
 * Features:
 * - RevenueCat SDK initialization and configuration
 * - Subscription purchase flows (monthly/yearly Pro plans)
 * - Pro feature entitlement checking
 * - Purchase restoration for account recovery
 * - Subscription status caching with encrypted storage
 * - Integration with biometric approval workflow
 */
class SubscriptionManager private constructor(
    private val application: Application
) {

    companion object {
        private const val TAG = "SubscriptionManager"
        private const val PRO_ENTITLEMENT_ID = "pro"
        private const val PRO_MONTHLY_PRODUCT_ID = "com.openclaw.console.pro.monthly"
        private const val PRO_YEARLY_PRODUCT_ID = "com.openclaw.console.pro.yearly"
        private const val PREFERENCES_FILE = "openclaw_subscription_prefs"

        @Volatile
        private var INSTANCE: SubscriptionManager? = null

        fun getInstance(application: Application): SubscriptionManager {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: SubscriptionManager(application).also { INSTANCE = it }
            }
        }
    }

    // StateFlow for subscription status updates
    private val _subscriptionStatus = MutableStateFlow(SubscriptionStatus())
    val subscriptionStatus: StateFlow<SubscriptionStatus> = _subscriptionStatus.asStateFlow()

    // Encrypted preferences for caching subscription state
    private val encryptedPrefs by lazy {
        val masterKeyAlias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
        EncryptedSharedPreferences.create(
            PREFERENCES_FILE,
            masterKeyAlias,
            application,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    /**
     * Initialize RevenueCat purchases with API key
     * Call from Application.onCreate()
     */
    fun initializePurchases(apiKey: String, userId: String? = null) {
        try {
            Log.d(TAG, "Initializing RevenueCat with API key: ${apiKey.take(20)}...")

            val configuration = PurchasesConfiguration.Builder(application, apiKey)
                .apply {
                    userId?.let { appUserID(it) }
                }
                .build()

            Purchases.configure(configuration)

            // Set up customer info update listener
            Purchases.sharedInstance.updatedCustomerInfoListener = UpdatedCustomerInfoListener { customerInfo ->
                Log.d(TAG, "Customer info updated")
                updateSubscriptionStatus(customerInfo)
            }

            Log.i(TAG, "RevenueCat initialized successfully")

            // Load initial subscription status
            refreshSubscriptionStatus()

        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize RevenueCat", e)
        }
    }

    /**
     * Purchase a subscription package
     */
    fun purchasePackage(
        activity: Activity,
        packageToPurchase: Package,
        onResult: (PurchaseResult) -> Unit
    ) {
        Log.d(TAG, "Initiating purchase for package: ${packageToPurchase.identifier}")

        Purchases.sharedInstance.purchasePackageWith(
            activity,
            packageToPurchase,
            onError = { error, userCancelled ->
                Log.e(TAG, "Purchase failed: ${error.message}")

                val result = if (userCancelled) {
                    PurchaseResult.UserCancelled
                } else {
                    PurchaseResult.Error(
                        error.message ?: "Purchase failed",
                        error.code
                    )
                }
                onResult(result)
            },
            onSuccess = { _, customerInfo ->
                Log.i(TAG, "Purchase successful")
                updateSubscriptionStatus(customerInfo)
                onResult(PurchaseResult.Success)
            }
        )
    }

    /**
     * Purchase Pro subscription (convenience method)
     */
    fun purchaseProSubscription(
        activity: Activity,
        yearly: Boolean = false,
        onResult: (PurchaseResult) -> Unit
    ) {
        Log.d(TAG, "Purchasing Pro subscription (yearly: $yearly)")

        Purchases.sharedInstance.getOfferingsWith(
            onError = { error ->
                Log.e(TAG, "Failed to get offerings: ${error.message}")
                onResult(PurchaseResult.Error(error.message ?: "Failed to load subscription options"))
            },
            onSuccess = { offerings ->
                val currentOffering = offerings.current
                if (currentOffering == null) {
                    Log.e(TAG, "No current offering available")
                    onResult(PurchaseResult.Error("No subscription packages available"))
                    return@getOfferingsWith
                }

                val packageToPurchase = if (yearly) {
                    currentOffering.annual ?: currentOffering.availablePackages.find {
                        it.product.id == PRO_YEARLY_PRODUCT_ID
                    }
                } else {
                    currentOffering.monthly ?: currentOffering.availablePackages.find {
                        it.product.id == PRO_MONTHLY_PRODUCT_ID
                    }
                }

                if (packageToPurchase == null) {
                    Log.e(TAG, "No suitable package found for yearly: $yearly")
                    onResult(PurchaseResult.Error("Subscription package not available"))
                    return@getOfferingsWith
                }

                purchasePackage(activity, packageToPurchase, onResult)
            }
        )
    }

    /**
     * Restore purchases for account recovery
     */
    fun restorePurchases(onResult: (PurchaseResult) -> Unit) {
        Log.d(TAG, "Restoring purchases")

        Purchases.sharedInstance.restorePurchasesWith(
            onError = { error ->
                Log.e(TAG, "Failed to restore purchases: ${error.message}")
                onResult(PurchaseResult.Error(error.message ?: "Failed to restore purchases"))
            },
            onSuccess = { customerInfo ->
                Log.i(TAG, "Purchases restored successfully")
                updateSubscriptionStatus(customerInfo)
                onResult(PurchaseResult.Success)
            }
        )
    }

    /**
     * Check if user has Pro entitlement
     */
    fun checkEntitlements(): Boolean {
        return _subscriptionStatus.value.hasProEntitlement
    }

    /**
     * Check if specific pro feature is available
     */
    fun checkProFeatureAccess(feature: String): Boolean {
        val hasProAccess = checkEntitlements()

        Log.d(TAG, "Checking access for feature '$feature': $hasProAccess")

        return when (feature) {
            // Free tier features (always allowed)
            "basic_approvals", "agent_monitoring", "simple_notifications" -> true

            // Pro features require active subscription
            "devops_integrations", "advanced_analytics", "custom_webhooks",
            "priority_support", "unlimited_agents" -> hasProAccess

            // Unknown features default to free
            else -> {
                Log.w(TAG, "Unknown feature access check: $feature")
                true
            }
        }
    }

    /**
     * Get current subscription status
     */
    fun getCurrentSubscriptionStatus(): SubscriptionStatus {
        return _subscriptionStatus.value
    }

    /**
     * Refresh subscription status from RevenueCat
     */
    fun refreshSubscriptionStatus() {
        Log.d(TAG, "Refreshing subscription status")

        Purchases.sharedInstance.getCustomerInfoWith(
            onError = { error ->
                Log.e(TAG, "Failed to get customer info: ${error.message}")
                // Load cached status if available
                loadCachedSubscriptionStatus()
            },
            onSuccess = { customerInfo ->
                Log.d(TAG, "Customer info retrieved successfully")
                updateSubscriptionStatus(customerInfo)
            }
        )
    }

    /**
     * Update subscription status from CustomerInfo and cache it
     */
    private fun updateSubscriptionStatus(customerInfo: CustomerInfo) {
        val proEntitlement = customerInfo.entitlements[PRO_ENTITLEMENT_ID]
        val hasProEntitlement = proEntitlement?.isActive == true

        val activeSubscriptions = customerInfo.activeSubscriptions
        val isActive = activeSubscriptions.isNotEmpty()

        // Determine subscription tier
        val tier = when {
            !isActive -> SubscriptionTier.FREE
            activeSubscriptions.any { it.contains("yearly") } -> SubscriptionTier.PRO_YEARLY
            activeSubscriptions.any { it.contains("monthly") } -> SubscriptionTier.PRO_MONTHLY
            else -> SubscriptionTier.FREE
        }

        val status = SubscriptionStatus(
            tier = tier,
            isActive = isActive,
            willRenew = proEntitlement?.willRenew ?: false,
            expirationDate = proEntitlement?.expirationDate?.toString(),
            productIdentifier = proEntitlement?.productIdentifier,
            originalTransactionId = customerInfo.originalAppUserId,
            hasProEntitlement = hasProEntitlement
        )

        Log.i(TAG, "Updated subscription status: $status")

        _subscriptionStatus.value = status
        cacheSubscriptionStatus(status)
    }

    /**
     * Cache subscription status to encrypted preferences
     */
    private fun cacheSubscriptionStatus(status: SubscriptionStatus) {
        try {
            with(encryptedPrefs.edit()) {
                putString("tier", status.tier.name)
                putBoolean("is_active", status.isActive)
                putBoolean("will_renew", status.willRenew)
                putString("expiration_date", status.expirationDate)
                putString("product_identifier", status.productIdentifier)
                putString("original_transaction_id", status.originalTransactionId)
                putBoolean("has_pro_entitlement", status.hasProEntitlement)
                putLong("cache_timestamp", System.currentTimeMillis())
                apply()
            }
            Log.d(TAG, "Subscription status cached")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to cache subscription status", e)
        }
    }

    /**
     * Load cached subscription status from encrypted preferences
     */
    private fun loadCachedSubscriptionStatus() {
        try {
            val cacheTimestamp = encryptedPrefs.getLong("cache_timestamp", 0)
            val isExpired = System.currentTimeMillis() - cacheTimestamp > 5 * 60 * 1000 // 5 minutes

            if (isExpired) {
                Log.d(TAG, "Cached subscription status expired")
                return
            }

            val tierName = encryptedPrefs.getString("tier", SubscriptionTier.FREE.name) ?: SubscriptionTier.FREE.name
            val tier = SubscriptionTier.valueOf(tierName)

            val status = SubscriptionStatus(
                tier = tier,
                isActive = encryptedPrefs.getBoolean("is_active", false),
                willRenew = encryptedPrefs.getBoolean("will_renew", false),
                expirationDate = encryptedPrefs.getString("expiration_date", null),
                productIdentifier = encryptedPrefs.getString("product_identifier", null),
                originalTransactionId = encryptedPrefs.getString("original_transaction_id", null),
                hasProEntitlement = encryptedPrefs.getBoolean("has_pro_entitlement", false)
            )

            Log.d(TAG, "Loaded cached subscription status: $status")
            _subscriptionStatus.value = status

        } catch (e: Exception) {
            Log.e(TAG, "Failed to load cached subscription status", e)
        }
    }
}