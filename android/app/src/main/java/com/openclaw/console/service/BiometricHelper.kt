package com.openclaw.console.service

import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import kotlinx.coroutines.suspendCancellableCoroutine
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import kotlin.coroutines.resume

sealed class BiometricResult {
    data object Success : BiometricResult()
    data class Error(val code: Int, val message: String) : BiometricResult()
    data object NotAvailable : BiometricResult()
    data object UserCancelled : BiometricResult()
}

object BiometricHelper {
    private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
    private const val KEY_ALIAS = "openclaw_console_biometric_signing_key"
    private const val SIGNATURE_ALGORITHM = "SHA256withECDSA"
    private const val CURVE = "secp256r1"

    fun isAvailable(context: Context): Boolean {
        val manager = BiometricManager.from(context)
        return manager.canAuthenticate(BIOMETRIC_STRONG) ==
                BiometricManager.BIOMETRIC_SUCCESS
    }

    fun availabilityStatus(context: Context): Int {
        return BiometricManager.from(context).canAuthenticate(BIOMETRIC_STRONG)
    }

    suspend fun authenticate(
        activity: FragmentActivity,
        title: String = "Verify Identity",
        subtitle: String = "Biometric required to approve this action",
        description: String = "Use your fingerprint or face to confirm"
    ): BiometricResult = suspendCancellableCoroutine { continuation ->
        val cryptoObject = runCatching { createCryptoObject() }
            .getOrElse { error ->
                if (continuation.isActive) {
                    continuation.resume(
                        BiometricResult.Error(
                            code = -1,
                            message = "Failed to initialize biometric crypto: ${error.message ?: "unknown error"}"
                        )
                    )
                }
                return@suspendCancellableCoroutine
            }

        val executor = ContextCompat.getMainExecutor(activity)

        val callback = object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                if (!continuation.isActive) return

                val signature = result.cryptoObject?.signature
                if (signature == null) {
                    continuation.resume(
                        BiometricResult.Error(
                            code = BiometricPrompt.ERROR_VENDOR,
                            message = "Biometric success did not return a cryptographic signature"
                        )
                    )
                    return
                }

                val signed = runCatching {
                    val challenge = "openclaw-approval:${System.currentTimeMillis()}".toByteArray()
                    signature.update(challenge)
                    signature.sign()
                }.getOrNull()

                if (signed == null || signed.isEmpty()) {
                    continuation.resume(
                        BiometricResult.Error(
                            code = BiometricPrompt.ERROR_VENDOR,
                            message = "Biometric cryptographic verification failed"
                        )
                    )
                    return
                }

                continuation.resume(BiometricResult.Success)
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
            .setAllowedAuthenticators(BIOMETRIC_STRONG)
            .setConfirmationRequired(true)
            .build()

        val prompt = BiometricPrompt(activity, executor, callback)

        continuation.invokeOnCancellation {
            // No public cancel API on BiometricPrompt; the coroutine cancellation handles cleanup
        }

        prompt.authenticate(promptInfo, cryptoObject)
    }

    private fun createCryptoObject(): BiometricPrompt.CryptoObject {
        val signature = Signature.getInstance(SIGNATURE_ALGORITHM)
        signature.initSign(getOrCreatePrivateKey())
        return BiometricPrompt.CryptoObject(signature)
    }

    private fun getOrCreatePrivateKey(): PrivateKey {
        val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }

        if (!keyStore.containsAlias(KEY_ALIAS)) {
            val keyPairGenerator = KeyPairGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_EC,
                KEYSTORE_PROVIDER
            )

            val specBuilder = KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY
            )
                .setAlgorithmParameterSpec(ECGenParameterSpec(CURVE))
                .setDigests(KeyProperties.DIGEST_SHA256, KeyProperties.DIGEST_SHA512)
                .setUserAuthenticationRequired(true)
                .setInvalidatedByBiometricEnrollment(true)

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                specBuilder.setUserAuthenticationParameters(
                    0,
                    BIOMETRIC_STRONG
                )
            } else {
                @Suppress("DEPRECATION")
                specBuilder.setUserAuthenticationValidityDurationSeconds(-1)
            }

            keyPairGenerator.initialize(specBuilder.build())
            keyPairGenerator.generateKeyPair()
        }

        return keyStore.getKey(KEY_ALIAS, null) as? PrivateKey
            ?: error("Missing private key for biometric authentication")
    }
}
