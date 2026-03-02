package com.openclaw.console.ui.screens.settings

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.openclaw.console.data.model.GatewayConnection
import com.openclaw.console.ui.AppViewModel
import com.openclaw.console.ui.components.*
import androidx.lifecycle.compose.collectAsStateWithLifecycle

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    appViewModel: AppViewModel,
    onAddGateway: () -> Unit,
    onApprovalClick: (String) -> Unit,
    viewModel: SettingsViewModel = viewModel()
) {
    val gatewayRepo = appViewModel.gatewayRepository
    val approvalRepo by appViewModel.approvalRepository.collectAsStateWithLifecycle()
    val pendingApprovals by remember(approvalRepo) {
        derivedStateOf { approvalRepo?.pendingApprovals?.value ?: emptyList() }
    }
    val connectionState by appViewModel.connectionState.collectAsStateWithLifecycle()

    LaunchedEffect(Unit) {
        viewModel.setRepository(gatewayRepo)
    }

    val uiState by viewModel.settingsUiState.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settings") }
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = onAddGateway,
                icon = { Icon(Icons.Default.Add, contentDescription = null) },
                text = { Text("Add Gateway") }
            )
        }
    ) { paddingValues ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues),
            contentPadding = PaddingValues(bottom = 88.dp)
        ) {
            // Connection status
            item {
                ConnectionStatusBanner(state = connectionState)
            }

            // Pending approvals section
            if (pendingApprovals.isNotEmpty()) {
                item {
                    Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
                        Text(
                            text = "Pending Approvals",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(bottom = 8.dp)
                        )
                    }
                }
                items(pendingApprovals, key = { "approval_${it.id}" }) { approval ->
                    ListItem(
                        modifier = Modifier.clickable { onApprovalClick(approval.id) },
                        headlineContent = { Text(approval.title, style = MaterialTheme.typography.bodyMedium) },
                        supportingContent = {
                            Text(
                                text = "${approval.agentName} • ${approval.actionType.name.lowercase().replace('_', ' ')}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        },
                        leadingContent = {
                            Icon(
                                Icons.Default.Warning,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.error
                            )
                        },
                        trailingContent = {
                            Icon(Icons.Default.ChevronRight, contentDescription = null)
                        },
                        colors = ListItemDefaults.colors(
                            containerColor = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.4f)
                        )
                    )
                    HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp))
                }
                item { Spacer(modifier = Modifier.height(8.dp)) }
            }

            // Gateways section header
            item {
                Text(
                    text = "Gateways",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp)
                )
            }

            if (uiState.gateways.isEmpty()) {
                item {
                    EmptyState(
                        title = "No gateways",
                        subtitle = "Tap Add Gateway to connect to an OpenClaw gateway",
                        icon = Icons.Default.Cloud,
                        modifier = Modifier.padding(vertical = 32.dp)
                    )
                }
            } else {
                items(uiState.gateways, key = { it.id }) { gateway ->
                    SwipeToDismissGatewayItem(
                        gateway = gateway,
                        isActive = gateway.id == uiState.activeGatewayId,
                        onDelete = { viewModel.deleteGateway(gateway.id) },
                        onSetActive = {
                            viewModel.setActiveGateway(gateway.id)
                            val token = gatewayRepo.getToken(gateway.id) ?: return@SwipeToDismissGatewayItem
                            appViewModel.connectToGateway(gateway, token)
                        }
                    )
                }
            }

            // App info section
            item {
                HorizontalDivider(modifier = Modifier.padding(top = 16.dp))
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "OpenClaw Console",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        text = "v1.0.0 — Protocol v1",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SwipeToDismissGatewayItem(
    gateway: GatewayConnection,
    isActive: Boolean,
    onDelete: () -> Unit,
    onSetActive: () -> Unit
) {
    val dismissState = rememberSwipeToDismissBoxState(
        confirmValueChange = { value ->
            if (value == SwipeToDismissBoxValue.EndToStart) {
                onDelete()
                true
            } else false
        }
    )

    SwipeToDismissBox(
        state = dismissState,
        backgroundContent = {
            val color by animateColorAsState(
                targetValue = if (dismissState.targetValue == SwipeToDismissBoxValue.EndToStart)
                    MaterialTheme.colorScheme.errorContainer
                else
                    MaterialTheme.colorScheme.surfaceVariant,
                label = "swipe_bg"
            )
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(color)
                    .padding(end = 20.dp),
                contentAlignment = Alignment.CenterEnd
            ) {
                Icon(
                    Icons.Default.Delete,
                    contentDescription = "Delete",
                    tint = MaterialTheme.colorScheme.onErrorContainer
                )
            }
        },
        enableDismissFromStartToEnd = false,
        enableDismissFromEndToStart = true
    ) {
        GatewayListItem(
            gateway = gateway,
            isActive = isActive,
            onSetActive = onSetActive
        )
    }
}

@Composable
private fun GatewayListItem(
    gateway: GatewayConnection,
    isActive: Boolean,
    onSetActive: () -> Unit
) {
    ListItem(
        modifier = Modifier.clickable { if (!isActive) onSetActive() },
        headlineContent = {
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = gateway.name,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = if (isActive) FontWeight.SemiBold else FontWeight.Normal
                )
                if (isActive) {
                    Surface(
                        shape = MaterialTheme.shapes.small,
                        color = MaterialTheme.colorScheme.primaryContainer
                    ) {
                        Text(
                            text = "Active",
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onPrimaryContainer
                        )
                    }
                }
            }
        },
        supportingContent = {
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    text = gateway.baseUrl,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                gateway.lastConnectedAt?.let { lastConnected ->
                    Text(
                        text = "Last connected: ",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        },
        leadingContent = {
            Icon(
                imageVector = if (isActive) Icons.Default.CloudDone else Icons.Default.Cloud,
                contentDescription = null,
                tint = if (isActive) MaterialTheme.colorScheme.primary
                else MaterialTheme.colorScheme.onSurfaceVariant
            )
        },
        trailingContent = {
            if (!isActive) {
                TextButton(onClick = onSetActive) {
                    Text("Connect")
                }
            }
        }
    )
    HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp))
}
