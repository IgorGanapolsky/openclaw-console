package com.openclaw.console.ui.screens.incidents

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshContainer
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.openclaw.console.data.model.Incident
import com.openclaw.console.data.model.IncidentStatus
import com.openclaw.console.ui.AppViewModel
import com.openclaw.console.ui.components.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IncidentListScreen(
    appViewModel: AppViewModel,
    onIncidentClick: (String) -> Unit,
    viewModel: IncidentViewModel = viewModel()
) {
    val incidentRepo by appViewModel.incidentRepository.collectAsState()
    val connectionState by appViewModel.connectionState.collectAsState()

    LaunchedEffect(incidentRepo) {
        viewModel.setRepository(incidentRepo)
    }

    val uiState by viewModel.uiState.collectAsState()
    val pullRefreshState = rememberPullToRefreshState()

    if (pullRefreshState.isRefreshing) {
        LaunchedEffect(Unit) {
            viewModel.refresh()
            pullRefreshState.endRefresh()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Incidents") },
                actions = {
                    if (uiState.isLoading) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(24.dp).padding(end = 4.dp),
                            strokeWidth = 2.dp
                        )
                    }
                }
            )
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .nestedScroll(pullRefreshState.nestedScrollConnection)
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                ConnectionStatusBanner(state = connectionState)

                // Filter chips
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    IncidentFilter.values().forEach { filter ->
                        FilterChip(
                            selected = uiState.activeFilter == filter,
                            onClick = { viewModel.setFilter(filter) },
                            label = {
                                val label = when (filter) {
                                    IncidentFilter.ALL -> {
                                        val openCount = uiState.incidents.count {
                                            it.status == IncidentStatus.OPEN
                                        }
                                        if (openCount > 0) "All ($openCount)" else "All"
                                    }
                                    IncidentFilter.CRITICAL -> "Critical"
                                    IncidentFilter.WARNING -> "Warning"
                                }
                                Text(label)
                            },
                            leadingIcon = when (filter) {
                                IncidentFilter.ALL -> null
                                IncidentFilter.CRITICAL -> {
                                    { Icon(Icons.Default.Error, contentDescription = null, modifier = Modifier.size(16.dp)) }
                                }
                                IncidentFilter.WARNING -> {
                                    { Icon(Icons.Default.Warning, contentDescription = null, modifier = Modifier.size(16.dp)) }
                                }
                            }
                        )
                    }
                }

                // Error
                uiState.error?.let { error ->
                    Card(
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(Icons.Default.Error, null, tint = MaterialTheme.colorScheme.onErrorContainer)
                            Text(error, modifier = Modifier.weight(1f), color = MaterialTheme.colorScheme.onErrorContainer)
                            TextButton(onClick = viewModel::clearError) { Text("Dismiss") }
                        }
                    }
                }

                if (uiState.filteredIncidents.isEmpty() && !uiState.isLoading) {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        EmptyState(
                            title = "No incidents",
                            subtitle = "All clear — no incidents to report",
                            icon = Icons.Default.CheckCircle
                        )
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(vertical = 4.dp)
                    ) {
                        items(
                            items = uiState.filteredIncidents,
                            key = { it.id }
                        ) { incident ->
                            IncidentListItem(
                                incident = incident,
                                onClick = { onIncidentClick(incident.id) }
                            )
                        }
                    }
                }
            }

            PullToRefreshContainer(
                state = pullRefreshState,
                modifier = Modifier.align(Alignment.TopCenter)
            )
        }
    }
}

@Composable
private fun IncidentListItem(incident: Incident, onClick: () -> Unit) {
    ListItem(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        headlineContent = {
            Text(
                text = incident.title,
                style = MaterialTheme.typography.titleSmall,
                maxLines = 2
            )
        },
        supportingContent = {
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = incident.agentName,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text("•", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                TimeAgoText(incident.createdAt, style = MaterialTheme.typography.bodySmall)
            }
        },
        leadingContent = {
            SeverityIcon(severity = incident.severity, modifier = Modifier.size(28.dp))
        },
        trailingContent = {
            Column(horizontalAlignment = Alignment.End) {
                SeverityBadge(severity = incident.severity)
                Spacer(modifier = Modifier.height(4.dp))
                if (incident.status != IncidentStatus.OPEN) {
                    Text(
                        text = incident.status.name.lowercase().replaceFirstChar { it.uppercase() },
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    )
    HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp))
}
