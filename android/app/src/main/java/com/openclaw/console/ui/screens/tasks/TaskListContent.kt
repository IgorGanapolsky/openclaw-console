package com.openclaw.console.ui.screens.tasks

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
import androidx.compose.ui.unit.dp
import com.openclaw.console.data.model.Task
import com.openclaw.console.data.model.TaskStatus
import com.openclaw.console.data.repository.TaskRepository
import com.openclaw.console.ui.components.EmptyState
import com.openclaw.console.ui.components.TaskStatusBadge
import com.openclaw.console.ui.components.TimeAgoText

@Composable
fun TaskListContent(
    agentId: String,
    taskRepository: TaskRepository?,
    onTaskClick: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    LaunchedEffect(agentId, taskRepository) {
        taskRepository?.getTasksForAgent(agentId)
    }

    val tasks by remember(taskRepository, agentId) {
        derivedStateOf {
            taskRepository?.tasksByAgent?.value?.get(agentId) ?: emptyList()
        }
    }

    val isLoading by remember(taskRepository) {
        derivedStateOf { taskRepository?.isLoading?.value ?: false }
    }

    when {
        isLoading && tasks.isEmpty() -> {
            Box(
                modifier = modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator()
            }
        }
        tasks.isEmpty() -> {
            Box(
                modifier = modifier.fillMaxSize().padding(top = 32.dp),
                contentAlignment = Alignment.TopCenter
            ) {
                EmptyState(
                    title = "No tasks",
                    subtitle = "This agent hasn't run any tasks yet",
                    icon = Icons.Default.Task
                )
            }
        }
        else -> {
            LazyColumn(
                modifier = modifier.fillMaxSize(),
                contentPadding = PaddingValues(vertical = 4.dp)
            ) {
                items(
                    items = tasks.sortedByDescending { it.updatedAt },
                    key = { it.id }
                ) { task ->
                    TaskListItem(
                        task = task,
                        onClick = { onTaskClick(task.id) }
                    )
                }
            }
        }
    }
}

@Composable
private fun TaskListItem(task: Task, onClick: () -> Unit) {
    ListItem(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        headlineContent = {
            Text(
                text = task.title,
                style = MaterialTheme.typography.titleSmall,
                maxLines = 2
            )
        },
        supportingContent = {
            if (task.description.isNotEmpty()) {
                Text(
                    text = task.description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1
                )
            }
        },
        leadingContent = {
            TaskStatusBadge(status = task.status)
        },
        trailingContent = {
            Column(
                horizontalAlignment = Alignment.End,
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                TimeAgoText(task.updatedAt, style = MaterialTheme.typography.labelSmall)
                if (task.steps.isNotEmpty()) {
                    Text(
                        text = "${task.steps.size} steps",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Icon(
                    Icons.Default.ChevronRight,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(16.dp)
                )
            }
        }
    )
    HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp))
}
