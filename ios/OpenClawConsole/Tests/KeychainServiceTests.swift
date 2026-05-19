// OpenClawConsoleTests/KeychainServiceTests.swift
// OpenClaw Work Console
// Tests KeychainService through an injected backend so CI does not require
// signed simulator keychain entitlements.

import Security
import XCTest
@testable import OpenClawConsole

final class KeychainServiceTests: XCTestCase {

    private var itemManager: MockKeychainItemManager!
    private var sut: KeychainService!
    private let testAccount = "test-keychain-\(UUID().uuidString)"

    override func setUp() {
        super.setUp()
        itemManager = MockKeychainItemManager()
        sut = KeychainService(itemManager: itemManager, service: "test.openclaw.keychain")
    }

    override func tearDown() {
        sut = nil
        itemManager = nil
        super.tearDown()
    }

    func testSaveAndRetrieveToken() throws {
        try sut.save(token: "my-secret-token", for: testAccount)

        XCTAssertEqual(sut.retrieve(for: testAccount), "my-secret-token")
    }

    func testRetrieveReturnsNilForUnknownAccount() {
        XCTAssertNil(sut.retrieve(for: "nonexistent-account-\(UUID().uuidString)"))
    }

    func testSaveUpdatesExistingToken() throws {
        try sut.save(token: "first-token", for: testAccount)
        try sut.save(token: "second-token", for: testAccount)

        XCTAssertEqual(sut.retrieve(for: testAccount), "second-token")
    }

    func testDeleteRemovesToken() throws {
        try sut.save(token: "to-delete", for: testAccount)
        try sut.delete(for: testAccount)

        XCTAssertNil(sut.retrieve(for: testAccount))
    }

    func testDeleteNonexistentDoesNotThrow() {
        XCTAssertNoThrow(try sut.delete(for: "nonexistent-\(UUID().uuidString)"))
    }

    func testHasTokenReturnsTrueWhenPresent() throws {
        try sut.save(token: "present-token", for: testAccount)

        XCTAssertTrue(sut.hasToken(for: testAccount))
    }

    func testHasTokenReturnsFalseWhenAbsent() {
        XCTAssertFalse(sut.hasToken(for: "missing-\(UUID().uuidString)"))
    }

    func testHasTokenReturnsFalseAfterDeletion() throws {
        try sut.save(token: "temp-token", for: testAccount)
        try sut.delete(for: testAccount)

        XCTAssertFalse(sut.hasToken(for: testAccount))
    }

    func testMultipleAccountsAreIndependent() throws {
        let account1 = testAccount
        let account2 = testAccount + "-extra"

        try sut.save(token: "token-a", for: account1)
        try sut.save(token: "token-b", for: account2)

        XCTAssertEqual(sut.retrieve(for: account1), "token-a")
        XCTAssertEqual(sut.retrieve(for: account2), "token-b")

        try sut.delete(for: account1)

        XCTAssertNil(sut.retrieve(for: account1))
        XCTAssertEqual(sut.retrieve(for: account2), "token-b")
    }

    func testSavesAndRetrievesTokenWithSpecialCharacters() throws {
        let specialToken = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0+/=!@#$%"

        try sut.save(token: specialToken, for: testAccount)

        XCTAssertEqual(sut.retrieve(for: testAccount), specialToken)
    }

    func testSavesAndRetrievesEmptyToken() throws {
        try sut.save(token: "", for: testAccount)

        XCTAssertEqual(sut.retrieve(for: testAccount), "")
    }

    func testThrowsUnexpectedStatusWhenAddFails() {
        itemManager.nextAddStatus = errSecAuthFailed

        XCTAssertThrowsError(try sut.save(token: "secret", for: testAccount)) { error in
            guard case KeychainError.unexpectedStatus(let status) = error else {
                return XCTFail("Expected unexpectedStatus(errSecAuthFailed), got \(error)")
            }
            XCTAssertEqual(status, errSecAuthFailed)
        }
    }

    func testKeychainErrorDescriptions() {
        XCTAssertNotNil(KeychainError.duplicateEntry.errorDescription)
        XCTAssertNotNil(KeychainError.itemNotFound.errorDescription)
        XCTAssertNotNil(KeychainError.unexpectedStatus(-25300).errorDescription)
        XCTAssertTrue(KeychainError.unexpectedStatus(-25300).errorDescription!.contains("-25300"))
    }
}

private final class MockKeychainItemManager: KeychainItemManaging {
    var nextAddStatus: OSStatus = errSecSuccess
    private var storage: [String: Data] = [:]

    func update(_ query: CFDictionary, attributesToUpdate: CFDictionary) -> OSStatus {
        guard let account = account(from: query) else {
            return errSecParam
        }
        guard storage[account] != nil else {
            return errSecItemNotFound
        }
        guard let data = data(from: attributesToUpdate) else {
            return errSecParam
        }
        storage[account] = data
        return errSecSuccess
    }

    func add(_ query: CFDictionary) -> OSStatus {
        if nextAddStatus != errSecSuccess {
            return nextAddStatus
        }
        guard let account = account(from: query),
              let data = data(from: query) else {
            return errSecParam
        }
        guard storage[account] == nil else {
            return errSecDuplicateItem
        }
        storage[account] = data
        return errSecSuccess
    }

    func copyMatching(_ query: CFDictionary, result: UnsafeMutablePointer<AnyObject?>?) -> OSStatus {
        guard let account = account(from: query) else {
            return errSecParam
        }
        guard let data = storage[account] else {
            return errSecItemNotFound
        }
        result?.pointee = data as NSData
        return errSecSuccess
    }

    func delete(_ query: CFDictionary) -> OSStatus {
        guard let account = account(from: query) else {
            return errSecParam
        }
        guard storage.removeValue(forKey: account) != nil else {
            return errSecItemNotFound
        }
        return errSecSuccess
    }

    private func account(from dictionary: CFDictionary) -> String? {
        (dictionary as NSDictionary)[kSecAttrAccount] as? String
    }

    private func data(from dictionary: CFDictionary) -> Data? {
        (dictionary as NSDictionary)[kSecValueData] as? Data
    }
}
