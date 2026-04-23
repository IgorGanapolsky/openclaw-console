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
