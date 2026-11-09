-- Outbox: Claim (Lease) pro Worker-Prozess – beim Deploy laufen kurz zwei Worker, ohne Claim
-- würden Ereignisse doppelt verarbeitet (doppelte Fan-outs, Medienjobs, Löschläufe)
ALTER TABLE "OutboxEvent" ADD COLUMN "claimedAt" TIMESTAMP(3),
ADD COLUMN "claimedBy" TEXT;

-- Indizes für die nächtliche Bereinigung im Worker (DELETE … WHERE <spalte> < …)
CREATE INDEX IF NOT EXISTS "Notification_readAt_idx" ON "Notification"("readAt") WHERE ("readAt" IS NOT NULL);
CREATE INDEX IF NOT EXISTS "Session_revokedAt_idx" ON "Session"("revokedAt") WHERE ("revokedAt" IS NOT NULL);
CREATE INDEX IF NOT EXISTS "VerificationToken_expiresAt_idx" ON "VerificationToken"("expiresAt");
CREATE INDEX IF NOT EXISTS "WebhookEvent_createdAt_idx" ON "WebhookEvent"("createdAt");
