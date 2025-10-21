# Multi-stage build to produce a small runtime image

FROM node:18-alpine AS builder
WORKDIR /app

# System deps for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++ bash

# Copy manifests first for better caching
COPY package.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json

# Install deps for client and server
RUN npm --prefix client install && npm --prefix server install

# Build client
COPY client client
RUN npm --prefix client run build

# Prepare server and embed client build
COPY server server
RUN mkdir -p server/public && cp -r client/dist/* server/public/ || true

#########################################################
FROM node:18-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Copy server with node_modules and built static files
COPY --from=builder /app/server /app/server

# Keep node_modules from builder to preserve native binaries (better-sqlite3)
# If you need to prune devDeps later, consider `npm prune --omit=dev` but ensure no rebuilds occur.

EXPOSE 3000
# Use modular server with hybrid sync system
CMD ["node", "server/index.js"]


