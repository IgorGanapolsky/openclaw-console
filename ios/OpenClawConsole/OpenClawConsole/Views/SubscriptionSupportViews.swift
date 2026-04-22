import SwiftUI

// MARK: - Paywall View (Entry Point)

@available(iOS 17.0, *)
struct PaywallView: View {
    @Environment(\.dismiss) private var dismiss
    let requiredFeature: String

    var body: some View {
        NavigationView {
            VStack(spacing: 24) {
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

                VStack(alignment: .leading, spacing: 8) {
                    Text("**\(requiredFeature.capitalized)** includes:")
                        .font(.headline)

                    let benefits = featureBenefits
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

    private var featureBenefits: [String] {
        switch requiredFeature {
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
    static func validateBiometricAction(
        feature: String,
        subscriptionService: SubscriptionService,
        biometricService: BiometricService
    ) async -> Bool {
        if !subscriptionService.checkProFeatureAccess(feature: feature) {
            print("[SubscriptionView] Feature '\(feature)' requires Pro subscription")
            return false
        }

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
            expirationDate: Date().addingTimeInterval(365 * 24 * 60 * 60),
            hasProEntitlement: true
        )
    )
    .padding()
}
