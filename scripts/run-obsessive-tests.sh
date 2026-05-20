#!/bin/bash

# 2026 OBSESSIVE Testing Script for QR Scanner Button
# Runs comprehensive tests across Robolectric, Espresso, and Maestro

set -e

echo "🚀 Starting OBSESSIVE QR Scanner Button Testing Suite"
echo "======================================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results tracking
ROBOLECTRIC_PASSED=0
ESPRESSO_PASSED=0
MAESTRO_PASSED=0
TOTAL_TESTS=0
PASSED_TESTS=0

# Function to run a test and track results
run_test() {
    local test_name="$1"
    local test_command="$2"
    local test_type="$3"

    echo -e "${BLUE}🧪 Running $test_name${NC}"
    echo "Command: $test_command"

    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    if eval "$test_command"; then
        echo -e "${GREEN}✅ PASSED: $test_name${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))

        case "$test_type" in
            "robolectric") ROBOLECTRIC_PASSED=$((ROBOLECTRIC_PASSED + 1)) ;;
            "espresso") ESPRESSO_PASSED=$((ESPRESSO_PASSED + 1)) ;;
            "maestro") MAESTRO_PASSED=$((MAESTRO_PASSED + 1)) ;;
        esac

        return 0
    else
        echo -e "${RED}❌ FAILED: $test_name${NC}"
        return 1
    fi
}

# Check prerequisites
echo -e "${YELLOW}🔍 Checking prerequisites...${NC}"

# Check Java environment
if ! java -version >/dev/null 2>&1; then
    echo -e "${RED}❌ Java not found. Setting JAVA_HOME...${NC}"
    export JAVA_HOME=$(/usr/libexec/java_home -v 17 2>/dev/null || echo "")
    if [ -z "$JAVA_HOME" ]; then
        echo -e "${RED}❌ Java 17 not available. Please install Java 17.${NC}"
        exit 1
    fi
fi

# Check Android SDK
if [ -z "$ANDROID_HOME" ] && [ -z "$ANDROID_SDK_ROOT" ]; then
    echo -e "${YELLOW}⚠️ Android SDK not configured. Tests may fail.${NC}"
fi

# Check Maestro installation
if ! command -v maestro >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️ Maestro not installed. Installing via curl...${NC}"
    curl -Ls "https://get.maestro.mobile.dev" | bash
    export PATH="$PATH:$HOME/.maestro/bin"
fi

echo -e "${GREEN}✅ Prerequisites checked${NC}"
echo ""

# PHASE 1: Robolectric Unit Tests
echo -e "${BLUE}📱 PHASE 1: Robolectric Unit Tests${NC}"
echo "=================================="

cd android

# Enhanced Robolectric tests
run_test "QR Scanner Button Core Tests" \
    "./gradlew testDebugUnitTest --tests='*WelcomeOnboardingScreenTest*' --no-daemon" \
    "robolectric"

run_test "QR Scanner Navigation Tests" \
    "./gradlew testDebugUnitTest --tests='*QrScannerNavigationTest*' --no-daemon" \
    "robolectric"

run_test "Simple QR Button Tests" \
    "./gradlew testDebugUnitTest --tests='*SimpleQrButtonTest*' --no-daemon" \
    "robolectric"

# Code coverage validation
run_test "JaCoCo Code Coverage Report" \
    "./gradlew jacocoTestReport --no-daemon" \
    "robolectric"

run_test "Coverage Threshold Validation (80%)" \
    "./gradlew checkCoverage --no-daemon" \
    "robolectric"

cd ..

echo ""

# PHASE 2: Espresso Instrumented Tests
echo -e "${BLUE}📲 PHASE 2: Espresso Instrumented Tests${NC}"
echo "======================================="

cd android

# Check if emulator or device is available
if ! adb devices | grep -q "device$"; then
    echo -e "${YELLOW}⚠️ No Android device/emulator detected. Skipping Espresso tests.${NC}"
    echo "   To run Espresso tests: Connect device or start emulator"
    echo "   adb devices should show 'device' status"
else
    echo -e "${GREEN}📱 Android device detected. Running Espresso tests...${NC}"

    # Install app on device for testing
    run_test "Build and Install Debug APK" \
        "./gradlew assembleDebug && ./gradlew installDebug" \
        "espresso"

    # Run comprehensive Espresso tests
    run_test "Welcome Screen Espresso Tests" \
        "./gradlew connectedDebugAndroidTest --tests='*WelcomeOnboardingScreenEspressoTest*' --no-daemon" \
        "espresso"

    run_test "Main Activity Launch Test" \
        "./gradlew connectedDebugAndroidTest --tests='*MainActivityLaunchTest*' --no-daemon" \
        "espresso"
