package com.openclaw.console.ui.screens.settings

import java.net.URI
import java.net.URLDecoder
import java.nio.charset.StandardCharsets

data class GatewaySetupImport(
    val name: String,
    val baseUrl: String,
    val token: String
)

sealed class GatewaySetupImportError(message: String) : IllegalArgumentException(message) {
    data class MissingField(val field: String) : GatewaySetupImportError("The setup link is missing a $field.")
    object InvalidLink : GatewaySetupImportError("Enter a valid setup link.")
    object InvalidRoute : GatewaySetupImportError("The setup link must use the connect route.")
    object InvalidBaseUrl : GatewaySetupImportError("The setup link contains an invalid gateway URL.")
}

object GatewaySetupLinkParser {
    private val allowedSchemes = setOf("openclaw-console", "openclaw", "openclawconsole", "https", "http")

    fun parse(rawValue: String): GatewaySetupImport {
        val trimmed = rawValue.trim()
        val uri = runCatching { URI(trimmed) }.getOrNull()
            ?: throw GatewaySetupImportError.InvalidLink

        val scheme = uri.scheme?.lowercase() ?: throw GatewaySetupImportError.InvalidLink
        if (scheme !in allowedSchemes) {
            throw GatewaySetupImportError.InvalidLink
        }

        val route = buildList {
            uri.host?.takeIf { it.isNotBlank() }?.let(::add)
            addAll(uri.path.orEmpty().split('/').filter { it.isNotBlank() })
        }.lastOrNull()?.lowercase()

        if (route != "connect") {
            throw GatewaySetupImportError.InvalidRoute
        }

        val queryItems = parseQuery(uri.rawQuery)
        if (queryItems.isEmpty()) {
            throw GatewaySetupImportError.InvalidLink
        }

        val name = queryValue(queryItems, "name", "gatewayName", "gateway_name")
            ?: throw GatewaySetupImportError.MissingField("name")
        val baseUrl = queryValue(queryItems, "url", "baseURL", "baseUrl", "gatewayUrl")
            ?: throw GatewaySetupImportError.MissingField("gateway URL")
        val token = queryValue(queryItems, "token", "gatewayToken", "gateway_token")
            ?: throw GatewaySetupImportError.MissingField("token")

        val cleanedBaseUrl = baseUrl.trim().trimEnd('/')
        val gatewayUri = runCatching { URI(cleanedBaseUrl) }.getOrNull()
            ?: throw GatewaySetupImportError.InvalidBaseUrl
        val gatewayScheme = gatewayUri.scheme?.lowercase()
        if (gatewayScheme != "https" && gatewayScheme != "http") {
            throw GatewaySetupImportError.InvalidBaseUrl
        }
        if (gatewayUri.host.isNullOrBlank()) {
            throw GatewaySetupImportError.InvalidBaseUrl
        }
        if (!gatewayUri.rawQuery.isNullOrEmpty() || gatewayUri.rawFragment != null) {
            throw GatewaySetupImportError.InvalidBaseUrl
        }

        return GatewaySetupImport(
            name = name.trim(),
            baseUrl = cleanedBaseUrl,
            token = token.trim()
        )
    }

    private fun parseQuery(rawQuery: String?): Map<String, String> {
        if (rawQuery.isNullOrBlank()) {
            return emptyMap()
        }

        val queryItems = linkedMapOf<String, String>()
        rawQuery
            .split('&')
            .forEach { entry ->
                if (entry.isBlank()) {
                    return@forEach
                }

                val parts = entry.split('=', limit = 2)
                val key = decode(parts[0])
                if (key.isBlank()) {
                    return@forEach
                }

                val value = decode(parts.getOrElse(1) { "" })
                queryItems.putIfAbsent(key, value)
            }

        return queryItems
    }

    private fun queryValue(queryItems: Map<String, String>, vararg keys: String): String? {
        for (key in keys) {
            val value = queryItems[key]?.trim()
            if (!value.isNullOrEmpty()) {
                return value
            }
        }
        return null
    }

    private fun decode(value: String): String =
        URLDecoder.decode(value, StandardCharsets.UTF_8)
}
