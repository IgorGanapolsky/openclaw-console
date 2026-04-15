package com.openclaw.console.data.network

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ApiServiceTest {

    private lateinit var server: MockWebServer
    private lateinit var api: ApiService

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        val baseUrl = server.url("/").toString()
        api = ApiService(baseUrl, "test-token")
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    // --- Authorization header ---

    @Test
    fun `requests include Bearer authorization header`() = runTest {
        server.enqueue(MockResponse().setBody("{}").setResponseCode(200))

        api.healthCheck()

        val request = server.takeRequest()
        assertEquals("Bearer test-token", request.getHeader("Authorization"))
    }

    @Test
    fun `requests include json content type headers`() = runTest {
        server.enqueue(MockResponse().setBody("{}").setResponseCode(200))

        api.healthCheck()

        val request = server.takeRequest()
        assertEquals("application/json", request.getHeader("Content-Type"))
        assertEquals("application/json", request.getHeader("Accept"))
    }

    // --- healthCheck ---

    @Test
    fun `healthCheck returns success on 200`() = runTest {
        server.enqueue(MockResponse().setBody("ok").setResponseCode(200))

        val result = api.healthCheck()

        assertTrue(result.isSuccess)
        assertEquals(true, result.getOrNull())
    }

    @Test
    fun `healthCheck hits correct endpoint`() = runTest {
        server.enqueue(MockResponse().setBody("ok").setResponseCode(200))

        api.healthCheck()

        val request = server.takeRequest()
        assertEquals("/api/health", request.path)
        assertEquals("GET", request.method)
    }

    @Test
    fun `healthCheck returns failure on 500`() = runTest {
        server.enqueue(MockResponse().setBody("Internal Server Error").setResponseCode(500))

        val result = api.healthCheck()

        assertTrue(result.isFailure)
        val error = result.exceptionOrNull()
        assertNotNull(error)
        assertTrue(requireNotNull(requireNotNull(error).message).contains("500"))
    }

    // --- getAgents ---

    @Test
    fun `getAgents parses agent list`() = runTest {
        val json = """
            [
                {
                    "id": "agent-1",
                    "name": "Deploy Bot",
                    "description": "Handles deployments",
                    "status": "online",
                    "workspace": "production",
                    "tags": ["deploy", "ci"],
                    "last_active": "2026-04-15T09:00:00Z",
                    "active_tasks": 2,
                    "pending_approvals": 1
                }
            ]
        """.trimIndent()
        server.enqueue(MockResponse().setBody(json).setResponseCode(200))

        val result = api.getAgents()

        assertTrue(result.isSuccess)
        val agents = requireNotNull(result.getOrNull())
        assertEquals(1, agents.size)
        assertEquals("agent-1", agents[0].id)
        assertEquals("Deploy Bot", agents[0].name)
        assertEquals(2, agents[0].activeTasks)
        assertEquals(1, agents[0].pendingApprovals)
        assertEquals(listOf("deploy", "ci"), agents[0].tags)
    }

    @Test
    fun `getAgents hits correct endpoint`() = runTest {
        server.enqueue(MockResponse().setBody("[]").setResponseCode(200))

        api.getAgents()

        val request = server.takeRequest()
        assertEquals("/api/agents", request.path)
        assertEquals("GET", request.method)
    }

    @Test
    fun `getAgents returns empty list on empty json array`() = runTest {
        server.enqueue(MockResponse().setBody("[]").setResponseCode(200))

        val result = api.getAgents()

        assertTrue(result.isSuccess)
        assertEquals(0, requireNotNull(result.getOrNull()).size)
    }

    @Test
    fun `getAgents returns failure on 401`() = runTest {
        server.enqueue(MockResponse().setBody("Unauthorized").setResponseCode(401))

        val result = api.getAgents()

        assertTrue(result.isFailure)
        assertTrue(requireNotNull(requireNotNull(result.exceptionOrNull()).message).contains("401"))
    }

    // --- getAgent ---

    @Test
    fun `getAgent hits correct endpoint with agent id`() = runTest {
        val json = """
            {
                "id": "agent-42",
                "name": "Test",
                "description": "desc",
                "status": "offline",
                "workspace": "dev",
                "last_active": "2026-04-15T08:00:00Z"
            }
        """.trimIndent()
        server.enqueue(MockResponse().setBody(json).setResponseCode(200))

        api.getAgent("agent-42")

        val request = server.takeRequest()
        assertEquals("/api/agents/agent-42", request.path)
    }

    // --- getAgentTasks ---

    @Test
    fun `getAgentTasks parses task list`() = runTest {
        val json = """
            [
                {
                    "id": "task-1",
                    "agent_id": "agent-1",
                    "title": "Deploy v2",
                    "description": "Rolling deploy",
                    "status": "running",
                    "created_at": "2026-04-15T08:00:00Z",
                    "updated_at": "2026-04-15T09:00:00Z"
                }
            ]
        """.trimIndent()
        server.enqueue(MockResponse().setBody(json).setResponseCode(200))

        val result = api.getAgentTasks("agent-1")

        assertTrue(result.isSuccess)
        val tasks = requireNotNull(result.getOrNull())
        assertEquals(1, tasks.size)
        assertEquals("task-1", tasks[0].id)
        assertEquals("Deploy v2", tasks[0].title)
    }

    @Test
    fun `getAgentTasks hits correct endpoint`() = runTest {
        server.enqueue(MockResponse().setBody("[]").setResponseCode(200))

        api.getAgentTasks("agent-1")

        val request = server.takeRequest()
        assertEquals("/api/agents/agent-1/tasks", request.path)
    }

    // --- getTaskDetail ---

    @Test
    fun `getTaskDetail hits correct endpoint`() = runTest {
        val json = """
            {
                "id": "task-1",
                "agent_id": "agent-1",
                "title": "Build",
                "description": "CI build",
                "status": "done",
                "created_at": "2026-04-15T08:00:00Z",
                "updated_at": "2026-04-15T09:00:00Z",
                "steps": [],
                "links": []
            }
        """.trimIndent()
        server.enqueue(MockResponse().setBody(json).setResponseCode(200))

        api.getTaskDetail("agent-1", "task-1")

        val request = server.takeRequest()
        assertEquals("/api/agents/agent-1/tasks/task-1", request.path)
    }

    // --- getIncidents ---

    @Test
    fun `getIncidents parses incident list`() = runTest {
        val json = """
            [
                {
                    "id": "inc-1",
                    "agent_id": "agent-1",
                    "agent_name": "Deploy Bot",
                    "severity": "critical",
                    "title": "OOM Killed",
                    "description": "Pod crashed",
                    "status": "open",
                    "created_at": "2026-04-15T08:00:00Z",
                    "updated_at": "2026-04-15T08:01:00Z",
                    "actions": ["acknowledge", "propose_fix"]
                }
            ]
        """.trimIndent()
        server.enqueue(MockResponse().setBody(json).setResponseCode(200))

        val result = api.getIncidents()

        assertTrue(result.isSuccess)
        val incidents = requireNotNull(result.getOrNull())
        assertEquals(1, incidents.size)
        assertEquals("OOM Killed", incidents[0].title)
    }

    @Test
    fun `getIncidents hits correct endpoint`() = runTest {
        server.enqueue(MockResponse().setBody("[]").setResponseCode(200))

        api.getIncidents()

        val request = server.takeRequest()
        assertEquals("/api/incidents", request.path)
    }

    // --- getPendingApprovals ---

    @Test
    fun `getPendingApprovals parses approval list`() = runTest {
        val json = """
            [
                {
                    "id": "appr-1",
                    "agent_id": "agent-1",
                    "agent_name": "Deploy Bot",
                    "action_type": "deploy",
                    "title": "Deploy to prod",
                    "description": "Rolling deploy",
                    "command": "kubectl apply -f deploy.yaml",
                    "context": {
                        "service": "api",
                        "environment": "production",
                        "repository": "main",
                        "risk_level": "critical"
                    },
                    "created_at": "2026-04-15T08:00:00Z",
                    "expires_at": "2026-04-15T09:00:00Z"
                }
            ]
        """.trimIndent()
        server.enqueue(MockResponse().setBody(json).setResponseCode(200))

        val result = api.getPendingApprovals()

        assertTrue(result.isSuccess)
        val approvals = requireNotNull(result.getOrNull())
        assertEquals(1, approvals.size)
        assertEquals("appr-1", approvals[0].id)
        assertEquals("Deploy to prod", approvals[0].title)
    }

    @Test
    fun `getPendingApprovals hits correct endpoint`() = runTest {
        server.enqueue(MockResponse().setBody("[]").setResponseCode(200))

        api.getPendingApprovals()

        val request = server.takeRequest()
        assertEquals("/api/approvals/pending", request.path)
    }

    // --- respondToApproval ---

    @Test
    fun `respondToApproval sends POST with correct body`() = runTest {
        server.enqueue(MockResponse().setBody("{}").setResponseCode(200))

        val response = com.openclaw.console.data.model.ApprovalResponse(
            approvalId = "appr-1",
            decision = com.openclaw.console.data.model.ApprovalDecision.APPROVED,
            biometricVerified = true,
            respondedAt = "2026-04-15T09:30:00Z"
        )
        api.respondToApproval("appr-1", response)

        val request = server.takeRequest()
        assertEquals("/api/approvals/appr-1/respond", request.path)
        assertEquals("POST", request.method)
        val body = request.body.readUtf8()
        assertTrue(body.contains("\"approved\""))
        assertTrue(body.contains("\"biometric_verified\":true"))
    }

    // --- sendChatMessage ---

    @Test
    fun `sendChatMessage sends POST with message`() = runTest {
        val json = """
            {
                "id": "msg-1",
                "agent_id": "agent-1",
                "role": "user",
                "content": "Hello agent",
                "timestamp": "2026-04-15T09:00:00Z"
            }
        """.trimIndent()
        server.enqueue(MockResponse().setBody(json).setResponseCode(200))

        val result = api.sendChatMessage("agent-1", "Hello agent")

        assertTrue(result.isSuccess)
        val msg = requireNotNull(result.getOrNull())
        assertEquals("msg-1", msg.id)
        assertEquals("Hello agent", msg.content)

        val request = server.takeRequest()
        assertEquals("/api/agents/agent-1/chat", request.path)
        assertEquals("POST", request.method)
        val body = request.body.readUtf8()
        assertTrue(body.contains("Hello agent"))
    }

    @Test
    fun `sendChatMessage includes task_id when provided`() = runTest {
        val json = """
            {
                "id": "msg-2",
                "agent_id": "agent-1",
                "task_id": "task-99",
                "role": "user",
                "content": "Status?",
                "timestamp": "2026-04-15T09:00:00Z"
            }
        """.trimIndent()
        server.enqueue(MockResponse().setBody(json).setResponseCode(200))

        api.sendChatMessage("agent-1", "Status?", taskId = "task-99")

        val request = server.takeRequest()
        val body = request.body.readUtf8()
        assertTrue(body.contains("\"task_id\":\"task-99\""))
    }

    // --- URL normalization ---

    @Test
    fun `trailing slash in baseUrl is handled correctly`() = runTest {
        // Recreate with trailing slash
        val baseWithSlash = server.url("/").toString() // already has trailing slash
        val apiWithSlash = ApiService(baseWithSlash, "test-token")

        server.enqueue(MockResponse().setBody("ok").setResponseCode(200))
        apiWithSlash.healthCheck()

        val request = server.takeRequest()
        // Should not have double slashes
        assertTrue(!requireNotNull(request.path).contains("//api"))
        assertEquals("/api/health", request.path)
    }

    // --- Error handling ---

    @Test
    fun `network error returns failure result`() = runTest {
        // Shutdown server to simulate network error
        server.shutdown()

        val result = api.healthCheck()

        assertTrue(result.isFailure)
        assertNotNull(result.exceptionOrNull())
    }
}
