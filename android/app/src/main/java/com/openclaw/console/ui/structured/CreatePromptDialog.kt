package com.openclaw.console.ui.structured

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.openclaw.console.R
import com.openclaw.console.data.model.Agent
import com.openclaw.console.ui.components.StatusDot

/**
 * HIGH-ROI: Create Prompt Dialog for Multica Integration
 * Core component for structured prompt creation on Android
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreatePromptDialog(
    agents: List<Agent>,
    onDismiss: () -> Unit,
    onConfirm: (title: String, prompt: String, agentId: String, priority: String) -> Unit
) {
    var title by remember { mutableStateOf("") }
    var prompt by remember { mutableStateOf("") }
    var selectedAgentId by remember { mutableStateOf("") }
    var selectedPriority by remember { mutableStateOf("Medium") }

    val priorities = listOf("Low", "Medium", "High", "Critical")

    val isFormValid = title.isNotBlank() &&
                     prompt.isNotBlank() &&
                     selectedAgentId.isNotBlank()

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            shape = MaterialTheme.shapes.large
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(24.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Header
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "New Structured Prompt",
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold
                    )

                    IconButton(onClick = onDismiss) {
                        Icon(
                            painter = painterResource(R.drawable.ic_close),
                            contentDescription = "Close"
                        )
                    }
                }

                // Title Input
                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it },
                    label = { Text("Title") },
                    placeholder = { Text("What should this accomplish?") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )

                // Prompt Input
                OutlinedTextField(
                    value = prompt,
                    onValueChange = { prompt = it },
                    label = { Text("Prompt Description") },
                    placeholder = { Text("Describe the task in detail. Be specific about outputs and constraints.") },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(120.dp),
                    maxLines = 5
                )

                // Agent Selection
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = "Select Agent",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold
                    )

                    agents.forEach { agent ->
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .selectable(
                                    selected = selectedAgentId == agent.id,
                                    onClick = { selectedAgentId = agent.id }
                                ),
                            colors = CardDefaults.cardColors(
                                containerColor = if (selectedAgentId == agent.id) {
                                    MaterialTheme.colorScheme.primaryContainer
                                } else {
                                    MaterialTheme.colorScheme.surfaceVariant
                                }
                            )
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                StatusDot(status = agent.status)

                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = agent.name,
                                        style = MaterialTheme.typography.bodyMedium,
                                        fontWeight = FontWeight.Medium
                                    )
                                    Text(
                                        text = agent.description,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        maxLines = 1
                                    )
                                }

                                if (selectedAgentId == agent.id) {
                                    Icon(
                                        painter = painterResource(R.drawable.ic_check),
                                        contentDescription = "Selected",
                                        tint = MaterialTheme.colorScheme.primary
                                    )
                                }
                            }
                        }
                    }
                }

                // Priority Selection
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = "Priority",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        priorities.forEach { priority ->
                            FilterChip(
                                onClick = { selectedPriority = priority },
                                label = { Text(priority) },
                                selected = selectedPriority == priority,
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }
                }

                // Info Section
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                    )
                ) {
                    Column(
                        modifier = Modifier.padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                painter = painterResource(R.drawable.ic_info),
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(16.dp)
                            )
                            Text(
                                text = "This will create a structured issue in Multica for the selected agent.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }

                        if (selectedPriority == "Critical") {
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    painter = painterResource(R.drawable.ic_hand_raised),
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.error,
                                    modifier = Modifier.size(16.dp)
                                )
                                Text(
                                    text = "Critical priority prompts may require biometric approval.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                }

                // Action Buttons
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.End)
                ) {
                    TextButton(onClick = onDismiss) {
                        Text("Cancel")
                    }

                    Button(
                        onClick = {
                            onConfirm(title, prompt, selectedAgentId, selectedPriority)
                        },
                        enabled = isFormValid
                    ) {
                        Text("Create Prompt")
                    }
                }
            }
        }
    }
}