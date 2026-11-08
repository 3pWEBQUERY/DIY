-- Auszahlungen: Herkunft (automatisch/beantragt), Fehlergrund, Benachrichtigungsstand
ALTER TABLE "PayoutRecord"
  ADD COLUMN "automatic" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "failureMessage" TEXT,
  ADD COLUMN "notified" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
-- Bestehende Auszahlungen gelten als bereits gemeldet
UPDATE "PayoutRecord" SET "notified" = ARRAY["status"];
