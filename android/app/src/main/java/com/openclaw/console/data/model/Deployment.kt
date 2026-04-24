package com.openclaw.console.data.model

import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.TypeConverter
import androidx.room.TypeConverters
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import java.time.Instant
import java.util.*

// MARK: - Deployment Status

enum class DeploymentStatus(val value: String) {
    PENDING("pending"),
    RUNNING("running"),
    COMPLETED("completed"),
    FAILED("failed"),
    CANCELLED("cancelled");

    val displayName: String
        get() = when (this) {
            PENDING -> "Pending"
            RUNNING -> "Running"
            COMPLETED -> "Completed"
            FAILED -> "Failed"
            CANCELLED -> "Cancelled"
        }

    val isComplete: Boolean
        get() = when (this) {
            COMPLETED, FAILED, CANCELLED -> true
            PENDING, RUNNING -> false
        }

    companion object {
        fun fromValue(value: String): DeploymentStatus =
            entries.find { it.value == value } ?: PENDING
    }
}

// MARK: - Deployment Environment

enum class DeploymentEnvironment(val value: String) {
    STAGING("staging"),
    PRODUCTION("production");

    val displayName: String
        get() = when (this) {
            STAGING -> "Staging"
            PRODUCTION -> "Production"
        }

    val requiresApproval: Boolean
        get() = when (this) {
            STAGING -> false
            PRODUCTION -> true
        }

    companion object {
        fun fromValue(value: String): DeploymentEnvironment =
            entries.find { it.value == value } ?: STAGING
    }
}

// MARK: - Deployment Platform

enum class DeploymentPlatform(val value: String) {
    IOS("ios"),
    ANDROID("android"),
    BOTH("both");

    val displayName: String
        get() = when (this) {
            IOS -> "iOS"
            ANDROID -> "Android"
            BOTH -> "iOS & Android"
        }

    companion object {
        fun fromValue(value: String): DeploymentPlatform =
            entries.find { it.value == value } ?: BOTH
    }
}

// MARK: - Deployment Artifact

data class DeploymentArtifact(
    val id: String,
    val name: String,
    val platform: DeploymentPlatform,
    val version: String,
    val buildNumber: String,
    val size: Long,
    val downloadURL: String?,
    val createdAt: Instant
) {
    fun getFormattedSize(): String {
        return android.text.format.Formatter.formatFileSize(
            // Context would be needed here - for now return raw bytes
            null, size
        ) ?: "${size} bytes"
    }
}

// MARK: - Deployment Step

data class DeploymentStep(
    val id: String,
    val deploymentId: String,
    val name: String,
    val description: String,
    val status: DeploymentStatus,
    val startedAt: Instant?,
    val completedAt: Instant?,
    val error: String?,
    val logs: List<String>
) {
    val duration: Long?
        get() = if (startedAt != null && completedAt != null) {
            completedAt.toEpochMilli() - startedAt.toEpochMilli()
        } else null
}

// MARK: - Deployment

@Entity(tableName = "deployments")
@TypeConverters(DeploymentTypeConverters::class)
data class Deployment(
    @PrimaryKey val id: String,
    val agentId: String,
    val title: String,
    val description: String,
    val environment: DeploymentEnvironment,
    val platform: DeploymentPlatform,
    val status: DeploymentStatus,
    val branch: String,
    val commit: String,
    val commitMessage: String,
    val triggeredBy: String,
    val createdAt: Instant,
    val startedAt: Instant?,
    val completedAt: Instant?,
    val steps: List<DeploymentStep>,
    val artifacts: List<DeploymentArtifact>,
    val approvalId: String?
) {
    val duration: Long?
        get() = if (startedAt != null && completedAt != null) {
            completedAt.toEpochMilli() - startedAt.toEpochMilli()
        } else null

    val shortCommit: String
        get() = commit.take(8)

    val requiresApproval: Boolean
        get() = environment.requiresApproval

    val canCancel: Boolean
        get() = status == DeploymentStatus.PENDING || status == DeploymentStatus.RUNNING
}

// MARK: - Deployment Request

data class DeploymentRequest(
    val environment: DeploymentEnvironment,
    val platform: DeploymentPlatform,
    val branch: String,
    val description: String?
)

// MARK: - WebSocket Payloads

data class DeploymentUpdate(
    val id: String,
    val agentId: String,
    val status: DeploymentStatus,
    val updatedAt: Instant
)

data class DeploymentStepUpdate(
    val id: String,
    val deploymentId: String,
    val status: DeploymentStatus,
    val startedAt: Instant?,
    val completedAt: Instant?,
    val error: String?,
    val logs: List<String>
)

// MARK: - Type Converters for Room

class DeploymentTypeConverters {
    private val gson = Gson()

    @TypeConverter
    fun fromDeploymentStatus(status: DeploymentStatus): String = status.value

    @TypeConverter
    fun toDeploymentStatus(value: String): DeploymentStatus = DeploymentStatus.fromValue(value)

    @TypeConverter
    fun fromDeploymentEnvironment(env: DeploymentEnvironment): String = env.value

    @TypeConverter
    fun toDeploymentEnvironment(value: String): DeploymentEnvironment =
        DeploymentEnvironment.fromValue(value)

    @TypeConverter
    fun fromDeploymentPlatform(platform: DeploymentPlatform): String = platform.value

    @TypeConverter
    fun toDeploymentPlatform(value: String): DeploymentPlatform =
        DeploymentPlatform.fromValue(value)

    @TypeConverter
    fun fromInstant(instant: Instant?): Long? = instant?.toEpochMilli()

    @TypeConverter
    fun toInstant(timestamp: Long?): Instant? = timestamp?.let { Instant.ofEpochMilli(it) }

    @TypeConverter
    fun fromDeploymentStepList(steps: List<DeploymentStep>): String = gson.toJson(steps)

    @TypeConverter
    fun toDeploymentStepList(json: String): List<DeploymentStep> {
        val type = object : TypeToken<List<DeploymentStep>>() {}.type
        return gson.fromJson(json, type) ?: emptyList()
    }

    @TypeConverter
    fun fromDeploymentArtifactList(artifacts: List<DeploymentArtifact>): String =
        gson.toJson(artifacts)

    @TypeConverter
    fun toDeploymentArtifactList(json: String): List<DeploymentArtifact> {
        val type = object : TypeToken<List<DeploymentArtifact>>() {}.type
        return gson.fromJson(json, type) ?: emptyList()
    }

    @TypeConverter
    fun fromStringList(list: List<String>): String = gson.toJson(list)

    @TypeConverter
    fun toStringList(json: String): List<String> {
        val type = object : TypeToken<List<String>>() {}.type
        return gson.fromJson(json, type) ?: emptyList()
    }
}