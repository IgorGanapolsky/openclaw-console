package com.openclaw.console.data.model

import kotlinx.serialization.Serializable

@Serializable
enum class ConnectionType {
    LOCAL,      // Same network (fastest)
    MESH,       // Tailscale/mesh network (secure)
    TUNNEL,     // Public tunnel (always works)
    RELAY       // Fallback relay (slowest)
}

@Serializable
enum class ConnectionSecurity {
    DEVICE_ONLY,      // Only this device can connect
    ACCOUNT_SCOPED,   // Devices in same account
    PUBLIC            // Publicly accessible (with auth)
}

@Serializable
data class ConnectionEndpoint(
    val type: ConnectionType,
    val url: String,
    val security: ConnectionSecurity,
    val priority: Int,
    val expectedLatencyMs: Int = 50,
    val description: String = ""
) {
    companion object {
        fun local(url: String) = ConnectionEndpoint(
            type = ConnectionType.LOCAL,
            url = url,
            security = ConnectionSecurity.DEVICE_ONLY,
            priority = 1,
            expectedLatencyMs = 5,
            description = "Local network (fastest)"
        )

        fun mesh(gatewayId: String) = ConnectionEndpoint(
            type = ConnectionType.MESH,
            url = "tailscale://$gatewayId",
            security = ConnectionSecurity.ACCOUNT_SCOPED,
            priority = 2,
            expectedLatencyMs = 15,
            description = "Secure mesh network"
        )

        fun tunnel(url: String) = ConnectionEndpoint(
            type = ConnectionType.TUNNEL,
            url = url,
            security = ConnectionSecurity.ACCOUNT_SCOPED,
            priority = 3,
            expectedLatencyMs = 50,
            description = "Internet tunnel"
        )

        fun relay(gatewayId: String) = ConnectionEndpoint(
            type = ConnectionType.RELAY,
            url = "wss://relay.openclaw.com/$gatewayId",
            security = ConnectionSecurity.PUBLIC,
            priority = 4,
            expectedLatencyMs = 100,
            description = "Global relay (always works)"
        )
    }
}

@Serializable
data class GatewayConnectionInfo(
    val version: String = "2026.1",
    val gatewayId: String,
    val name: String,
    val capabilities: List<String> = listOf("approvals", "chat", "monitoring"),
    val endpoints: List<ConnectionEndpoint>,
    val security: GatewaySecurityInfo,
    val expiresAt: Long = System.currentTimeMillis() + (24 * 60 * 60 * 1000), // 24 hours
    val metadata: Map<String, String> = emptyMap()
)

@Serializable
data class GatewaySecurityInfo(
    val deviceCertificate: String? = null,
    val expectedFingerprint: String,
    val requiresBiometric: Boolean = true,
    val authToken: String? = null // Temporary auth token for initial connection
)

/**
 * Enhanced QR code format for 2026 cross-network connectivity
 * Supports multiple connection methods with automatic fallback
 */
object QRCodeFormat {
    fun encode(connectionInfo: GatewayConnectionInfo): String {
        // For now, use JSON encoding. In production, could use more compact format
        return kotlinx.serialization.json.Json.encodeToString(
            GatewayConnectionInfo.serializer(),
            connectionInfo
        )
    }

    fun decode(qrContent: String): GatewayConnectionInfo? {
        return try {
            // Try new format first
            kotlinx.serialization.json.Json.decodeFromString(
                GatewayConnectionInfo.serializer(),
                qrContent
            )
        } catch (e: Exception) {
            // Fallback to legacy URL format
            if (qrContent.startsWith("http")) {
                // Convert legacy URL to new format
                GatewayConnectionInfo(
                    gatewayId = "legacy-${qrContent.hashCode()}",
                    name = "Legacy Gateway",
                    endpoints = listOf(ConnectionEndpoint.local(qrContent)),
                    security = GatewaySecurityInfo(
                        expectedFingerprint = "legacy",
                        requiresBiometric = false
                    )
                )
            } else null
        }
    }
}