import SwiftUI

struct BridgeListView: View {
    let viewModel: BridgeListViewModel

    var body: some View {
        VStack {
            Text("Bridge Sessions")
                .font(.title)
                .padding()

            Text("Coming soon...")
                .foregroundStyle(.secondary)
        }
    }
}