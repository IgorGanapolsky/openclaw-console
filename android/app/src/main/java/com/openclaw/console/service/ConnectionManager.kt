package com.openclaw.console.service

import android.content.Context
import android.util.Log
import com.openclaw.console.data.model.*
import com.openclaw.console.data.network.WebSocketClient
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlin.time.Duration.Companion.seconds

sealed class ConnectionResult {
    data class Success(
        val connection: WebSocketClient,
        val endpoint: ConnectionEndpoint,
        val latencyMs: Long
    ) : ConnectionResult()

    data class Failure(
        val endpoint: ConnectionEndpoint,
        val error: Throwable,
        val attemptDurationMs: Long
    ) : ConnectionResult()

    data object Cancelled : ConnectionResult()
}

data class ConnectionProgress(
    val attempting: List<ConnectionEndpoint> = emptyList(),
    val completed: List<ConnectionResult> = emptyList(),
    val bestConnection: ConnectionResult.Success? = null
)

/**
 * Smart connection manager that races multiple connection attempts
 * and selects the best available connection.
 */
class ConnectionManager(private val context: Context) {
    private val _connectionProgress = MutableStateFlow(ConnectionProgress())
    val connectionProgress: StateFlow<ConnectionProgress> = _connectionProgress

    companion object {
        private const val TAG = "ConnectionManager"
        private val CONNECTION_TIMEOUT = 10.seconds
        private val RACE_TIMEOUT = 15.seconds
    }

    /**
     * Attempts to connect using all available endpoints, racing them
     * and returning the fastest successful connection.
     */
    suspend fun connectToGateway(
        connectionInfo: GatewayConnectionInfo
    ): ConnectionResult = withContext(Dispatchers.IO) {
        Log.d(TAG, "Starting connection race for gateway: ${connectionInfo.name}")

        // Reset progress
        _connectionProgress.value = ConnectionProgress(
            attempting = connectionInfo.endpoints
        )

        // Sort endpoints by priority (lower number = higher priority)
        val sortedEndpoints = connectionInfo.endpoints.sortedBy { it.priority }

        try {
            // Race all connection attempts
            supervisorScope {
                val jobs = sortedEndpoints.map { endpoint ->
                    async {
                        attemptConnection(endpoint, connectionInfo)
                    }
                }

                // Wait for first success or all failures
                val raceJob = async {
                    var bestResult: ConnectionResult.Success? = null
                    val failures = mutableListOf<ConnectionResult.Failure>()

                    for (job in jobs) {
                        try {
                            when (val result = job.await()) {
                                is ConnectionResult.Success -> {
                                    // Update progress
                                    _connectionProgress.value = _connectionProgress.value.copy(
                                        completed = _connectionProgress.value.completed + result,
                                        bestConnection = selectBestConnection(bestResult, result)
                                    )

                                    if (bestResult == null) {
                                        bestResult = result
                                        // Cancel other attempts if we have a local connection
                                        if (result.endpoint.type == ConnectionType.LOCAL) {
                                            jobs.forEach { it.cancel() }
                                            return@async result
                                        }
                                    }
                                }
                                is ConnectionResult.Failure -> {
                                    failures.add(result)
                                    _connectionProgress.value = _connectionProgress.value.copy(
                                        completed = _connectionProgress.value.completed + result
                                    )
                                }
                                ConnectionResult.Cancelled -> {
                                    // Job was cancelled, continue with others
                                }
                            }
                        } catch (e: CancellationException) {
                            // Job was cancelled
                        }
                    }

                    bestResult ?: failures.firstOrNull() ?: ConnectionResult.Failure(
                        endpoint = sortedEndpoints.first(),
                        error = Exception("All connection attempts failed"),
                        attemptDurationMs = RACE_TIMEOUT.inWholeMilliseconds
                    )
                }

                // Timeout the entire race
                withTimeout(RACE_TIMEOUT) {
                    raceJob.await()
                }
            }

        } catch (e: TimeoutCancellationException) {
            Log.w(TAG, "Connection race timed out after ${RACE_TIMEOUT}")
            return@withContext ConnectionResult.Failure(
                endpoint = sortedEndpoints.first(),
                error = Exception("Connection race timed out"),
                attemptDurationMs = RACE_TIMEOUT.inWholeMilliseconds
            )
        } catch (e: Exception) {
            Log.e(TAG, "Connection race failed", e)
            return@withContext ConnectionResult.Failure(
                endpoint = sortedEndpoints.first(),
                error = e,
                attemptDurationMs = 0
            )
        }
    }

