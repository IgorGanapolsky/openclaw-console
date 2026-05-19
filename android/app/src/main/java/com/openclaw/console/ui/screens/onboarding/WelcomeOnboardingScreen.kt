package com.openclaw.console.ui.screens.onboarding

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import com.openclaw.console.R
import com.openclaw.console.service.AnalyticsService
import com.openclaw.console.ui.theme.LocalOpenClawColors

@Composable
fun WelcomeOnboardingScreen(
    onAddGateway: () -> Unit
) {
    val openClaw = LocalOpenClawColors.current
    val clipboardManager = LocalClipboardManager.current

    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 24.dp)
    ) {
        Column(
            modifier = Modifier.fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Spacer(modifier = Modifier.weight(1f))

            Surface(
                shape = RoundedCornerShape(32.dp),
                color = openClaw.cardBackground,
                tonalElevation = 6.dp,
                shadowElevation = 8.dp
            ) {
                Image(
                    painter = painterResource(id = R.mipmap.ic_launcher_foreground),
                    contentDescription = "OpenClaw Console icon",
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .size(112.dp)
                        .clip(RoundedCornerShape(28.dp))
                )
            }

            Spacer(modifier = Modifier.height(28.dp))

            Text(
                text = "OpenClaw Console",
                style = MaterialTheme.typography.headlineLarge,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(12.dp))

            Text(
                text = "Before scanning QR codes, you need to run this command on your computer:",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.error,
                textAlign = TextAlign.Center,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(modifier = Modifier.height(24.dp))

            // Command card - FIRST THING USERS SEE
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer
                )
            ) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Icon(
                        imageVector = Icons.Default.Terminal,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onPrimaryContainer,
                        modifier = Modifier.size(32.dp)
                    )

                    Spacer(modifier = Modifier.height(16.dp))

                    Text(
                        text = "STEP 1: Run this on your computer",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onPrimaryContainer
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = MaterialTheme.colorScheme.surface,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier.padding(16.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "openclaw qr --remote",
                                style = MaterialTheme.typography.bodyMedium,
                                fontFamily = FontFamily.Monospace,
                                modifier = Modifier.weight(1f)
                            )
                            IconButton(
                                onClick = {
                                    clipboardManager.setText(AnnotatedString("openclaw qr --remote"))
                                },
                                modifier = Modifier.size(32.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.ContentCopy,
                                    contentDescription = "Copy command",
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    Text(
                        text = "This will show a QR code that you scan with this app",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.8f),
                        textAlign = TextAlign.Center
                    )
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            Button(
                onClick = {
                    // 2026 Observability: Track critical QR scanner button interaction
                    AnalyticsService.trackUIInteraction(
                        action = "click",
                        screen = "WelcomeOnboardingScreen",
                        elementId = "qr_scanner_button",
                        additionalContext = mapOf(
                            "button_text" to "STEP 2: Scan QR Code",
                            "expected_flow" to "navigate_to_setup_wizard",
                            "user_reported_issue" to "button_does_nothing_camera_never_appears"
                        )
                    )

                    try {
                        onAddGateway()

                        // Track successful navigation
                        AnalyticsService.trackNavigation(
                            from = "WelcomeOnboardingScreen",
                            to = "SetupWizardScreen",
                            success = true
                        )
                    } catch (e: Exception) {
                        // Track navigation failures
                        AnalyticsService.trackNavigation(
                            from = "WelcomeOnboardingScreen",
                            to = "SetupWizardScreen",
                            success = false,
                            errorMessage = e.message
                        )

                        // Critical error alert for regression
                        AnalyticsService.trackCriticalButtonIssue(
                            buttonId = "qr_scanner_button",
                            screen = "WelcomeOnboardingScreen",
                            issueDescription = "Navigation failure - button click doesn't open camera",
                            userAction = "tap_step_2_scan_qr_code"
                        )

                        // Still track the error
                        AnalyticsService.trackError(
                            error = e,
                            screen = "WelcomeOnboardingScreen",
                            action = "qr_scanner_button_click"
                        )
                    }
                },
                shape = RoundedCornerShape(20.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.QrCodeScanner,
                    contentDescription = null
                )
                Spacer(modifier = Modifier.size(8.dp))
                Text(
                    text = "STEP 2: Scan QR Code",
                    style = MaterialTheme.typography.titleMedium
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            OutlinedButton(
                onClick = { /* TODO: Open documentation */ },
                shape = RoundedCornerShape(20.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.HelpOutline,
                    contentDescription = null
                )
                Spacer(modifier = Modifier.size(8.dp))
                Text("Documentation")
            }

            Spacer(modifier = Modifier.weight(1f))
        }
    }
}

@Composable
private fun FeatureRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    text: String
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth()
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(20.dp)
        )
        Spacer(modifier = Modifier.width(16.dp))
        Text(
            text = text,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}
