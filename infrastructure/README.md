# OpenClaw Relay Service Infrastructure

Production infrastructure for the OpenClaw relay service that provides "always works" cross-network connectivity for mobile apps.

## Overview

The OpenClaw Relay Service consists of:

1. **Relay Service** - WebSocket relay for mobile apps and OpenClaw gateways
2. **QR Service** - QR code generation and tunnel management APIs  
3. **Global Load Balancer** - Multi-region deployment with automatic failover
4. **Redis Cache** - Session management and cross-region coordination
5. **Monitoring** - Health checks, metrics, and alerting
6. **CDN** - Content delivery for mobile app assets

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Mobile Apps    │    │  Load Balancer   │    │  OpenClaw       │
│                 │    │  (Global)        │    │  Gateways       │
├─────────────────┤    ├──────────────────┤    ├─────────────────┤
│ iOS/Android     │◄──►│ relay.openclaw   │◄──►│ Local Networks  │
│ Apps            │    │ .com             │    │ Self-hosted     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                    ┌───────────┼───────────┐
                    │           │           │
            ┌───────▼────┐ ┌────▼────┐ ┌───▼─────┐
            │ us-central1│ │europe-  │ │asia-    │
            │ Cloud Run  │ │west1    │ │east1    │
            │            │ │Cloud Run│ │Cloud Run│
            └────────────┘ └─────────┘ └─────────┘
                    │           │           │
                    └───────────┼───────────┘
                                │
                        ┌───────▼────────┐
                        │ Redis Cache    │
                        │ (Multi-Region) │
                        └────────────────┘
```

## Services

### Relay Service (`relay-service/`)

WebSocket relay that forwards traffic between mobile apps and OpenClaw gateways.

**Features:**
- Multi-region deployment for low latency
- Connection pooling and load balancing
- Session management via Redis
- Prometheus metrics
- Health monitoring
- Graceful shutdown

**Endpoints:**
- `wss://relay.openclaw.com/<gatewayId>` - WebSocket relay
- `/health` - Health check
- `/api/relay/info` - Service information
- `:9090/metrics` - Prometheus metrics

### QR Service (`qr-service/`)

QR code generation and tunnel management for mobile apps.

**Features:**
- Gateway connection QR codes
- Tunnel configuration QR codes
- Redis-based caching
- Rate limiting
- CORS support

**Endpoints:**
- `POST /api/qr/gateway` - Generate gateway QR code
- `POST /api/qr/tunnel` - Generate tunnel QR code  
- `POST /api/qr/verify` - Verify QR code data
- `GET /api/relay/endpoints` - Available relay endpoints
- `GET /api/tunnels/:gatewayId` - List tunnels for gateway

## Deployment

### Prerequisites

1. **Google Cloud Project** with billing enabled
2. **Cloudflare Account** with domain access
3. **Required Tools:**
   - `gcloud` CLI
   - `terraform` >= 1.5
   - `docker`
   - `node` >= 22

### Setup

1. **Configure Authentication:**
   ```bash
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   ```

2. **Create Service Account:**
   ```bash
   gcloud iam service-accounts create openclaw-relay-deployer \\
     --display-name="OpenClaw Relay Deployer"

   gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \\
     --member="serviceAccount:openclaw-relay-deployer@YOUR_PROJECT_ID.iam.gserviceaccount.com" \\
     --role="roles/editor"
   ```

3. **Configure Terraform:**
   ```bash
   cd infrastructure/terraform
   cp terraform.tfvars.example terraform.tfvars
   # Edit terraform.tfvars with your values
   ```

4. **Deploy Infrastructure:**
   ```bash
   # From infrastructure/ directory
   ./deploy.sh
   ```

### Manual Deployment

1. **Build and Push Images:**
   ```bash
   cd relay-service
   docker build -t gcr.io/YOUR_PROJECT_ID/openclaw-relay .
   docker push gcr.io/YOUR_PROJECT_ID/openclaw-relay
   
   cd ../qr-service  
   docker build -t gcr.io/YOUR_PROJECT_ID/openclaw-qr .
   docker push gcr.io/YOUR_PROJECT_ID/openclaw-qr
   ```

2. **Deploy with Terraform:**
   ```bash
   cd terraform
   terraform init
   terraform plan -var-file="terraform.tfvars"
   terraform apply
   ```

### CI/CD Deployment

The GitHub Actions workflow `.github/workflows/deploy-relay-service.yml` automatically deploys on pushes to `main` branch.

**Required Secrets:**
- `GCP_PROJECT_ID` - Google Cloud Project ID
- `GCP_SA_KEY` - Service Account Key JSON
- `CLOUDFLARE_API_TOKEN` - Cloudflare API token
- `CLOUDFLARE_ZONE_ID` - Cloudflare Zone ID

## Configuration

### Environment Variables

