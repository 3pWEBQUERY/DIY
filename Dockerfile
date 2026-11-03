# WERKRAUM – ein Image für `web` und `worker` (PRD §25.8 Containerisierung)
# Railway baut dieses Dockerfile automatisch. Start-Befehl je Service:
#   web:    pnpm start          (Pre-Deploy: pnpm db:migrate)
#   worker: pnpm worker

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc* ./
COPY apps/web/package.json apps/web/
COPY apps/web/prisma apps/web/prisma
COPY apps/web/prisma.config.ts apps/web/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# Build braucht keine echte DB; Seiten mit DB-Zugriff werden dynamisch gerendert
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build SESSION_SECRET=build-time-secret-not-used-at-runtime-000
RUN pnpm --filter @werkraum/web build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app /app
RUN mkdir -p /app/apps/web/.data && chown -R node:node /app/apps/web/.data /app/apps/web/.next
USER node
EXPOSE 3000
CMD ["pnpm", "start"]
