# ============================================================================
# Stage 1: Dependencies
# ============================================================================
FROM node:20-alpine AS deps

# Set working directory
WORKDIR /app

# Copy pnpm configuration if you have it
COPY package.json ./

# Install pnpm
RUN npm install -g pnpm

# Install dependencies
RUN pnpm install --frozen-lockfile

# ============================================================================
# Stage 2: Builder
# ============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy pnpm to builder stage
RUN npm install -g pnpm

# Copy package files
# COPY package.json pnpm-lock.yaml* ./

# Copy installed dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source code
COPY src ./src
COPY public ./public
COPY next.config.ts tsconfig.json ./
COPY tailwind.config.ts postcss.config.js ./

# Build arguments for environment variables
ARG NEXT_PUBLIC_API_URL
ARG NODE_ENV=production

# Set environment variables
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NODE_ENV=${NODE_ENV}

# Build Next.js application in standalone mode (more efficient)
RUN pnpm run build

# ============================================================================
# Stage 3: Runner
# ============================================================================
FROM node:20-alpine AS runner

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create nextjs user for security (non-root user)
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# Copy build output from builder stage
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Set environment for production
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Expose port
EXPOSE 3000

# Switch to nextjs user
USER nextjs

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start Next.js server
CMD ["node", "server.js"]
