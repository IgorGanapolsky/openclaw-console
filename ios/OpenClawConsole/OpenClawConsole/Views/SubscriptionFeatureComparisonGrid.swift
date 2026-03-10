import SwiftUI

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
