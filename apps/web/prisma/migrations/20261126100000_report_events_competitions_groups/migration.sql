-- Melden von Events, Wettbewerben und Gruppenunterhaltungen (App Store Guideline 1.2)
ALTER TYPE "TargetType" ADD VALUE IF NOT EXISTS 'EVENT';
ALTER TYPE "TargetType" ADD VALUE IF NOT EXISTS 'COMPETITION';
ALTER TYPE "TargetType" ADD VALUE IF NOT EXISTS 'CONVERSATION';

-- Wettbewerbe können von der Moderation entfernt werden
ALTER TABLE "CommunityChallenge" ADD COLUMN "state" TEXT NOT NULL DEFAULT 'ACTIVE';

-- Apple-Erstattungen, die vor der Verbuchung eintreffen (Grabstein je Transaktion)
CREATE TABLE "AppStoreRevocation" (
    "transactionId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AppStoreRevocation_pkey" PRIMARY KEY ("transactionId")
);
