-- Creator Pro als In-App-Abo über den App Store
ALTER TABLE "Subscription" ADD COLUMN "appleOriginalTransactionId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "appleEnvironment" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "appleSignedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Subscription_appleOriginalTransactionId_key" ON "Subscription"("appleOriginalTransactionId");
