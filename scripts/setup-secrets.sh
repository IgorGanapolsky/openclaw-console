#!/bin/bash
#
# OpenClaw Console — Release Secret Setup
# =======================================
# Configure the GitHub Actions secrets and cleanup needed for internal release delivery.
# The script verifies the resulting repo/production-environment state and exits non-zero
# if the workflow would still be blocked by missing required inputs.
#

set -euo pipefail

REPO="IgorGanapolsky/openclaw-console"
ENVIRONMENT_NAME="production"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=============================================="
echo "  OpenClaw Console — Release Secret Setup"
echo "=============================================="
echo ""

command -v gh >/dev/null 2>&1 || { echo -e "${RED}Error: GitHub CLI not found. Install with: brew install gh${NC}"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo -e "${RED}Error: GitHub CLI not authenticated. Run: gh auth login${NC}"; exit 1; }

SECRETS_SET=0

trim() {
    local value="$1"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    printf '%s' "$value"
}

is_placeholder_value() {
    local normalized
    normalized="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
    case "$normalized" in
        skip|todo|tbd|changeme|change-me|placeholder|example|n/a|na|none)
            return 0
            ;;
    esac
    return 1
}

valid_project_id() {
    [[ "$1" =~ ^[a-z0-9-]+$ ]]
}

valid_email() {
    [[ "$1" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]
}

valid_csv_aliases() {
    local value="$1"
    local item
    IFS=',' read -r -a items <<< "$value"
    for item in "${items[@]}"; do
        item="$(trim "$item")"
        if [ -z "$item" ] || is_placeholder_value "$item" || [[ ! "$item" =~ ^[A-Za-z0-9_-]+$ ]]; then
            return 1
        fi
    done
    return 0
}

valid_csv_names() {
    local value="$1"
    local item
    IFS=',' read -r -a items <<< "$value"
    for item in "${items[@]}"; do
        item="$(trim "$item")"
        if [ -z "$item" ] || is_placeholder_value "$item"; then
            return 1
        fi
    done
    return 0
}

prompt_required_value() {
    local prompt="$1"
    local validator="$2"
    local value=""

    while :; do
        read -r -p "$prompt: " value
        value="$(trim "$value")"

        if [ -z "$value" ] || is_placeholder_value "$value"; then
            echo -e "${YELLOW}  This value is required for internal release delivery proof.${NC}"
            continue
        fi

        case "$validator" in
            project_id)
                if ! valid_project_id "$value"; then
                    echo -e "${YELLOW}  Enter a valid Firebase project id using lowercase letters, numbers, and hyphens.${NC}"
                    continue
                fi
                ;;
            email)
                if ! valid_email "$value"; then
                    echo -e "${YELLOW}  Enter a valid email address.${NC}"
                    continue
                fi
                ;;
            csv_aliases)
                if ! valid_csv_aliases "$value"; then
                    echo -e "${YELLOW}  Enter comma-separated aliases using letters, numbers, underscores, or hyphens.${NC}"
                    continue
                fi
                ;;
            csv_names)
                if ! valid_csv_names "$value"; then
                    echo -e "${YELLOW}  Enter at least one non-placeholder group name.${NC}"
                    continue
                fi
                ;;
        esac

        printf '%s' "$value"
        return 0
    done
}

secret_exists() {
    local name="$1"
    gh secret list --repo="$REPO" | awk '{print $1}' | grep -Fxq "$name"
}

environment_secret_exists() {
    local name="$1"
    gh secret list --repo="$REPO" --env "$ENVIRONMENT_NAME" >/dev/null 2>&1 || return 1
    gh secret list --repo="$REPO" --env "$ENVIRONMENT_NAME" | awk '{print $1}' | grep -Fxq "$name"
}

variable_exists() {
    local name="$1"
    gh variable list --repo="$REPO" | awk '{print $1}' | grep -Fxq "$name"
}

environment_variable_exists() {
    local name="$1"
    gh variable list --repo="$REPO" --env "$ENVIRONMENT_NAME" >/dev/null 2>&1 || return 1
    gh variable list --repo="$REPO" --env "$ENVIRONMENT_NAME" | awk '{print $1}' | grep -Fxq "$name"
}

