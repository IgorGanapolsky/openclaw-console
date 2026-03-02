package com.openclaw.console.data.repository

import com.openclaw.console.data.model.Task
import com.openclaw.console.data.model.TaskStep
import com.openclaw.console.data.model.WebSocketEvent
import com.openclaw.console.data.network.ApiService
import com.openclaw.console.data.network.WebSocketClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class TaskRepository(
    private val apiService: ApiService,
    private val wsClient: WebSocketClient
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    // Map of agentId -> list of tasks
    private val _tasksByAgent = MutableStateFlow<Map<String, List<Task>>>(emptyMap())
    val tasksByAgent: StateFlow<Map<String, List<Task>>> = _tasksByAgent

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
                    is WebSocketEvent.TaskUpdate -> {
                        val agentId = event.update.agentId
                        val tasks = _tasksByAgent.value[agentId]?.map { task ->
                            if (task.id == event.update.id) {
                                task.copy(
                                    status = event.update.status,
                                    updatedAt = event.update.updatedAt
                                )
                            } else task
                        } ?: return@collect
                        _tasksByAgent.value = _tasksByAgent.value + (agentId to tasks)
                    }
                    is WebSocketEvent.TaskStepAdded -> {
                        val step = event.step
                        val agentId = findAgentIdForTask(step.taskId) ?: return@collect
                        val tasks = _tasksByAgent.value[agentId]?.map { task ->
                            if (task.id == step.taskId) {
                                task.copy(steps = task.steps + step)
                            } else task
                        } ?: return@collect
                        _tasksByAgent.value = _tasksByAgent.value + (agentId to tasks)
                    }
                    else -> {}
                }
            }
        }
    }

    private fun findAgentIdForTask(taskId: String): String? {
        return _tasksByAgent.value.entries.find { (_, tasks) ->
            tasks.any { it.id == taskId }
        }?.key
    }

    suspend fun getTasksForAgent(agentId: String) {
        _isLoading.value = true
        _error.value = null
        apiService.getAgentTasks(agentId)
            .onSuccess { tasks ->
                _tasksByAgent.value = _tasksByAgent.value + (agentId to tasks)
            }
            .onFailure { e ->
                _error.value = e.message ?: "Failed to load tasks"
            }
        _isLoading.value = false
    }

    suspend fun getTaskDetail(agentId: String, taskId: String): Result<Task> {
        return apiService.getTaskDetail(agentId, taskId).also { result ->
            result.onSuccess { task ->
                val updated = (_tasksByAgent.value[agentId] ?: emptyList()).map {
                    if (it.id == taskId) task else it
                }.let { list ->
                    if (list.none { it.id == taskId }) list + task else list
                }
                _tasksByAgent.value = _tasksByAgent.value + (agentId to updated)
            }
        }
    }

    fun getTasksForAgentSync(agentId: String): List<Task> {
        return _tasksByAgent.value[agentId] ?: emptyList()
    }

    fun clearError() { _error.value = null }
}
