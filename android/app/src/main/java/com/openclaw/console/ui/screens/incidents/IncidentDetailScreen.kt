package com.openclaw.console.ui.screens.incidents

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.openclaw.console.data.model.Incident
import com.openclaw.console.data.model.IncidentAction
import com.openclaw.console.data.model.IncidentSeverity
import com.openclaw.console.ui.AppViewModel
import com.openclaw.console.ui.components.SeverityBadge
import com.openclaw.console.ui.components.TimeAgoText
import com.openclaw.console.ui.theme.LocalOpenClawColors

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IncidentDetailScreen(
    incidentId: String,
    appViewModel: AppViewModel,
    onBack: () -> Unit
) {
    val incidentRepo by appViewModel.incidentRepository.collectAsState()
    val incident by remember(incidentRepo) {
        derivedStateOf { incidentRepo?.getIncident(incidentId) }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Incident") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { paddingValues ->
        incident?.let { inc ->
            IncidentDetailContent(
                incident = inc,
                modifier = Modifier.padding(paddingValues),
                onAcknowledge = {
                    incidentRepo?.acknowledgeIncidentLocally(incidentId)
                    onBack()
                }
            )
        } ?: run {
            Box(
                modifier = Modifier.fillMaxSize().padding(paddingValues),
                contentAlignment = androidx.compose.ui.Alignment.Center
            ) {
                Text(
                    "Incident not found",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
private fun IncidentDetailContent(
    incident: Incident,
    modifier: Modifier = Modifier,
    onAcknowledge: () -> Unit
) {
    val colors = LocalOpenClawColors.current
    val (bannerColor, onBannerColor) = when (incident.severity) {
        IncidentSeverity.CRITICAL -> colors.severityCritical to androidx.compose.ui.graphics.Color.White
        IncidentSeverity.WARNING -> colors.severityWarning to androidx.compose.ui.graphics.Color.White
        IncidentSeverity.INFO -> colors.severityInfo to androidx.compose.ui.graphics.Color.White
    }

    androidx.compose.foundation.lazy.LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 24.dp)
    ) {
        // Severity banner
        item {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                color = bannerColor
            ) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    val icon = when (incident.severity) {
                        IncidentSeverity.CRITICAL -> Icons.Default.Error
                        IncidentSeverity.WARNING -> Icons.Default.Warning
                        IncidentSeverity.INFO -> Icons.Default.Info
                    }
                    Icon(icon, contentDescription = null, tint = onBannerColor, modifier = Modifier.size(28.dp))
                    Column {
                        Text(
                            text = incident.title,
                            style = MaterialTheme.typography.titleMedium,
                            color = onBannerColor
                        )
                        Text(
                            text = "Agent: ${incident.agentName}",
                            style = MaterialTheme.typography.bodySmall,
                            color = onBannerColor.copy(alpha = 0.8f)
                        )
                    }
                }
            }
        }

        // Metadata row
        item {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                SeverityBadge(severity = incident.severity)
                Column {
                    Text("Status", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(
                        text = incident.status.name.lowercase().replaceFirstChar { it.uppercase() },
                        style = MaterialTheme.typography.bodySmall
                    )
                }
                Column {
                    Text("Reported", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    TimeAgoText(incident.createdAt, style = MaterialTheme.typography.bodySmall)
                }
            }
        }

        item { HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp)) }

        // Description
        item {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Text(
                    text = "Description",
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                    text = incident.description,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        item { HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp)) }

        // Action buttons
        item {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    text = "Actions",
                    style = MaterialTheme.typography.titleSmall
                )

                if (incident.actions.contains(IncidentAction.ASK_ROOT_CAUSE)) {
                    OutlinedButton(
                        onClick = { /* Navigate to chat with "What is the root cause?" — handled in parent if needed */ },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(Icons.Default.Search, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Ask Root Cause")
                    }
                }

                if (incident.actions.contains(IncidentAction.PROPOSE_FIX)) {
                    OutlinedButton(
                        onClick = { /* Navigate to chat with "Propose a fix for this incident" — handled in parent if needed */ },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(Icons.Default.Build, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Propose Fix")
                    }
                }

                if (incident.actions.contains(IncidentAction.ACKNOWLEDGE)) {
                    Button(
                        onClick = onAcknowledge,
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.primaryContainer,
                            contentColor = MaterialTheme.colorScheme.onPrimaryContainer
                        )
                    ) {
                        Icon(Icons.Default.CheckCircle, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Acknowledge")
                    }
                }
            }
        }
    }
}
