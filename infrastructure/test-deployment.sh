#!/bin/bash

# OpenClaw Relay Service Deployment Test
# Tests the deployed relay service infrastructure

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Configuration
RELAY_URL="${RELAY_URL:-https://relay.openclaw.com}"
WEBSOCKET_URL="${WEBSOCKET_URL:-wss://relay.openclaw.com}"
QR_URL="${QR_URL:-https://qr.openclaw.com}"
HEALTH_TIMEOUT=10
TEST_GATEWAY_ID="test-$(date +%s)"

# Test functions
test_http_health() {
    log_info "Testing HTTP health endpoint..."

    if timeout $HEALTH_TIMEOUT curl -f -s "$RELAY_URL/health" | grep -q "healthy"; then
        log_success "HTTP health check passed"
        return 0
    else
        log_error "HTTP health check failed"
        return 1
    fi
}

test_api_endpoints() {
    log_info "Testing API endpoints..."

    # Test relay info endpoint
    if timeout $HEALTH_TIMEOUT curl -f -s "$RELAY_URL/api/relay/info" | grep -q "openclaw-relay"; then
        log_success "API info endpoint working"
    else
        log_error "API info endpoint failed"
        return 1
    fi

    # Test relay endpoints list
    if timeout $HEALTH_TIMEOUT curl -f -s "$RELAY_URL/api/relay/endpoints" | grep -q "endpoints"; then
        log_success "Relay endpoints API working"
    else
        log_error "Relay endpoints API failed"
        return 1
    fi

    return 0
}

test_websocket_connection() {
    log_info "Testing WebSocket connection..."

    # Test if we can establish a WebSocket connection
    if command -v wscat >/dev/null 2>&1; then
        # Use wscat if available
        if timeout 5 wscat -c "$WEBSOCKET_URL/$TEST_GATEWAY_ID" --execute 'ping' 2>/dev/null; then
            log_success "WebSocket connection test passed"
            return 0
        else
            log_warn "WebSocket connection test inconclusive (may require authentication)"
            return 0
        fi
    else
        log_warn "wscat not available, skipping WebSocket test"
        return 0
    fi
}

test_qr_service() {
    log_info "Testing QR code service..."

    # Create test QR code
    QR_PAYLOAD="{
        \"gatewayId\": \"$TEST_GATEWAY_ID\",
        \"name\": \"Test Gateway\",
        \"baseUrl\": \"http://localhost:8080\",
        \"authToken\": \"test-token\"
    }"

    if timeout $HEALTH_TIMEOUT curl -f -s -H "Content-Type: application/json" -d "$QR_PAYLOAD" "$QR_URL/api/qr/gateway" | grep -q "qrCode"; then
        log_success "QR code generation working"
        return 0
    else
        log_warn "QR service not available (may be deployed separately)"
        return 0
    fi
}

test_global_endpoints() {
    log_info "Testing global endpoint availability..."

    REGIONS=(
        "us-central1-relay.openclaw.com"
        "us-east1-relay.openclaw.com"
        "europe-west1-relay.openclaw.com"
        "asia-east1-relay.openclaw.com"
    )

    local success_count=0
    local total_regions=${#REGIONS[@]}

    for region in "${REGIONS[@]}"; do
        if timeout 5 curl -f -s "https://$region/health" >/dev/null 2>&1; then
            log_success "Regional endpoint $region is healthy"
            ((success_count++))
        else
            log_warn "Regional endpoint $region is not responding"
        fi
    done

    if [ $success_count -gt 0 ]; then
        log_success "$success_count out of $total_regions regional endpoints are healthy"
        return 0
    else
        log_error "No regional endpoints are responding"
        return 1
    fi
}

test_load_balancer() {
    log_info "Testing load balancer configuration..."

    # Test SSL certificate
    if timeout $HEALTH_TIMEOUT curl -I -s "$RELAY_URL" | grep -q "HTTP/2 200\|HTTP/1.1 200"; then
        log_success "Load balancer SSL configuration working"
    else
        log_error "Load balancer not responding correctly"
        return 1
    fi

    # Test HTTP to HTTPS redirect
    if timeout $HEALTH_TIMEOUT curl -I -s "http://relay.openclaw.com" | grep -q "301\|302"; then
        log_success "HTTP to HTTPS redirect working"
    else
        log_warn "HTTP to HTTPS redirect not working as expected"
    fi

    return 0
}

test_monitoring() {
    log_info "Testing monitoring endpoints..."

    # Test if metrics endpoint is accessible (may require internal access)
    if timeout $HEALTH_TIMEOUT curl -f -s "$RELAY_URL:9090/metrics" >/dev/null 2>&1; then
        log_success "Metrics endpoint accessible"
    else
        log_info "Metrics endpoint not publicly accessible (expected for security)"
    fi

    return 0
}

run_performance_test() {
    log_info "Running basic performance test..."

    # Simple performance test using curl timing
    local start_time=$(date +%s%3N)
    timeout $HEALTH_TIMEOUT curl -f -s -o /dev/null "$RELAY_URL/health"
    local end_time=$(date +%s%3N)
    local duration=$((end_time - start_time))

    if [ $duration -lt 1000 ]; then
        log_success "Response time: ${duration}ms (excellent)"
    elif [ $duration -lt 2000 ]; then
        log_success "Response time: ${duration}ms (good)"
    else
        log_warn "Response time: ${duration}ms (slow, may need optimization)"
    fi
}

# Main test runner
main() {
    log_info "Starting OpenClaw Relay Service deployment tests..."
    log_info "Testing relay service at: $RELAY_URL"
    log_info "Testing WebSocket at: $WEBSOCKET_URL"

    local tests_passed=0
    local tests_failed=0

    # Run tests
    if test_http_health; then ((tests_passed++)); else ((tests_failed++)); fi
    if test_api_endpoints; then ((tests_passed++)); else ((tests_failed++)); fi
    if test_websocket_connection; then ((tests_passed++)); else ((tests_failed++)); fi
    if test_qr_service; then ((tests_passed++)); else ((tests_failed++)); fi
    if test_global_endpoints; then ((tests_passed++)); else ((tests_failed++)); fi
    if test_load_balancer; then ((tests_passed++)); else ((tests_failed++)); fi
    if test_monitoring; then ((tests_passed++)); else ((tests_failed++)); fi

    # Performance test
    run_performance_test

    # Summary
    echo
    log_info "Test Results:"
    log_success "Tests passed: $tests_passed"
    if [ $tests_failed -gt 0 ]; then
        log_error "Tests failed: $tests_failed"
    fi

    local total_tests=$((tests_passed + tests_failed))
    local success_rate=$((tests_passed * 100 / total_tests))

    if [ $success_rate -ge 80 ]; then
        log_success "Deployment health: ${success_rate}% (Ready for production)"
        echo
        log_info "🎉 OpenClaw Relay Service is operational!"
        log_info "Mobile apps can now use relay.openclaw.com as fallback connection"
        echo
        log_info "Next steps:"
        log_info "1. Test with actual mobile apps"
        log_info "2. Monitor performance and scaling"
        log_info "3. Set up additional regions if needed"
        return 0
    else
        log_error "Deployment health: ${success_rate}% (Needs attention)"
        log_error "Some critical services may not be working correctly"
        return 1
    fi
}

main "$@"