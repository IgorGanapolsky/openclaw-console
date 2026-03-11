// Tests/GitViewModelTests.swift
// OpenClaw Work Console
// Unit tests for Git-related models and basic functionality.

import XCTest
@testable import OpenClawConsole

// MARK: - Git State Tests

final class GitStateTests: XCTestCase {

    func testGitStateCoding() throws {
        let originalState = GitState(
            repository: "github.com/user/repo",
            currentBranch: "feature/test",
            hasUncommittedChanges: true,
            aheadBy: 2,
            behindBy: 1,
            lastCommitSha: "abc123def456",
            lastCommitMessage: "Test commit message",
            lastCommitAuthor: "Test Author",
            lastCommitDate: Date(),
            protectionEnabled: true,
            conflictCount: 0
        )

        // Test encoding
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let encodedData = try encoder.encode(originalState)

        // Test decoding
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decodedState = try decoder.decode(GitState.self, from: encodedData)

        // Verify all fields match
        XCTAssertEqual(originalState.repository, decodedState.repository)
        XCTAssertEqual(originalState.currentBranch, decodedState.currentBranch)
        XCTAssertEqual(originalState.hasUncommittedChanges, decodedState.hasUncommittedChanges)
        XCTAssertEqual(originalState.aheadBy, decodedState.aheadBy)
        XCTAssertEqual(originalState.behindBy, decodedState.behindBy)
        XCTAssertEqual(originalState.lastCommitSha, decodedState.lastCommitSha)
        XCTAssertEqual(originalState.lastCommitMessage, decodedState.lastCommitMessage)
        XCTAssertEqual(originalState.lastCommitAuthor, decodedState.lastCommitAuthor)
        XCTAssertEqual(originalState.protectionEnabled, decodedState.protectionEnabled)
        XCTAssertEqual(originalState.conflictCount, decodedState.conflictCount)
    }

    func testGitFileChangeCoding() throws {
        let originalChange = GitFileChange(
            path: "src/main.swift",
            status: .modified,
            additions: 15,
            deletions: 3
        )

        // Test encoding
        let encoder = JSONEncoder()
        let encodedData = try encoder.encode(originalChange)

        // Test decoding
        let decoder = JSONDecoder()
        let decodedChange = try decoder.decode(GitFileChange.self, from: encodedData)

        // Verify all fields match
        XCTAssertEqual(originalChange.path, decodedChange.path)
        XCTAssertEqual(originalChange.status, decodedChange.status)
        XCTAssertEqual(originalChange.additions, decodedChange.additions)
        XCTAssertEqual(originalChange.deletions, decodedChange.deletions)
    }

    func testGitChangeStatusProperties() {
        // Test all enum cases have proper display properties
        let allStatuses: [GitChangeStatus] = [.added, .modified, .deleted, .renamed, .copied, .untracked]

        for status in allStatuses {
            XCTAssertFalse(status.displayName.isEmpty)
            XCTAssertFalse(status.symbolName.isEmpty)
            XCTAssertTrue(status.symbolName.contains("circle") || status.symbolName.contains("fill"))
        }
    }

    func testGitStateLogic() {
        // Test basic GitState properties and logic
        let syncedState = GitState(
            repository: "test/repo",
            currentBranch: "main",
            hasUncommittedChanges: false,
            aheadBy: 0,
            behindBy: 0,
            lastCommitSha: "abc123",
            lastCommitMessage: "Test commit",
            lastCommitAuthor: "Test Author",
            lastCommitDate: Date(),
            protectionEnabled: false,
            conflictCount: 0
        )

        let outOfSyncState = GitState(
            repository: "test/repo",
            currentBranch: "feature-branch",
            hasUncommittedChanges: true,
            aheadBy: 2,
            behindBy: 1,
            lastCommitSha: "def456",
            lastCommitMessage: "Feature commit",
            lastCommitAuthor: "Feature Author",
            lastCommitDate: Date(),
            protectionEnabled: true,
            conflictCount: 2
        )

        // Test synced state
        XCTAssertFalse(syncedState.hasUncommittedChanges)
        XCTAssertEqual(syncedState.aheadBy, 0)
        XCTAssertEqual(syncedState.behindBy, 0)
        XCTAssertEqual(syncedState.conflictCount, 0)

        // Test out-of-sync state
        XCTAssertTrue(outOfSyncState.hasUncommittedChanges)
        XCTAssertGreaterThan(outOfSyncState.aheadBy, 0)
        XCTAssertGreaterThan(outOfSyncState.behindBy, 0)
        XCTAssertGreaterThan(outOfSyncState.conflictCount, 0)
    }

    func testAgentWithGitState() {
        // Test Agent model with GitState
        let gitState = GitState(
            repository: "test/repo",
            currentBranch: "main",
            hasUncommittedChanges: true,
            aheadBy: 1,
            behindBy: 0,
            lastCommitSha: "abc123",
            lastCommitMessage: "Test commit",
            lastCommitAuthor: "Test Author",
            lastCommitDate: Date(),
            protectionEnabled: false,
            conflictCount: 0
        )

        let agent = Agent(
            id: "test-agent",
            name: "Test Agent",
            description: "Test agent with git state",
            status: .online,
            workspace: "/tmp/test",
            tags: ["test", "git"],
            lastActive: Date(),
            activeTasks: 1,
            pendingApprovals: 0,
            gitState: gitState
        )

        XCTAssertEqual(agent.id, "test-agent")
        XCTAssertEqual(agent.name, "Test Agent")
        XCTAssertEqual(agent.status, .online)
        XCTAssertNotNil(agent.gitState)
        XCTAssertEqual(agent.gitState?.repository, "test/repo")
        XCTAssertEqual(agent.gitState?.currentBranch, "main")
        XCTAssertTrue(agent.gitState?.hasUncommittedChanges ?? false)
    }
}
