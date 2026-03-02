package com.openclaw.console.data.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable
data class WebSocketMessage(
    val type: String,
    val payload: JsonObject,
    val timestamp: String? = null
)
