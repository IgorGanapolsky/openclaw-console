package com.openclaw.console.ui.screens.tasks

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.openclaw.console.data.model.Task
import com.openclaw.console.data.repository.TaskRepository
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

data class TaskDetailUiState(
    val task: Task? = null,
    val isLoading: Boolean = false,
    val error: String? = null,
    val chatInput: String = "",
    val isSendingMessage: Boolean = false
)

class TaskDetailViewModel : ViewModel() {

    private var taskRepository: TaskRepository? = null
    private var currentAgentId: String? = null
    private var currentTaskId: String? = null

    private val _uiState = MutableStateFlow(TaskDetailUiState())
    val uiState: StateFlow<TaskDetailUiState> = _uiState

    fun init(agentId: String, taskId: String, repo: TaskRepository?) {
        if (currentAgentId == agentId && currentTaskId == taskId && taskRepository == repo) return
        currentAgentId = agentId
        currentTaskId = taskId
        taskRepository = repo

        if (repo == null) {
            _uiState.value = TaskDetailUiState()
            return
        }

        // Observe live task from cache
        viewModelScope.launch {
            repo.tasksByAgent.collect { byAgent ->
                val task = byAgent[agentId]?.find { it.id == taskId }
                if (task != null) {
                    _uiState.value = _uiState.value.copy(task = task)
                }
            }
        }

        // Fetch fresh copy
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)
            repo.getTaskDetail(agentId, taskId)
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(error = e.message)
                }
            _uiState.value = _uiState.value.copy(isLoading = false)
        }
    }

    fun onChatInputChange(text: String) {
        _uiState.value = _uiState.value.copy(chatInput = text)
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(error = null)
    }
}