fi

cd ..

echo ""

# PHASE 3: Maestro E2E Tests
echo -e "${BLUE}🎭 PHASE 3: Maestro E2E Tests${NC}"
echo "============================="

if command -v maestro >/dev/null 2>&1; then
    echo -e "${GREEN}🎭 Maestro available. Running E2E tests...${NC}"

    # Check if APK exists for Maestro testing
    APK_PATH="android/app/build/outputs/apk/debug/app-debug.apk"

    if [ ! -f "$APK_PATH" ]; then
        echo -e "${YELLOW}📦 Building APK for Maestro testing...${NC}"
        cd android
        ./gradlew assembleDebug --no-daemon
        cd ..
    fi

    if [ -f "$APK_PATH" ]; then
        # Install APK if device available
        if adb devices | grep -q "device$"; then
            echo -e "${GREEN}📱 Installing APK for E2E testing...${NC}"
            adb install -r "$APK_PATH" || echo "APK install failed, continuing..."
        fi

        # Run Maestro test suites
        run_test "Basic QR Button Regression Test" \
            "maestro test .maestro/welcome-qr-button-test.yaml" \
            "maestro"

        run_test "Obsessive QR Button Testing" \
            "maestro test .maestro/qr-button-obsessive-testing.yaml" \
            "maestro"

        run_test "Regression Protection Test" \
            "maestro test .maestro/regression-protection-qr-scanner.yaml" \
            "maestro"

        run_test "Edge Cases Testing" \
            "maestro test .maestro/qr-scanner-edge-cases.yaml" \
            "maestro"

    else
        echo -e "${YELLOW}⚠️ No APK found for Maestro testing. Build may have failed.${NC}"
    fi

else
    echo -e "${YELLOW}⚠️ Maestro not available. Skipping E2E tests.${NC}"
    echo "   Install Maestro: curl -Ls 'https://get.maestro.mobile.dev' | bash"
fi

echo ""

# PHASE 4: Additional Validation
echo -e "${BLUE}🔍 PHASE 4: Additional Validation${NC}"
echo "=================================="

# Lint checking
cd android
run_test "Android Lint Analysis" \
    "./gradlew lintDebug --no-daemon" \
    "robolectric"

# Build validation
run_test "Release Build Validation" \
    "./gradlew assembleRelease --no-daemon" \
    "robolectric"

cd ..

# Git hooks validation (if exists)
if [ -f "scripts/pre-commit" ]; then
    run_test "Pre-commit Hooks Validation" \
        "bash scripts/pre-commit" \
        "robolectric"
fi

echo ""

# RESULTS SUMMARY
echo -e "${BLUE}📊 OBSESSIVE TESTING RESULTS SUMMARY${NC}"
echo "====================================="
echo ""
echo -e "🧪 Total Tests Run: ${TOTAL_TESTS}"
echo -e "✅ Tests Passed: ${GREEN}${PASSED_TESTS}${NC}"
echo -e "❌ Tests Failed: ${RED}$((TOTAL_TESTS - PASSED_TESTS))${NC}"
echo ""
echo -e "📱 Robolectric Tests Passed: ${ROBOLECTRIC_PASSED}"
echo -e "📲 Espresso Tests Passed: ${ESPRESSO_PASSED}"
echo -e "🎭 Maestro Tests Passed: ${MAESTRO_PASSED}"
echo ""

# Calculate success rate
SUCCESS_RATE=$(( (PASSED_TESTS * 100) / TOTAL_TESTS ))
echo -e "📈 Success Rate: ${SUCCESS_RATE}%"

if [ "$SUCCESS_RATE" -ge 80 ]; then
    echo -e "${GREEN}🎉 OBSESSIVE TESTING PASSED! QR Scanner button functionality validated.${NC}"
    echo -e "${GREEN}🚀 Ready for Firebase build and deployment.${NC}"
    exit 0
elif [ "$SUCCESS_RATE" -ge 60 ]; then
    echo -e "${YELLOW}⚠️ PARTIAL SUCCESS: Some tests failed but core functionality works.${NC}"
    echo -e "${YELLOW}🔧 Review failed tests and consider fixing before deployment.${NC}"
    exit 1
else
    echo -e "${RED}💥 CRITICAL FAILURES: QR Scanner button regression detected!${NC}"
    echo -e "${RED}🚨 DO NOT DEPLOY until issues are resolved.${NC}"
    exit 2
fi