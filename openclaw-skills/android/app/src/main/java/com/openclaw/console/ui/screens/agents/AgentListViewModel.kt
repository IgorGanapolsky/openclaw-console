package com.openclaw.console.ui.screens.agents

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.openclaw.console.data.model.Agent
import com.openclaw.console.data.repository.AgentRepository
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

data class AgentListUiState(
    val agents: List<Agent> = emptyList(),
    val filteredAgents: List<Agent> = emptyList(),
    val searchQuery: String = "",
    val isLoading: Boolean = false,
    val error: String? = null
)

class AgentListViewModel : ViewModel() {

    private var agentRepository: AgentRepository? = null

    private val _uiState = MutableStateFlow(AgentListUiState())
    val uiState: StateFlow<AgentListUiState> = _uiState

    fun setRepository(repo: AgentRepository?) {
        if (repo == agentRepository) return
        agentRepository = repo
        if (repo != null) {
            observeAgents(repo)
            viewModelScope.launch { repo.refreshAgents() }
        } else {
            _uiState.value = AgentListUiState()
        }
    }

    private fun observeAgents(repo: AgentRepository) {
        viewModelScope.launch {
            combine(
                repo.agents,
                repo.isLoading,
                repo.error
            ) { agents, loading, error ->
                Triple(agents, loading, error)
            }.collect { (agents, loading, error) ->
                val query = _uiState.value.searchQuery
                _uiState.value = _uiState.value.copy(
                    agents = agents,
                    filteredAgents = filterAgents(agents, query),
                    isLoading = loading,
                    error = error
                )
            }
        }
    }

    fun onSearchQueryChange(query: String) {
        val agents = _uiState.value.agents
        _uiState.value = _uiState.value.copy(
            searchQuery = query,
            filteredAgents = filterAgents(agents, query)
        )
    }

    fun refresh() {
        viewModelScope.launch {
            agentRepository?.refreshAgents()
        }
    }

    fun clearError() {
        agentRepository?.clearError()
        _uiState.value = _uiState.value.copy(error = null)
    }

    private fun filterAgents(agents: List<Agent>, query: String): List<Agent> {
        if (query.isBlank()) return agents
        val q = query.lowercase()
        return agents.filter {
            it.name.lowercase().contains(q) ||
            it.description.lowercase().contains(q) ||
            it.workspace.lowercase().contains(q) ||
            it.tags.any { tag -> tag.lowercase().contains(q) }
        }
    }
}
