package com.openclaw.console.ui.screens.onboarding

import androidx.compose.foundation.layout.Column
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import com.openclaw.console.ui.theme.OpenClawTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Simplified test to isolate the button click callback issue
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class SimpleQrButtonTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun simpleButton_triggersCallback() {
        var callbackTriggered = false

        composeTestRule.setContent {
            OpenClawTheme {
                Column {
                    Button(
                        onClick = { callbackTriggered = true },
                        modifier = Modifier.testTag("test_button")
                    ) {
                        Text("Test Button")
                    }
                }
            }
        }

        composeTestRule.waitForIdle()

        // Find and click the button
        composeTestRule
            .onNodeWithTag("test_button")
            .performClick()

        // Verify callback was triggered
        assert(callbackTriggered) { "Button callback should be triggered" }
    }

    @Test
    fun qrScannerButton_isolatedTest() {
        var callbackTriggered = false

        composeTestRule.setContent {
            OpenClawTheme {
                Button(
                    onClick = {
                        println("DEBUG: Simple QR button clicked!")
                        callbackTriggered = true
                    },
                    modifier = Modifier.testTag("qr_button")
                ) {
                    Text("STEP 2: Scan QR Code")
                }
            }
        }

        composeTestRule.waitForIdle()

        // Click the button
        composeTestRule
            .onNodeWithTag("qr_button")
            .performClick()

        println("DEBUG: Simple test - callbackTriggered = $callbackTriggered")

        assert(callbackTriggered) { "QR button callback should be triggered" }
    }

    @Test
    fun welcomeScreen_minimalTest() {
        var callbackTriggered = false

        composeTestRule.setContent {
            OpenClawTheme {
                // Try the actual component
                WelcomeOnboardingScreen(
                    onAddGateway = {
                        println("DEBUG: Welcome screen callback triggered!")
                        callbackTriggered = true
                    }
                )
            }
        }

        composeTestRule.waitForIdle()

        // Debug: Print the UI tree
        composeTestRule.onRoot().printToLog("WelcomeMinimalTest")

        // Look for any clickable element
        try {
            composeTestRule.onNodeWithTag("qr_scanner_button").performClick()
        } catch (e: Exception) {
            println("DEBUG: Test tag failed: ${e.message}")
            try {
                composeTestRule.onNodeWithText("STEP 2: Scan QR Code", substring = true).performClick()
            } catch (e2: Exception) {
                println("DEBUG: Text search also failed: ${e2.message}")
                // Try to find any button
                composeTestRule.onAllNodesWithText("STEP 2", substring = true)[0].performClick()
            }
        }

        println("DEBUG: Minimal welcome test - callbackTriggered = $callbackTriggered")

        assert(callbackTriggered) { "Welcome screen QR button callback should be triggered" }
    }
}