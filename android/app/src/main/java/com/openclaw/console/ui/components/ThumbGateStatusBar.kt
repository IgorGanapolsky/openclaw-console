package com.openclaw.console.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerialName
import kotlinx.serialization.json.Json
import java.io.File
import java.io.IOException

/**
 * ThumbGate v1.0 status bar showing thumbs up/down from ~/.openclaw/thumbgate.json
 */
@Composable
fun ThumbGateStatusBar(modifier: Modifier = Modifier) {
    var thumbsData by remember { mutableStateOf<ThumbGateData?>(null) }
    var isLoading by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        thumbsData = loadThumbGateData()
        isLoading = false
    }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(
                color = MaterialTheme.colorScheme.surfaceVariant,
                shape = RoundedCornerShape(8.dp)
            )
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Text(
            text = "👍",
            fontSize = 12.sp
        )

        Text(
            text = "v1.0",
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
            color = MaterialTheme.colorScheme.onSurface
        )

        when {
            isLoading -> {
                CircularProgressIndicator(
                    modifier = Modifier.size(12.dp),
                    strokeWidth = 1.dp
                )
            }
            thumbsData != null -> {
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        text = "👍",
                        fontSize = 12.sp
                    )
                    Text(
                        text = "${thumbsData?.thumbsUp ?: 0}",
                        fontSize = 12.sp,
                        fontFamily = FontFamily.Monospace,
                        color = Color(0xFF4CAF50) // Green
                    )

                    Text(
                        text = "👎",
                        fontSize = 12.sp
                    )
                    Text(
                        text = "${thumbsData?.thumbsDown ?: 0}",
                        fontSize = 12.sp,
                        fontFamily = FontFamily.Monospace,
                        color = Color(0xFFF44336) // Red
                    )
                }
            }
            else -> {
                Text(
                    text = "No data",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        Spacer(modifier = Modifier.weight(1f))
    }
}

/**
 * Data structure for ThumbGate JSON file
 */
@Serializable
data class ThumbGateData(
    @SerialName("thumbs_up") val thumbsUp: Int,
    @SerialName("thumbs_down") val thumbsDown: Int
)

/**
 * Load ThumbGate data from ~/.openclaw/thumbgate.json
 */
private suspend fun loadThumbGateData(): ThumbGateData? = withContext(Dispatchers.IO) {
    try {
        val homeDirectory = System.getProperty("user.home") ?: return@withContext null
        val thumbGateFile = File(homeDirectory, ".openclaw/thumbgate.json")

        if (!thumbGateFile.exists()) {
            createDefaultThumbGateFile(thumbGateFile)
            return@withContext ThumbGateData(thumbsUp = 0, thumbsDown = 0)
        }

        val jsonContent = thumbGateFile.readText()
        Json.decodeFromString<ThumbGateData>(jsonContent)
    } catch (e: Exception) {
        // If reading fails, return default values
        ThumbGateData(thumbsUp = 0, thumbsDown = 0)
    }
}

/**
 * Create default ThumbGate file if it doesn't exist
 */
private fun createDefaultThumbGateFile(file: File) {
    try {
        file.parentFile?.mkdirs()
        val defaultData = ThumbGateData(thumbsUp = 0, thumbsDown = 0)
        val jsonContent = Json.encodeToString(ThumbGateData.serializer(), defaultData)
        file.writeText(jsonContent)
    } catch (e: IOException) {
        // Fail silently - will use default values
    }
}

@Preview
@Composable
fun ThumbGateStatusBarPreview() {
    ThumbGateStatusBar(
        modifier = Modifier.padding(16.dp)
    )
}