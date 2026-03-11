package com.openclaw.console.ui.screens.incidents

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.openclaw.console.data.model.Incident
import com.openclaw.console.data.model.IncidentSeverity
import com.openclaw.console.data.model.IncidentStatus
import com.openclaw.console.data.repository.IncidentRepository
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

enum class IncidentFilter { ALL, CRITICAL, WARNING }

data class IncidentUiState(
    val incidents: List<Incident> = emptyList(),
    val filteredIncidents: List<Incident> = emptyList(),
    val activeFilter: IncidentFilter = IncidentFilter.ALL,
    val isLoading: Boolean = false,
    val error: String? = null
)

class IncidentViewModel : ViewModel() {

    private var incidentRepository: IncidentRepository? = null

    private val _uiState = MutableStateFlow(IncidentUiState())
    val uiState: StateFlow<IncidentUiState> = _uiState

    fun setRepository(repo: IncidentRepository?) {
        if (repo == incidentRepository) return
        incidentRepository = repo
        if (repo != null) {
            observeIncidents(repo)
            viewModelScope.launch { repo.refreshIncidents() }
        } else {
            _uiState.value = IncidentUiState()
        }
    }

    private fun observeIncidents(repo: IncidentRepository) {
        viewModelScope.launch {
            combine(repo.incidents, repo.isLoading, repo.error) { incidents, loading, error ->
                Triple(incidents, loading, error)
            }.collect { (incidents, loading, error) ->
                val filter = _uiState.value.activeFilter
                _uiState.value = _uiState.value.copy(
                    incidents = incidents,
                    filteredIncidents = applyFilter(incidents, filter),
                    isLoading = loading,
                    error = error
                )
            }
        }
    }

    fun setFilter(filter: IncidentFilter) {
        _uiState.value = _uiState.value.copy(
            activeFilter = filter,
            filteredIncidents = applyFilter(_uiState.value.incidents, filter)
        )
    }

    fun refresh() {
        viewModelScope.launch { incidentRepository?.refreshIncidents() }
    }

    fun clearError() {
        incidentRepository?.clearError()
        _uiState.value = _uiState.value.copy(error = null)
    }

    private fun applyFilter(incidents: List<Incident>, filter: IncidentFilter): List<Incident> {
        return when (filter) {
            IncidentFilter.ALL -> incidents
            IncidentFilter.CRITICAL -> incidents.filter { it.severity == IncidentSeverity.CRITICAL }
            IncidentFilter.WARNING -> incidents.filter { it.severity == IncidentSeverity.WARNING }
        }
    }
}
