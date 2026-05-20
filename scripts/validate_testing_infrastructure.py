#!/usr/bin/env python3
"""
Validation script for 2026 Android Testing Infrastructure
Verifies that all testing components are properly implemented.
"""
import os
import re
import sys
from pathlib import Path


def check_file_exists(path, description):
    """Check if a file exists and report the result."""
    if os.path.exists(path):
        print(f"✅ {description}: {path}")
        return True
    else:
        print(f"❌ {description} MISSING: {path}")
        return False


def check_file_contains(path, pattern, description):
    """Check if a file contains a specific pattern."""
    try:
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
            if re.search(pattern, content, re.MULTILINE):
                print(f"✅ {description}")
                return True
            else:
                print(f"❌ {description} - Pattern not found: {pattern}")
                return False
    except FileNotFoundError:
        print(f"❌ {description} - File not found: {path}")
        return False


def validate_build_configuration():
    """Validate Android build configuration for testing."""
    print("\n🔍 Validating Android Build Configuration...")

    build_gradle = "android/app/build.gradle.kts"
    checks = [
        (r'id\("jacoco"\)', "JaCoCo plugin enabled"),
        (r'testImplementation\("org\.robolectric:robolectric:', "Robolectric dependency"),
        (r'testImplementation\("io\.mockk:mockk:', "MockK dependency"),
        (r'testImplementation\("app\.cash\.turbine:turbine:', "Turbine dependency"),
        (r'isIncludeAndroidResources = true', "Android resources in unit tests"),
        (r'tasks\.register<JacocoReport>\("jacocoTestReport"\)', "JaCoCo report task"),
        (r'tasks\.register\("checkCoverage"\)', "Coverage check task"),
    ]

    results = []
    for pattern, description in checks:
        results.append(check_file_contains(build_gradle, pattern, description))

    return all(results)


def validate_pre_commit_hooks():
    """Validate pre-commit hook implementation."""
    print("\n🔍 Validating Pre-commit Testing Hooks...")

    pre_commit_script = "scripts/pre-commit"
    checks = [
        (r'testDebugUnitTest', "Unit test execution"),
        (r'checkCoverage', "Coverage check enforcement"),
        (r'compileDebugAndroidTestSources', "Test compilation check"),
        (r'2026 TESTING ENFORCEMENT', "2026 testing section"),
        (r'80% threshold', "Coverage threshold documentation"),
    ]

    results = []
    for pattern, description in checks:
        results.append(check_file_contains(pre_commit_script, pattern, description))

    return all(results)


def validate_test_files():
    """Validate that test files are properly implemented."""
    print("\n🔍 Validating Test File Implementation...")

    test_files = [
        ("android/app/src/test/java/com/openclaw/console/ui/screens/onboarding/WelcomeOnboardingScreenTest.kt",
         "WelcomeOnboardingScreen unit test"),
        ("android/app/src/test/java/com/openclaw/console/ui/navigation/QrScannerNavigationTest.kt",
         "QR Scanner navigation test"),
    ]

    results = []
    for test_file, description in test_files:
        results.append(check_file_exists(test_file, description))
        if os.path.exists(test_file):
            # Check for essential test patterns
            results.append(check_file_contains(test_file, r'@Test', f"{description} - has test methods"))
            results.append(check_file_contains(test_file, r'RobolectricTestRunner', f"{description} - uses Robolectric"))
            results.append(check_file_contains(test_file, r'QR.*[Ss]canner|onAddGateway', f"{description} - tests QR functionality"))

    return all(results)


def validate_maestro_tests():
    """Validate Maestro E2E tests."""
    print("\n🔍 Validating Maestro E2E Tests...")

    maestro_tests = [
        (".maestro/welcome-qr-button-test.yaml", "Welcome QR button specific test"),
        (".maestro/qr-scanner-regression-test.yaml", "General QR scanner regression test"),
    ]

    results = []
    for test_file, description in maestro_tests:
        if check_file_exists(test_file, description):
            results.append(check_file_contains(test_file, r'STEP 2: Scan QR Code|Enhanced QR Scanner',
                                             f"{description} - tests QR button"))
            results.append(check_file_contains(test_file, r'appId: com\.openclaw\.console',
                                             f"{description} - correct app ID"))
        else:
            results.append(False)

    return all(results)


def validate_ci_workflow():
    """Validate CI workflow enhancements."""
    print("\n🔍 Validating CI Workflow Enhancements...")

    ci_workflow = ".github/workflows/ci.yml"
    checks = [
        (r'jacocoTestReport', "JaCoCo coverage in CI"),
        (r'checkCoverage', "Coverage enforcement in CI"),
        (r'compileDebugAndroidTestSources', "Test compilation in CI"),
        (r'comprehensive.*test.*suite', "Comprehensive testing mention"),
        (r'android-coverage-reports', "Coverage report upload"),
    ]

    results = []
    for pattern, description in checks:
        results.append(check_file_contains(ci_workflow, pattern, description))

    return all(results)


def validate_documentation():
    """Validate testing policy documentation."""
    print("\n🔍 Validating Testing Documentation...")

    doc_file = "docs/testing-policy-2026.md"
    checks = [
        (r'80%.*minimum.*coverage', "Coverage requirement"),
        (r'Robolectric', "Robolectric mentioned"),
        (r'Pre-Commit.*Testing.*Enforcement', "Pre-commit enforcement"),
        (r'QR.*[Ss]canner.*[Bb]utton', "QR scanner regression mention"),
        (r'Staging-First.*Deployment', "Staging-first deployment"),
    ]

    results = [check_file_exists(doc_file, "Testing policy documentation")]
    for pattern, description in checks:
        results.append(check_file_contains(doc_file, pattern, description))

    return all(results)


def main():
    """Run all validation checks."""
    print("🧪 OpenClaw Console - 2026 Testing Infrastructure Validation")
    print("=" * 60)

    validations = [
        ("Build Configuration", validate_build_configuration),
        ("Pre-commit Hooks", validate_pre_commit_hooks),
        ("Test Files", validate_test_files),
        ("Maestro E2E Tests", validate_maestro_tests),
        ("CI Workflow", validate_ci_workflow),
        ("Documentation", validate_documentation),
    ]

    results = []
    for name, validator in validations:
        try:
            result = validator()
            results.append(result)
            if result:
                print(f"\n✅ {name} validation PASSED")
            else:
                print(f"\n❌ {name} validation FAILED")
        except Exception as e:
            print(f"\n💥 {name} validation ERROR: {e}")
            results.append(False)

    print("\n" + "=" * 60)
    passed = sum(results)
    total = len(results)

    if all(results):
        print(f"🎉 ALL VALIDATIONS PASSED ({passed}/{total})")
        print("2026 Android Testing Infrastructure is properly implemented!")
        return 0
    else:
        print(f"⚠️  VALIDATION SUMMARY: {passed}/{total} passed")
        print("Some components need attention before the testing infrastructure is complete.")
        return 1


if __name__ == "__main__":
    sys.exit(main())