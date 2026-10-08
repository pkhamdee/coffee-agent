# Backend (NestJS coffee agent) on :3000.
# The Weather MCP server has its own image: see mcp-weather-server/Dockerfile.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN yarn build

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production && yarn cache clean

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
# Numeric UID (the "node" user) so Kubernetes runAsNonRoot can verify it.
USER 1000
EXPOSE 3000
CMD ["node", "dist/main.js"]
