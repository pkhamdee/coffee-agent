# Frontend: Vite build served by nginx, which also proxies /api/* to the backend.
# Static output is CPU-independent: build natively (avoids slow/crashy QEMU emulation of esbuild).
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
RUN yarn build

FROM nginxinc/nginx-unprivileged:1.28-alpine
# Backend address, substituted into the nginx config at startup.
ENV BACKEND_URL=http://backend:3000
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
