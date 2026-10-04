ARG NODE_IMAGE=node:24-slim

FROM ${NODE_IMAGE} AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/links/package.json packages/links/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY ui-packages/code-lab/package.json ui-packages/code-lab/package.json
COPY ui-packages/web/package.json ui-packages/web/package.json
COPY web-packages/server/package.json web-packages/server/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @gamma-reader/server --filter @gamma-reader/web build
RUN pnpm --filter @gamma-reader/server deploy --prod --legacy /prod/server

FROM ${NODE_IMAGE} AS base

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3302

WORKDIR /app

COPY --from=build --chown=node:node /prod/server ./web-packages/server
COPY --from=build --chown=node:node /app/ui-packages/web/dist ./ui-packages/web/dist

# The quota database lives on a mounted volume, which Docker creates owned by
# root unless the image already carries the directory.
RUN mkdir -p /data && chown node:node /data
ENV GAMMA_DATA_DIR=/data
VOLUME ["/data"]

USER node

EXPOSE 3302

CMD ["node", "web-packages/server/dist/main.js"]

# A deployment that serves a repository (GAMMA_SOURCE_REPO) reads it with git, over SSH for a
# private one; build it with --target runtime-git. Git adds about 100 MB other deployments
# do not need.
FROM base AS runtime-git

USER root
RUN apt-get update \
  && apt-get install -y --no-install-recommends git openssh-client ca-certificates \
  && rm -rf /var/lib/apt/lists/*
USER node

# The default, and what compose.production.yml builds: no git.
FROM base AS runtime
