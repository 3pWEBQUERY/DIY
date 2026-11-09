-- Outbox: exponentielles Backoff statt 10 Versuchen im 3-Sekunden-Takt
ALTER TABLE "OutboxEvent" ADD COLUMN "nextAttemptAt" TIMESTAMP(3);
ALTER TABLE "OutboxEvent" ADD COLUMN "lastError" TEXT;
