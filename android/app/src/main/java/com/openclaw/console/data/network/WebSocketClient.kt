package com.openclaw.console.data.network

import com.openclaw.console.data.model.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.time.Instant
import java.util.concurrent.TimeUnit

enum class ConnectionState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    RECONNECTING
}

private val json = Json {
    ignoreUnknownKeys = true
    coerceInputValues = true
}

open class WebSocketClient(
    private val baseUrl: String,
    private val token: String
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private var webSocket: WebSocket? = null
    private var reconnectJob: Job? = null
    private var pingJob: Job? = null
    private var reconnectAttempt = 0
    private var shouldReconnect = true

    protected val _connectionState = MutableStateFlow(ConnectionState.DISCONNECTED)
    val connectionState: StateFlow<ConnectionState> = _connectionState

    protected val _events = MutableSharedFlow<WebSocketEvent>(extraBufferCapacity = 64)
    val events: SharedFlow<WebSocketEvent> = _events

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.SECONDS) // no timeout for WebSocket
        .pingInterval(30, TimeUnit.SECONDS)
        .build()

    open fun connect() {
        shouldReconnect = true
        reconnectAttempt = 0
        doConnect()
    }

    private fun doConnect() {
        if (_connectionState.value == ConnectionState.CONNECTED ||
            _connectionState.value == ConnectionState.CONNECTING
        ) return

        _connectionState.value = ConnectionState.CONNECTING

        val wsUrl = buildWsUrl()
        val request = Request.Builder()
            .url(wsUrl)
            .build()

        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                _connectionState.value = ConnectionState.CONNECTED
                reconnectAttempt = 0
                startPingKeepalive()
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                parseAndEmit(text)
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(1000, null)
                _connectionState.value = ConnectionState.DISCONNECTED
                scope.launch { _events.emit(WebSocketEvent.Disconnected) }
                if (shouldReconnect) scheduleReconnect()
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                _connectionState.value = ConnectionState.DISCONNECTED
                scope.launch { _events.emit(WebSocketEvent.Disconnected) }
                if (shouldReconnect) scheduleReconnect()
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                _connectionState.value = ConnectionState.DISCONNECTED
                scope.launch { _events.emit(WebSocketEvent.Disconnected) }
                if (shouldReconnect) scheduleReconnect()
            }
        })
    }

    private fun buildWsUrl(): String {
        val trimmed = baseUrl.trimEnd('/')
        val wsBase = when {
            trimmed.startsWith("https://") -> trimmed.replace("https://", "wss://")
            trimmed.startsWith("http://") -> trimmed.replace("http://", "ws://")
            else -> "wss://$trimmed"
        }
        return "$wsBase/ws?token=$token"
    }

    private fun parseAndEmit(text: String) {
        scope.launch {
            try {
                val msg = json.decodeFromString<WebSocketMessage>(text)
                val event = when (msg.type) {
                    "connected" -> {
                        val sessionId = msg.payload["session_id"]?.jsonPrimitive?.content ?: ""
                        val version = msg.payload["gateway_version"]?.jsonPrimitive?.content ?: ""
                        val heartbeatIntervalMs = msg.payload["heartbeat_interval_ms"]?.jsonPrimitive?.content?.toIntOrNull() ?: 0
                        WebSocketEvent.Connected(sessionId, version, heartbeatIntervalMs, msg.timestamp)
                    }
                    "heartbeat" -> {
                        WebSocketEvent.Heartbeat(
                            gatewayVersion = msg.payload["gateway_version"]?.jsonPrimitive?.content ?: "",
                            connectedClients = msg.payload["connected_clients"]?.jsonPrimitive?.content?.toIntOrNull() ?: 0,
                            lastInboundAt = msg.payload["last_inbound_at"]?.jsonPrimitive?.contentOrNull,
                            lastOutboundAt = msg.payload["last_outbound_at"]?.jsonPrimitive?.contentOrNull,
                            uptimeSeconds = msg.payload["uptime_seconds"]?.jsonPrimitive?.content?.toLongOrNull() ?: 0L,
                            timestamp = msg.timestamp
                        )
                    }
                    "agent_update" -> {
                        val agent = json.decodeFromJsonElement(Agent.serializer(), msg.payload)
                        WebSocketEvent.AgentUpdate(agent)
                    }
                    "task_update" -> {
                        val update = json.decodeFromJsonElement(TaskUpdate.serializer(), msg.payload)
                        WebSocketEvent.TaskUpdate(update)
                    }
                    "task_step" -> {
                        val step = json.decodeFromJsonElement(TaskStep.serializer(), msg.payload)
                        WebSocketEvent.TaskStepAdded(step)
                    }
                    "incident_new" -> {
                        val incident = json.decodeFromJsonElement(Incident.serializer(), msg.payload)
                        WebSocketEvent.IncidentNew(incident)
                    }
                    "incident_update" -> {
                        val update = json.decodeFromJsonElement(IncidentUpdate.serializer(), msg.payload)
                        WebSocketEvent.IncidentUpdate(update)
                    }
                    "approval_request" -> {
                        val req = json.decodeFromJsonElement(ApprovalRequest.serializer(), msg.payload)
                        WebSocketEvent.ApprovalRequest(req)
                    }
                    "chat_response" -> {
                        val chatMsg = json.decodeFromJsonElement(ChatMessage.serializer(), msg.payload)
                        WebSocketEvent.ChatResponse(chatMsg)
                    }
                    "agent_status_change" -> {
                        val agentId = msg.payload["agent_id"]?.jsonPrimitive?.content ?: ""
                        val agentName = msg.payload["agent_name"]?.jsonPrimitive?.content ?: ""
                        val previousStr = msg.payload["previous_status"]?.jsonPrimitive?.content ?: "offline"
                        val newStr = msg.payload["new_status"]?.jsonPrimitive?.content ?: "offline"
                        val previousStatus = try { AgentStatus.valueOf(previousStr.uppercase()) } catch (_: Exception) { AgentStatus.OFFLINE }
                        val newStatus = try { AgentStatus.valueOf(newStr.uppercase()) } catch (_: Exception) { AgentStatus.OFFLINE }
                        WebSocketEvent.AgentStatusChange(agentId, agentName, previousStatus, newStatus)
                    }
                    "bridge_session_new" -> {
                        val session = json.decodeFromJsonElement(BridgeSession.serializer(), msg.payload)
                        WebSocketEvent.BridgeSessionNew(session)
                    }
                    "bridge_session_update" -> {
                        val session = json.decodeFromJsonElement(BridgeSession.serializer(), msg.payload)
                        WebSocketEvent.BridgeSessionUpdate(session)
                    }
                    "recurring_task_updated" -> {
                        val task = json.decodeFromJsonElement(RecurringTask.serializer(), msg.payload)
                        WebSocketEvent.RecurringTaskUpdated(task)
                    }
                    "error" -> {
                        val code = msg.payload["code"]?.jsonPrimitive?.content?.toIntOrNull() ?: 0
                        val message = msg.payload["message"]?.jsonPrimitive?.content ?: "Unknown error"
                        WebSocketEvent.Error(code, message)
                    }
                    else -> null
                }
                event?.let { _events.emit(it) }
            } catch (e: Exception) {
                // Silently ignore unparseable messages in production
            }
        }
    }

    fun subscribeToAgents(agentIds: List<String>) {
        val payload = buildJsonObject {
            put("agents", json.encodeToJsonElement(agentIds))
        }
        sendRaw("subscribe", payload)
    }

    fun unsubscribeFromAgents(agentIds: List<String>) {
        val payload = buildJsonObject {
            put("agents", json.encodeToJsonElement(agentIds))
        }
        sendRaw("unsubscribe", payload)
    }

    open fun sendApprovalResponse(approvalId: String, decision: ApprovalDecision, biometricVerified: Boolean) {
        val payload = buildJsonObject {
            put("approval_id", approvalId)
            put("decision", decision.name.lowercase())
            put("biometric_verified", biometricVerified)
        }
        sendRaw("approval_response", payload)
    }

    fun sendChatMessage(agentId: String, message: String, taskId: String? = null) {
        val payload = buildJsonObject {
            put("agent_id", agentId)
            put("message", message)
            taskId?.let { put("task_id", it) }
        }
        sendRaw("chat_message", payload)
    }

    private fun sendRaw(type: String, payload: JsonObject) {
        val envelope = buildJsonObject {
            put("type", type)
            put("payload", payload)
            put("timestamp", Instant.now().toString())
        }
        webSocket?.send(envelope.toString())
    }

    private fun scheduleReconnect() {
        reconnectJob?.cancel()
        reconnectJob = scope.launch {
            val delayMs = minOf(1000L * (1 shl reconnectAttempt.coerceAtMost(4)), 30_000L)
            reconnectAttempt++
            _connectionState.value = ConnectionState.RECONNECTING
            _events.emit(WebSocketEvent.Reconnecting(reconnectAttempt, delayMs))
            delay(delayMs)
            doConnect()
        }
    }

    private fun startPingKeepalive() {
        pingJob?.cancel()
        pingJob = scope.launch {
            while (isActive && _connectionState.value == ConnectionState.CONNECTED) {
                delay(25_000)
                webSocket?.send("{\"type\":\"ping\",\"payload\":{}}")
            }
        }
    }

    fun disconnect() {
        shouldReconnect = false
        reconnectJob?.cancel()
        pingJob?.cancel()
        webSocket?.close(1000, "User disconnected")
        webSocket = null
        _connectionState.value = ConnectionState.DISCONNECTED
    }

    fun dispose() {
        disconnect()
        scope.cancel()
    }
}
