FROM node:22-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:22-slim
WORKDIR /app
COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=builder /app/dist/ ./dist/
USER node
EXPOSE 8000
ENV MCP_TRANSPORT=streamable-http
CMD ["node", "dist/index.js"]
