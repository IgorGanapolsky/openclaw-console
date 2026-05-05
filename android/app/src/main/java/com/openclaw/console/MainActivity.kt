package com.openclaw.console

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.core.view.WindowCompat
import com.openclaw.console.ui.AppViewModel
import com.openclaw.console.ui.navigation.NavGraph
import com.openclaw.console.ui.theme.OpenClawTheme

class MainActivity : ComponentActivity() {

    private val appViewModel: AppViewModel by viewModels {
        AppViewModel.factory(application)
    }
    private var pendingPairingLink by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        pendingPairingLink = intent?.dataString
        enableEdgeToEdge()
        WindowCompat.setDecorFitsSystemWindows(window, false)

        setContent {
            OpenClawTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    NavGraph(
                        appViewModel = appViewModel,
                        pendingPairingLink = pendingPairingLink,
                        onPairingLinkConsumed = { pendingPairingLink = null }
                    )
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        pendingPairingLink = intent.dataString
    }
}
