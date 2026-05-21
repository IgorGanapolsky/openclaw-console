package com.openclaw.console.ui.screens.onboarding

import androidx.compose.animation.*
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
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.openclaw.console.ui.components.OpenClawSetupWizard
import com.openclaw.console.ui.components.GatewayQRCodeDisplay
import com.openclaw.console.ui.theme.LocalOpenClawColors
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.saveable.rememberSaveable
import com.openclaw.console.data.model.GatewayConnection
import com.openclaw.console.data.model.GatewayPairing
import com.openclaw.console.ui.AppViewModel

data class SetupWizardState(
    val currentStep: Int = 0,
    val completedSteps: Set<String> = emptySet(),
    val isGatewayConnected: Boolean = false,
    val gatewayUrl: String = "",
    val isBiometricEnabled: Boolean = false
)

private val SetupWizardStateSaver = listSaver<SetupWizardState, Any>(
    save = { state ->
        listOf(
            state.currentStep,
            state.completedSteps.toList(),
            state.isGatewayConnected,
            state.gatewayUrl,
            state.isBiometricEnabled
        )
    },
    restore = { list ->
        SetupWizardState(
            currentStep = list[0] as Int,
            completedSteps = (list[1] as List<String>).toSet(),
            isGatewayConnected = list[2] as Boolean,
            gatewayUrl = list[3] as String,
            isBiometricEnabled = list[4] as Boolean
        )
    }
)

@Composable
fun SetupWizardScreen(
    appViewModel: AppViewModel,
    onNavigateToScanner: () -> Unit,
    onSetupComplete: (String) -> Unit,
    onBack: () -> Unit,
    scannedPairingCode: String? = null,
    onScannedPairingCodeConsumed: () -> Unit = {}
) {
    val scrollState = rememberScrollState()
    val clipboardManager = LocalClipboardManager.current
    val openClaw = LocalOpenClawColors.current

    var wizardState by rememberSaveable(saver = SetupWizardStateSaver) {
        mutableStateOf(SetupWizardState())
    }
    var showQRGenerator by rememberSaveable { mutableStateOf(false) }
    var qrGeneratorUrl by rememberSaveable { mutableStateOf("") }

    val gatewayRepo = appViewModel.gatewayRepository
    var isConnecting by rememberSaveable { mutableStateOf(false) }
    var connectionError by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        if (isConnecting && scannedPairingCode.isNullOrBlank()) {
            isConnecting = false
        }
    }

    LaunchedEffect(scannedPairingCode) {
        val code = scannedPairingCode?.takeIf { it.isNotBlank() } ?: return@LaunchedEffect
        connectionError = null
        isConnecting = true
        GatewayPairing.parse(code)
            .onSuccess { pairing ->
                gatewayRepo.testConnection(pairing.baseUrl, pairing.token)
                    .onSuccess {
                        val newGateway = GatewayConnection(
                            name = pairing.name,
                            baseUrl = pairing.baseUrl
                        )
                        gatewayRepo.saveGateway(newGateway, pairing.token)
                        gatewayRepo.setActiveGateway(newGateway.id)
                        
                        wizardState = wizardState.copy(
                            currentStep = 3,
                            completedSteps = wizardState.completedSteps + "connect",
                            isGatewayConnected = true,
                            gatewayUrl = pairing.baseUrl
                        )
                        isConnecting = false
                        onScannedPairingCodeConsumed()
                    }
                    .onFailure { error ->
                        connectionError = "Connection failed: ${error.message}"
                        isConnecting = false
                        onScannedPairingCodeConsumed()
                    }
            }
            .onFailure { error ->
                connectionError = "Invalid QR code: ${error.message}"
                isConnecting = false
                onScannedPairingCodeConsumed()
            }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(16.dp)
    ) {
        // Header
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth()
        ) {
            IconButton(onClick = onBack) {
                Icon(
                    imageVector = Icons.Default.ArrowBack,
                    contentDescription = "Back"
                )
            }
            Text(
                text = "OpenClaw Setup",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold
            )
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Setup wizard progress
        OpenClawSetupWizard(
            currentStep = wizardState.currentStep,
            completedSteps = wizardState.completedSteps,
            onStepClick = { stepIndex ->
                wizardState = wizardState.copy(currentStep = stepIndex)
            }
        )

        Spacer(modifier = Modifier.height(24.dp))

        // Step content
        AnimatedContent(
            targetState = wizardState.currentStep
        ) { step ->
            when (step) {
                0 -> InstallStep(
                    clipboardManager = clipboardManager,
                    onNext = {
                        wizardState = wizardState.copy(
                            currentStep = 1,
                            completedSteps = wizardState.completedSteps + "install"
                        )
                    }
                )
                1 -> GatewayStep(
                    clipboardManager = clipboardManager,
                    onNext = {
                        wizardState = wizardState.copy(
                            currentStep = 2,
                            completedSteps = wizardState.completedSteps + "gateway"
                        )
                    }
                )
                2 -> ConnectStep(
                    onNavigateToScanner = onNavigateToScanner,
                    showQRGenerator = showQRGenerator,
                    qrGeneratorUrl = qrGeneratorUrl,
                    onShowQRGenerator = { showQRGenerator = !showQRGenerator },
                    onQRUrlChange = { qrGeneratorUrl = it },
                    onConnectionSuccess = { url ->
                        wizardState = wizardState.copy(
                            currentStep = 3,
                            completedSteps = wizardState.completedSteps + "connect",
                            isGatewayConnected = true,
                            gatewayUrl = url
                        )
                    },
                    isConnecting = isConnecting,
                    connectionError = connectionError
                )
                3 -> BiometricStep(
                    onNext = {
                        wizardState = wizardState.copy(
                            currentStep = 4,
                            completedSteps = wizardState.completedSteps + "biometric",
                            isBiometricEnabled = true
                        )
                    }
                )
                4 -> CompleteStep(
                    gatewayUrl = wizardState.gatewayUrl,
                    onComplete = { onSetupComplete(wizardState.gatewayUrl) }
                )
            }
        }
    }
}