secret_exists_any_scope() {
    local name="$1"
    secret_exists "$name" || environment_secret_exists "$name"
}

variable_exists_any_scope() {
    local name="$1"
    variable_exists "$name" || environment_variable_exists "$name"
}

set_secret_authoritative() {
    local name="$1"
    local value="$2"
    printf '%s' "$value" | gh secret set "$name" --repo="$REPO"
    gh secret delete "$name" --repo="$REPO" --env "$ENVIRONMENT_NAME" >/dev/null 2>&1 || true
    gh variable delete "$name" --repo="$REPO" >/dev/null 2>&1 || true
    gh variable delete "$name" --repo="$REPO" --env "$ENVIRONMENT_NAME" >/dev/null 2>&1 || true
}

set_secret_from_file() {
    local name="$1"
    local path="$2"
    gh secret set "$name" --repo="$REPO" < "$path"
    gh secret delete "$name" --repo="$REPO" --env "$ENVIRONMENT_NAME" >/dev/null 2>&1 || true
    gh variable delete "$name" --repo="$REPO" >/dev/null 2>&1 || true
    gh variable delete "$name" --repo="$REPO" --env "$ENVIRONMENT_NAME" >/dev/null 2>&1 || true
}

delete_secret_if_present() {
    local name="$1"
    if ! secret_exists "$name"; then
        return 1
    fi
    gh secret delete "$name" --repo="$REPO" >/dev/null 2>&1
    secret_exists "$name" && { echo -e "${RED}Error: failed to delete repo secret $name${NC}"; exit 1; }
    return 0
}

delete_environment_secret_if_present() {
    local name="$1"
    if ! environment_secret_exists "$name"; then
        return 1
    fi
    gh secret delete "$name" --repo="$REPO" --env "$ENVIRONMENT_NAME" >/dev/null 2>&1
    environment_secret_exists "$name" && { echo -e "${RED}Error: failed to delete ${ENVIRONMENT_NAME} environment secret $name${NC}"; exit 1; }
    return 0
}

delete_variable_if_present() {
    local name="$1"
    if ! variable_exists "$name"; then
        return 1
    fi
    gh variable delete "$name" --repo="$REPO" >/dev/null 2>&1
    variable_exists "$name" && { echo -e "${RED}Error: failed to delete repo variable $name${NC}"; exit 1; }
    return 0
}

delete_environment_variable_if_present() {
    local name="$1"
    if ! environment_variable_exists "$name"; then
        return 1
    fi
    gh variable delete "$name" --repo="$REPO" --env "$ENVIRONMENT_NAME" >/dev/null 2>&1
    environment_variable_exists "$name" && { echo -e "${RED}Error: failed to delete ${ENVIRONMENT_NAME} environment variable $name${NC}"; exit 1; }
    return 0
}

optional_file_secret() {
    local prompt="$1"
    local secret_name="$2"
    local path=""

    read -r -p "$prompt (or 'skip'): " path
    if [ "${path:-skip}" != "skip" ] && [ -f "$path" ]; then
        set_secret_from_file "$secret_name" "$path"
        echo -e "${GREEN}  ✓ ${secret_name} set${NC}"
        SECRETS_SET=$((SECRETS_SET+1))
    else
        echo "  Skipped ${secret_name}"
    fi
}

optional_value_secret() {
    local prompt="$1"
    local secret_name="$2"
    local value=""

    read -r -p "$prompt (or 'skip'): " value
    if [ "${value:-skip}" != "skip" ] && [ -n "$value" ]; then
        set_secret_authoritative "$secret_name" "$value"
        echo -e "${GREEN}  ✓ ${secret_name} set${NC}"
        SECRETS_SET=$((SECRETS_SET+1))
    else
        echo "  Skipped ${secret_name}"
    fi
}

# ──────────────────────────────────
# 1. App Store Connect API Key
# ──────────────────────────────────
echo -e "${YELLOW}Step 1/5: App Store Connect API Key${NC}"
echo "These values are required by the iOS release workflow."
optional_file_secret "Path to AuthKey_*.p8 file" "APPSTORE_PRIVATE_KEY"
optional_value_secret "App Store Connect Issuer ID" "APPSTORE_ISSUER_ID"
optional_value_secret "App Store Connect Key ID" "APPSTORE_KEY_ID"
optional_value_secret "Apple Team ID" "APPLE_TEAM_ID"

