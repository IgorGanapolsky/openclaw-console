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
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.openclaw.console.data.model.GatewayConnection
import com.openclaw.console.data.model.ResponseProfile
import com.openclaw.console.data.model.ResponseVerbosity
import com.openclaw.console.data.model.RuntimeConfig
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

            uiState.runtimeConfig?.let { runtimeConfig ->
                item {
                    HorizontalDivider(modifier = Modifier.padding(top = 16.dp))
                    OperatorResponseCard(
                        runtimeConfig = runtimeConfig,
                        onProfileChange = viewModel::updateResponseProfile,
                        onVerbosityChange = viewModel::updateResponseVerbosity
                    )
                }
            }

            item {
                HorizontalDivider(modifier = Modifier.padding(top = 16.dp))
                UpgradeToProRow(onUpgradeClick = onUpgradeClick)
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

@Composable
private fun UpgradeToProRow(onUpgradeClick: () -> Unit) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onUpgradeClick),
        color = MaterialTheme.colorScheme.surface
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                Icons.Default.Star,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "OpenClaw Pro",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    text = "Unlock advanced analytics, integrations, webhooks, and unlimited agents.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Icon(
                Icons.Default.ChevronRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun OperatorResponseCard(
    runtimeConfig: RuntimeConfig,
    onProfileChange: (ResponseProfile) -> Unit,
    onVerbosityChange: (ResponseVerbosity) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Default.Tune, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            Text(
                text = "Operator Response",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold
            )
        }

        LabeledDropdown(
            label = "Style",
            selected = runtimeConfig.responseProfile.displayName(),
            options = ResponseProfile.entries,
            optionLabel = { it.displayName() },
            onSelected = onProfileChange
        )

        LabeledDropdown(
            label = "Verbosity",
            selected = runtimeConfig.responseVerbosity.displayName(),
            options = ResponseVerbosity.entries,
            optionLabel = { it.displayName() },
            onSelected = onVerbosityChange
        )

        Text(
            text = "Quiet summaries stay visible first. Raw task activity remains in task detail.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
private fun <T> LabeledDropdown(
    label: String,
    selected: String,
    options: List<T>,
    optionLabel: (T) -> String,
    onSelected: (T) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }

    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        ExposedDropdownMenuBox(
            expanded = expanded,
            onExpandedChange = { expanded = it }
        ) {
            OutlinedTextField(
                value = selected,
                onValueChange = {},
                modifier = Modifier
                    .fillMaxWidth()
                    .menuAnchor(),
                readOnly = true,
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) }
            )
            ExposedDropdownMenu(
                expanded = expanded,
                onDismissRequest = { expanded = false }
            ) {
                options.forEach { option ->
                    DropdownMenuItem(
                        text = { Text(optionLabel(option)) },
                        onClick = {
                            expanded = false
                            onSelected(option)
                        }
                    )
                }
            }
        }
    }
}

private fun ResponseProfile.displayName(): String = when (this) {
    ResponseProfile.CODEX -> "Codex"
    ResponseProfile.CLAUDE_CODE -> "Claude Code"
    ResponseProfile.VERBOSE -> "Verbose"
    ResponseProfile.DEBUG -> "Debug"
}

private fun ResponseVerbosity.displayName(): String = when (this) {
    ResponseVerbosity.TERSE -> "Terse"
    ResponseVerbosity.NORMAL -> "Normal"
    ResponseVerbosity.DETAILED -> "Detailed"
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
