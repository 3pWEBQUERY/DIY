-- Unterstützer-Abo für Creator: Plan, Unterstützungen, Zahlungen; exklusive Anleitungen
-- AlterTable
ALTER TABLE "Tutorial" ADD COLUMN     "supportersOnly" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SupportPlan" (
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "priceMinor" INTEGER NOT NULL DEFAULT 500,
    "perks" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportPlan_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Supporter" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "supporterId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'incomplete',
    "priceMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CHF',
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "stripeSubscriptionId" TEXT,
    "stripeCustomerId" TEXT,
    "remindedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supporter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportPayment" (
    "id" TEXT NOT NULL,
    "supporterRowId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CHF',
    "platformFeeMinor" INTEGER NOT NULL,
    "creatorNetMinor" INTEGER NOT NULL,
    "stripeInvoiceId" TEXT,
    "appleTransactionId" TEXT,
    "appleEnvironment" TEXT,
    "transferStatus" TEXT NOT NULL DEFAULT 'NONE',
    "transferId" TEXT,
    "transferAttempts" INTEGER NOT NULL DEFAULT 0,
    "transferError" TEXT,
    "refundedAt" TIMESTAMP(3),
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Supporter_stripeSubscriptionId_key" ON "Supporter"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "Supporter_supporterId_idx" ON "Supporter"("supporterId");

-- CreateIndex
CREATE INDEX "Supporter_creatorId_status_idx" ON "Supporter"("creatorId", "status");

-- CreateIndex
CREATE INDEX "Supporter_provider_currentPeriodEnd_idx" ON "Supporter"("provider", "currentPeriodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "Supporter_creatorId_supporterId_key" ON "Supporter"("creatorId", "supporterId");

-- CreateIndex
CREATE UNIQUE INDEX "SupportPayment_stripeInvoiceId_key" ON "SupportPayment"("stripeInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "SupportPayment_appleTransactionId_key" ON "SupportPayment"("appleTransactionId");

-- CreateIndex
CREATE INDEX "SupportPayment_creatorId_createdAt_idx" ON "SupportPayment"("creatorId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportPayment_transferStatus_updatedAt_idx" ON "SupportPayment"("transferStatus", "updatedAt");

-- AddForeignKey
ALTER TABLE "SupportPlan" ADD CONSTRAINT "SupportPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supporter" ADD CONSTRAINT "Supporter_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supporter" ADD CONSTRAINT "Supporter_supporterId_fkey" FOREIGN KEY ("supporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportPayment" ADD CONSTRAINT "SupportPayment_supporterRowId_fkey" FOREIGN KEY ("supporterRowId") REFERENCES "Supporter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