# ──────────────────────────────────
# 2. Match + GitHub Release Access
# ──────────────────────────────────
echo ""
echo -e "${YELLOW}Step 2/5: Match + GitHub Access${NC}"
echo "These values are required by the iOS release workflow."
optional_value_secret "MATCH_GIT_URL (e.g. https://github.com/YOU/ios-certificates.git)" "MATCH_GIT_URL"
optional_value_secret "MATCH_GIT_BASIC_AUTHORIZATION (base64 username:token)" "MATCH_GIT_BASIC_AUTHORIZATION"
optional_value_secret "MATCH_PASSWORD" "MATCH_PASSWORD"
optional_value_secret "ADMIN_TOKEN (GitHub PAT with repo access)" "ADMIN_TOKEN"

# ──────────────────────────────────
# 3. Firebase + Audience
# ──────────────────────────────────
echo ""
echo -e "${YELLOW}Step 3/5: Firebase + Audience${NC}"
echo "Android requires GOOGLE_SERVICES_JSON plus one Firebase auth path."
optional_file_secret "Path to google-services.json" "GOOGLE_SERVICES_JSON"
optional_file_secret "Path to Firebase service account JSON" "FIREBASE_SERVICE_ACCOUNT_JSON"
optional_file_secret "Path to Google Play service account JSON fallback" "GOOGLE_PLAY_JSON_KEY"

read -r -p "Generate/set Firebase CI token fallback too? (y/N): " SET_FIREBASE_TOKEN
if [[ "${SET_FIREBASE_TOKEN:-N}" =~ ^[Yy]$ ]]; then
    if command -v firebase >/dev/null 2>&1; then
        echo "Generating Firebase CI token (a browser window may open)..."
        FIREBASE_TOKEN=$(firebase login:ci 2>/dev/null | grep "1//" || true)
        if [ -n "$FIREBASE_TOKEN" ]; then
            set_secret_authoritative FIREBASE_TOKEN "$FIREBASE_TOKEN"
            echo -e "${GREEN}  ✓ FIREBASE_TOKEN set${NC}"
            SECRETS_SET=$((SECRETS_SET+1))
        else
            echo "  Could not capture token automatically. Paste it manually below."
            optional_value_secret "Firebase CI token" "FIREBASE_TOKEN"
        fi
    else
        echo "Firebase CLI not found. Install with: npm install -g firebase-tools"
        optional_value_secret "Firebase CI token" "FIREBASE_TOKEN"
    fi
fi

echo ""
FB_PROJECT_ID="$(prompt_required_value "Firebase project ID for App Distribution" project_id)"
set_secret_authoritative FIREBASE_PROJECT_ID "$FB_PROJECT_ID"
echo -e "${GREEN}  ✓ FIREBASE_PROJECT_ID set${NC}"
SECRETS_SET=$((SECRETS_SET+1))

echo ""
echo "Find your Firebase App IDs at: https://console.firebase.google.com → Project Settings → Your Apps"
optional_value_secret "Firebase iOS App ID" "FIREBASE_IOS_APP_ID"
optional_value_secret "Firebase Android App ID" "FIREBASE_ANDROID_APP_ID"

LEGACY_FIREBASE_AUDIENCE_REMOVED=false
if delete_secret_if_present FIREBASE_INTERNAL_TESTERS; then LEGACY_FIREBASE_AUDIENCE_REMOVED=true; fi
if delete_environment_secret_if_present FIREBASE_INTERNAL_TESTERS; then LEGACY_FIREBASE_AUDIENCE_REMOVED=true; fi
if delete_variable_if_present FIREBASE_INTERNAL_TESTERS; then LEGACY_FIREBASE_AUDIENCE_REMOVED=true; fi
if delete_environment_variable_if_present FIREBASE_INTERNAL_TESTERS; then LEGACY_FIREBASE_AUDIENCE_REMOVED=true; fi
if delete_variable_if_present FIREBASE_INTERNAL_GROUPS; then LEGACY_FIREBASE_AUDIENCE_REMOVED=true; fi
if delete_environment_variable_if_present FIREBASE_INTERNAL_GROUPS; then LEGACY_FIREBASE_AUDIENCE_REMOVED=true; fi
if delete_variable_if_present FIREBASE_REQUIRED_TESTER_EMAIL; then LEGACY_FIREBASE_AUDIENCE_REMOVED=true; fi
if delete_environment_variable_if_present FIREBASE_REQUIRED_TESTER_EMAIL; then LEGACY_FIREBASE_AUDIENCE_REMOVED=true; fi

