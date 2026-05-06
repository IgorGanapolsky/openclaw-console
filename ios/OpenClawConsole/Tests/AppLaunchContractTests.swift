// Tests/AppLaunchContractTests.swift
// OpenClaw Work Console
// Tests launch-critical app identity contracts used by E2E and store releases.

import XCTest

final class AppLaunchContractTests: XCTestCase {

    func testBundleIdentifierRemainsStableForDeviceAutomation() {
        let testFile = URL(fileURLWithPath: #filePath)
        let packageRoot = testFile
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let plistURL = packageRoot
            .appendingPathComponent("OpenClawConsole")
            .appendingPathComponent("Info.plist")

        guard let plist = NSDictionary(contentsOf: plistURL) as? [String: Any] else {
            XCTFail("Unable to read Info.plist at \(plistURL.path)")
            return
        }

        XCTAssertEqual(plist["CFBundleIdentifier"] as? String, "com.openclaw.console")
    }
}
