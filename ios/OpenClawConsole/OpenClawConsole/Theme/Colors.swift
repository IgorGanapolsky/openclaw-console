// Theme/Colors.swift
// OpenClaw Work Console
// Color system matching Android Material 3 theme for platform parity

import SwiftUI

// MARK: - Primary Brand Colors

extension Color {
    // Primary brand - deep indigo/blue for professional tool aesthetic
    static let primary10 = Color(red: 0/255, green: 21/255, blue: 89/255) // #001559
    static let primary20 = Color(red: 0/255, green: 42/255, blue: 138/255) // #002A8A
    static let primary30 = Color(red: 0/255, green: 64/255, blue: 190/255) // #0040BE
    static let primary40 = Color(red: 23/255, green: 86/255, blue: 216/255) // #1756D8
    static let primary80 = Color(red: 179/255, green: 197/255, blue: 255/255) // #B3C5FF
    static let primary90 = Color(red: 221/255, green: 226/255, blue: 255/255) // #DDE2FF
    static let primary95 = Color(red: 238/255, green: 240/255, blue: 255/255) // #EEF0FF
    static let primary99 = Color(red: 253/255, green: 251/255, blue: 255/255) // #FDFBFF
    static let primary100 = Color.white // #FFFFFF

    // Secondary - slate/gray for supporting elements
    static let secondary40 = Color(red: 85/255, green: 95/255, blue: 113/255) // #555F71
    static let secondary80 = Color(red: 187/255, green: 199/255, blue: 219/255) // #BBC7DB
    static let secondary90 = Color(red: 215/255, green: 227/255, blue: 248/255) // #D7E3F8

    // Tertiary - teal accent for status indicators
    static let tertiary40 = Color(red: 0/255, green: 104/255, blue: 116/255) // #006874
    static let tertiary80 = Color(red: 130/255, green: 211/255, blue: 224/255) // #82D3E0
    static let tertiary90 = Color(red: 157/255, green: 238/255, blue: 251/255) // #9DEEFB

    // Error - semantic red
    static let error10 = Color(red: 65/255, green: 0/255, blue: 2/255) // #410002
    static let error40 = Color(red: 186/255, green: 26/255, blue: 26/255) // #BA1A1A
    static let error80 = Color(red: 255/255, green: 180/255, blue: 171/255) // #FFB4AB
    static let error90 = Color(red: 255/255, green: 218/255, blue: 214/255) // #FFDAG6

    // Neutral
    static let neutral10 = Color(red: 27/255, green: 27/255, blue: 31/255) // #1B1B1F
    static let neutral20 = Color(red: 48/255, green: 48/255, blue: 52/255) // #303034
    static let neutral90 = Color(red: 228/255, green: 226/255, blue: 230/255) // #E4E2E6
    static let neutral95 = Color(red: 242/255, green: 240/255, blue: 244/255) // #F2F0F4
    static let neutral99 = Color(red: 253/255, green: 251/255, blue: 255/255) // #FDFBFF

    // NeutralVariant
    static let neutralVariant30 = Color(red: 68/255, green: 70/255, blue: 79/255) // #44464F
    static let neutralVariant50 = Color(red: 116/255, green: 119/255, blue: 127/255) // #74777F
    static let neutralVariant60 = Color(red: 142/255, green: 144/255, blue: 153/255) // #8E9099
    static let neutralVariant80 = Color(red: 196/255, green: 198/255, blue: 208/255) // #C4C6D0
    static let neutralVariant90 = Color(red: 224/255, green: 226/255, blue: 236/255) // #E0E2EC
}

// MARK: - OpenClaw Semantic Colors

extension Color {
    // Severity colors - matching Android exactly
    static let severityCritical = Color(red: 179/255, green: 38/255, blue: 30/255) // #B3261E
    static let severityCriticalContainer = Color(red: 249/255, green: 222/255, blue: 220/255) // #F9DEDC
    static let severityWarning = Color(red: 233/255, green: 124/255, blue: 0/255) // #E97C00
    static let severityWarningContainer = Color(red: 255/255, green: 221/255, blue: 179/255) // #FFDDB3
    static let severityInfo = Color(red: 21/255, green: 101/255, blue: 192/255) // #1565C0
    static let severityInfoContainer = Color(red: 187/255, green: 222/255, blue: 251/255) // #BBDEFB

