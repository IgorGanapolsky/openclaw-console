package com.openclaw.console.service

import android.content.Context
import android.util.Log
import com.openclaw.console.BuildConfig
import io.sentry.Sentry
import io.sentry.android.core.SentryAndroid
import io.sentry.protocol.User
import java.util.concurrent.ConcurrentHashMap

/**
 * 2026 Observability Service using Sentry
 *
 * Provides secure error tracking and structured logging for debugging
 * QR scanner button issues with zero hardcoded secrets.
 */
object AnalyticsService {
    private var isInitialized = false
    private var isSentryEnabled = false
    private val contextData = ConcurrentHashMap<String, Any>()
    private const val TAG = "AnalyticsService"

    fun initialize(context: Context) {
        if (isInitialized) return

        try {
            val sentryDsn = BuildConfig.SENTRY_DSN
            val hasSentryDsn = sentryDsn.isNotBlank()

            if (hasSentryDsn) {
                // Initialize Sentry with secure configuration
                SentryAndroid.init(context) { options ->
                    options.dsn = sentryDsn
                    options.isDebug = false // Secure: disable debug in production
                    options.tracesSampleRate = 1.0
                    options.sessionTrackingIntervalMillis = 30000

                    options.setBeforeSend { event, hint ->
                        event.apply {
                            setTag("platform", "android")
                            setTag("app_version", context.packageManager
                                .getPackageInfo(context.packageName, 0)
                                .versionName ?: "unknown")
                        }
                        event
                    }
                }

                Sentry.setUser(User().apply {
                    id = "android_user"
                    username = "debug_session"
                })

                Log.i(TAG, "AnalyticsService initialized with Sentry")
            } else {
                Log.i(TAG, "AnalyticsService initialized without Sentry (no DSN provided)")
            }

            isSentryEnabled = hasSentryDsn
            isInitialized = true

        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize AnalyticsService", e)
        }
    }

    private fun safeSentryCall(action: () -> Unit) {
        if (isSentryEnabled) {
            try {
                action()
            } catch (e: Exception) {
                Log.e(TAG, "Sentry call failed", e)
            }
        }
    }

    /**
     * Track UI interactions for debugging QR scanner issues
     */
    fun trackUIInteraction(
        action: String,
        screen: String,
        elementId: String,
        additionalContext: Map<String, Any> = emptyMap()
    ) {
        try {
            Log.d(TAG, "UI: $action on $screen/$elementId")

            safeSentryCall {
                Sentry.addBreadcrumb("UI: $action on $screen/$elementId")
            }

            // Critical QR scanner button tracking
            if (action == "click" && elementId == "qr_scanner_button") {
                safeSentryCall {
                    Sentry.withScope { scope ->
                        scope.setTag("interaction_type", "critical_button")
                        additionalContext.forEach { (key, value) ->
                            scope.setExtra(key, value.toString())
                        }
                        Sentry.captureMessage("QR Scanner Button Clicked", io.sentry.SentryLevel.INFO)
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to track UI interaction", e)
        }
    }

    /**
     * Track navigation flow for debugging routing issues
     */
    fun trackNavigation(
        from: String,
        to: String,
        success: Boolean,
        errorMessage: String? = null
    ) {
        try {
            Log.d(TAG, "Navigation: $from -> $to (success: $success)")

            safeSentryCall {
                Sentry.addBreadcrumb("Navigation: $from -> $to (success: $success)")
            }

            if (!success) {
                safeSentryCall {
                    Sentry.withScope { scope ->
                        scope.setTag("navigation_failure", "true")
                        scope.setExtra("from_screen", from)
                        scope.setExtra("to_screen", to)
                        errorMessage?.let { scope.setExtra("error_message", it) }
                        Sentry.captureMessage("Navigation Failed: $from -> $to", io.sentry.SentryLevel.WARNING)
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to track navigation", e)
        }
    }

    /**
     * Track critical QR scanner button failures
     */
    fun trackCriticalButtonIssue(
        buttonId: String,
        screen: String,
        issueDescription: String,
        userAction: String
    ) {
        try {
            Log.e(TAG, "CRITICAL: Button $buttonId not responding on $screen")

            safeSentryCall {
                Sentry.withScope { scope ->
                    scope.setLevel(io.sentry.SentryLevel.ERROR)
                    scope.setTag("component", "ui_button")
                    scope.setTag("critical", "true")
                    scope.setExtra("button_id", buttonId)
                    scope.setExtra("screen", screen)
                    scope.setExtra("user_action", userAction)
                    scope.setExtra("issue_description", issueDescription)

                    Sentry.captureMessage("Critical button failure: $buttonId not responding",
                        io.sentry.SentryLevel.ERROR)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to track critical button issue", e)
        }
    }

    /**
     * Track errors and exceptions with context
     */
    fun trackError(
        error: Throwable,
        screen: String,
        action: String,
        additionalContext: Map<String, Any> = emptyMap()
    ) {
        try {
            Log.e(TAG, "Error: ${error::class.java.simpleName} on $screen during $action", error)

            safeSentryCall {
                Sentry.withScope { scope ->
                    scope.setTag("screen", screen)
                    scope.setTag("action", action)
                    additionalContext.forEach { (key, value) ->
                        scope.setExtra(key, value.toString())
                    }
                    Sentry.addBreadcrumb("Error on $screen during $action")
                    Sentry.captureException(error)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to track error", e)
        }
    }
}