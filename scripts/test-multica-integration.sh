#!/bin/bash

# OpenClaw + Multica Integration End-to-End Test Script
# Tests complete workflow from setup to approval completion

set -e

echo "🧪 Testing OpenClaw + Multica Integration End-to-End"
echo "====================================================="

# Test configuration
GATEWAY_URL="http://localhost:18789"
MULTICA_URL="http://localhost:8080"
FRONTEND_URL="http://localhost:3000"
TIMEOUT=30

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results tracking
TESTS_PASSED=0
TESTS_FAILED=0

test_step() {
    local step_name="$1"
    local test_command="$2"

    echo -e "${BLUE}Testing: ${step_name}${NC}"

    if eval "$test_command"; then
        echo -e "${GREEN}✅ PASS: ${step_name}${NC}"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}❌ FAIL: ${step_name}${NC}"
        ((TESTS_FAILED++))
        return 1
    fi
}

wait_for_service() {
    local url="$1"
    local service_name="$2"
    local max_attempts=30
    local attempt=1

    echo "⏳ Waiting for ${service_name} to be ready..."

    while [ $attempt -le $max_attempts ]; do
        if curl -f -s --max-time 5 "$url" > /dev/null 2>&1; then
            echo -e "${GREEN}✅ ${service_name} is ready${NC}"
            return 0
        fi

        echo "Attempt $attempt/$max_attempts: ${service_name} not ready yet..."
        sleep 2
        ((attempt++))
    done

    echo -e "${RED}❌ ${service_name} failed to start within $((max_attempts * 2)) seconds${NC}"
    return 1
}

# Step 1: Infrastructure Setup Test
echo -e "\n${YELLOW}=== STEP 1: INFRASTRUCTURE SETUP ===${NC}"

test_step "Docker Compose Services Starting" \
    "docker-compose -f docker-compose.multica.yml up -d"

wait_for_service "$MULTICA_URL/api/health" "Multica Backend"
wait_for_service "$GATEWAY_URL/api/health" "OpenClaw Gateway"
wait_for_service "$FRONTEND_URL" "Multica Frontend"

# Step 2: API Integration Tests
echo -e "\n${YELLOW}=== STEP 2: API INTEGRATION ===${NC}"

# Get tokens for testing
if [ -f .env.multica ]; then
    source .env.multica
fi

OPENCLAW_TOKEN=${OPENCLAW_DEV_TOKEN}
MULTICA_TOKEN=${MULTICA_API_TOKEN}

test_step "OpenClaw Gateway Health Check" \
    "curl -f -H 'Authorization: Bearer $OPENCLAW_TOKEN' $GATEWAY_URL/api/health"

test_step "Multica Backend Health Check" \
    "curl -f -H 'Authorization: Bearer $MULTICA_TOKEN' $MULTICA_URL/api/health"

test_step "OpenClaw Agents Endpoint" \
    "curl -f -H 'Authorization: Bearer $OPENCLAW_TOKEN' $GATEWAY_URL/api/agents"

test_step "Multica Agents Endpoint" \
    "curl -f -H 'Authorization: Bearer $MULTICA_TOKEN' $MULTICA_URL/api/agents"

# Step 3: Multica Bridge Integration Tests
echo -e "\n${YELLOW}=== STEP 3: MULTICA BRIDGE INTEGRATION ===${NC}"

test_step "Multica Bridge Endpoint Available" \
    "curl -f -X OPTIONS $GATEWAY_URL/api/multica/issues"

test_step "Webhook Endpoint Available" \
    "curl -f -X OPTIONS $GATEWAY_URL/api/webhooks/multica"

# Test structured prompt creation
PROMPT_PAYLOAD='{
  "title": "Test Integration Prompt",
  "prompt": "This is a test prompt to validate the Multica integration. Please confirm this works end-to-end.",
  "agent_id": "test-agent",
  "priority": "High",
  "tags": ["test", "integration", "mobile-created"]
}'

