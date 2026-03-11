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
fun GitBranchStatusScreen(
    gitViewModel: GitViewModel,
    modifier: Modifier = Modifier
) {
    val uiState by gitViewModel.branchStatusUiState.collectAsStateWithLifecycle()

    LaunchedEffect(Unit) {
        gitViewModel.refresh()
    }

    Column(modifier = modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("Branch Status") }
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
                    // Branch info
                    if (uiState.currentBranch != null) {
                        Card(modifier = Modifier.fillMaxWidth()) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Text(
                                    text = "Current Branch",
                                    style = MaterialTheme.typography.titleMedium
                                )
                                Spacer(modifier = Modifier.height(8.dp))
                                val branch = uiState.currentBranch
                                Text("Name: ${branch?.name}")
                                Text("Active: ${branch?.isActive ?: false}")
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    // Uncommitted files
                    if (uiState.uncommittedFiles.isNotEmpty()) {
                        Text(
                            text = "Uncommitted Changes (${uiState.uncommittedFiles.size})",
                            style = MaterialTheme.typography.titleSmall
                        )

                        uiState.uncommittedFiles.forEach { file ->
                            Text(
                                text = "• $file",
                                style = MaterialTheme.typography.bodySmall,
                                modifier = Modifier.padding(start = 16.dp)
                            )
                        }

                        Spacer(modifier = Modifier.height(16.dp))
                    }

                    // Commits
                    Text(
                        text = "Recent Commits (${uiState.commits.size})",
                        style = MaterialTheme.typography.titleSmall
                    )

                    uiState.commits.take(5).forEach { commit ->
                        Card(modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
                            Column(modifier = Modifier.padding(8.dp)) {
                                Text(
                                    text = commit.message,
                                    style = MaterialTheme.typography.bodySmall
                                )
                                Text(
                                    text = commit.shortHash,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }

                    // Empty state
                    if (uiState.commits.isEmpty() && uiState.uncommittedFiles.isEmpty()) {
                        Column(
                            modifier = Modifier.fillMaxWidth().padding(32.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Icon(
                                imageVector = Icons.Default.Info,
                                contentDescription = "No data",
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(48.dp)
                            )
                            Spacer(modifier = Modifier.height(16.dp))
                            Text(
                                text = "No recent activity",
                                style = MaterialTheme.typography.bodyLarge,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }
        }
    }
}