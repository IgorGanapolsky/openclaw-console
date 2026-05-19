# OpenClaw Relay Service
# A WebSocket relay that forwards traffic between mobile apps and OpenClaw gateways

FROM node:22-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S relay -u 1001

# Switch to non-root user
USER relay

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node health-check.js

EXPOSE 8080

CMD ["npm", "start"]