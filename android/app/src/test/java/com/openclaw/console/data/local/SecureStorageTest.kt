package com.openclaw.console.data.local

import com.openclaw.console.service.SecureStorage
import com.openclaw.console.testutil.InMemorySharedPreferences
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class SecureStorageTest {

    private lateinit var prefs: InMemorySharedPreferences
    private lateinit var gatewayPrefs: InMemorySharedPreferences
    private lateinit var storage: SecureStorage

    @Before
    fun setUp() {
        prefs = InMemorySharedPreferences()
        gatewayPrefs = InMemorySharedPreferences()
        storage = SecureStorage(prefs, gatewayPrefs)
    }

    // --- Token operations ---

    @Test
    fun `saveToken stores token and getToken retrieves it`() {
        storage.saveToken("gw1", "secret-token-123")

        val result = storage.getToken("gw1")
        assertEquals("secret-token-123", result)
    }

    @Test
    fun `getToken returns null for unknown gateway`() {
        val result = storage.getToken("nonexistent")
        assertNull(result)
    }

    @Test
    fun `saveToken overwrites existing token`() {
        storage.saveToken("gw1", "old-token")
        storage.saveToken("gw1", "new-token")

        assertEquals("new-token", storage.getToken("gw1"))
    }

    @Test
    fun `deleteToken removes stored token`() {
        storage.saveToken("gw1", "secret")
        assertNotNull(storage.getToken("gw1"))

        storage.deleteToken("gw1")
        assertNull(storage.getToken("gw1"))
    }

    @Test
    fun `deleteToken is safe for nonexistent gateway`() {
        // Should not throw
        storage.deleteToken("nonexistent")
        assertNull(storage.getToken("nonexistent"))
    }

    @Test
    fun `tokens for different gateways are independent`() {
        storage.saveToken("gw1", "token-a")
        storage.saveToken("gw2", "token-b")

        assertEquals("token-a", storage.getToken("gw1"))
        assertEquals("token-b", storage.getToken("gw2"))

        storage.deleteToken("gw1")
        assertNull(storage.getToken("gw1"))
        assertEquals("token-b", storage.getToken("gw2"))
    }

    // --- Active gateway ---

    @Test
    fun `saveActiveGatewayId and getActiveGatewayId round-trip`() {
        storage.saveActiveGatewayId("gw-active")

        assertEquals("gw-active", storage.getActiveGatewayId())
    }

    @Test
    fun `getActiveGatewayId returns null when not set`() {
        assertNull(storage.getActiveGatewayId())
    }

    @Test
    fun `saveActiveGatewayId overwrites previous value`() {
        storage.saveActiveGatewayId("gw1")
        storage.saveActiveGatewayId("gw2")

        assertEquals("gw2", storage.getActiveGatewayId())
    }

    @Test
    fun `saveActiveGatewayId with empty string clears active`() {
        storage.saveActiveGatewayId("gw1")
        storage.saveActiveGatewayId("")

        assertEquals("", storage.getActiveGatewayId())
    }

    // --- Gateway metadata ---

    @Test
    fun `saveGatewayMeta and getGatewayMeta round-trip`() {
        storage.saveGatewayMeta("gateway_abc", "{\"name\":\"prod\"}")

        assertEquals("{\"name\":\"prod\"}", storage.getGatewayMeta("gateway_abc"))
    }

    @Test
    fun `getGatewayMeta returns null for unknown key`() {
        assertNull(storage.getGatewayMeta("unknown_key"))
    }

    @Test
    fun `removeGatewayMeta deletes metadata`() {
        storage.saveGatewayMeta("gateway_xyz", "data")
        storage.removeGatewayMeta("gateway_xyz")

        assertNull(storage.getGatewayMeta("gateway_xyz"))
    }

    @Test
    fun `getAllGatewayMetaKeys returns all stored keys`() {
        storage.saveGatewayMeta("gateway_a", "data-a")
        storage.saveGatewayMeta("gateway_b", "data-b")
        storage.saveGatewayMeta("gateway_b_token", "token-b")

        val keys = storage.getAllGatewayMetaKeys()
        assertEquals(3, keys.size)
        assertTrue(keys.contains("gateway_a"))
        assertTrue(keys.contains("gateway_b"))
        assertTrue(keys.contains("gateway_b_token"))
    }

    @Test
    fun `getAllGatewayMetaKeys returns empty set when nothing stored`() {
        val keys = storage.getAllGatewayMetaKeys()
        assertTrue(keys.isEmpty())
    }

    // --- Isolation: prefs vs gatewayPrefs ---

    @Test
    fun `token storage and gateway meta use separate preference stores`() {
        storage.saveToken("gw1", "my-token")
        storage.saveGatewayMeta("gateway_gw1", "{}")

        // Token should not appear in gateway meta keys
        val metaKeys = storage.getAllGatewayMetaKeys()
        assertTrue(metaKeys.contains("gateway_gw1"))
        assertTrue(!metaKeys.any { it.startsWith("token_") })

        // Gateway meta should not be accessible via getToken
        assertNull(storage.getToken("gateway_gw1"))
    }
}
