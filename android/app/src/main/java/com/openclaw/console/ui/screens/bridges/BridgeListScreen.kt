package com.openclaw.console.ui.screens.bridges

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.openclaw.console.data.model.BridgeSession
import com.openclaw.console.data.model.BridgeSessionType
import com.openclaw.console.ui.AppViewModel
import com.openclaw.console.ui.components.*
import kotlinx.serialization.json.jsonPrimitive

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BridgeListScreen(
    appViewModel: AppViewModel,
    viewModel: BridgeViewModel = viewModel()
) {
    val bridgeRepo by appViewModel.bridgeRepository.collectAsStateWithLifecycle()
    val connectionState by appViewModel.connectionState.collectAsStateWithLifecycle()

    LaunchedEffect(bridgeRepo) {
        viewModel.setRepository(bridgeRepo)
    }

    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    var isRefreshing by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text("IDE Bridges", style = MaterialTheme.typography.titleLarge)
                },
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
                // Connection status banner
                ConnectionStatusBanner(state = connectionState)

                // Error state
                uiState.error?.let { error ->
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 4.dp),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.errorContainer
                        )
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

                // Content
                when {
                    uiState.sessions.isEmpty() && !uiState.isLoading -> {
                        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            EmptyState(
                                title = "No Active Bridges",
                                subtitle = "Connect an IDE or terminal using acpx to see it here.",
                                icon = Icons.Default.Link
                            )
                        }
                    }
                    else -> {
                        LazyColumn(
                            modifier = Modifier.fillMaxSize(),
                            contentPadding = PaddingValues(vertical = 4.dp)
                        ) {
                            items(
                                items = uiState.sessions,
                                key = { it.id }
                            ) { session ->
                                BridgeSessionItem(session = session)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun BridgeSessionItem(session: BridgeSession) {
    ListItem(
        modifier = Modifier.fillMaxWidth(),
        headlineContent = {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(
                    imageVector = when (session.type) {
                        BridgeSessionType.CODEX -> Icons.Default.Code
                        BridgeSessionType.TERMINAL -> Icons.Default.Terminal
                        BridgeSessionType.OTHER -> Icons.Default.Link
                    },
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary
                )
                Text(
                    text = session.title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Medium
                )
                Spacer(modifier = Modifier.weight(1f))
                StatusBadge(closed = session.closed)
            }
        },
        supportingContent = {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = "Agent: ${session.agentId}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = session.cwd,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier
                        .background(MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.shapes.extraSmall)
                        .padding(horizontal = 4.dp, vertical = 2.dp),
                    fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace
                )
                session.metadata?.get("project_name")?.jsonPrimitive?.content?.let { projectName ->
                    Text(
                        text = "Project session: $projectName",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                TimeAgoText(session.createdAt, style = MaterialTheme.typography.labelSmall)
            }
        }
    )
    HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp))
}

@Composable
private fun StatusBadge(closed: Boolean) {
    Surface(
        color = if (closed) MaterialTheme.colorScheme.surfaceVariant else Color(0xFFE8F5E9),
        shape = MaterialTheme.shapes.extraSmall
    ) {
        Text(
            text = if (closed) "Closed" else "Active",
            style = MaterialTheme.typography.labelSmall,
            color = if (closed) MaterialTheme.colorScheme.onSurfaceVariant else Color(0xFF2E7D32),
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
            fontWeight = FontWeight.Bold
        )
    }
}
