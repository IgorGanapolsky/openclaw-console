package com.openclaw.console.ui.screens.bridges

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.openclaw.console.data.model.BridgeSession
import com.openclaw.console.data.repository.BridgeRepository
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

data class BridgeListUiState(
    val sessions: List<BridgeSession> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null
)

class BridgeViewModel : ViewModel() {

    private var bridgeRepository: BridgeRepository? = null

    private val _uiState = MutableStateFlow(BridgeListUiState())
    val uiState: StateFlow<BridgeListUiState> = _uiState

    fun setRepository(repo: BridgeRepository?) {
        if (repo == bridgeRepository) return
        bridgeRepository = repo
        if (repo != null) {
            observeBridges(repo)
            viewModelScope.launch { repo.refreshBridges() }
        } else {
            _uiState.value = BridgeListUiState()
        }
    }

    private fun observeBridges(repo: BridgeRepository) {
        viewModelScope.launch {
            combine(
                repo.sessions,
                repo.isLoading,
                repo.error
            ) { sessions, loading, error ->
                Triple(sessions, loading, error)
            }.collect { (sessions, loading, error) ->
                _uiState.value = _uiState.value.copy(
                    sessions = sessions,
                    isLoading = loading,
                    error = error
                )
            }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            bridgeRepository?.refreshBridges()
        }
    }

    fun clearError() {
        bridgeRepository?.clearError()
        _uiState.value = _uiState.value.copy(error = null)
    }
}
