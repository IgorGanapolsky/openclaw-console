package com.openclaw.console.ui.navigation

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.openclaw.console.ui.screens.onboarding.WelcomeOnboardingScreen
import com.openclaw.console.ui.theme.OpenClawTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * 2026 Testing - Navigation tests for QR scanner flow
 * These tests ensure the navigation chain works correctly and would have caught the regression
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class QrScannerNavigationTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun welcomeScreen_hasCorrectNavigationCallback() {
        var onAddGatewayCalled = false

        composeTestRule.setContent {
            OpenClawTheme {
                WelcomeOnboardingScreen(
                    onAddGateway = { onAddGatewayCalled = true }
                )
            }
        }

        // Wait for composition
        composeTestRule.waitForIdle()

        // Verify the button exists
        composeTestRule
            .onNodeWithText("STEP 2: Scan QR Code")
            .assertIsDisplayed()

        // Click the QR scanner button
        composeTestRule
            .onNodeWithText("STEP 2: Scan QR Code")
            .performClick()

        // Verify callback was triggered - this would have caught the regression!
        assert(onAddGatewayCalled) {
            "onAddGateway callback should be triggered by QR scanner button click"
        }
    }

    @Test
    fun qrScannerButton_isVisibleAndClickable() {
        composeTestRule.setContent {
            OpenClawTheme {
                WelcomeOnboardingScreen(
                    onAddGateway = { /* no-op for this test */ }
                )
            }
        }

        // This test verifies the button is properly displayed and would catch UI regressions
        composeTestRule
            .onNodeWithText("STEP 2: Scan QR Code")
            .assertIsDisplayed()
            .performClick() // Should not throw an exception
    }

    @Test
    fun welcomeScreen_displaysAllRequiredElements() {
        composeTestRule.setContent {
            OpenClawTheme {
                WelcomeOnboardingScreen(
                    onAddGateway = { /* no-op */ }
                )
            }
        }

        // Verify all critical UI elements are present
        composeTestRule
            .onNodeWithText("OpenClaw Console")
            .assertIsDisplayed()

        composeTestRule
            .onNodeWithText("STEP 1: Run this on your computer")
            .assertIsDisplayed()

        composeTestRule
            .onNodeWithText("STEP 2: Scan QR Code")
            .assertIsDisplayed()

        composeTestRule
            .onNodeWithText("openclaw qr --remote")
            .assertIsDisplayed()
    }
}