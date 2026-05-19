package com.openclaw.console.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.fragment.app.FragmentActivity
import com.openclaw.console.service.BiometricService
import com.openclaw.console.service.BiometricResult
import kotlinx.coroutines.launch

@Composable
fun BiometricAuthDialog(
    isVisible: Boolean,
    request: BiometricService.AuthenticationRequest,
    biometricService: BiometricService,
    onResult: (BiometricResult) -> Unit,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var isProcessing by remember { mutableStateOf(false) }
    var showError by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf("") }

    val capability = remember(context) { biometricService.getCapability(context) }

    if (isVisible) {
        Dialog(
            onDismissRequest = onDismiss,
            properties = DialogProperties(dismissOnBackPress = true, dismissOnClickOutside = false)
        ) {
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                shape = RoundedCornerShape(20.dp),
                elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
            ) {
                Column(
                    modifier = Modifier.padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    // Icon based on capability and processing state
                    when {
                        isProcessing -> {
                            CircularProgressIndicator(
                                modifier = Modifier.size(64.dp),
                                strokeWidth = 4.dp,
                                color = MaterialTheme.colorScheme.primary
                            )
                        }
                        !capability.isAvailable -> {
                            Icon(
                                imageVector = Icons.Default.Warning,
                                contentDescription = null,
                                modifier = Modifier.size(64.dp),
                                tint = MaterialTheme.colorScheme.error
                            )
                        }
                        showError -> {
                            Icon(
                                imageVector = Icons.Default.Error,
                                contentDescription = null,
                                modifier = Modifier.size(64.dp),
                                tint = MaterialTheme.colorScheme.error
                            )
                        }
                        else -> {
                            Icon(
                                imageVector = Icons.Default.Fingerprint,
                                contentDescription = null,
                                modifier = Modifier.size(64.dp),
                                tint = MaterialTheme.colorScheme.primary
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    // Title
                    Text(
                        text = request.title,
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Center
                    )

                    Spacer(modifier = Modifier.height(8.dp))

                    // Description based on state
                    Text(
                        text = when {
                            isProcessing -> "Authenticating..."
                            !capability.isAvailable -> capability.statusMessage
                            showError -> errorMessage
                            else -> request.description
                        },
                        style = MaterialTheme.typography.bodyMedium,
                        textAlign = TextAlign.Center,
                        color = when {
                            !capability.isAvailable || showError -> MaterialTheme.colorScheme.error
                            else -> MaterialTheme.colorScheme.onSurfaceVariant
                        }
                    )

                    Spacer(modifier = Modifier.height(24.dp))

                    // Action buttons
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        if (capability.isAvailable && !isProcessing) {
                            Button(
                                onClick = {
                                    scope.launch {
                                        isProcessing = true
                                        showError = false

                                        val activity = context as? FragmentActivity
                                        if (activity != null) {
                                            val result = biometricService.authenticateForOperation(
                                                activity = activity,
                                                request = request
                                            )
                                            isProcessing = false

                                            when (result) {
                                                is BiometricResult.Success -> {
                                                    onResult(result)
                                                }
                                                is BiometricResult.Error -> {
                                                    showError = true
                                                    errorMessage = result.message
                                                }
                                                BiometricResult.UserCancelled -> {
                                                    onResult(result)
                                                }
                                                BiometricResult.Lockout -> {
                                                    showError = true
                                                    errorMessage = "Too many failed attempts. Please try again later or use your device PIN."
                                                }
                                                BiometricResult.NotAvailable -> {
                                                    showError = true
                                                    errorMessage = "Biometric authentication is not available."
                                                }
                                            }
                                        } else {
                                            isProcessing = false
                                            showError = true
                                            errorMessage = "Unable to access biometric authentication."
                                        }
                                    }
                                },
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(12.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Fingerprint,
                                    contentDescription = null,
                                    modifier = Modifier.size(20.dp)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Authenticate")
                            }
                        }

                        if (!isProcessing) {
                            OutlinedButton(
                                onClick = {
                                    onResult(BiometricResult.UserCancelled)
                                },
                                modifier = if (capability.isAvailable) Modifier.weight(1f) else Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(12.dp)
                            ) {
                                Text(if (capability.isAvailable) "Cancel" else "Close")
                            }
                        }
                    }

                    // Retry button for errors
                    if (showError && capability.isAvailable) {
                        Spacer(modifier = Modifier.height(12.dp))

                        TextButton(
                            onClick = {
                                showError = false
                                errorMessage = ""
                            }
                        ) {
                            Icon(
                                imageVector = Icons.Default.Refresh,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Try Again")
                        }
                    }

                    // Fallback option info
                    if (!capability.isAvailable && capability.canFallbackToDevice) {
                        Spacer(modifier = Modifier.height(16.dp))

                        Card(
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.surfaceVariant
                            ),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Row(
                                modifier = Modifier.padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Info,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(16.dp)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = "You can use your device PIN or pattern as an alternative",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
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
fun BiometricProtectedAction(
    request: BiometricService.AuthenticationRequest,
    biometricService: BiometricService,
    onSuccess: () -> Unit,
    onCancel: () -> Unit = {},
    content: @Composable (onClick: () -> Unit) -> Unit
) {
    var showDialog by remember { mutableStateOf(false) }

    content { showDialog = true }

    BiometricAuthDialog(
        isVisible = showDialog,
        request = request,
        biometricService = biometricService,
        onResult = { result ->
            showDialog = false
            when (result) {
                is BiometricResult.Success -> onSuccess()
                else -> onCancel()
            }
        },
        onDismiss = {
            showDialog = false
            onCancel()
        }
    )
}