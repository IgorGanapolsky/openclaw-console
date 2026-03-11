import SwiftUI

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

// MARK: - Preview Support

@available(iOS 17.0, *)
#Preview("Paywall View") {
    PaywallView(requiredFeature: "devops_integrations")
}
