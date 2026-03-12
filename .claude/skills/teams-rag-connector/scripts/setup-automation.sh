#!/bin/bash
# =============================================================================
# Automation Setup — Cron jobs for Teams RAG pipeline
#
# Installs three cron jobs:
#   1. Daily briefing at 7:00 AM weekdays
#   2. Incremental sync every 15 minutes
#   3. Webhook renewal every 45 minutes
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$HOME/.shieldcortex/logs"
BRIEFING_DIR="$HOME/.shieldcortex/briefings"

mkdir -p "$LOG_DIR" "$BRIEFING_DIR"

echo "============================================="
echo " Teams RAG — Automation Setup"
echo "============================================="

# Build cron entries
CRON_BRIEFING="0 7 * * 1-5 cd $SCRIPT_DIR && /usr/local/bin/node daily-briefing.js >> $LOG_DIR/briefing.log 2>&1"
CRON_SYNC="*/15 * * * * cd $SCRIPT_DIR && /usr/local/bin/node ingest-messages.js --mode incremental >> $LOG_DIR/sync.log 2>&1"
CRON_RENEW="*/45 * * * * cd $SCRIPT_DIR && /usr/local/bin/node subscribe-webhooks.js --renew >> $LOG_DIR/webhook-renew.log 2>&1"

# Check if crons already installed
EXISTING_CRON=$(crontab -l 2>/dev/null || true)

if echo "$EXISTING_CRON" | grep -q "teams-rag"; then
    echo "Cron jobs already installed. Updating..."
    # Remove old entries
    EXISTING_CRON=$(echo "$EXISTING_CRON" | grep -v "daily-briefing\|ingest-messages\|subscribe-webhooks")
fi

# Install new cron entries
NEW_CRON="$EXISTING_CRON
# === Teams RAG Connector (teams-rag) ===
$CRON_BRIEFING
$CRON_SYNC
$CRON_RENEW"

echo "$NEW_CRON" | crontab -

echo ""
echo "Installed 3 cron jobs:"
echo ""
echo "  [1] Daily Briefing — 7:00 AM Mon-Fri"
echo "      Log: $LOG_DIR/briefing.log"
echo ""
echo "  [2] Incremental Sync — every 15 min"
echo "      Log: $LOG_DIR/sync.log"
echo ""
echo "  [3] Webhook Renewal — every 45 min"
echo "      Log: $LOG_DIR/webhook-renew.log"
echo ""
echo "Verify with: crontab -l"
echo ""
echo "Briefings saved to: $BRIEFING_DIR/"
