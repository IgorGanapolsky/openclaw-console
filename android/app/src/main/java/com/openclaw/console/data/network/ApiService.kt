package com.openclaw.console.data.network

import com.openclaw.console.data.model.*
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.logging.HttpLoggingInterceptor
import java.io.IOException
import java.util.concurrent.TimeUnit

private val json = Json {
    ignoreUnknownKeys = true
    coerceInputValues = true
}

class ApiService(
    private val baseUrl: String,
    private val token: String
) {
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .addInterceptor { chain ->
            val request = chain.request().newBuilder()
                .addHeader("Authorization", "Bearer $token")
                .addHeader("Content-Type", "application/json")
                .addHeader("Accept", "application/json")
                .build()
            chain.proceed(request)
        }
        .addInterceptor(HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
        })
        .build()

    private fun normalizedBase(): String = baseUrl.trimEnd('/')

    private suspend fun <T> executeRequest(
        request: Request,
        deserialize: (String) -> T
    ): Result<T> = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
        try {
            val response = client.newCall(request).execute()
            val body = response.body?.string() ?: ""
            if (response.isSuccessful) {
                Result.success(deserialize(body))
            } else {
                Result.failure(IOException("HTTP ${response.code}: $body"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun healthCheck(): Result<Boolean> {
        val request = Request.Builder()
            .url("${normalizedBase()}/api/health")
            .get()
            .build()
        return executeRequest(request) { true }
    }

    suspend fun getAgents(): Result<List<Agent>> {
        val request = Request.Builder()
            .url("${normalizedBase()}/api/agents")
            .get()
            .build()
        return executeRequest(request) { body ->
            json.decodeFromString<List<Agent>>(body)
        }
    }

    suspend fun getAgent(agentId: String): Result<Agent> {
        val request = Request.Builder()
            .url("${normalizedBase()}/api/agents/$agentId")
            .get()
            .build()
        return executeRequest(request) { body ->
            json.decodeFromString<Agent>(body)
        }
    }

    suspend fun getAgentTasks(agentId: String): Result<List<Task>> {
        val request = Request.Builder()
            .url("${normalizedBase()}/api/agents/$agentId/tasks")
            .get()
            .build()
        return executeRequest(request) { body ->
            json.decodeFromString<List<Task>>(body)
        }
    }

    suspend fun getTaskDetail(agentId: String, taskId: String): Result<Task> {
        val request = Request.Builder()
            .url("${normalizedBase()}/api/agents/$agentId/tasks/$taskId")
            .get()
            .build()
        return executeRequest(request) { body ->
            json.decodeFromString<Task>(body)
        }
    }

    suspend fun getIncidents(): Result<List<Incident>> {
        val request = Request.Builder()
            .url("${normalizedBase()}/api/incidents")
            .get()
            .build()
        return executeRequest(request) { body ->
            json.decodeFromString<List<Incident>>(body)
        }
    }

    suspend fun getPendingApprovals(): Result<List<ApprovalRequest>> {
        val request = Request.Builder()
            .url("${normalizedBase()}/api/approvals/pending")
            .get()
            .build()
        return executeRequest(request) { body ->
            json.decodeFromString<List<ApprovalRequest>>(body)
        }
    }

    suspend fun getBridges(): Result<List<BridgeSession>> {
        val request = Request.Builder()
            .url("${normalizedBase()}/api/bridges")
            .get()
            .build()
        return executeRequest(request) { body ->
            json.decodeFromString<List<BridgeSession>>(body)
        }
    }

    suspend fun respondToApproval(approvalId: String, response: ApprovalResponse): Result<Unit> {
        val jsonBody = json.encodeToString(response)
        val requestBody = jsonBody.toRequestBody("application/json".toMediaType())
        val request = Request.Builder()
            .url("${normalizedBase()}/api/approvals/$approvalId/respond")
            .post(requestBody)
            .build()
        return executeRequest(request) { }
    }

    suspend fun sendChatMessage(agentId: String, message: String, taskId: String? = null): Result<ChatMessage> {
        val payload = buildString {
            append("{\"message\":\"${message.replace("\"", "\\\"")}\"")
            if (taskId != null) append(",\"task_id\":\"$taskId\"")
            append("}")
        }
        val requestBody = payload.toRequestBody("application/json".toMediaType())
        val request = Request.Builder()
            .url("${normalizedBase()}/api/agents/$agentId/chat")
            .post(requestBody)
            .build()
        return executeRequest(request) { body ->
            json.decodeFromString<ChatMessage>(body)
        }
    }
}
