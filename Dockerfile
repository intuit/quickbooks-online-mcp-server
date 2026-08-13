# QuickBooks Online MCP service.
#
# Two stages so the vendored source and the TypeScript compiler never ship. The
# runtime image holds compiled JavaScript, production dependencies and nothing
# else — no shell tooling to reach for, no source to read.

FROM node:22-alpine AS build
WORKDIR /build

# Dependencies first, so a source-only change does not re-resolve the tree.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Drop dev dependencies rather than reinstalling: same lockfile, no second resolve.
RUN npm prune --omit=dev


FROM node:22-alpine AS runtime

# Heap ceiling set below the container limit so V8 collects rather than being
# OOM-killed. Raise both together, never just one.
ENV NODE_ENV=production \
    NODE_OPTIONS=--max-old-space-size=384

WORKDIR /app

# node:alpine already provides an unprivileged `node` user (uid 1000). Files are
# owned by root and merely readable, so the process cannot rewrite its own code.
COPY --from=build --chown=root:root /build/node_modules ./node_modules
COPY --from=build --chown=root:root /build/dist ./dist
COPY --from=build --chown=root:root /build/package.json ./package.json
COPY --chown=root:root NOTICE ./NOTICE

USER node

EXPOSE 8790

# Readiness comes from the service's own endpoint, so a container that is running
# but cannot serve is reported unhealthy rather than merely alive.
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8790)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Exec form, so the process is PID 1 and receives SIGTERM directly — main.ts drains
# in-flight requests on that signal, and a shell wrapper would swallow it.
CMD ["node", "dist/runtime/main.js"]