if [ "$LEGACY_FIREBASE_AUDIENCE_REMOVED" = true ]; then
    echo "Firebase Android internal delivery is group-based only. Legacy FIREBASE_INTERNAL_TESTERS secrets and conflicting repo/production variables were removed where they existed."
else
    echo "Firebase Android internal delivery is group-based only. No legacy FIREBASE_INTERNAL_TESTERS secrets or conflicting repo/production variables were present."
fi

FB_REQUIRED_TESTER="$(prompt_required_value "Firebase required tester email for group-based proof" email)"
set_secret_authoritative FIREBASE_REQUIRED_TESTER_EMAIL "$FB_REQUIRED_TESTER"
echo -e "${GREEN}  ✓ FIREBASE_REQUIRED_TESTER_EMAIL set${NC}"
SECRETS_SET=$((SECRETS_SET+1))

FB_GROUPS="$(prompt_required_value "Firebase internal groups (comma-separated)" csv_aliases)"
set_secret_authoritative FIREBASE_INTERNAL_GROUPS "$FB_GROUPS"
echo -e "${GREEN}  ✓ FIREBASE_INTERNAL_GROUPS set${NC}"
SECRETS_SET=$((SECRETS_SET+1))

echo ""
TF_GROUPS="$(prompt_required_value "TestFlight internal beta groups (comma-separated)" csv_names)"
set_secret_authoritative TESTFLIGHT_GROUPS "$TF_GROUPS"
echo -e "${GREEN}  ✓ TESTFLIGHT_GROUPS set${NC}"
SECRETS_SET=$((SECRETS_SET+1))

TF_REQUIRED_TESTER="$(prompt_required_value "TestFlight required internal tester email for proof" email)"
set_secret_authoritative TESTFLIGHT_REQUIRED_TESTER_EMAIL "$TF_REQUIRED_TESTER"
echo -e "${GREEN}  ✓ TESTFLIGHT_REQUIRED_TESTER_EMAIL set${NC}"
SECRETS_SET=$((SECRETS_SET+1))

# ──────────────────────────────────
# 4. Android Signing Keystore
# ──────────────────────────────────
echo ""
echo -e "${YELLOW}Step 4/5: Android Signing Keystore${NC}"
read -r -p "Path to Android keystore .jks file (or 'create' to generate one, or 'skip'): " KS_PATH

if [ "${KS_PATH:-skip}" = "create" ]; then
    echo "Generating a new Android signing keystore..."
    KS_PATH="$HOME/openclaw-release.jks"
    read -r -s -p "Choose a keystore password: " KS_PASS
    echo ""
    keytool -genkeypair \
        -v \
        -keystore "$KS_PATH" \
        -keyalg RSA \
        -keysize 2048 \
        -validity 10000 \
        -alias openclaw \
        -storepass "$KS_PASS" \
        -keypass "$KS_PASS" \
        -dname "CN=OpenClaw, OU=Mobile, O=OpenClaw, L=Unknown, ST=Unknown, C=US"
    echo -e "${GREEN}  ✓ Keystore created at $KS_PATH${NC}"
fi

