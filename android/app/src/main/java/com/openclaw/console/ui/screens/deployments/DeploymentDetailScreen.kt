package com.openclaw.console.ui.screens.deployments

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.openclaw.console.data.model.*
import com.openclaw.console.ui.AppViewModel
import com.openclaw.console.ui.components.*
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeploymentDetailScreen(
    deploymentId: String,
    appViewModel: AppViewModel,
    onBack: () -> Unit,
    viewModel: DeploymentDetailViewModel = viewModel()
) {
    val deploymentRepo by appViewModel.deploymentRepository.collectAsStateWithLifecycle()

    LaunchedEffect(deploymentId, deploymentRepo) {
        viewModel.init(deploymentId, deploymentRepo)
    }

    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    var showingCancelDialog by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = uiState.deployment?.title ?: "Deployment",
                            style = MaterialTheme.typography.titleMedium
                        )
                        uiState.deployment?.let { deployment ->
                            DeploymentStatusBadge(
                                status = deployment.status,
                                modifier = Modifier.padding(top = 2.dp)
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    uiState.deployment?.let { deployment ->
                        if (deployment.canCancel) {
                            IconButton(onClick = { showingCancelDialog = true }) {
                                Icon(
                                    Icons.Default.Stop,
                                    contentDescription = "Cancel deployment",
                                    tint = MaterialTheme.colorScheme.error
                                )
                            }
                        }
                    }
                }
            )
        }
    ) { paddingValues ->
        when {
            uiState.isLoading && uiState.deployment == null -> {
                Box(
                    modifier = Modifier.fillMaxSize().padding(paddingValues),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator()
                }
            }
            uiState.deployment == null -> {
                Box(
                    modifier = Modifier.fillMaxSize().padding(paddingValues),
                    contentAlignment = Alignment.Center
                ) {
                    EmptyState(
                        title = "Deployment not found",
                        subtitle = "This deployment may have been removed",
                        icon = Icons.Default.ErrorOutline
                    )
                }
            }
            else -> {
                val deployment = uiState.deployment!!
                LazyColumn(
                    modifier = Modifier.fillMaxSize().padding(paddingValues),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    item {
                        DeploymentHeader(deployment = deployment)
                    }

                    if (deployment.artifacts.isNotEmpty()) {
                        item {
                            ArtifactsSection(artifacts = deployment.artifacts)
                        }
                    }

                    if (deployment.steps.isNotEmpty()) {
                        item {
                            StepsSection(steps = deployment.steps)
                        }
                    }

                    // Error message
                    uiState.error?.let { error ->
                        item {
                            Card(
                                colors = CardDefaults.cardColors(
                                    containerColor = MaterialTheme.colorScheme.errorContainer
                                )
                            ) {
                                Text(
                                    text = error,
                                    modifier = Modifier.padding(16.dp),
                                    color = MaterialTheme.colorScheme.onErrorContainer
                                )
                            }
                        }
                    }
                }
            }
        }

        // Cancel confirmation dialog
        if (showingCancelDialog) {
            AlertDialog(
                onDismissRequest = { showingCancelDialog = false },
                title = { Text("Cancel Deployment") },
                text = {
                    Text("Are you sure you want to cancel this deployment? This action cannot be undone.")
                },
                confirmButton = {
                    TextButton(
                        onClick = {
                            viewModel.cancelDeployment()
                            showingCancelDialog = false
                        }
                    ) {
                        Text("Cancel Deployment", color = MaterialTheme.colorScheme.error)
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showingCancelDialog = false }) {
                        Text("Keep Running")
                    }
                }
            )
        }
    }
}

@Composable
private fun DeploymentHeader(deployment: Deployment) {
    Card(
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Environment and platform badges
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                AssistChip(
                    onClick = { },
                    label = { Text(deployment.environment.displayName) },
                    leadingIcon = {
                        Icon(
                            imageVector = when (deployment.environment) {
                                DeploymentEnvironment.STAGING -> Icons.Default.Science
                                DeploymentEnvironment.PRODUCTION -> Icons.Default.Public
                            },
                            contentDescription = null,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                )

                AssistChip(
                    onClick = { },
                    label = { Text(deployment.platform.displayName) },
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
                    }
                )
            }

            // Description
            if (deployment.description.isNotEmpty()) {
                Text(
                    text = deployment.description,
                    style = MaterialTheme.typography.bodyMedium
                )
            }

            // Git information
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Default.Source,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "${deployment.branch} (${deployment.shortCommit})",
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium
                    )
                }

                Text(
                    text = deployment.commitMessage,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(start = 24.dp)
                )
            }

            // Timing information
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                TimingInfo(
                    label = "Created",
                    timestamp = deployment.createdAt
                )

                deployment.startedAt?.let { startedAt ->
                    TimingInfo(
                        label = "Started",
                        timestamp = startedAt
                    )
                }

                deployment.completedAt?.let { completedAt ->
                    TimingInfo(
                        label = "Completed",
                        timestamp = completedAt
                    )
                }
            }

            // Duration
            deployment.duration?.let { duration ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Default.Timer,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Duration: ${formatDuration(duration)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

@Composable
private fun TimingInfo(label: String, timestamp: Instant) {
    Column {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        TimeAgoText(
            timestamp = timestamp,
            style = MaterialTheme.typography.bodySmall
        )
    }
}

@Composable
private fun ArtifactsSection(artifacts: List<DeploymentArtifact>) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Archive, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Artifacts",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold
                    )
                }
                Text(
                    text = "${artifacts.size}",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            artifacts.forEach { artifact ->
                ArtifactItem(artifact = artifact)
            }
        }
    }
}