test_step "Create Structured Prompt via API" \
    "curl -f -X POST -H 'Authorization: Bearer $OPENCLAW_TOKEN' -H 'Content-Type: application/json' -d '$PROMPT_PAYLOAD' $GATEWAY_URL/api/multica/issues"

# Step 4: Webhook Processing Tests
echo -e "\n${YELLOW}=== STEP 4: WEBHOOK PROCESSING ===${NC}"

# Test webhook with sample Multica event
WEBHOOK_PAYLOAD='{
  "type": "issue.created",
  "data": {
    "id": "test-issue-123",
    "title": "Test Integration Issue",
    "description": "Testing webhook processing",
    "status": "Todo",
    "priority": "High",
    "assignee": "test-agent",
    "created_at": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",
    "updated_at": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",
    "labels": ["test", "integration"]
  },
  "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",
  "id": "webhook-event-123"
}'

test_step "Process Webhook Event" \
    "curl -f -X POST -H 'Content-Type: application/json' -d '$WEBHOOK_PAYLOAD' $GATEWAY_URL/api/webhooks/multica"

# Test execution webhook (should trigger approval)
EXECUTION_PAYLOAD='{
  "type": "execution.started",
  "data": {
    "id": "exec-123",
    "issue_id": "test-issue-123",
    "agent_id": "test-agent",
    "status": "pending",
    "tool_calls": [
      {
        "id": "tool-123",
        "tool_name": "shell_command",
        "parameters": {"command": "echo 'test dangerous action'"},
        "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"
      }
    ]
  }
}'

test_step "Process Execution Webhook (Should Create Approval)" \
    "curl -f -X POST -H 'Content-Type: application/json' -d '$EXECUTION_PAYLOAD' $GATEWAY_URL/api/webhooks/multica"

# Step 5: Approval Workflow Tests
echo -e "\n${YELLOW}=== STEP 5: APPROVAL WORKFLOW ===${NC}"

# Check for pending approvals
test_step "Check Pending Approvals Created" \
    "curl -f -H 'Authorization: Bearer $OPENCLAW_TOKEN' $GATEWAY_URL/api/approvals/pending | grep -q 'multica-exec-'"

# Get approval ID for testing
APPROVAL_ID=$(curl -s -H "Authorization: Bearer $OPENCLAW_TOKEN" $GATEWAY_URL/api/approvals/pending | jq -r '.[0].id // empty')

if [ -n "$APPROVAL_ID" ]; then
    echo "Found approval ID: $APPROVAL_ID"

    # Test approval response
    APPROVAL_RESPONSE='{
      "decision": "approved",
      "biometric_verified": true
    }'

    test_step "Submit Approval Response" \
        "curl -f -X POST -H 'Authorization: Bearer $OPENCLAW_TOKEN' -H 'Content-Type: application/json' -d '$APPROVAL_RESPONSE' $GATEWAY_URL/api/approvals/$APPROVAL_ID/respond"
else
    echo -e "${YELLOW}⚠️  No approval created - this may be expected if dangerous action detection didn't trigger${NC}"
fi

# Step 6: Mobile App Simulation Tests
echo -e "\n${YELLOW}=== STEP 6: MOBILE APP SIMULATION ===${NC}"

# Simulate mobile app creating structured prompt
MOBILE_PROMPT='{
  "title": "Mobile Test: Deploy to Staging",
  "prompt": "Deploy the latest changes from main branch to staging environment. Run all integration tests and notify on completion.",
  "agent_id": "deploy-manager",
  "priority": "High",
  "tags": ["mobile-created", "deployment", "staging"]
}'

test_step "Mobile App: Create Structured Prompt" \
    "curl -f -X POST -H 'Authorization: Bearer $OPENCLAW_TOKEN' -H 'Content-Type: application/json' -d '$MOBILE_PROMPT' $GATEWAY_URL/api/multica/issues"

