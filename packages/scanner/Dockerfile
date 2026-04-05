# syntax=docker/dockerfile:1
LABEL org.opencontainers.image.source=https://github.com/OWNER/shadowaudit

FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY src/ ./src/
COPY tsconfig*.json ./
RUN npx tsc

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
USER node
EXPOSE 0
CMD ["node", "dist/index.js"]
