package com.openclaw.console.ui

import android.app.Application
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.openclaw.console.data.model.GatewayConnection
import com.openclaw.console.data.model.WebSocketEvent
import com.openclaw.console.data.network.ApiService
import com.openclaw.console.data.network.ConnectionState
import com.openclaw.console.data.network.WebSocketClient
import com.openclaw.console.data.repository.*
import com.openclaw.console.service.SecureStorage
import com.openclaw.console.service.NotificationService
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

/**
 * App-level ViewModel that owns the active gateway connection and shared repositories.
 * Survives configuration changes as it lives at the Activity level.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class AppViewModel(private val application: Application) : ViewModel() {

    val secureStorage = SecureStorage(application)
    val gatewayRepository = GatewayRepository(secureStorage)

    private val _wsClient = MutableStateFlow<WebSocketClient?>(null)
    private val _apiService = MutableStateFlow<ApiService?>(null)
    private var gatewaySignalJob: Job? = null

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

    private val _lastGatewaySignal = MutableStateFlow<String?>(null)
    val lastGatewaySignal: StateFlow<String?> = _lastGatewaySignal

    private val _gatewaySignalSummary = MutableStateFlow("No gateway signal yet")
    val gatewaySignalSummary: StateFlow<String> = _gatewaySignalSummary

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
        _approvalRepository.value = ApprovalRepository(api, ws, NotificationService.getInstance(application))

        ws.connect()
        observeGatewaySignals(ws)

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

    private fun observeGatewaySignals(ws: WebSocketClient) {
        gatewaySignalJob?.cancel()
        gatewaySignalJob = viewModelScope.launch {
            ws.events.collect { event ->
                when (event) {
                    is WebSocketEvent.Connected -> {
                        _lastGatewaySignal.value = event.timestamp ?: java.time.Instant.now().toString()
                        _gatewaySignalSummary.value = "Connected • heartbeat every ${event.heartbeatIntervalMs / 1000}s"
                    }
                    is WebSocketEvent.Heartbeat -> {
                        _lastGatewaySignal.value = event.timestamp ?: java.time.Instant.now().toString()
                        _gatewaySignalSummary.value = "Working • ${event.connectedClients} client(s) • uptime ${event.uptimeSeconds}s"
                    }
                    is WebSocketEvent.Reconnecting -> {
                        _lastGatewaySignal.value = java.time.Instant.now().toString()
                        _gatewaySignalSummary.value = "Reconnecting in ${event.delayMs / 1000}s"
                    }
                    WebSocketEvent.Disconnected -> {
                        _lastGatewaySignal.value = java.time.Instant.now().toString()
                        _gatewaySignalSummary.value = "Disconnected"
                    }
                    else -> {
                        _lastGatewaySignal.value = java.time.Instant.now().toString()
                    }
                }
            }
        }
    }

    fun disconnect() {
        gatewaySignalJob?.cancel()
        gatewaySignalJob = null
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

    companion object {
        fun factory(application: Application): ViewModelProvider.Factory =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T {
                    require(modelClass.isAssignableFrom(AppViewModel::class.java)) {
                        "Unknown ViewModel class: ${modelClass.name}"
                    }
                    return AppViewModel(application) as T
                }
            }
    }
}
