// Theme/Typography.swift
// OpenClaw Work Console
// Typography system matching Android Material 3 type scale for platform parity

import SwiftUI

// MARK: - OpenClaw Typography Scale

struct OpenClawTypography {
    // MARK: - Display Styles
    static let displayLarge = Font.custom("SF Pro", size: 57)
        .weight(.regular)

    static let displayMedium = Font.custom("SF Pro", size: 45)
        .weight(.regular)

    static let displaySmall = Font.custom("SF Pro", size: 36)
        .weight(.regular)

    // MARK: - Headline Styles
    static let headlineLarge = Font.custom("SF Pro", size: 32)
        .weight(.semibold)

    static let headlineMedium = Font.custom("SF Pro", size: 28)
        .weight(.semibold)

    static let headlineSmall = Font.custom("SF Pro", size: 24)
        .weight(.semibold)

    // MARK: - Title Styles
    static let titleLarge = Font.custom("SF Pro", size: 22)
        .weight(.medium)

    static let titleMedium = Font.custom("SF Pro", size: 16)
        .weight(.medium)

    static let titleSmall = Font.custom("SF Pro", size: 14)
        .weight(.medium)

    // MARK: - Body Styles
    static let bodyLarge = Font.custom("SF Pro", size: 16)
        .weight(.regular)

    static let bodyMedium = Font.custom("SF Pro", size: 14)
        .weight(.regular)

    static let bodySmall = Font.custom("SF Pro", size: 12)
        .weight(.regular)

    // MARK: - Label Styles
    static let labelLarge = Font.custom("SF Pro", size: 14)
        .weight(.medium)

    static let labelMedium = Font.custom("SF Pro", size: 12)
        .weight(.medium)

    static let labelSmall = Font.custom("SF Pro", size: 11)
        .weight(.medium)

    // MARK: - Monospace (for terminal/code display)
    static let monospace = Font.custom("SF Mono", size: 13)
        .weight(.regular)

    static let monospaceSmall = Font.custom("SF Mono", size: 11)
        .weight(.regular)
}

// MARK: - Font Extension for Typography

extension Font {
    // MARK: - Display
    static let openClawDisplayLarge = OpenClawTypography.displayLarge
    static let openClawDisplayMedium = OpenClawTypography.displayMedium
    static let openClawDisplaySmall = OpenClawTypography.displaySmall

    // MARK: - Headline
    static let openClawHeadlineLarge = OpenClawTypography.headlineLarge
    static let openClawHeadlineMedium = OpenClawTypography.headlineMedium
    static let openClawHeadlineSmall = OpenClawTypography.headlineSmall

    // MARK: - Title
    static let openClawTitleLarge = OpenClawTypography.titleLarge
    static let openClawTitleMedium = OpenClawTypography.titleMedium
    static let openClawTitleSmall = OpenClawTypography.titleSmall

    // MARK: - Body
    static let openClawBodyLarge = OpenClawTypography.bodyLarge
    static let openClawBodyMedium = OpenClawTypography.bodyMedium
    static let openClawBodySmall = OpenClawTypography.bodySmall

    // MARK: - Label
    static let openClawLabelLarge = OpenClawTypography.labelLarge
    static let openClawLabelMedium = OpenClawTypography.labelMedium
    static let openClawLabelSmall = OpenClawTypography.labelSmall

    // MARK: - Monospace
    static let openClawMonospace = OpenClawTypography.monospace
    static let openClawMonospaceSmall = OpenClawTypography.monospaceSmall
}

// MARK: - Text Style Extensions

extension Text {
    // MARK: - Display Styles
    func displayLarge() -> some View {
        self.font(.openClawDisplayLarge)
    }

    func displayMedium() -> some View {
        self.font(.openClawDisplayMedium)
    }

    func displaySmall() -> some View {
        self.font(.openClawDisplaySmall)
    }

    // MARK: - Headline Styles
    func headlineLarge() -> some View {
        self.font(.openClawHeadlineLarge)
    }

    func headlineMedium() -> some View {
        self.font(.openClawHeadlineMedium)
    }

    func headlineSmall() -> some View {
        self.font(.openClawHeadlineSmall)
    }

    // MARK: - Title Styles
    func titleLarge() -> some View {
        self.font(.openClawTitleLarge)
    }

    func titleMedium() -> some View {
        self.font(.openClawTitleMedium)
    }

    func titleSmall() -> some View {
        self.font(.openClawTitleSmall)
    }

    // MARK: - Body Styles
    func bodyLarge() -> some View {
        self.font(.openClawBodyLarge)
    }

    func bodyMedium() -> some View {
        self.font(.openClawBodyMedium)
    }

    func bodySmall() -> some View {
        self.font(.openClawBodySmall)
    }

    // MARK: - Label Styles
    func labelLarge() -> some View {
        self.font(.openClawLabelLarge)
    }

    func labelMedium() -> some View {
        self.font(.openClawLabelMedium)
    }

    func labelSmall() -> some View {
        self.font(.openClawLabelSmall)
    }

    // MARK: - Monospace Styles
    func monospace() -> some View {
        self.font(.openClawMonospace)
    }

    func monospaceSmall() -> some View {
        self.font(.openClawMonospaceSmall)
    }
}