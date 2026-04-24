package com.openclaw.console.ui.screens.deployments

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.openclaw.console.data.model.*
import com.openclaw.console.data.repository.DeploymentRepository
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

data class DeploymentUiState(
    val isLoading: Boolean = false,
    val deployments: List<Deployment> = emptyList(),
    val searchQuery: String = "",
    val statusFilter: DeploymentStatus? = null,
    val environmentFilter: DeploymentEnvironment? = null,
    val error: String? = null
) {
    val filteredDeployments: List<Deployment>
        get() {
            var filtered = deployments

            if (searchQuery.isNotBlank()) {
                val query = searchQuery.lowercase()
                filtered = filtered.filter { deployment ->
                    deployment.title.lowercase().contains(query) ||
                            deployment.description.lowercase().contains(query) ||
                            deployment.branch.lowercase().contains(query) ||
                            deployment.commitMessage.lowercase().contains(query)
                }
            }

            statusFilter?.let { filter ->
                filtered = filtered.filter { it.status == filter }
            }

            environmentFilter?.let { filter ->
                filtered = filtered.filter { it.environment == filter }
            }

            return filtered.sortedByDescending { it.createdAt }
        }

    val hasActiveFilters: Boolean
        get() = searchQuery.isNotBlank() || statusFilter != null || environmentFilter != null
}

class DeploymentViewModel : ViewModel() {
    private val _uiState = MutableStateFlow(DeploymentUiState())
    val uiState: StateFlow<DeploymentUiState> = _uiState.asStateFlow()

    private var deploymentRepository: DeploymentRepository? = null

    fun setRepository(repository: DeploymentRepository?) {
        deploymentRepository = repository
        repository?.let { repo ->
            viewModelScope.launch {
                repo.deployments.collectLatest { deployments ->
                    _uiState.update { currentState ->
                        currentState.copy(
                            deployments = deployments,
                            isLoading = false
                        )
                    }
                }
            }

            // Initial fetch
            refresh()
        }
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                deploymentRepository?.fetchDeployments()
            } catch (e: Exception) {
                _uiState.update { currentState ->
                    currentState.copy(
                        isLoading = false,
                        error = e.message ?: "Unknown error occurred"
                    )
                }
            }
        }
    }

    fun onSearchQueryChange(query: String) {
        _uiState.update { it.copy(searchQuery = query) }
    }

    fun setStatusFilter(status: DeploymentStatus?) {
        _uiState.update { it.copy(statusFilter = status) }
    }

    fun setEnvironmentFilter(environment: DeploymentEnvironment?) {
        _uiState.update { it.copy(environmentFilter = environment) }
    }

    fun clearFilters() {
        _uiState.update { currentState ->
            currentState.copy(
                searchQuery = "",
                statusFilter = null,
                environmentFilter = null
            )
        }
    }

    fun triggerDeployment(request: DeploymentRequest) {
        viewModelScope.launch {
            try {
                deploymentRepository?.triggerDeployment(request)
            } catch (e: Exception) {
                _uiState.update { currentState ->
                    currentState.copy(
                        error = e.message ?: "Failed to trigger deployment"
                    )
                }
            }
        }
    }

    fun requestDeploymentApproval(request: DeploymentRequest) {
        viewModelScope.launch {
            try {
                // This will be handled by the approval repository
                // The approval flow will handle the actual deployment after approval
            } catch (e: Exception) {
                _uiState.update { currentState ->
                    currentState.copy(
                        error = e.message ?: "Failed to request deployment approval"
                    )
                }
            }
        }
    }

    fun cancelDeployment(deploymentId: String) {
        viewModelScope.launch {
            try {
                deploymentRepository?.cancelDeployment(deploymentId)
            } catch (e: Exception) {
                _uiState.update { currentState ->
                    currentState.copy(
                        error = e.message ?: "Failed to cancel deployment"
                    )
                }
            }
        }
    }
}