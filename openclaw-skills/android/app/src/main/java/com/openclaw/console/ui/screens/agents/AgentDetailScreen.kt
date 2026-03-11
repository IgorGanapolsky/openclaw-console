package com.openclaw.console.ui.screens.agents

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Task
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.openclaw.console.data.model.Agent
import com.openclaw.console.data.model.AgentStatus
import com.openclaw.console.ui.AppViewModel
import com.openclaw.console.ui.components.StatusDot
import com.openclaw.console.ui.components.TimeAgoText
import com.openclaw.console.ui.screens.chat.ChatContent
import com.openclaw.console.ui.screens.tasks.TaskListContent
import androidx.lifecycle.compose.collectAsStateWithLifecycle

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AgentDetailScreen(
    agentId: String,
    appViewModel: AppViewModel,
    onTaskClick: (String) -> Unit,
    onBack: () -> Unit
) {
    val agentRepo by appViewModel.agentRepository.collectAsStateWithLifecycle()
    val taskRepo by appViewModel.taskRepository.collectAsStateWithLifecycle()

    val agent by remember(agentRepo) {
        derivedStateOf {
            agentRepo?.agents?.value?.find { it.id == agentId }
        }
    }

    var selectedTab by remember { mutableIntStateOf(0) }
    val tabs = listOf("Tasks", "Chat")

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = agent?.name ?: "Agent",
                            style = MaterialTheme.typography.titleMedium
                        )
                        agent?.workspace?.let { workspace ->
                            Text(
                                text = workspace,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            // Agent info header
            agent?.let { a ->
                AgentInfoHeader(agent = a)
            } ?: run {
                Box(
                    modifier = Modifier.fillMaxWidth().height(80.dp),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(modifier = Modifier.size(24.dp))
                }
            }

            // Tab row
            TabRow(selectedTabIndex = selectedTab) {
                tabs.forEachIndexed { index, title ->
                    Tab(
                        selected = selectedTab == index,
                        onClick = { selectedTab = index },
                        text = { Text(title) },
                        icon = {
                            Icon(
                                imageVector = if (index == 0) Icons.Default.Task else Icons.Default.Chat,
                                contentDescription = null,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    )
                }
            }

            // Tab content
            when (selectedTab) {
                0 -> TaskListContent(
                    agentId = agentId,
                    taskRepository = taskRepo,
                    onTaskClick = onTaskClick
                )
                1 -> ChatContent(
                    agentId = agentId,
                    taskId = null,
                    appViewModel = appViewModel
                )
            }
        }
    }
}

@Composable
private fun AgentInfoHeader(agent: Agent) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surfaceVariant,
        tonalElevation = 2.dp
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            StatusDot(status = agent.status, size = 14)

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = when (agent.status) {
                        AgentStatus.ONLINE -> "Online"
                        AgentStatus.OFFLINE -> "Offline"
                        AgentStatus.BUSY -> "Busy"
                    },
                    style = MaterialTheme.typography.labelMedium
                )
                if (agent.description.isNotEmpty()) {
                    Text(
                        text = agent.description,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2
                    )
                }
            }

            Column(horizontalAlignment = Alignment.End) {
                Text(
                    text = "${agent.activeTasks} tasks",
                    style = MaterialTheme.typography.labelSmall
                )
                TimeAgoText(agent.lastActive, style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}
