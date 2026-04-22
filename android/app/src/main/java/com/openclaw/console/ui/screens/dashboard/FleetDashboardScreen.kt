package com.openclaw.console.ui.screens.dashboard

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.ExperimentalMaterialApi
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Checklist
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.pullrefresh.PullRefreshIndicator
import androidx.compose.material.pullrefresh.pullRefresh
import androidx.compose.material.pullrefresh.rememberPullRefreshState
import androidx.compose.material3.Badge
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.openclaw.console.data.model.Agent
import com.openclaw.console.ui.AppViewModel
import com.openclaw.console.ui.components.EmptyState
import com.openclaw.console.ui.components.StatusDot
import com.openclaw.console.ui.components.TimeAgoText
import com.openclaw.console.ui.theme.LocalOpenClawColors

@OptIn(ExperimentalMaterialApi::class, ExperimentalMaterial3Api::class)
@Composable
fun FleetDashboardScreen(
    appViewModel: AppViewModel,
    dashboardViewModel: FleetDashboardViewModel = viewModel(),
    onAgentClick: (String) -> Unit
) {
    val agentRepository by appViewModel.agentRepository.collectAsStateWithLifecycle()
    val uiState by dashboardViewModel.uiState.collectAsStateWithLifecycle()
    val colors = LocalOpenClawColors.current

    LaunchedEffect(agentRepository) {
        dashboardViewModel.setRepository(agentRepository)
    }

    val pullRefreshState = rememberPullRefreshState(
        refreshing = uiState.isLoading,
        onRefresh = { dashboardViewModel.refresh() }
    )

    Scaffold(
        containerColor = colors.appBackground,
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = colors.appBackground,
                    titleContentColor = MaterialTheme.colorScheme.onSurface
                ),
                title = {
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text("Fleet", style = MaterialTheme.typography.titleLarge)
                        Text(
                            "Mobile control plane for your active agents",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            )
        }
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(horizontal = 16.dp)
                .pullRefresh(pullRefreshState)
        ) {
            if (uiState.agents.isEmpty() && !uiState.isLoading) {
                EmptyFleetState(
                    error = uiState.error,
                    modifier = Modifier.fillMaxSize()
                )
            } else {
                Column(modifier = Modifier.fillMaxSize()) {
                    FleetSummaryHeader(
                        onlineCount = uiState.onlineCount,
                        pendingApprovals = uiState.totalPendingApprovals,
                        activeTasks = uiState.totalActiveTasks,
                        summaryText = uiState.summaryText,
                        modifier = Modifier.padding(top = 12.dp, bottom = 12.dp)
                    )

                    LazyVerticalGrid(
                        columns = GridCells.Fixed(2),
                        contentPadding = PaddingValues(bottom = 24.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                        modifier = Modifier.fillMaxSize()
                    ) {
                        items(uiState.sortedAgents, key = { it.id }) { agent ->
                            FleetAgentCard(
                                agent = agent,
                                onClick = { onAgentClick(agent.id) }
                            )
                        }
                    }
                }
            }

            PullRefreshIndicator(
                refreshing = uiState.isLoading,
                state = pullRefreshState,
                modifier = Modifier.align(Alignment.TopCenter)
            )
        }
    }
}

@Composable
private fun FleetSummaryHeader(
    onlineCount: Int,
    pendingApprovals: Int,
    activeTasks: Int,
    summaryText: String,
    modifier: Modifier = Modifier
) {
    val colors = LocalOpenClawColors.current
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(22.dp),
        color = colors.elevatedCardBackground,
        border = BorderStroke(1.dp, colors.borderSubtle.copy(alpha = 0.7f))
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 18.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text(
                text = "Live Overview",
                style = MaterialTheme.typography.labelLarge,
                color = colors.glowCyan
            )
            Row(
                horizontalArrangement = Arrangement.SpaceEvenly,
                modifier = Modifier.fillMaxWidth()
            ) {
                SummaryPill(value = onlineCount, label = "Online", color = colors.glowGreen)
                SummaryPill(value = pendingApprovals, label = "Pending", color = MaterialTheme.colorScheme.tertiary)
                SummaryPill(value = activeTasks, label = "Tasks", color = colors.glowCyan)
            }
            Text(
                text = summaryText,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun SummaryPill(value: Int, label: String, color: Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = "$value",
            style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
            color = color
        )
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun FleetAgentCard(
    agent: Agent,
    onClick: () -> Unit
) {
    val colors = LocalOpenClawColors.current
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(20.dp),
        color = colors.cardBackground,
        border = BorderStroke(
            width = if (agent.pendingApprovals > 0) 1.5.dp else 1.dp,
            color = if (agent.pendingApprovals > 0) {
                MaterialTheme.colorScheme.tertiary.copy(alpha = 0.8f)
            } else {
                colors.borderSubtle.copy(alpha = 0.65f)
            }
        )
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                StatusDot(status = agent.status)
                Text(
                    text = agent.name,
                    style = MaterialTheme.typography.titleSmall,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f)
                )
                if (agent.pendingApprovals > 0) {
                    Badge(containerColor = MaterialTheme.colorScheme.tertiary) {
                        Text("${agent.pendingApprovals}")
                    }
                }
            }

            Text(
                text = agent.description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )

            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                if (agent.activeTasks > 0) {
                    Icon(
                        Icons.Default.Checklist,
                        contentDescription = "Active tasks",
                        modifier = Modifier.size(14.dp),
                        tint = colors.glowCyan
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = "${agent.activeTasks} active",
                        style = MaterialTheme.typography.labelSmall,
                        color = colors.glowCyan
                    )
                }
                Spacer(modifier = Modifier.weight(1f))
                TimeAgoText(
                    isoTimestamp = agent.lastActive,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.width(8.dp))
                Icon(
                    Icons.Default.ChevronRight,
                    contentDescription = "View details",
                    modifier = Modifier.size(16.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                )
            }
        }
    }
}

@Composable
private fun EmptyFleetState(error: String?, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier,
        contentAlignment = Alignment.Center
    ) {
        EmptyState(
            title = "No Agents",
            subtitle = error ?: "Connect a gateway to see your fleet.",
            icon = Icons.Default.Checklist
        )
    }
}
