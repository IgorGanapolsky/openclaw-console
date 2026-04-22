package com.openclaw.console.ui.screens.incidents

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.openclaw.console.data.model.Incident
import com.openclaw.console.data.model.IncidentStatus
import com.openclaw.console.ui.AppViewModel
import com.openclaw.console.ui.components.*
import androidx.lifecycle.compose.collectAsStateWithLifecycle

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IncidentListScreen(
    appViewModel: AppViewModel,
    onIncidentClick: (String) -> Unit,
    viewModel: IncidentViewModel = viewModel()
) {
    val incidentRepo by appViewModel.incidentRepository.collectAsStateWithLifecycle()

    LaunchedEffect(incidentRepo) {
        viewModel.setRepository(incidentRepo)
    }

    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    var isRefreshing by remember { mutableStateOf(false) }
    var showFilterMenu by remember { mutableStateOf(false) }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
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
                    Box {
                        IconButton(onClick = { showFilterMenu = true }) {
                            Icon(
                                imageVector = if (uiState.activeFilter == IncidentFilter.ALL) {
                                    Icons.Default.FilterList
                                } else {
                                    Icons.Default.FilterList
                                },
                                contentDescription = "Filter by severity"
                            )
                        }
                        DropdownMenu(
                            expanded = showFilterMenu,
                            onDismissRequest = { showFilterMenu = false }
                        ) {
                            IncidentFilter.values().forEach { filter ->
                                DropdownMenuItem(
                                    text = {
                                        Text(
                                            when (filter) {
                                                IncidentFilter.ALL -> "All"
                                                IncidentFilter.CRITICAL -> "Critical"
                                                IncidentFilter.WARNING -> "Warning"
                                            }
                                        )
                                    },
                                    leadingIcon = {
                                        if (uiState.activeFilter == filter) {
                                            Icon(Icons.Default.Check, contentDescription = null)
                                        } else {
                                            when (filter) {
                                                IncidentFilter.ALL -> Unit
                                                IncidentFilter.CRITICAL -> Icon(Icons.Default.Error, contentDescription = null)
                                                IncidentFilter.WARNING -> Icon(Icons.Default.Warning, contentDescription = null)
                                            }
                                        }
                                    },
                                    onClick = {
                                        viewModel.setFilter(filter)
                                        showFilterMenu = false
                                    }
                                )
                            }
                        }
                    }
                }
            )
        }
    ) { paddingValues ->
        PullToRefreshBox(
            isRefreshing = isRefreshing,
            onRefresh = {
                isRefreshing = true
                viewModel.refresh()
                isRefreshing = false
            },
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
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
                            title = if (uiState.activeFilter == IncidentFilter.ALL) "No Incidents" else "No ${uiState.activeFilter.name.lowercase().replaceFirstChar { it.uppercase() }} Incidents",
                            subtitle = uiState.error ?: "All clear — no incidents to report.",
                            icon = Icons.Default.CheckCircle
                        )
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(vertical = 8.dp)
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

        }
    }
}

@Composable
private fun IncidentListItem(incident: Incident, onClick: () -> Unit) {
    ListItem(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp),
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
                if (incident.status != IncidentStatus.OPEN) {
                    Text(
                        text = incident.status.name.lowercase().replaceFirstChar { it.uppercase() },
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        },
        colors = ListItemDefaults.colors(containerColor = MaterialTheme.colorScheme.surface)
    )
    HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp))
}
