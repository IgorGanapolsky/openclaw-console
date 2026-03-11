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
fun GitApprovalDetailScreen(
    requestId: String,
    gitViewModel: GitViewModel,
    onNavigateBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    val uiState by gitViewModel.approvalDetailUiState.collectAsStateWithLifecycle()

    LaunchedEffect(requestId) {
        gitViewModel.loadApprovalRequest(requestId)
    }

    Column(modifier = modifier.fillMaxSize()) {
        // TopAppBar
        TopAppBar(
            title = { Text("Git Approval Details") },
            navigationIcon = {
                IconButton(onClick = onNavigateBack) {
                    Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                }
            }
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
            val approvalRequest = uiState.approvalRequest

            if (error != null) {
                Card(modifier = Modifier.padding(16.dp)) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(text = error, color = MaterialTheme.colorScheme.error)
                        Row {
                            TextButton(onClick = { gitViewModel.loadApprovalRequest(requestId) }) { Text("Retry") }
                            TextButton(onClick = { gitViewModel.clearError() }) { Text("Dismiss") }
                        }
                    }
                }
            } else if (approvalRequest != null) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "Approval Request: ${approvalRequest.description}",
                        style = MaterialTheme.typography.titleMedium
                    )

                    Spacer(modifier = Modifier.height(16.dp))

                    Text(
                        text = "Type: ${approvalRequest.type}",
                        style = MaterialTheme.typography.bodyMedium
                    )

                    Text(
                        text = "Risk Level: ${approvalRequest.riskLevel}",
                        style = MaterialTheme.typography.bodyMedium
                    )

                    Spacer(modifier = Modifier.height(16.dp))

                    Text(
                        text = "Commits (${approvalRequest.commits.size})",
                        style = MaterialTheme.typography.titleSmall
                    )

                    approvalRequest.commits.forEach { commit ->
                        Text(
                            text = "• ${commit.message}",
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(start = 16.dp)
                        )
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    Text(
                        text = "File Changes (${approvalRequest.diffs.size})",
                        style = MaterialTheme.typography.titleSmall
                    )

                    approvalRequest.diffs.forEach { diff ->
                        Text(
                            text = "• ${diff.file} (${diff.changeType})",
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(start = 16.dp)
                        )
                    }

                    Spacer(modifier = Modifier.height(24.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceEvenly
                    ) {
                        Button(
                            onClick = { gitViewModel.approveGitAction(requestId) },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = MaterialTheme.colorScheme.primary
                            )
                        ) {
                            Text("Approve")
                        }

                        OutlinedButton(
                            onClick = { gitViewModel.rejectGitAction(requestId, "User rejected") }
                        ) {
                            Text("Reject")
                        }
                    }
                }
            }
        }
    }
}