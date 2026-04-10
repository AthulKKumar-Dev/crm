# syntax=docker/dockerfile:1.6
# ──────────────────────────────────────────────────────────────────────────────
# Server-only Dockerfile for the NestJS API.
#
# Use this for deployments where the frontend lives elsewhere (e.g. Cloudflare
# Pages) and only the API needs to run. The full-stack version of the
# Dockerfile (with the React SPA bundled in) lives at the repo root.
#
# Final image listens on port 80 so it can sit directly behind a Cloudflare
# proxy (no port mapping required).
# ──────────────────────────────────────────────────────────────────────────────

# ─── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Prisma needs OpenSSL on Alpine
RUN apk add --no-cache openssl

# Install all deps (devDependencies are needed for nest build + prisma cli)
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps --include=dev --no-audit --no-fund

# Copy source + Prisma schema
COPY . ./

# Generate Prisma client + compile NestJS to dist/
RUN npx prisma generate
RUN npm run build


# ─── Stage 2: Runtime ────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

# Prisma + healthcheck use these
RUN apk add --no-cache openssl wget

# Install only production dependencies (smaller image)
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps --omit=dev --no-audit --no-fund && npm cache clean --force

# Copy compiled output, Prisma artifacts, and the schema (needed for migrate deploy)
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma

ENV NODE_ENV=production
ENV PORT=80
EXPOSE 80

# Run pending migrations on startup, then launch the server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main"]
