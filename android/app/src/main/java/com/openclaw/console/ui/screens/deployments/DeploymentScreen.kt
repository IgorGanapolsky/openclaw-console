package com.openclaw.console.ui.screens.deployments

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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.openclaw.console.data.model.*
import com.openclaw.console.ui.AppViewModel
import com.openclaw.console.ui.components.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeploymentScreen(
    appViewModel: AppViewModel,
    onDeploymentClick: (String) -> Unit,
    viewModel: DeploymentViewModel = viewModel()
) {
    val deploymentRepo by appViewModel.deploymentRepository.collectAsStateWithLifecycle()
    val connectionState by appViewModel.connectionState.collectAsStateWithLifecycle()

    LaunchedEffect(deploymentRepo) {
        viewModel.setRepository(deploymentRepo)
    }

    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    var isRefreshing by remember { mutableStateOf(false) }
    var showingTriggerSheet by remember { mutableStateOf(false) }
    var showingFilterMenu by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            Column {
                TopAppBar(
                    title = {
                        Text("Deployments", style = MaterialTheme.typography.titleLarge)
                    },
                    actions = {
                        // Filter button
                        IconButton(onClick = { showingFilterMenu = true }) {
                            Icon(
                                if (uiState.hasActiveFilters) Icons.Default.FilterList else Icons.Default.FilterListOff,
                                contentDescription = "Filter deployments"
                            )
                        }

                        if (uiState.isLoading) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(24.dp).padding(end = 4.dp),
                                strokeWidth = 2.dp
                            )
                        }
                    }
                )

                // Search bar
                OutlinedTextField(
                    value = uiState.searchQuery,
                    onValueChange = viewModel::onSearchQueryChange,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    placeholder = { Text("Search deployments...") },
                    leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                    trailingIcon = {
                        if (uiState.searchQuery.isNotEmpty()) {
                            IconButton(onClick = { viewModel.onSearchQueryChange("") }) {
                                Icon(Icons.Default.Close, contentDescription = "Clear search")
                            }
                        }
                    },
                    singleLine = true,
                    shape = MaterialTheme.shapes.medium
                )
            }
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = { showingTriggerSheet = true },
                containerColor = MaterialTheme.colorScheme.primary
            ) {
                Icon(Icons.Default.Add, contentDescription = "Trigger deployment")
            }
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
                    ErrorBanner(
                        message = error,
                        onRetry = { viewModel.refresh() },
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                    )
                }

                // Content
                when {
                    uiState.isLoading && uiState.deployments.isEmpty() -> {
                        Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center
                        ) {
                            CircularProgressIndicator()
                        }
                    }
                    uiState.filteredDeployments.isEmpty() -> {
                        EmptyState(
                            title = if (uiState.hasActiveFilters) "No matching deployments" else "No deployments",
                            subtitle = if (uiState.hasActiveFilters)
                                "Try adjusting your search or filters"
                            else
                                "Trigger your first deployment to get started",
                            icon = Icons.Default.RocketLaunch,
                            actions = {
                                if (!uiState.hasActiveFilters) {
                                    Button(
                                        onClick = { showingTriggerSheet = true },
                                        modifier = Modifier.padding(top = 16.dp)
                                    ) {
                                        Text("Trigger Deployment")
                                    }
                                }
                            }
                        )
                    }
                    else -> {
                        LazyColumn(
                            modifier = Modifier.fillMaxSize(),
                            contentPadding = PaddingValues(vertical = 8.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            items(
                                items = uiState.filteredDeployments,
                                key = { it.id }
                            ) { deployment ->
                                DeploymentListItem(
                                    deployment = deployment,
                                    onClick = { onDeploymentClick(deployment.id) },
                                    modifier = Modifier.padding(horizontal = 16.dp)
                                )
                            }
                        }
                    }
                }
            }
        }

        // Filter dropdown menu
        DropdownMenu(
            expanded = showingFilterMenu,
            onDismissRequest = { showingFilterMenu = false }
        ) {
            DropdownMenuItem(
                text = { Text("All Deployments") },
                onClick = {
                    viewModel.clearFilters()
                    showingFilterMenu = false
                },
                leadingIcon = {
                    Icon(
                        if (!uiState.hasActiveFilters) Icons.Default.Check else Icons.Default.List,
                        contentDescription = null
                    )
                }
            )

            HorizontalDivider()

            Text(
                text = "Status",
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            DeploymentStatus.entries.forEach { status ->
                DropdownMenuItem(
                    text = { Text(status.displayName) },
                    onClick = {
                        viewModel.setStatusFilter(
                            if (uiState.statusFilter == status) null else status
                        )
                        showingFilterMenu = false
                    },
                    leadingIcon = {
                        Icon(
                            if (uiState.statusFilter == status) Icons.Default.Check else Icons.Default.Circle,
                            contentDescription = null
                        )
                    }
                )
            }

            HorizontalDivider()

            Text(
                text = "Environment",
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            DeploymentEnvironment.entries.forEach { environment ->
                DropdownMenuItem(
                    text = { Text(environment.displayName) },
                    onClick = {
                        viewModel.setEnvironmentFilter(
                            if (uiState.environmentFilter == environment) null else environment
                        )
                        showingFilterMenu = false
                    },
                    leadingIcon = {
                        Icon(
                            if (uiState.environmentFilter == environment) Icons.Default.Check else Icons.Default.Circle,
                            contentDescription = null
                        )
                    }
                )
            }
        }

        // Deployment trigger sheet
        if (showingTriggerSheet) {
            DeploymentTriggerSheet(
                onDismiss = { showingTriggerSheet = false },
                onTrigger = { request ->
                    if (request.environment == DeploymentEnvironment.PRODUCTION) {
                        // For production deployments, request approval first
                        viewModel.requestDeploymentApproval(request)
                    } else {
                        // For staging deployments, trigger directly
                        viewModel.triggerDeployment(request)
                    }
                    showingTriggerSheet = false
                }
            )
        }
    }
}