// Services/BiometricSubscriptionService.swift
// OpenClaw Work Console
// Enhanced biometric service that validates subscription tiers before approvals.
// Integrates BiometricService with SubscriptionService for Pro feature gating.

import Foundation
import LocalAuthentication
import SwiftUI

/// Enhanced biometric service with subscription validation
/// Ensures Pro features require active subscription before biometric approval
@available(iOS 17.0, *)
final class BiometricSubscriptionService {

    static let shared = BiometricSubscriptionService()

    private let biometricService: BiometricService
    private let subscriptionService: SubscriptionService

    init(
        biometricService: BiometricService = BiometricService.shared,
        subscriptionService: SubscriptionService = .shared
    ) {
        self.biometricService = biometricService
        self.subscriptionService = subscriptionService
    }

    // MARK: - Biometric Properties

    var isAvailable: Bool {
        biometricService.isAvailable
    }

    var biometricType: BiometricType {
        biometricService.biometricType
    }

    // MARK: - Enhanced Authentication

    /// Authenticate with subscription tier validation
    /// First checks if the feature requires Pro subscription, then performs biometric auth
    func authenticateForFeature(
        _ feature: String,
        reason: String? = nil
    ) async throws -> AuthenticationResult {

        print("[BiometricSubscriptionService] Validating feature access: \(feature)")

        // Check subscription requirement first
        let hasAccess = subscriptionService.checkProFeatureAccess(feature: feature)

        if !hasAccess {
            print("[BiometricSubscriptionService] Feature '\(feature)' requires Pro subscription")
            return .requiresUpgrade(feature: feature)
        }

        // Perform biometric authentication
        let authReason = reason ?? "Verify your identity to approve this \(feature) action"

        do {
            let success = try await biometricService.authenticate(reason: authReason)
            print("[BiometricSubscriptionService] Biometric authentication successful for feature: \(feature)")
            return .success
        } catch {
            print("[BiometricSubscriptionService] Biometric authentication failed: \(error)")
            return .biometricFailed(error)
        }
    }

    /// Standard biometric authentication without subscription checking
    /// Use for basic features that are available to all users
    func authenticate(reason: String) async throws -> Bool {
        return try await biometricService.authenticate(reason: reason)
    }

    /// Authenticate for agent approval with tier-specific validation
    func authenticateForApproval(
        agentAction: String,
        riskLevel: ApprovalRiskLevel = .standard
    ) async throws -> AuthenticationResult {

        let feature = getFeatureForRiskLevel(riskLevel)
        let reason = "Approve \(agentAction) action"

        return try await authenticateForFeature(feature, reason: reason)
    }

    /// Check if user can access a specific approval type
    func canPerformApproval(riskLevel: ApprovalRiskLevel) -> Bool {
        let feature = getFeatureForRiskLevel(riskLevel)
        return subscriptionService.checkProFeatureAccess(feature: feature)
    }

    // MARK: - Private Helpers

    private func getFeatureForRiskLevel(_ riskLevel: ApprovalRiskLevel) -> String {
        switch riskLevel {
        case .basic:
            return "basic_approvals"  // Free tier
        case .standard:
            return "basic_approvals"  // Free tier
        case .elevated:
            return "devops_integrations"  // Pro required
        case .critical:
            return "unlimited_agents"  // Pro required
        }
    }
}

// MARK: - Authentication Result

@available(iOS 17.0, *)
enum AuthenticationResult {
    case success
    case requiresUpgrade(feature: String)
    case biometricFailed(Error)

    var isSuccess: Bool {
        if case .success = self {
            return true
        }
        return false
    }

    var requiresUpgrade: Bool {
        if case .requiresUpgrade = self {
            return true
        }
        return false
    }

    var error: Error? {
        if case .biometricFailed(let error) = self {
            return error
        }
        return nil
    }
}

// MARK: - Approval Risk Level

@available(iOS 17.0, *)
enum ApprovalRiskLevel {
    case basic      // Simple notifications, status checks (Free)
    case standard   // Standard agent actions (Free)
    case elevated   // DevOps integrations, webhooks (Pro)
    case critical   // System changes, high-risk operations (Pro)

    var displayName: String {
        switch self {
        case .basic: return "Basic"
        case .standard: return "Standard"
        case .elevated: return "Elevated"
        case .critical: return "Critical"
        }
    }

    var requiresPro: Bool {
        switch self {
        case .basic, .standard: return false
        case .elevated, .critical: return true
        }
    }

    var description: String {
        switch self {
        case .basic:
            return "Low-risk actions like viewing status and basic monitoring"
        case .standard:
            return "Standard agent operations and routine tasks"
        case .elevated:
            return "DevOps integrations, custom webhooks, and advanced features"
        case .critical:
            return "High-risk system changes and critical operations"
        }
    }
}

