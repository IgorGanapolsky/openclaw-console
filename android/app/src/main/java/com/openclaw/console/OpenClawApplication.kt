package com.openclaw.console

import android.app.Application
import android.util.Log

/**
 * OpenClaw Console Application class
 *
 * Handles app-wide initialization including:
 * - Global services setup
 */
class OpenClawApplication : Application() {

    companion object {
        private const val TAG = "OpenClawApplication"
    }

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "OpenClaw Console starting...")
    }
}