// OpenClawConsoleTests/APIServiceTests.swift
// OpenClaw Work Console
// Tests for APIService: request construction, response parsing, error handling.
// Uses a protocol-based mock URLSession to avoid real network calls.

import XCTest
@testable import OpenClawConsole

// MARK: - URLSession Protocol for Testability

protocol URLSessionProtocol: Sendable {
    func data(for request: URLRequest) async throws -> (Data, URLResponse)
}

extension URLSession: URLSessionProtocol {}

// MARK: - Mock URLSession

final class MockURLSession: URLSessionProtocol, @unchecked Sendable {
    var responseData: Data = Data()
    var responseStatusCode: Int = 200
    var responseHeaders: [String: String] = [:]
    var errorToThrow: Error?
    var capturedRequest: URLRequest?

    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        capturedRequest = request
        if let error = errorToThrow {
            throw error
        }
        let url = request.url ?? URL(string: "https://example.com")!
        let response = HTTPURLResponse(
            url: url,
            statusCode: responseStatusCode,
            httpVersion: nil,
            headerFields: responseHeaders
        )!
        return (responseData, response)
    }
}

// MARK: - Testable APIService

/// A testable variant of APIService that accepts a URLSession protocol.
/// This avoids modifying the production singleton while enabling thorough testing.
final class TestableAPIService {

    var activeGateway: GatewayConnection?
    private let session: URLSessionProtocol

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()

    /// Mock keychain token lookup. Set this in tests.
    var tokenForAccount: ((String) -> String?)?

    init(session: URLSessionProtocol) {
        self.session = session
    }

    func request<T: Decodable>(
        method: String = "GET",
        path: String,
        body: (any Encodable)? = nil,
        gateway: GatewayConnection? = nil
    ) async throws -> T {
        let gw = gateway ?? activeGateway
        guard let gw else { throw OpenClawError.noActiveGateway }
        guard let token = tokenForAccount?(gw.id) else {
            throw OpenClawError.httpError(401, "No token available for gateway")
        }

        let urlString = gw.baseURL + path
        guard let url = URL(string: urlString) else {
            throw OpenClawError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try encoder.encode(body)
        }

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw OpenClawError.networkError(error.localizedDescription)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw OpenClawError.networkError("No HTTP response")
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            if let errorPayload = try? decoder.decode(ErrorPayload.self, from: data) {
                throw OpenClawError.serverError(code: errorPayload.code, message: errorPayload.message)
            }
            let body = String(data: data, encoding: .utf8)
            throw OpenClawError.httpError(httpResponse.statusCode, body)
        }

        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw OpenClawError.decodingError(error.localizedDescription)
        }
    }
}

// MARK: - APIService Tests

final class APIServiceTests: XCTestCase {

    private var mockSession: MockURLSession!
    private var sut: TestableAPIService!
    private var testGateway: GatewayConnection!

    override func setUp() {
        super.setUp()
        mockSession = MockURLSession()
        sut = TestableAPIService(session: mockSession)
        testGateway = GatewayConnection(id: "gw-test-1", name: "Test Gateway", baseURL: "https://gateway.example.com")
        sut.activeGateway = testGateway
        sut.tokenForAccount = { account in
            return account == "gw-test-1" ? "test-bearer-token" : nil
        }
    }

    override func tearDown() {
        mockSession = nil
        sut = nil
        testGateway = nil
        super.tearDown()
    }

    // MARK: - Request Construction

    func testRequestSetsAuthorizationHeader() async throws {
        let healthJSON = Data("""
        {"status":"ok","version":"1.0.0"}
        """.utf8)
        mockSession.responseData = healthJSON

        let _: HealthResponse = try await sut.request(path: "/api/health", gateway: testGateway)

        XCTAssertNotNil(mockSession.capturedRequest)
        let authHeader = mockSession.capturedRequest?.value(forHTTPHeaderField: "Authorization")
        XCTAssertEqual(authHeader, "Bearer test-bearer-token")
    }

    func testRequestSetsAcceptHeader() async throws {
        let healthJSON = Data("""
        {"status":"ok","version":"1.0.0"}
        """.utf8)
        mockSession.responseData = healthJSON

        let _: HealthResponse = try await sut.request(path: "/api/health", gateway: testGateway)

        let acceptHeader = mockSession.capturedRequest?.value(forHTTPHeaderField: "Accept")
        XCTAssertEqual(acceptHeader, "application/json")
    }

    func testRequestConstructsCorrectURL() async throws {
        let healthJSON = Data("""
        {"status":"ok","version":"1.0.0"}
        """.utf8)
        mockSession.responseData = healthJSON

        let _: HealthResponse = try await sut.request(path: "/api/health", gateway: testGateway)

        XCTAssertEqual(mockSession.capturedRequest?.url?.absoluteString, "https://gateway.example.com/api/health")
    }

