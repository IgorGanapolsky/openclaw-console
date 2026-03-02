// Views/Settings/AddGatewayView.swift
// OpenClaw Work Console
// Form to add or edit a gateway connection with validation and test.

import SwiftUI

struct AddGatewayView: View {
    @Environment(GatewayManager.self) private var gatewayManager
    @Environment(\.dismiss) private var dismiss

    var existingGateway: GatewayConnection?

    @State private var name: String = ""
    @State private var baseURL: String = ""
    @State private var token: String = ""
    @State private var isTesting: Bool = false
    @State private var isSaving: Bool = false
    @State private var testResult: TestResult? = nil
    @State private var errorMessage: String? = nil

    private var isEditing: Bool { existingGateway != nil }

    enum TestResult {
        case success
        case failure(String)
    }

    // MARK: - URL Validation

    private var urlHasHttpWarning: Bool {
        baseURL.hasPrefix("http://") && !baseURL.hasPrefix("https://") // allow-http local-dev-only
    }

    private var urlIsValid: Bool {
        guard !baseURL.isEmpty else { return false }
        return baseURL.hasPrefix("http://") || baseURL.hasPrefix("https://") // allow-http local-dev-only
    }

    private var canSave: Bool {
        !name.isEmpty && urlIsValid && (!token.isEmpty || isEditing)
    }

    // MARK: - Body

    var body: some View {
        Form {
            // MARK: Identity Section
            Section("Gateway Details") {
                TextField("Name", text: $name)
                    .autocorrectionDisabled()
                    .frame(minHeight: 44)

                VStack(alignment: .leading, spacing: 4) {
                    TextField("Base URL", text: $baseURL)
                        .autocorrectionDisabled()
                        .autocapitalization(.none)
                        .keyboardType(.URL)
                        .frame(minHeight: 44)

                    if urlHasHttpWarning {
                        Label {
                            Text("HTTP connections are insecure. Use HTTPS unless on a trusted local network.")
                                .font(.caption)
                        } icon: {
                            Image(systemName: "lock.slash")
                                .font(.caption)
                        }
                        .foregroundStyle(.orange)
                    }
                }
            }

            // MARK: Token Section
            Section {
                SecureField(
                    isEditing ? "New Token (leave empty to keep current)" : "Token",
                    text: $token
                )
                .autocorrectionDisabled()
                .autocapitalization(.none)
                .frame(minHeight: 44)
            } header: {
                Text("Authentication Token")
            } footer: {
                Text("Stored securely in the iOS Keychain. Never logged or transmitted in plaintext.")
                    .font(.caption)
            }

            // MARK: Test Result
            if let result = testResult {
                Section {
                    switch result {
                    case .success:
                        Label("Connection successful", systemImage: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                    case .failure(let msg):
                        VStack(alignment: .leading, spacing: 4) {
                            Label("Connection failed", systemImage: "xmark.circle.fill")
                                .foregroundStyle(.red)
                            Text(msg)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }

            // MARK: Error
            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                        .font(.callout)
                }
            }

            // MARK: Test & Save
            Section {
                Button(action: testAndSave) {
                    if isTesting || isSaving {
                        HStack {
                            ProgressView()
                            Text(isTesting ? "Testing connection…" : "Saving…")
                        }
                    } else {
                        Text(isEditing ? "Save Changes" : "Test & Save")
                            .frame(maxWidth: .infinity)
                    }
                }
                .disabled(!canSave || isTesting || isSaving)
                .frame(minHeight: 44)
            }
        }
        .navigationTitle(isEditing ? "Edit Gateway" : "Add Gateway")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
            }
        }
        .onAppear {
            if let gw = existingGateway {
                name = gw.name
                baseURL = gw.baseURL
                // Token stays empty (existing token remains in Keychain)
            }
        }
    }

    // MARK: - Test & Save Logic

    private func testAndSave() {
        testResult = nil
        errorMessage = nil
        isTesting = true

        // Build a temporary gateway for testing
        let cleanedURL = baseURL.trimmingCharacters(in: .whitespacesAndNewlines)
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let tempGateway = GatewayConnection(
            id: existingGateway?.id ?? UUID().uuidString,
            name: name,
            baseURL: cleanedURL
        )

        // Temporarily store the token so healthCheck can retrieve it
        let testToken = token.isEmpty
            ? (KeychainService.shared.retrieve(for: tempGateway.id) ?? "")
            : token

        Task {
            // Temporarily save token for testing
            if !testToken.isEmpty {
                try? KeychainService.shared.save(token: testToken, for: tempGateway.id)
            }

            do {
                _ = try await APIService.shared.healthCheck(gateway: tempGateway)
                await MainActor.run { testResult = .success }
            } catch {
                let msg = (error as? OpenClawError)?.errorDescription ?? error.localizedDescription
                await MainActor.run { testResult = .failure(msg) }
                // Clean up temp token if this was an add (not edit)
                if !isEditing {
                    try? KeychainService.shared.delete(for: tempGateway.id)
                }
                await MainActor.run { isTesting = false }
                return
            }

            // Save
            await MainActor.run { isTesting = false; isSaving = true }

            do {
                if let existing = existingGateway {
                    try gatewayManager.update(
                        gateway: existing,
                        name: name,
                        baseURL: cleanedURL,
                        token: token.isEmpty ? nil : token
                    )
                } else {
                    try gatewayManager.add(name: name, baseURL: cleanedURL, token: testToken)
                }
                await MainActor.run {
                    isSaving = false
                    dismiss()
                }
            } catch {
                await MainActor.run {
                    isSaving = false
                    errorMessage = error.localizedDescription
                }
            }
        }
    }
}

#Preview {
    NavigationStack {
        AddGatewayView()
            .environment(GatewayManager())
    }
}
