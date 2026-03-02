package com.openclaw.console.ui.screens.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.openclaw.console.data.model.GatewayConnection
import com.openclaw.console.data.repository.GatewayRepository
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

data class SettingsUiState(
    val gateways: List<GatewayConnection> = emptyList(),
    val activeGatewayId: String? = null,
    val isLoading: Boolean = false,
    val error: String? = null
)

data class AddGatewayUiState(
    val name: String = "",
    val baseUrl: String = "",
    val token: String = "",
    val isLoading: Boolean = false,
    val testResult: TestResult? = null,
    val error: String? = null,
    val showHttpWarning: Boolean = false
)

enum class TestResult { SUCCESS, FAILURE }

class SettingsViewModel : ViewModel() {

    private var gatewayRepository: GatewayRepository? = null

    private val _settingsUiState = MutableStateFlow(SettingsUiState())
    val settingsUiState: StateFlow<SettingsUiState> = _settingsUiState

    private val _addGatewayUiState = MutableStateFlow(AddGatewayUiState())
    val addGatewayUiState: StateFlow<AddGatewayUiState> = _addGatewayUiState

    fun setRepository(repo: GatewayRepository?) {
        if (repo == gatewayRepository) return
        gatewayRepository = repo
        if (repo != null) {
            observeGateways(repo)
        }
    }

    private fun observeGateways(repo: GatewayRepository) {
        viewModelScope.launch {
            combine(repo.gateways, repo.activeGateway) { gateways, active ->
                Pair(gateways, active)
            }.collect { (gateways, active) ->
                _settingsUiState.value = _settingsUiState.value.copy(
                    gateways = gateways,
                    activeGatewayId = active?.id
                )
            }
        }
    }

    fun onNameChange(name: String) {
        _addGatewayUiState.value = _addGatewayUiState.value.copy(name = name)
    }

    fun onBaseUrlChange(url: String) {
        _addGatewayUiState.value = _addGatewayUiState.value.copy(
            baseUrl = url,
            showHttpWarning = url.startsWith("http://"),
            testResult = null
        )
    }

    fun onTokenChange(token: String) {
        _addGatewayUiState.value = _addGatewayUiState.value.copy(token = token, testResult = null)
    }

    fun testAndSave(onSuccess: () -> Unit) {
        val state = _addGatewayUiState.value
        if (state.name.isBlank() || state.baseUrl.isBlank() || state.token.isBlank()) {
            _addGatewayUiState.value = state.copy(error = "All fields are required")
            return
        }
        _addGatewayUiState.value = state.copy(isLoading = true, error = null, testResult = null)

        viewModelScope.launch {
            val repo = gatewayRepository ?: run {
                _addGatewayUiState.value = _addGatewayUiState.value.copy(
                    isLoading = false,
                    error = "Repository not available"
                )
                return@launch
            }

            repo.testConnection(state.baseUrl, state.token)
                .onSuccess {
                    val newGateway = GatewayConnection(
                        name = state.name,
                        baseUrl = state.baseUrl
                    )
                    repo.saveGateway(newGateway, state.token)
                    repo.setActiveGateway(newGateway.id)
                    _addGatewayUiState.value = _addGatewayUiState.value.copy(
                        isLoading = false,
                        testResult = TestResult.SUCCESS
                    )
                    onSuccess()
                }
                .onFailure { e ->
                    _addGatewayUiState.value = _addGatewayUiState.value.copy(
                        isLoading = false,
                        testResult = TestResult.FAILURE,
                        error = "Connection failed: ${e.message}"
                    )
                }
        }
    }

    fun deleteGateway(gatewayId: String) {
        viewModelScope.launch {
            gatewayRepository?.deleteGateway(gatewayId)
        }
    }

    fun setActiveGateway(gatewayId: String) {
        viewModelScope.launch {
            gatewayRepository?.setActiveGateway(gatewayId)
        }
    }

    fun resetAddGatewayForm() {
        _addGatewayUiState.value = AddGatewayUiState()
    }

    fun clearSettingsError() {
        _settingsUiState.value = _settingsUiState.value.copy(error = null)
    }

    fun clearAddGatewayError() {
        _addGatewayUiState.value = _addGatewayUiState.value.copy(error = null)
    }
}
