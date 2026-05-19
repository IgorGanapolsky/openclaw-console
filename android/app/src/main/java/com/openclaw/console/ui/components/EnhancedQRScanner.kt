package com.openclaw.console.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.openclaw.console.data.model.*
import com.openclaw.console.service.ConnectionManager
import com.openclaw.console.service.ConnectionResult
import com.openclaw.console.service.ConnectionProgress
import kotlinx.coroutines.launch
import kotlinx.coroutines.CoroutineScope

@Composable
fun EnhancedQRScannerDialog(
    isVisible: Boolean,
    onDismiss: () -> Unit,
    onConnectionSuccess: (ConnectionResult.Success) -> Unit,
    onConnectionError: (String) -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val connectionManager = remember { ConnectionManager(context) }

    var isConnecting by remember { mutableStateOf(false) }
    var scannedConnectionInfo by remember { mutableStateOf<GatewayConnectionInfo?>(null) }

    val connectionProgress by connectionManager.connectionProgress.collectAsStateWithLifecycle()

    if (isVisible) {
        AlertDialog(
            onDismissRequest = onDismiss,
            confirmButton = {
                TextButton(onClick = onDismiss) {
                    Text("Close")
                }
            },
            title = {
                Row(
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.QrCodeScanner,
                        contentDescription = null
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Enhanced QR Scanner")
                }
            },
            text = {
                Column {
                    if (isConnecting) {
                        ConnectionProgressView(
                            progress = connectionProgress,
                            connectionInfo = scannedConnectionInfo
                        )
                    } else {
                        // QR Scanner Camera View (placeholder)
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(200.dp),
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.surfaceVariant
                            )
                        ) {
                            Box(
                                modifier = Modifier.fillMaxSize(),
                                contentAlignment = Alignment.Center
                            ) {
                                Column(
                                    horizontalAlignment = Alignment.CenterHorizontally
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.QrCodeScanner,
                                        contentDescription = null,
                                        modifier = Modifier.size(64.dp),
                                        tint = MaterialTheme.colorScheme.primary
                                    )
                                    Spacer(modifier = Modifier.height(8.dp))
                                    Text("Point camera at QR code")

                                    Spacer(modifier = Modifier.height(16.dp))

                                    // Test button for development
                                    Button(
                                        onClick = {
                                            // Simulate QR code scan for testing with realistic cross-network endpoints
                                            val testConnectionInfo = GatewayConnectionInfo(
                                                gatewayId = "dev-gateway-${System.currentTimeMillis()}",
                                                name = "Development Gateway",
                                                endpoints = listOf(
                                                    // Local network (will fail cross-network)
                                                    ConnectionEndpoint.local("http://192.168.1.100:18789"),
                                                    // Tailscale mesh network
                                                    ConnectionEndpoint.mesh("dev-gateway.tailnet.ts.net"),
                                                    // ngrok tunnel (commonly used for dev)
                                                    ConnectionEndpoint.tunnel("https://abc123-dev.ngrok.io"),
                                                    // CloudFlare tunnel
                                                    ConnectionEndpoint.tunnel("https://gateway-dev.trycloudflare.com"),
                                                    // OpenClaw relay (always available)
                                                    ConnectionEndpoint.relay("dev-gateway-${System.currentTimeMillis()}")
                                                ),
                                                security = GatewaySecurityInfo(
                                                    expectedFingerprint = "SHA256:test-development-fingerprint",
                                                    authToken = "dev-auth-token-${System.currentTimeMillis()}"
                                                )
                                            )
                                            handleQRCodeScanned(
                                                testConnectionInfo,
                                                connectionManager,
                                                scope,
                                                { isConnecting = it },
                                                { scannedConnectionInfo = it },
                                                onConnectionSuccess,
                                                onConnectionError
                                            )
                                        }
                                    ) {
                                        Text("Test Connection")
                                    }
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(16.dp))

                        // QR Format Info
                        Card(
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f)
                            )
                        ) {
                            Column(
                                modifier = Modifier.padding(12.dp)
                            ) {
                                Row(
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
                                        text = "Enhanced QR Support",
                                        style = MaterialTheme.typography.titleSmall,
                                        fontWeight = FontWeight.Bold
                                    )
                                }

                                Spacer(modifier = Modifier.height(8.dp))

                                Text(
                                    text = "This scanner supports multiple connection methods for cross-network connectivity:",
                                    style = MaterialTheme.typography.bodySmall
                                )

                                Spacer(modifier = Modifier.height(8.dp))

                                Column {
                                    ConnectionTypeInfo(
                                        icon = Icons.Default.Wifi,
                                        type = "Local Network",
                                        description = "Fastest, same WiFi"
                                    )
                                    ConnectionTypeInfo(
                                        icon = Icons.Default.VpnKey,
                                        type = "Mesh Network",
                                        description = "Secure, any network"
                                    )
                                    ConnectionTypeInfo(
                                        icon = Icons.Default.Cloud,
                                        type = "Internet Tunnel",
                                        description = "Always works"
                                    )
                                }
                            }
                        }
                    }
                }
            }
        )
    }
}

