package com.openclaw.console.data.repository

import com.openclaw.console.data.model.Agent
import com.openclaw.console.data.model.WebSocketEvent
import com.openclaw.console.data.network.ApiService
import com.openclaw.console.data.network.WebSocketClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class AgentRepository(
    private val apiService: ApiService,
    private val wsClient: WebSocketClient
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _agents = MutableStateFlow<List<Agent>>(emptyList())
    val agents: StateFlow<List<Agent>> = _agents

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error

    init {
        observeWebSocket()
    }

    private fun observeWebSocket() {
        scope.launch {
            wsClient.events.collect { event ->
                when (event) {
                    is WebSocketEvent.AgentUpdate -> {
                        val updated = _agents.value.map { agent ->
                            if (agent.id == event.agentStatus.id) event.agentStatus else agent
                        }
                        _agents.value = if (updated.none { it.id == event.agentStatus.id }) {
                            _agents.value + event.agentStatus
                        } else {
                            updated
                        }
                    }
                    is WebSocketEvent.Connected -> {
                        // Re-subscribe to all known agents
                        val ids = _agents.value.map { it.id }
                        if (ids.isNotEmpty()) wsClient.subscribeToAgents(ids)
                    }
                    else -> {}
                }
            }
        }
    }

    suspend fun refreshAgents() {
        _isLoading.value = true
        _error.value = null
        apiService.getAgents()
            .onSuccess { agents ->
                _agents.value = agents
                wsClient.subscribeToAgents(agents.map { it.id })
            }
            .onFailure { e ->
                _error.value = e.message ?: "Failed to load agents"
            }
        _isLoading.value = false
    }

    suspend fun getAgent(agentId: String): Result<Agent> {
        return apiService.getAgent(agentId)
    }

    fun clearError() { _error.value = null }
}
