// Services/BiometricService.swift
// OpenClaw Work Console
// Face ID / Touch ID authentication using LocalAuthentication framework.
// Required for approval responses per security spec.

import Foundation
import LocalAuthentication
import Observation

// MARK: - Biometric Error

enum BiometricError: LocalizedError {
    case notAvailable
    case notEnrolled
    case authFailed(String)
    case cancelled

    var errorDescription: String? {
        switch self {
        case .notAvailable:
            return "Biometric authentication is not available on this device."
        case .notEnrolled:
            return "No biometrics are enrolled. Please set up Face ID or Touch ID in Settings."
        case .authFailed(let reason):
            return "Authentication failed: \(reason)"
        case .cancelled:
            return "Authentication was cancelled."
        }
    }
}

// MARK: - Biometric Type

enum BiometricType {
    case none
    case touchID
    case faceID
    case opticID  // Vision Pro

    var displayName: String {
        switch self {
        case .none: return "None"
        case .touchID: return "Touch ID"
        case .faceID: return "Face ID"
        case .opticID: return "Optic ID"
        }
    }

    var systemImage: String {
        switch self {
        case .none: return "lock"
        case .touchID: return "touchid"
        case .faceID: return "faceid"
        case .opticID: return "opticid"
        }
    }
}

// MARK: - BiometricService

@Observable
final class BiometricService {

    static let shared = BiometricService()
    private init() {}

    // MARK: Availability

    var isAvailable: Bool {
        let context = LAContext()
        var error: NSError?
        return context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
    }

    var biometricType: BiometricType {
        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
            return .none
        }
        switch context.biometryType {
        case .faceID: return .faceID
        case .touchID: return .touchID
        case .opticID: return .opticID
        case .none: return .none
        @unknown default: return .none
        }
    }

    // MARK: Authenticate

    /// Attempts biometric authentication. Returns `true` on success.
    /// Throws `BiometricError` on failure.
    func authenticate(reason: String) async throws -> Bool {
        let context = LAContext()
        context.localizedCancelTitle = "Cancel"

        var canError: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics,
                                        error: &canError) else {
            if let err = canError {
                switch err.code {
                case LAError.biometryNotEnrolled.rawValue,
                     LAError.passcodeNotSet.rawValue:
                    throw BiometricError.notEnrolled
                default:
                    throw BiometricError.notAvailable
                }
            }
            throw BiometricError.notAvailable
        }

        do {
            let success = try await context.evaluatePolicy(
                .deviceOwnerAuthenticationWithBiometrics,
                localizedReason: reason
            )
            return success
        } catch let error as LAError {
            switch error.code {
            case .userCancel, .appCancel, .systemCancel:
                throw BiometricError.cancelled
            case .biometryNotEnrolled:
                throw BiometricError.notEnrolled
            case .biometryNotAvailable:
                throw BiometricError.notAvailable
            default:
                throw BiometricError.authFailed(error.localizedDescription)
            }
        } catch {
            throw BiometricError.authFailed(error.localizedDescription)
        }
    }
}
