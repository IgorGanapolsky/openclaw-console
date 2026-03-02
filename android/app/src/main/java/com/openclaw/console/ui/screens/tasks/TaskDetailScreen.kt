package com.openclaw.console.ui.screens.tasks

import androidx.compose.material3.pulltorefresh.PullToRefreshBox

import androidx.lifecycle.compose.collectAsStateWithLifecycle

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.openclaw.console.data.model.*
import com.openclaw.console.ui.AppViewModel
import com.openclaw.console.ui.components.*
import com.openclaw.console.ui.theme.MonospaceStyle
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TaskDetailScreen(
    agentId: String,
    taskId: String,
    appViewModel: AppViewModel,
    onBack: () -> Unit,
    viewModel: TaskDetailViewModel = viewModel()
) {
    val taskRepo by appViewModel.taskRepository.collectAsStateWithLifecycle()

    LaunchedEffect(agentId, taskId, taskRepo) {
        viewModel.init(agentId, taskId, taskRepo)
    }

    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val listState = rememberLazyListState()

    // Auto-scroll when new steps arrive
    val stepCount = uiState.task?.steps?.size ?: 0
    LaunchedEffect(stepCount) {
        if (stepCount > 0) listState.animateScrollToItem(stepCount - 1)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = uiState.task?.title ?: "Task",
                            style = MaterialTheme.typography.titleMedium
                        )
                        uiState.task?.status?.let { status ->
                            TaskStatusBadge(status = status)
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        },
        bottomBar = {
            TaskChatInput(
                value = uiState.chatInput,
                onValueChange = viewModel::onChatInputChange,
                onSend = {
                    // Delegated to AgentDetailScreen's chat — just a contextual question
                    appViewModel.agentRepository.value // trigger via AppViewModel if needed
                },
                isSending = uiState.isSendingMessage
            )
        }
    ) { paddingValues ->
        when {
            uiState.isLoading && uiState.task == null -> {
                Box(
                    modifier = Modifier.fillMaxSize().padding(paddingValues),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator()
                }
            }
            uiState.task == null -> {
                Box(
                    modifier = Modifier.fillMaxSize().padding(paddingValues),
                    contentAlignment = Alignment.Center
                ) {
                    EmptyState(
                        title = "Task not found",
                        subtitle = "This task may have been removed",
                        icon = Icons.Default.ErrorOutline
                    )
                }
            }
            else -> {
                val task = uiState.task ?: return@IconButton
                LazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxSize().padding(paddingValues),
                    contentPadding = PaddingValues(bottom = 16.dp)
                ) {
                    // Task header
                    item {
                        TaskHeader(task = task)
                    }

                    // Resource links
                    if (task.links.isNotEmpty()) {
                        item {
                            Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                                Text(
                                    text = "Resources",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(bottom = 8.dp)
                                )
                                LazyRow(
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    items(task.links) { link ->
                                        ResourceLinkChip(link = link)
                                    }
                                }
                            }
                        }
                    }

                    // Timeline header
                    if (task.steps.isNotEmpty()) {
                        item {
                            Text(
                                text = "Timeline",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                            )
                        }
                    }

                    // Timeline steps
                    items(
                        items = task.steps.sortedBy { it.timestamp },
                        key = { it.id }
                    ) { step ->
                        val isLast = task.steps.sortedBy { it.timestamp }.last() == step
                        TimelineStep(step = step, isLast = isLast)
                    }

                    // Error message
                    uiState.error?.let { error ->
                        item {
                            Card(
                                modifier = Modifier.padding(16.dp),
                                colors = CardDefaults.cardColors(
                                    containerColor = MaterialTheme.colorScheme.errorContainer
                                )
                            ) {
                                Text(
                                    text = error,
                                    modifier = Modifier.padding(12.dp),
                                    color = MaterialTheme.colorScheme.onErrorContainer
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun TaskHeader(task: Task) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        if (task.description.isNotEmpty()) {
            Text(
                text = task.description,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface
            )
        }
        Row(
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Column {
                Text("Created", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                TimeAgoText(task.createdAt)
            }
            Column {
                Text("Updated", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                TimeAgoText(task.updatedAt)
            }
        }
        HorizontalDivider()
    }
}

@Composable
private fun TimelineStep(step: TaskStep, isLast: Boolean) {
    val dotColor = stepDotColor(step.type)
    val icon = stepIcon(step.type)

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
    ) {
        // Timeline column: dot + line
        Column(
            modifier = Modifier.width(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Surface(
                modifier = Modifier.size(24.dp),
                shape = MaterialTheme.shapes.small,
                color = dotColor.copy(alpha = 0.15f)
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = dotColor,
                    modifier = Modifier.padding(4.dp)
                )
            }
            if (!isLast) {
                Canvas(
                    modifier = Modifier
                        .width(2.dp)
                        .height(32.dp)
                ) {
                    drawLine(
                        color = dotColor.copy(alpha = 0.3f),
                        start = Offset(size.width / 2, 0f),
                        end = Offset(size.width / 2, size.height),
                        strokeWidth = 2.dp.toPx()
                    )
                }
            }
        }

        Spacer(modifier = Modifier.width(12.dp))

        // Step content
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(bottom = if (isLast) 16.dp else 8.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = step.type.name.lowercase().replace('_', ' ')
                        .replaceFirstChar { it.uppercase() },
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Medium,
                    color = dotColor
                )
                Text(
                    text = formatStepTimestamp(step.timestamp),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Spacer(modifier = Modifier.height(4.dp))
            if (step.type == TaskStepType.TOOL_CALL || step.type == TaskStepType.OUTPUT) {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    shape = MaterialTheme.shapes.small
                ) {
                    Text(
                        text = step.content,
                        modifier = Modifier.padding(8.dp),
                        style = MonospaceStyle,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            } else {
                Text(
                    text = step.content,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
        }
    }
}

@Composable
private fun stepDotColor(type: TaskStepType): Color {
    return when (type) {
        TaskStepType.LOG -> MaterialTheme.colorScheme.onSurfaceVariant
        TaskStepType.TOOL_CALL -> MaterialTheme.colorScheme.primary
        TaskStepType.OUTPUT -> Color(0xFF1B8A3B)
        TaskStepType.ERROR -> MaterialTheme.colorScheme.error
        TaskStepType.INFO -> MaterialTheme.colorScheme.tertiary
    }
}

@Composable
private fun stepIcon(type: TaskStepType): ImageVector {
    return when (type) {
        TaskStepType.LOG -> Icons.Default.Notes
        TaskStepType.TOOL_CALL -> Icons.Default.Build
        TaskStepType.OUTPUT -> Icons.Default.CheckCircle
        TaskStepType.ERROR -> Icons.Default.Error
        TaskStepType.INFO -> Icons.Default.Info
    }
}

private fun formatStepTimestamp(isoTimestamp: String): String {
    return try {
        DateTimeFormatter.ofPattern("HH:mm:ss")
            .withZone(ZoneId.systemDefault())
            .format(Instant.parse(isoTimestamp))
    } catch (e: Exception) {
        isoTimestamp.take(8)
    }
}

@Composable
private fun TaskChatInput(
    value: String,
    onValueChange: (String) -> Unit,
    onSend: () -> Unit,
    isSending: Boolean
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        tonalElevation = 3.dp
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 8.dp)
                .navigationBarsPadding()
                .imePadding(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            OutlinedTextField(
                value = value,
                onValueChange = onValueChange,
                modifier = Modifier.weight(1f),
                placeholder = { Text("Ask agent about this task...") },
                singleLine = true,
                shape = MaterialTheme.shapes.medium
            )
            IconButton(
                onClick = {
                    if (value.isNotBlank()) {
                        onSend()
                        onValueChange("")
                    }
                },
                enabled = value.isNotBlank() && !isSending
            ) {
                if (isSending) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                } else {
                    Icon(
                        Icons.Default.Send,
                        contentDescription = "Send",
                        tint = if (value.isNotBlank()) MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}
