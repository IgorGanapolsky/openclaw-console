// OpenClawConsoleTests/BiometricServiceTests.swift
// OpenClaw Work Console
// Tests for BiometricService: availability checks, authentication flow,
// biometric type detection, and error mapping.
// Uses a mock LAContext to avoid requiring real biometric hardware.

import XCTest
import LocalAuthentication
@testable import OpenClawConsole

// MARK: - LAContext Protocol for Testability

protocol LAContextProtocol {
    var biometryType: LABiometryType { get }
    func canEvaluatePolicy(_ policy: LAPolicy, error: NSErrorPointer) -> Bool
    func evaluatePolicy(_ policy: LAPolicy, localizedReason: String) async throws -> Bool
}

extension LAContext: LAContextProtocol {}

// MARK: - Mock LAContext

final class MockLAContext: LAContextProtocol {
    var mockBiometryType: LABiometryType = .faceID
    var canEvaluateResult: Bool = true
    var canEvaluateError: NSError?
    var evaluateResult: Bool = true
    var evaluateError: Error?
    var localizedCancelTitle: String?

    var biometryType: LABiometryType {
        return mockBiometryType
    }

    func canEvaluatePolicy(_ policy: LAPolicy, error: NSErrorPointer) -> Bool {
        if let err = canEvaluateError {
            error?.pointee = err
        }
        return canEvaluateResult
    }

    func evaluatePolicy(_ policy: LAPolicy, localizedReason: String) async throws -> Bool {
        if let error = evaluateError {
            throw error
        }
        return evaluateResult
    }
}

// MARK: - Testable BiometricService

/// A testable variant that accepts a LAContext factory for dependency injection.
final class TestableBiometricService {

    private let contextFactory: () -> LAContextProtocol

    init(contextFactory: @escaping () -> LAContextProtocol) {
        self.contextFactory = contextFactory
    }

    var isAvailable: Bool {
        let context = contextFactory()
        var error: NSError?
        return context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
    }

