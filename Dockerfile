# Multi-stage build for QuickBooks Online MCP Server
#
# Build: docker build -t qbo-mcp-server:latest .
# Run:   docker run -e QUICKBOOKS_REALM_ID=<realm> -p 8000:8000 qbo-mcp-server:latest
#
# Note: Intuit packages require authentication. Ensure .npmrc is configured
# or pass NPM_TOKEN build argument: docker build --build-arg NPM_TOKEN=<token> .

FROM node:22-slim AS builder

WORKDIR /app

# Copy package files first for better caching
COPY package.json package-lock.json ./

# Copy .npmrc if authentication needed
# COPY .npmrc .

# Install all dependencies (including dev) needed for the build
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Remove dev dependencies, keeping only production deps for the runtime image
RUN npm prune --omit=dev

# Runtime stage - lightweight image
FROM node:22-slim

WORKDIR /app

# Copy built application and dependencies from builder
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json

# Copy .env if present (optional - can be injected at runtime instead)
# COPY --chown=node:node .env* ./

# Switch to non-root user (already exists in node:22-slim)
USER node

# Set HTTP transport by default for containerized deployment
ENV MCP_TRANSPORT=streamable-http
ENV PORT=8000
# Required at runtime: QUICKBOOKS_REALM_ID
# Optional: QUICKBOOKS_ENVIRONMENT (sandbox|production)

# Expose port
EXPOSE 8000

# Health check for orchestration (curl or wget required)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)}).on('error', () => process.exit(1))"

# Start application
CMD ["node", "dist/index.js"]
