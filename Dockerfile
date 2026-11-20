FROM node:24-bookworm-slim AS dependencies
WORKDIR /build
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm install --frozen-lockfile
COPY tsconfig.base.json ./

FROM dependencies AS api-build
COPY apps/api ./apps/api
RUN pnpm --filter @runline/api build \
    && pnpm --filter @runline/api deploy --prod /opt/runline-api

FROM dependencies AS web-build
ARG RUNLINE_API_ORIGIN=http://api:4000
ENV RUNLINE_API_ORIGIN=${RUNLINE_API_ORIGIN}
COPY apps/web ./apps/web
RUN pnpm --filter @runline/web build

FROM node:24-bookworm-slim AS api
WORKDIR /app
ENV NODE_ENV=production
COPY --from=api-build --chown=node:node /opt/runline-api/ ./
USER node
EXPOSE 4000
CMD ["node", "dist/index.js"]

FROM node:24-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=web-build --chown=node:node /build/apps/web/.next/standalone/ ./
COPY --from=web-build --chown=node:node /build/apps/web/.next/static/ ./apps/web/.next/static/
COPY --from=web-build --chown=node:node /build/apps/web/public/ ./apps/web/public/
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