if [ "${KS_PATH:-skip}" != "skip" ] && [ -f "$KS_PATH" ]; then
    KS_BASE64=$(base64 -i "$KS_PATH")
    set_secret_authoritative ANDROID_KEYSTORE_BASE64 "$KS_BASE64"
    echo -e "${GREEN}  ✓ ANDROID_KEYSTORE_BASE64 set${NC}"
    SECRETS_SET=$((SECRETS_SET+1))

    if [ -z "${KS_PASS:-}" ]; then
        read -r -s -p "Keystore password: " KS_PASS
        echo ""
    fi
    set_secret_authoritative KEYSTORE_PASSWORD "$KS_PASS"
    echo -e "${GREEN}  ✓ KEYSTORE_PASSWORD set${NC}"
    SECRETS_SET=$((SECRETS_SET+1))

    read -r -p "Key alias [openclaw]: " KEY_ALIAS
    KEY_ALIAS=${KEY_ALIAS:-openclaw}
    set_secret_authoritative KEY_ALIAS "$KEY_ALIAS"
    echo -e "${GREEN}  ✓ KEY_ALIAS set${NC}"
    SECRETS_SET=$((SECRETS_SET+1))

    read -r -s -p "Key password: " KEY_PASS
    echo ""
    set_secret_authoritative KEY_PASSWORD "$KEY_PASS"
    echo -e "${GREEN}  ✓ KEY_PASSWORD set${NC}"
    SECRETS_SET=$((SECRETS_SET+1))
else
    echo "  Skipped Android keystore"
fi

# ──────────────────────────────────
# 5. Verification
# ──────────────────────────────────
echo ""
echo -e "${YELLOW}Step 5/5: Verification${NC}"

missing=()
for name in APPSTORE_PRIVATE_KEY APPSTORE_ISSUER_ID APPSTORE_KEY_ID APPLE_TEAM_ID MATCH_GIT_URL MATCH_GIT_BASIC_AUTHORIZATION MATCH_PASSWORD ADMIN_TOKEN GOOGLE_SERVICES_JSON ANDROID_KEYSTORE_BASE64 KEYSTORE_PASSWORD KEY_ALIAS KEY_PASSWORD FIREBASE_PROJECT_ID FIREBASE_INTERNAL_GROUPS FIREBASE_REQUIRED_TESTER_EMAIL TESTFLIGHT_GROUPS TESTFLIGHT_REQUIRED_TESTER_EMAIL; do
    if ! secret_exists_any_scope "$name"; then
        missing+=("$name")
    fi
done

if ! secret_exists_any_scope FIREBASE_SERVICE_ACCOUNT_JSON && ! secret_exists_any_scope FIREBASE_TOKEN && ! secret_exists_any_scope GOOGLE_PLAY_JSON_KEY; then
    missing+=("FIREBASE_AUTH_PATH(FIREBASE_SERVICE_ACCOUNT_JSON|FIREBASE_TOKEN|GOOGLE_PLAY_JSON_KEY)")
fi

echo "Repository-level secrets for $REPO:"
gh secret list --repo="$REPO"
echo ""
if gh secret list --repo="$REPO" --env "$ENVIRONMENT_NAME" >/dev/null 2>&1; then
    echo "${ENVIRONMENT_NAME^} environment secrets for $REPO:"
    gh secret list --repo="$REPO" --env "$ENVIRONMENT_NAME"
    echo ""
fi
if gh variable list --repo="$REPO" --env "$ENVIRONMENT_NAME" >/dev/null 2>&1; then
    echo "${ENVIRONMENT_NAME^} environment variables for $REPO:"
    gh variable list --repo="$REPO" --env "$ENVIRONMENT_NAME"
    echo ""
fi

echo "Note: the workflow guard reads the GitHub Actions vars context. If this repo lives in an organization, remove any org-level FIREBASE_INTERNAL_GROUPS or FIREBASE_REQUIRED_TESTER_EMAIL variables separately."
echo ""

if [ "${#missing[@]}" -gt 0 ]; then
    echo -e "${RED}Release workflow is still blocked. Missing required secrets:${NC}"
    printf '  - %s\n' "${missing[@]}"
    exit 1
fi

echo "=============================================="
echo -e "${GREEN}  Ready: $SECRETS_SET secrets configured and required repo/production checks passed.${NC}"
echo "=============================================="
echo ""
echo "Next steps:"
echo "  1. Push any change to ios/ or android/ to trigger CI"
echo "  2. Once CI passes, the internal-distribution workflow can build"
echo "     and attempt TestFlight + Firebase App Distribution delivery"
