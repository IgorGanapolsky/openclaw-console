package com.openclaw.console.ui.screens.deployments

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.openclaw.console.data.model.*
import com.openclaw.console.ui.components.TimeAgoText

@Composable
fun DeploymentListItem(
    deployment: Deployment,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .clickable { onClick() },
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Header row with title and status
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = deployment.title,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )

                    if (deployment.description.isNotEmpty()) {
                        Text(
                            text = deployment.description,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.padding(top = 2.dp)
                        )
                    }
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    DeploymentStatusBadge(status = deployment.status)

                    if (deployment.status == DeploymentStatus.RUNNING) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(16.dp),
                            strokeWidth = 2.dp
                        )
                    }
                }
            }

            // Environment, platform, and branch badges
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Environment badge
                AssistChip(
                    onClick = { },
                    label = {
                        Text(
                            text = deployment.environment.displayName,
                            style = MaterialTheme.typography.labelSmall
                        )
                    },
                    leadingIcon = {
                        Icon(
                            imageVector = when (deployment.environment) {
                                DeploymentEnvironment.STAGING -> Icons.Default.Science
                                DeploymentEnvironment.PRODUCTION -> Icons.Default.Public
                            },
                            contentDescription = null,
                            modifier = Modifier.size(16.dp)
                        )
                    },
                    colors = AssistChipDefaults.assistChipColors(
                        containerColor = getEnvironmentColor(deployment.environment).copy(alpha = 0.1f),
                        labelColor = getEnvironmentColor(deployment.environment)
                    )
                )

                // Platform badge
                AssistChip(
                    onClick = { },
                    label = {
                        Text(
                            text = deployment.platform.displayName,
                            style = MaterialTheme.typography.labelSmall
                        )
                    },
                    leadingIcon = {
                        Icon(
                            imageVector = when (deployment.platform) {
                                DeploymentPlatform.IOS -> Icons.Default.PhoneIphone
                                DeploymentPlatform.ANDROID -> Icons.Default.PhoneAndroid
                                DeploymentPlatform.BOTH -> Icons.Default.Devices
                            },
                            contentDescription = null,
                            modifier = Modifier.size(16.dp)
                        )
                    },
                    colors = AssistChipDefaults.assistChipColors(
                        containerColor = MaterialTheme.colorScheme.surfaceVariant,
                        labelColor = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                )
            }

            // Git info and timing
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Source,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        text = "${deployment.branch} (${deployment.shortCommit})",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontWeight = FontWeight.Medium
                    )
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Schedule,
                        contentDescription = null,
                        modifier = Modifier.size(14.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    TimeAgoText(
                        timestamp = deployment.createdAt,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            // Progress indicator for running deployments
            if (deployment.status == DeploymentStatus.RUNNING && deployment.steps.isNotEmpty()) {
                val completedSteps = deployment.steps.count { it.status == DeploymentStatus.COMPLETED }
                val totalSteps = deployment.steps.size

                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = "Progress",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Text(
                            text = "$completedSteps / $totalSteps steps",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }

                    LinearProgressIndicator(
                        progress = { if (totalSteps > 0) completedSteps.toFloat() / totalSteps else 0f },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }

            // Duration for completed deployments
            if (deployment.status.isComplete && deployment.duration != null) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Timer,
                        contentDescription = null,
                        modifier = Modifier.size(14.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        text = "Duration: ${formatDuration(deployment.duration!!)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

@Composable
fun DeploymentStatusBadge(
    status: DeploymentStatus,
    modifier: Modifier = Modifier
) {
    val colors = getStatusColors(status)

    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.small,
        color = colors.container
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Icon(
                imageVector = when (status) {
                    DeploymentStatus.PENDING -> Icons.Default.Schedule
                    DeploymentStatus.RUNNING -> Icons.Default.PlayArrow
                    DeploymentStatus.COMPLETED -> Icons.Default.CheckCircle
                    DeploymentStatus.FAILED -> Icons.Default.Error
                    DeploymentStatus.CANCELLED -> Icons.Default.Cancel
                },
                contentDescription = null,
                modifier = Modifier.size(12.dp),
                tint = colors.onContainer
            )

            Text(
                text = status.displayName,
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Medium,
                color = colors.onContainer
            )
        }
    }
}

private data class StatusColors(
    val container: Color,
    val onContainer: Color
)

@Composable
private fun getStatusColors(status: DeploymentStatus): StatusColors {
    return when (status) {
        DeploymentStatus.PENDING -> StatusColors(
            container = MaterialTheme.colorScheme.primaryContainer,
            onContainer = MaterialTheme.colorScheme.onPrimaryContainer
        )
        DeploymentStatus.RUNNING -> StatusColors(
            container = Color(0xFFFFF3E0), // Orange container
            onContainer = Color(0xFFEF6C00)  // Orange on container
        )
        DeploymentStatus.COMPLETED -> StatusColors(
            container = Color(0xFFE8F5E8), // Green container
            onContainer = Color(0xFF2E7D32)  // Green on container
        )
        DeploymentStatus.FAILED -> StatusColors(
            container = MaterialTheme.colorScheme.errorContainer,
            onContainer = MaterialTheme.colorScheme.onErrorContainer
        )
        DeploymentStatus.CANCELLED -> StatusColors(
            container = MaterialTheme.colorScheme.surfaceVariant,
            onContainer = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun getEnvironmentColor(environment: DeploymentEnvironment): Color {
    return when (environment) {
        DeploymentEnvironment.STAGING -> MaterialTheme.colorScheme.primary
        DeploymentEnvironment.PRODUCTION -> Color(0xFFD32F2F) // Red
    }
}

private fun formatDuration(durationMs: Long): String {
    val minutes = durationMs / 60000
    val seconds = (durationMs % 60000) / 1000
    return when {
        minutes > 0 -> "${minutes}m ${seconds}s"
        else -> "${seconds}s"
    }
}