package com.openclaw.console.ui.screens.approvals

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Code
import androidx.compose.material.icons.filled.Dangerous
import androidx.compose.material.icons.filled.DeleteForever
import androidx.compose.material.icons.filled.Fingerprint
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material.icons.filled.TimerOff
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.filled.VpnKey
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.openclaw.console.data.model.ActionType
import com.openclaw.console.data.model.ApprovalDecision
import com.openclaw.console.data.model.ApprovalRequest
import com.openclaw.console.data.model.RiskLevel
import com.openclaw.console.service.BiometricHelper
import com.openclaw.console.service.BiometricResult
import com.openclaw.console.ui.AppViewModel
import com.openclaw.console.ui.theme.MonospaceStyle
import kotlinx.coroutines.delay
import java.time.Duration
import java.time.Instant

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun ApprovalDetailScreen(
    approvalId: String,
    appViewModel: AppViewModel,
    onBack: () -> Unit,
    viewModel: ApprovalViewModel = viewModel()
) {
    val approvalRepo by appViewModel.approvalRepository.collectAsStateWithLifecycle()
    val context = LocalContext.current

    LaunchedEffect(approvalId, approvalRepo) {
        viewModel.init(approvalId, approvalRepo)
    }

    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    LaunchedEffect(uiState.screenState) {
        if (uiState.screenState == ApprovalScreenState.BIOMETRIC_PROMPT) {
            val activity = context as? FragmentActivity
            if (activity == null) {
                viewModel.onBiometricCancelled()
                return@LaunchedEffect
            }

            val decision = uiState.pendingDecision ?: ApprovalDecision.DENIED
            val title = if (decision == ApprovalDecision.APPROVED) {
                "Confirm Approval"
            } else {
                "Confirm Denial"
            }
            val subtitle = if (decision == ApprovalDecision.APPROVED) {
                "Biometric required to approve this action"
            } else {
                "Confirm you want to deny this request"
            }

            when (val result = BiometricHelper.authenticate(activity, title = title, subtitle = subtitle)) {
                BiometricResult.Success -> viewModel.onBiometricSuccess()
                BiometricResult.UserCancelled -> viewModel.onBiometricCancelled()
                BiometricResult.Lockout -> {
                    viewModel.onError("Too many failed attempts. Please use your device PIN or wait a moment.")
                    viewModel.onBiometricCancelled()
                }
                is BiometricResult.Error -> {
                    viewModel.onError("Verification failed: ${result.message}")
                    viewModel.onBiometricCancelled()
                }
                BiometricResult.NotAvailable -> viewModel.onBiometricSuccess()
            }
        }
    }

    LaunchedEffect(uiState.screenState) {
        if (uiState.screenState == ApprovalScreenState.SUCCESS) {
            delay(1000)
            onBack()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Approval Request") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { paddingValues ->
        when (uiState.screenState) {
            ApprovalScreenState.SUCCESS -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Icon(
                            Icons.Default.CheckCircle,
                            contentDescription = null,
                            tint = Color(0xFF1B8A3B),
                            modifier = Modifier.size(56.dp)
                        )
                        Text("Response submitted", style = MaterialTheme.typography.titleMedium)
                    }
                }
            }

            else -> {
                uiState.approval?.let { approval ->
                    ApprovalDetailContent(
                        approval = approval,
                        error = uiState.error,
                        screenState = uiState.screenState,
                        onApprove = { viewModel.onDecide(ApprovalDecision.APPROVED) },
                        onDeny = { viewModel.onDecide(ApprovalDecision.DENIED) },
                        modifier = Modifier.padding(paddingValues)
                    )
                } ?: run {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(paddingValues),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            "Approval not found or already responded",
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ApprovalDetailContent(
    approval: ApprovalRequest,
    error: String?,
    screenState: ApprovalScreenState,
    onApprove: () -> Unit,
    onDeny: () -> Unit,
    modifier: Modifier = Modifier
) {
    val isProcessing = screenState == ApprovalScreenState.PROCESSING ||
        screenState == ApprovalScreenState.BIOMETRIC_PROMPT

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        RiskWarningCard(
            riskLevel = approval.context.riskLevel,
            agentName = approval.agentName
        )

        ActionTypeBadge(actionType = approval.actionType)

        DetailSection(title = "Description") {
            Text(
                text = approval.title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold
            )
            SelectionContainer {
                Text(
                    text = approval.description,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        if (approval.command.isNotEmpty()) {
            DetailSection(title = "Command to Execute") {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    shape = RoundedCornerShape(8.dp)
                ) {
                    SelectionContainer {
                        Text(
                            text = approval.command,
                            modifier = Modifier.padding(12.dp),
                            style = MonospaceStyle,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }

        ContextInfoSection(approval = approval)

        HorizontalDivider()

        ExpiryCountdown(expiresAt = approval.expiresAt)

        error?.let { message ->
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.errorContainer
                )
            ) {
                Text(
                    text = message,
                    modifier = Modifier.padding(12.dp),
                    color = MaterialTheme.colorScheme.onErrorContainer
                )
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            OutlinedButton(
                onClick = onDeny,
                modifier = Modifier
                    .weight(1f)
                    .height(52.dp),
                enabled = !isProcessing,
                colors = ButtonDefaults.outlinedButtonColors(
                    contentColor = MaterialTheme.colorScheme.error
                )
            ) {
                Icon(Icons.Default.Close, contentDescription = null, modifier = Modifier.size(20.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text("Deny", fontWeight = FontWeight.Medium)
            }

            Button(
                onClick = onApprove,
                modifier = Modifier
                    .weight(1f)
                    .height(52.dp),
                enabled = !isProcessing,
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.primary
                )
            ) {
                if (isProcessing) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary
                    )
                } else {
                    Icon(Icons.Default.Fingerprint, contentDescription = null, modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Approve", fontWeight = FontWeight.Medium)
                }
            }
        }
    }
}

@Composable
private fun RiskWarningCard(riskLevel: RiskLevel, agentName: String) {
    val (backgroundColor, icon, label) = when (riskLevel) {
        RiskLevel.CRITICAL -> Triple(Color(0xFFB3261E), Icons.Default.Dangerous, "Critical Risk")
        RiskLevel.HIGH -> Triple(Color(0xFFE97C00), Icons.Default.Warning, "High Risk")
    }

    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = backgroundColor,
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.Top
        ) {
            Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(24.dp))
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    text = label,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = Color.White
                )
                Text(
                    text = "$agentName is requesting authorization",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White.copy(alpha = 0.92f)
                )
            }
        }
    }
}

@Composable
private fun ActionTypeBadge(actionType: ActionType) {
    val (label, icon) = when (actionType) {
        ActionType.DEPLOY -> "Deploy" to Icons.Default.PlayArrow
        ActionType.SHELL_COMMAND -> "Shell Command" to Icons.Default.Code
        ActionType.CONFIG_CHANGE -> "Config Change" to Icons.Default.Tune
        ActionType.KEY_ROTATION -> "Key Rotation" to Icons.Default.VpnKey
        ActionType.TRADE_EXECUTION -> "Trade Execution" to Icons.Default.TrendingUp
        ActionType.DESTRUCTIVE -> "Destructive" to Icons.Default.DeleteForever
    }
    val color = Color(0xFFE97C00)

    Surface(
        color = color.copy(alpha = 0.1f),
        shape = RoundedCornerShape(8.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(18.dp))
            Text(
                text = label,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                color = color
            )
        }
    }
}

@Composable
private fun ContextInfoSection(approval: ApprovalRequest) {
    DetailSection(title = "Context") {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (approval.context.service.isNotEmpty()) {
                ContextRow("Service", approval.context.service)
            }
            if (approval.context.environment.isNotEmpty()) {
                ContextRow("Environment", approval.context.environment)
            }
            if (approval.context.repository.isNotEmpty()) {
                ContextRow("Repository", approval.context.repository)
            }
        }
    }
}

