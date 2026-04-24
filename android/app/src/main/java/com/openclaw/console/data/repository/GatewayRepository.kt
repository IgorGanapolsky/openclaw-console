package com.openclaw.console.data.repository

import com.openclaw.console.data.model.GatewayConnection
import com.openclaw.console.data.model.ResponseProfile
import com.openclaw.console.data.model.ResponseVerbosity
import com.openclaw.console.data.model.RuntimeConfig
import com.openclaw.console.data.network.ApiService
import com.openclaw.console.service.SecureStorage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

private val json = Json { ignoreUnknownKeys = true }

class GatewayRepository(private val secureStorage: SecureStorage) {

    private val _gateways = MutableStateFlow<List<GatewayConnection>>(emptyList())
    val gateways: StateFlow<List<GatewayConnection>> = _gateways

    private val _activeGateway = MutableStateFlow<GatewayConnection?>(null)
    val activeGateway: StateFlow<GatewayConnection?> = _activeGateway

    private val _runtimeConfig = MutableStateFlow<RuntimeConfig?>(null)
    val runtimeConfig: StateFlow<RuntimeConfig?> = _runtimeConfig

    init {
        loadGateways()
    }

    private fun loadGateways() {
        val keys = secureStorage.getAllGatewayMetaKeys()
            .filter { it.startsWith("gateway_") && !it.endsWith("_token") }
        val loaded = keys.mapNotNull { key ->
            val serialized = secureStorage.getGatewayMeta(key) ?: return@mapNotNull null
            try {
                json.decodeFromString<GatewayConnection>(serialized)
            } catch (e: Exception) {
                null
            }
        }.sortedBy { it.name }
        _gateways.value = loaded

        val activeId = secureStorage.getActiveGatewayId()
        _activeGateway.value = loaded.find { it.id == activeId }
    }

    suspend fun saveGateway(gateway: GatewayConnection, token: String) {
        withContext(Dispatchers.IO) {
            // Store token securely, strip it from the config object
            secureStorage.saveToken(gateway.id, token)
            val toStore = gateway.copy(token = "")
            secureStorage.saveGatewayMeta("gateway_${gateway.id}", json.encodeToString(toStore))
        }
        loadGateways()
    }

    fun getToken(gatewayId: String): String? = secureStorage.getToken(gatewayId)

    suspend fun deleteGateway(gatewayId: String) {
        withContext(Dispatchers.IO) {
            secureStorage.removeGatewayMeta("gateway_$gatewayId")
            secureStorage.deleteToken(gatewayId)
            if (secureStorage.getActiveGatewayId() == gatewayId) {
                secureStorage.saveActiveGatewayId("")
            }
        }
        loadGateways()
    }

    suspend fun setActiveGateway(gatewayId: String) {
        withContext(Dispatchers.IO) {
            secureStorage.saveActiveGatewayId(gatewayId)
        }
        loadGateways()
        refreshRuntimeConfig()
    }

    suspend fun testConnection(baseUrl: String, token: String): Result<Boolean> {
        return withContext(Dispatchers.IO) {
            try {
                val api = ApiService(baseUrl, token)
                api.healthCheck()
            } catch (e: Exception) {
                Result.failure(e)
            }
        }
    }

    fun updateLastConnected(gatewayId: String, timestamp: String) {
        val updated = _gateways.value.map { gw ->
            if (gw.id == gatewayId) gw.copy(lastConnectedAt = timestamp) else gw
        }
        _gateways.value = updated
        updated.find { it.id == gatewayId }?.let { gw ->
            val toStore = gw.copy(token = "")
            secureStorage.saveGatewayMeta("gateway_$gatewayId", json.encodeToString(toStore))
        }
    }

    suspend fun refreshRuntimeConfig() {
        val gateway = _activeGateway.value ?: run {
            _runtimeConfig.value = null
            return
        }
        val token = getToken(gateway.id) ?: run {
            _runtimeConfig.value = null
            return
        }
        withContext(Dispatchers.IO) {
            val api = ApiService(gateway.baseUrl, token)
            api.getRuntimeConfig()
                .onSuccess { _runtimeConfig.value = it }
                .onFailure { _runtimeConfig.value = null }
        }
    }

    suspend fun updateRuntimeConfig(
        responseProfile: ResponseProfile? = null,
        responseVerbosity: ResponseVerbosity? = null
    ): Result<RuntimeConfig> {
        val gateway = _activeGateway.value ?: return Result.failure(IllegalStateException("No active gateway"))
        val token = getToken(gateway.id) ?: return Result.failure(IllegalStateException("No token for active gateway"))

        return withContext(Dispatchers.IO) {
            val api = ApiService(gateway.baseUrl, token)
            api.updateRuntimeConfig(responseProfile, responseVerbosity)
                .onSuccess { _runtimeConfig.value = it }
        }
    }
}
