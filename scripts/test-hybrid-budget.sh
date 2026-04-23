#!/bin/bash

# TEST HYBRID EXECUTION WITH $10/MONTH BUDGET
# Designed for cost-conscious operation

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}🧮 TESTING $10/MONTH BUDGET CONFIGURATION${NC}"
echo "============================================="

# Load configuration
source .env.managed-agents

echo -e "${GREEN}✅ Budget Configuration:${NC}"
echo "  Daily Budget: $$(($ANTHROPIC_DAILY_BUDGET_CENTS / 100)) (33 cents)"
echo "  Monthly Budget: ~$10"
echo "  Alert Threshold: ${ANTHROPIC_ALERT_THRESHOLD_PERCENT}%"
echo "  Hard Limit: ${ANTHROPIC_HARD_LIMIT_PERCENT}%"
echo "  Cost Mode: ${ANTHROPIC_COST_MODE}"
echo ""

# Test API connection (with minimal cost)
echo -e "${BLUE}🔑 Testing API Connection (1 cent test):${NC}"
API_TEST=$(curl -s -X POST https://api.anthropic.com/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${ANTHROPIC_API_KEY}" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-3-haiku-20240307",
    "max_tokens": 10,
    "messages": [{"role": "user", "content": "Hi"}]
  }')

if echo "$API_TEST" | grep -q '"content"'; then
    echo -e "${GREEN}✅ API Working - Credits Available${NC}"

    # Extract token usage for cost calculation
    INPUT_TOKENS=$(echo "$API_TEST" | jq -r '.usage.input_tokens // 0')
    OUTPUT_TOKENS=$(echo "$API_TEST" | jq -r '.usage.output_tokens // 0')

    # Haiku pricing: ~$0.25/1K input, ~$1.25/1K output
    INPUT_COST=$(echo "scale=6; $INPUT_TOKENS * 0.25 / 1000" | bc)
    OUTPUT_COST=$(echo "scale=6; $OUTPUT_TOKENS * 1.25 / 1000" | bc)
    TOTAL_COST=$(echo "scale=6; $INPUT_COST + $OUTPUT_COST" | bc)

    echo "  Input tokens: $INPUT_TOKENS"
    echo "  Output tokens: $OUTPUT_TOKENS"
    echo "  Estimated cost: \$$(printf "%.4f" $TOTAL_COST)"

else
    echo -e "${YELLOW}⚠️  API Credits Still Processing${NC}"
    echo "  Will use Mac Mini only until credits activate"
fi

echo ""
echo -e "${BLUE}🎯 COST-OPTIMIZATION STRATEGY:${NC}"
echo "============================================="
echo -e "${GREEN}LOCAL EXECUTION (FREE):${NC}"
echo "  • Code analysis < 500 lines"
echo "  • Simple task execution"
echo "  • All sensitive/confidential data"
echo "  • Monitoring and alerts"
echo ""
echo -e "${YELLOW}CLOUD EXECUTION (PAID - ONLY WHEN NECESSARY):${NC}"
echo "  • Complex analysis > 1000 lines"
echo "  • Heavy computational tasks"
echo "  • When Mac Mini is overloaded"
echo "  • Critical tasks needing <30s response"
echo ""
echo -e "${BLUE}📊 BUDGET BREAKDOWN:${NC}"
echo "  • \$10/month = ~300 API calls"
echo "  • Focus: High-value enterprise tasks only"
echo "  • ROI target: \$200+ revenue per \$10 spend"

echo ""
echo -e "${GREEN}🚀 READY FOR DEPLOYMENT${NC}"
echo "Hybrid system configured for maximum cost efficiency!"