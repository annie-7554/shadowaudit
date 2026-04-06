# syntax=docker/dockerfile:1

FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.base.json ./
COPY packages/notifier/package*.json ./packages/notifier/
RUN npm ci --workspace=packages/notifier
COPY packages/notifier/src ./packages/notifier/src
COPY packages/notifier/tsconfig*.json ./packages/notifier/
RUN cd packages/notifier && npx tsc

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/packages/notifier/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
USER node
CMD ["node", "dist/index.js"]
