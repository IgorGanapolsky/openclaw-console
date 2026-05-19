package com.openclaw.console.ui.components

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

data class SetupStep(
    val id: String,
    val title: String,
    val description: String,
    val icon: ImageVector,
    val isCompleted: Boolean = false
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SetupWizard(
    steps: List<SetupStep>,
    currentStepIndex: Int,
    modifier: Modifier = Modifier,
    onStepClick: (Int) -> Unit = {}
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .padding(16.dp),
        shape = RoundedCornerShape(20.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
    ) {
        Column(
            modifier = Modifier.padding(24.dp)
        ) {
            // Header
            Text(
                text = "Setup Progress",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(modifier = Modifier.height(24.dp))

            // Progress indicator
            LinearProgressIndicator(
                progress = { (currentStepIndex + 1) / steps.size.toFloat() },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(8.dp)
                    .clip(RoundedCornerShape(4.dp)),
                color = MaterialTheme.colorScheme.primary,
                trackColor = MaterialTheme.colorScheme.surfaceVariant,
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = "Step ${currentStepIndex + 1} of ${steps.size}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(modifier = Modifier.height(32.dp))

            // Steps list
            steps.forEachIndexed { index, step ->
                SetupStepItem(
                    step = step,
                    isActive = index == currentStepIndex,
                    isCompleted = step.isCompleted || index < currentStepIndex,
                    onClick = { onStepClick(index) }
                )

                if (index < steps.lastIndex) {
                    // Connection line between steps
                    Box(
                        modifier = Modifier
                            .padding(start = 28.dp)
                            .width(2.dp)
                            .height(24.dp)
                            .background(
                                color = if (step.isCompleted || index < currentStepIndex) {
                                    MaterialTheme.colorScheme.primary
                                } else {
                                    MaterialTheme.colorScheme.surfaceVariant
                                },
                                shape = RoundedCornerShape(1.dp)
                            )
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SetupStepItem(
    step: SetupStep,
    isActive: Boolean,
    isCompleted: Boolean,
    onClick: () -> Unit
) {
    val animatedScale by animateFloatAsState(
        targetValue = if (isActive) 1.05f else 1f,
        animationSpec = tween(200)
    )

    Card(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        colors = CardDefaults.cardColors(
            containerColor = when {
                isActive -> MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f)
                isCompleted -> MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                else -> Color.Transparent
            }
        ),
        border = if (isActive) {
            BorderStroke(2.dp, MaterialTheme.colorScheme.primary)
        } else null,
        elevation = CardDefaults.cardElevation(
            defaultElevation = if (isActive) 4.dp else 0.dp
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Step icon/number
            Box(
                modifier = Modifier
                    .size(56.dp)
                    .background(
                        color = when {
                            isCompleted -> MaterialTheme.colorScheme.primary
                            isActive -> MaterialTheme.colorScheme.primaryContainer
                            else -> MaterialTheme.colorScheme.surfaceVariant
                        },
                        shape = CircleShape
                    )
                    .border(
                        width = if (isActive) 3.dp else 0.dp,
                        color = MaterialTheme.colorScheme.primary,
                        shape = CircleShape
                    ),
                contentAlignment = Alignment.Center
            ) {
                if (isCompleted) {
                    Icon(
                        imageVector = Icons.Default.CheckCircle,
                        contentDescription = "Completed",
                        tint = MaterialTheme.colorScheme.onPrimary,
                        modifier = Modifier.size(32.dp)
                    )
                } else {
                    Icon(
                        imageVector = step.icon,
                        contentDescription = step.title,
                        tint = when {
                            isActive -> MaterialTheme.colorScheme.onPrimaryContainer
                            else -> MaterialTheme.colorScheme.onSurfaceVariant
                        },
                        modifier = Modifier.size(28.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.width(16.dp))

            // Step content
            Column(
                modifier = Modifier.weight(1f)
            ) {
                Text(
                    text = step.title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = if (isActive) FontWeight.Bold else FontWeight.Normal,
                    color = when {
                        isCompleted -> MaterialTheme.colorScheme.onSurface.copy(alpha = 0.8f)
                        isActive -> MaterialTheme.colorScheme.onSurface
                        else -> MaterialTheme.colorScheme.onSurfaceVariant
                    }
                )

                Spacer(modifier = Modifier.height(4.dp))

                Text(
                    text = step.description,
                    style = MaterialTheme.typography.bodySmall,
                    color = when {
                        isCompleted -> MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                        isActive -> MaterialTheme.colorScheme.onSurfaceVariant
                        else -> MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
                    }
                )
            }

            // Status indicator
            if (isActive && !isCompleted) {
                CircularProgressIndicator(
                    modifier = Modifier.size(24.dp),
                    strokeWidth = 3.dp,
                    color = MaterialTheme.colorScheme.primary
                )
            }
        }
    }
}

@Composable
fun OpenClawSetupWizard(
    currentStep: Int,
    completedSteps: Set<String> = emptySet(),
    modifier: Modifier = Modifier,
    onStepClick: (Int) -> Unit = {}
) {
    val steps = listOf(
        SetupStep(
            id = "install",
            title = "Install OpenClaw",
            description = "Install OpenClaw CLI on your computer",
            icon = Icons.Default.Computer,
            isCompleted = completedSteps.contains("install")
        ),
        SetupStep(
            id = "gateway",
            title = "Start Gateway",
            description = "Run openclaw gateway start --mobile-console",
            icon = Icons.Default.Router,
            isCompleted = completedSteps.contains("gateway")
        ),
        SetupStep(
            id = "connect",
            title = "Connect Mobile App",
            description = "Scan QR code or enter gateway URL",
            icon = Icons.Default.QrCodeScanner,
            isCompleted = completedSteps.contains("connect")
        ),
        SetupStep(
            id = "biometric",
            title = "Enable Security",
            description = "Set up biometric authentication",
            icon = Icons.Default.Security,
            isCompleted = completedSteps.contains("biometric")
        ),
        SetupStep(
            id = "complete",
            title = "Ready to Use",
            description = "Start approving agent actions securely",
            icon = Icons.Default.Celebration,
            isCompleted = completedSteps.contains("complete")
        )
    )

    SetupWizard(
        steps = steps,
        currentStepIndex = currentStep,
        modifier = modifier,
        onStepClick = onStepClick
    )
}