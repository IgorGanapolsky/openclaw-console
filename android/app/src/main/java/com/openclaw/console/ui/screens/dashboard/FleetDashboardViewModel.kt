package com.openclaw.console.ui.screens.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.openclaw.console.data.model.Agent
import com.openclaw.console.data.model.AgentStatus
import com.openclaw.console.data.repository.AgentRepository
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

data class FleetDashboardUiState(
    val agents: List<Agent> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null
) {
    val onlineCount: Int get() = agents.count { it.status == AgentStatus.ONLINE }
    val offlineCount: Int get() = agents.count { it.status == AgentStatus.OFFLINE }
    val busyCount: Int get() = agents.count { it.status == AgentStatus.BUSY }
    val totalPendingApprovals: Int get() = agents.sumOf { it.pendingApprovals }
    val totalActiveTasks: Int get() = agents.sumOf { it.activeTasks }

    val summaryText: String get() {
        val online = onlineCount
        val approvals = totalPendingApprovals
        val tasks = totalActiveTasks
        return "$online agent${if (online == 1) "" else "s"} online, " +
            "$approvals pending approval${if (approvals == 1) "" else "s"}, " +
            "$tasks active task${if (tasks == 1) "" else "s"}"
    }

    /** Agents sorted: those needing attention first (pending approvals desc, then busy, online, offline) */
    val sortedAgents: List<Agent> get() = agents.sortedWith(
        compareByDescending<Agent> { it.pendingApprovals }
            .thenBy { it.status.sortOrder }
    )
}

private val AgentStatus.sortOrder: Int get() = when (this) {
    AgentStatus.BUSY -> 0
    AgentStatus.ONLINE -> 1
    AgentStatus.OFFLINE -> 2
}

class FleetDashboardViewModel : ViewModel() {

    private var agentRepository: AgentRepository? = null

    private val _uiState = MutableStateFlow(FleetDashboardUiState())
    val uiState: StateFlow<FleetDashboardUiState> = _uiState

    fun setRepository(repo: AgentRepository?) {
        if (repo == agentRepository) return
        agentRepository = repo
        if (repo != null) {
            observeAgents(repo)
            viewModelScope.launch { repo.refreshAgents() }
        } else {
            _uiState.value = FleetDashboardUiState()
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
                _uiState.value = FleetDashboardUiState(
                    agents = agents,
                    isLoading = loading,
                    error = error
                )
            }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            agentRepository?.refreshAgents()
        }
    }
}