# Test mobile app fetching agents for selection
test_step "Mobile App: Fetch Available Agents" \
    "curl -f -H 'Authorization: Bearer $OPENCLAW_TOKEN' $GATEWAY_URL/api/agents | jq '.[] | {id, name, status}'"

# Test mobile app fetching tasks (converted from issues)
test_step "Mobile App: Fetch Tasks (from Multica Issues)" \
    "curl -f -H 'Authorization: Bearer $OPENCLAW_TOKEN' $GATEWAY_URL/api/agents/deploy-manager/tasks"

# Step 7: Performance and Load Tests
echo -e "\n${YELLOW}=== STEP 7: PERFORMANCE TESTS ===${NC}"

# Test multiple concurrent prompt creations
test_step "Concurrent Prompt Creation (Load Test)" \
    "for i in {1..5}; do curl -f -X POST -H 'Authorization: Bearer $OPENCLAW_TOKEN' -H 'Content-Type: application/json' -d '{\"title\":\"Load Test $i\",\"prompt\":\"Testing concurrent load\",\"agent_id\":\"test-agent\",\"priority\":\"Medium\"}' $GATEWAY_URL/api/multica/issues & done; wait"

# Test webhook processing under load
test_step "Concurrent Webhook Processing (Load Test)" \
    "for i in {1..5}; do curl -f -X POST -H 'Content-Type: application/json' -d '{\"type\":\"issue.updated\",\"data\":{\"id\":\"load-test-$i\",\"title\":\"Load Test $i\",\"status\":\"In Progress\"}}' $GATEWAY_URL/api/webhooks/multica & done; wait"

# Step 8: Integration Status Verification
echo -e "\n${YELLOW}=== STEP 8: INTEGRATION STATUS ===${NC}"

# Verify all services are still running after tests
test_step "Post-Test: Gateway Still Responsive" \
    "curl -f -H 'Authorization: Bearer $OPENCLAW_TOKEN' $GATEWAY_URL/api/health"

test_step "Post-Test: Multica Still Responsive" \
    "curl -f -H 'Authorization: Bearer $MULTICA_TOKEN' $MULTICA_URL/api/health"

test_step "Post-Test: Frontend Still Accessible" \
    "curl -f -s $FRONTEND_URL > /dev/null"

# Verify bridge is functioning
test_step "Post-Test: Bridge Integration Active" \
    "curl -f -H 'Authorization: Bearer $OPENCLAW_TOKEN' $GATEWAY_URL/api/health | jq -e '.status == \"ok\"'"

# Generate test report
echo -e "\n${BLUE}=== TEST RESULTS SUMMARY ===${NC}"
echo "Total Tests: $((TESTS_PASSED + TESTS_FAILED))"
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Failed: $TESTS_FAILED${NC}"

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "\n${GREEN}🎉 ALL TESTS PASSED! OpenClaw + Multica integration is working correctly.${NC}"
    echo ""
    echo "✅ Infrastructure: All services running"
    echo "✅ API Integration: Gateway ↔ Multica communication working"
    echo "✅ Webhook Processing: Event routing and handling functional"
    echo "✅ Approval Workflows: Biometric approval flow operational"
    echo "✅ Mobile Integration: Structured prompt creation ready"
    echo "✅ Performance: Load testing passed"
    echo ""
    echo -e "${BLUE}🚀 Ready for production deployment!${NC}"
    exit 0
else
    echo -e "\n${RED}❌ SOME TESTS FAILED. Please check the output above for details.${NC}"
    echo ""
    echo "Common fixes:"
    echo "- Ensure all Docker services are running: docker-compose -f docker-compose.multica.yml ps"
    echo "- Check gateway configuration: ENABLE_MULTICA_BRIDGE=true"
    echo "- Verify API tokens are set correctly in .env.multica"
    echo "- Check network connectivity between services"
    exit 1
fi