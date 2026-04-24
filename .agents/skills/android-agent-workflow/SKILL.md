# Android Agent Workflow

Use this skill when an agent modifies `android/`, Android launcher icons, Firebase App Distribution, Compose UI, Gradle, Android CI, or Android release metadata.

## Goal

Make Android agent work fast, current, and quiet. Agents should use official Android command surfaces and repo guardrails before improvising with Gradle, SDK, emulator, or Compose fixes.

## Required Workflow

1. Inspect the narrow Android surface touched by the task.
2. Run the Android CLI preflight:
   - `python3 scripts/check_android_cli.py`
   - If it reports Android CLI is unavailable, keep working with the repo Gradle/SDK commands and state that fallback explicitly.
3. Prefer official Android CLI commands when available:
   - `android sdk` for SDK/component setup.
   - `android emulator` for virtual device creation and lifecycle.
   - `android run` for deploy/run loops.
   - `android docs` for current Android, Firebase, Google, and Kotlin guidance.
   - `android skills` for official Android task instructions.
4. Keep summaries concise: report the changed files, the failing/passing command, and the next concrete fix. Do not paste full Gradle logs unless the exact failing lines are needed.
5. Preserve iOS parity before changing Android UI or branding. Android should match the iOS/TestFlight visual source of truth unless the task explicitly says otherwise.

## Mandatory Checks

Run the narrowest applicable checks before reporting completion:

```bash
python3 scripts/check_android_cli.py
python3 scripts/sync_app_icons.py --check
./scripts/check-brand-parity.sh
cd android && ./gradlew :app:compileDebugKotlin :app:testDebugUnitTest :app:lintDebug --no-daemon
```

For release, Firebase, or Play changes, also run:

```bash
python3 scripts/validate_release_contract.py --platform android
```

## OpenClaw Android Rules

- Package remains `com.openclaw.console`.
- Use Kotlin + Jetpack Compose + MVVM/repository patterns already present in the repo.
- Keep Composables thin; move logic into ViewModels or pure helpers.
- Use `collectAsStateWithLifecycle()`, not raw `collectAsState()`, for Flow-backed UI.
- Do not use `AndroidViewModel` unless a line-level `// allow-android-viewmodel` justification exists.
- Do not add launcher icon assets by hand. Regenerate from the canonical iOS marketing icon with `scripts/sync_app_icons.py`.
- Do not add new Android permissions unless the feature requires them and the risk is documented in the PR.
- Keep dangerous action approvals behind biometric verification.

## Response Style

Use Claude Code/Codex-style responses:

- Default to 3-7 bullets or short paragraphs.
- Lead with outcome and evidence.
- Include only the relevant command output lines.
- Mark unverified items as unverified.
- Never claim Android readiness until the checks above have been read back.
