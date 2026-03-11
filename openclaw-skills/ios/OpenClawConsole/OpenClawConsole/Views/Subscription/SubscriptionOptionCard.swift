import SwiftUI

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

// MARK: - Preview Support

@available(iOS 17.0, *)
#Preview("Subscription Option Card - Monthly") {
    SubscriptionOptionCard(
        title: "Monthly",
        price: "$19.99/month",
        description: "Perfect for trying Pro features",
        isYearly: false,
        isRecommended: false
    ) {
        // Mock action
    }
    .padding()
}

@available(iOS 17.0, *)
#Preview("Subscription Option Card - Yearly") {
    SubscriptionOptionCard(
        title: "Yearly",
        price: "$99.99/year",
        description: "Best value • Save 58%",
        isYearly: true,
        isRecommended: true
    ) {
        // Mock action
    }
    .padding()
}