@Composable
private fun InstallStep(
    clipboardManager: androidx.compose.ui.platform.ClipboardManager,
    onNext: () -> Unit
) {
    StepCard(
        title = "Install OpenClaw CLI",
        icon = Icons.Default.Computer
    ) {
        Text(
            text = "First, install OpenClaw on your computer:",
            style = MaterialTheme.typography.bodyLarge,
            modifier = Modifier.padding(bottom = 16.dp)
        )

        CommandCard(
            title = "macOS/Linux:",
            command = "curl -fsSL https://raw.githubusercontent.com/openclaw/install/main/install.sh | bash",
            onCopy = { clipboardManager.setText(AnnotatedString(it)) }
        )

        Spacer(modifier = Modifier.height(12.dp))

        CommandCard(
            title = "Windows (PowerShell as Admin):",
            command = "iwr -useb https://raw.githubusercontent.com/openclaw/install/main/install.ps1 | iex",
            onCopy = { clipboardManager.setText(AnnotatedString(it)) }
        )

        Spacer(modifier = Modifier.height(24.dp))

        Button(
            onClick = onNext,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp)
        ) {
            Icon(imageVector = Icons.Default.ArrowForward, contentDescription = null)
            Spacer(modifier = Modifier.width(8.dp))
            Text("I've installed OpenClaw")
        }
    }
}

@Composable
private fun GatewayStep(
    clipboardManager: androidx.compose.ui.platform.ClipboardManager,
    onNext: () -> Unit
) {
    StepCard(
        title = "Start OpenClaw Gateway",
        icon = Icons.Default.Router
    ) {
        Text(
            text = "Run this command on your computer to start the gateway:",
            style = MaterialTheme.typography.bodyLarge,
            modifier = Modifier.padding(bottom = 16.dp)
        )

        CommandCard(
            title = "Terminal Command:",
            command = "openclaw qr --remote",
            onCopy = { clipboardManager.setText(AnnotatedString(it)) },
            isHighlighted = true
        )

        Spacer(modifier = Modifier.height(16.dp))

        InfoBox(
            icon = Icons.Default.Info,
            text = "This will start the gateway on http://localhost:18789 and display a QR code for easy pairing."
        )

        Spacer(modifier = Modifier.height(24.dp))

        Button(
            onClick = onNext,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp)
        ) {
            Icon(imageVector = Icons.Default.ArrowForward, contentDescription = null)
            Spacer(modifier = Modifier.width(8.dp))
            Text("Gateway is running")
        }
    }
}

