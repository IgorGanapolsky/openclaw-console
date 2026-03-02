package com.openclaw.console.service

import android.content.Context
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

sealed class BiometricResult {
    data object Success : BiometricResult()
    data class Error(val code: Int, val message: String) : BiometricResult()
    data object NotAvailable : BiometricResult()
    data object UserCancelled : BiometricResult()
}

object BiometricHelper {

    fun isAvailable(context: Context): Boolean {
        val manager = BiometricManager.from(context)
        return manager.canAuthenticate(BIOMETRIC_STRONG or DEVICE_CREDENTIAL) ==
                BiometricManager.BIOMETRIC_SUCCESS
    }

    fun availabilityStatus(context: Context): Int {
        return BiometricManager.from(context).canAuthenticate(BIOMETRIC_STRONG or DEVICE_CREDENTIAL)
    }

    suspend fun authenticate(
        activity: FragmentActivity,
        title: String = "Verify Identity",
        subtitle: String = "Biometric required to approve this action",
        description: String = "Use your fingerprint, face, or device PIN to confirm"
    ): BiometricResult = suspendCancellableCoroutine { continuation ->

        val executor = ContextCompat.getMainExecutor(activity)

        val callback = object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                if (continuation.isActive) continuation.resume(BiometricResult.Success)
            }

            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                if (continuation.isActive) {
                    val result = if (errorCode == BiometricPrompt.ERROR_USER_CANCELED ||
                        errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON
                    ) {
                        BiometricResult.UserCancelled
                    } else {
                        BiometricResult.Error(errorCode, errString.toString())
                    }
                    continuation.resume(result)
                }
            }

            override fun onAuthenticationFailed() {
                // Individual failure - do not cancel, let the system handle retries
            }
        }

        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setSubtitle(subtitle)
            .setDescription(description)
            .setAllowedAuthenticators(BIOMETRIC_STRONG or DEVICE_CREDENTIAL)
            .build()

        val prompt = BiometricPrompt(activity, executor, callback)

        continuation.invokeOnCancellation {
            // No public cancel API on BiometricPrompt; the coroutine cancellation handles cleanup
        }

        prompt.authenticate(promptInfo)
    }
}
