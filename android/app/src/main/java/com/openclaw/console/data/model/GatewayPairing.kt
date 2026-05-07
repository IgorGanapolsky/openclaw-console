package com.openclaw.console.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.net.URI
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.util.Base64

data class GatewayPairing(
    val name: String,
    val baseUrl: String,
    val token: String
) {
    companion object {
        private val json = Json { ignoreUnknownKeys = true }

        fun parse(rawValue: String): Result<GatewayPairing> = runCatching {
            val raw = rawValue.trim()
            require(raw.isNotEmpty()) { "Paste an OpenClaw pairing link or pairing JSON." }

            if (raw.startsWith("{")) {
                return@runCatching parseJson(raw)
            }

            parseSetupCode(raw)?.let { return@runCatching it }

            val uri = URI(raw)
            if (uri.scheme == "http" || uri.scheme == "https" || uri.scheme == "ws" || uri.scheme == "wss") {
                return@runCatching parseGatewayUrl(uri)
            }

            require(uri.scheme == "openclaw" && uri.host == "pair") {
                "Paste an OpenClaw pairing link or pairing JSON."
            }
            val query = parseQuery(uri.rawQuery.orEmpty())

            build(
                name = query["name"],
                baseUrl = query["base_url"] ?: query["baseUrl"] ?: query["baseURL"],
                token = query["token"] ?: query["tkn"]
            )
        }

        private fun parseJson(raw: String): GatewayPairing {
            val payload = json.decodeFromString<PairingJsonPayload>(raw)
            require(payload.type == "openclaw.gateway.pairing.v1") {
                "Paste an OpenClaw pairing link or pairing JSON."
            }
            return build(payload.name, payload.baseUrl ?: payload.url, payload.bootstrapToken ?: payload.token)
        }

        private fun parseSetupCode(raw: String): GatewayPairing? {
            val decoded = decodeSetupCode(raw) ?: return null
            val payload = json.decodeFromString<SetupCodePayload>(decoded)
            return build(
                name = payload.name,
                baseUrl = payload.baseUrl ?: payload.url,
                token = payload.bootstrapToken ?: payload.token
            )
        }

        private fun parseGatewayUrl(uri: URI): GatewayPairing {
            val query = parseQuery(uri.rawQuery.orEmpty())
            val token = query["bootstrapToken"] ?: query["token"] ?: query["tkn"]
            val path = uri.rawPath.orEmpty().removeSuffix("/api/health").removeSuffix("/")
            val port = if (uri.port == -1) "" else ":${uri.port}"
            val scheme = when (uri.scheme) {
                "wss" -> "https"
                "ws" -> "http"
                else -> uri.scheme
            }
            val baseUrl = "$scheme://${uri.host}$port$path"
            val name = uri.host?.takeIf { it.isNotBlank() }?.let { "OpenClaw $it" }

            return build(name = name, baseUrl = baseUrl, token = token)
        }

        private fun decodeSetupCode(raw: String): String? {
            if (raw.any { it.isWhitespace() }) return null
            return runCatching {
                String(Base64.getUrlDecoder().decode(raw), StandardCharsets.UTF_8)
            }.getOrNull()?.takeIf { it.trimStart().startsWith("{") }
        }

        private fun build(name: String?, baseUrl: String?, token: String?): GatewayPairing {
            val cleanedName = name.orEmpty().trim().ifBlank { "OpenClaw Gateway" }
            val cleanedBaseUrl = baseUrl.orEmpty().trim().trimEnd('/').normalizeGatewayUrl()
            val cleanedToken = token.orEmpty().trim()

            require(cleanedBaseUrl.isNotBlank()) { "Pairing code is missing base_url." }
            require(cleanedToken.isNotBlank()) { "Pairing code is missing token." }
            require(cleanedBaseUrl.startsWith("https://") || cleanedBaseUrl.startsWith("http://")) {
                "Pairing code contains an invalid gateway URL."
            }

            return GatewayPairing(
                name = cleanedName,
                baseUrl = cleanedBaseUrl,
                token = cleanedToken
            )
        }

        private fun parseQuery(rawQuery: String): Map<String, String> {
            if (rawQuery.isBlank()) return emptyMap()

            return rawQuery.split('&')
                .mapNotNull { part ->
                    val pieces = part.split('=', limit = 2)
                    val key = decode(pieces.getOrNull(0).orEmpty())
                    if (key.isBlank()) return@mapNotNull null
                    key to decode(pieces.getOrNull(1).orEmpty())
                }
                .toMap()
        }

        private fun decode(value: String): String =
            URLDecoder.decode(value, StandardCharsets.UTF_8.name())

        private fun String.normalizeGatewayUrl(): String = when {
            startsWith("wss://") -> replaceFirst("wss://", "https://")
            startsWith("ws://") -> replaceFirst("ws://", "http://")
            else -> this
        }
    }
}

@Serializable
private data class PairingJsonPayload(
    val type: String,
    val name: String? = null,
    @SerialName("base_url") val baseUrl: String? = null,
    val url: String? = null,
    val token: String? = null,
    val bootstrapToken: String? = null
)

@Serializable
private data class SetupCodePayload(
    val name: String? = null,
    @SerialName("base_url") val baseUrl: String? = null,
    val url: String? = null,
    val token: String? = null,
    val bootstrapToken: String? = null
)
