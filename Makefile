.PHONY: verify verify-android verify-ios verify-skills
.PHONY: run-android-emulator run-ios-sim
.PHONY: maestro-android maestro-ios
.PHONY: install-hooks

ANDROID_DIR := android
IOS_DIR := ios/OpenClawConsole
SKILLS_DIR := openclaw-skills
ANDROID_PACKAGE := com.openclaw.console
IOS_SCHEME := OpenClawConsole

# Verify (unit tests + builds)
verify: verify-android verify-ios verify-skills

verify-android:
	@echo "==> Android: unit tests + debug build"
	@cd $(ANDROID_DIR) && ./gradlew testDebugUnitTest assembleDebug --no-daemon

verify-ios:
	@echo "==> iOS: unit tests (simulator)"
	@cd $(IOS_DIR) && xcodebuild -scheme $(IOS_SCHEME) \
		-destination 'platform=iOS Simulator,name=iPhone 16' \
		-configuration Debug \
		test \
		CODE_SIGNING_ALLOWED=NO \
		2>&1 | tail -20

verify-skills:
	@echo "==> Skills gateway: lint + test"
	@cd $(SKILLS_DIR) && npm ci && npm test

# Run on Android emulator
run-android-emulator:
	@EMU=$$(adb devices | grep emulator | head -1 | cut -f1); \
	if [ -z "$$EMU" ]; then \
		echo "==> No emulator running. Start one in Android Studio."; \
		exit 1; \
	fi; \
	echo "==> Using emulator: $$EMU"; \
	cd $(ANDROID_DIR) && ./gradlew installDebug; \
	adb -s $$EMU shell am start -n $(ANDROID_PACKAGE)/.MainActivity

# Run on iOS Simulator
run-ios-sim:
	@SIM=$$(xcrun simctl list devices available | grep "iPhone" | grep -v unavailable | head -1 | awk -F '[()]' '{print $$2}'); \
	if [ -z "$$SIM" ]; then \
		echo "ERROR: No iOS simulators available."; \
		exit 1; \
	fi; \
	echo "==> Booting simulator..."; \
	xcrun simctl boot $$SIM 2>/dev/null || true; \
	open -a Simulator; \
	cd $(IOS_DIR) && xcodebuild -scheme $(IOS_SCHEME) \
		-destination "id=$$SIM" \
		-configuration Debug \
		build \
		CODE_SIGNING_ALLOWED=NO

# Maestro E2E
maestro-android:
	@echo "==> Maestro: Android flows"
	@maestro test .maestro/smoke-test-android.yaml

maestro-ios:
	@echo "==> Maestro: iOS flows"
	@maestro test .maestro/smoke-test-ios.yaml

# Install git hooks
install-hooks:
	@cp scripts/pre-commit .git/hooks/pre-commit 2>/dev/null || echo "No pre-commit script found"
	@chmod +x .git/hooks/pre-commit 2>/dev/null || true
	@echo "Pre-commit hook installed"
