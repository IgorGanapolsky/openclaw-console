package com.openclaw.console.data.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class GatewayPairingTest {

    @Test
    fun `parses openclaw pairing link`() {
        val raw = "openclaw://pair?name=Mac%20Mini&base_url=http%3A%2F%2F192.168.1.5%3A18789&token=abc123"

        val pairing = GatewayPairing.parse(raw).getOrThrow()

        assertEquals("Mac Mini", pairing.name)
        assertEquals("http://192.168.1.5:18789", pairing.baseUrl)
        assertEquals("abc123", pairing.token)
    }

    @Test
    fun `parses pairing json`() {
        val raw = """
            {
              "type": "openclaw.gateway.pairing.v1",
              "name": "Production",
              "base_url": "https://gateway.example.com/",
              "token": "token-value"
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
