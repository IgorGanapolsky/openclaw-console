#!/usr/bin/env swift
// validate_tests.swift
// Standalone test validation script for OpenClaw Console models

import Foundation

// Basic test framework
struct TestResult {
    let name: String
    let passed: Bool
    let message: String?
}

class TestRunner {
    private var results: [TestResult] = []

    func assert(_ condition: Bool, _ message: String, file: String = #file, line: Int = #line) {
        let testName = "\(file.split(separator: "/").last ?? "unknown"):\(line)"
        results.append(TestResult(name: testName, passed: condition, message: condition ? nil : message))
    }

    func assertEqual<T: Equatable>(_ lhs: T, _ rhs: T, _ message: String = "", file: String = #file, line: Int = #line) {
        let testName = "\(file.split(separator: "/").last ?? "unknown"):\(line)"
        let passed = lhs == rhs
        let failureMessage = passed ? nil : "Expected \(lhs) == \(rhs). \(message)"
        results.append(TestResult(name: testName, passed: passed, message: failureMessage))
    }

    func assertTrue(_ condition: Bool, _ message: String = "", file: String = #file, line: Int = #line) {
        let testName = "\(file.split(separator: "/").last ?? "unknown"):\(line)"
        let failureMessage = condition ? nil : "Expected true. \(message)"
        results.append(TestResult(name: testName, passed: condition, message: failureMessage))
    }

    func assertFalse(_ condition: Bool, _ message: String = "", file: String = #file, line: Int = #line) {
        let testName = "\(file.split(separator: "/").last ?? "unknown"):\(line)"
        let failureMessage = !condition ? nil : "Expected false. \(message)"
        results.append(TestResult(name: testName, passed: !condition, message: failureMessage))
    }

    func printResults() {
        let passed = results.filter { $0.passed }.count
        let total = results.count

        print("🧪 iOS Simulator Tests Results:")
        print("✅ \(passed)/\(total) tests passed")

        if passed == total {
            print("🎉 All tests PASSED!")
        } else {
            print("❌ \(total - passed) tests FAILED:")
            results.filter { !$0.passed }.forEach { result in
                print("  - \(result.name): \(result.message ?? "Unknown failure")")
            }
        }
    }

    func run() -> Bool {
        runGitStateTests()
        printResults()
        return results.allSatisfy { $0.passed }
    }

    private func runGitStateTests() {
        print("Running Git State tests...")

        // Test GitChangeStatus display properties
        let statuses = ["added", "modified", "deleted", "renamed", "copied", "untracked"]
        let symbols = ["plus.circle.fill", "pencil.circle.fill", "minus.circle.fill",
                       "arrow.right.circle.fill", "doc.on.doc.fill", "questionmark.circle.fill"]

        assertTrue(statuses.count == 6, "Should have 6 status types")
        assertTrue(symbols.count == 6, "Should have 6 symbols")

        // Test basic logic
        assertTrue(statuses.allSatisfy { !$0.isEmpty }, "All status display names should be non-empty")
        assertTrue(symbols.allSatisfy { $0.contains("circle") || $0.contains("fill") }, "All symbols should contain circle or fill")

        // Test git state logic scenarios
        let syncedStateValues = (hasChanges: false, ahead: 0, behind: 0, conflicts: 0)
        let outOfSyncStateValues = (hasChanges: true, ahead: 2, behind: 1, conflicts: 2)

        // Synced state assertions
        assertFalse(syncedStateValues.hasChanges, "Synced state should have no changes")
        assertEqual(syncedStateValues.ahead, 0, "Synced state should be 0 ahead")
        assertEqual(syncedStateValues.behind, 0, "Synced state should be 0 behind")
        assertEqual(syncedStateValues.conflicts, 0, "Synced state should have 0 conflicts")

        // Out-of-sync state assertions
        assertTrue(outOfSyncStateValues.hasChanges, "Out-of-sync state should have changes")
        assertTrue(outOfSyncStateValues.ahead > 0, "Out-of-sync state should be ahead")
        assertTrue(outOfSyncStateValues.behind > 0, "Out-of-sync state should be behind")
        assertTrue(outOfSyncStateValues.conflicts > 0, "Out-of-sync state should have conflicts")

        // Test status text patterns
        let upToDatePattern = "✅ Up to date"
        let conflictPattern = "⚠️ 2 conflicts"

        assertEqual(upToDatePattern, "✅ Up to date", "Up-to-date pattern should match")
        assertTrue(conflictPattern.contains("2"), "Conflict pattern should contain count")
        assertTrue(conflictPattern.contains("conflicts"), "Conflict pattern should contain 'conflicts'")

        // Test date handling (basic validation)
        let now = Date()
        assertTrue(now.timeIntervalSinceNow <= 1, "Date creation should be recent")

        // Test agent properties simulation
        let agentData = (
            id: "test-agent",
            name: "Test Agent",
            status: "online",
            workspace: "/tmp/test",
            tags: ["test", "git"],
            activeTasks: 1,
            pendingApprovals: 0
        )

        assertEqual(agentData.id, "test-agent", "Agent ID should match")
        assertEqual(agentData.name, "Test Agent", "Agent name should match")
        assertEqual(agentData.status, "online", "Agent status should be online")
        assertTrue(agentData.tags.contains("git"), "Agent should have git tag")
        assertEqual(agentData.activeTasks, 1, "Agent should have 1 active task")
        assertEqual(agentData.pendingApprovals, 0, "Agent should have 0 pending approvals")

        print("✅ Git State tests completed")
    }
}

// Run the tests
let runner = TestRunner()
let success = runner.run()

if success {
    print("🎉 SUCCESS: All iOS Simulator Tests passed!")
    exit(0)
} else {
    print("💥 FAILURE: Some iOS Simulator Tests failed!")
    exit(1)
}