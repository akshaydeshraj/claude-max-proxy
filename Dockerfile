FROM node:22-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:22-slim

# Claude CLI required by Agent SDK
RUN npm install -g @anthropic-ai/claude-code

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built files from builder
COPY --from=builder /app/dist/ ./dist/

# Create non-root user (claude CLI refuses --dangerously-skip-permissions as root)
RUN useradd -m -s /bin/bash claude && \
    mkdir -p /data && \
    chown -R claude:claude /app /data
USER claude

# Persistent volumes for SQLite and Claude CLI credentials
VOLUME /data
VOLUME /home/claude/.claude
ENV DB_PATH=/data/analytics.db

EXPOSE 3456

CMD ["node", "dist/index.js"]
