package com.openclaw.console.ui.screens.loops

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
import androidx.compose.ui.window.Dialog
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.openclaw.console.data.model.RecurringTask
import com.openclaw.console.ui.AppViewModel
import com.openclaw.console.ui.components.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoopListScreen(
    appViewModel: AppViewModel,
    viewModel: LoopViewModel = viewModel()
) {
    val loopRepo by appViewModel.loopRepository.collectAsStateWithLifecycle()
    val connectionState by appViewModel.connectionState.collectAsStateWithLifecycle()

    LaunchedEffect(loopRepo) {
        viewModel.setRepository(loopRepo)
    }

    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    var isRefreshing by remember { mutableStateOf(false) }
    var showingGenerator by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Autonomous Loops") },
                actions = {
                    IconButton(onClick = { showingGenerator = true }) {
                        Icon(Icons.Default.AddCircle, contentDescription = "New Skill")
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
            modifier = Modifier.fillMaxSize().padding(paddingValues)
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                ConnectionStatusBanner(state = connectionState)

                if (uiState.tasks.isEmpty() && !uiState.isLoading) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        EmptyState(
                            title = "No Active Loops",
                            subtitle = "Generate a new autonomous skill to get started.",
                            icon = Icons.Default.Autorenew
                        )
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        items(uiState.tasks, key = { it.id }) { task ->
                            LoopItem(task = task)
                        }
                    }
                }
            }
        }
    }

    if (showingGenerator) {
        SkillGeneratorDialog(
            uiState = uiState,
            onDismiss = { 
                showingGenerator = false 
                viewModel.clearSuccess()
            },
            onGenerate = { prompt ->
                viewModel.generateSkill(prompt)
            }
        )
    }
}

@Composable
fun LoopItem(task: RecurringTask) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Default.Autorenew,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = task.name,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.weight(1f))
                StatusBadge(status = task.status)
            }
            
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = task.description,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            
            Spacer(modifier = Modifier.height(12.dp))
            Row(modifier = Modifier.fillMaxWidth()) {
                Text(
                    text = "Agent: ${task.agentId}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.tertiary
                )
                Spacer(modifier = Modifier.weight(1f))
                task.nextRun?.let { next ->
                    Text(
                        text = "Next: $next", // Simple display for now
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.secondary
                    )
                }
            }
        }
    }
}

@Composable
fun StatusBadge(status: String) {
    val color = when (status) {
        "active" -> Color(0xFF2E7D32)
        "paused" -> Color(0xFFEF6C00)
        "failed" -> Color(0xFFC62828)
        else -> MaterialTheme.colorScheme.outline
    }
    Surface(
        color = color.copy(alpha = 0.1f),
        shape = MaterialTheme.shapes.extraSmall,
        border = androidx.compose.foundation.BorderStroke(1.dp, color.copy(alpha = 0.5f))
    ) {
        Text(
            text = status.uppercase(),
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
            style = MaterialTheme.typography.labelSmall,
            color = color,
            fontWeight = FontWeight.Bold
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SkillGeneratorDialog(
    uiState: LoopListUiState,
    onDismiss: () -> Unit,
    onGenerate: (String) -> Unit
) {
    var prompt by remember { mutableStateOf("") }

    Dialog(onDismissRequest = onDismiss) {
        Card(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            shape = MaterialTheme.shapes.large
        ) {
            Column(
                modifier = Modifier.padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Text("Generate New Skill", style = MaterialTheme.typography.headlineSmall)
                
                if (uiState.generateSuccessMsg != null) {
                    Text(uiState.generateSuccessMsg, color = Color(0xFF2E7D32))
                    Button(onClick = onDismiss, modifier = Modifier.align(Alignment.End)) {
                        Text("Close")
                    }
                } else {
                    OutlinedTextField(
                        value = prompt,
                        onValueChange = { prompt = it },
                        label = { Text("Prompt") },
                        placeholder = { Text("e.g. Check AWS spend every hour") },
                        modifier = Modifier.fillMaxWidth().height(120.dp),
                        enabled = !uiState.isGenerating
                    )
                    
                    if (uiState.generateError != null) {
                        Text(uiState.generateError, color = MaterialTheme.colorScheme.error)
                    }
                    
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.End,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        TextButton(onClick = onDismiss, enabled = !uiState.isGenerating) {
                            Text("Cancel")
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                        Button(
                            onClick = { onGenerate(prompt) },
                            enabled = prompt.isNotBlank() && !uiState.isGenerating
                        ) {
                            if (uiState.isGenerating) {
                                CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                            } else {
                                Text("Generate")
                            }
                        }
                    }
                }
            }
        }
    }
}
