// Tests/GatewayPairingTests.swift
// OpenClaw Work Console
// Tests QR/deep-link gateway pairing payload parsing.

import XCTest
@testable import OpenClawConsole

final class GatewayPairingTests: XCTestCase {

    func testParsesOpenClawPairingLink() throws {
        let raw = "openclaw://pair?name=Mac%20Mini&base_url=http%3A%2F%2F192.168.1.5%3A18789&token=abc123"

        let pairing = try GatewayPairing.parse(raw)

        XCTAssertEqual(pairing.name, "Mac Mini")
        XCTAssertEqual(pairing.baseURL, "http://192.168.1.5:18789") // allow-http: local gateway pairing fixture
        XCTAssertEqual(pairing.token, "abc123")
    }

    func testParsesGatewayHealthPairingLink() throws {
        let raw = "http://192.168.1.5:18789/api/health?tkn=abc123" // allow-http: local gateway pairing fixture

        let pairing = try GatewayPairing.parse(raw)

        XCTAssertEqual(pairing.name, "OpenClaw 192.168.1.5")
        XCTAssertEqual(pairing.baseURL, "http://192.168.1.5:18789") // allow-http: local gateway pairing fixture
        XCTAssertEqual(pairing.token, "abc123")
    }

    func testParsesPairingJSON() throws {
        let raw = """
        {
          "type": "openclaw.gateway.pairing.v1",
          "name": "Production",
          "base_url": "https://gateway.example.com/",
          "token": "token-value"
        }
        """

        let pairing = try GatewayPairing.parse(raw)

        XCTAssertEqual(pairing.name, "Production")
        XCTAssertEqual(pairing.baseURL, "https://gateway.example.com")
        XCTAssertEqual(pairing.token, "token-value")
    }

    func testRejectsInvalidPairingURL() {
        XCTAssertThrowsError(
            try GatewayPairing.parse("openclaw://pair?base_url=ftp%3A%2F%2Fexample.com&token=abc")
        )
    }
}
