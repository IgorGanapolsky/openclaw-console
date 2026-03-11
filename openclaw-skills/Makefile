.PHONY: verify verify-android verify-ios verify-skills
.PHONY: run-android-device run-android-emulator run-ios-device run-ios-sim fix-ios-device
.PHONY: maestro-android maestro-ios
.PHONY: clean clean-android clean-ios clean-skills clean-all
.PHONY: install-hooks preflight-release
.PHONY: setup-dev bootstrap

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

# Run on connected Android physical device
run-android-device:
	@DEVICE=$$(adb devices | grep -v emulator | grep device$$ | head -1 | cut -f1); \
	if [ -z "$$DEVICE" ]; then \
		echo "ERROR: No physical Android device found. Connect via USB and enable USB debugging."; \
		exit 1; \
	fi; \
	echo "==> Found device: $$DEVICE"; \
	echo "==> Building and installing debug APK..."; \
	cd $(ANDROID_DIR) && ANDROID_SERIAL=$$DEVICE ./gradlew installDebug; \
	echo "==> Launching OpenClaw Console..."; \
	adb -s $$DEVICE shell am start -n $(ANDROID_PACKAGE)/.MainActivity

# Run on connected iOS physical device
run-ios-device:
	@DEVICE_ID=$$(xcodebuild -project $(IOS_DIR)/OpenClawConsole.xcodeproj -scheme $(IOS_SCHEME) -showdestinations 2>&1 | \
		grep "platform:iOS," | grep -v Simulator | grep -v placeholder | \
		head -1 | sed 's/.*id:\([^,}]*\).*/\1/'); \
	if [ -z "$$DEVICE_ID" ]; then \
		echo "ERROR: No physical iOS device found. Connect via USB and trust the computer."; \
		exit 1; \
	fi; \
	DEVICE_NAME=$$(xcodebuild -project $(IOS_DIR)/OpenClawConsole.xcodeproj -scheme $(IOS_SCHEME) -showdestinations 2>&1 | \
		grep "platform:iOS," | grep -v Simulator | grep -v placeholder | \
		head -1 | sed 's/.*name:\([^}]*\).*/\1/' | xargs); \
	echo "==> Building for $$DEVICE_NAME ($$DEVICE_ID)..."; \
	cd $(IOS_DIR) && xcodebuild -scheme $(IOS_SCHEME) \
		-destination "id=$$DEVICE_ID" \
		-configuration Debug \
		build \
		CODE_SIGNING_ALLOWED=YES | tail -3; \
	echo "==> Launching OpenClaw Console on device..."; \
	xcrun devicectl device process launch --device "$$DEVICE_ID" com.openclaw.console 2>&1 | tail -1 && \
	echo "✅ App running on $$DEVICE_NAME" || \
	echo "❌ Launch failed. Check device connection and code signing."

# Fix iOS device install issues (CoreDevice sandbox exhaustion)
fix-ios-device:
	@echo "==> Killing stale CoreDevice services..."
	@sudo killall -9 CoreDeviceService 2>/dev/null || true
	@sudo killall -9 remotepairingd 2>/dev/null || true
	@echo "==> Restarting usbmuxd..."
	@sudo killall -9 usbmuxd 2>/dev/null || true
	@sleep 2
	@echo "==> Verifying device connection..."
	@xcrun devicectl list devices 2>/dev/null || echo "No devices found — reconnect USB cable"
	@echo "==> Done. Try 'make run-ios-device' again. If still hanging, reboot your Mac."

# Clean build artifacts
clean-android:
	@echo "==> Cleaning Android build artifacts"
	@cd $(ANDROID_DIR) && ./gradlew clean

clean-ios:
	@echo "==> Cleaning iOS build artifacts"
	@cd $(IOS_DIR) && xcodebuild clean -scheme $(IOS_SCHEME) || true
	@rm -rf $(IOS_DIR)/build/ $(IOS_DIR)/DerivedData/

clean-skills:
	@echo "==> Cleaning skills gateway artifacts"
	@cd $(SKILLS_DIR) && rm -rf node_modules/ dist/ .next/ || true

clean-all: clean-android clean-ios clean-skills
	@echo "==> Cleaning git hooks and caches"
	@rm -f .git/hooks/pre-commit
	@echo "==> All build artifacts cleaned"

# Pre-release validation
preflight-release:
	@echo "==> Running preflight release checks"
	@./scripts/preflight-release.sh --platform both --layer 1

# Development environment setup
setup-dev: install-hooks
	@echo "==> Setting up development environment"
	@cd $(SKILLS_DIR) && npm ci
	@echo "==> Installing development tools..."
	@command -v gitleaks >/dev/null || echo "⚠️  Install gitleaks: brew install gitleaks"
	@command -v maestro >/dev/null || echo "⚠️  Install maestro: curl -Ls https://get.maestro.mobile.dev | bash"
	@command -v ktlint >/dev/null || echo "⚠️  Install ktlint: brew install ktlint"
	@command -v swiftlint >/dev/null || echo "⚠️  Install swiftlint: brew install swiftlint"
	@echo "✅ Development environment ready"

# Bootstrap new development machine
bootstrap: setup-dev
	@echo "==> Bootstrapping OpenClaw Console development"
	@echo "==> Verifying tools..."
	@java -version 2>&1 | head -1 || echo "❌ Install JDK 17: brew install openjdk@17"
	@node --version || echo "❌ Install Node.js: brew install node"
	@xcodebuild -version | head -1 || echo "❌ Install Xcode from App Store"
	@echo "==> Running initial build verification..."
	@$(MAKE) verify
	@echo "✅ Bootstrap complete - ready for development!"

# Install git hooks
install-hooks:
	@cp scripts/pre-commit .git/hooks/pre-commit 2>/dev/null || echo "No pre-commit script found"
	@chmod +x .git/hooks/pre-commit 2>/dev/null || true
	@echo "Pre-commit hook installed"
