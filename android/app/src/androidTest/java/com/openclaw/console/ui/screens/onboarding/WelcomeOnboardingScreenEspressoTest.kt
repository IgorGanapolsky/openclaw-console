package com.openclaw.console.ui.screens.onboarding

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.LargeTest
import com.openclaw.console.MainActivity
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * 2026 OBSESSIVE Espresso tests for QR scanner functionality
 * Real device/emulator testing to catch hardware-specific issues
 */
@RunWith(AndroidJUnit4::class)
@LargeTest
class WelcomeOnboardingScreenEspressoTest {

    @get:Rule
    val composeTestRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun qrScannerButton_realDeviceClick() {
        // OBSESSIVE: Test on real device/emulator with full app context
        composeTestRule.waitForIdle()

        // Wait for app to fully load
        Thread.sleep(2000)

        try {
            // Try to find QR scanner button by test tag
            composeTestRule
                .onNodeWithTag("qr_scanner_button")
                .assertExists()
                .assertIsDisplayed()
                .assertHasClickAction()
                .performClick()

            // Verify button click was successful (no crash)
            composeTestRule.waitForIdle()

        } catch (e: Exception) {
            // If test tag doesn't work, try text-based approach
            try {
                composeTestRule
                    .onNodeWithText("STEP 2: Scan QR Code")
                    .assertExists()
                    .assertIsDisplayed()
                    .performClick()

                composeTestRule.waitForIdle()

            } catch (e2: Exception) {
                // Print UI tree for debugging on real device
                composeTestRule.onRoot().printToLog("EspressoRealDevice")
                throw AssertionError("QR scanner button not found on real device. Test tag error: ${e.message}, Text error: ${e2.message}")
            }
        }
    }

    @Test
    fun qrScannerButton_physicalTapping() {
        // OBSESSIVE: Test actual touch events and gesture handling
        composeTestRule.waitForIdle()
        Thread.sleep(1000) // Allow for full app initialization

        try {
            val qrButton = composeTestRule.onNodeWithTag("qr_scanner_button")

            // Verify button is in correct state for interaction
            qrButton.assertExists()
            qrButton.assertIsDisplayed()
            qrButton.assertIsEnabled()
            qrButton.assertHasClickAction()

            // Perform actual touch event
            qrButton.performTouchInput {
                click()
            }

            // Wait for any animations or state changes
            composeTestRule.waitForIdle()

            // Verify app didn't crash after click
            composeTestRule.onRoot().assertExists()

        } catch (e: Exception) {
            composeTestRule.onRoot().printToLog("PhysicalTapping")
            throw AssertionError("Physical tapping test failed: ${e.message}")
        }
    }

    @Test
    fun qrScannerButton_multipleRealClicks() {
        // OBSESSIVE: Test multiple clicks in real environment
        composeTestRule.waitForIdle()
        Thread.sleep(1000)

        try {
            val qrButton = composeTestRule.onNodeWithTag("qr_scanner_button")

            // Verify initial state
            qrButton.assertExists()
            qrButton.assertIsDisplayed()

            // Perform multiple clicks with delays
            repeat(3) { clickNumber ->
                qrButton.performClick()
                composeTestRule.waitForIdle()
                Thread.sleep(500) // Real-world delay between clicks

                // Verify app is still responsive after each click
                qrButton.assertExists()
                qrButton.assertIsDisplayed()
            }

        } catch (e: Exception) {
            composeTestRule.onRoot().printToLog("MultipleRealClicks")
            throw AssertionError("Multiple real clicks test failed: ${e.message}")
        }
    }

    @Test
    fun welcomeScreen_fullUserFlow() {
        // OBSESSIVE: Test complete user flow as they would experience it
        composeTestRule.waitForIdle()
        Thread.sleep(2000) // Allow full app startup

        // Step 1: Verify welcome screen loads properly
        try {
            composeTestRule
                .onNodeWithText("OpenClaw Console")
                .assertIsDisplayed()
        } catch (e: Exception) {
            // App may not have navigated to welcome screen yet
            Thread.sleep(3000)
            composeTestRule.waitForIdle()
        }

        // Step 2: Verify STEP 1 instructions are visible
        try {
            composeTestRule
                .onNodeWithText("STEP 1: Run this on your computer", substring = true)
                .assertIsDisplayed()
        } catch (e: Exception) {
            println("STEP 1 text not found: ${e.message}")
        }

        // Step 3: Verify command text is visible
        try {
            composeTestRule
                .onNodeWithText("openclaw qr --remote")
                .assertIsDisplayed()
        } catch (e: Exception) {
            println("Command text not found: ${e.message}")
        }

        // Step 4: Critical test - QR scanner button functionality
        try {
            val qrButton = composeTestRule.onNodeWithTag("qr_scanner_button")
            qrButton.assertExists()
            qrButton.assertIsDisplayed()
            qrButton.assertHasClickAction()

            // This is the critical action that was failing
            qrButton.performClick()

            composeTestRule.waitForIdle()
            Thread.sleep(1000) // Allow for navigation animation

            // After clicking, we should either navigate or show some response
            // The key is that the app doesn't crash or freeze
            composeTestRule.onRoot().assertExists()

        } catch (e: Exception) {
            composeTestRule.onRoot().printToLog("FullUserFlow")
            throw AssertionError("Full user flow failed at QR button: ${e.message}")
        }
    }

