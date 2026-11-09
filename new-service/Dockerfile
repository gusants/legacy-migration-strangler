# syntax=docker/dockerfile:1

FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS manifests
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY new-service/package.json ./new-service/package.json
COPY contract-tests/package.json ./contract-tests/package.json

FROM manifests AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter new-service --ignore-scripts
COPY new-service ./new-service
WORKDIR /app/new-service
RUN pnpm prisma generate && pnpm build

FROM manifests AS prod-deps
COPY new-service/prisma ./new-service/prisma
COPY new-service/prisma.config.ts ./new-service/prisma.config.ts
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod --filter new-service

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app/new-service
COPY --from=prod-deps --chown=node:node /app/node_modules /app/node_modules
COPY --from=prod-deps --chown=node:node /app/new-service/node_modules ./node_modules
COPY --from=build --chown=node:node /app/new-service/dist ./dist
COPY --chown=node:node new-service/package.json new-service/prisma.config.ts ./
COPY --chown=node:node new-service/prisma ./prisma
USER node
EXPOSE 3000
HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=10 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && exec node dist/main.js"]
