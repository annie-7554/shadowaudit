# syntax=docker/dockerfile:1

FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.base.json ./
COPY packages/bff/package*.json ./packages/bff/
RUN npm ci --workspace=packages/bff
COPY packages/bff/src ./packages/bff/src
COPY packages/bff/tsconfig*.json ./packages/bff/
RUN cd packages/bff && npx tsc

FROM node:20-alpine
WORKDIR /app
COPY package*.json tsconfig.base.json ./
COPY packages/bff/package*.json ./packages/bff/
RUN npm ci --workspace=packages/bff --omit=dev
COPY --from=builder /app/packages/bff/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
