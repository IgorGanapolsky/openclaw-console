package com.openclaw.console.data.repository

import com.openclaw.console.data.model.*
import com.openclaw.console.data.network.ApiService
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.Json
import kotlinx.serialization.encodeToString
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.IOException

private val json = Json {
    ignoreUnknownKeys = true
    coerceInputValues = true
}

/**
 * Repository for Memory Gateway functionality - persistent context and feedback capture
 */
class MemoryGatewayRepository {

    private val _isEnabled = MutableStateFlow(false)
    val isEnabled: StateFlow<Boolean> = _isEnabled.asStateFlow()

    private val _lastError = MutableStateFlow<String?>(null)
    val lastError: StateFlow<String?> = _lastError.asStateFlow()

    private var currentApiService: ApiService? = null
    private var baseUrl: String? = null
    private var token: String? = null

    private val client: OkHttpClient = OkHttpClient.Builder()
        .addInterceptor { chain ->
            val request = chain.request().newBuilder()
                .addHeader("Authorization", "Bearer ${token ?: ""}")
                .addHeader("Content-Type", "application/json")
                .addHeader("Accept", "application/json")
                .build()
            chain.proceed(request)
        }
        .build()

    fun updateConfiguration(apiService: ApiService?, url: String?, authToken: String?) {
        currentApiService = apiService
        baseUrl = url?.trimEnd('/')
        token = authToken
        _isEnabled.value = apiService != null && url != null && authToken != null
        _lastError.value = null
    }

    private suspend fun <T> executeMemoryRequest(
        endpoint: String,
        method: String = "GET",
        body: String? = null,
        queryParams: Map<String, String> = emptyMap(),
        deserialize: (String) -> T
    ): Result<T> = withContext(Dispatchers.IO) {
        try {
            val normalizedBase = baseUrl ?: return@withContext Result.failure(
                IOException("No base URL configured")
            )

            val urlBuilder = "$normalizedBase/api/$endpoint".toHttpUrlOrNull()?.newBuilder()
                ?: return@withContext Result.failure(IOException("Invalid URL"))

            queryParams.forEach { (key, value) ->
                urlBuilder.addQueryParameter(key, value)
            }

            val requestBuilder = Request.Builder().url(urlBuilder.build())

            when (method.uppercase()) {
                "GET" -> requestBuilder.get()
                "POST" -> {
                    val requestBody = body?.toRequestBody("application/json".toMediaType())
                        ?: "{}".toRequestBody("application/json".toMediaType())
                    requestBuilder.post(requestBody)
                }
                else -> throw IllegalArgumentException("Unsupported HTTP method: $method")
            }

            val response = client.newCall(requestBuilder.build()).execute()
            val responseBody = response.body?.string() ?: ""

            if (response.isSuccessful) {
                Result.success(deserialize(responseBody))
            } else {
                Result.failure(IOException("HTTP ${response.code}: $responseBody"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Recall relevant context for a given situation
     */
    suspend fun recallContext(
        query: String,
        agentId: String? = null,
        taskType: String? = null,
        tags: List<String>? = null
    ): Result<MemoryContext> {
        if (!_isEnabled.value) {
            return Result.success(
                MemoryContext(
                    memories = emptyList(),
                    preventionRules = emptyList(),
                    recentSummary = "Memory gateway not configured"
                )
            )
        }

        val queryParams = buildMap {
            put("q", query)
            agentId?.let { put("agent_id", it) }
            taskType?.let { put("task_type", it) }
            tags?.takeIf { it.isNotEmpty() }?.let { put("tags", it.joinToString(",")) }
        }

        return executeMemoryRequest(
            endpoint = "memory/context",
            queryParams = queryParams
        ) { body ->
            json.decodeFromString<MemoryContext>(body)
        }
    }

    /**
     * Capture feedback about an agent action or task outcome
     */
    suspend fun captureFeedback(
        signal: String, // "up" or "down"
        context: String,
        agentId: String? = null,
        taskId: String? = null,
        incidentId: String? = null,
        tags: List<String>? = null,
        whatWentWrong: String? = null,
        whatWorked: String? = null
    ): Result<FeedbackResponse> {
        if (!_isEnabled.value) {
            return Result.success(FeedbackResponse(accepted = false, reason = "Memory gateway not enabled"))
        }

        val request = FeedbackRequest(
            signal = signal,
            context = context,
            agentId = agentId,
            taskId = taskId,
            incidentId = incidentId,
            tags = tags,
            whatWentWrong = whatWentWrong,
            whatWorked = whatWorked
        )

        val requestBody = json.encodeToString(request)

        return executeMemoryRequest(
            endpoint = "memory/feedback",
            method = "POST",
            body = requestBody
        ) { body ->
            json.decodeFromString<FeedbackResponse>(body)
        }
    }

    /**
     * Get memory usage and effectiveness statistics
     */
    suspend fun getStats(): Result<MemoryStats> {
        if (!_isEnabled.value) {
            return Result.success(
                MemoryStats(
                    totalMemories = 0,
                    positiveMemories = 0,
                    negativeMemories = 0,
                    recentTrend = "disabled"
                )
            )
        }

        return executeMemoryRequest(
            endpoint = "memory/stats"
        ) { body ->
            json.decodeFromString<MemoryStats>(body)
        }
    }

    /**
     * Auto-capture positive feedback when user approves an action
     */
    suspend fun captureApprovalFeedback(
        approval: ApprovalRequest,
        approved: Boolean
    ): Result<FeedbackResponse> {
        val signal = if (approved) "up" else "down"
        val context = if (approved) {
            "User approved: ${approval.title}"
        } else {
            "User rejected: ${approval.title}"
        }

        return captureFeedback(
            signal = signal,
            context = context,
            agentId = approval.agentId,
            tags = listOf("approval", "user-action"),
            whatWorked = if (approved) approval.description else null,
            whatWentWrong = if (approved) null else approval.description
        )
    }

    /**
     * Get contextual memories for an agent before starting work
     */
    suspend fun getAgentContext(
        agent: Agent,
        task: String? = null
    ): Result<MemoryContext> {
        val query = task ?: "Agent ${agent.name} starting work"
        return recallContext(
            query = query,
            agentId = agent.id,
            tags = listOf("agent-work")
        )
    }

    /**
     * Capture feedback when task completes
     */
    suspend fun captureTaskCompletion(
        task: Task,
        successful: Boolean,
        userNotes: String? = null
    ): Result<FeedbackResponse> {
        val signal = if (successful) "up" else "down"
        val context = if (successful) {
            "Task completed successfully: ${task.title}"
        } else {
            "Task failed: ${task.title}"
        }

        return captureFeedback(
            signal = signal,
            context = context,
            agentId = task.agentId,
            taskId = task.id,
            tags = listOf("task-completion"),
            whatWorked = if (successful) userNotes else null,
            whatWentWrong = if (successful) null else userNotes
        )
    }

    private fun setError(error: String?) {
        _lastError.value = error
    }

    fun clearError() {
        _lastError.value = null
    }
}