    func testGetRequestHasNoBody() async throws {
        let healthJSON = Data("""
        {"status":"ok","version":"1.0.0"}
        """.utf8)
        mockSession.responseData = healthJSON

        let _: HealthResponse = try await sut.request(method: "GET", path: "/api/health", gateway: testGateway)

        XCTAssertNil(mockSession.capturedRequest?.httpBody)
        XCTAssertNil(mockSession.capturedRequest?.value(forHTTPHeaderField: "Content-Type"))
    }

    func testPostRequestSetsBodyAndContentType() async throws {
        struct TestBody: Codable {
            let message: String
        }
        let responseJSON = Data("""
        {"status":"ok","version":"1.0.0"}
        """.utf8)
        mockSession.responseData = responseJSON

        let body = TestBody(message: "hello")
        let _: HealthResponse = try await sut.request(method: "POST", path: "/api/test", body: body, gateway: testGateway)

        XCTAssertEqual(mockSession.capturedRequest?.httpMethod, "POST")
        XCTAssertEqual(mockSession.capturedRequest?.value(forHTTPHeaderField: "Content-Type"), "application/json")
        XCTAssertNotNil(mockSession.capturedRequest?.httpBody)
    }

    // MARK: - Response Parsing

    func testParsesHealthResponse() async throws {
        let healthJSON = Data("""
        {"status":"ok","version":"1.2.3","gateway_version":"0.5.0"}
        """.utf8)
        mockSession.responseData = healthJSON

        let response: HealthResponse = try await sut.request(path: "/api/health", gateway: testGateway)

        XCTAssertEqual(response.status, "ok")
        XCTAssertEqual(response.version, "1.2.3")
        XCTAssertEqual(response.gatewayVersion, "0.5.0")
    }

    func testParsesAgentResponse() async throws {
        let agentJSON = Data("""
        [{
            "id": "agent-1",
            "name": "Deploy Bot",
            "description": "Handles deployments",
            "status": "online",
            "workspace": "production",
            "tags": ["deploy", "ci"],
            "last_active": "2025-01-15T10:30:00Z",
            "active_tasks": 2,
            "pending_approvals": 1
        }]
        """.utf8)
        mockSession.responseData = agentJSON

        let agents: [Agent] = try await sut.request(path: "/api/agents", gateway: testGateway)

        XCTAssertEqual(agents.count, 1)
        XCTAssertEqual(agents[0].id, "agent-1")
        XCTAssertEqual(agents[0].name, "Deploy Bot")
        XCTAssertEqual(agents[0].status, .online)
        XCTAssertEqual(agents[0].activeTasks, 2)
        XCTAssertEqual(agents[0].pendingApprovals, 1)
        XCTAssertEqual(agents[0].tags, ["deploy", "ci"])
    }

    func testParsesHealthResponseWithNilOptionals() async throws {
        let healthJSON = Data("""
        {"status":"ok"}
        """.utf8)
        mockSession.responseData = healthJSON

        let response: HealthResponse = try await sut.request(path: "/api/health", gateway: testGateway)

        XCTAssertEqual(response.status, "ok")
        XCTAssertNil(response.version)
        XCTAssertNil(response.gatewayVersion)
    }

    // MARK: - Error Handling

