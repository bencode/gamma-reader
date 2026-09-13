ARG NODE_IMAGE=node:24-slim

FROM ${NODE_IMAGE} AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY ui-packages/web/package.json ui-packages/web/package.json
COPY web-packages/server/package.json web-packages/server/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build
RUN pnpm --filter @gamma-reader/server deploy --prod --legacy /prod/server

FROM ${NODE_IMAGE} AS runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3302

WORKDIR /app

COPY --from=build --chown=node:node /prod/server ./web-packages/server
COPY --from=build --chown=node:node /app/ui-packages/web/dist ./ui-packages/web/dist

USER node

EXPOSE 3302

CMD ["node", "web-packages/server/dist/main.js"]
