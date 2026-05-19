package com.openclaw.console.ui.screens.onboarding

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.openclaw.console.ui.theme.OpenClawTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * 2026 Testing - Unit tests for WelcomeOnboardingScreen
 * These tests would have caught the QR scanner button regression
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class WelcomeOnboardingScreenTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun welcomeScreen_displaysCorrectTitle() {
        composeTestRule.setContent {
            OpenClawTheme {
                WelcomeOnboardingScreen(
                    onAddGateway = { /* no-op */ }
                )
            }
        }


        composeTestRule
            .onNodeWithText("OpenClaw Console")
            .assertIsDisplayed()
    }

    @Test
    fun welcomeScreen_displaysQrScannerButton() {
        composeTestRule.setContent {
            OpenClawTheme {
                WelcomeOnboardingScreen(
                    onAddGateway = { /* no-op */ }
                )
            }
        }

        // This test would have caught the button visibility issue
        composeTestRule
            .onNodeWithText("STEP 2: Scan QR Code")
            .assertIsDisplayed()
    }

    @Test
    fun qrScannerButton_triggersNavigationCallback() {
        var navigationCalled = false

        composeTestRule.setContent {
            OpenClawTheme {
                WelcomeOnboardingScreen(
                    onAddGateway = { navigationCalled = true }
                )
            }
        }

        // Wait for composition to complete
        composeTestRule.waitForIdle()

        // This test would have caught the "button does nothing" regression
        composeTestRule
            .onNodeWithText("STEP 2: Scan QR Code")
            .performClick()

        assert(navigationCalled) { "onAddGateway callback should be called when QR button is clicked" }
    }

    @Test
    fun welcomeScreen_displaysCommandCopyButton() {
        composeTestRule.setContent {
            OpenClawTheme {
                WelcomeOnboardingScreen(
                    onAddGateway = { /* no-op */ }
                )
            }
        }

        // Verify the command display and copy functionality
        composeTestRule
            .onNodeWithText("openclaw qr --remote")
            .assertIsDisplayed()
    }

    @Test
    fun welcomeScreen_displaysDocumentationButton() {
        composeTestRule.setContent {
            OpenClawTheme {
                WelcomeOnboardingScreen(
                    onAddGateway = { /* no-op */ }
                )
            }
        }

        composeTestRule
            .onNodeWithText("Documentation")
            .assertIsDisplayed()
    }

    @Test
    fun welcomeScreen_displaysSetupInstructions() {
        composeTestRule.setContent {
            OpenClawTheme {
                WelcomeOnboardingScreen(
                    onAddGateway = { /* no-op */ }
                )
            }
        }

        // Verify the setup flow instructions are clear
        composeTestRule
            .onNodeWithText("STEP 1: Run this on your computer")
            .assertIsDisplayed()

        composeTestRule
            .onNodeWithText("Before scanning QR codes, you need to run this command on your computer:")
            .assertIsDisplayed()
    }
}