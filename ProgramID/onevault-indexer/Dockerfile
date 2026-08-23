# Railway service root = ProgramID/onevault-indexer
FROM node:22-bookworm-slim AS build
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY schema ./schema
RUN npm run build \
  && cp -R schema dist/schema \
  && test -f dist/api/server.js \
  && test -f dist/index.js

FROM node:22-bookworm-slim
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3001
ENV RUN_POLLER=1

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/scripts ./scripts
COPY schema ./schema

EXPOSE 3001
CMD ["node", "scripts/railway-start.mjs"]
