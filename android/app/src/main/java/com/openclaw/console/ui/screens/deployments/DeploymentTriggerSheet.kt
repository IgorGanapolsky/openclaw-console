package com.openclaw.console.ui.screens.deployments

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.openclaw.console.data.model.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeploymentTriggerSheet(
    onDismiss: () -> Unit,
    onTrigger: (DeploymentRequest) -> Unit
) {
    var environment by remember { mutableStateOf(DeploymentEnvironment.STAGING) }
    var platform by remember { mutableStateOf(DeploymentPlatform.BOTH) }
    var selectedBranch by remember { mutableStateOf("main") }
    var description by remember { mutableStateOf("") }
    var availableBranches by remember { mutableStateOf(listOf("main", "develop", "staging", "production")) }
    var isSubmitting by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    // Simulate loading branches
    LaunchedEffect(Unit) {
        kotlinx.coroutines.delay(500)
        availableBranches = listOf("main", "develop", "staging", "production", "feature/deployment-ui")
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        modifier = Modifier.fillMaxHeight(0.9f)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp)
        ) {
            // Header
            Column(
                modifier = Modifier.padding(horizontal = 24.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    text = "Trigger Deployment",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    text = "Configure and start a new deployment",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            HorizontalDivider(modifier = Modifier.padding(horizontal = 24.dp))

            // Environment Selection
            Column(
                modifier = Modifier.padding(horizontal = 24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    text = "Environment",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    text = "Choose the deployment environment",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .selectableGroup(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    DeploymentEnvironment.entries.forEach { env ->
                        EnvironmentCard(
                            environment = env,
                            isSelected = environment == env,
                            onSelect = { environment = env },
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
            }

            HorizontalDivider(modifier = Modifier.padding(horizontal = 24.dp))

            // Platform Selection
            Column(
                modifier = Modifier.padding(horizontal = 24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    text = "Platform",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    text = "Select platform(s) to deploy",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                Column(
                    modifier = Modifier.selectableGroup(),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    DeploymentPlatform.entries.forEach { plat ->
                        PlatformOption(
                            platform = plat,
                            isSelected = platform == plat,
                            onSelect = { platform = plat }
                        )
                    }
                }
            }

            HorizontalDivider(modifier = Modifier.padding(horizontal = 24.dp))

            // Branch Selection
            Column(
                modifier = Modifier.padding(horizontal = 24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    text = "Branch",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    text = "The git branch to deploy from",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                var expanded by remember { mutableStateOf(false) }

                ExposedDropdownMenuBox(
                    expanded = expanded,
                    onExpandedChange = { expanded = it }
                ) {
                    OutlinedTextField(
                        value = selectedBranch,
                        onValueChange = { },
                        readOnly = true,
                        modifier = Modifier
                            .fillMaxWidth()
                            .menuAnchor(),
                        label = { Text("Select Branch") },
                        trailingIcon = {
                            ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded)
                        }
                    )

                    ExposedDropdownMenu(
                        expanded = expanded,
                        onDismissRequest = { expanded = false }
                    ) {
                        availableBranches.forEach { branch ->
                            DropdownMenuItem(
                                text = { Text(branch) },
                                onClick = {
                                    selectedBranch = branch
                                    expanded = false
                                }
                            )
                        }
                    }
                }
            }

            HorizontalDivider(modifier = Modifier.padding(horizontal = 24.dp))

            // Description
            Column(
                modifier = Modifier.padding(horizontal = 24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    text = "Description",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold
                )

                OutlinedTextField(
                    value = description,
                    onValueChange = { description = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Deployment description (optional)") },
                    placeholder = { Text("Brief description of what's being deployed") },
                    minLines = 2,
                    maxLines = 4
                )
            }

            // Production Warning
            if (environment == DeploymentEnvironment.PRODUCTION) {
                Card(
                    modifier = Modifier.padding(horizontal = 24.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.1f)
                    ),
                    border = CardDefaults.outlinedCardBorder().copy(
                        brush = androidx.compose.foundation.BorderStroke(
                            1.dp,
                            MaterialTheme.colorScheme.error.copy(alpha = 0.3f)
                        ).brush
                    )
                ) {
                    Row(
                        modifier = Modifier.padding(16.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            Icons.Default.Warning,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.error,
                            modifier = Modifier.size(24.dp)
                        )
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(
                                text = "Production Deployment",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.SemiBold,
                                color = MaterialTheme.colorScheme.error
                            )
                            Text(
                                text = "This deployment requires biometric approval and will be live to users.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }

            // Error Message
            errorMessage?.let { error ->
                Card(
                    modifier = Modifier.padding(horizontal = 24.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.errorContainer
                    )
                ) {
                    Text(
                        text = error,
                        modifier = Modifier.padding(16.dp),
                        color = MaterialTheme.colorScheme.onErrorContainer,
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            }

            // Actions
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                OutlinedButton(
                    onClick = onDismiss,
                    modifier = Modifier.weight(1f),
                    enabled = !isSubmitting
                ) {
                    Text("Cancel")
                }

                Button(
                    onClick = {
                        isSubmitting = true
                        errorMessage = null

                        val request = DeploymentRequest(
                            environment = environment,
                            platform = platform,
                            branch = selectedBranch,
                            description = description.takeIf { it.isNotBlank() }
                        )

                        try {
                            onTrigger(request)
                        } catch (e: Exception) {
                            errorMessage = e.message
                            isSubmitting = false
                        }
                    },
                    modifier = Modifier.weight(1f),
                    enabled = !isSubmitting && selectedBranch.isNotBlank()
                ) {
                    if (isSubmitting) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(16.dp),
                            strokeWidth = 2.dp,
                            color = MaterialTheme.colorScheme.onPrimary
                        )
                    } else {
                        Text("Deploy")
                    }
                }
            }
        }
    }
}

@Composable
private fun EnvironmentCard(
    environment: DeploymentEnvironment,
    isSelected: Boolean,
    onSelect: () -> Unit,
    modifier: Modifier = Modifier
) {
    val containerColor = if (isSelected) {
        getEnvironmentColor(environment).copy(alpha = 0.1f)
    } else {
        MaterialTheme.colorScheme.surface
    }

    val borderColor = if (isSelected) {
        getEnvironmentColor(environment)
    } else {
        MaterialTheme.colorScheme.outline.copy(alpha = 0.5f)
    }

    Card(
        modifier = modifier
            .selectable(
                selected = isSelected,
                onClick = onSelect,
                role = Role.RadioButton
            ),
        colors = CardDefaults.cardColors(containerColor = containerColor),
        border = CardDefaults.outlinedCardBorder().copy(
            brush = androidx.compose.foundation.BorderStroke(
                if (isSelected) 2.dp else 1.dp,
                borderColor
            ).brush
        )
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Icon(
                imageVector = when (environment) {
                    DeploymentEnvironment.STAGING -> Icons.Default.Science
                    DeploymentEnvironment.PRODUCTION -> Icons.Default.Public
                },
                contentDescription = null,
                modifier = Modifier.size(32.dp),
                tint = if (isSelected) getEnvironmentColor(environment) else MaterialTheme.colorScheme.onSurfaceVariant
            )

            Text(
                text = environment.displayName,
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Medium,
                color = if (isSelected) getEnvironmentColor(environment) else MaterialTheme.colorScheme.onSurface
            )

            if (environment.requiresApproval) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Default.Lock,
                        contentDescription = null,
                        modifier = Modifier.size(12.dp),
                        tint = MaterialTheme.colorScheme.secondary
                    )
                    Text(
                        text = "Requires approval",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.secondary
                    )
                }
            }
        }
    }
}

@Composable
private fun PlatformOption(
    platform: DeploymentPlatform,
    isSelected: Boolean,
    onSelect: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .selectable(
                selected = isSelected,
                onClick = onSelect,
                role = Role.RadioButton
            )
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        RadioButton(
            selected = isSelected,
            onClick = onSelect
        )

        Icon(
            imageVector = when (platform) {
                DeploymentPlatform.IOS -> Icons.Default.PhoneIphone
                DeploymentPlatform.ANDROID -> Icons.Default.PhoneAndroid
                DeploymentPlatform.BOTH -> Icons.Default.Devices
            },
            contentDescription = null,
            modifier = Modifier.size(24.dp),
            tint = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
        )

        Text(
            text = platform.displayName,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = if (isSelected) FontWeight.Medium else FontWeight.Normal,
            color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface
        )
    }
}

@Composable
private fun getEnvironmentColor(environment: DeploymentEnvironment): Color {
    return when (environment) {
        DeploymentEnvironment.STAGING -> MaterialTheme.colorScheme.primary
        DeploymentEnvironment.PRODUCTION -> Color(0xFFD32F2F) // Red
    }
}