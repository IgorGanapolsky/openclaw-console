package com.openclaw.console.ui.screens.deployments

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.openclaw.console.data.model.Deployment
import com.openclaw.console.data.repository.DeploymentRepository
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

data class DeploymentDetailUiState(
    val isLoading: Boolean = false,
    val deployment: Deployment? = null,
    val error: String? = null
)

class DeploymentDetailViewModel : ViewModel() {
    private val _uiState = MutableStateFlow(DeploymentDetailUiState())
    val uiState: StateFlow<DeploymentDetailUiState> = _uiState.asStateFlow()

    private var deploymentRepository: DeploymentRepository? = null
    private var currentDeploymentId: String? = null

    fun init(deploymentId: String, repository: DeploymentRepository?) {
        currentDeploymentId = deploymentId
        deploymentRepository = repository

        repository?.let { repo ->
            viewModelScope.launch {
                repo.deployments.collectLatest { deployments ->
                    val deployment = deployments.find { it.id == deploymentId }
                    _uiState.update { currentState ->
                        currentState.copy(
                            deployment = deployment,
                            isLoading = false,
                            error = if (deployment == null) "Deployment not found" else null
                        )
                    }
                }
            }

            fetchDeploymentDetails(deploymentId)
        }
    }

    private fun fetchDeploymentDetails(deploymentId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                deploymentRepository?.fetchDeploymentDetails(deploymentId)
            } catch (e: Exception) {
                _uiState.update { currentState ->
                    currentState.copy(
                        isLoading = false,
                        error = e.message ?: "Failed to load deployment details"
                    )
                }
            }
        }
    }

    fun cancelDeployment() {
        val deploymentId = currentDeploymentId ?: return
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

    fun refresh() {
        currentDeploymentId?.let { deploymentId ->
            fetchDeploymentDetails(deploymentId)
        }
    }
}