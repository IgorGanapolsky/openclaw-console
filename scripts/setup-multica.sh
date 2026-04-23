#!/bin/bash

# OpenClaw + Multica Integration Setup Script
# High-ROI deployment automation

set -e

echo "🚀 Setting up OpenClaw + Multica Integration"
echo "=============================================="

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command -v docker &> /dev/null; then
    echo "❌ Docker is required but not installed. Please install Docker first."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is required but not installed. Please install Docker Compose first."
    exit 1
fi

echo "✅ Docker and Docker Compose found"

# Generate secure tokens if not provided
MULTICA_API_TOKEN=${MULTICA_API_TOKEN:-$(openssl rand -hex 32)}
MULTICA_WEBHOOK_SECRET=${MULTICA_WEBHOOK_SECRET:-$(openssl rand -hex 32)}
OPENCLAW_DEV_TOKEN=${OPENCLAW_DEV_TOKEN:-$(openssl rand -hex 32)}

echo "🔑 Generated secure tokens"

# Create .env file for Docker Compose
cat > .env.multica << EOF
# OpenClaw + Multica Integration Environment Variables
MULTICA_API_TOKEN=${MULTICA_API_TOKEN}
MULTICA_WEBHOOK_SECRET=${MULTICA_WEBHOOK_SECRET}
OPENCLAW_DEV_TOKEN=${OPENCLAW_DEV_TOKEN}

# Database credentials (change these for production!)
POSTGRES_PASSWORD=multica_secure_pwd_$(openssl rand -hex 8)
EOF

echo "📄 Created .env.multica configuration file"

# Build OpenClaw gateway image with Multica integration
echo "🔨 Building OpenClaw gateway with Multica support..."
cd openclaw-skills
if [ ! -f Dockerfile ]; then
    cat > Dockerfile << 'EOF'
FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/
COPY tsconfig.json ./

# Install TypeScript and build
RUN npm install -g typescript
RUN npm run build || tsc

EXPOSE 18789

CMD ["npm", "start"]
EOF
fi

cd ..

# Start the integrated stack
echo "🚀 Starting OpenClaw + Multica stack..."
docker-compose -f docker-compose.multica.yml --env-file .env.multica up -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 10

# Test connectivity
echo "🧪 Testing service connectivity..."

# Test Multica backend
if curl -f -s http://localhost:8080/api/health > /dev/null; then
    echo "✅ Multica backend is running"
else
    echo "❌ Multica backend not responding"
fi

# Test OpenClaw gateway
if curl -f -s -H "Authorization: Bearer $OPENCLAW_DEV_TOKEN" http://localhost:18789/api/health > /dev/null; then
    echo "✅ OpenClaw gateway is running"
else
    echo "❌ OpenClaw gateway not responding"
fi

# Test Multica frontend
if curl -f -s http://localhost:3000 > /dev/null; then
    echo "✅ Multica frontend is running"
else
    echo "❌ Multica frontend not responding"
fi

echo ""
echo "🎉 OpenClaw + Multica Integration Setup Complete!"
echo "================================================="
echo ""
echo "📱 Multica Web UI:     http://localhost:3000"
echo "🔌 OpenClaw Gateway:   http://localhost:18789"
echo "📊 Multica API:        http://localhost:8080"
echo ""
echo "🔑 Your OpenClaw dev token: $OPENCLAW_DEV_TOKEN"
echo "🔑 Your Multica API token:  $MULTICA_API_TOKEN"
echo ""
echo "💡 Quick test commands:"
echo "   curl -H 'Authorization: Bearer $OPENCLAW_DEV_TOKEN' http://localhost:18789/api/health"
echo "   curl -H 'Authorization: Bearer $MULTICA_API_TOKEN' http://localhost:8080/api/health"
echo ""
echo "📖 Next steps:"
echo "1. Open Multica UI at http://localhost:3000"
echo "2. Set up your first agent with the token above"
echo "3. Configure OpenClaw mobile app with gateway URL and token"
echo "4. Create a structured prompt via the mobile app to test integration"
echo ""
echo "🛡️  Security Note: Change the tokens in .env.multica for production deployment!"
echo ""