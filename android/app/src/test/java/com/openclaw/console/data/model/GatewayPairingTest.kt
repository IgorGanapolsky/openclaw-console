package com.openclaw.console.data.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class GatewayPairingTest {

    @Test
    fun `parses openclaw pairing link`() {
        val raw = "openclaw://pair?name=Mac%20Mini&base_url=http%3A%2F%2F192.168.1.5%3A18789&bootstrapToken=abc123"

        val pairing = GatewayPairing.parse(raw).getOrThrow()

        assertEquals("Mac Mini", pairing.name)
        assertEquals("http://192.168.1.5:18789", pairing.baseUrl)
        assertEquals("abc123", pairing.token)
    }

    @Test
    fun `parses gateway health pairing link printed by remote control`() {
        val raw = "http://192.168.1.5:18789/api/health?tkn=abc123"

        val pairing = GatewayPairing.parse(raw).getOrThrow()

        assertEquals("OpenClaw 192.168.1.5", pairing.name)
        assertEquals("http://192.168.1.5:18789", pairing.baseUrl)
        assertEquals("abc123", pairing.token)
    }

    @Test
    fun `parses cli setup code with bootstrap token`() {
        val raw = "eyJ1cmwiOiJ3c3M6Ly9pZ29ycy1tYWMtbWluaS50YWlsMTJhYTMzLnRzLm5ldCIsImJvb3RzdHJhcFRva2VuIjoic2V0dXAtdG9rZW4ifQ"

        val pairing = GatewayPairing.parse(raw).getOrThrow()

        assertEquals("OpenClaw Gateway", pairing.name)
        assertEquals("https://igors-mac-mini.tail12aa33.ts.net", pairing.baseUrl)
        assertEquals("setup-token", pairing.token)
    }

    @Test
    fun `parses wss gateway url with bootstrap token`() {
        val raw = "wss://igors-mac-mini.tail12aa33.ts.net?bootstrapToken=setup-token"

        val pairing = GatewayPairing.parse(raw).getOrThrow()

        assertEquals("OpenClaw igors-mac-mini.tail12aa33.ts.net", pairing.name)
        assertEquals("https://igors-mac-mini.tail12aa33.ts.net", pairing.baseUrl)
        assertEquals("setup-token", pairing.token)
    }

    @Test
    fun `parses pairing json`() {
        val raw = """
            {
              "type": "openclaw.gateway.pairing.v1",
              "name": "Production",
              "url": "wss://gateway.example.com/",
              "bootstrapToken": "token-value"
            }
        """.trimIndent()

        val pairing = GatewayPairing.parse(raw).getOrThrow()

        assertEquals("Production", pairing.name)
        assertEquals("https://gateway.example.com", pairing.baseUrl)
        assertEquals("token-value", pairing.token)
    }

    @Test
    fun `rejects invalid pairing url`() {
        val result = GatewayPairing.parse("openclaw://pair?base_url=ftp%3A%2F%2Fexample.com&token=abc")

        assertTrue(result.isFailure)
    }
}
