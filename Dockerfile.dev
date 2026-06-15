# syntax=docker/dockerfile:1

# ============================================
# BASE stage – shared configuration
# ============================================
FROM node:20-alpine AS base

WORKDIR /app

# Install pnpm and force hoisted node_modules (fixes Windows symlink issues)
RUN npm install -g pnpm && pnpm config set node-linker hoisted

# Copy dependency files for better caching
COPY package.json pnpm-lock.yaml ./

# ============================================
# DEVELOPMENT stage – hot reload, no build
# ============================================
FROM base AS dev

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Create non‑root user (helps permission issues)
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
RUN mkdir -p /app/.next && chown -R nextjs:nodejs /app/.next
RUN chown -R nextjs:nodejs /app

USER nextjs

ENV NODE_ENV=development
EXPOSE 3000

# Normal Next.js dev command – polling is enabled via environment variable
CMD ["pnpm", "dev"]

# ============================================
# BUILDER stage – only for production
# ============================================
FROM base AS builder

RUN pnpm install --frozen-lockfile
COPY . .

ARG NEXT_PUBLIC_API_URL
ARG NODE_ENV=production
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NODE_ENV=${NODE_ENV}

RUN pnpm run build

# ============================================
# RUNNER stage – production server
# ============================================
FROM node:20-alpine AS runner

WORKDIR /app
RUN apk add --no-cache dumb-init
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

EXPOSE 3000
USER nextjs
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]