// MARK: - Approval Flow Integration

@available(iOS 17.0, *)
extension BiometricSubscriptionService {

    /// Comprehensive approval flow with subscription and biometric validation
    func performApprovalFlow(
        for action: AgentAction,
        completion: @escaping (ApprovalFlowResult) -> Void
    ) {
        Task {
            do {
                let result = try await authenticateForApproval(
                    agentAction: action.description,
                    riskLevel: action.riskLevel
                )

                await MainActor.run {
                    switch result {
                    case .success:
                        completion(.approved(action))

                    case .requiresUpgrade(let feature):
                        completion(.requiresSubscription(feature: feature, action: action))

                    case .biometricFailed(let error):
                        completion(.denied(error: error, action: action))
                    }
                }

            } catch {
                await MainActor.run {
                    completion(.denied(error: error, action: action))
                }
            }
        }
    }
}

// MARK: - Agent Action Model

@available(iOS 17.0, *)
struct AgentAction {
    let id: String
    let description: String
    let riskLevel: ApprovalRiskLevel
    let metadata: [String: String]

    init(id: String, description: String, riskLevel: ApprovalRiskLevel, metadata: [String: String] = [:]) {
        self.id = id
        self.description = description
        self.riskLevel = riskLevel
        self.metadata = metadata
    }
}

// MARK: - Approval Flow Result

@available(iOS 17.0, *)
enum ApprovalFlowResult {
    case approved(AgentAction)
    case denied(error: Error, action: AgentAction)
    case requiresSubscription(feature: String, action: AgentAction)

    var isApproved: Bool {
        if case .approved = self {
            return true
        }
        return false
    }

    var requiresUpgrade: Bool {
        if case .requiresSubscription = self {
            return true
        }
        return false
    }
}

// MARK: - SwiftUI Integration

@available(iOS 17.0, *)
extension BiometricSubscriptionService {

    /// Create a view modifier for biometric approval workflows
    func approvalViewModifier(
        for action: AgentAction,
        onApproved: @escaping (AgentAction) -> Void,
        onDenied: @escaping (Error, AgentAction) -> Void,
        onUpgradeRequired: @escaping (String, AgentAction) -> Void
    ) -> ApprovalViewModifier {
        return ApprovalViewModifier(
            service: self,
            action: action,
            onApproved: onApproved,
            onDenied: onDenied,
            onUpgradeRequired: onUpgradeRequired
        )
    }
}

// MARK: - Approval View Modifier

@available(iOS 17.0, *)
struct ApprovalViewModifier: ViewModifier {

    let service: BiometricSubscriptionService
    let action: AgentAction
    let onApproved: (AgentAction) -> Void
    let onDenied: (Error, AgentAction) -> Void
    let onUpgradeRequired: (String, AgentAction) -> Void

    @State private var showingPaywall = false
    @State private var paywallFeature = ""

    func body(content: Content) -> some View {
        content
            .sheet(isPresented: $showingPaywall) {
                PaywallView(requiredFeature: paywallFeature)
            }
            .onAppear {
                performApprovalCheck()
            }
    }

    private func performApprovalCheck() {
        service.performApprovalFlow(for: action) { result in
            switch result {
            case .approved(let action):
                onApproved(action)

            case .denied(let error, let action):
                onDenied(error, action)

            case .requiresSubscription(let feature, let action):
                paywallFeature = feature
                showingPaywall = true
                onUpgradeRequired(feature, action)
            }
        }
    }
}

// MARK: - Usage Examples and Documentation

/*
 Usage Examples:

 1. Basic biometric authentication:
    let success = try await BiometricSubscriptionService.shared.authenticate(
        reason: "Verify your identity"
    )

 2. Feature-specific authentication:
    let result = try await BiometricSubscriptionService.shared.authenticateForFeature(
        "devops_integrations",
        reason: "Enable DevOps webhook"
    )

 3. Agent approval workflow:
    let action = AgentAction(
        id: "deploy_prod",
        description: "Deploy to production",
        riskLevel: .critical
    )

    BiometricSubscriptionService.shared.performApprovalFlow(for: action) { result in
        switch result {
        case .approved(let action):
            // Proceed with action
        case .requiresSubscription(let feature, _):
            // Show upgrade prompt
        case .denied(let error, _):
            // Handle denial
        }
    }

 4. SwiftUI Integration:
    Button("Approve Action") {
        // Approval handled by view modifier
    }
    .modifier(
        BiometricSubscriptionService.shared.approvalViewModifier(
            for: action,
            onApproved: { approvedAction in
                // Handle approval
            },
            onDenied: { error, action in
                // Handle denial
            },
            onUpgradeRequired: { feature, action in
                // Show upgrade UI
            }
        )
    )
 */
