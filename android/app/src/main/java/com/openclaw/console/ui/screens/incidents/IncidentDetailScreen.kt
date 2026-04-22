package com.openclaw.console.ui.screens.incidents

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Memory
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.openclaw.console.data.model.Incident
import com.openclaw.console.data.model.IncidentAction
import com.openclaw.console.data.model.IncidentSeverity
import com.openclaw.console.data.model.IncidentStatus
import com.openclaw.console.ui.AppViewModel
import com.openclaw.console.ui.components.TimeAgoText
import com.openclaw.console.ui.theme.LocalOpenClawColors
import kotlinx.coroutines.launch

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun IncidentDetailScreen(
    incidentId: String,
    appViewModel: AppViewModel,
    onBack: () -> Unit
) {
    val incidentRepo by appViewModel.incidentRepository.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val incident by remember(incidentRepo) {
        derivedStateOf { incidentRepo?.getIncident(incidentId) }
    }
    var isActioning by remember { mutableStateOf(false) }
    var actionError by remember { mutableStateOf<String?>(null) }
    var actionConfirmation by remember { mutableStateOf<String?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(incident?.title ?: "Incident") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { paddingValues ->
        incident?.let { currentIncident ->
            IncidentDetailContent(
                incident = currentIncident,
                modifier = Modifier.padding(paddingValues),
                isActioning = isActioning,
                actionError = actionError,
                actionConfirmation = actionConfirmation,
                onAction = { action ->
                    actionError = null
                    actionConfirmation = null
                    scope.launch {
                        isActioning = true
                        val result = incidentRepo?.triggerAction(currentIncident, action)
                        isActioning = false
                        result
                            ?.onSuccess {
                                actionConfirmation = "Request sent to ${currentIncident.agentName}."
                            }
                            ?.onFailure { error ->
                                actionError = error.message ?: "Failed to send request"
                            }
                    }
                }
            )
        } ?: run {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues),
                contentAlignment = Alignment.Center
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
    isActioning: Boolean,
    actionError: String?,
    actionConfirmation: String?,
    onAction: (IncidentAction) -> Unit
) {
    val colors = LocalOpenClawColors.current
    val bannerColor = when (incident.severity) {
        IncidentSeverity.CRITICAL -> colors.severityCritical
        IncidentSeverity.WARNING -> colors.severityWarning
        IncidentSeverity.INFO -> colors.severityInfo
    }

    Box(modifier = modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(10.dp),
                color = bannerColor.copy(alpha = 0.12f)
            ) {
                Row(
                    modifier = Modifier.padding(14.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = incident.severity.icon,
                        contentDescription = null,
                        tint = bannerColor,
                        modifier = Modifier.size(22.dp)
                    )
                    Text(
                        text = incident.severity.displayName,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = bannerColor
                    )
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Default.Info,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(18.dp)
                    )
                    Text(
                        text = "Status",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Spacer(modifier = Modifier.weight(1f))
                Text(
                    text = incident.status.displayName,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium
                )
            }

            DetailSection(title = "Description") {
                SelectionContainer {
                    Text(
                        text = incident.description,
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
            }

            DetailSection(title = "Owning Agent") {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Default.Memory,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary
                    )
                    Text(
                        text = incident.agentName,
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Medium
                    )
                    Spacer(modifier = Modifier.weight(1f))
                    TimeAgoText(incident.createdAt, style = MaterialTheme.typography.bodySmall)
                }
            }

            HorizontalDivider()

            DetailSection(title = "Actions") {
                if (incident.status == IncidentStatus.RESOLVED) {
                    Text(
                        text = "This incident has been resolved.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        incident.actions.forEach { action ->
                            OutlinedButton(
                                onClick = { onAction(action) },
                                modifier = Modifier.fillMaxWidth(),
                                enabled = !isActioning,
                                colors = ButtonDefaults.outlinedButtonColors(
                                    contentColor = if (action == IncidentAction.ACKNOWLEDGE) {
                                        Color(0xFF1B8A3B)
                                    } else {
                                        MaterialTheme.colorScheme.primary
                                    }
                                )
                            ) {
                                Icon(
                                    imageVector = action.icon,
                                    contentDescription = null,
                                    modifier = Modifier.size(18.dp)
                                )
                                Spacer(modifier = Modifier.size(8.dp))
                                Text(action.displayName)
                            }
                        }
                    }
                }
            }

            actionError?.let { error ->
                MessageRow(
                    text = error,
                    icon = Icons.Default.Error,
                    color = MaterialTheme.colorScheme.error
                )
            }

            actionConfirmation?.let { confirmation ->
                MessageRow(
                    text = confirmation,
                    icon = Icons.Default.CheckCircle,
                    color = Color(0xFF1B8A3B)
                )
            }
        }

        if (isActioning) {
            Surface(
                modifier = Modifier.align(Alignment.Center),
                shape = RoundedCornerShape(12.dp),
                tonalElevation = 6.dp,
                shadowElevation = 6.dp
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 18.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        strokeWidth = 2.dp
                    )
                    Text("Processing…")
                }
            }
        }
    }
}

@Composable
private fun DetailSection(
    title: String,
    content: @Composable ColumnScope.() -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            text = title,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        content()
    }
}

@Composable
private fun MessageRow(
    text: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    color: Color
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(16.dp))
        Text(
            text = text,
            style = MaterialTheme.typography.bodySmall,
            color = color
        )
    }
}

private val IncidentSeverity.displayName: String
    get() = when (this) {
        IncidentSeverity.CRITICAL -> "Critical"
        IncidentSeverity.WARNING -> "Warning"
        IncidentSeverity.INFO -> "Info"
    }

private val IncidentSeverity.icon
    get() = when (this) {
        IncidentSeverity.CRITICAL -> Icons.Default.Error
        IncidentSeverity.WARNING -> Icons.Default.Warning
        IncidentSeverity.INFO -> Icons.Default.Info
    }

private val IncidentStatus.displayName: String
    get() = when (this) {
        IncidentStatus.OPEN -> "Open"
        IncidentStatus.ACKNOWLEDGED -> "Acknowledged"
        IncidentStatus.RESOLVED -> "Resolved"
    }

private val IncidentAction.displayName: String
    get() = when (this) {
        IncidentAction.ASK_ROOT_CAUSE -> "Ask Root Cause"
        IncidentAction.PROPOSE_FIX -> "Propose Fix"
        IncidentAction.ACKNOWLEDGE -> "Acknowledge"
    }

private val IncidentAction.icon
    get() = when (this) {
        IncidentAction.ASK_ROOT_CAUSE -> Icons.Default.Search
        IncidentAction.PROPOSE_FIX -> Icons.Default.Build
        IncidentAction.ACKNOWLEDGE -> Icons.Default.CheckCircle
    }
