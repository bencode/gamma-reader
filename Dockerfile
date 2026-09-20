ARG NODE_IMAGE=node:24-slim

FROM ${NODE_IMAGE} AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY ui-packages/code-lab/package.json ui-packages/code-lab/package.json
COPY ui-packages/web/package.json ui-packages/web/package.json
COPY web-packages/server/package.json web-packages/server/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @gamma-reader/server --filter @gamma-reader/web build
RUN pnpm --filter @gamma-reader/server deploy --prod --legacy /prod/server

FROM ${NODE_IMAGE} AS runtime

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
