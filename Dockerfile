# syntax=docker/dockerfile:1
# Multi-arch friendly: no native modules (SQLite is Node's built-in node:sqlite).

FROM node:24-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine
ARG VERSION=dev
LABEL org.opencontainers.image.title="Newzlettr" \
      org.opencontainers.image.description="Self-hosted Plex newsletter" \
      org.opencontainers.image.source="https://github.com/jeff-blep/newzlettr" \
      org.opencontainers.image.version="${VERSION}"

RUN apk add --no-cache su-exec
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev --workspace server --include-workspace-root=false && npm cache clean --force

COPY --from=build /src/server/dist server/dist
COPY --from=build /src/web/dist web/dist
COPY server/assets server/assets
COPY docker-entrypoint.sh /usr/local/bin/

ENV NEWZLETTR_CONFIG_DIR=/config \
    PORT=3001 \
    PUID=1000 \
    PGID=1000 \
    NODE_ENV=production
VOLUME /config
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:${PORT}/ping >/dev/null || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server/dist/index.js"]
