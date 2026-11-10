-- Haltefrist für Verkäufererlöse: Werkuno führt den Auszahlungsplan aus (Stripe-Konten auf „manuell“)
ALTER TABLE "Shop" ADD COLUMN "payoutInterval" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "Shop" ADD COLUMN "payoutWeeklyAnchor" TEXT;
ALTER TABLE "Shop" ADD COLUMN "payoutMonthlyAnchor" INTEGER;
ALTER TABLE "Shop" ADD COLUMN "lastAutoPayoutAt" TIMESTAMP(3);
ALTER TABLE "Shop" ADD COLUMN "payoutScheduleMigratedAt" TIMESTAMP(3);
ALTER TABLE "Shop" ADD COLUMN "payoutHoldWaived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Payment" ADD COLUMN "sellerAmountMinor" INTEGER;
ALTER TABLE "Payment" ADD COLUMN "sellerCurrency" TEXT;