    private suspend fun attemptConnection(
        endpoint: ConnectionEndpoint,
        connectionInfo: GatewayConnectionInfo
    ): ConnectionResult = withContext(Dispatchers.IO) {
        val startTime = System.currentTimeMillis()

        Log.d(TAG, "Attempting ${endpoint.type} connection to ${endpoint.url}")

        try {
            val connection = when (endpoint.type) {
                ConnectionType.LOCAL -> createLocalConnection(endpoint, connectionInfo)
                ConnectionType.MESH -> createMeshConnection(endpoint, connectionInfo)
                ConnectionType.TUNNEL -> createTunnelConnection(endpoint, connectionInfo)
                ConnectionType.RELAY -> createRelayConnection(endpoint, connectionInfo)
            }

            // Test the connection
            withTimeout(CONNECTION_TIMEOUT) {
                connection.connect()
                // Wait for successful connection
                while (connection.connectionState.value != com.openclaw.console.data.network.ConnectionState.CONNECTED) {
                    delay(100)
                }
            }

            val latency = System.currentTimeMillis() - startTime
            Log.d(TAG, "${endpoint.type} connection successful in ${latency}ms")

            ConnectionResult.Success(
                connection = connection,
                endpoint = endpoint,
                latencyMs = latency
            )

        } catch (e: Exception) {
            val duration = System.currentTimeMillis() - startTime
            Log.w(TAG, "${endpoint.type} connection failed after ${duration}ms", e)

            ConnectionResult.Failure(
                endpoint = endpoint,
                error = e,
                attemptDurationMs = duration
            )
        }
    }

    private fun createLocalConnection(
        endpoint: ConnectionEndpoint,
        connectionInfo: GatewayConnectionInfo
    ): WebSocketClient {
        // Extract auth token from security info
        val token = connectionInfo.security.authToken ?: "default-token"
        return WebSocketClient(endpoint.url, token)
    }

    private fun createMeshConnection(
        endpoint: ConnectionEndpoint,
        connectionInfo: GatewayConnectionInfo
    ): WebSocketClient {
        // Mesh connection via Tailscale or ZeroTier
        val meshUrl = when {
            endpoint.url.startsWith("tailscale://") -> {
                // Tailscale mesh: tailscale://gateway-id -> wss://gateway-id.tailnet-name.ts.net:18789
                val gatewayId = endpoint.url.removePrefix("tailscale://")
                "wss://$gatewayId.tailnet.ts.net:18789/ws"
            }
            endpoint.url.startsWith("zerotier://") -> {
                // ZeroTier mesh: zerotier://ip-address -> wss://ip-address:18789
                val ipAddress = endpoint.url.removePrefix("zerotier://")
                "wss://$ipAddress:18789/ws"
            }
            endpoint.url.contains(".ts.net") -> {
                // Direct Tailscale hostname
                val wsUrl = endpoint.url.replace("https://", "wss://").replace("http://", "ws://")
                if (wsUrl.contains("/ws")) wsUrl else "$wsUrl/ws"
            }
            else -> {
                // Generic mesh network connection
                val wsUrl = endpoint.url.replace("https://", "wss://").replace("http://", "ws://")
                if (wsUrl.contains("/ws")) wsUrl else "$wsUrl/ws"
            }
        }

        Log.d(TAG, "Creating mesh connection to: $meshUrl")
        val token = connectionInfo.security.authToken ?: "default-token"
        return WebSocketClient(meshUrl, token, mapOf(
            "X-Gateway-Fingerprint" to connectionInfo.security.expectedFingerprint,
            "X-Connection-Type" to "mesh"
        ))
    }

