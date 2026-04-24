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
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.ExperimentalMaterialApi
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Checklist
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.CloudDone
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.outlined.Public
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material.pullrefresh.PullRefreshIndicator
import androidx.compose.material.pullrefresh.pullRefresh
import androidx.compose.material.pullrefresh.rememberPullRefreshState
import androidx.compose.material3.Badge
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.openclaw.console.data.network.ConnectionState
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
    onAgentClick: (String) -> Unit,
    onAddGateway: () -> Unit,
    onManageGateways: () -> Unit
) {
    val agentRepository by appViewModel.agentRepository.collectAsStateWithLifecycle()
    val gateways by appViewModel.gatewayRepository.gateways.collectAsStateWithLifecycle()
    val activeGateway by appViewModel.gatewayRepository.activeGateway.collectAsStateWithLifecycle()
    val connectionState by appViewModel.connectionState.collectAsStateWithLifecycle()
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
        containerColor = if (gateways.isEmpty()) Color.Black else colors.appBackground,
        topBar = if (gateways.isNotEmpty()) {
            {
                TopAppBar(
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = colors.appBackground,
                        titleContentColor = MaterialTheme.colorScheme.onSurface
                    ),
                    title = { Text("Fleet", style = MaterialTheme.typography.titleLarge) }
                )
            }
        } else {
            {}
        }
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(horizontal = 16.dp)
                .pullRefresh(pullRefreshState)
        ) {
            when {
                gateways.isEmpty() && !uiState.isLoading -> {
                    GatewayOnboardingState(
                        onAddGateway = onAddGateway,
                        modifier = Modifier.fillMaxSize()
                    )
                }
                activeGateway == null && !uiState.isLoading -> {
                    GatewaySelectionState(
                        onManageGateways = onManageGateways,
                        modifier = Modifier.fillMaxSize()
                    )
                }
                uiState.agents.isEmpty() && !uiState.isLoading -> {
                    EmptyFleetState(
                        error = uiState.error,
                        gatewayName = activeGateway?.name,
                        connectionState = connectionState,
                        onManageGateways = onManageGateways,
                        modifier = Modifier.fillMaxSize()
                    )
                }
                else -> {
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
private fun GatewayOnboardingState(
    onAddGateway: () -> Unit,
    modifier: Modifier = Modifier
) {
    val colors = LocalOpenClawColors.current
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(0.dp)
    ) {
        Spacer(modifier = Modifier.weight(1.1f))
        Box(
            modifier = Modifier.size(112.dp),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = Icons.Outlined.Public,
                contentDescription = null,
                tint = colors.glowCyan,
                modifier = Modifier.size(84.dp)
            )
            Icon(
                imageVector = Icons.Outlined.Security,
                contentDescription = null,
                tint = colors.glowCyan,
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .offset(x = (-4).dp, y = (-2).dp)
                    .size(40.dp)
            )
        }
        Spacer(modifier = Modifier.height(28.dp))
        Text(
            text = "OpenClaw Console",
            style = MaterialTheme.typography.headlineLarge,
            color = Color.White
        )
        Spacer(modifier = Modifier.height(10.dp))
        Text(
            text = "Connect to a gateway to start monitoring and controlling your agents.",
            style = MaterialTheme.typography.bodyMedium,
            color = Color.White.copy(alpha = 0.68f),
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = 12.dp)
        )
        Spacer(modifier = Modifier.height(32.dp))
        Button(
            onClick = onAddGateway,
            modifier = Modifier
                .fillMaxWidth()
                .height(58.dp),
            shape = RoundedCornerShape(24.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = Color(0xFF158EEA),
                contentColor = Color.White
            )
        ) {
            Icon(Icons.Default.Add, contentDescription = null, tint = Color.White)
            Spacer(modifier = Modifier.width(8.dp))
            Text("Add Gateway", color = Color.White)
        }
        Spacer(modifier = Modifier.weight(0.95f))
    }
}

@Composable
private fun GatewaySelectionState(
    onManageGateways: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier,
        contentAlignment = Alignment.Center
    ) {
        EmptyState(
            title = "Choose a Gateway",
            subtitle = "Open your saved gateways and pick the one this phone should follow.",
            icon = Icons.Default.Settings,
            primaryAction = {
                OutlinedButton(onClick = onManageGateways) {
                    Icon(Icons.Default.Settings, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Open Gateways")
                }
            }
        )
    }
}

@Composable
private fun EmptyFleetState(
    error: String?,
    gatewayName: String?,
    connectionState: ConnectionState,
    onManageGateways: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier,
        contentAlignment = Alignment.Center
    ) {
        EmptyState(
            title = "Fleet is Ready",
            subtitle = error ?: emptyFleetSubtitle(gatewayName, connectionState),
            icon = Icons.Default.CloudDone,
            primaryAction = {
                OutlinedButton(onClick = onManageGateways) {
                    Icon(Icons.Default.Settings, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Manage Gateways")
                }
            }
        )
    }
}

private fun emptyFleetSubtitle(gatewayName: String?, connectionState: ConnectionState): String {
    val gatewayLabel = gatewayName ?: "your gateway"
    return when (connectionState) {
        ConnectionState.CONNECTED -> "Connected to $gatewayLabel. Agents will appear here as soon as the gateway reports them."
        ConnectionState.CONNECTING -> "Connecting to $gatewayLabel. Fleet cards will appear once the gateway is online."
        ConnectionState.RECONNECTING -> "Reconnecting to $gatewayLabel. Fleet cards will return when the connection is restored."
        ConnectionState.DISCONNECTED -> "Reconnect $gatewayLabel or choose another gateway to populate the fleet."
    }
}
