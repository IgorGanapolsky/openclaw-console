#!/bin/bash

# OpenClaw Relay Service Deployment Script
# Builds and deploys the relay service to Google Cloud

set -euo pipefail

# Configuration
PROJECT_ID="${GCP_PROJECT_ID:-openclaw-console}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="openclaw-relay"
ENVIRONMENT="${ENVIRONMENT:-production}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
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

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check if required tools are installed
    command -v gcloud >/dev/null 2>&1 || { log_error "gcloud CLI is required but not installed."; exit 1; }
    command -v docker >/dev/null 2>&1 || { log_error "Docker is required but not installed."; exit 1; }
    command -v terraform >/dev/null 2>&1 || { log_error "Terraform is required but not installed."; exit 1; }

    # Check if authenticated with gcloud
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
        log_error "Not authenticated with gcloud. Run 'gcloud auth login' first."
        exit 1
    fi

    # Set the project
    gcloud config set project "$PROJECT_ID"

    log_success "Prerequisites check passed"
}

# Build the container image
build_image() {
    log_info "Building container image..."

    cd relay-service

    # Build the Docker image
    IMAGE_TAG="gcr.io/${PROJECT_ID}/${SERVICE_NAME}:$(date +%Y%m%d-%H%M%S)"
    LATEST_TAG="gcr.io/${PROJECT_ID}/${SERVICE_NAME}:latest"

    docker build -t "$IMAGE_TAG" -t "$LATEST_TAG" .

    # Push the image to Google Container Registry
    docker push "$IMAGE_TAG"
    docker push "$LATEST_TAG"

    log_success "Container image built and pushed: $IMAGE_TAG"
    echo "$IMAGE_TAG" > ../image-tag.txt

    cd ..
}

# Deploy infrastructure with Terraform
deploy_infrastructure() {
    log_info "Deploying infrastructure with Terraform..."

    cd terraform

    # Initialize Terraform if needed
    if [ ! -d ".terraform" ]; then
        log_info "Initializing Terraform..."
        terraform init
    fi

    # Plan the deployment
    log_info "Planning Terraform deployment..."
    terraform plan \
        -var="gcp_project_id=${PROJECT_ID}" \
        -var="environment=${ENVIRONMENT}" \
        -var="container_image=$(cat ../image-tag.txt)" \
        -out=tfplan

    # Apply the deployment
    log_info "Applying Terraform deployment..."
    terraform apply tfplan

    # Save outputs
    terraform output -json > ../terraform-outputs.json

    log_success "Infrastructure deployed successfully"

    cd ..
}

# Update DNS records
update_dns() {
    log_info "Updating DNS records..."

    # Extract load balancer IP from Terraform outputs
    LB_IP=$(jq -r '.load_balancer_ip.value' terraform-outputs.json)

    if [ "$LB_IP" != "null" ] && [ -n "$LB_IP" ]; then
        log_success "Load balancer IP: $LB_IP"
        log_info "DNS records will be updated automatically by Terraform"
    else
        log_error "Failed to get load balancer IP"
        exit 1
    fi
}

# Run health checks
run_health_checks() {
    log_info "Running health checks..."

    # Extract service URL from Terraform outputs
    SERVICE_URL=$(jq -r '.relay_service_url.value' terraform-outputs.json)

    # Wait for service to be ready
    log_info "Waiting for service to be ready..."
    for i in {1..30}; do
        if curl -f -s "${SERVICE_URL}/health" >/dev/null; then
            log_success "Service is healthy"
            break
        else
            log_info "Waiting for service... (attempt $i/30)"
            sleep 10
        fi
    done

    # Test WebSocket endpoint
    log_info "Testing WebSocket endpoint..."
    WS_URL=$(echo "$SERVICE_URL" | sed 's/https:/wss:/')
    if curl -I -s "${SERVICE_URL}/health" | grep -q "200 OK"; then
        log_success "HTTP health check passed"
    else
        log_error "HTTP health check failed"
        exit 1
    fi

    # Test API endpoints
    log_info "Testing API endpoints..."
    API_INFO_URL="${SERVICE_URL}/api/relay/info"
    if curl -f -s "$API_INFO_URL" | jq -e '.service == "openclaw-relay"' >/dev/null; then
        log_success "API endpoints working"
    else
        log_error "API endpoints not responding correctly"
        exit 1
    fi
}

# Main deployment function
main() {
    log_info "Starting OpenClaw Relay Service deployment..."
    log_info "Project: $PROJECT_ID"
    log_info "Environment: $ENVIRONMENT"
    log_info "Region: $REGION"

    # Ensure we're in the infrastructure directory
    if [ ! -d "relay-service" ] || [ ! -d "terraform" ]; then
        log_error "This script must be run from the infrastructure directory"
        exit 1
    fi

    check_prerequisites
    build_image
    deploy_infrastructure
    update_dns
    run_health_checks

    log_success "Deployment completed successfully!"
    log_info "Service URL: $(jq -r '.relay_service_url.value' terraform-outputs.json)"
    log_info "WebSocket URL: $(jq -r '.relay_websocket_url.value' terraform-outputs.json)"
    log_info "Dashboard: https://console.cloud.google.com/run/detail/${REGION}/${SERVICE_NAME}"
}

# Cleanup function for trapped signals
cleanup() {
    log_warn "Deployment interrupted"
    exit 1
}

# Trap signals for cleanup
trap cleanup SIGINT SIGTERM

# Run main function
main "$@"