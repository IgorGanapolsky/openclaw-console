#!/bin/bash
#
# OpenClaw Console — One-Command GitHub Secrets Setup
# ====================================================
# Run this once on your Mac to configure the CI/CD secrets required for release delivery.
# Delivery still depends on valid credentials, external service availability, and group/tester setup.
#
# Prerequisites:
#   - GitHub CLI installed: brew install gh
#   - GitHub CLI authenticated: gh auth login
#   - Firebase CLI installed: npm install -g firebase-tools
#   - Apple Developer account access
#   - Android signing keystore (or we'll create one)
#
# Usage:
#   chmod +x setup-secrets.sh
#   ./setup-secrets.sh
#

set -euo pipefail

REPO="IgorGanapolsky/openclaw-console"
ENVIRONMENT_NAME="production"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=============================================="
echo "  OpenClaw Console — Secrets Setup"
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

set_secret_authoritative() {
    local name="$1"
    local value="$2"
    printf '%s' "$value" | gh secret set "$name" --repo="$REPO"
    gh variable delete "$name" --repo="$REPO" >/dev/null 2>&1 || true
    gh variable delete "$name" --repo="$REPO" --env "$ENVIRONMENT_NAME" >/dev/null 2>&1 || true
}

secret_exists() {
    local name="$1"
    gh secret list --repo="$REPO" | awk '{print $1}' | grep -Fxq "$name"
}

variable_exists() {
    local name="$1"
    gh variable list --repo="$REPO" | awk '{print $1}' | grep -Fxq "$name"
}

environment_secret_exists() {
    local name="$1"
    gh secret list --repo="$REPO" --env "$ENVIRONMENT_NAME" >/dev/null 2>&1 || return 1
    gh secret list --repo="$REPO" --env "$ENVIRONMENT_NAME" | awk '{print $1}' | grep -Fxq "$name"
}

environment_variable_exists() {
    local name="$1"
    gh variable list --repo="$REPO" --env "$ENVIRONMENT_NAME" >/dev/null 2>&1 || return 1
    gh variable list --repo="$REPO" --env "$ENVIRONMENT_NAME" | awk '{print $1}' | grep -Fxq "$name"
}

delete_secret_if_present() {
    local name="$1"
    if ! secret_exists "$name"; then
        return 1
    fi

    gh secret delete "$name" --repo="$REPO" >/dev/null 2>&1
    if secret_exists "$name"; then
        echo -e "${RED}Error: failed to delete repo secret $name${NC}"
        exit 1
    fi

    return 0
}

delete_variable_if_present() {
    local name="$1"
    if ! variable_exists "$name"; then
        return 1
    fi

    gh variable delete "$name" --repo="$REPO" >/dev/null 2>&1
    if variable_exists "$name"; then
        echo -e "${RED}Error: failed to delete repo variable $name${NC}"
        exit 1
    fi

    return 0
}

delete_environment_secret_if_present() {
    local name="$1"
    if ! environment_secret_exists "$name"; then
        return 1
    fi

    gh secret delete "$name" --repo="$REPO" --env "$ENVIRONMENT_NAME" >/dev/null 2>&1
    if environment_secret_exists "$name"; then
        echo -e "${RED}Error: failed to delete ${ENVIRONMENT_NAME} environment secret $name${NC}"
        exit 1
    fi

    return 0
}