@Composable
private fun ConnectStep(
    onNavigateToScanner: () -> Unit,
    showQRGenerator: Boolean,
    qrGeneratorUrl: String,
    onShowQRGenerator: () -> Unit,
    onQRUrlChange: (String) -> Unit,
    onConnectionSuccess: (String) -> Unit,
    isConnecting: Boolean = false,
    connectionError: String? = null
) {
    StepCard(
        title = "Connect Mobile App",
        icon = Icons.Default.QrCodeScanner
    ) {
        Text(
            text = "Now connect this mobile app to your gateway:",
            style = MaterialTheme.typography.bodyLarge,
            modifier = Modifier.padding(bottom = 16.dp)
        )

        if (isConnecting) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 16.dp),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator()
            }
        } else {
            Button(
                onClick = onNavigateToScanner,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp)
            ) {
                Icon(imageVector = Icons.Default.QrCodeScanner, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Scan QR Code")
            }
        }

        connectionError?.let { error ->
            Spacer(modifier = Modifier.height(8.dp))
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Default.Error,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onErrorContainer,
                        modifier = Modifier.size(18.dp)
                    )
                    Text(
                        text = error,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onErrorContainer,
                        modifier = Modifier.weight(1f)
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        OutlinedButton(
            onClick = onShowQRGenerator,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp)
        ) {
            Icon(imageVector = Icons.Default.QrCode, contentDescription = null)
            Spacer(modifier = Modifier.width(8.dp))
            Text("Generate QR Code")
        }

        if (showQRGenerator) {
            Spacer(modifier = Modifier.height(16.dp))

            OutlinedTextField(
                value = qrGeneratorUrl,
                onValueChange = onQRUrlChange,
                placeholder = { Text("http://your-machine-ip:18789") },
                label = { Text("Gateway URL") },
                modifier = Modifier.fillMaxWidth()
            )

            if (qrGeneratorUrl.isNotBlank()) {
                Spacer(modifier = Modifier.height(16.dp))

                GatewayQRCodeDisplay(
                    gatewayUrl = qrGeneratorUrl,
                    size = 150.dp,
                    modifier = Modifier.align(Alignment.CenterHorizontally)
                )

                Spacer(modifier = Modifier.height(16.dp))

                Button(
                    onClick = { onConnectionSuccess(qrGeneratorUrl) },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Use This URL")
                }
            }
        }
    }
}

@Composable
private fun BiometricStep(
    onNext: () -> Unit
) {
    StepCard(
        title = "Enable Biometric Security",
        icon = Icons.Default.Security
    ) {
        Text(
            text = "For maximum security, enable biometric authentication for all approval requests:",
            style = MaterialTheme.typography.bodyLarge,
            modifier = Modifier.padding(bottom = 16.dp)
        )

        InfoBox(
            icon = Icons.Default.Fingerprint,
            text = "OpenClaw uses Face ID, Touch ID, or Fingerprint to secure all dangerous agent actions."
        )

        Spacer(modifier = Modifier.height(24.dp))

        Button(
            onClick = onNext,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp)
        ) {
            Icon(imageVector = Icons.Default.Security, contentDescription = null)
            Spacer(modifier = Modifier.width(8.dp))
            Text("Enable Biometric Security")
        }

        Spacer(modifier = Modifier.height(12.dp))

        OutlinedButton(
            onClick = onNext,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp)
        ) {
            Text("Skip for Now")
        }
    }
}

@Composable
private fun CompleteStep(
    gatewayUrl: String,
    onComplete: () -> Unit
) {
    StepCard(
        title = "Setup Complete!",
        icon = Icons.Default.Celebration
    ) {
        Text(
            text = "🎉 Congratulations! Your OpenClaw Console is ready to use.",
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 16.dp)
        )

        InfoBox(
            icon = Icons.Default.CheckCircle,
            text = "You can now approve agent actions securely from your mobile device. Keep the app running in the background for instant notifications."
        )

        Spacer(modifier = Modifier.height(24.dp))

        Button(
            onClick = onComplete,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp)
        ) {
            Icon(imageVector = Icons.Default.Celebration, contentDescription = null)
            Spacer(modifier = Modifier.width(8.dp))
            Text("Start Using OpenClaw Console")
        }
    }
}

@Composable
private fun StepCard(
    title: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    content: @Composable ColumnScope.() -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 6.dp)
    ) {
        Column(
            modifier = Modifier.padding(24.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(bottom = 16.dp)
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(32.dp)
                )
                Spacer(modifier = Modifier.width(12.dp))
                Text(
                    text = title,
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold
                )
            }

            content()
        }
    }
}

@Composable
private fun CommandCard(
    title: String,
    command: String,
    onCopy: (String) -> Unit,
    isHighlighted: Boolean = false
) {
    val backgroundColor = if (isHighlighted) {
        MaterialTheme.colorScheme.primaryContainer
    } else {
        MaterialTheme.colorScheme.surfaceVariant
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = backgroundColor),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(modifier = Modifier.height(8.dp))

            Row(
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = command,
                    style = MaterialTheme.typography.bodyMedium,
                    fontFamily = FontFamily.Monospace,
                    modifier = Modifier.weight(1f)
                )
                IconButton(onClick = { onCopy(command) }) {
                    Icon(
                        imageVector = Icons.Default.ContentCopy,
                        contentDescription = "Copy command",
                        modifier = Modifier.size(20.dp)
                    )
                }
            }
        }
    }
}

@Composable
private fun InfoBox(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    text: String
) {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f)
        )
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(20.dp)
            )
            Spacer(modifier = Modifier.width(12.dp))
            Text(
                text = text,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface
            )
        }
    }
}