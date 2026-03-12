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
    val setupLink: String = "",
    val importMessage: String? = null,
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
        _addGatewayUiState.value = _addGatewayUiState.value.copy(
            name = name,
            importMessage = null
        )
    }

    fun onSetupLinkChange(link: String) {
        _addGatewayUiState.value = _addGatewayUiState.value.copy(
            setupLink = link,
            importMessage = null,
            error = null,
            testResult = null
        )
    }

    fun onBaseUrlChange(url: String) {
        _addGatewayUiState.value = _addGatewayUiState.value.copy(
            baseUrl = url,
            importMessage = null,
            showHttpWarning = url.startsWith("http://"),
            testResult = null
        )
    }

    fun onTokenChange(token: String) {
        _addGatewayUiState.value = _addGatewayUiState.value.copy(
            token = token,
            importMessage = null,
            testResult = null
        )
    }

    fun importSetupLink(rawLink: String? = null) {
        val state = _addGatewayUiState.value
        val setupLink = rawLink?.trim().takeUnless { it.isNullOrEmpty() } ?: state.setupLink
        if (setupLink.isBlank()) {
            _addGatewayUiState.value = state.copy(
                importMessage = null,
                error = "Copy a setup link first.",
                testResult = null
            )
            return
        }

        try {
            val imported = GatewaySetupLinkParser.parse(setupLink)
            _addGatewayUiState.value = state.copy(
                setupLink = setupLink,
                importMessage = "Setup link imported. Review the details, then test and save.",
                name = imported.name,
                baseUrl = imported.baseUrl,
                token = imported.token,
                showHttpWarning = imported.baseUrl.startsWith("http://"),
                error = null,
                testResult = null
            )
        } catch (error: GatewaySetupImportError) {
            _addGatewayUiState.value = state.copy(
                importMessage = null,
                setupLink = setupLink,
                error = error.message,
                testResult = null
            )
        }
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