@Composable
private fun ConnectionProgressView(
    progress: ConnectionProgress,
    connectionInfo: GatewayConnectionInfo?
) {
    Column {
        Text(
            text = "Connecting to ${connectionInfo?.name ?: "Gateway"}...",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold
        )

        Spacer(modifier = Modifier.height(16.dp))

        // Overall progress
        LinearProgressIndicator(
            progress = {
                if (progress.bestConnection != null) 1f
                else progress.completed.size.toFloat() / maxOf(progress.attempting.size, 1)
            },
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(modifier = Modifier.height(16.dp))

        // Individual endpoint attempts
        progress.attempting.forEach { endpoint ->
            ConnectionAttemptRow(
                endpoint = endpoint,
                result = progress.completed.find {
                    when (it) {
                        is ConnectionResult.Success -> it.endpoint == endpoint
                        is ConnectionResult.Failure -> it.endpoint == endpoint
                        ConnectionResult.Cancelled -> false
                    }
                },
                isBest = progress.bestConnection?.endpoint == endpoint
            )
        }

        progress.bestConnection?.let { best ->
            Spacer(modifier = Modifier.height(16.dp))
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer
                )
            ) {
                Row(
                    modifier = Modifier.padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.CheckCircle,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Connected via ${best.endpoint.description} (${best.latencyMs}ms)",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                }
            }
        }
    }
}

@Composable
private fun ConnectionAttemptRow(
    endpoint: ConnectionEndpoint,
    result: ConnectionResult?,
    isBest: Boolean
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Status icon
        when (result) {
            is ConnectionResult.Success -> {
                Icon(
                    imageVector = if (isBest) Icons.Default.CheckCircle else Icons.Default.Check,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(16.dp)
                )
            }
            is ConnectionResult.Failure -> {
                Icon(
                    imageVector = Icons.Default.Error,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.error,
                    modifier = Modifier.size(16.dp)
                )
            }
            null -> {
                CircularProgressIndicator(
                    modifier = Modifier.size(16.dp),
                    strokeWidth = 2.dp
                )
            }
            ConnectionResult.Cancelled -> {
                Icon(
                    imageVector = Icons.Default.Cancel,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(16.dp)
                )
            }
        }

        Spacer(modifier = Modifier.width(8.dp))

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = endpoint.description,
                style = MaterialTheme.typography.bodySmall,
                fontWeight = if (isBest) FontWeight.Bold else FontWeight.Normal
            )
            if (result is ConnectionResult.Success) {
                Text(
                    text = "${result.latencyMs}ms",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
private fun ConnectionTypeInfo(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    type: String,
    description: String
) {
    Row(
        modifier = Modifier.padding(vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(12.dp)
        )
        Spacer(modifier = Modifier.width(6.dp))
        Text(
            text = "$type: $description",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

private fun handleQRCodeScanned(
    connectionInfo: GatewayConnectionInfo,
    connectionManager: ConnectionManager,
    scope: CoroutineScope,
    setConnecting: (Boolean) -> Unit,
    setConnectionInfo: (GatewayConnectionInfo) -> Unit,
    onSuccess: (ConnectionResult.Success) -> Unit,
    onError: (String) -> Unit
) {
    setConnecting(true)
    setConnectionInfo(connectionInfo)

    scope.launch {
        try {
            when (val result = connectionManager.connectToGateway(connectionInfo)) {
                is ConnectionResult.Success -> {
                    onSuccess(result)
                }
                is ConnectionResult.Failure -> {
                    onError(result.error.message ?: "Connection failed")
                }
                ConnectionResult.Cancelled -> {
                    onError("Connection was cancelled")
                }
            }
        } catch (e: Exception) {
            onError(e.message ?: "Unexpected error during connection")
        } finally {
            setConnecting(false)
        }
    }
}