    var biometricType: BiometricType {
        let context = contextFactory()
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

    func authenticate(reason: String) async throws -> Bool {
        let context = contextFactory()

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

// MARK: - BiometricService Tests

final class BiometricServiceTests: XCTestCase {

    private var mockContext: MockLAContext!
    private var sut: TestableBiometricService!

    override func setUp() {
        super.setUp()
        mockContext = MockLAContext()
        sut = TestableBiometricService(contextFactory: { [unowned self] in self.mockContext })
    }

    override func tearDown() {
        mockContext = nil
        sut = nil
        super.tearDown()
    }

    // MARK: - Availability

    func testIsAvailableReturnsTrueWhenBiometricsSupported() {
        mockContext.canEvaluateResult = true
        XCTAssertTrue(sut.isAvailable)
    }

    func testIsAvailableReturnsFalseWhenBiometricsNotSupported() {
        mockContext.canEvaluateResult = false
        XCTAssertFalse(sut.isAvailable)
    }

    func testIsAvailableReturnsFalseWhenContextReportsError() {
        mockContext.canEvaluateResult = false
        mockContext.canEvaluateError = NSError(
            domain: LAError.errorDomain,
            code: LAError.biometryNotAvailable.rawValue,
            userInfo: nil
        )
        XCTAssertFalse(sut.isAvailable)
    }

    // MARK: - Biometric Type Detection

    func testBiometricTypeReturnsFaceID() {
        mockContext.canEvaluateResult = true
        mockContext.mockBiometryType = .faceID
        XCTAssertEqual(sut.biometricType, .faceID)
    }

    func testBiometricTypeReturnsTouchID() {
        mockContext.canEvaluateResult = true
        mockContext.mockBiometryType = .touchID
        XCTAssertEqual(sut.biometricType, .touchID)
    }

    func testBiometricTypeReturnsOpticID() {
        mockContext.canEvaluateResult = true
        mockContext.mockBiometryType = .opticID
        XCTAssertEqual(sut.biometricType, .opticID)
    }

    func testBiometricTypeReturnsNoneWhenUnavailable() {
        mockContext.canEvaluateResult = false
        XCTAssertEqual(sut.biometricType, .none)
    }

    func testBiometricTypeReturnsNoneForLABiometryNone() {
        mockContext.canEvaluateResult = true
        mockContext.mockBiometryType = .none
        XCTAssertEqual(sut.biometricType, .none)
    }

    // MARK: - BiometricType Display Properties

    func testBiometricTypeDisplayNames() {
        XCTAssertEqual(BiometricType.none.displayName, "None")
        XCTAssertEqual(BiometricType.touchID.displayName, "Touch ID")
        XCTAssertEqual(BiometricType.faceID.displayName, "Face ID")
        XCTAssertEqual(BiometricType.opticID.displayName, "Optic ID")
    }

    func testBiometricTypeSystemImages() {
        XCTAssertEqual(BiometricType.none.systemImage, "lock")
        XCTAssertEqual(BiometricType.touchID.systemImage, "touchid")
        XCTAssertEqual(BiometricType.faceID.systemImage, "faceid")
        XCTAssertEqual(BiometricType.opticID.systemImage, "opticid")
    }

    // MARK: - Authentication Success

    func testAuthenticateReturnsTrue() async throws {
        mockContext.canEvaluateResult = true
        mockContext.evaluateResult = true

        let result = try await sut.authenticate(reason: "Approve deployment")
        XCTAssertTrue(result)
    }

    // MARK: - Authentication Failures

    func testAuthenticateThrowsNotAvailableWhenCannotEvaluate() async {
        mockContext.canEvaluateResult = false
        mockContext.canEvaluateError = nil

        do {
            _ = try await sut.authenticate(reason: "test")
            XCTFail("Expected BiometricError.notAvailable")
        } catch let error as BiometricError {
            if case .notAvailable = error {
                // expected
            } else {
                XCTFail("Expected notAvailable, got \(error)")
            }
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    func testAuthenticateThrowsNotEnrolledWhenBiometryNotEnrolled() async {
        mockContext.canEvaluateResult = false
        mockContext.canEvaluateError = NSError(
            domain: LAError.errorDomain,
            code: LAError.biometryNotEnrolled.rawValue,
            userInfo: nil
        )

        do {
            _ = try await sut.authenticate(reason: "test")
            XCTFail("Expected BiometricError.notEnrolled")
        } catch let error as BiometricError {
            if case .notEnrolled = error {
                // expected
            } else {
                XCTFail("Expected notEnrolled, got \(error)")
            }
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    func testAuthenticateThrowsNotEnrolledWhenPasscodeNotSet() async {
        mockContext.canEvaluateResult = false
        mockContext.canEvaluateError = NSError(
            domain: LAError.errorDomain,
            code: LAError.passcodeNotSet.rawValue,
            userInfo: nil
        )

        do {
            _ = try await sut.authenticate(reason: "test")
            XCTFail("Expected BiometricError.notEnrolled")
        } catch let error as BiometricError {
            if case .notEnrolled = error {
                // expected
            } else {
                XCTFail("Expected notEnrolled, got \(error)")
            }
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    func testAuthenticateThrowsCancelledOnUserCancel() async {
        mockContext.canEvaluateResult = true
        mockContext.evaluateError = LAError(.userCancel)

        do {
            _ = try await sut.authenticate(reason: "test")
            XCTFail("Expected BiometricError.cancelled")
        } catch let error as BiometricError {
            if case .cancelled = error {
                // expected
            } else {
                XCTFail("Expected cancelled, got \(error)")
            }
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    func testAuthenticateThrowsCancelledOnSystemCancel() async {
        mockContext.canEvaluateResult = true
        mockContext.evaluateError = LAError(.systemCancel)

        do {
            _ = try await sut.authenticate(reason: "test")
            XCTFail("Expected BiometricError.cancelled")
        } catch let error as BiometricError {
            if case .cancelled = error {
                // expected
            } else {
                XCTFail("Expected cancelled, got \(error)")
            }
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    func testAuthenticateThrowsCancelledOnAppCancel() async {
        mockContext.canEvaluateResult = true
        mockContext.evaluateError = LAError(.appCancel)

        do {
            _ = try await sut.authenticate(reason: "test")
            XCTFail("Expected BiometricError.cancelled")
        } catch let error as BiometricError {
            if case .cancelled = error {
                // expected
            } else {
                XCTFail("Expected cancelled, got \(error)")
            }
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    func testAuthenticateThrowsNotAvailableOnBiometryNotAvailable() async {
        mockContext.canEvaluateResult = true
        mockContext.evaluateError = LAError(.biometryNotAvailable)

        do {
            _ = try await sut.authenticate(reason: "test")
            XCTFail("Expected BiometricError.notAvailable")
        } catch let error as BiometricError {
            if case .notAvailable = error {
                // expected
            } else {
                XCTFail("Expected notAvailable, got \(error)")
            }
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    func testAuthenticateThrowsNotEnrolledOnBiometryNotEnrolledDuringEval() async {
        mockContext.canEvaluateResult = true
        mockContext.evaluateError = LAError(.biometryNotEnrolled)

        do {
            _ = try await sut.authenticate(reason: "test")
            XCTFail("Expected BiometricError.notEnrolled")
        } catch let error as BiometricError {
            if case .notEnrolled = error {
                // expected
            } else {
                XCTFail("Expected notEnrolled, got \(error)")
            }
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    func testAuthenticateThrowsAuthFailedOnGenericLAError() async {
        mockContext.canEvaluateResult = true
        mockContext.evaluateError = LAError(.authenticationFailed)

        do {
            _ = try await sut.authenticate(reason: "test")
            XCTFail("Expected BiometricError.authFailed")
        } catch let error as BiometricError {
            if case .authFailed = error {
                // expected
            } else {
                XCTFail("Expected authFailed, got \(error)")
            }
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    func testAuthenticateThrowsAuthFailedOnNonLAError() async {
        mockContext.canEvaluateResult = true
        mockContext.evaluateError = NSError(domain: "TestDomain", code: 42, userInfo: [
            NSLocalizedDescriptionKey: "Something unexpected"
        ])

        do {
            _ = try await sut.authenticate(reason: "test")
            XCTFail("Expected BiometricError.authFailed")
        } catch let error as BiometricError {
            if case .authFailed(let reason) = error {
                XCTAssertTrue(reason.contains("Something unexpected"))
            } else {
                XCTFail("Expected authFailed, got \(error)")
            }
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    // MARK: - BiometricError descriptions

    func testBiometricErrorDescriptions() {
        XCTAssertNotNil(BiometricError.notAvailable.errorDescription)
        XCTAssertNotNil(BiometricError.notEnrolled.errorDescription)
        XCTAssertNotNil(BiometricError.authFailed("reason").errorDescription)
        XCTAssertNotNil(BiometricError.cancelled.errorDescription)
        XCTAssertTrue(BiometricError.authFailed("bad finger").errorDescription!.contains("bad finger"))
    }
}
