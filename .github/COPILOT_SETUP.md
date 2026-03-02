# GitHub Copilot Setup Checklist

This document lists the manual GitHub settings you need to configure to fully enable Copilot features for this repo.

## Required Plan

**GitHub Copilot Pro ($10/month)** is sufficient for all features below.

---

## Settings to Enable

### 1. Enable Copilot Memory (Agentic Memory)

> Allows Copilot to learn repository-specific patterns and remember them across sessions.

**Steps:**

1. Go to https://github.com/IgorGanapolsky/openclaw-console/settings
2. Click **Code security and analysis** in the sidebar
3. Scroll to **GitHub Copilot**
4. Enable **"Allow Copilot to create memories for this repository"**

**Verification:** After a few interactions, check https://github.com/settings/copilot → Memories

---

### 2. Enable Copilot Coding Agent

> Allows you to assign GitHub issues directly to Copilot for autonomous implementation.

**Steps:**

1. Go to https://github.com/IgorGanapolsky/openclaw-console/settings
2. Click **Copilot** in the sidebar (or **Code security and analysis**)
3. Under "Copilot coding agent", enable:
   - **"Allow Copilot to open pull requests"**
   - **"Allow Copilot to push to branches"**

**Usage:**

- Assign an issue to `Copilot` (type `@copilot` in assignees)
- Or comment `@copilot implement this` on an issue
- Copilot creates a `copilot/` branch and opens a draft PR

---

### 3. Enable Automatic Copilot Code Review

> Copilot automatically reviews all PRs (in addition to Claude review).

**Steps:**

1. Go to https://github.com/IgorGanapolsky/openclaw-console/settings
2. Click **Rules** → **Rulesets** in the sidebar
3. Create a new ruleset or edit existing
4. Under **Branch rules**, enable:
   - **"Automatically request Copilot code review"**
   - Optionally: **"Review new pushes"** and **"Review draft pull requests"**

**Note:** Each Copilot review consumes 1 premium request from your monthly quota.

---

### 4. Create a Copilot Space (Optional but Recommended)

> Bundle project context for better Copilot suggestions.

**Steps:**

1. Go to https://github.com/codespaces (or your Copilot dashboard)
2. Click **Spaces** → **New Space**
3. Name it "OpenClaw Console"
4. Add context:
   - `CLAUDE.md` (architecture + workflow)
   - `android/app/src/main/java/com/openclaw/console/MainActivity.kt` (Android entrypoint)
   - `ios/OpenClawConsole/OpenClawConsole/OpenClawConsoleApp.swift` (iOS app lifecycle)
   - `ios/OpenClawConsole/OpenClawConsole/ViewModels/GatewayManager.swift` (gateway connectivity)
   - `openclaw-skills/src/index.ts` (skills gateway entrypoint)
   - `AGENTS.md` (agent operating rules)
5. Share with your organization if needed

---

## Files Created by This Setup

| File                                                | Purpose                                           |
| --------------------------------------------------- | ------------------------------------------------- |
| `.github/copilot-instructions.md`                   | Main Copilot instructions (read on every request) |
| `.github/instructions/android.instructions.md`      | Android patterns for `android/**/*.kt`     |
| `.github/instructions/ios.instructions.md`          | iOS patterns for `ios/OpenClawConsole/**/*.swift`          |
| `AGENTS.md`                                         | Repo operating protocol + acceptance criteria     |

---

## Verification

After enabling all settings, test:

1. **Memory:** Make a few Copilot Chat requests, then check if Copilot remembers project patterns
2. **Coding Agent:** Create a test issue and assign to `Copilot`
3. **Code Review:** Open a PR and verify Copilot requests review automatically
4. **Instructions:** In VS Code, ask Copilot about SafeAreaView - it should warn about the correct import

---

## Troubleshooting

**Copilot not following instructions?**

- Verify `.github/copilot-instructions.md` exists
- Check that the file is on the default branch (develop)
- Ensure instructions reflect this repo's native iOS/Android + TypeScript architecture

**Coding agent not working?**

- Ensure you have Copilot Pro or higher
- Check repository settings → Copilot → Agent is enabled
- Agent only works on issues, not PRs

**Memory not persisting?**

- Memory is in public preview, may have delays
- Memories expire after 28 days
- Check https://github.com/settings/copilot for memory management
