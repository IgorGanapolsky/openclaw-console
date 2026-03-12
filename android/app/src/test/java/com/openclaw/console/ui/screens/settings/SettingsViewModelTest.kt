package com.openclaw.console.ui.screens.settings

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SettingsViewModelTest {

    @Test
    fun importSetupLinkPopulatesGatewayFields() {
        val viewModel = SettingsViewModel()

        viewModel.onSetupLinkChange(
            "openclaw-console://connect?name=Production&url=https%3A%2F%2Fgateway.example.com&token=ocw_123"
        )
        viewModel.importSetupLink()

        val state = viewModel.addGatewayUiState.value
        assertEquals("Production", state.name)
        assertEquals("https://gateway.example.com", state.baseUrl)
        assertEquals("ocw_123", state.token)
        assertNull(state.error)
        assertEquals("Setup link imported. Review the details, then test and save.", state.importMessage)
        assertFalse(state.showHttpWarning)
    }

    @Test
    fun importSetupLinkUsesBaseUrlAliasAndFlagsHttpWarning() {
        val viewModel = SettingsViewModel()

        viewModel.importSetupLink(
            "openclaw://gateway/connect?name=Lab&baseUrl=http%3A%2F%2F192.168.1.20%3A18789%2F&token=ocw_456"
        )

        val state = viewModel.addGatewayUiState.value
        assertEquals("Lab", state.name)
        assertEquals("http://192.168.1.20:18789", state.baseUrl)
        assertEquals("ocw_456", state.token)
        assertTrue(state.showHttpWarning)
        assertEquals(
            "openclaw://gateway/connect?name=Lab&baseUrl=http%3A%2F%2F192.168.1.20%3A18789%2F&token=ocw_456",
            state.setupLink
        )
    }

    @Test
    fun importSetupLinkReportsMalformedGatewayUrl() {
        val viewModel = SettingsViewModel()

        viewModel.importSetupLink(
            "https://alphaclaw.app/connect?name=Prod&url=https%3A%2F%2F&token=ocw_123"
        )

        val state = viewModel.addGatewayUiState.value
        assertEquals("The setup link contains an invalid gateway URL.", state.error)
        assertEquals("", state.baseUrl)
        assertNull(state.importMessage)
    }

    @Test
    fun importSetupLinkRejectsGatewayUrlWithQueryString() {
        val viewModel = SettingsViewModel()

        viewModel.importSetupLink(
            "https://alphaclaw.app/connect?name=Prod&url=https%3A%2F%2Fgateway.example.com%3Ftenant%3Dfoo&token=ocw_123"
        )

        val state = viewModel.addGatewayUiState.value
        assertEquals("The setup link contains an invalid gateway URL.", state.error)
        assertEquals("", state.baseUrl)
        assertNull(state.importMessage)
    }

    @Test
    fun importSetupLinkReportsMissingToken() {
        val viewModel = SettingsViewModel()

        viewModel.onSetupLinkChange(
            "openclawconsole://connect?name=Production&url=https%3A%2F%2Fgateway.example.com"
        )
        viewModel.importSetupLink()

        val state = viewModel.addGatewayUiState.value
        assertEquals("The setup link is missing a token.", state.error)
        assertEquals("", state.token)
        assertNull(state.importMessage)
    }

    @Test
    fun importSetupLinkRequiresClipboardOrTypedLink() {
        val viewModel = SettingsViewModel()

        viewModel.importSetupLink()

        val state = viewModel.addGatewayUiState.value
        assertEquals("Copy a setup link first.", state.error)
        assertNull(state.importMessage)
    }
}
