// OpenClawConsoleTests/KeychainServiceTests.swift
// OpenClaw Work Console
// Tests for KeychainService: token save, retrieve, delete, update, and error cases.
// Uses the real Keychain via Security framework (runs in a test host context).

import XCTest
@testable import OpenClawConsole

final class KeychainServiceTests: XCTestCase {

    private let sut = KeychainService.shared
    /// Unique account prefix per test run to avoid cross-contamination.
    private let testAccount = "test-keychain-\(UUID().uuidString)"

    override func tearDown() {
        // Clean up any tokens saved during this test
        try? sut.delete(for: testAccount)
        try? sut.delete(for: testAccount + "-extra")
        super.tearDown()
    }

    // MARK: - Save & Retrieve

    func testSaveAndRetrieveToken() throws {
        try sut.save(token: "my-secret-token", for: testAccount)
        let retrieved = sut.retrieve(for: testAccount)
        XCTAssertEqual(retrieved, "my-secret-token")
    }

    func testRetrieveReturnsNilForUnknownAccount() {
        let retrieved = sut.retrieve(for: "nonexistent-account-\(UUID().uuidString)")
        XCTAssertNil(retrieved)
    }

    func testSaveUpdatesExistingToken() throws {
        try sut.save(token: "first-token", for: testAccount)
        try sut.save(token: "second-token", for: testAccount)
        let retrieved = sut.retrieve(for: testAccount)
        XCTAssertEqual(retrieved, "second-token")
    }

    // MARK: - Delete

    func testDeleteRemovesToken() throws {
        try sut.save(token: "to-delete", for: testAccount)
        try sut.delete(for: testAccount)
        let retrieved = sut.retrieve(for: testAccount)
        XCTAssertNil(retrieved)
    }

    func testDeleteNonexistentDoesNotThrow() throws {
        // Should not throw for an item that was never saved
        XCTAssertNoThrow(try sut.delete(for: "nonexistent-\(UUID().uuidString)"))
    }

    // MARK: - hasToken

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

    // MARK: - Multiple Accounts

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

        // Clean up
        try sut.delete(for: account2)
    }

    // MARK: - Special Characters

    func testSavesAndRetrievesTokenWithSpecialCharacters() throws {
        let specialToken = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0+/=!@#$%"
        try sut.save(token: specialToken, for: testAccount)
        let retrieved = sut.retrieve(for: testAccount)
        XCTAssertEqual(retrieved, specialToken)
    }

    func testSavesAndRetrievesEmptyToken() throws {
        try sut.save(token: "", for: testAccount)
        let retrieved = sut.retrieve(for: testAccount)
        XCTAssertEqual(retrieved, "")
    }

    func testSavesAndRetrievesUnicodeToken() throws {
        let unicodeToken = "token-with-unicode-\u{1F512}\u{1F680}"
        try sut.save(token: unicodeToken, for: testAccount)
        let retrieved = sut.retrieve(for: testAccount)
        XCTAssertEqual(retrieved, unicodeToken)
    }

    // MARK: - KeychainError descriptions

    func testKeychainErrorDescriptions() {
        XCTAssertNotNil(KeychainError.duplicateEntry.errorDescription)
        XCTAssertNotNil(KeychainError.itemNotFound.errorDescription)
        XCTAssertNotNil(KeychainError.unexpectedStatus(-25300).errorDescription)
        XCTAssertTrue(KeychainError.unexpectedStatus(-25300).errorDescription!.contains("-25300"))
    }
}