    // Status colors - matching Android exactly
    static let statusOnline = Color(red: 27/255, green: 138/255, blue: 59/255) // #1B8A3B
    static let statusOffline = Color(red: 119/255, green: 119/255, blue: 119/255) // #777777
    static let statusBusy = Color(red: 233/255, green: 124/255, blue: 0/255) // #E97C00

    // Dark surface colors
    static let surfaceDark = Color(red: 20/255, green: 20/255, blue: 22/255) // #141416
    static let surfaceVariantDark = Color(red: 30/255, green: 30/255, blue: 34/255) // #1E1E22
}

// MARK: - Theme-Aware Color Scheme

struct OpenClawColorScheme {
    // Light theme colors
    static let light = OpenClawColorScheme(
        primary: .primary40,
        onPrimary: .primary100,
        primaryContainer: .primary90,
        onPrimaryContainer: .primary10,
        secondary: .secondary40,
        onSecondary: .primary100,
        secondaryContainer: .secondary90,
        onSecondaryContainer: .primary10,
        tertiary: .tertiary40,
        onTertiary: .primary100,
        tertiaryContainer: .tertiary90,
        onTertiaryContainer: .primary10,
        error: .error40,
        onError: .primary100,
        errorContainer: .error90,
        onErrorContainer: .error10,
        background: .neutral99,
        onBackground: .neutral10,
        surface: .neutral99,
        onSurface: .neutral10,
        surfaceVariant: .neutralVariant90,
        onSurfaceVariant: .neutralVariant30,
        outline: .neutralVariant50,
        outlineVariant: .neutralVariant80,
        // OpenClaw semantic colors
        statusOnline: .statusOnline,
        statusOffline: .statusOffline,
        statusBusy: .statusBusy,
        severityCritical: .severityCritical,
        severityCriticalContainer: .severityCriticalContainer,
        severityWarning: .severityWarning,
        severityWarningContainer: .severityWarningContainer,
        severityInfo: .severityInfo,
        severityInfoContainer: .severityInfoContainer
    )

    // Dark theme colors
    static let dark = OpenClawColorScheme(
        primary: .primary80,
        onPrimary: .primary20,
        primaryContainer: .primary30,
        onPrimaryContainer: .primary90,
        secondary: .secondary80,
        onSecondary: .primary10,
        secondaryContainer: .primary20,
        onSecondaryContainer: .secondary90,
        tertiary: .tertiary80,
        onTertiary: .primary10,
        tertiaryContainer: .tertiary40,
        onTertiaryContainer: .tertiary90,
        error: .error80,
        onError: .error10,
        errorContainer: .error40,
        onErrorContainer: .error90,
        background: .surfaceDark,
        onBackground: .neutral90,
        surface: .surfaceDark,
        onSurface: .neutral90,
        surfaceVariant: .surfaceVariantDark,
        onSurfaceVariant: .neutralVariant80,
        outline: .neutralVariant60,
        outlineVariant: .neutralVariant30,
        // OpenClaw semantic colors (same in dark)
        statusOnline: .statusOnline,
        statusOffline: .statusOffline,
        statusBusy: .statusBusy,
        severityCritical: .severityCritical,
        severityCriticalContainer: .severityCriticalContainer,
        severityWarning: .severityWarning,
        severityWarningContainer: .severityWarningContainer,
        severityInfo: .severityInfo,
        severityInfoContainer: .severityInfoContainer
    )

    // Color properties
    let primary: Color
    let onPrimary: Color
    let primaryContainer: Color
    let onPrimaryContainer: Color
    let secondary: Color
    let onSecondary: Color
    let secondaryContainer: Color
    let onSecondaryContainer: Color
    let tertiary: Color
    let onTertiary: Color
    let tertiaryContainer: Color
    let onTertiaryContainer: Color
    let error: Color
    let onError: Color
    let errorContainer: Color
    let onErrorContainer: Color
    let background: Color
    let onBackground: Color
    let surface: Color
    let onSurface: Color
    let surfaceVariant: Color
    let onSurfaceVariant: Color
    let outline: Color
    let outlineVariant: Color

    // OpenClaw semantic colors
    let statusOnline: Color
    let statusOffline: Color
    let statusBusy: Color
    let severityCritical: Color
    let severityCriticalContainer: Color
    let severityWarning: Color
    let severityWarningContainer: Color
    let severityInfo: Color
    let severityInfoContainer: Color
}