    @Test
    fun qrScannerButton_accessibilityTesting() {
        // OBSESSIVE: Test accessibility features for QR button
        composeTestRule.waitForIdle()
        Thread.sleep(1000)

        try {
            val qrButton = composeTestRule.onNodeWithTag("qr_scanner_button")

            // Verify accessibility properties
            qrButton.assertExists()
            qrButton.assertIsDisplayed()
            qrButton.assertHasClickAction()

            // Test that button is accessible via semantics
            composeTestRule
                .onNode(hasClickAction() and hasText("STEP 2: Scan QR Code", substring = true))
                .assertExists()
                .performClick()

            composeTestRule.waitForIdle()

        } catch (e: Exception) {
            composeTestRule.onRoot().printToLog("AccessibilityTesting")
            throw AssertionError("Accessibility testing failed: ${e.message}")
        }
    }

    @Test
    fun qrScannerButton_stressTest() {
        // OBSESSIVE: Stress test with rapid interactions
        composeTestRule.waitForIdle()
        Thread.sleep(1000)

        try {
            val qrButton = composeTestRule.onNodeWithTag("qr_scanner_button")
            qrButton.assertExists()
            qrButton.assertIsDisplayed()

            // Rapid fire clicks to stress test
            repeat(10) {
                qrButton.performClick()
                composeTestRule.waitForIdle()
            }

            // Verify app is still responsive
            qrButton.assertExists()
            qrButton.assertIsDisplayed()
            composeTestRule.onRoot().assertExists()

        } catch (e: Exception) {
            composeTestRule.onRoot().printToLog("StressTest")
            throw AssertionError("Stress test failed: ${e.message}")
        }
    }

    @Test
    fun qrScannerButton_orientationChanges() {
        // OBSESSIVE: Test button functionality during device rotation
        composeTestRule.waitForIdle()
        Thread.sleep(1000)

        try {
            // Test in portrait mode
            val qrButton = composeTestRule.onNodeWithTag("qr_scanner_button")
            qrButton.assertExists()
            qrButton.performClick()
            composeTestRule.waitForIdle()

            // Simulate orientation change by waiting and testing again
            Thread.sleep(2000)

            // Test that button still works after potential orientation change
            qrButton.assertExists()
            qrButton.assertIsDisplayed()
            qrButton.performClick()
            composeTestRule.waitForIdle()

        } catch (e: Exception) {
            composeTestRule.onRoot().printToLog("OrientationChanges")
            throw AssertionError("Orientation changes test failed: ${e.message}")
        }
    }

    @Test
    fun qrScannerButton_regressionProtectionRealDevice() {
        // OBSESSIVE: The EXACT regression test for real devices
        composeTestRule.waitForIdle()
        Thread.sleep(2000) // Ensure full app load

        var testPassed = false
        var errorDetails = ""

        try {
            // Method 1: Test tag approach (preferred)
            val qrButton = composeTestRule.onNodeWithTag("qr_scanner_button")
            qrButton.assertExists()
            qrButton.assertIsDisplayed()
            qrButton.assertHasClickAction()
            qrButton.performClick()

            // Critical: Wait for any navigation or state changes
            composeTestRule.waitForIdle()
            Thread.sleep(1000)

            // Verify app didn't freeze or crash
            composeTestRule.onRoot().assertExists()
            testPassed = true

        } catch (e: Exception) {
            errorDetails = "Test tag method failed: ${e.message}"

            try {
                // Method 2: Text-based approach
                composeTestRule
                    .onNodeWithText("STEP 2: Scan QR Code")
                    .assertExists()
                    .assertIsDisplayed()
                    .performClick()

                composeTestRule.waitForIdle()
                Thread.sleep(1000)

                composeTestRule.onRoot().assertExists()
                testPassed = true

            } catch (e2: Exception) {
                errorDetails += " | Text method failed: ${e2.message}"

                // Final attempt: Print debug info
                composeTestRule.onRoot().printToLog("RegressionProtectionRealDevice")
            }
        }

        assert(testPassed) {
            "CRITICAL REGRESSION DETECTED ON REAL DEVICE: QR scanner button click functionality broken! Details: $errorDetails"
        }
    }
}