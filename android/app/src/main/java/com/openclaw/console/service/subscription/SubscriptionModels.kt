package com.openclaw.console.service.subscription

/**
 * Subscription tiers supported by OpenClaw Console.
 * Mirror of iOS `SubscriptionTier` — values MUST match so analytics/billing join across platforms.
 */
enum class SubscriptionTier(val raw: String, val displayName: String) {
    FREE("free", "Free"),
    PRO_MONTHLY("pro_monthly", "Pro Monthly"),
    PRO_YEARLY("pro_yearly", "Pro Yearly");

    companion object {
        fun fromProductId(productId: String?): SubscriptionTier = when {
            productId == null -> FREE
            productId.contains("yearly", ignoreCase = true) -> PRO_YEARLY
            productId.contains("monthly", ignoreCase = true) -> PRO_MONTHLY
            else -> FREE
        }
    }
}

/**
 * Current subscription snapshot. All fields are nullable/sane-default so downstream UI
 * can render without null checks.
 */
data class SubscriptionStatus(
    val tier: SubscriptionTier = SubscriptionTier.FREE,
    val isActive: Boolean = false,
    val willRenew: Boolean = false,
    val expirationDateMillis: Long? = null,
    val productIdentifier: String? = null,
    val hasProEntitlement: Boolean = false
)

/**
 * Result type returned from purchase/restore flows. Mirrors iOS PurchaseResult.
 */
sealed class PurchaseResult {
    object Success : PurchaseResult()
    object UserCancelled : PurchaseResult()
    data class Error(val message: String) : PurchaseResult()
}

/**
 * Offering package surfaced to the paywall. We only expose what the UI needs —
 * title, price string (already localized by Play Billing), billing period hint.
 */
data class SubscriptionPackage(
    val productId: String,
    val title: String,
    val priceString: String,
    val periodDescription: String,
    val isYearly: Boolean
)
