package com.openclaw.console.ui.components

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Error
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.times
import com.openclaw.console.util.QRCodeGenerator
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@Composable
fun QRCodeDisplay(
    content: String,
    size: Dp = 200.dp,
    modifier: Modifier = Modifier,
    backgroundColor: Color = Color.White,
    cornerRadius: Dp = 12.dp
) {
    val density = LocalDensity.current
    val sizeInPx = with(density) { size.roundToPx() }

    var qrBitmap by remember(content, sizeInPx) { mutableStateOf<Bitmap?>(null) }
    var isLoading by remember(content) { mutableStateOf(true) }

    LaunchedEffect(content, sizeInPx) {
        isLoading = true
        qrBitmap = withContext(Dispatchers.IO) {
            try {
                QRCodeGenerator.generateQRCode(content, sizeInPx)
            } catch (e: Exception) {
                null
            }
        }
        isLoading = false
    }

    Box(
        modifier = modifier
            .size(size)
            .background(backgroundColor, RoundedCornerShape(cornerRadius))
            .clip(RoundedCornerShape(cornerRadius)),
        contentAlignment = Alignment.Center
    ) {
        when {
            isLoading -> {
                CircularProgressIndicator(
                    modifier = Modifier.size(size / 4),
                    color = MaterialTheme.colorScheme.primary
                )
            }
            qrBitmap != null -> {
                Image(
                    bitmap = qrBitmap!!.asImageBitmap(), // allow-nonnull
                    contentDescription = "QR Code: $content",
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(8.dp)
                )
            }
            else -> {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Icon(
                        imageVector = androidx.compose.material.icons.Icons.Default.Error,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.error,
                        modifier = Modifier.size(32.dp)
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "QR generation failed",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error
                    )
                }
            }
        }
    }
}

@Composable
fun GatewayQRCodeDisplay(
    gatewayUrl: String,
    size: Dp = 200.dp,
    modifier: Modifier = Modifier
) {
    QRCodeDisplay(
        content = gatewayUrl,
        size = size,
        modifier = modifier,
        backgroundColor = Color.White
    )
}