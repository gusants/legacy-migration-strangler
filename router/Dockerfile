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
COPY router/package.json ./router/package.json

FROM manifests AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter router --ignore-scripts
COPY router/tsconfig.json router/tsconfig.build.json ./router/
COPY router/src ./router/src
WORKDIR /app/router
RUN pnpm build

FROM manifests AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod --filter router --ignore-scripts

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app/router
COPY --from=prod-deps --chown=node:node /app/node_modules /app/node_modules
COPY --from=prod-deps --chown=node:node /app/router/node_modules ./node_modules
COPY --from=build --chown=node:node /app/router/dist ./dist
COPY --chown=node:node router/package.json router/routing.json ./
USER node
CMD ["node", "dist/local-runner.js"]
