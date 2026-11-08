-- Fehlerüberwachung
CREATE TABLE "ErrorGroup" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "lastPath" TEXT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "usersHit" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "ignoredAt" TIMESTAMP(3),
    "lastAlertAt" TIMESTAMP(3),
    "release" TEXT,
    CONSTRAINT "ErrorGroup_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ErrorGroup_fingerprint_key" ON "ErrorGroup"("fingerprint");
CREATE INDEX "ErrorGroup_resolvedAt_ignoredAt_lastSeenAt_idx" ON "ErrorGroup"("resolvedAt", "ignoredAt", "lastSeenAt");

CREATE TABLE "ErrorOccurrence" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "path" TEXT,
    "method" TEXT,
    "userId" TEXT,
    "userAgent" TEXT,
    "release" TEXT,
    "digest" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',
    CONSTRAINT "ErrorOccurrence_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ErrorOccurrence_groupId_createdAt_idx" ON "ErrorOccurrence"("groupId", "createdAt");
CREATE INDEX "ErrorOccurrence_createdAt_idx" ON "ErrorOccurrence"("createdAt");
ALTER TABLE "ErrorOccurrence" ADD CONSTRAINT "ErrorOccurrence_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ErrorGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
