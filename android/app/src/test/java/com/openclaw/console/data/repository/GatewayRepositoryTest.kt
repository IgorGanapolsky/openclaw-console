package com.openclaw.console.data.repository

import com.openclaw.console.data.model.GatewayConnection
import com.openclaw.console.service.SecureStorage
import com.openclaw.console.testutil.InMemorySharedPreferences
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class GatewayRepositoryTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var prefs: InMemorySharedPreferences
    private lateinit var gatewayPrefs: InMemorySharedPreferences
    private lateinit var secureStorage: SecureStorage
    private lateinit var repo: GatewayRepository

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        prefs = InMemorySharedPreferences()
        gatewayPrefs = InMemorySharedPreferences()
        secureStorage = SecureStorage(prefs, gatewayPrefs)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun createRepo(): GatewayRepository = GatewayRepository(secureStorage)

    // --- Initial state ---

    @Test
    fun `new repository with empty storage has no gateways`() {
        repo = createRepo()

        assertTrue(repo.gateways.value.isEmpty())
        assertNull(repo.activeGateway.value)
    }

    // --- saveGateway ---

    @Test
    fun `saveGateway persists gateway and token separately`() = runTest(testDispatcher) {
        repo = createRepo()
        val gw = GatewayConnection(
            id = "gw-1",
            name = "Production",
            baseUrl = "https://prod.example.com"
        )

        repo.saveGateway(gw, "my-secret-token")
        advanceUntilIdle()

        // Token stored separately
        assertEquals("my-secret-token", secureStorage.getToken("gw-1"))

        // Gateway metadata stored (without token in the value)
        val meta = secureStorage.getGatewayMeta("gateway_gw-1")
        assertNotNull(meta)
        assertTrue(meta!!.contains("Production"))
        // Token field in serialized meta should be empty string, not the real token
        assertTrue("Real token should not be in meta", !meta.contains("my-secret-token"))

        // Exposed in Flow
        assertEquals(1, repo.gateways.value.size)
        assertEquals("Production", repo.gateways.value[0].name)
    }

    @Test
    fun `saveGateway sorts gateways by name`() = runTest(testDispatcher) {
        repo = createRepo()
        val gwZ = GatewayConnection(id = "z", name = "Zulu", baseUrl = "https://z.example.com")
        val gwA = GatewayConnection(id = "a", name = "Alpha", baseUrl = "https://a.example.com")

        repo.saveGateway(gwZ, "token-z")
        advanceUntilIdle()
        repo.saveGateway(gwA, "token-a")
        advanceUntilIdle()

        assertEquals("Alpha", repo.gateways.value[0].name)
        assertEquals("Zulu", repo.gateways.value[1].name)
    }

    // --- getToken ---

    @Test
    fun `getToken returns stored token for gateway`() = runTest(testDispatcher) {
        repo = createRepo()
        val gw = GatewayConnection(id = "gw-1", name = "Test", baseUrl = "https://test.example.com")
        repo.saveGateway(gw, "the-token")
        advanceUntilIdle()

        assertEquals("the-token", repo.getToken("gw-1"))
    }

    @Test
    fun `getToken returns null for unknown gateway`() {
        repo = createRepo()
        assertNull(repo.getToken("nonexistent"))
    }

    // --- deleteGateway ---

    @Test
    fun `deleteGateway removes gateway and its token`() = runTest(testDispatcher) {
        repo = createRepo()
        val gw = GatewayConnection(id = "gw-1", name = "Test", baseUrl = "https://test.example.com")
        repo.saveGateway(gw, "token-1")
        advanceUntilIdle()
        assertEquals(1, repo.gateways.value.size)

        repo.deleteGateway("gw-1")
        advanceUntilIdle()

        assertTrue(repo.gateways.value.isEmpty())
        assertNull(secureStorage.getToken("gw-1"))
        assertNull(secureStorage.getGatewayMeta("gateway_gw-1"))
    }

    @Test
    fun `deleteGateway clears active gateway id if it was the active one`() = runTest(testDispatcher) {
        repo = createRepo()
        val gw = GatewayConnection(id = "gw-1", name = "Test", baseUrl = "https://test.example.com")
        repo.saveGateway(gw, "token-1")
        advanceUntilIdle()

        repo.setActiveGateway("gw-1")
        advanceUntilIdle()
        assertNotNull(repo.activeGateway.value)

        repo.deleteGateway("gw-1")
        advanceUntilIdle()

        assertNull(repo.activeGateway.value)
        assertEquals("", secureStorage.getActiveGatewayId())
    }

    // --- setActiveGateway ---

    @Test
    fun `setActiveGateway updates activeGateway flow`() = runTest(testDispatcher) {
        repo = createRepo()
        val gw = GatewayConnection(id = "gw-1", name = "Test", baseUrl = "https://test.example.com")
        repo.saveGateway(gw, "token-1")
        advanceUntilIdle()

        repo.setActiveGateway("gw-1")
        advanceUntilIdle()

        val active = repo.activeGateway.value
        assertNotNull(active)
        assertEquals("gw-1", active!!.id)
    }

    @Test
    fun `setActiveGateway with unknown id results in null activeGateway`() = runTest(testDispatcher) {
        repo = createRepo()
        val gw = GatewayConnection(id = "gw-1", name = "Test", baseUrl = "https://test.example.com")
        repo.saveGateway(gw, "token-1")
        advanceUntilIdle()

        repo.setActiveGateway("nonexistent")
        advanceUntilIdle()

        assertNull(repo.activeGateway.value)
    }

    // --- updateLastConnected ---

    @Test
    fun `updateLastConnected updates timestamp in memory and storage`() = runTest(testDispatcher) {
        repo = createRepo()
        val gw = GatewayConnection(id = "gw-1", name = "Test", baseUrl = "https://test.example.com")
        repo.saveGateway(gw, "token-1")
        advanceUntilIdle()

        repo.updateLastConnected("gw-1", "2026-04-15T10:00:00Z")

        val updated = repo.gateways.value.find { it.id == "gw-1" }
        assertNotNull(updated)
        assertEquals("2026-04-15T10:00:00Z", updated!!.lastConnectedAt)

        // Also persisted to storage
        val meta = secureStorage.getGatewayMeta("gateway_gw-1")
        assertNotNull(meta)
        assertTrue(meta!!.contains("2026-04-15T10:00:00Z"))
    }

    @Test
    fun `updateLastConnected for unknown gateway does not crash`() {
        repo = createRepo()
        // Should not throw
        repo.updateLastConnected("nonexistent", "2026-04-15T10:00:00Z")
        assertTrue(repo.gateways.value.isEmpty())
    }

    // --- Persistence across instances ---

    @Test
    fun `new repository instance loads previously saved gateways`() = runTest(testDispatcher) {
        repo = createRepo()
        val gw = GatewayConnection(id = "gw-1", name = "Persisted", baseUrl = "https://p.example.com")
        repo.saveGateway(gw, "token-p")
        advanceUntilIdle()

        // Create a new repository against the same storage
        val repo2 = GatewayRepository(secureStorage)

        assertEquals(1, repo2.gateways.value.size)
        assertEquals("Persisted", repo2.gateways.value[0].name)
    }

    @Test
    fun `new repository restores active gateway from storage`() = runTest(testDispatcher) {
        repo = createRepo()
        val gw = GatewayConnection(id = "gw-1", name = "Active", baseUrl = "https://a.example.com")
        repo.saveGateway(gw, "token-a")
        advanceUntilIdle()
        repo.setActiveGateway("gw-1")
        advanceUntilIdle()

        val repo2 = GatewayRepository(secureStorage)

        assertNotNull(repo2.activeGateway.value)
        assertEquals("gw-1", repo2.activeGateway.value!!.id)
    }
}
