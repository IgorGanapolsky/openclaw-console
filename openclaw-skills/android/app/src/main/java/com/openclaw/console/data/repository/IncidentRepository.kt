package com.openclaw.console.data.repository

import com.openclaw.console.data.model.Incident
import com.openclaw.console.data.model.IncidentStatus
import com.openclaw.console.data.model.WebSocketEvent
import com.openclaw.console.data.network.ApiService
import com.openclaw.console.data.network.WebSocketClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class IncidentRepository(
    private val apiService: ApiService,
    private val wsClient: WebSocketClient
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _incidents = MutableStateFlow<List<Incident>>(emptyList())
    val incidents: StateFlow<List<Incident>> = _incidents

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
                    is WebSocketEvent.IncidentNew -> {
                        val existing = _incidents.value
                        if (existing.none { it.id == event.incident.id }) {
                            _incidents.value = listOf(event.incident) + existing
                        }
                    }
                    is WebSocketEvent.IncidentUpdate -> {
                        _incidents.value = _incidents.value.map { incident ->
                            if (incident.id == event.update.id) {
                                incident.copy(
                                    status = event.update.status,
                                    updatedAt = event.update.updatedAt
                                )
                            } else incident
                        }
                    }
                    else -> {}
                }
            }
        }
    }

    suspend fun refreshIncidents() {
        _isLoading.value = true
        _error.value = null
        apiService.getIncidents()
            .onSuccess { incidents ->
                _incidents.value = incidents.sortedByDescending { it.createdAt }
            }
            .onFailure { e ->
                _error.value = e.message ?: "Failed to load incidents"
            }
        _isLoading.value = false
    }

    fun getIncident(incidentId: String): Incident? {
        return _incidents.value.find { it.id == incidentId }
    }

    fun acknowledgeIncidentLocally(incidentId: String) {
        _incidents.value = _incidents.value.map { incident ->
            if (incident.id == incidentId) {
                incident.copy(status = IncidentStatus.ACKNOWLEDGED)
            } else incident
        }
    }

    fun clearError() { _error.value = null }
}