@Composable
private fun ContextRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.width(90.dp)
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.weight(1f)
        )
    }
}

@Composable
private fun ExpiryCountdown(expiresAt: String) {
    var remainingSeconds by remember { mutableLongStateOf(0L) }

    LaunchedEffect(expiresAt) {
        while (true) {
            try {
                val expires = Instant.parse(expiresAt)
                val now = Instant.now()
                remainingSeconds = Duration.between(now, expires).seconds.coerceAtLeast(0)
            } catch (_: Exception) {
                remainingSeconds = 0
            }
            if (remainingSeconds <= 0) break
            delay(1000)
        }
    }

    val isExpired = remainingSeconds <= 0
    val color = when {
        isExpired -> MaterialTheme.colorScheme.error
        remainingSeconds < 60 -> MaterialTheme.colorScheme.error
        remainingSeconds < 300 -> Color(0xFFE97C00)
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = if (isExpired) Icons.Default.TimerOff else Icons.Default.Timer,
            contentDescription = null,
            tint = color,
            modifier = Modifier.size(16.dp)
        )
        Text(
            text = if (isExpired) {
                "Expired"
            } else {
                val minutes = remainingSeconds / 60
                val seconds = remainingSeconds % 60
                "Expires in ${if (minutes > 0) "${minutes}m " else ""}${seconds}s"
            },
            style = MaterialTheme.typography.bodySmall,
            color = color
        )
    }
}

@Composable
private fun DetailSection(
    title: String,
    content: @Composable ColumnScope.() -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            text = title,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        content()
    }
}
