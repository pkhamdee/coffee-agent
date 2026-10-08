# Weather MCP server — standalone image (no backend, no database).
#   docker run -p 3001:3001 -e MCP_WEATHER_API_KEY=<key> pkhamdee/coffee-agent-weather-mcp:1.1.0
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY tsconfig.json ./
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
EXPOSE 3001
CMD ["node", "dist/server.js"]
