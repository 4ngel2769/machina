# syntax=docker/dockerfile:1
FROM node:20-bookworm AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build Next.js app
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:20-bookworm-slim AS runner
USER root
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install system requirements for virsh + websockify
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        libvirt-clients \
        qemu-utils \
        python3 \
        python3-pip \
        websockify \
    && rm -rf /var/lib/apt/lists/*

# Copy built application
COPY --from=builder /app .

# Ensure runtime directories exist for bind mounts
RUN mkdir -p data logs tmp

EXPOSE 3000
CMD ["node", "server.js"]
