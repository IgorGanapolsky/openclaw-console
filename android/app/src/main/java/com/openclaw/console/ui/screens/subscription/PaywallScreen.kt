package com.openclaw.console.ui.screens.subscription

import android.app.Activity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.openclaw.console.service.subscription.SubscriptionService

/**
 * Full paywall / subscription-management screen.
 *
 * Behaviour:
 * - If the user already has `pro` entitlement, shows a status + restore panel.
 * - Otherwise, lists monthly + yearly offerings with Subscribe CTAs.
 * - Surfaces errors in a banner.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PaywallScreen(
    onClose: () -> Unit,
    requiredFeature: String? = null,
    viewModel: SubscriptionViewModel = viewModel(
        factory = SubscriptionViewModel.factory(
            SubscriptionService.getInstance(LocalContext.current.applicationContext)
        )
    )
) {
    val status by viewModel.status.collectAsStateWithLifecycle()
    val offerings by viewModel.offerings.collectAsStateWithLifecycle()
    val isLoading by viewModel.isLoading.collectAsStateWithLifecycle()
    val errorMessage by viewModel.errorMessage.collectAsStateWithLifecycle()
    val justPurchased by viewModel.justPurchased.collectAsStateWithLifecycle()
    val activity = LocalContextUtils.currentActivity()

    // Load offerings when screen first appears
    LaunchedEffect(Unit) {
        if (viewModel.isConfigured) {
            viewModel.loadOfferings()
        }
    }

    // Auto-dismiss after successful purchase/restore
    LaunchedEffect(justPurchased) {
        if (justPurchased) {
            viewModel.clearJustPurchased()
            onClose()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(if (status.hasProEntitlement) "Subscription" else "Upgrade to Pro")
                },
                actions = {
                    TextButton(onClick = onClose) { Text("Close") }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            if (!viewModel.isConfigured) {
                ConfigurationMissingNotice()
                return@Column
            }

            HeaderSection(requiredFeature = requiredFeature, hasPro = status.hasProEntitlement)

            if (errorMessage != null) {
                ErrorBanner(message = errorMessage!!, onDismiss = viewModel::clearError)
            }

            if (status.hasProEntitlement) {
                ProStatusCard(status)
            } else {
                FeatureComparison()
                OfferingsList(
                    offerings = offerings,
                    isLoading = isLoading,
                    onPurchase = { productId ->
                        if (activity != null) {
                            viewModel.purchase(activity, productId)
                        }
                    }
                )
            }

            RestoreSection(onRestore = viewModel::restore, isLoading = isLoading)

            Spacer(Modifier.height(16.dp))
        }
    }
}

@Composable
private fun HeaderSection(requiredFeature: String?, hasPro: Boolean) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.fillMaxWidth().padding(top = 16.dp)
    ) {
        Icon(
            imageVector = if (hasPro) Icons.Default.CheckCircle else Icons.Default.Lock,
            contentDescription = null,
            tint = if (hasPro) MaterialTheme.colorScheme.primary else Color(0xFFEF6C00),
            modifier = Modifier.size(48.dp)
        )
        Spacer(Modifier.height(12.dp))
        Text(
            text = if (hasPro) "OpenClaw Pro is active" else "Unlock OpenClaw Pro",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center
        )
        if (!hasPro) {
            Spacer(Modifier.height(8.dp))
            Text(
                text = requiredFeature?.let {
                    "This feature ($it) requires Pro"
                } ?: "Professional-grade agent control for your pocket",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )
        }
    }
}

@Composable
private fun ProStatusCard(status: com.openclaw.console.service.subscription.SubscriptionStatus) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer
        )
    ) {
        Column(Modifier.padding(20.dp)) {
            Text(
                text = status.tier.displayName,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold
            )
            Spacer(Modifier.height(8.dp))
            if (status.expirationDateMillis != null) {
                val dateStr = java.text.DateFormat.getDateInstance().format(status.expirationDateMillis)
                Text(
                    text = if (status.willRenew) "Renews on $dateStr" else "Expires on $dateStr",
                    style = MaterialTheme.typography.bodyMedium
                )
            }
        }
    }
}

@Composable
private fun FeatureComparison() {
    val features = remember {
        listOf(
            FeatureRow("Basic agent monitoring", free = true, pro = true),
            FeatureRow("Simple notifications", free = true, pro = true),
            FeatureRow("Biometric approvals", free = true, pro = true),
            FeatureRow("DevOps integrations", free = false, pro = true),
            FeatureRow("Advanced analytics", free = false, pro = true),
            FeatureRow("Custom webhooks", free = false, pro = true),
            FeatureRow("Unlimited agents", free = false, pro = true),
            FeatureRow("Priority support", free = false, pro = true),
        )
    }

    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Row {
                Text("Feature", modifier = Modifier.weight(1f), fontWeight = FontWeight.Medium)
                Text("Free", modifier = Modifier.width(56.dp), fontWeight = FontWeight.Medium, textAlign = TextAlign.Center)
                Text("Pro", modifier = Modifier.width(56.dp), fontWeight = FontWeight.Medium, textAlign = TextAlign.Center)
            }
            HorizontalDivider(Modifier.padding(vertical = 8.dp))
            features.forEach { feat ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(feat.name, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                    Text(if (feat.free) "✓" else "—", modifier = Modifier.width(56.dp), textAlign = TextAlign.Center)
                    Text(if (feat.pro) "✓" else "—", modifier = Modifier.width(56.dp), textAlign = TextAlign.Center)
                }
            }
        }
    }
}

@Composable
private fun OfferingsList(
    offerings: List<com.openclaw.console.service.subscription.SubscriptionPackage>,
    isLoading: Boolean,
    onPurchase: (String) -> Unit
) {
    if (isLoading && offerings.isEmpty()) {
        Row(
            horizontalArrangement = Arrangement.Center,
            modifier = Modifier.fillMaxWidth().padding(32.dp)
        ) { CircularProgressIndicator() }
        return
    }
    if (offerings.isEmpty()) {
        Text(
            "Subscription packages unavailable. Please check your connection and try again.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        return
    }

    Text(
        "Choose your plan",
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.SemiBold
    )

    offerings.sortedBy { !it.isYearly }.forEach { pkg ->
        OfferingCard(pkg = pkg, onPurchase = onPurchase, isLoading = isLoading)
    }
}

@Composable
private fun OfferingCard(
    pkg: com.openclaw.console.service.subscription.SubscriptionPackage,
    onPurchase: (String) -> Unit,
    isLoading: Boolean
) {
    val isRecommended = pkg.isYearly
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = if (isRecommended) MaterialTheme.colorScheme.primaryContainer
                            else MaterialTheme.colorScheme.surfaceVariant
        )
    ) {
        Column(
            Modifier.padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            if (isRecommended) {
                Surface(
                    color = MaterialTheme.colorScheme.primary,
                    shape = RoundedCornerShape(6.dp)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                    ) {
                        Icon(Icons.Default.Star, contentDescription = null, tint = Color.White, modifier = Modifier.size(14.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("BEST VALUE", color = Color.White, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                    }
                }
                Spacer(Modifier.height(8.dp))
            }
            Text(pkg.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text(pkg.priceString, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            Text(pkg.periodDescription, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(12.dp))
            Button(
                onClick = { onPurchase(pkg.productId) },
                enabled = !isLoading,
                modifier = Modifier.fillMaxWidth()
            ) {
                if (isLoading) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = Color.White)
                } else {
                    Text("Subscribe")
                }
            }
        }
    }
}

@Composable
private fun RestoreSection(onRestore: () -> Unit, isLoading: Boolean) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.fillMaxWidth()
    ) {
        TextButton(onClick = onRestore, enabled = !isLoading) {
            Text("Restore purchases")
        }
        Text(
            "Already subscribed on another device? Restore here.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center
        )
    }
}

@Composable
private fun ErrorBanner(message: String, onDismiss: () -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)),
        color = MaterialTheme.colorScheme.errorContainer
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                message,
                color = MaterialTheme.colorScheme.onErrorContainer,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.weight(1f)
            )
            TextButton(onClick = onDismiss) { Text("Dismiss") }
        }
    }
}

@Composable
private fun ConfigurationMissingNotice() {
    Card(
        modifier = Modifier.fillMaxWidth().padding(top = 24.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant
        )
    ) {
        Column(Modifier.padding(20.dp)) {
            Text(
                "Subscriptions are not configured for this build.",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold
            )
            Spacer(Modifier.height(8.dp))
            Text(
                "A RevenueCat API key must be supplied at build time to enable in-app purchases.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

private data class FeatureRow(val name: String, val free: Boolean, val pro: Boolean)

/**
 * Helper object to find the nearest Activity from a Compose scope. Placed in the same file
 * so we do not leak Android context utilities elsewhere.
 */
private object LocalContextUtils {
    @Composable
    fun currentActivity(): Activity? {
        val ctx = LocalContext.current
        var c: android.content.Context? = ctx
        while (c is android.content.ContextWrapper) {
            if (c is Activity) return c
            c = c.baseContext
        }
        return null
    }
}
