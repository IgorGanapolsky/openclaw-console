// Tests/GitViewModelTests.swift
// OpenClaw Work Console
// Unit tests for GitViewModel state and injected Gateway APIs.

import Combine
import XCTest
@testable import OpenClawConsole

final class GitViewModelTests: XCTestCase {

    private var webSocket: MockGitWebSocket!
    private var api: MockGitAPI!
    private var viewModel: GitViewModel!

    override func setUp() {
        super.setUp()
        webSocket = MockGitWebSocket()
        api = MockGitAPI()
        viewModel = GitViewModel(webSocket: webSocket, apiService: api)
    }

    override func tearDown() {
        viewModel = nil
        api = nil
        webSocket = nil
        super.tearDown()
    }

    func testLoadGitStateCopiesAgentStateAndFetchesDetails() async {
        api.fileChanges = [
            GitFileChange(path: "OpenClawConsole/App.swift", status: .modified, additions: 3, deletions: 1)
        ]
        api.commitHistory = [
            GitCommit(
                sha: "abc123def456",
                message: "Test commit",
                author: "OpenClaw",
                date: Date(),
                shortSha: "abc123d"
            )
        ]
        let gitState = makeGitState(hasUncommittedChanges: true, aheadBy: 2)

        await viewModel.loadGitState(for: makeAgent(gitState: gitState))

        XCTAssertEqual(viewModel.gitState, gitState)
        XCTAssertEqual(viewModel.fileChanges.map(\.path), ["OpenClawConsole/App.swift"])
        XCTAssertEqual(viewModel.commitHistory.map(\.shortSha), ["abc123d"])
        XCTAssertTrue(viewModel.hasChanges)
        XCTAssertTrue(viewModel.needsSync)
        XCTAssertFalse(viewModel.isLoading)
        XCTAssertNil(viewModel.errorMessage)
        XCTAssertEqual(api.fetchedFileChangeAgentIds, ["test-agent"])
        XCTAssertEqual(api.fetchedCommitHistoryRequests.map(\.agentId), ["test-agent"])
    }

    func testRefreshGitStateUsesLoadedAgentId() async {
        await viewModel.loadGitState(for: makeAgent(gitState: makeGitState()))

        await viewModel.refreshGitState()

        XCTAssertEqual(api.refreshedAgentIds, ["test-agent"])
        XCTAssertFalse(viewModel.isLoading)
    }

    func testGitStateChangedEventUpdatesCurrentAgentOnly() async {
        await viewModel.loadGitState(for: makeAgent(gitState: makeGitState(repository: "initial/repo")))

        webSocket.simulateEvent(.gitStateChanged("other-agent", makeGitState(repository: "other/repo")))
        await settleMainQueue()
        XCTAssertEqual(viewModel.gitState?.repository, "initial/repo")

        webSocket.simulateEvent(.gitStateChanged("test-agent", makeGitState(repository: "updated/repo")))
        await settleMainQueue()
        XCTAssertEqual(viewModel.gitState?.repository, "updated/repo")
    }

    func testHasConflictsAndStatusText() async {
        await viewModel.loadGitState(for: makeAgent(gitState: makeGitState(conflictCount: 3)))

        XCTAssertTrue(viewModel.hasConflicts)
        XCTAssertTrue(viewModel.statusText.contains("3 conflicts"))
    }

    func testGitStateCodingRoundTrip() throws {
        let originalState = makeGitState(
            repository: "github.com/user/repo",
            hasUncommittedChanges: true,
            aheadBy: 2,
            behindBy: 1,
            protectionEnabled: true
        )

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let encodedData = try encoder.encode(originalState)

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decodedState = try decoder.decode(GitState.self, from: encodedData)

        XCTAssertEqual(originalState, decodedState)
    }

    func testGitFileChangeCodingRoundTrip() throws {
        let originalChange = GitFileChange(path: "src/main.swift", status: .modified, additions: 15, deletions: 3)

        let encodedData = try JSONEncoder().encode(originalChange)
        let decodedChange = try JSONDecoder().decode(GitFileChange.self, from: encodedData)

        XCTAssertEqual(originalChange.path, decodedChange.path)
        XCTAssertEqual(originalChange.status, decodedChange.status)
        XCTAssertEqual(originalChange.additions, decodedChange.additions)
        XCTAssertEqual(originalChange.deletions, decodedChange.deletions)
    }

    func testGitChangeStatusProperties() {
        for status in GitChangeStatus.allCases {
            XCTAssertFalse(status.displayName.isEmpty)
            XCTAssertFalse(status.symbolName.isEmpty)
        }
    }

    private func makeAgent(gitState: GitState?) -> Agent {
        Agent(
            id: "test-agent",
            name: "Test Agent",
            description: "Test agent for unit tests",
            status: .online,
            workspace: "/tmp/test",
            tags: ["test"],
            lastActive: Date(),
            activeTasks: 0,
            pendingApprovals: 0,
            gitState: gitState
        )
    }

    private func makeGitState(
        repository: String = "test/repo",
        hasUncommittedChanges: Bool = false,
        aheadBy: Int = 0,
        behindBy: Int = 0,
        protectionEnabled: Bool = false,
        conflictCount: Int = 0
    ) -> GitState {
        GitState(
            repository: repository,
            currentBranch: "main",
            hasUncommittedChanges: hasUncommittedChanges,
            aheadBy: aheadBy,
            behindBy: behindBy,
            lastCommitSha: "abc123def456",
            lastCommitMessage: "Test commit",
            lastCommitAuthor: "Test Author",
            lastCommitDate: Date(timeIntervalSince1970: 1_700_000_000),
            protectionEnabled: protectionEnabled,
            conflictCount: conflictCount
        )
    }

    private func settleMainQueue() async {
        await MainActor.run {}
        try? await Task.sleep(nanoseconds: 50_000_000)
    }
}

private final class MockGitWebSocket: WebSocketEventPublishing {
    private let subject = PassthroughSubject<InboundEvent, Never>()

    var eventPublisher: AnyPublisher<InboundEvent, Never> {
        subject.eraseToAnyPublisher()
    }

    func simulateEvent(_ event: InboundEvent) {
        subject.send(event)
    }
}

private final class MockGitAPI: GitAPIProviding {
    var fileChanges: [GitFileChange] = []
    var commitHistory: [GitCommit] = []
    var errorToThrow: Error?
    var fetchedFileChangeAgentIds: [String] = []
    var fetchedCommitHistoryRequests: [(agentId: String, limit: Int)] = []
    var refreshedAgentIds: [String] = []

    func fetchGitFileChanges(agentId: String) async throws -> [GitFileChange] {
        fetchedFileChangeAgentIds.append(agentId)
        if let errorToThrow {
            throw errorToThrow
        }
        return fileChanges
    }

    func fetchGitCommitHistory(agentId: String, limit: Int) async throws -> [GitCommit] {
        fetchedCommitHistoryRequests.append((agentId, limit))
        if let errorToThrow {
            throw errorToThrow
        }
        return commitHistory
    }

    func refreshGitStatus(agentId: String) async throws {
        refreshedAgentIds.append(agentId)
        if let errorToThrow {
            throw errorToThrow
        }
    }
}
