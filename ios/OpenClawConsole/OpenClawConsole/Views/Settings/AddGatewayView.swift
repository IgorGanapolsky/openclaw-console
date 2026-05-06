// Views/Settings/AddGatewayView.swift
// OpenClaw Work Console
// Form to add or edit a gateway connection with validation and test.

import AVFoundation
import SwiftUI
import UIKit

struct AddGatewayView: View {
    @Environment(GatewayManager.self) private var gatewayManager
    @Environment(\.dismiss) private var dismiss

    var existingGateway: GatewayConnection?

    @State private var name: String = ""
    @State private var baseURL: String = ""
    @State private var token: String = ""
    @State private var pairingCode: String = ""
    @State private var isTesting: Bool = false
    @State private var isSaving: Bool = false
    @State private var testResult: TestResult? = nil
    @State private var errorMessage: String? = nil
    @State private var showScanner: Bool = false

    private var isEditing: Bool { existingGateway != nil }

    enum TestResult {
        case success
        case failure(String)
    }

    // MARK: - URL Validation

    private var urlHasHttpWarning: Bool {
        baseURL.hasPrefix("http://") // allow-http && !baseURL.hasPrefix("https://")
    }

    private var urlIsValid: Bool {
        guard !baseURL.isEmpty else { return false }
        return baseURL.hasPrefix("http://") || baseURL.hasPrefix("https://") // allow-http for local gateway pairing.
    }

    private var canSave: Bool {
        !name.isEmpty && urlIsValid && (!token.isEmpty || isEditing)
    }

    // MARK: - Body

    var body: some View {
        Form {
            if !isEditing {
                Section {
                    VStack(alignment: .leading, spacing: 10) {
                        Label("Pair by QR or Link", systemImage: "qrcode.viewfinder")
                            .font(.headline)

                        TextField("openclaw://pair?...", text: $pairingCode, axis: .vertical)
                            .autocorrectionDisabled()
                            .autocapitalization(.none)
                            .keyboardType(.URL)
                            .lineLimit(2...4)
                            .frame(minHeight: 44)

                        Button(action: { applyPairingCode() }) {
                            Label("Use Pairing Link", systemImage: "link.badge.plus")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(pairingCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

                        Button(action: { showScanner = true }) {
                            Label("Scan QR Code", systemImage: "qrcode.viewfinder")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                    }
                    .padding(.vertical, 4)
                } footer: {
                    Text("Scan the QR shown by the gateway, or paste the pairing link here. Manual fields remain available below.")
                }
            }

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
        .sheet(isPresented: $showScanner) {
            QRCodeScannerSheet(
                onScan: { code in
                    showScanner = false
                    applyPairingCode(code)
                },
                onCancel: { showScanner = false }
            )
            .ignoresSafeArea()
        }
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

    func applyPairingCode(_ rawCode: String? = nil) {
        let code = rawCode ?? pairingCode
        do {
            let pairing = try GatewayPairing.parse(code)
            pairingCode = code
            name = pairing.name
            baseURL = pairing.baseURL
            token = pairing.token
            testResult = nil
            errorMessage = nil
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    func testAndSave() {
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

        _Concurrency.Task {
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

private struct QRCodeScannerSheet: UIViewControllerRepresentable {
    let onScan: (String) -> Void
    let onCancel: () -> Void

    func makeUIViewController(context: Context) -> QRCodeScannerViewController {
        QRCodeScannerViewController(onScan: onScan, onCancel: onCancel)
    }

    func updateUIViewController(_ uiViewController: QRCodeScannerViewController, context: Context) {}
}

private final class QRCodeScannerViewController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    private let onScan: (String) -> Void
    private let onCancel: () -> Void
    private let session = AVCaptureSession()
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var didScan = false

    init(onScan: @escaping (String) -> Void, onCancel: @escaping () -> Void) {
        self.onScan = onScan
        self.onCancel = onCancel
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        nil
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        configureChrome()

        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            configureScanner()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                DispatchQueue.main.async {
                    granted ? self?.configureScanner() : self?.showPermissionMessage()
                }
            }
        default:
            showPermissionMessage()
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.bounds
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        if session.isRunning {
            session.stopRunning()
        }
    }

    private func configureScanner() {
        guard let device = AVCaptureDevice.default(for: .video),
              let input = try? AVCaptureDeviceInput(device: device),
              session.canAddInput(input) else {
            showPermissionMessage()
            return
        }

        let output = AVCaptureMetadataOutput()
        guard session.canAddOutput(output) else {
            showPermissionMessage()
            return
        }

        session.addInput(input)
        session.addOutput(output)
        output.setMetadataObjectsDelegate(self, queue: DispatchQueue.main)
        output.metadataObjectTypes = [.qr]

        let layer = AVCaptureVideoPreviewLayer(session: session)
        layer.videoGravity = .resizeAspectFill
        layer.frame = view.bounds
        view.layer.insertSublayer(layer, at: 0)
        previewLayer = layer

        DispatchQueue.global(qos: .userInitiated).async { [session] in
            session.startRunning()
        }
    }

    private func configureChrome() {
        let cancelButton = UIButton(type: .system)
        cancelButton.setTitle("Cancel", for: .normal)
        cancelButton.setTitleColor(.white, for: .normal)
        cancelButton.titleLabel?.font = .preferredFont(forTextStyle: .headline)
        cancelButton.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
        cancelButton.translatesAutoresizingMaskIntoConstraints = false

        let frameView = UIView()
        frameView.layer.borderColor = UIColor.white.cgColor
        frameView.layer.borderWidth = 3
        frameView.layer.cornerRadius = 16
        frameView.translatesAutoresizingMaskIntoConstraints = false

        let title = UILabel()
        title.text = "Scan the gateway QR code"
        title.textColor = .white
        title.textAlignment = .center
        title.font = .preferredFont(forTextStyle: .headline)
        title.translatesAutoresizingMaskIntoConstraints = false

        view.addSubview(cancelButton)
        view.addSubview(frameView)
        view.addSubview(title)

        NSLayoutConstraint.activate([
            cancelButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
            cancelButton.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),
            frameView.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            frameView.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            frameView.widthAnchor.constraint(equalToConstant: 252),
            frameView.heightAnchor.constraint(equalToConstant: 252),
            title.topAnchor.constraint(equalTo: frameView.bottomAnchor, constant: 24),
            title.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
            title.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24)
        ])
    }

    private func showPermissionMessage() {
        let label = UILabel()
        label.text = "Camera access is needed to scan the gateway QR code."
        label.textColor = .white
        label.textAlignment = .center
        label.numberOfLines = 0
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            label.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 32),
            label.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -32)
        ])
    }

    @objc private func cancelTapped() {
        onCancel()
    }

    func metadataOutput(
        _ output: AVCaptureMetadataOutput,
        didOutput metadataObjects: [AVMetadataObject],
        from connection: AVCaptureConnection
    ) {
        guard !didScan,
              let readable = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
              let value = readable.stringValue,
              !value.isEmpty else {
            return
        }

        didScan = true
        session.stopRunning()
        onScan(value)
    }
}
