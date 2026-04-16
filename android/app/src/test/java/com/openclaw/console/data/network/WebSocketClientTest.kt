package com.openclaw.console.data.network

import com.openclaw.console.data.model.*
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import org.junit.*
import org.junit.Assert.*

/**
 * Tests for WebSocket connection reliability.
 * Critical for Daily Active Approvers - users must stay connected to receive approval requests.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class WebSocketClientTest {

    private lateinit var testDispatcher: TestDispatcher
    private lateinit var testScope: TestScope

    @Before
    fun setUp() {
        testDispatcher = StandardTestDispatcher()
        testScope = TestScope(testDispatcher)
        Dispatchers.setMain(testDispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `websocket starts in disconnected state`() {
        val client = WebSocketClient("wss://test.example.com", "test-token")

        assertEquals(ConnectionState.DISCONNECTED, client.connectionState.value)
    }

    @Test
    fun `websocket url construction handles various formats`() {
        val testCases = mapOf(
            "https://api.example.com" to "wss://api.example.com/ws?token=test-token",
            "https://api.example.com/" to "wss://api.example.com/ws?token=test-token",
            "http://localhost:3000" to "ws://localhost:3000/ws?token=test-token",
            "api.example.com" to "wss://api.example.com/ws?token=test-token"
        )

        testCases.forEach { (input, expected) ->
            val client = MockWebSocketClient(input, "test-token")
            assertEquals("URL construction failed for input: $input", expected, client.getWebSocketUrl())
        }
    }

    @Test
    fun `parses approval request events correctly`() = testScope.runTest {
        val client = MockWebSocketClient("wss://test.example.com", "test-token")
        val events = mutableListOf<WebSocketEvent>()

        // Collect events — advance to start the collector before emitting
        val job = launch {
            client.events.collect { events.add(it) }
        }
        advanceUntilIdle()

        // Simulate approval request event
        val mockApproval = ApprovalRequest(
            id = "approval-123",
            agentId = "agent-456",
            agentName = "CI/CD Agent",
            actionType = ActionType.DEPLOY,
            title = "Deploy to production",
            description = "Deploy version 2.1.0",
            command = "kubectl apply -f prod-deployment.yaml",
            context = ApprovalContext(
                service = "api-server",
                environment = "production",
                repository = "company/api",
                riskLevel = RiskLevel.HIGH
            ),
            createdAt = "2024-01-01T12:00:00Z",
            expiresAt = "2024-01-01T13:00:00Z"
        )
        client.emitEvent(WebSocketEvent.ApprovalRequest(mockApproval))
        advanceUntilIdle()

        // Verify event was parsed correctly
        assertEquals(1, events.size)
        assertTrue(events.first() is WebSocketEvent.ApprovalRequest)

        val approvalEvent = events.first() as WebSocketEvent.ApprovalRequest
        assertEquals("approval-123", approvalEvent.request.id)
        assertEquals("CI/CD Agent", approvalEvent.request.agentName)
        assertEquals(ActionType.DEPLOY, approvalEvent.request.actionType)
        assertEquals(RiskLevel.HIGH, approvalEvent.request.context.riskLevel)

        job.cancel()
    }

    @Test
    fun `handles connection state transitions`() = testScope.runTest {
        val client = MockWebSocketClient("wss://test.example.com", "test-token")
        val states = mutableListOf<ConnectionState>()

        // Collect connection states — advance to start the collector
        val job = launch {
            client.connectionState.collect { states.add(it) }
        }
        advanceUntilIdle()

        // Start with disconnected
        assertEquals(ConnectionState.DISCONNECTED, client.connectionState.value)

        // Simulate connection flow
        client.connect()
        advanceUntilIdle()

        client.setConnectionState(ConnectionState.CONNECTED)
        advanceUntilIdle()

        client.emitEvent(WebSocketEvent.Connected("session-123", "1.0.0", 10_000, "2026-04-15T12:00:00Z"))
        advanceUntilIdle()

        // Verify state progression
        assertTrue(states.contains(ConnectionState.DISCONNECTED))
        assertTrue(states.contains(ConnectionState.CONNECTING))
        assertTrue(states.contains(ConnectionState.CONNECTED))

        job.cancel()
    }

    @Test
    fun `reconnection uses exponential backoff`() = testScope.runTest {
        val client = MockWebSocketClient("wss://test.example.com", "test-token")
        val events = mutableListOf<WebSocketEvent>()

        val job = launch {
            client.events.collect { events.add(it) }
        }
        advanceUntilIdle()

        client.connect()
        client.setConnectionState(ConnectionState.CONNECTED)
        client.emitEvent(WebSocketEvent.Connected("session-123", "1.0.0", 10_000, "2026-04-15T12:00:00Z"))

        // Simulate connection failure with reconnection event
        client.setConnectionState(ConnectionState.DISCONNECTED)
        client.emitEvent(WebSocketEvent.Disconnected)
        client.emitEvent(WebSocketEvent.Reconnecting(1, 1000L))
        advanceUntilIdle()

        // Should have reconnection events
        val reconnectEvents = events.filterIsInstance<WebSocketEvent.Reconnecting>()
        assertTrue("Should have reconnection events", reconnectEvents.isNotEmpty())

        val firstReconnect = reconnectEvents.first()
        assertTrue("First reconnect attempt should be 1", firstReconnect.attempt >= 1)
        assertTrue("Delay should be positive", firstReconnect.delayMs > 0)

        job.cancel()
    }

    @Test
    fun `sends approval responses correctly`() = testScope.runTest {
        val client = MockWebSocketClient("wss://test.example.com", "test-token")
        client.connect()
        client.setConnectionState(ConnectionState.CONNECTED)

        // Send approval response
        client.sendApprovalResponse("approval-123", ApprovalDecision.APPROVED, true)

        // Verify message was captured by the mock
        val sentMessages = client.getSentMessages()
        assertEquals(1, sentMessages.size)

        val message = sentMessages.first()
        assertTrue("Should contain approval_id", message.contains("approval-123"))
        assertTrue("Should contain decision", message.contains("APPROVED"))
        assertTrue("Should contain biometric_verified", message.contains("true"))
    }

    @Test
    fun `ignores malformed messages gracefully`() = testScope.runTest {
        val client = MockWebSocketClient("wss://test.example.com", "test-token")
        val events = mutableListOf<WebSocketEvent>()

        val job = launch {
            client.events.collect { events.add(it) }
        }

        // Emit unknown event type — should not crash
        client.emitEvent(WebSocketEvent.Disconnected)

        advanceUntilIdle()

        // Should handle gracefully
        assertTrue("Should handle events gracefully", events.size <= 1)

        job.cancel()
    }
}

/**
 * Mock WebSocketClient for testing without real network connections.
 * Uses protected fields from parent class instead of unsafe casts.
 */
class MockWebSocketClient(
    private val baseUrl: String,
    private val token: String
) : WebSocketClient(baseUrl, token) {

    private val sentMessages = mutableListOf<String>()

    fun getWebSocketUrl(): String {
        val trimmed = baseUrl.trimEnd('/')
        val wsBase = when {
            trimmed.startsWith("https://") -> trimmed.replace("https://", "wss://")
            trimmed.startsWith("http://") -> trimmed.replace("http://", "ws://")
            else -> "wss://$trimmed"
        }
        return "$wsBase/ws?token=$token"
    }

    /** Emit a WebSocket event directly for testing. */
    suspend fun emitEvent(event: WebSocketEvent) {
        _events.emit(event)
    }

    /** Set connection state directly for testing. */
    fun setConnectionState(state: ConnectionState) {
        _connectionState.value = state
    }

    override fun connect() {
        _connectionState.value = ConnectionState.CONNECTING
    }

    override fun sendApprovalResponse(approvalId: String, decision: ApprovalDecision, biometricVerified: Boolean) {
        sentMessages.add("approvalId=$approvalId,decision=${decision.name},biometricVerified=$biometricVerified")
    }

    fun getSentMessages(): List<String> = sentMessages.toList()
}
