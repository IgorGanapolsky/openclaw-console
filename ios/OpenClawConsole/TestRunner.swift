#!/usr/bin/env swift

// TestRunner.swift
// A simple test runner for iOS unit tests when Xcode configuration is complex

import Foundation
import XCTest

// This would normally be in the test target, but for simplicity we'll define a basic version here
class SimpleGitViewModelTests: XCTestCase {

    func testBasicGitStateProperties() {
        // Test that we can create GitState objects with expected values
        let gitState = GitState(
            repository: "test/repo",
            currentBranch: "main",
            hasUncommittedChanges: true,
            aheadBy: 2,
            behindBy: 1,
            lastCommitSha: "abc123",
            lastCommitMessage: "Test commit",
            lastCommitAuthor: "Test Author",
            lastCommitDate: Date(),
            protectionEnabled: false,
            conflictCount: 0
        )

        XCTAssertEqual(gitState.repository, "test/repo")
        XCTAssertEqual(gitState.currentBranch, "main")
        XCTAssertTrue(gitState.hasUncommittedChanges)
        XCTAssertEqual(gitState.aheadBy, 2)
        XCTAssertEqual(gitState.behindBy, 1)
        XCTAssertEqual(gitState.conflictCount, 0)

        print("✅ testBasicGitStateProperties passed")
    }

    func testGitChangeStatus() {
        // Test GitChangeStatus enum
        let statuses: [GitChangeStatus] = [.added, .modified, .deleted, .renamed, .copied, .untracked]

        for status in statuses {
            XCTAssertFalse(status.displayName.isEmpty, "displayName should not be empty for \(status)")
            XCTAssertFalse(status.symbolName.isEmpty, "symbolName should not be empty for \(status)")
        }

        print("✅ testGitChangeStatus passed")
    }

    func testGitFileChange() {
        let fileChange = GitFileChange(
            path: "src/main.swift",
            status: .modified,
            additions: 10,
            deletions: 5
        )

        XCTAssertEqual(fileChange.path, "src/main.swift")
        XCTAssertEqual(fileChange.status, .modified)
        XCTAssertEqual(fileChange.additions, 10)
        XCTAssertEqual(fileChange.deletions, 5)

        print("✅ testGitFileChange passed")
    }
}

// Run the tests
class TestRunner {
    static func run() {
        print("🧪 Running iOS Simulator Tests...")

        let testSuite = SimpleGitViewModelTests.defaultTestSuite
        let testRun = testSuite.run()

        if testRun.hasSucceeded {
            print("✅ All tests PASSED")
            exit(0)
        } else {
            print("❌ Tests FAILED")
            exit(1)
        }
    }
}

TestRunner.run()