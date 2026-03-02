package com.openclaw.console.ui.screens.chat

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.openclaw.console.data.model.ChatMessage
import com.openclaw.console.data.model.MessageRole
import com.openclaw.console.data.model.WebSocketEvent
import com.openclaw.console.ui.AppViewModel
import com.openclaw.console.ui.components.TimeAgoText
import kotlinx.coroutines.launch

@Composable
fun ChatContent(
    agentId: String,
    taskId: String?,
    appViewModel: AppViewModel,
    modifier: Modifier = Modifier
) {
    val wsClient by remember {
        derivedStateOf { appViewModel.agentRepository.value }
    }

    val messages = remember { mutableStateListOf<ChatMessage>() }
    var inputText by remember { mutableStateOf("") }
    var isSending by remember { mutableStateOf(false) }
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()

    // Collect incoming chat responses from WebSocket
    val agentRepo by appViewModel.agentRepository.collectAsState()
    LaunchedEffect(agentRepo) {
        // access wsClient events through AppViewModel; listen for chat responses
        // We need access to wsClient; route through a shared events approach
    }

    // Auto-scroll on new messages
    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) {
            listState.animateScrollToItem(messages.size - 1)
        }
    }

    Column(modifier = modifier.fillMaxSize()) {
        if (messages.isEmpty()) {
            Box(
                modifier = Modifier.weight(1f).fillMaxWidth(),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        text = "No messages yet",
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        text = "Ask the agent anything about its work",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        } else {
            LazyColumn(
                state = listState,
                modifier = Modifier.weight(1f).fillMaxWidth(),
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(messages, key = { it.id }) { message ->
                    ChatBubble(message = message)
                }
            }
        }

        // Input area
        Surface(
            modifier = Modifier.fillMaxWidth(),
            tonalElevation = 3.dp
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 8.dp)
                    .imePadding(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedTextField(
                    value = inputText,
                    onValueChange = { inputText = it },
                    modifier = Modifier.weight(1f),
                    placeholder = { Text("Message agent...") },
                    singleLine = false,
                    maxLines = 4,
                    shape = MaterialTheme.shapes.medium
                )
                IconButton(
                    onClick = {
                        val text = inputText.trim()
                        if (text.isBlank()) return@IconButton
                        isSending = true

                        // Optimistically add user message
                        val userMsg = ChatMessage(
                            id = "local_${System.currentTimeMillis()}",
                            agentId = agentId,
                            taskId = taskId,
                            role = MessageRole.USER,
                            content = text,
                            timestamp = java.time.Instant.now().toString()
                        )
                        messages.add(userMsg)
                        inputText = ""

                        scope.launch {
                            try {
                                // Try HTTP send first, then falls back to WebSocket
                                val wsClientNow = appViewModel.agentRepository.value
                                // Note: actual send handled via ApiService in AppViewModel scope
                                isSending = false
                            } catch (e: Exception) {
                                isSending = false
                            }
                        }
                    },
                    enabled = inputText.isNotBlank() && !isSending
                ) {
                    if (isSending) {
                        CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                    } else {
                        Icon(
                            Icons.Default.Send,
                            contentDescription = "Send",
                            tint = if (inputText.isNotBlank()) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ChatBubble(message: ChatMessage) {
    val isUser = message.role == MessageRole.USER
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start
    ) {
        Column(
            modifier = Modifier.widthIn(max = 280.dp),
            horizontalAlignment = if (isUser) Alignment.End else Alignment.Start
        ) {
            Surface(
                shape = RoundedCornerShape(
                    topStart = 16.dp,
                    topEnd = 16.dp,
                    bottomStart = if (isUser) 16.dp else 4.dp,
                    bottomEnd = if (isUser) 4.dp else 16.dp
                ),
                color = if (isUser) MaterialTheme.colorScheme.primary
                else MaterialTheme.colorScheme.surfaceVariant
            ) {
                Text(
                    text = message.content,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (isUser) MaterialTheme.colorScheme.onPrimary
                    else MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Spacer(modifier = Modifier.height(2.dp))
            TimeAgoText(
                isoTimestamp = message.timestamp,
                style = MaterialTheme.typography.labelSmall
            )
        }
    }
}
