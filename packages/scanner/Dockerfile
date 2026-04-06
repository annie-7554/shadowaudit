# syntax=docker/dockerfile:1

FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.base.json ./
COPY packages/scanner/package*.json ./packages/scanner/
RUN npm ci --workspace=packages/scanner
COPY packages/scanner/src ./packages/scanner/src
COPY packages/scanner/tsconfig*.json ./packages/scanner/
RUN cd packages/scanner && npx tsc

FROM node:20-alpine
RUN apk add --no-cache curl && \
    curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin
WORKDIR /app
COPY package*.json tsconfig.base.json ./
COPY packages/scanner/package*.json ./packages/scanner/
RUN npm ci --workspace=packages/scanner --omit=dev
COPY --from=builder /app/packages/scanner/dist ./dist
USER node
CMD ["node", "dist/index.js"]
