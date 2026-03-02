package com.openclaw.console.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.platform.LocalContext

private val LightColorScheme = lightColorScheme(
    primary = Primary40,
    onPrimary = Primary100,
    primaryContainer = Primary90,
    onPrimaryContainer = Primary10,
    secondary = Secondary40,
    onSecondary = Primary100,
    secondaryContainer = Secondary90,
    onSecondaryContainer = Primary10,
    tertiary = Tertiary40,
    onTertiary = Primary100,
    tertiaryContainer = Tertiary90,
    onTertiaryContainer = Primary10,
    error = Error40,
    onError = Primary100,
    errorContainer = Error90,
    onErrorContainer = Error10,
    background = Neutral99,
    onBackground = Neutral10,
    surface = Neutral99,
    onSurface = Neutral10,
    surfaceVariant = NeutralVariant90,
    onSurfaceVariant = NeutralVariant30,
    outline = NeutralVariant50,
    outlineVariant = NeutralVariant80
)

private val DarkColorScheme = darkColorScheme(
    primary = Primary80,
    onPrimary = Primary20,
    primaryContainer = Primary30,
    onPrimaryContainer = Primary90,
    secondary = Secondary80,
    onSecondary = Primary10,
    secondaryContainer = Primary20,
    onSecondaryContainer = Secondary90,
    tertiary = Tertiary80,
    onTertiary = Primary10,
    tertiaryContainer = Tertiary40,
    onTertiaryContainer = Tertiary90,
    error = Error80,
    onError = Error10,
    errorContainer = Error40,
    onErrorContainer = Error90,
    background = SurfaceDark,
    onBackground = Neutral90,
    surface = SurfaceDark,
    onSurface = Neutral90,
    surfaceVariant = SurfaceVariantDark,
    onSurfaceVariant = NeutralVariant80,
    outline = NeutralVariant60,
    outlineVariant = NeutralVariant30
)

data class OpenClawColors(
    val statusOnline: androidx.compose.ui.graphics.Color,
    val statusOffline: androidx.compose.ui.graphics.Color,
    val statusBusy: androidx.compose.ui.graphics.Color,
    val severityCritical: androidx.compose.ui.graphics.Color,
    val severityCriticalContainer: androidx.compose.ui.graphics.Color,
    val severityWarning: androidx.compose.ui.graphics.Color,
    val severityWarningContainer: androidx.compose.ui.graphics.Color,
    val severityInfo: androidx.compose.ui.graphics.Color,
    val severityInfoContainer: androidx.compose.ui.graphics.Color
)

val LocalOpenClawColors = staticCompositionLocalOf {
    OpenClawColors(
        statusOnline = StatusOnline,
        statusOffline = StatusOffline,
        statusBusy = StatusBusy,
        severityCritical = SeverityCritical,
        severityCriticalContainer = SeverityCriticalContainer,
        severityWarning = SeverityWarning,
        severityWarningContainer = SeverityWarningContainer,
        severityInfo = SeverityInfo,
        severityInfoContainer = SeverityInfoContainer
    )
}

@Composable
fun OpenClawTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = true,
    content: @Composable () -> Unit
) {
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }
        darkTheme -> DarkColorScheme
        else -> LightColorScheme
    }

    CompositionLocalProvider(LocalOpenClawColors provides LocalOpenClawColors.current) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = AppTypography,
            content = content
        )
    }
}
