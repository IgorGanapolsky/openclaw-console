package com.openclaw.console.ui.screens.settings

import org.junit.Assert.assertEquals
import org.junit.Test

class GatewaySetupLinkParserTest {

    @Test
    fun parseAcceptsConnectHostVariant() {
        val parsed = GatewaySetupLinkParser.parse(
            "openclaw-console://connect?name=Prod&url=https%3A%2F%2Fgateway.example.com%2F&token=ocw_123"
        )

        assertEquals("Prod", parsed.name)
        assertEquals("https://gateway.example.com", parsed.baseUrl)
        assertEquals("ocw_123", parsed.token)
    }

    @Test
    fun parseAcceptsConnectPathVariant() {
        val parsed = GatewaySetupLinkParser.parse(
            "openclaw://gateway/connect?name=Lab&url=http%3A%2F%2F10.0.0.8%3A18789&token=ocw_456"
        )

        assertEquals("Lab", parsed.name)
        assertEquals("http://10.0.0.8:18789", parsed.baseUrl)
        assertEquals("ocw_456", parsed.token)
    }

    @Test
    fun parseAcceptsHttpsAdminUrlVariant() {
        val parsed = GatewaySetupLinkParser.parse(
            "https://alphaclaw.app/connect?name=Prod&url=https%3A%2F%2Fgateway.example.com&token=ocw_789"
        )

        assertEquals("Prod", parsed.name)
        assertEquals("https://gateway.example.com", parsed.baseUrl)
        assertEquals("ocw_789", parsed.token)
    }

    @Test
    fun parseAcceptsHttpAdminUrlVariant() {
        val parsed = GatewaySetupLinkParser.parse(
            "http://localhost/connect?name=Dev&url=http%3A%2F%2F127.0.0.1%3A18789&token=ocw_local"
        )

        assertEquals("Dev", parsed.name)
        assertEquals("http://127.0.0.1:18789", parsed.baseUrl)
        assertEquals("ocw_local", parsed.token)
    }

    @Test(expected = GatewaySetupImportError.InvalidLink::class)
    fun parseRejectsConnectRouteWithoutQuery() {
        GatewaySetupLinkParser.parse("https://alphaclaw.app/connect")
    }

    @Test
    fun parsePrefersFirstDuplicateQueryValue() {
        val parsed = GatewaySetupLinkParser.parse(
            "openclaw-console://connect?name=Prod&name=Shadow&url=https%3A%2F%2Fgateway.example.com&token=ocw_123&token=ocw_999"
        )

        assertEquals("Prod", parsed.name)
        assertEquals("https://gateway.example.com", parsed.baseUrl)
        assertEquals("ocw_123", parsed.token)
    }

    @Test(expected = GatewaySetupImportError.InvalidRoute::class)
    fun parseRejectsNonConnectRoute() {
        GatewaySetupLinkParser.parse(
            "openclaw://approve?name=Prod&url=https%3A%2F%2Fgateway.example.com&token=ocw_123"
        )
    }

    @Test(expected = GatewaySetupImportError.InvalidBaseUrl::class)
    fun parseRejectsUnsupportedGatewayScheme() {
        GatewaySetupLinkParser.parse(
            "openclaw-console://connect?name=Prod&url=ftp%3A%2F%2Fgateway.example.com&token=ocw_123"
        )
    }

    @Test(expected = GatewaySetupImportError.InvalidBaseUrl::class)
    fun parseRejectsGatewayUrlWithoutHost() {
        GatewaySetupLinkParser.parse(
            "https://alphaclaw.app/connect?name=Prod&url=https%3A%2F%2F&token=ocw_123"
        )
    }

    @Test(expected = GatewaySetupImportError.InvalidBaseUrl::class)
    fun parseRejectsGatewayUrlWithQueryString() {
        GatewaySetupLinkParser.parse(
            "https://alphaclaw.app/connect?name=Prod&url=https%3A%2F%2Fgateway.example.com%3Ftenant%3Dfoo&token=ocw_123"
        )
    }

    @Test(expected = GatewaySetupImportError.InvalidBaseUrl::class)
    fun parseRejectsGatewayUrlWithFragment() {
        GatewaySetupLinkParser.parse(
            "https://alphaclaw.app/connect?name=Prod&url=https%3A%2F%2Fgateway.example.com%23frag&token=ocw_123"
        )
    }

    @Test(expected = GatewaySetupImportError.InvalidBaseUrl::class)
    fun parseRejectsGatewayUrlWithEmptyFragment() {
        GatewaySetupLinkParser.parse(
            "https://alphaclaw.app/connect?name=Prod&url=https%3A%2F%2Fgateway.example.com%23&token=ocw_123"
        )
    }

    @Test(expected = GatewaySetupImportError.InvalidBaseUrl::class)
    fun parseRejectsGatewayUrlWithMissingHostInRelativePath() {
        GatewaySetupLinkParser.parse(
            "https://alphaclaw.app/connect?name=Prod&url=http%3A%2F%2F%2Fgateway-only&token=ocw_123"
        )
    }
}
