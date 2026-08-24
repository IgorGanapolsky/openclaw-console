package com.openclaw.console.ui.components

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import com.openclaw.console.ui.theme.LocalOpenClawColors

data class SetupStep(
    val id: String,
    val title: String,
    val description: String,
    val icon: ImageVector,
    val isCompleted: Boolean = false
)

@Composable
fun SetupWizard(
    steps: List<SetupStep>,
    currentStepIndex: Int,
    modifier: Modifier = Modifier,
    onStepClick: (Int) -> Unit = {}
) {
    val colors = LocalOpenClawColors.current

    Card(
        modifier = modifier
            .fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Header: Step title and step count
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Setup Progress",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                    text = "Step ${currentStepIndex + 1} of ${steps.size}",
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.SemiBold,
                    color = colors.glowCyan
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Sleek horizontal step indicators with connection line
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp),
                contentAlignment = Alignment.Center
            ) {
                // Background connection line
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(3.dp)
                        .background(
                            color = MaterialTheme.colorScheme.surfaceVariant,
                            shape = RoundedCornerShape(1.5.dp)
                        )
                )

                // Foreground active progress connection line
                val progressFraction = if (steps.size > 1) {
                    currentStepIndex.toFloat() / (steps.size - 1).toFloat()
                } else 0f

                Box(
                    modifier = Modifier
                        .fillMaxWidth(progressFraction)
                        .height(3.dp)
                        .align(Alignment.CenterStart)
                        .background(
                            color = MaterialTheme.colorScheme.primary,
                            shape = RoundedCornerShape(1.5.dp)
                        )
                )

                // Row of step circles
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    steps.forEachIndexed { index, step ->
                        val isCompleted = step.isCompleted || index < currentStepIndex
                        val isActive = index == currentStepIndex

                        Box(
                            modifier = Modifier
                                .size(36.dp)
                                .clip(CircleShape)
                                .background(
                                    color = when {
                                        isCompleted -> MaterialTheme.colorScheme.primary
                                        isActive -> MaterialTheme.colorScheme.primaryContainer
                                        else -> MaterialTheme.colorScheme.surfaceVariant
                                    }
                                )
                                .border(
                                    width = if (isActive) 2.dp else 0.dp,
                                    color = colors.glowCyan,
                                    shape = CircleShape
                                )
                                .clickable { onStepClick(index) },
                            contentAlignment = Alignment.Center
                        ) {
                            if (isCompleted) {
                                Icon(
                                    imageVector = Icons.Default.Check,
                                    contentDescription = "Step ${index + 1} completed",
                                    tint = MaterialTheme.colorScheme.onPrimary,
                                    modifier = Modifier.size(18.dp)
                                )
                            } else {
                                Text(
                                    text = (index + 1).toString(),
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = FontWeight.Bold,
                                    color = when {
                                        isActive -> MaterialTheme.colorScheme.onPrimaryContainer
                                        else -> MaterialTheme.colorScheme.onSurfaceVariant
                                    }
                                )
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Subtitle displaying current step title
            val currentStep = steps.getOrNull(currentStepIndex)
            if (currentStep != null) {
                Text(
                    text = currentStep.title,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface,
                    textAlign = TextAlign.Center
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = currentStep.description,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center
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