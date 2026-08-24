package com.openclaw.console.service

import android.content.Context
import androidx.biometric.BiometricManager
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.fragment.app.FragmentActivity

/**
 * Unified biometric authentication service for all sensitive operations.
 * Implements 2026 security standards requiring biometric verification for:
 * - Agent action approvals
 * - Gateway connection changes
 * - Settings modifications
 * - Data exports
 * - Account operations
 */
object BiometricService {

    sealed class AuthenticationRequest(
        val title: String,
        val subtitle: String,
        val description: String
    ) {
        object ApproveAgentAction : AuthenticationRequest(
            title = "Approve Agent Action",
            subtitle = "Biometric required for security",
            description = "Verify your identity to approve this potentially dangerous action"
        )

        object DenyAgentAction : AuthenticationRequest(
            title = "Deny Agent Action",
            subtitle = "Confirm action denial",
            description = "Verify your identity to deny this action"
        )

        object AddGateway : AuthenticationRequest(
            title = "Add Gateway Connection",
            subtitle = "Secure new gateway setup",
            description = "Biometric verification required to add a new gateway"
        )

        object RemoveGateway : AuthenticationRequest(
            title = "Remove Gateway",
            subtitle = "Confirm gateway removal",
            description = "Verify your identity to remove this gateway connection"
        )

        object ModifySettings : AuthenticationRequest(
            title = "Modify Settings",
            subtitle = "Security settings change",
            description = "Biometric verification required for security settings"
        )

        object ExportData : AuthenticationRequest(
            title = "Export Data",
            subtitle = "Data export authorization",
            description = "Verify your identity to export sensitive data"
        )

        object ResetApp : AuthenticationRequest(
            title = "Reset Application",
            subtitle = "Confirm app reset",
            description = "This will remove all stored data and connections"
        )

        class Custom(
            title: String,
            subtitle: String = "Biometric verification required",
            description: String = "Verify your identity to continue"
        ) : AuthenticationRequest(title, subtitle, description)
    }

    data class BiometricCapability(
        val isAvailable: Boolean,
        val statusMessage: String,
        val canFallbackToDevice: Boolean
    )

    suspend fun authenticateForOperation(
        activity: FragmentActivity,
        request: AuthenticationRequest
    ): BiometricResult {
        return BiometricHelper.authenticate(
            activity = activity,
            title = request.title,
            subtitle = request.subtitle,
            description = request.description
        )
    }

    fun getCapability(context: Context): BiometricCapability {
        val manager = BiometricManager.from(context)
        val status = manager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)

        return when (status) {
            BiometricManager.BIOMETRIC_SUCCESS -> BiometricCapability(
                isAvailable = true,
                statusMessage = "Biometric authentication is available",
                canFallbackToDevice = true
            )
            BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE -> BiometricCapability(
                isAvailable = false,
                statusMessage = "Biometric hardware not available on this device",
                canFallbackToDevice = false
            )
            BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE -> BiometricCapability(
                isAvailable = false,
                statusMessage = "Biometric hardware is temporarily unavailable",
                canFallbackToDevice = true
            )
            BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED -> BiometricCapability(
                isAvailable = false,
                statusMessage = "No biometric credentials enrolled. Please set up biometric authentication in device settings.",
                canFallbackToDevice = true
            )
            BiometricManager.BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED -> BiometricCapability(
                isAvailable = false,
                statusMessage = "Security update required for biometric authentication",
                canFallbackToDevice = true
            )
            BiometricManager.BIOMETRIC_ERROR_UNSUPPORTED -> BiometricCapability(
                isAvailable = false,
                statusMessage = "Biometric authentication is not supported",
                canFallbackToDevice = false
            )
            BiometricManager.BIOMETRIC_STATUS_UNKNOWN -> BiometricCapability(
                isAvailable = false,
                statusMessage = "Biometric status unknown",
                canFallbackToDevice = true
            )
            else -> BiometricCapability(
                isAvailable = false,
                statusMessage = "Biometric authentication not available",
                canFallbackToDevice = true
            )
        }
    }

    fun shouldRequireBiometric(operation: String): Boolean {
        // All sensitive operations require biometric in 2026 security standards
        return when (operation.lowercase()) {
            "approve", "deny", "add_gateway", "remove_gateway",
            "modify_settings", "export_data", "reset_app", "delete_data" -> true
            else -> false
        }
    }
}

/**
 * Composable for unified biometric authentication UI state management.
 * Provides consistent biometric authentication experience across the app.
 */
@Composable
fun rememberBiometricState(): BiometricAuthState {
    var isAuthenticating by remember { mutableStateOf(false) }
    var lastResult by remember { mutableStateOf<BiometricResult?>(null) }
    var lastError by remember { mutableStateOf<String?>(null) }

    return BiometricAuthState(
        isAuthenticating = isAuthenticating,
        lastResult = lastResult,
        lastError = lastError,
        onStartAuthentication = { isAuthenticating = true },
        onAuthenticationComplete = { result ->
            isAuthenticating = false
            lastResult = result
            lastError = when (result) {
                is BiometricResult.Error -> result.message
                BiometricResult.Lockout -> "Too many failed attempts. Please try again later or use your device PIN."
                BiometricResult.NotAvailable -> "Biometric authentication is not available."
                else -> null
            }
        },
        onClearError = { lastError = null }
    )
}

data class BiometricAuthState(
    val isAuthenticating: Boolean,
    val lastResult: BiometricResult?,
    val lastError: String?,
    val onStartAuthentication: () -> Unit,
    val onAuthenticationComplete: (BiometricResult) -> Unit,
    val onClearError: () -> Unit
)