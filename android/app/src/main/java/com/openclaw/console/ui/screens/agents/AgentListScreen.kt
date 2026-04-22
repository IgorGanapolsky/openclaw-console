package com.openclaw.console.ui.screens.agents

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.openclaw.console.data.model.Agent
import com.openclaw.console.ui.AppViewModel
import com.openclaw.console.ui.components.*
import com.openclaw.console.ui.theme.LocalOpenClawColors
import androidx.lifecycle.compose.collectAsStateWithLifecycle

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AgentListScreen(
    appViewModel: AppViewModel,
    onAgentClick: (String) -> Unit,
    viewModel: AgentListViewModel = viewModel()
) {
    val agentRepo by appViewModel.agentRepository.collectAsStateWithLifecycle()
    val colors = LocalOpenClawColors.current

    LaunchedEffect(agentRepo) {
        viewModel.setRepository(agentRepo)
    }

    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    var isRefreshing by remember { mutableStateOf(false) }
    val onlineCount = remember(uiState.agents) { uiState.agents.count { it.status == com.openclaw.console.data.model.AgentStatus.ONLINE } }
    val busyCount = remember(uiState.agents) { uiState.agents.count { it.status == com.openclaw.console.data.model.AgentStatus.BUSY } }
    val offlineCount = remember(uiState.agents) { uiState.agents.count { it.status == com.openclaw.console.data.model.AgentStatus.OFFLINE } }

    Scaffold(
        containerColor = colors.appBackground,
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = colors.appBackground,
                    titleContentColor = MaterialTheme.colorScheme.onSurface
                ),
                title = {
                    Column {
                        Text("Agents", style = MaterialTheme.typography.titleLarge)
                        AgentStatusSummary(
                            onlineCount = onlineCount,
                            busyCount = busyCount,
                            offlineCount = offlineCount
                        )
                    }
                },
                actions = {
                    if (uiState.isLoading) {
                        CircularProgressIndicator(
                            modifier = Modifier
                                .size(24.dp)
                                .padding(end = 4.dp),
                            strokeWidth = 2.dp
                        )
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
                .padding(horizontal = 16.dp)
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                Surface(
                    color = colors.searchField,
                    shape = RoundedCornerShape(20.dp),
                    border = BorderStroke(1.dp, colors.borderSubtle.copy(alpha = 0.7f))
                ) {
                    OutlinedTextField(
                        value = uiState.searchQuery,
                        onValueChange = viewModel::onSearchQueryChange,
                        modifier = Modifier.fillMaxWidth(),
                        placeholder = { Text("Search agents...") },
                        leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                        trailingIcon = {
                            if (uiState.searchQuery.isNotEmpty()) {
                                IconButton(onClick = { viewModel.onSearchQueryChange("") }) {
                                    Icon(Icons.Default.Close, contentDescription = "Clear search")
                                }
                            }
                        },
                        singleLine = true,
                        shape = RoundedCornerShape(20.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = androidx.compose.ui.graphics.Color.Transparent,
                            unfocusedBorderColor = androidx.compose.ui.graphics.Color.Transparent,
                            disabledBorderColor = androidx.compose.ui.graphics.Color.Transparent,
                            errorBorderColor = androidx.compose.ui.graphics.Color.Transparent,
                            focusedContainerColor = colors.searchField,
                            unfocusedContainerColor = colors.searchField
                        )
                    )
                }
                Spacer(modifier = Modifier.height(12.dp))

                uiState.error?.let { error ->
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(bottom = 8.dp),
                        color = MaterialTheme.colorScheme.errorContainer,
                        shape = RoundedCornerShape(18.dp),
                        border = BorderStroke(1.dp, colors.borderSubtle.copy(alpha = 0.45f))
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                Icons.Default.Error,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.onErrorContainer
                            )
                            Text(
                                text = error,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onErrorContainer,
                                modifier = Modifier.weight(1f)
                            )
                            TextButton(onClick = viewModel::clearError) {
                                Text("Dismiss")
                            }
                        }
                    }
                }

                when {
                    uiState.filteredAgents.isEmpty() && !uiState.isLoading -> {
                        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            EmptyState(
                                title = if (uiState.searchQuery.isNotEmpty()) "No agents found" else "No agents connected",
                                subtitle = if (uiState.searchQuery.isNotEmpty())
                                    "Try a different search term"
                                else
                                    "Go to Settings to connect a gateway",
                                icon = Icons.Default.Groups
                            )
                        }
                    }
                    else -> {
                        LazyColumn(
                            modifier = Modifier.fillMaxSize(),
                            contentPadding = PaddingValues(bottom = 24.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            items(
                                items = uiState.filteredAgents,
                                key = { it.id }
                            ) { agent ->
                                AgentListItem(
                                    agent = agent,
                                    onClick = { onAgentClick(agent.id) }
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
private fun AgentStatusSummary(
    onlineCount: Int,
    busyCount: Int,
    offlineCount: Int
) {
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        if (onlineCount > 0) {
            StatusSummaryChip(count = onlineCount, label = "online", status = com.openclaw.console.data.model.AgentStatus.ONLINE)
        }
        if (busyCount > 0) {
            StatusSummaryChip(count = busyCount, label = "busy", status = com.openclaw.console.data.model.AgentStatus.BUSY)
        }
        if (offlineCount > 0) {
            StatusSummaryChip(count = offlineCount, label = "offline", status = com.openclaw.console.data.model.AgentStatus.OFFLINE)
        }
    }
}

@Composable
private fun StatusSummaryChip(
    count: Int,
    label: String,
    status: com.openclaw.console.data.model.AgentStatus
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        StatusDot(status = status, size = 8)
        Text(
            text = "$count $label",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun AgentListItem(
    agent: Agent,
    onClick: () -> Unit
) {
    val colors = LocalOpenClawColors.current
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        color = colors.cardBackground,
        shape = RoundedCornerShape(20.dp),
        border = BorderStroke(
            width = if (agent.pendingApprovals > 0) 1.5.dp else 1.dp,
            color = if (agent.pendingApprovals > 0) MaterialTheme.colorScheme.tertiary.copy(alpha = 0.8f)
            else colors.borderSubtle.copy(alpha = 0.65f)
        )
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                StatusDot(status = agent.status)
                Text(
                    text = agent.name,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Medium
                )
            }
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = agent.description,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2
                )
                Row(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    if (agent.workspace.isNotEmpty()) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                Icons.Default.FolderOpen,
                                contentDescription = null,
                                modifier = Modifier.size(14.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Text(
                                text = agent.workspace,
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                    if (agent.activeTasks > 0) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                Icons.Default.Task,
                                contentDescription = null,
                                modifier = Modifier.size(14.dp),
                                tint = colors.glowCyan
                            )
                            Text(
                                text = "${agent.activeTasks} active",
                                style = MaterialTheme.typography.labelMedium,
                                color = colors.glowCyan
                            )
                        }
                    }
                    if (agent.pendingApprovals > 0) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                Icons.Default.Warning,
                                contentDescription = null,
                                modifier = Modifier.size(14.dp),
                                tint = MaterialTheme.colorScheme.error
                            )
                            Text(
                                text = "${agent.pendingApprovals} approval${if (agent.pendingApprovals > 1) "s" else ""}",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.error
                            )
                        }
                    }
                }
            }
            Column(
                horizontalAlignment = Alignment.End,
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                TimeAgoText(agent.lastActive, style = MaterialTheme.typography.labelSmall)
                Icon(
                    Icons.Default.ChevronRight,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}
