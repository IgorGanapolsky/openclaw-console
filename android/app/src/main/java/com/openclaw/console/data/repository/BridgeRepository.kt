package com.openclaw.console.data.repository

import com.openclaw.console.data.model.BridgeSession
import com.openclaw.console.data.model.WebSocketEvent
import com.openclaw.console.data.network.ApiService
import com.openclaw.console.data.network.WebSocketClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class BridgeRepository(
    private val apiService: ApiService,
    private val wsClient: WebSocketClient
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _sessions = MutableStateFlow<List<BridgeSession>>(emptyList())
    val sessions: StateFlow<List<BridgeSession>> = _sessions

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
                    is WebSocketEvent.BridgeSessionNew -> {
                        if (_sessions.value.none { it.id == event.session.id }) {
                            _sessions.value = _sessions.value + event.session
                        }
                    }
                    is WebSocketEvent.BridgeSessionUpdate -> {
                        _sessions.value = _sessions.value.map {
                            if (it.id == event.session.id) event.session else it
                        }
                    }
                    else -> {}
                }
            }
        }
    }

    suspend fun refreshBridges() {
        _isLoading.value = true
        _error.value = null
        apiService.getBridges()
            .onSuccess { sessions ->
                _sessions.value = sessions
            }
            .onFailure { e ->
                _error.value = e.message ?: "Failed to load bridges"
            }
        _isLoading.value = false
    }

    fun clearError() { _error.value = null }
}
