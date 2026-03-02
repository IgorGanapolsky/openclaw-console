// swift-tools-version: 5.9
// Package.swift
// OpenClaw Work Console – Swift Package definition.
// This is a standalone package manifest that can be opened in Xcode 15+.
// For a traditional .xcodeproj, create a new Xcode project and add these sources.

import PackageDescription

let package = Package(
    name: "OpenClawConsole",
    platforms: [
        .iOS(.v17)
    ],
    products: [
        .executable(name: "OpenClawConsole", targets: ["OpenClawConsole"])
    ],
    dependencies: [
        // No external dependencies – uses only Apple frameworks:
        // Foundation, SwiftUI, Combine, Security, LocalAuthentication, UserNotifications
    ],
    targets: [
        .executableTarget(
            name: "OpenClawConsole",
            path: "OpenClawConsole",
            resources: [
                // Info.plist managed by Xcode-SPM integration
            ]
        )
    ]
)
