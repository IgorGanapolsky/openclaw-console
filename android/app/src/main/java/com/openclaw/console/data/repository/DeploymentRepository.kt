package com.openclaw.console.data.repository

import com.openclaw.console.data.model.*
import com.openclaw.console.data.network.ApiService
import com.openclaw.console.data.network.WebSocketClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class DeploymentRepository(
    private val apiService: ApiService,
    private val wsClient: WebSocketClient
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _deployments = MutableStateFlow<List<Deployment>>(emptyList())
    val deployments: StateFlow<List<Deployment>> = _deployments

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
                    is WebSocketEvent.DeploymentNew -> {
                        val existing = _deployments.value
                        if (existing.none { it.id == event.deployment.id }) {
                            _deployments.value = listOf(event.deployment) + existing
                        }
                    }
                    is WebSocketEvent.DeploymentUpdate -> {
                        _deployments.value = _deployments.value.map { deployment ->
                            if (deployment.id == event.update.id) {
                                deployment.copy(
                                    status = event.update.status,
                                    completedAt = if (event.update.status.isComplete) event.update.updatedAt else deployment.completedAt
                                )
                            } else deployment
                        }
                    }
                    is WebSocketEvent.DeploymentStepUpdate -> {
                        _deployments.value = _deployments.value.map { deployment ->
                            if (deployment.id == event.update.deploymentId) {
                                val updatedSteps = deployment.steps.map { step ->
                                    if (step.id == event.update.id) {
                                        step.copy(
                                            status = event.update.status,
                                            startedAt = event.update.startedAt ?: step.startedAt,
                                            completedAt = event.update.completedAt,
                                            error = event.update.error,
                                            logs = event.update.logs
                                        )
                                    } else step
                                }
                                deployment.copy(steps = updatedSteps)
                            } else deployment
                        }
                    }
                    is WebSocketEvent.DeploymentCompleted -> {
                        _deployments.value = _deployments.value.map { deployment ->
                            if (deployment.id == event.deployment.id) {
                                event.deployment
                            } else deployment
                        }
                    }
                    else -> {}
                }
            }
        }
    }

    suspend fun fetchDeployments() {
        _isLoading.value = true
        _error.value = null
        apiService.getDeployments()
            .onSuccess { deployments ->
                _deployments.value = deployments.sortedByDescending { it.createdAt }
            }
            .onFailure { e ->
                _error.value = e.message ?: "Failed to load deployments"
            }
        _isLoading.value = false
    }

    suspend fun fetchDeploymentDetails(deploymentId: String) {
        apiService.getDeployment(deploymentId)
            .onSuccess { deployment ->
                _deployments.value = _deployments.value.map { existing ->
                    if (existing.id == deploymentId) deployment else existing
                }
            }
            .onFailure { e ->
                _error.value = e.message ?: "Failed to load deployment details"
            }
    }

    suspend fun triggerDeployment(request: DeploymentRequest) {
        apiService.triggerDeployment(request)
            .onSuccess { deployment ->
                val existing = _deployments.value
                _deployments.value = listOf(deployment) + existing
            }
            .onFailure { e ->
                _error.value = e.message ?: "Failed to trigger deployment"
            }
    }

    suspend fun cancelDeployment(deploymentId: String) {
        apiService.cancelDeployment(deploymentId)
            .onSuccess { deployment ->
                _deployments.value = _deployments.value.map { existing ->
                    if (existing.id == deploymentId) {
                        existing.copy(
                            status = DeploymentStatus.CANCELLED,
                            completedAt = deployment.completedAt
                        )
                    } else existing
                }
            }
            .onFailure { e ->
                _error.value = e.message ?: "Failed to cancel deployment"
            }
    }

    fun getDeployment(deploymentId: String): Deployment? {
        return _deployments.value.find { it.id == deploymentId }
    }

    fun clearError() {
        _error.value = null
    }
}