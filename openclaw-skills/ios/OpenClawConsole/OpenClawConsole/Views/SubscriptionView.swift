import SwiftUI
import RevenueCat
import LocalAuthentication

/// Subscription management view for OpenClaw Console
/// Provides paywall, purchase flows, and subscription status management
@available(iOS 17.0, *)
struct SubscriptionView: View {

    @Environment(SubscriptionService.self) private var subscriptionService
    @Environment(BiometricService.self) private var biometricService

    @State private var showingRestoreAlert = false
    @State private var showingErrorAlert = false
    @State private var errorMessage = ""
    @State private var isProcessing = false

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 24) {
                    headerSection
                    currentStatusSection
                    featuresComparisonSection
                    subscriptionOptionsSection
                    restoreSection
                }
                .padding(.horizontal)
            }
            .navigationTitle("Subscription")
            .navigationBarTitleDisplayMode(.large)
            .alert("Restore Purchases", isPresented: $showingRestoreAlert) {
                Button("Cancel", role: .cancel) { }
                Button("Restore") {
                    Task {
                        await restorePurchases()
                    }
                }
            } message: {
                Text("This will restore any previous purchases made with this Apple ID.")
            }
            .alert("Error", isPresented: $showingErrorAlert) {
                Button("OK") { }
            } message: {
                Text(errorMessage)
            }
        }
    }

    // MARK: - Header Section

    private var headerSection: some View {
        VStack(spacing: 12) {
            Image(systemName: "crown.fill")
                .font(.system(size: 48))
                .foregroundStyle(.orange.gradient)

            Text("OpenClaw Pro")
                .font(.title.bold())

            Text("Unlock advanced features for professional OpenClaw agent management")
                .font(.body)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
        }
        .padding(.top)
    }

    // MARK: - Current Status Section

    private var currentStatusSection: some View {
        SubscriptionStatusView(status: subscriptionService.subscriptionStatus)
    }

    // MARK: - Features Comparison

    private var featuresComparisonSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Features")
                .font(.headline)

            FeatureComparisonGrid()
        }
        .padding(.vertical)
    }

    // MARK: - Subscription Options

    private var subscriptionOptionsSection: some View {
        VStack(spacing: 16) {
            Text("Choose Your Plan")
                .font(.headline)

            if subscriptionService.subscriptionStatus.hasProEntitlement {
                // User already has Pro
                Text("You have Pro access")
                    .foregroundStyle(.green)
                    .font(.subheadline)
            } else {
                VStack(spacing: 12) {
                    // Monthly Plan
                    SubscriptionOptionCard(
                        title: "Monthly",
                        price: "$19.99/month",
                        description: "Perfect for trying Pro features",
                        isYearly: false,
                        isRecommended: false
                    ) {
                        await purchaseSubscription(yearly: false)
                    }

                    // Yearly Plan (Recommended)
                    SubscriptionOptionCard(
                        title: "Yearly",
                        price: "$99.99/year",
                        description: "Best value • Save 58%",
                        isYearly: true,
                        isRecommended: true
                    ) {
                        await purchaseSubscription(yearly: true)
                    }
                }
            }
        }
    }

    // MARK: - Restore Section

    private var restoreSection: some View {
        VStack(spacing: 8) {
            Button("Restore Purchases") {
                showingRestoreAlert = true
            }
            .foregroundStyle(.blue)

            Text("Have a subscription? Restore your purchases here.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(.bottom)
    }

    // MARK: - Actions

    @MainActor
    private func purchaseSubscription(yearly: Bool) async {
        isProcessing = true
        defer { isProcessing = false }

        let result = await subscriptionService.purchaseProSubscription(yearly: yearly)

        switch result {
        case .success:
            // Purchase successful - UI will update automatically via @Observable
            break

        case .error(let message):
            errorMessage = message
            showingErrorAlert = true

        case .userCancelled:
            // User cancelled - no action needed
            break
        }
    }

    @MainActor
    private func restorePurchases() async {
        isProcessing = true
        defer { isProcessing = false }

        let result = await subscriptionService.restorePurchases()

        switch result {
        case .success:
            // Success message will be shown by subscription status update
            break

        case .error(let message):
            errorMessage = message
            showingErrorAlert = true

        case .userCancelled:
            // Shouldn't happen for restore, but handle gracefully
            break
        }
    }
}

// MARK: - Biometric Integration Extensions

@available(iOS 17.0, *)
extension SubscriptionView {

    /// Check if biometric action requires Pro subscription
    static func validateBiometricAction(
        feature: String,
        subscriptionService: SubscriptionService,
        biometricService: BiometricService
    ) async -> Bool {
        // First check if feature requires Pro
        if !subscriptionService.checkProFeatureAccess(feature: feature) {
            print("[SubscriptionView] Feature '\(feature)' requires Pro subscription")
            return false
        }

        // Then perform biometric authentication
        do {
            let result = try await biometricService.authenticate(reason: "Verify your identity to approve this action")
            print("[SubscriptionView] Biometric authentication result: \(result)")
            return result
        } catch {
            print("[SubscriptionView] Biometric authentication failed: \(error)")
            return false
        }
    }
}

// MARK: - Preview Support

@available(iOS 17.0, *)
#Preview("Subscription View") {
    SubscriptionView()
        .environment(SubscriptionService())
        .environment(BiometricService.shared)
}