@Composable
private fun ArtifactItem(artifact: DeploymentArtifact) {
    val uriHandler = LocalUriHandler.current

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .then(
                if (artifact.downloadURL != null) {
                    Modifier.clickable { artifact.downloadURL?.let { uriHandler.openUri(it) } }
                } else Modifier
            ),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            Icons.Default.InsertDriveFile,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(24.dp)
        )

        Spacer(modifier = Modifier.width(12.dp))

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = artifact.name,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium
            )
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    text = artifact.platform.displayName,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text("•", color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(
                    text = "v${artifact.version} (${artifact.buildNumber})",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text("•", color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(
                    text = artifact.getFormattedSize(),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        if (artifact.downloadURL != null) {
            Icon(
                Icons.Default.Download,
                contentDescription = "Download",
                tint = MaterialTheme.colorScheme.primary
            )
        }
    }
}

@Composable
private fun StepsSection(steps: List<DeploymentStep>) {
    val sortedSteps = steps.sortedWith(compareBy<DeploymentStep> { it.startedAt }.thenBy { it.id })

    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.List, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Steps",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold
                    )
                }
                Text(
                    text = "${steps.size}",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            sortedSteps.forEachIndexed { index, step ->
                DeploymentStepItem(
                    step = step,
                    isLast = index == sortedSteps.size - 1
                )
            }
        }
    }
}

@Composable
private fun DeploymentStepItem(
    step: DeploymentStep,
    isLast: Boolean
) {
    val statusColor = getStepStatusColor(step.status)
    var showLogs by remember { mutableStateOf(false) }

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Timeline indicator
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.width(24.dp)
        ) {
            Surface(
                modifier = Modifier.size(16.dp),
                shape = MaterialTheme.shapes.small,
                color = statusColor
            ) {
                Icon(
                    imageVector = getStepStatusIcon(step.status),
                    contentDescription = null,
                    modifier = Modifier.padding(2.dp).size(12.dp),
                    tint = Color.White
                )
            }

            if (!isLast) {
                Canvas(
                    modifier = Modifier
                        .width(2.dp)
                        .height(40.dp)
                ) {
                    drawLine(
                        color = statusColor.copy(alpha = 0.3f),
                        start = Offset(size.width / 2, 0f),
                        end = Offset(size.width / 2, size.height),
                        strokeWidth = 2.dp.toPx()
                    )
                }
            }
        }

        // Step content
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = step.name,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.weight(1f)
                )

                step.startedAt?.let { startedAt ->
                    TimeAgoText(
                        timestamp = startedAt,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            Text(
                text = step.description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            step.duration?.let { duration ->
                Text(
                    text = "Duration: ${formatDuration(duration)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            step.error?.let { error ->
                Text(
                    text = error,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(8.dp)
                        .background(
                            MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.1f),
                            MaterialTheme.shapes.small
                        )
                        .padding(8.dp)
                )
            }

            if (step.logs.isNotEmpty()) {
                TextButton(
                    onClick = { showLogs = !showLogs },
                    modifier = Modifier.padding(start = 0.dp)
                ) {
                    Icon(
                        if (showLogs) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Logs (${step.logs.size})")
                }

                if (showLogs) {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.surfaceVariant
                        )
                    ) {
                        Column(
                            modifier = Modifier.padding(12.dp),
                            verticalArrangement = Arrangement.spacedBy(2.dp)
                        ) {
                            step.logs.forEach { log ->
                                Text(
                                    text = log,
                                    style = MaterialTheme.typography.bodySmall,
                                    fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun getStepStatusColor(status: DeploymentStatus): Color {
    return when (status) {
        DeploymentStatus.PENDING -> MaterialTheme.colorScheme.primary
        DeploymentStatus.RUNNING -> Color(0xFFFF9800) // Orange
        DeploymentStatus.COMPLETED -> Color(0xFF4CAF50) // Green
        DeploymentStatus.FAILED -> MaterialTheme.colorScheme.error
        DeploymentStatus.CANCELLED -> MaterialTheme.colorScheme.onSurfaceVariant
    }
}

private fun getStepStatusIcon(status: DeploymentStatus): ImageVector {
    return when (status) {
        DeploymentStatus.PENDING -> Icons.Default.Schedule
        DeploymentStatus.RUNNING -> Icons.Default.PlayArrow
        DeploymentStatus.COMPLETED -> Icons.Default.Check
        DeploymentStatus.FAILED -> Icons.Default.Close
        DeploymentStatus.CANCELLED -> Icons.Default.Cancel
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