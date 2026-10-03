# syntax=docker/dockerfile:1.7
# The visualizer is a static site: Vite bundles viz/ together with the solution and
# system-design sources it imports at build time, and nginx serves the result.

FROM node:24-bookworm-slim AS build
WORKDIR /repo/viz
COPY viz/package.json viz/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY viz/ ./
COPY neetcode-150/ ../neetcode-150/
COPY system-design/ ../system-design/
# Run npm test and the type checks before building; the image only bundles.
RUN npx vite build

FROM nginx:1.29-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/viz/dist /usr/share/nginx/html
EXPOSE 8080
