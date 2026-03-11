package com.openclaw.console.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.openclaw.console.data.model.*
import com.openclaw.console.ui.theme.LocalOpenClawColors
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

@Composable
fun StatusDot(
    status: AgentStatus,
    modifier: Modifier = Modifier,
    size: Int = 10
) {
    val colors = LocalOpenClawColors.current
    val color = when (status) {
        AgentStatus.ONLINE -> colors.statusOnline
        AgentStatus.OFFLINE -> colors.statusOffline
        AgentStatus.BUSY -> colors.statusBusy
    }
    Surface(
        modifier = modifier
            .size(size.dp)
            .clip(CircleShape),
        color = color
    ) {}
}

@Composable
fun SeverityBadge(severity: IncidentSeverity, modifier: Modifier = Modifier) {
    val colors = LocalOpenClawColors.current
    val (text, color, containerColor) = when (severity) {
        IncidentSeverity.CRITICAL -> Triple("CRITICAL", colors.severityCritical, colors.severityCriticalContainer)
        IncidentSeverity.WARNING -> Triple("WARNING", colors.severityWarning, colors.severityWarningContainer)
        IncidentSeverity.INFO -> Triple("INFO", colors.severityInfo, colors.severityInfoContainer)
    }
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(4.dp),
        color = containerColor
    ) {
        Text(
            text = text,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
            color = color,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold
        )
    }
}

@Composable
fun SeverityIcon(severity: IncidentSeverity, modifier: Modifier = Modifier) {
    val colors = LocalOpenClawColors.current
    val (icon, color) = when (severity) {
        IncidentSeverity.CRITICAL -> Icons.Default.Error to colors.severityCritical
        IncidentSeverity.WARNING -> Icons.Default.Warning to colors.severityWarning
        IncidentSeverity.INFO -> Icons.Default.Info to colors.severityInfo
    }
    Icon(
        imageVector = icon,
        contentDescription = severity.name,
        tint = color,
        modifier = modifier
    )
}

@Composable
fun TimeAgoText(
    isoTimestamp: String,
    modifier: Modifier = Modifier,
    style: androidx.compose.ui.text.TextStyle = MaterialTheme.typography.bodySmall,
    color: Color = MaterialTheme.colorScheme.onSurfaceVariant
) {
    val timeAgo = remember(isoTimestamp) { formatTimeAgo(isoTimestamp) }
    Text(text = timeAgo, modifier = modifier, style = style, color = color)
}

fun formatTimeAgo(isoTimestamp: String): String {
    return try {
        val then = Instant.parse(isoTimestamp)
        val now = Instant.now()
        val diffSeconds = ChronoUnit.SECONDS.between(then, now)
        when {
            diffSeconds < 60 -> "just now"
            diffSeconds < 3600 -> "${diffSeconds / 60}m ago"
            diffSeconds < 86400 -> "${diffSeconds / 3600}h ago"
            diffSeconds < 604800 -> "${diffSeconds / 86400}d ago"
            else -> DateTimeFormatter.ofPattern("MMM d")
                .withZone(ZoneId.systemDefault())
                .format(then)
        }
    } catch (e: Exception) {
        isoTimestamp.take(10)
    }
}

@Composable
fun ResourceLinkChip(
    link: ResourceLink,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val icon = when (link.type) {
        ResourceLinkType.GITHUB_PR -> Icons.Default.MergeType
        ResourceLinkType.GITHUB_RUN -> Icons.Default.PlayCircle
        ResourceLinkType.DASHBOARD -> Icons.Default.Dashboard
        ResourceLinkType.EXTERNAL -> Icons.Default.OpenInNew
    }
    AssistChip(
        modifier = modifier,
        onClick = {
            try {
                val intent = android.content.Intent(
                    android.content.Intent.ACTION_VIEW,
                    android.net.Uri.parse(link.url)
                )
                context.startActivity(intent)
            } catch (e: Exception) { /* ignore */ }
        },
        label = { Text(link.label, maxLines = 1) },
        leadingIcon = {
            Icon(icon, contentDescription = null, modifier = Modifier.size(16.dp))
        }
    )
}

@Composable
fun ApprovalBanner(
    count: Int,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    if (count <= 0) return
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.errorContainer,
        onClick = onClick
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Icon(
                Icons.Default.Warning,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onErrorContainer,
                modifier = Modifier.size(20.dp)
            )
            Text(
                text = "$count approval${if (count > 1) "s" else ""} awaiting your decision",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onErrorContainer,
                modifier = Modifier.weight(1f)
            )
            Icon(
                Icons.Default.ChevronRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onErrorContainer
            )
        }
    }
}

@Composable
fun TaskStatusBadge(status: TaskStatus, modifier: Modifier = Modifier) {
    val (text, color) = when (status) {
        TaskStatus.QUEUED -> "QUEUED" to MaterialTheme.colorScheme.onSurfaceVariant
        TaskStatus.RUNNING -> "RUNNING" to MaterialTheme.colorScheme.primary
        TaskStatus.DONE -> "DONE" to Color(0xFF1B8A3B)
        TaskStatus.FAILED -> "FAILED" to MaterialTheme.colorScheme.error
    }
    val containerColor = when (status) {
        TaskStatus.QUEUED -> MaterialTheme.colorScheme.surfaceVariant
        TaskStatus.RUNNING -> MaterialTheme.colorScheme.primaryContainer
        TaskStatus.DONE -> Color(0xFFD6F5DF)
        TaskStatus.FAILED -> MaterialTheme.colorScheme.errorContainer
    }
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(4.dp),
        color = containerColor
    ) {
        Text(
            text = text,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
            color = color,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold
        )
    }
}

@Composable
fun EmptyState(
    title: String,
    subtitle: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier.fillMaxWidth().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(48.dp)
        )
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface
        )
        Text(
            text = subtitle,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
fun ConnectionStatusBanner(
    state: com.openclaw.console.data.network.ConnectionState,
    modifier: Modifier = Modifier
) {
    val (message, color) = when (state) {
        com.openclaw.console.data.network.ConnectionState.CONNECTED -> return
        com.openclaw.console.data.network.ConnectionState.CONNECTING ->
            "Connecting..." to MaterialTheme.colorScheme.primaryContainer
        com.openclaw.console.data.network.ConnectionState.RECONNECTING ->
            "Reconnecting..." to MaterialTheme.colorScheme.tertiaryContainer
        com.openclaw.console.data.network.ConnectionState.DISCONNECTED ->
            "Disconnected - Go to Settings to connect" to MaterialTheme.colorScheme.errorContainer
    }
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = color
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            if (state == com.openclaw.console.data.network.ConnectionState.CONNECTING ||
                state == com.openclaw.console.data.network.ConnectionState.RECONNECTING) {
                CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp)
            } else {
                Icon(Icons.Default.CloudOff, contentDescription = null, modifier = Modifier.size(16.dp))
            }
            Text(
                text = message,
                style = MaterialTheme.typography.bodySmall
            )
        }
    }
}
