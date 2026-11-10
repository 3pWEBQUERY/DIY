-- CreateEnum
CREATE TYPE "AppStorePurchaseStatus" AS ENUM ('PENDING', 'COMPLETED', 'REFUNDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SellerTransferStatus" AS ENUM ('NONE', 'PENDING', 'SENT', 'FAILED', 'REVERSED', 'SKIPPED');

-- CreateTable
CREATE TABLE "AppStorePurchase" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "appleProductId" TEXT NOT NULL,
    "priceMinor" INTEGER NOT NULL,
    "webPriceMinor" INTEGER NOT NULL,
    "sellerNetMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CHF',
    "status" "AppStorePurchaseStatus" NOT NULL DEFAULT 'PENDING',
    "transactionId" TEXT,
    "originalTransactionId" TEXT,
    "environment" TEXT,
    "applePriceMilli" INTEGER,
    "appleCurrency" TEXT,
    "storefront" TEXT,
    "orderId" TEXT,
    "transferStatus" "SellerTransferStatus" NOT NULL DEFAULT 'NONE',
    "transferId" TEXT,
    "transferAttempts" INTEGER NOT NULL DEFAULT 0,
    "transferError" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppStorePurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppStorePurchase_token_key" ON "AppStorePurchase"("token");

-- CreateIndex
CREATE UNIQUE INDEX "AppStorePurchase_transactionId_key" ON "AppStorePurchase"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "AppStorePurchase_orderId_key" ON "AppStorePurchase"("orderId");

-- CreateIndex
CREATE INDEX "AppStorePurchase_userId_createdAt_idx" ON "AppStorePurchase"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AppStorePurchase_transferStatus_updatedAt_idx" ON "AppStorePurchase"("transferStatus", "updatedAt");

-- AddForeignKey
ALTER TABLE "AppStorePurchase" ADD CONSTRAINT "AppStorePurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppStorePurchase" ADD CONSTRAINT "AppStorePurchase_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppStorePurchase" ADD CONSTRAINT "AppStorePurchase_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