delete_environment_variable_if_present() {
    local name="$1"
    if ! environment_variable_exists "$name"; then
        return 1
    fi

    gh variable delete "$name" --repo="$REPO" --env "$ENVIRONMENT_NAME" >/dev/null 2>&1
    if environment_variable_exists "$name"; then
        echo -e "${RED}Error: failed to delete ${ENVIRONMENT_NAME} environment variable $name${NC}"
        exit 1
    fi

    return 0
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

# ──────────────────────────────────
# 1. iOS Signing Certificate (.p12)
# ──────────────────────────────────
echo -e "${YELLOW}Step 1/6: iOS Signing Certificate${NC}"
echo "Export your Apple Distribution certificate from Keychain Access as a .p12 file."
echo "  1. Open Keychain Access"
echo "  2. Find 'Apple Distribution: <your name>'"
echo "  3. Right-click → Export Items → Save as .p12"
echo ""
read -r -p "Path to .p12 file (or 'skip'): " P12_PATH

if [ "${P12_PATH:-skip}" != "skip" ] && [ -f "$P12_PATH" ]; then
    P12_BASE64=$(base64 -i "$P12_PATH")
    echo "$P12_BASE64" | gh secret set APPLE_CERTIFICATES_P12 --repo="$REPO"
    echo -e "${GREEN}  ✓ APPLE_CERTIFICATES_P12 set${NC}"
    SECRETS_SET=$((SECRETS_SET+1))

    read -r -s -p "Enter the .p12 export password: " P12_PASS
    echo ""
    echo "$P12_PASS" | gh secret set APPLE_CERTIFICATE_PASSWORD --repo="$REPO"
    echo -e "${GREEN}  ✓ APPLE_CERTIFICATE_PASSWORD set${NC}"
    SECRETS_SET=$((SECRETS_SET+1))
else
    echo "  Skipped iOS certificate"
fi

# ──────────────────────────────────
# 2. App Store Connect API Key
# ──────────────────────────────────
echo ""
echo -e "${YELLOW}Step 2/6: App Store Connect API Key${NC}"
echo "If you haven't downloaded the .p8 key file yet, download it from:"
echo "  https://appstoreconnect.apple.com/access/integrations/api"
echo ""
read -r -p "Path to AuthKey_*.p8 file (or 'skip'): " P8_PATH

if [ "${P8_PATH:-skip}" != "skip" ] && [ -f "$P8_PATH" ]; then
    P8_CONTENT=$(cat "$P8_PATH")
    echo "$P8_CONTENT" | gh secret set APPSTORE_PRIVATE_KEY --repo="$REPO"
    echo -e "${GREEN}  ✓ APPSTORE_PRIVATE_KEY set${NC}"
    SECRETS_SET=$((SECRETS_SET+1))

    read -r -p "Enter App Store Connect Issuer ID: " ISSUER_ID
    echo "$ISSUER_ID" | gh secret set APPSTORE_ISSUER_ID --repo="$REPO"

    read -r -p "Enter App Store Connect Key ID: " KEY_ID
    echo "$KEY_ID" | gh secret set APPSTORE_KEY_ID --repo="$REPO"

    read -r -p "Enter Apple Team ID: " TEAM_ID
    echo "$TEAM_ID" | gh secret set APPLE_TEAM_ID --repo="$REPO"

    echo -e "${GREEN}  ✓ APPSTORE_ISSUER_ID, APPSTORE_KEY_ID, APPLE_TEAM_ID set${NC}"
    SECRETS_SET=$((SECRETS_SET+3))
else
    echo "  Skipped App Store Connect API key"
fi

# ──────────────────────────────────
# 3. Fastlane Match Password
# ──────────────────────────────────
echo ""
echo -e "${YELLOW}Step 3/6: Fastlane Match Encryption Password${NC}"
echo "Choose a password for encrypting your match certificates repo."
read -r -s -p "Match password (or 'skip'): " MATCH_PASS
echo ""

if [ "${MATCH_PASS:-skip}" != "skip" ]; then
    echo "$MATCH_PASS" | gh secret set MATCH_PASSWORD --repo="$REPO"
    echo -e "${GREEN}  ✓ MATCH_PASSWORD set${NC}"
    SECRETS_SET=$((SECRETS_SET+1))
else
    echo "  Skipped Match password"
fi

# ──────────────────────────────────
# 4. Firebase Token + App IDs + Audience
# ──────────────────────────────────
echo ""
echo -e "${YELLOW}Step 4/6: Firebase Configuration${NC}"
echo "Preferred auth: FIREBASE_SERVICE_ACCOUNT_JSON with Firebase App Distribution Admin."
read -r -p "Path to Firebase service account JSON (or 'skip'): " FIREBASE_SA_PATH
if [ "${FIREBASE_SA_PATH:-skip}" != "skip" ] && [ -f "$FIREBASE_SA_PATH" ]; then
    gh secret set FIREBASE_SERVICE_ACCOUNT_JSON --repo="$REPO" < "$FIREBASE_SA_PATH"
    echo -e "${GREEN}  ✓ FIREBASE_SERVICE_ACCOUNT_JSON set${NC}"
    SECRETS_SET=$((SECRETS_SET+1))
else
    echo "  Skipped Firebase service account JSON"
fi

read -r -p "Path to Google Play service account JSON fallback (or 'skip'): " GOOGLE_PLAY_JSON_PATH
if [ "${GOOGLE_PLAY_JSON_PATH:-skip}" != "skip" ] && [ -f "$GOOGLE_PLAY_JSON_PATH" ]; then
    gh secret set GOOGLE_PLAY_JSON_KEY --repo="$REPO" < "$GOOGLE_PLAY_JSON_PATH"
    echo -e "${GREEN}  ✓ GOOGLE_PLAY_JSON_KEY set${NC}"
    SECRETS_SET=$((SECRETS_SET+1))
else
    echo "  Skipped Google Play service account fallback"
fi

echo "Optional fallback: FIREBASE_TOKEN (deprecated, but useful while service-account upload permissions are being fixed)."
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
            read -r -p "Firebase CI token (or 'skip'): " FIREBASE_TOKEN_MANUAL
            if [ "${FIREBASE_TOKEN_MANUAL:-skip}" != "skip" ]; then
                set_secret_authoritative FIREBASE_TOKEN "$FIREBASE_TOKEN_MANUAL"
                echo -e "${GREEN}  ✓ FIREBASE_TOKEN set${NC}"
                SECRETS_SET=$((SECRETS_SET+1))
            fi
        fi
    else
        echo "Firebase CLI not found. Install with: npm install -g firebase-tools"
        read -r -p "Firebase CI token (or 'skip'): " FIREBASE_TOKEN_MANUAL
        if [ "${FIREBASE_TOKEN_MANUAL:-skip}" != "skip" ]; then
            set_secret_authoritative FIREBASE_TOKEN "$FIREBASE_TOKEN_MANUAL"
            echo -e "${GREEN}  ✓ FIREBASE_TOKEN set${NC}"
            SECRETS_SET=$((SECRETS_SET+1))
        fi
    fi
fi

echo ""
FB_PROJECT_ID="$(prompt_required_value "Firebase project ID for App Distribution" project_id)"
set_secret_authoritative FIREBASE_PROJECT_ID "$FB_PROJECT_ID"
echo -e "${GREEN}  ✓ FIREBASE_PROJECT_ID set${NC}"
SECRETS_SET=$((SECRETS_SET+1))

echo ""
echo "Find your Firebase App IDs at: https://console.firebase.google.com → Project Settings → Your Apps"
read -r -p "Firebase iOS App ID (or 'skip'): " FB_IOS
if [ "${FB_IOS:-skip}" != "skip" ] && [ -n "$FB_IOS" ]; then
    set_secret_authoritative FIREBASE_IOS_APP_ID "$FB_IOS"
    echo -e "${GREEN}  ✓ FIREBASE_IOS_APP_ID set${NC}"
    SECRETS_SET=$((SECRETS_SET+1))
fi

read -r -p "Firebase Android App ID (or 'skip'): " FB_ANDROID
if [ "${FB_ANDROID:-skip}" != "skip" ] && [ -n "$FB_ANDROID" ]; then
    set_secret_authoritative FIREBASE_ANDROID_APP_ID "$FB_ANDROID"
    echo -e "${GREEN}  ✓ FIREBASE_ANDROID_APP_ID set${NC}"
    SECRETS_SET=$((SECRETS_SET+1))
fi

echo ""
LEGACY_FIREBASE_AUDIENCE_REMOVED=false
for legacy_name in FIREBASE_INTERNAL_TESTERS FIREBASE_INTERNAL_GROUPS FIREBASE_REQUIRED_TESTER_EMAIL; do
    if delete_secret_if_present "$legacy_name"; then
        LEGACY_FIREBASE_AUDIENCE_REMOVED=true
    fi
    if delete_variable_if_present "$legacy_name"; then
        LEGACY_FIREBASE_AUDIENCE_REMOVED=true
    fi
    if delete_environment_secret_if_present "$legacy_name"; then
        LEGACY_FIREBASE_AUDIENCE_REMOVED=true
    fi
    if delete_environment_variable_if_present "$legacy_name"; then
        LEGACY_FIREBASE_AUDIENCE_REMOVED=true
    fi
done

if [ "$LEGACY_FIREBASE_AUDIENCE_REMOVED" = true ]; then
    echo "Firebase Android internal delivery is group-based only. Legacy Firebase audience settings were removed from repo/production scopes where they existed."
else
    echo "Firebase Android internal delivery is group-based only. No legacy Firebase audience settings were present in repo/production scopes."
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
# 5. Android Keystore
# ──────────────────────────────────
echo ""
echo -e "${YELLOW}Step 5/6: Android Signing Keystore${NC}"
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
    echo "$KS_BASE64" | gh secret set ANDROID_KEYSTORE_BASE64 --repo="$REPO"
    echo -e "${GREEN}  ✓ ANDROID_KEYSTORE_BASE64 set${NC}"
    SECRETS_SET=$((SECRETS_SET+1))

    if [ -z "${KS_PASS:-}" ]; then
        read -r -s -p "Keystore password: " KS_PASS
        echo ""
    fi
    echo "$KS_PASS" | gh secret set KEYSTORE_PASSWORD --repo="$REPO"
    echo -e "${GREEN}  ✓ KEYSTORE_PASSWORD set${NC}"
    SECRETS_SET=$((SECRETS_SET+1))

    read -r -p "Key alias [openclaw]: " KEY_ALIAS
    KEY_ALIAS=${KEY_ALIAS:-openclaw}
    echo "$KEY_ALIAS" | gh secret set KEY_ALIAS --repo="$REPO"
    echo -e "${GREEN}  ✓ KEY_ALIAS set${NC}"
    SECRETS_SET=$((SECRETS_SET+1))

    read -r -s -p "Key password: " KEY_PASS
    echo ""
    echo "$KEY_PASS" | gh secret set KEY_PASSWORD --repo="$REPO"
    echo -e "${GREEN}  ✓ KEY_PASSWORD set${NC}"
    SECRETS_SET=$((SECRETS_SET+1))
else
    echo "  Skipped Android keystore"
fi

# ──────────────────────────────────
# 6. Verification
# ──────────────────────────────────
echo ""
echo -e "${YELLOW}Step 6/6: Verification${NC}"
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

echo "=============================================="
echo -e "${GREEN}  Done! $SECRETS_SET secrets configured.${NC}"
echo "=============================================="
echo ""
echo "Next steps:"
echo "  1. Push any change to ios/ or android/ to trigger CI"
echo "  2. Once CI passes, the internal-distribution workflow can build"
echo "     and attempt TestFlight + Firebase App Distribution delivery"