**Relay Service:**
- `PORT=8080` - HTTP server port
- `METRICS_PORT=9090` - Metrics server port  
- `REDIS_URL` - Redis connection URL
- `MAX_CONNECTIONS=10000` - Max WebSocket connections
- `CONNECTION_TIMEOUT_MS=300000` - Connection timeout
- `PING_INTERVAL_MS=30000` - WebSocket ping interval
- `REGION` - Deployment region
- `NODE_ENV=production` - Environment

**QR Service:**
- `PORT=8080` - HTTP server port
- `REDIS_URL` - Redis connection URL
- `ALLOWED_ORIGINS` - CORS allowed origins

### Terraform Variables

See `terraform.tfvars.example` for all configuration options.

## Monitoring

### Health Checks

- **HTTP:** `GET /health` - Returns service status
- **WebSocket:** Connection test via ping/pong
- **Redis:** Connection and latency test
- **Memory:** Usage tracking and limits

### Metrics

Prometheus metrics exposed on `:9090/metrics`:

- `relay_connections_total` - Active connections
- `relay_sessions_total` - Active relay sessions  
- `relay_messages_relayed_total` - Messages relayed
- `relay_bytes_transferred_total` - Bytes transferred
- `relay_errors_total` - Error count
- Memory and CPU metrics

### Alerting

Google Cloud Monitoring alerts for:

- Service downtime
- High latency (>5s)
- High memory usage (>80%)
- Redis connection issues
- High error rate

### Dashboard

Import `monitoring/dashboard.json` to Google Cloud Monitoring for a comprehensive dashboard.

## Security

### Network Security

- **TLS/SSL:** All connections encrypted with managed certificates
- **Rate Limiting:** 100 requests per 15 minutes per IP
- **CORS:** Configurable allowed origins
- **Security Headers:** Helmet.js security middleware

### Data Security

- **Redis:** Encrypted at rest and in transit
- **Secrets:** Google Secret Manager for sensitive data
- **IAM:** Least privilege service accounts
- **VPC:** Private networking for internal communication

### Compliance

- **Logging:** Structured logging for audit trails
- **Monitoring:** Full observability and alerting
- **Access Control:** IAM-based access management

## Troubleshooting

### Common Issues

1. **Connection Failures:**
   ```bash
   # Check service health
   curl https://relay.openclaw.com/health
   
   # Check WebSocket connectivity
   wscat -c wss://relay.openclaw.com/test-gateway-id
   ```

2. **High Latency:**
   - Check regional deployment status
   - Verify Redis connectivity
   - Review load balancer routing

3. **Memory Issues:**
   - Monitor connection count
   - Check for memory leaks
   - Scale up instances if needed

### Logs

```bash
# View Cloud Run logs
gcloud logs read "resource.type=cloud_run_revision" --limit=100

# View specific service logs
gcloud logs read "resource.type=cloud_run_revision AND resource.labels.service_name=openclaw-relay-us-central1" --limit=50

# Follow logs in real-time
gcloud logs tail "resource.type=cloud_run_revision"
```

### Debugging

1. **Enable Debug Mode:**
   ```bash
   # Set LOG_LEVEL=debug in environment variables
   ```

2. **Test Endpoints:**
   ```bash
   # Health check
   curl https://relay.openclaw.com/health
   
   # Service info
   curl https://relay.openclaw.com/api/relay/info
   
   # Relay endpoints
   curl https://relay.openclaw.com/api/relay/endpoints
   ```

## Performance

### Expected Metrics

- **Latency:** <100ms globally, <50ms regionally
- **Throughput:** 10,000+ concurrent connections per region
- **Availability:** 99.9% uptime SLA
- **Memory:** <512MB per instance under normal load

### Scaling

- **Horizontal:** Auto-scaling from 1-10 instances per region
- **Regional:** Deploy to additional regions as needed
- **Redis:** Can scale to larger instance sizes

### Optimization

- **Connection Pooling:** WebSocket connection reuse
- **Message Compression:** Optional compression for large messages  
- **CDN:** Static content cached globally
- **Edge Caching:** Regional endpoint selection

## Cost Optimization

### Estimated Monthly Costs

- **Cloud Run:** $20-100 (depends on usage)
- **Load Balancer:** $18-25
- **Redis:** $30-60 (1-2GB instance)
- **Monitoring:** $5-15
- **Total:** ~$75-200/month

### Cost Reduction

1. **Right-sizing:** Monitor resource usage and adjust limits
2. **Regional Deployment:** Deploy only in needed regions initially  
3. **Reserved Instances:** Use committed use discounts for Redis
4. **Monitoring:** Set up cost alerts and budgets

## Contributing

1. **Development Setup:**
   ```bash
   cd relay-service
   npm install
   npm run dev
   ```

2. **Testing:**
   ```bash
   npm test
   ```

3. **Linting:**
   ```bash
   npm run lint
   ```

## Support

- **Documentation:** See individual service READMEs
- **Issues:** GitHub Issues for bug reports
- **Monitoring:** Google Cloud Console for operational issues
- **Logs:** Cloud Logging for detailed troubleshooting