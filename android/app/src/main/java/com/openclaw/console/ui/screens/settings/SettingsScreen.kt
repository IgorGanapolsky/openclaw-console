package com.openclaw.console.ui.screens.settings

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Cloud
import androidx.compose.material.icons.filled.CloudDone
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
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
    onUpgradeClick: () -> Unit = {},
    viewModel: SettingsViewModel = viewModel()
) {
    val gatewayRepo = appViewModel.gatewayRepository

    LaunchedEffect(Unit) {
        viewModel.setRepository(gatewayRepo)
    }

    val uiState by viewModel.settingsUiState.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Gateways") },
                actions = {
                    IconButton(onClick = onAddGateway) {
                        Icon(Icons.Default.Add, contentDescription = "Add Gateway")
                    }
                }
            )
        }
    ) { paddingValues ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues),
            contentPadding = PaddingValues(bottom = 24.dp)
        ) {
            if (uiState.gateways.isEmpty()) {
                item {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 32.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        EmptyState(
                            title = "No Gateways",
                            subtitle = "Add a gateway to connect to your OpenClaw instance.",
                            icon = Icons.Default.Cloud,
                            modifier = Modifier.padding(bottom = 16.dp)
                        )
                        Button(onClick = onAddGateway) {
                            Text("Add Gateway")
                        }
                    }
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
