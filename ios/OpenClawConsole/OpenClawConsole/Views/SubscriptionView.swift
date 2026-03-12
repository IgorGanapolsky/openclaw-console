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

// MARK: - Subscription Status View

@available(iOS 17.0, *)
struct SubscriptionStatusView: View {
    let status: SubscriptionStatus

    var body: some View {
        VStack(spacing: 12) {
            HStack {
                Image(systemName: statusIcon)
                    .foregroundStyle(statusColor)

                Text(statusText)
                    .font(.headline)
                    .foregroundStyle(statusColor)

                Spacer()
            }

            if let expirationDate = status.expirationDate {
                HStack {
                    Text(status.willRenew ? "Renews" : "Expires")
                    Text(expirationDate, style: .date)
                    Spacer()
                }
                .font(.subheadline)
                .foregroundStyle(.secondary)
            }
        }
        .padding()
        .background(statusColor.opacity(0.1))
        .cornerRadius(12)
    }

    private var statusText: String {
        switch status.tier {
        case .free:
            return "Free Plan"
        case .proMonthly:
            return "Pro Monthly"
        case .proYearly:
            return "Pro Yearly"
        }
    }

    private var statusIcon: String {
        status.hasProEntitlement ? "checkmark.circle.fill" : "circle"
    }

    private var statusColor: Color {
        status.hasProEntitlement ? .green : .orange
    }
}

// MARK: - Feature Comparison Grid

@available(iOS 17.0, *)
struct FeatureComparisonGrid: View {

    private let features = [
        FeatureItem(name: "Basic Agent Monitoring", free: true, pro: true),
        FeatureItem(name: "Simple Notifications", free: true, pro: true),
        FeatureItem(name: "Basic Biometric Approvals", free: true, pro: true),
        FeatureItem(name: "DevOps Integrations", free: false, pro: true),
        FeatureItem(name: "Advanced Analytics", free: false, pro: true),
        FeatureItem(name: "Custom Webhooks", free: false, pro: true),
        FeatureItem(name: "Priority Support", free: false, pro: true),
        FeatureItem(name: "Unlimited Agents", free: false, pro: true)
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Header
            HStack {
                Text("Feature")
                    .font(.subheadline.weight(.medium))
                    .frame(maxWidth: .infinity, alignment: .leading)

                Text("Free")
                    .font(.subheadline.weight(.medium))
                    .frame(width: 50)

                Text("Pro")
                    .font(.subheadline.weight(.medium))
                    .frame(width: 50)
            }
            .padding(.horizontal, 12)

            Divider()

            // Features
            ForEach(features, id: \.name) { feature in
                HStack {
                    Text(feature.name)
                        .font(.body)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    Image(systemName: feature.free ? "checkmark" : "minus")
                        .foregroundStyle(feature.free ? .green : .secondary)
                        .frame(width: 50)

                    Image(systemName: feature.pro ? "checkmark" : "minus")
                        .foregroundStyle(feature.pro ? .green : .secondary)
                        .frame(width: 50)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 4)
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }
}

private struct FeatureItem {
    let name: String
    let free: Bool
    let pro: Bool
}

// MARK: - Subscription Option Card

@available(iOS 17.0, *)
struct SubscriptionOptionCard: View {
    let title: String
    let price: String
    let description: String
    let isYearly: Bool
    let isRecommended: Bool
    let action: () async -> Void

    @State private var isProcessing = false

    var body: some View {
        VStack(spacing: 12) {
            if isRecommended {
                Text("BEST VALUE")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 4)
                    .background(.orange)
                    .cornerRadius(8)
            }

            VStack(spacing: 4) {
                Text(title)
                    .font(.headline)

                Text(price)
                    .font(.title2.weight(.bold))

                Text(description)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Button {
                Task {
                    isProcessing = true
                    await action()
                    isProcessing = false
                }
            } label: {
                HStack {
                    if isProcessing {
                        ProgressView()
                            .scaleEffect(0.8)
                    }
                    Text(isProcessing ? "Processing..." : "Subscribe")
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(isRecommended ? .orange : .blue)
                .foregroundStyle(.white)
                .cornerRadius(12)
            }
            .disabled(isProcessing)
        }
        .padding()
        .background(isRecommended ? Color.orange.opacity(0.1) : Color(.systemGray6))
        .cornerRadius(16)
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(isRecommended ? .orange : .clear, lineWidth: 2)
        )
    }
}

// MARK: - Paywall View (Entry Point)

@available(iOS 17.0, *)
struct PaywallView: View {
    @Environment(\.dismiss) private var dismiss
    let requiredFeature: String

    var body: some View {
        NavigationView {
            VStack(spacing: 24) {
                // Header
                VStack(spacing: 12) {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 48))
                        .foregroundStyle(.orange.gradient)

                    Text("Pro Feature Required")
                        .font(.title.bold())

                    Text("This feature requires an OpenClaw Pro subscription")
                        .font(.body)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.secondary)
                }

                // Feature explanation
                VStack(alignment: .leading, spacing: 8) {
                    Text("**\(requiredFeature.capitalized)** includes:")
                        .font(.headline)

                    let benefits = getFeatureBenefits(for: requiredFeature)
                    ForEach(benefits, id: \.self) { benefit in
                        HStack {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(.green)
                            Text(benefit)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Spacer()

                // CTA Button
                NavigationLink(destination: SubscriptionView()) {
                    Text("Upgrade to Pro")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(.orange)
                        .foregroundStyle(.white)
                        .cornerRadius(12)
                }

                Button("Maybe Later") {
                    dismiss()
                }
                .foregroundStyle(.secondary)
            }
            .padding()
            .navigationTitle("Upgrade Required")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Close") {
                        dismiss()
                    }
                }
            }
        }
    }

    private func getFeatureBenefits(for feature: String) -> [String] {
        switch feature {
        case "devops_integrations":
            return [
                "Slack notifications",
                "PagerDuty alerts",
                "Custom webhooks",
                "CI/CD pipeline monitoring"
            ]
        case "advanced_analytics":
            return [
                "Detailed performance metrics",
                "Agent efficiency tracking",
                "Custom reporting",
                "Historical data analysis"
            ]
        case "unlimited_agents":
            return [
                "Connect unlimited agents",
                "Scalable monitoring",
                "Enterprise-ready",
                "Priority support"
            ]
        default:
            return [
                "Professional-grade features",
                "Enhanced security",
                "Priority support",
                "Advanced capabilities"
            ]
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

@available(iOS 17.0, *)
#Preview("Paywall View") {
    PaywallView(requiredFeature: "devops_integrations")
}

@available(iOS 17.0, *)
#Preview("Subscription Status - Free") {
    SubscriptionStatusView(status: SubscriptionStatus(tier: .free))
        .padding()
}

@available(iOS 17.0, *)
#Preview("Subscription Status - Pro") {
    SubscriptionStatusView(
        status: SubscriptionStatus(
            tier: .proYearly,
            isActive: true,
            willRenew: true,
            expirationDate: Date().addingTimeInterval(365*24*60*60),
            hasProEntitlement: true
        )
    )
    .padding()
}
