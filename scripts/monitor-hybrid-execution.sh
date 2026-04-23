#!/bin/bash

# Monitor hybrid execution metrics
GATEWAY_URL=${GATEWAY_URL:-http://localhost:18789}
DEV_TOKEN=${OPENCLAW_DEV_TOKEN:-}

if [[ -z "$DEV_TOKEN" ]]; then
    echo "❌ OPENCLAW_DEV_TOKEN not set"
    exit 1
fi

echo "🔍 Hybrid Execution Metrics:"
echo "=========================="

curl -s -H "Authorization: Bearer $DEV_TOKEN" \
    "$GATEWAY_URL/api/metrics/hybrid-execution" | \
    jq -r '
    "Local Executions: " + (.local_executions | tostring) +
    "\nCloud Executions: " + (.cloud_executions | tostring) +
    "\nHybrid Executions: " + (.hybrid_executions | tostring) +
    "\nDaily Spend: $" + ((.daily_spend_cents / 100) | tostring) +
    "\nBudget Remaining: $" + ((.daily_budget_remaining_cents / 100) | tostring) +
    "\nAvg Local Time: " + (.avg_local_time_seconds | tostring) + "s" +
    "\nAvg Cloud Time: " + (.avg_cloud_time_seconds | tostring) + "s"
    '
