# syntax=docker/dockerfile:1
# Kuru frontend — build from the repository root: docker build -f frontend/Dockerfile .
# (the root context gives the test suite access to shared/test-vectors).

FROM node:24-alpine AS base
RUN npm install --global pnpm@12.11.2
WORKDIR /repo/frontend

FROM base AS deps
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

FROM base AS build
# Rewrites are resolved at build time: the backend's address inside the compose network.
ARG KURU_API_URL=http://backend:8000
ARG NEXT_PUBLIC_SOURCE_URL=
ENV KURU_API_URL=$KURU_API_URL \
    NEXT_PUBLIC_SOURCE_URL=$NEXT_PUBLIC_SOURCE_URL \
    NEXT_TELEMETRY_DISABLED=1
COPY shared /repo/shared
COPY --from=deps /repo/frontend/node_modules ./node_modules
COPY frontend ./
RUN pnpm build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node /repo/frontend/.next/standalone ./
COPY --from=build --chown=node /repo/frontend/.next/static ./.next/static
COPY --from=build --chown=node /repo/frontend/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/en || exit 1
CMD ["node", "server.js"]
