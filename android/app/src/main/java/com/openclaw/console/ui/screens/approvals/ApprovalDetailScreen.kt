package com.openclaw.console.ui.screens.approvals

import androidx.compose.material3.pulltorefresh.PullToRefreshBox

import androidx.lifecycle.compose.collectAsStateWithLifecycle

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.viewmodel.compose.viewModel
import com.openclaw.console.data.model.ActionType
import com.openclaw.console.data.model.ApprovalDecision
import com.openclaw.console.data.model.RiskLevel
import com.openclaw.console.service.BiometricHelper
import com.openclaw.console.service.BiometricResult
import com.openclaw.console.ui.AppViewModel
import com.openclaw.console.ui.components.TimeAgoText
import com.openclaw.console.ui.theme.LocalOpenClawColors
import com.openclaw.console.ui.theme.MonospaceStyle
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.Duration
import java.time.Instant

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ApprovalDetailScreen(
    approvalId: String,
    appViewModel: AppViewModel,
    onBack: () -> Unit,
    viewModel: ApprovalViewModel = viewModel()
) {
    val approvalRepo by appViewModel.approvalRepository.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    LaunchedEffect(approvalId, approvalRepo) {
        viewModel.init(approvalId, approvalRepo)
    }

    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    // Biometric trigger
    LaunchedEffect(uiState.screenState) {
        if (uiState.screenState == ApprovalScreenState.BIOMETRIC_PROMPT) {
            val activity = context as? FragmentActivity
            if (activity == null) {
                viewModel.onBiometricCancelled()
                return@LaunchedEffect
            }
            val decision = uiState.pendingDecision ?: ApprovalDecision.DENIED
            val title = if (decision == ApprovalDecision.APPROVED) "Confirm Approval" else "Confirm Denial"
            val subtitle = if (decision == ApprovalDecision.APPROVED)
                "Biometric required to approve this action"
            else
                "Confirm you want to deny this request"

            when (BiometricHelper.authenticate(activity, title = title, subtitle = subtitle)) {
                BiometricResult.Success -> viewModel.onBiometricSuccess()
                BiometricResult.UserCancelled -> viewModel.onBiometricCancelled()
                is BiometricResult.Error -> viewModel.onBiometricCancelled()
                BiometricResult.NotAvailable -> {
                    // Fall through - no biometric available, still allow action
                    viewModel.onBiometricSuccess()
                }
            }
        }
    }

    // Auto-navigate back on success
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
                    modifier = Modifier.fillMaxSize().padding(paddingValues),
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
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(paddingValues)
                            .verticalScroll(rememberScrollState()),
                        verticalArrangement = Arrangement.spacedBy(0.dp)
                    ) {
                        // Risk warning card
                        RiskWarningCard(riskLevel = approval.context.riskLevel)

                        // Action type chip
                        Row(
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            ActionTypeChip(actionType = approval.actionType)
                            Text(
                                text = approval.agentName,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }

                        // Title + Description
                        Column(
                            modifier = Modifier.padding(horizontal = 16.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Text(
                                text = approval.title,
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.SemiBold
                            )
                            Text(
                                text = approval.description,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }

                        Spacer(modifier = Modifier.height(16.dp))

                        // Command card
                        if (approval.command.isNotEmpty()) {
                            Column(
                                modifier = Modifier.padding(horizontal = 16.dp),
                                verticalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                Text(
                                    text = "Command",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                Surface(
                                    modifier = Modifier.fillMaxWidth(),
                                    shape = MaterialTheme.shapes.medium,
                                    color = MaterialTheme.colorScheme.surfaceVariant
                                ) {
                                    Text(
                                        text = approval.command,
                                        modifier = Modifier.padding(12.dp),
                                        style = MonospaceStyle,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(16.dp))

                        // Context info
                        ContextInfoSection(approval = approval)

                        Spacer(modifier = Modifier.height(16.dp))

                        // Expiry countdown
                        ExpiryCountdown(expiresAt = approval.expiresAt)

                        Spacer(modifier = Modifier.height(24.dp))

                        // Error display
                        uiState.error?.let { error ->
                            Card(
                                modifier = Modifier.padding(horizontal = 16.dp),
                                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)
                            ) {
                                Text(
                                    text = error,
                                    modifier = Modifier.padding(12.dp),
                                    color = MaterialTheme.colorScheme.onErrorContainer
                                )
                            }
                            Spacer(modifier = Modifier.height(8.dp))
                        }

                        // Action buttons
                        val isProcessing = uiState.screenState == ApprovalScreenState.PROCESSING ||
                                uiState.screenState == ApprovalScreenState.BIOMETRIC_PROMPT

                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp)
                                .navigationBarsPadding(),
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            // Deny button
                            OutlinedButton(
                                onClick = { viewModel.onDecide(ApprovalDecision.DENIED) },
                                modifier = Modifier.weight(1f).height(52.dp),
                                enabled = !isProcessing,
                                colors = ButtonDefaults.outlinedButtonColors(
                                    contentColor = MaterialTheme.colorScheme.error
                                )
                            ) {
                                Icon(
                                    Icons.Default.Close,
                                    contentDescription = null,
                                    modifier = Modifier.size(20.dp)
                                )
                                Spacer(Modifier.width(8.dp))
                                Text("Deny", fontWeight = FontWeight.Medium)
                            }

                            // Approve button
                            Button(
                                onClick = { viewModel.onDecide(ApprovalDecision.APPROVED) },
                                modifier = Modifier.weight(1f).height(52.dp),
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
                                    Icon(
                                        Icons.Default.Fingerprint,
                                        contentDescription = null,
                                        modifier = Modifier.size(20.dp)
                                    )
                                    Spacer(Modifier.width(8.dp))
                                    Text("Approve", fontWeight = FontWeight.Medium)
                                }
                            }
                        }
                        Spacer(modifier = Modifier.height(24.dp))
                    }
                } ?: run {
                    Box(
                        modifier = Modifier.fillMaxSize().padding(paddingValues),
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
private fun RiskWarningCard(riskLevel: RiskLevel) {
    val (bgColor, icon, label) = when (riskLevel) {
        RiskLevel.CRITICAL -> Triple(
            Color(0xFFB3261E), Icons.Default.Dangerous, "CRITICAL RISK"
        )
        RiskLevel.HIGH -> Triple(
            Color(0xFFE97C00), Icons.Default.Warning, "HIGH RISK"
        )
    }
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = bgColor
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
            Text(
                text = label,
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Bold,
                color = Color.White
            )
            Spacer(modifier = Modifier.weight(1f))
            Text(
                text = "Biometric required",
                style = MaterialTheme.typography.labelSmall,
                color = Color.White.copy(alpha = 0.8f)
            )
        }
    }
}

@Composable
private fun ActionTypeChip(actionType: ActionType) {
    val (label, color) = when (actionType) {
        ActionType.DEPLOY -> "Deploy" to MaterialTheme.colorScheme.primary
        ActionType.SHELL_COMMAND -> "Shell Command" to MaterialTheme.colorScheme.error
        ActionType.CONFIG_CHANGE -> "Config Change" to Color(0xFFE97C00)
        ActionType.KEY_ROTATION -> "Key Rotation" to Color(0xFF7B1FA2)
        ActionType.TRADE_EXECUTION -> "Trade Execution" to Color(0xFF1565C0)
        ActionType.DESTRUCTIVE -> "Destructive" to MaterialTheme.colorScheme.error
    }
    SuggestionChip(
        onClick = {},
        label = { Text(label, style = MaterialTheme.typography.labelMedium, color = color) }
    )
}

@Composable
private fun ContextInfoSection(approval: com.openclaw.console.data.model.ApprovalRequest) {
    Column(
        modifier = Modifier.padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Text("Context", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
        ) {
            Column(
                modifier = Modifier.padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
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
}

@Composable
private fun ContextRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodySmall)
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
            } catch (e: Exception) {
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
        modifier = Modifier.padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            if (isExpired) Icons.Default.TimerOff else Icons.Default.Timer,
            contentDescription = null,
            tint = color,
            modifier = Modifier.size(16.dp)
        )
        Text(
            text = if (isExpired) "Expired" else {
                val minutes = remainingSeconds / 60
                val seconds = remainingSeconds % 60
                "Expires in ${if (minutes > 0) "${minutes}m " else ""}${seconds}s"
            },
            style = MaterialTheme.typography.bodySmall,
            color = color
        )
    }
}
