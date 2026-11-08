# WERKRAUM – ein Image für `web` und `worker` (PRD §25.8 Containerisierung)
# Railway baut dieses Dockerfile automatisch. Start-Befehl je Service:
#   web:    pnpm start          (Pre-Deploy: pnpm predeploy)
#   worker: pnpm worker

# ffmpeg: Video-Transkodierung im Worker (H.264/AAC, Vorschaubilder)
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1 COREPACK_HOME=/corepack COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# pnpm zur Build-Zeit fest einbetten – kein Download beim Containerstart
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate && chmod -R a+rX /corepack && apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc* ./
COPY apps/web/package.json apps/web/
COPY apps/web/prisma apps/web/prisma
COPY apps/web/prisma.config.ts apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

FROM deps AS build
# Fester Schlüssel → Server-Action-IDs bleiben über Deploys gleich (offene Seiten funktionieren
# nach einem Update weiter). Railway reicht die gleichnamige Service-Variable als Build-Argument durch.
ARG NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
COPY . .
# Build braucht keine echte DB; Seiten mit DB-Zugriff werden dynamisch gerendert
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build SESSION_SECRET=build-time-secret-not-used-at-runtime-000
RUN pnpm --filter @werkraum/web build

FROM base AS runner
# Serverseitige Zeitangaben in Schweizer Zeit (sonst UTC)
ENV NODE_ENV=production TZ=Europe/Zurich
WORKDIR /app
COPY --from=build /app /app
RUN mkdir -p /app/apps/web/.data && chown -R node:node /app/apps/web/.data /app/apps/web/.next
USER node
EXPOSE 3000
CMD ["pnpm", "start"]
