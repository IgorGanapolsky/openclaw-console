package com.openclaw.console.ui.screens.loops

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.openclaw.console.data.model.RecurringTask
import com.openclaw.console.data.repository.LoopRepository
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

data class LoopListUiState(
    val tasks: List<RecurringTask> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
    val isGenerating: Boolean = false,
    val generateError: String? = null,
    val generateSuccessMsg: String? = null
)

class LoopViewModel : ViewModel() {

    private var loopRepository: LoopRepository? = null

    private val _uiState = MutableStateFlow(LoopListUiState())
    val uiState: StateFlow<LoopListUiState> = _uiState

    fun setRepository(repo: LoopRepository?) {
        if (repo == loopRepository) return
        loopRepository = repo
        if (repo != null) {
            observeLoops(repo)
            viewModelScope.launch { repo.refreshLoops() }
        } else {
            _uiState.value = LoopListUiState()
        }
    }

    private fun observeLoops(repo: LoopRepository) {
        viewModelScope.launch {
            combine(
                repo.tasks,
                repo.isLoading,
                repo.error
            ) { tasks, loading, error ->
                Triple(tasks, loading, error)
            }.collect { (tasks, loading, error) ->
                _uiState.value = _uiState.value.copy(
                    tasks = tasks,
                    isLoading = loading,
                    error = error
                )
            }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            loopRepository?.refreshLoops()
        }
    }

    fun generateSkill(prompt: String, agentId: String = "agent-ops") {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isGenerating = true, generateError = null, generateSuccessMsg = null)
            val result = loopRepository?.generateSkill(prompt, agentId)
            result?.onSuccess { res ->
                if (res.success) {
                    _uiState.value = _uiState.value.copy(
                        isGenerating = false,
                        generateSuccessMsg = res.message,
                        generateError = null
                    )
                    loopRepository?.refreshLoops()
                } else {
                    _uiState.value = _uiState.value.copy(
                        isGenerating = false,
                        generateError = res.error ?: "Failed to generate skill"
                    )
                }
            }?.onFailure { e ->
                _uiState.value = _uiState.value.copy(isGenerating = false, generateError = e.message)
            }
        }
    }

    fun clearError() {
        loopRepository?.clearError()
        _uiState.value = _uiState.value.copy(error = null, generateError = null)
    }
    
    fun clearSuccess() {
        _uiState.value = _uiState.value.copy(generateSuccessMsg = null)
    }
}