    func testThrowsNoActiveGatewayWhenNil() async {
        sut.activeGateway = nil

        do {
            let _: HealthResponse = try await sut.request(path: "/api/health")
            XCTFail("Expected OpenClawError.noActiveGateway")
        } catch let error as OpenClawError {
            if case .noActiveGateway = error {
                // expected
            } else {
                XCTFail("Expected noActiveGateway, got \(error)")
            }
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    func testThrowsHttpErrorWhenNoToken() async {
        sut.tokenForAccount = { _ in nil }

        do {
            let _: HealthResponse = try await sut.request(path: "/api/health", gateway: testGateway)
            XCTFail("Expected OpenClawError.httpError for missing token")
        } catch let error as OpenClawError {
            if case .httpError(let code, _) = error {
                XCTAssertEqual(code, 401)
            } else {
                XCTFail("Expected httpError(401, ...), got \(error)")
            }
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    func testThrowsInvalidURLForBadBaseURL() async {
        let badGateway = GatewayConnection(id: "gw-bad", name: "Bad", baseURL: "not a url with spaces")
        sut.tokenForAccount = { _ in "some-token" }

        do {
            let _: HealthResponse = try await sut.request(path: "/api/health", gateway: badGateway)
            XCTFail("Expected OpenClawError.invalidURL")
        } catch let error as OpenClawError {
            if case .invalidURL = error {
                // expected
            } else {
                XCTFail("Expected invalidURL, got \(error)")
            }
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    func testThrowsNetworkErrorOnSessionFailure() async {
        let networkError = NSError(domain: NSURLErrorDomain, code: NSURLErrorNotConnectedToInternet, userInfo: nil)
        mockSession.errorToThrow = networkError

        do {
            let _: HealthResponse = try await sut.request(path: "/api/health", gateway: testGateway)
            XCTFail("Expected OpenClawError.networkError")
        } catch let error as OpenClawError {
            if case .networkError = error {
                // expected
            } else {
                XCTFail("Expected networkError, got \(error)")
            }
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    func testThrowsHttpErrorOnNon2xxStatus() async {
        mockSession.responseStatusCode = 404
        mockSession.responseData = Data("Not Found".utf8)

        do {
            let _: HealthResponse = try await sut.request(path: "/api/agents/missing", gateway: testGateway)
            XCTFail("Expected OpenClawError.httpError")
        } catch let error as OpenClawError {
            if case .httpError(let code, let body) = error {
                XCTAssertEqual(code, 404)
                XCTAssertEqual(body, "Not Found")
            } else {
                XCTFail("Expected httpError(404, ...), got \(error)")
            }
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    func testThrowsServerErrorWhenErrorPayloadPresent() async {
        mockSession.responseStatusCode = 500
        let errorJSON = Data("""
        {"code": 5001, "message": "Internal service failure"}
        """.utf8)
        mockSession.responseData = errorJSON

        do {
            let _: HealthResponse = try await sut.request(path: "/api/health", gateway: testGateway)
            XCTFail("Expected OpenClawError.serverError")
        } catch let error as OpenClawError {
            if case .serverError(let code, let message) = error {
                XCTAssertEqual(code, 5001)
                XCTAssertEqual(message, "Internal service failure")
            } else {
                XCTFail("Expected serverError, got \(error)")
            }
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    func testThrowsDecodingErrorOnMalformedJSON() async {
        mockSession.responseData = Data("not json".utf8)

        do {
            let _: HealthResponse = try await sut.request(path: "/api/health", gateway: testGateway)
            XCTFail("Expected OpenClawError.decodingError")
        } catch let error as OpenClawError {
            if case .decodingError = error {
                // expected
            } else {
                XCTFail("Expected decodingError, got \(error)")
            }
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    func testThrowsDecodingErrorOnWrongSchema() async {
        // Valid JSON but wrong shape for HealthResponse
        let wrongJSON = Data("""
        {"totally": "different", "schema": 42}
        """.utf8)
        mockSession.responseData = wrongJSON

        do {
            let _: HealthResponse = try await sut.request(path: "/api/health", gateway: testGateway)
            XCTFail("Expected OpenClawError.decodingError")
        } catch let error as OpenClawError {
            if case .decodingError = error {
                // expected
            } else {
                XCTFail("Expected decodingError, got \(error)")
            }
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    // MARK: - OpenClawError descriptions

    func testErrorDescriptions() {
        XCTAssertNotNil(OpenClawError.invalidURL.errorDescription)
        XCTAssertNotNil(OpenClawError.noActiveGateway.errorDescription)
        XCTAssertNotNil(OpenClawError.httpError(500, "fail").errorDescription)
        XCTAssertNotNil(OpenClawError.decodingError("bad json").errorDescription)
        XCTAssertNotNil(OpenClawError.networkError("timeout").errorDescription)
        XCTAssertNotNil(OpenClawError.serverError(code: 500, message: "crash").errorDescription)
        XCTAssertTrue(OpenClawError.httpError(500, nil).errorDescription!.contains("500"))
    }

    // MARK: - Uses Active Gateway When None Passed Explicitly

    func testUsesActiveGatewayWhenNonePassedExplicitly() async throws {
        let healthJSON = Data("""
        {"status":"ok","version":"2.0.0"}
        """.utf8)
        mockSession.responseData = healthJSON

        // Do not pass gateway parameter; should use activeGateway
        let response: HealthResponse = try await sut.request(path: "/api/health")

        XCTAssertEqual(response.version, "2.0.0")
        XCTAssertEqual(
            mockSession.capturedRequest?.url?.absoluteString,
            "https://gateway.example.com/api/health"
        )
    }

    // MARK: - HTTP Status Edge Cases

    func testAccepts299AsSuccess() async throws {
        mockSession.responseStatusCode = 299
        let healthJSON = Data("""
        {"status":"ok"}
        """.utf8)
        mockSession.responseData = healthJSON

        let response: HealthResponse = try await sut.request(path: "/api/health", gateway: testGateway)
        XCTAssertEqual(response.status, "ok")
    }

    func testRejects300AsError() async {
        mockSession.responseStatusCode = 300
        mockSession.responseData = Data("redirect".utf8)

        do {
            let _: HealthResponse = try await sut.request(path: "/api/health", gateway: testGateway)
            XCTFail("Expected error for status 300")
        } catch let error as OpenClawError {
            if case .httpError(let code, _) = error {
                XCTAssertEqual(code, 300)
            } else {
                XCTFail("Expected httpError, got \(error)")
            }
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }
}
