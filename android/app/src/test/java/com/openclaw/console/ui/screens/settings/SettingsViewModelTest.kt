package com.openclaw.console.ui.screens.settings

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SettingsViewModelTest {

    @Test
    fun `scanned setup code fills gateway fields and shows accepted message`() {
        val viewModel = SettingsViewModel()
        val setupCode =
            "eyJ1cmwiOiJ3c3M6Ly9pZ29ycy1tYWMtbWluaS50YWlsMTJhYTMzLnRzLm5ldCIsImJvb3RzdHJhcFRva2VuIjoic2V0dXAtdG9rZW4ifQ"

        viewModel.applyScannedPairingCode(setupCode)

        val state = viewModel.addGatewayUiState.value
        assertEquals("OpenClaw Gateway", state.name)
        assertEquals("https://igors-mac-mini.tail12aa33.ts.net", state.baseUrl)
        assertEquals("setup-token", state.token)
        assertEquals(setupCode, state.pairingCode)
        assertEquals("QR code accepted. Review the gateway details, then test and save.", state.pairingImportMessage)
        assertNull(state.error)
    }

    @Test
    fun `manual setup code fills gateway fields and shows accepted message`() {
        val viewModel = SettingsViewModel()
        val setupCode =
            "eyJ1cmwiOiJ3c3M6Ly9pZ29ycy1tYWMtbWluaS50YWlsMTJhYTMzLnRzLm5ldCIsImJvb3RzdHJhcFRva2VuIjoic2V0dXAtdG9rZW4ifQ"

        viewModel.onPairingCodeChange(setupCode)
        viewModel.applyPairingCode()

        val state = viewModel.addGatewayUiState.value
        assertEquals("OpenClaw Gateway", state.name)
        assertEquals("https://igors-mac-mini.tail12aa33.ts.net", state.baseUrl)
        assertEquals("setup-token", state.token)
        assertEquals("Setup code accepted. Review the gateway details, then test and save.", state.pairingImportMessage)
        assertNull(state.error)
    }
}
