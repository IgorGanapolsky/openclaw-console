package com.openclaw.console.ui.screens.git

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.openclaw.console.data.viewmodel.GitViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GitRepositoryScreen(
    gitViewModel: GitViewModel,
    onNavigateToApproval: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val uiState by gitViewModel.repositoryUiState.collectAsStateWithLifecycle()

    LaunchedEffect(Unit) {
        gitViewModel.refresh()
    }

    Column(modifier = modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("Git Repository") }
        )

        if (uiState.isLoading) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator()
            }
        } else {
            val error = uiState.error
            if (error != null) {
                Card(modifier = Modifier.padding(16.dp)) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(text = error, color = MaterialTheme.colorScheme.error)
                        Row {
                            TextButton(onClick = { gitViewModel.refresh() }) { Text("Retry") }
                            TextButton(onClick = { gitViewModel.clearError() }) { Text("Dismiss") }
                        }
                    }
                }
            } else {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "Repository Status",
                        style = MaterialTheme.typography.titleMedium
                    )

                    Spacer(modifier = Modifier.height(16.dp))

                    // Simple repository info
                    if (uiState.branches.isNotEmpty()) {
                        Text("Branches: ${uiState.branches.size}")
                        uiState.branches.take(3).forEach { branch ->
                            Text("• ${branch.name} ${if (branch.isActive) "(active)" else ""}", style = MaterialTheme.typography.bodySmall)
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    Text(
                        text = "Recent Commits (${uiState.recentCommits.size})",
                        style = MaterialTheme.typography.titleSmall
                    )

                    uiState.recentCommits.take(10).forEach { commit ->
                        Card(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                            Column(modifier = Modifier.padding(12.dp)) {
                                Text(
                                    text = commit.message,
                                    style = MaterialTheme.typography.bodyMedium
                                )
                                Text(
                                    text = "by ${commit.author} • ${commit.shortHash}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }

                    if (uiState.recentCommits.isEmpty()) {
                        Text(
                            text = "No commits found",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    }
}