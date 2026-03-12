#!/bin/bash
# =============================================================================
# Azure AD App Registration for Teams RAG Connector
#
# This script automates the Azure AD app registration using Azure CLI.
# Run this ONCE to create the app, set permissions, and get credentials.
#
# Prerequisites:
#   - Azure CLI installed (brew install azure-cli)
#   - Logged in: az login
#   - Must be Global Admin or Application Admin in the tenant
# =============================================================================

set -euo pipefail

APP_NAME="Teams-RAG-Connector-Claude"
ENV_FILE="$HOME/.teams-rag-env"

echo "============================================="
echo " Teams RAG Connector — Azure AD Setup"
echo "============================================="
echo ""

# Check Azure CLI
if ! command -v az &> /dev/null; then
    echo "ERROR: Azure CLI not found. Install with: brew install azure-cli"
    exit 1
fi

# Check login
if ! az account show &> /dev/null 2>&1; then
    echo "Not logged in. Running az login..."
    az login
fi

TENANT_ID=$(az account show --query tenantId -o tsv)
echo "Tenant ID: $TENANT_ID"

# Create app registration
echo ""
echo "Creating app registration: $APP_NAME"
APP_ID=$(az ad app create \
    --display-name "$APP_NAME" \
    --sign-in-audience "AzureADMyOrg" \
    --query appId -o tsv)

echo "App (Client) ID: $APP_ID"

# Create client secret (valid 2 years)
echo ""
echo "Creating client secret..."
SECRET=$(az ad app credential reset \
    --id "$APP_ID" \
    --display-name "teams-rag-secret" \
    --years 2 \
    --query password -o tsv)

echo "Client Secret: [created — saved to $ENV_FILE]"

# Add Microsoft Graph API permissions
echo ""
echo "Adding API permissions..."

# ChannelMessage.Read.All (Application)
az ad app permission add --id "$APP_ID" \
    --api 00000003-0000-0000-c000-000000000000 \
    --api-permissions 7b2449af-6ccd-4f4d-9f78-e550c193f0d1=Role 2>/dev/null || true

# Chat.Read.All (Application)
az ad app permission add --id "$APP_ID" \
    --api 00000003-0000-0000-c000-000000000000 \
    --api-permissions 6b7d71aa-70aa-4810-a8d9-5d9fb2830017=Role 2>/dev/null || true

# CallRecords.Read.All (Application)
az ad app permission add --id "$APP_ID" \
    --api 00000003-0000-0000-c000-000000000000 \
    --api-permissions 45bbb07e-7321-4fd7-a8f6-3ff27e6a81c8=Role 2>/dev/null || true

# OnlineMeetingTranscript.Read.All (Application)
az ad app permission add --id "$APP_ID" \
    --api 00000003-0000-0000-c000-000000000000 \
    --api-permissions a4a80571-2f82-4c1b-baf9-c74d37e5a47a=Role 2>/dev/null || true

# User.Read.All (Application)
az ad app permission add --id "$APP_ID" \
    --api 00000003-0000-0000-c000-000000000000 \
    --api-permissions df021288-bdef-4463-88db-98f22de89214=Role 2>/dev/null || true

echo "Permissions added. Granting admin consent..."

# Grant admin consent (requires Global Admin)
az ad app permission admin-consent --id "$APP_ID" 2>/dev/null || {
    echo ""
    echo "WARNING: Admin consent failed. You may need a Global Admin to run:"
    echo "  az ad app permission admin-consent --id $APP_ID"
    echo ""
    echo "Or grant consent in Azure Portal:"
    echo "  https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/CallAnAPI/appId/$APP_ID"
}

# Create service principal
echo ""
echo "Creating service principal..."
az ad sp create --id "$APP_ID" 2>/dev/null || true

# Save credentials to env file
cat > "$ENV_FILE" << EOF
# Teams RAG Connector — Azure AD Credentials
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# App Name: $APP_NAME
export AZURE_TENANT_ID="$TENANT_ID"
export AZURE_CLIENT_ID="$APP_ID"
export AZURE_CLIENT_SECRET="$SECRET"
EOF

chmod 600 "$ENV_FILE"

echo ""
echo "============================================="
echo " Setup Complete!"
echo "============================================="
echo ""
echo "Credentials saved to: $ENV_FILE"
echo ""
echo "To activate, add to your ~/.zshrc:"
echo "  source $ENV_FILE"
echo ""
echo "Then run:"
echo "  source ~/.zshrc"
echo "  cd $(dirname "$0")"
echo "  node ingest-messages.js --mode backfill"
echo ""
echo "Tenant ID:     $TENANT_ID"
echo "Client ID:     $APP_ID"
echo "Client Secret: (saved to $ENV_FILE)"
echo ""

# Auto-append to .zshrc if not already there
if ! grep -q "teams-rag-env" "$HOME/.zshrc" 2>/dev/null; then
    echo "" >> "$HOME/.zshrc"
    echo "# Teams RAG Connector credentials" >> "$HOME/.zshrc"
    echo "[ -f $ENV_FILE ] && source $ENV_FILE" >> "$HOME/.zshrc"
    echo "Added source line to ~/.zshrc"
fi
