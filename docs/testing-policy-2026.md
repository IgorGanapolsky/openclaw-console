# OpenClaw Console Testing Policy 2026

## Overview

This document defines the comprehensive testing infrastructure implemented to prevent app-breaking incidents like the QR scanner button regression. All testing requirements are enforced via pre-commit hooks and CI/CD pipelines.

## Testing Requirements

### Mandatory Test Coverage
- **Minimum Unit Test Coverage: 80%**
- **All UI navigation flows must have tests**
- **All critical user interaction paths must be tested**
- **All ViewModel business logic must be tested**

### Testing Technologies (2026 Stack)

#### Android
- **Unit Tests**: JUnit 4 + Robolectric + MockK
- **UI Tests**: Jetpack Compose Testing + Espresso
- **Coverage**: JaCoCo with 80% minimum threshold
- **Mocking**: MockK (Kotlin-friendly mocking)
- **Flow Testing**: Turbine for Kotlin Flow testing
- **Test Runner**: Robolectric for Android context-aware unit tests

#### iOS
- **Unit Tests**: XCTest
- **UI Tests**: XCTest UI Testing
- **Coverage**: Xcode Code Coverage (built-in)
- **Mocking**: Built-in Swift mocking capabilities

#### E2E Testing
- **Framework**: Maestro
- **Coverage**: All critical user flows
- **Regression Testing**: Specific tests for known regression patterns

### Pre-Commit Testing Enforcement

Every commit that touches production code triggers:

1. **Unit Tests**: All unit tests must pass
2. **Code Coverage**: 80% minimum coverage enforcement
3. **Lint Checks**: Code quality and style enforcement
4. **Test Compilation**: All test files must compile successfully
5. **Architecture Compliance**: Pattern and security checks

### CI/CD Testing Pipeline

#### Pull Request Checks
- Unit test execution
- Code coverage validation
- Test compilation verification
- Architecture ban checks
- Security scanning

#### Staging-First Deployment
1. **Staging**: All tests pass → Deploy to staging environment
2. **Integration Testing**: Automated E2E tests run on staging
3. **Manual QA**: Optional manual testing on staging builds
4. **Production**: Only after staging validation

## Test Categories

### Critical Flow Tests
Tests that prevent user-blocking regressions:

- **Gateway Connection**: QR scanner button functionality
- **Authentication**: Biometric authentication flows
- **Navigation**: Screen-to-screen transitions
- **Data Persistence**: Secure storage operations

### Regression Prevention Tests
Specific tests for known failure patterns:

- **Button Click Handlers**: Ensure all buttons trigger expected actions
- **Navigation Callbacks**: Verify navigation parameter passing
- **Lifecycle Management**: Component lifecycle during navigation
- **Error Handling**: Graceful failure modes

### Performance Tests
- **Memory Usage**: Prevent memory leaks during navigation
- **Battery Impact**: Biometric authentication efficiency
- **Network Usage**: Gateway connection optimization

## Testing Infrastructure Components

### 1. Enhanced Build Configuration (`build.gradle.kts`)
```gradle
// JaCoCo coverage with 80% threshold enforcement
jacoco {
    toolVersion = "0.8.12"
}

// 2026 Testing dependencies
testImplementation("org.robolectric:robolectric:4.15.2")
testImplementation("io.mockk:mockk:1.14.2")
testImplementation("app.cash.turbine:turbine:1.1.0")
```

### 2. Pre-Commit Hook (`scripts/pre-commit`)
Enforces testing requirements before allowing commits:
- Runs unit tests for changed code
- Validates code coverage thresholds
- Ensures test compilation passes
- Performs security and architecture checks

### 3. Maestro E2E Tests
- `welcome-qr-button-test.yaml`: Tests the specific QR scanner regression
- `qr-scanner-regression-test.yaml`: Enhanced version for broader coverage
- `smoke-test-android.yaml`: Basic app functionality verification

### 4. Unit Test Suite
- `WelcomeOnboardingScreenTest.kt`: UI component testing
- `QrScannerNavigationTest.kt`: Navigation flow testing
- Component-specific tests for all ViewModels and UI screens

## Deployment Guardrails

### Branch Protection
- `develop` branch requires:
  - All CI checks passing
  - Code coverage validation
  - Security scanning approval
  - Architecture compliance

### Release Process
1. **Feature Development**: Tests required for all new code
2. **Integration**: Staging deployment with E2E validation
3. **Release Preparation**: Full test suite execution
4. **Production Deployment**: Only after staging validation

### Incident Prevention
- **Automated Testing**: Prevents basic regressions
- **Code Coverage**: Ensures adequate test coverage
- **E2E Testing**: Validates critical user flows
- **Security Scanning**: Prevents security vulnerabilities

## Developer Workflow

### Local Development
1. Write feature code
2. Write corresponding tests (required for coverage)
3. Run local test suite: `./gradlew testDebugUnitTest`
4. Verify coverage: `./gradlew checkCoverage`
5. Commit (triggers pre-commit testing)

### Code Review
- All PRs require test coverage for new code
- Architecture compliance verification
- Security scan validation
- Integration test planning

### Continuous Improvement
- Monitor test reliability and flakiness
- Update test coverage requirements based on incident analysis
- Enhance E2E test coverage for new features
- Regular architecture and security pattern updates

## Monitoring and Metrics

### Test Health Metrics
- Test execution time
- Test failure rates
- Code coverage trends
- Flaky test identification

### Quality Gates
- 80% minimum code coverage (enforced)
- Zero critical security vulnerabilities
- All architecture compliance checks passing
- Staging environment health validation

This comprehensive testing policy ensures that incidents like the QR scanner button regression cannot reach production by enforcing testing at every stage of the development and deployment process.