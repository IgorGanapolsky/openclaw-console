# Phase 2 Deferred Items

## Pre-existing Android Compilation Errors (Out of Scope for 02-01)

**Discovered during:** Task 2 verification (`./gradlew assembleDebug`)

**Status:** Pre-existing — existed before Phase 2 work began (confirmed via git stash test)

**Affected files (10 files, ~178 errors):**
- `ui/navigation/NavGraph.kt` — missing `import androidx.lifecycle.compose.collectAsStateWithLifecycle`
- `ui/screens/agents/AgentDetailScreen.kt` — unresolved model fields (`agents`, `name`, `workspace`)
- `ui/screens/agents/AgentListScreen.kt` — similar field resolution errors
- `ui/screens/approvals/ApprovalDetailScreen.kt` — field resolution errors
- `ui/screens/chat/ChatContent.kt` — compilation errors
- `ui/screens/incidents/IncidentDetailScreen.kt` — field resolution errors
- `ui/screens/incidents/IncidentListScreen.kt` — field resolution errors
- `ui/screens/settings/AddGatewayScreen.kt` — compilation errors
- `ui/screens/settings/SettingsScreen.kt` — compilation errors
- `ui/screens/tasks/TaskDetailScreen.kt` — field resolution errors

**Root cause:** Data model fields referenced in UI screens don't match the actual model class definitions. The `collectAsStateWithLifecycle` import is missing in NavGraph.kt. These appear to be stale UI code referencing an older data model shape.

**Impact on 02-01:** `assembleDebug` BUILD FAILED due to compilation errors. However:
- AAPT resource linking PASSES (`./gradlew processDebugResources` = BUILD SUCCESSFUL)
- Gradle configuration PARSES (`./gradlew help` = BUILD SUCCESSFUL)
- Icon resources resolve correctly (no AAPT errors)
- signingConfigs block is syntactically valid

**Deferred to:** A dedicated code repair plan before Phase 2 signing work can be verified end-to-end.
