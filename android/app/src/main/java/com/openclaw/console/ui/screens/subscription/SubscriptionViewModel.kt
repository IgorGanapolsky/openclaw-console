package com.openclaw.console.ui.screens.subscription

import android.app.Activity
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.openclaw.console.service.subscription.PurchaseResult
import com.openclaw.console.service.subscription.SubscriptionPackage
import com.openclaw.console.service.subscription.SubscriptionService
import com.openclaw.console.service.subscription.SubscriptionStatus
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Drives the paywall and subscription-management UI. Owns transient UI state
 * (error banners, "just purchased" toasts). Reads the canonical subscription
 * state from [SubscriptionService.status] directly in the Composable.
 *
 * The [SubscriptionService] is injected via the [factory] so the ViewModel
 * stays decoupled from the Android framework and is unit-testable.
 */
class SubscriptionViewModel(
    private val service: SubscriptionService
) : ViewModel() {

    val status: StateFlow<SubscriptionStatus> = service.status
    val offerings: StateFlow<List<SubscriptionPackage>> = service.offerings
    val isLoading: StateFlow<Boolean> = service.isLoading

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    private val _justPurchased = MutableStateFlow(false)
    val justPurchased: StateFlow<Boolean> = _justPurchased.asStateFlow()

    val isConfigured: Boolean get() = service.isConfigured()

    fun loadOfferings() {
        viewModelScope.launch {
            service.loadOfferings()
        }
    }

    fun purchase(activity: Activity, productId: String) {
        viewModelScope.launch {
            when (val result = service.purchase(activity, productId)) {
                is PurchaseResult.Success -> _justPurchased.value = true
                is PurchaseResult.UserCancelled -> Unit
                is PurchaseResult.Error -> _errorMessage.value = result.message
            }
        }
    }

    fun restore() {
        viewModelScope.launch {
            when (val result = service.restore()) {
                is PurchaseResult.Success -> _justPurchased.value = true
                is PurchaseResult.UserCancelled -> Unit
                is PurchaseResult.Error -> _errorMessage.value = result.message
            }
        }
    }

    fun clearError() { _errorMessage.value = null }
    fun clearJustPurchased() { _justPurchased.value = false }

    companion object {
        fun factory(service: SubscriptionService): ViewModelProvider.Factory =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T {
                    require(modelClass.isAssignableFrom(SubscriptionViewModel::class.java)) {
                        "Unknown ViewModel: ${modelClass.name}"
                    }
                    return SubscriptionViewModel(service) as T
                }
            }
    }
}