    private fun createTunnelConnection(
        endpoint: ConnectionEndpoint,
        connectionInfo: GatewayConnectionInfo
    ): WebSocketClient {
        // Handle different tunnel providers
        val wsUrl = when {
            endpoint.url.contains("ngrok") -> {
                // ngrok tunnels: https://abc123.ngrok.io -> wss://abc123.ngrok.io
                endpoint.url.replace("https://", "wss://").replace("http://", "ws://")
            }
            endpoint.url.contains("cloudflare") || endpoint.url.contains("trycloudflare.com") -> {
                // CloudFlare tunnels: https://abc123.trycloudflare.com -> wss://abc123.trycloudflare.com
                endpoint.url.replace("https://", "wss://").replace("http://", "ws://")
            }
            endpoint.url.contains("openclaw.dev") -> {
                // OpenClaw tunnels: https://abc123.openclaw.dev -> wss://abc123.openclaw.dev/ws
                val baseUrl = endpoint.url.replace("https://", "wss://").replace("http://", "ws://")
                if (baseUrl.endsWith("/")) baseUrl + "ws" else "$baseUrl/ws"
            }
            else -> {
                // Generic tunnel: assume WebSocket endpoint
                endpoint.url.replace("https://", "wss://").replace("http://", "ws://")
            }
        }

        Log.d(TAG, "Creating tunnel connection to: $wsUrl")
        val token = connectionInfo.security.authToken ?: "default-token"
        return WebSocketClient(wsUrl, token)
    }

    private fun createRelayConnection(
        endpoint: ConnectionEndpoint,
        connectionInfo: GatewayConnectionInfo
    ): WebSocketClient {
        // OpenClaw relay service - always available fallback
        val relayUrl = "wss://relay.openclaw.com/gateway/${connectionInfo.gatewayId}"
        Log.d(TAG, "Creating relay connection to: $relayUrl")
        val token = connectionInfo.security.authToken ?: "default-token"
        return WebSocketClient(relayUrl, token, mapOf(
            "X-Gateway-Fingerprint" to connectionInfo.security.expectedFingerprint,
            "X-Connection-Type" to "relay"
        ))
    }

    private fun selectBestConnection(
        current: ConnectionResult.Success?,
        new: ConnectionResult.Success
    ): ConnectionResult.Success {
        if (current == null) return new

        // Prefer higher priority (lower number)
        if (new.endpoint.priority < current.endpoint.priority) return new
        if (current.endpoint.priority < new.endpoint.priority) return current

        // Same priority, prefer lower latency
        if (new.latencyMs < current.latencyMs) return new
        return current
    }

    /**
     * Gets user-friendly error message based on connection failures
     */
    fun getConnectionErrorMessage(failures: List<ConnectionResult.Failure>): String {
        if (failures.isEmpty()) {
            return "Connection failed for unknown reasons"
        }

        val localFailure = failures.find { it.endpoint.type == ConnectionType.LOCAL }
        val meshFailure = failures.find { it.endpoint.type == ConnectionType.MESH }
        val tunnelFailure = failures.find { it.endpoint.type == ConnectionType.TUNNEL }

        return when {
            failures.all { it.error.message?.contains("Unable to resolve host", ignoreCase = true) == true } -> {
                "Network connectivity issue: Unable to reach any gateway endpoints. " +
                "Make sure your device has internet access and the gateway is running."
            }
            localFailure != null && meshFailure == null -> {
                "Local network connection failed. Your device and gateway are on different networks. " +
                "Try using a VPN or ensure both devices are on the same WiFi network."
            }
            failures.size == 1 -> {
                "Connection failed: ${failures.first().error.message}"
            }
            else -> {
                "All connection methods failed. The gateway may be offline or unreachable. " +
                "Check your network connection and try again."
            }
        }
    }
}