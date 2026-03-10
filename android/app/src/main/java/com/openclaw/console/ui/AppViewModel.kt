package com.openclaw.console.ui

import android.app.Application
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.openclaw.console.data.model.GatewayConnection
import com.openclaw.console.data.network.ApiService
import com.openclaw.console.data.network.ConnectionState
import com.openclaw.console.data.network.WebSocketClient
import com.openclaw.console.data.repository.*
import com.openclaw.console.service.SecureStorage
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

/**
 * App-level ViewModel that owns the active gateway connection and shared repositories.
 * Survives configuration changes as it lives at the Activity level.
 */
class AppViewModel(application: Application) : ViewModel() {

    val secureStorage = SecureStorage(application)
    val gatewayRepository = GatewayRepository(secureStorage)

    private val _wsClient = MutableStateFlow<WebSocketClient?>(null)
    private val _apiService = MutableStateFlow<ApiService?>(null)

    // Exposed repos (null until a gateway is connected)
    private val _agentRepository = MutableStateFlow<AgentRepository?>(null)
    val agentRepository: StateFlow<AgentRepository?> = _agentRepository

    private val _taskRepository = MutableStateFlow<TaskRepository?>(null)
    val taskRepository: StateFlow<TaskRepository?> = _taskRepository

    private val _incidentRepository = MutableStateFlow<IncidentRepository?>(null)
    val incidentRepository: StateFlow<IncidentRepository?> = _incidentRepository

    private val _bridgeRepository = MutableStateFlow<BridgeRepository?>(null)
    val bridgeRepository: StateFlow<BridgeRepository?> = _bridgeRepository

    private val _loopRepository = MutableStateFlow<LoopRepository?>(null)
    val loopRepository: StateFlow<LoopRepository?> = _loopRepository

    private val _approvalRepository = MutableStateFlow<ApprovalRepository?>(null)
    val approvalRepository: StateFlow<ApprovalRepository?> = _approvalRepository

    val connectionState: StateFlow<ConnectionState> = _wsClient
        .flatMapLatest { ws ->
            ws?.connectionState ?: MutableStateFlow(ConnectionState.DISCONNECTED)
        }
        .stateIn(viewModelScope, SharingStarted.Eagerly, ConnectionState.DISCONNECTED)

    val pendingApprovalCount: StateFlow<Int> = _approvalRepository
        .flatMapLatest { repo ->
            repo?.pendingApprovals?.map { it.size } ?: MutableStateFlow(0)
        }
        .stateIn(viewModelScope, SharingStarted.Eagerly, 0)

    init {
        // Auto-connect to active gateway if one is saved
        viewModelScope.launch {
            gatewayRepository.activeGateway.collect { gw ->
                if (gw != null) {
                    val token = gatewayRepository.getToken(gw.id)
                    if (!token.isNullOrBlank()) {
                        connectToGateway(gw, token)
                    }
                }
            }
        }
    }

    fun connectToGateway(gateway: GatewayConnection, token: String) {
        // Disconnect existing
        _wsClient.value?.dispose()

        val api = ApiService(gateway.baseUrl, token)
        val ws = WebSocketClient(gateway.baseUrl, token)

        _apiService.value = api
        _wsClient.value = ws

        _agentRepository.value = AgentRepository(api, ws)
        _taskRepository.value = TaskRepository(api, ws)
        _incidentRepository.value = IncidentRepository(api, ws)
        _bridgeRepository.value = BridgeRepository(api, ws)
        _loopRepository.value = LoopRepository(api, ws)
        _approvalRepository.value = ApprovalRepository(api, ws)

        ws.connect()

        // Initial data load
        viewModelScope.launch {
            _agentRepository.value?.refreshAgents()
            _incidentRepository.value?.refreshIncidents()
            _bridgeRepository.value?.refreshBridges()
            _loopRepository.value?.refreshLoops()
            _approvalRepository.value?.refreshPendingApprovals()
        }

        // Update last connected
        gatewayRepository.updateLastConnected(gateway.id, java.time.Instant.now().toString())
    }

    fun disconnect() {
        _wsClient.value?.dispose()
        _wsClient.value = null
        _apiService.value = null
        _agentRepository.value = null
        _taskRepository.value = null
        _incidentRepository.value = null
        _bridgeRepository.value = null
        _loopRepository.value = null
        _approvalRepository.value = null
    }

    override fun onCleared() {
        super.onCleared()
        _wsClient.value?.dispose()
    }
}
