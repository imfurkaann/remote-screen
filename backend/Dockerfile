# Multi-stage Dockerfile for Remote Screen Backend

# Stage 1: Build TypeScript backend
FROM node:22-alpine AS builder
WORKDIR /app

# Copy root workspace configurations
COPY package*.json ./
COPY backend/package*.json ./backend/

# Install all dependencies (including devDependencies for build)
RUN npm ci --workspace=backend

# Copy backend source
COPY backend ./backend

# Build backend TypeScript
WORKDIR /app/backend
RUN npm run build

# Stage 2: Production runner
FROM node:22-alpine AS runner
WORKDIR /app/backend

ENV NODE_ENV=production
ENV BACKEND_PORT=4100

# Install production dependencies only
COPY package*.json /app/
COPY backend/package*.json ./
RUN npm ci --omit=dev --workspace=backend

# Copy compiled JavaScript output
COPY --from=builder /app/backend/dist ./dist

# Set up uploads directory with non-root ownership
RUN mkdir -p uploads && chown -R node:node /app/backend

USER node

EXPOSE 4100

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:4100/api/v1/health/live').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "dist/index.js"]
