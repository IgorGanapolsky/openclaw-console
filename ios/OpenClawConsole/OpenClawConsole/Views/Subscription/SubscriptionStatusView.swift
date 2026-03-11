import SwiftUI

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

// MARK: - Preview Support

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
