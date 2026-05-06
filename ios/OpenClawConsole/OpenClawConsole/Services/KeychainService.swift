// Services/KeychainService.swift
// OpenClaw Work Console
// Secure token storage using iOS Keychain (Security framework).
// Tokens are never logged. Service account = bundle identifier.

import Foundation
import Security

// MARK: - Keychain Error

enum KeychainError: LocalizedError {
    case duplicateEntry
    case itemNotFound
    case unexpectedStatus(OSStatus)

    var errorDescription: String? {
        switch self {
        case .duplicateEntry:
            return "A keychain item with that key already exists."
        case .itemNotFound:
            return "No keychain item found for that key."
        case .unexpectedStatus(let status):
            return "Keychain operation failed with status \(status)."
        }
    }
}

// MARK: - KeychainService

protocol KeychainItemManaging: AnyObject {
    func update(_ query: CFDictionary, attributesToUpdate: CFDictionary) -> OSStatus
    func add(_ query: CFDictionary) -> OSStatus
    func copyMatching(_ query: CFDictionary, result: UnsafeMutablePointer<AnyObject?>?) -> OSStatus
    func delete(_ query: CFDictionary) -> OSStatus
}

final class SecurityKeychainItemManager: KeychainItemManaging {
    func update(_ query: CFDictionary, attributesToUpdate: CFDictionary) -> OSStatus {
        SecItemUpdate(query, attributesToUpdate)
    }

    func add(_ query: CFDictionary) -> OSStatus {
        SecItemAdd(query, nil)
    }

    func copyMatching(_ query: CFDictionary, result: UnsafeMutablePointer<AnyObject?>?) -> OSStatus {
        SecItemCopyMatching(query, result)
    }

    func delete(_ query: CFDictionary) -> OSStatus {
        SecItemDelete(query)
    }
}

public final class KeychainService {

    public static let shared = KeychainService()
    private let service: String
    private let itemManager: any KeychainItemManaging

    private convenience init() {
        self.init(itemManager: SecurityKeychainItemManager())
    }

    init(
        itemManager: any KeychainItemManaging,
        service: String = "com.openclaw.console.gateway-tokens"
    ) {
        self.itemManager = itemManager
        self.service = service
    }

    // MARK: Save

    /// Saves data to the keychain for a given account key.
    func save(data: Data, for account: String) throws {
        // Attempt update first
        let updateQuery: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account
        ]
        let updateAttributes: [CFString: Any] = [
            kSecValueData: data
        ]
        let updateStatus = itemManager.update(
            updateQuery as CFDictionary,
            attributesToUpdate: updateAttributes as CFDictionary
        )

        if updateStatus == errSecSuccess {
            return
        }

        if updateStatus == errSecItemNotFound {
            // Item doesn't exist – add it
            let addQuery: [CFString: Any] = [
                kSecClass: kSecClassGenericPassword,
                kSecAttrService: service,
                kSecAttrAccount: account,
                kSecValueData: data,
                kSecAttrAccessible: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
            ]
            let addStatus = itemManager.add(addQuery as CFDictionary)
            if addStatus != errSecSuccess {
                throw KeychainError.unexpectedStatus(addStatus)
            }
        } else {
            throw KeychainError.unexpectedStatus(updateStatus)
        }
    }

    /// Saves a token to the keychain for a given account key.
    /// If an item already exists, it is updated.
    func save(token: String, for account: String) throws {
        guard let data = token.data(using: .utf8) else {
            throw KeychainError.unexpectedStatus(errSecParam)
        }
        try save(data: data, for: account)
    }

    // MARK: Retrieve

    /// Retrieves the data stored for the given account key.
    func retrieveData(for account: String) -> Data? {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account,
            kSecReturnData: true,
            kSecMatchLimit: kSecMatchLimitOne
        ]

        var result: AnyObject?
        let status = itemManager.copyMatching(query as CFDictionary, result: &result)

        guard status == errSecSuccess,
              let data = result as? Data else {
            return nil
        }

        return data
    }

    /// Retrieves the token stored for the given account key.
    /// Returns nil if no item exists.
    func retrieve(for account: String) -> String? {
        guard let data = retrieveData(for: account),
              let token = String(data: data, encoding: .utf8) else {
            return nil
        }

        return token
    }

    // MARK: Delete

    /// Deletes the keychain item for the given account key.
    func delete(for account: String) throws {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account
        ]

        let status = itemManager.delete(query as CFDictionary)
        if status != errSecSuccess && status != errSecItemNotFound {
            throw KeychainError.unexpectedStatus(status)
        }
    }

    // MARK: Existence check

    func hasToken(for account: String) -> Bool {
        retrieve(for: account) != nil
    }
}
