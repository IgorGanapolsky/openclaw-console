package com.openclaw.console.data.repository

import com.openclaw.console.data.model.RecurringTask
import com.openclaw.console.data.model.WebSocketEvent
import com.openclaw.console.data.network.ApiService
import com.openclaw.console.data.network.WebSocketClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class LoopRepository(
    private val apiService: ApiService,
    private val wsClient: WebSocketClient
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _tasks = MutableStateFlow<List<RecurringTask>>(emptyList())
    val tasks: StateFlow<List<RecurringTask>> = _tasks

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
                    is WebSocketEvent.RecurringTaskUpdated -> {
                        _tasks.value = _tasks.value.map {
                            if (it.id == event.task.id) event.task else it
                        }.let { list ->
                            if (list.none { it.id == event.task.id }) list + event.task else list
                        }
                    }
                    else -> {}
                }
            }
        }
    }

    suspend fun refreshLoops() {
        _isLoading.value = true
        _error.value = null
        apiService.getLoops()
            .onSuccess { tasks ->
                _tasks.value = tasks
            }
            .onFailure { e ->
                _error.value = e.message ?: "Failed to load loops"
            }
        _isLoading.value = false
    }

    suspend fun generateSkill(prompt: String, agentId: String = "agent-ops"): Result<ApiService.GenerateSkillResponse> {
        return apiService.generateSkill(prompt, agentId)
    }

    fun clearError() { _error.value = null }
}
