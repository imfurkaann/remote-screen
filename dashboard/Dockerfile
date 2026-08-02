# Multi-stage Dockerfile for Remote Screen Dashboard (Next.js)

# Stage 1: Build Next.js Dashboard
FROM node:22-alpine AS builder
WORKDIR /app

# Copy root workspace and dashboard package files
COPY package*.json ./
COPY dashboard/package*.json ./dashboard/

# Install dependencies for workspace
RUN npm ci --workspace=dashboard

# Copy dashboard source
COPY dashboard ./dashboard

ENV NEXT_TELEMETRY_DISABLED=1

# NEXT_PUBLIC_* vars are inlined at build time by Next.js — must be available during build
ARG NEXT_PUBLIC_BACKEND_SOCKET_URL
ENV NEXT_PUBLIC_BACKEND_SOCKET_URL=$NEXT_PUBLIC_BACKEND_SOCKET_URL

WORKDIR /app/dashboard
RUN npm run build

# Stage 2: Production runner
FROM node:22-alpine AS runner
WORKDIR /app/dashboard

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy static assets and public directory
COPY --from=builder /app/dashboard/public ./public

# Copy standalone bundle and static output for both standard and monorepo paths
COPY --from=builder --chown=nextjs:nodejs /app/dashboard/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/dashboard/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/dashboard/.next/static ./dashboard/.next/static

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=20s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3000').then(r => process.exit(0)).catch(() => process.exit(1))"

CMD ["sh", "-c", "if [ -f server.js ]; then node server.js; elif [ -f dashboard/server.js ]; then node dashboard/server.js; else node server.js; fi"]
