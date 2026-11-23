-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "giftCardMinor" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ShopGiftCardSettings" (
    "shopId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "amounts" INTEGER[] DEFAULT ARRAY[2500, 5000, 10000]::INTEGER[],
    "customEnabled" BOOLEAN NOT NULL DEFAULT true,
    "customMinMinor" INTEGER NOT NULL DEFAULT 1000,
    "customMaxMinor" INTEGER NOT NULL DEFAULT 30000,
    "validityMonths" INTEGER NOT NULL DEFAULT 36,
    "note" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopGiftCardSettings_pkey" PRIMARY KEY ("shopId")
);

-- CreateTable
CREATE TABLE "GiftCard" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "initialMinor" INTEGER NOT NULL,
    "balanceMinor" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "purchaserId" TEXT,
    "senderName" TEXT NOT NULL DEFAULT '',
    "recipientEmail" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL DEFAULT '',
    "message" TEXT NOT NULL DEFAULT '',
    "deliverAt" TIMESTAMP(3) NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "claimedById" TEXT,
    "paidCurrency" TEXT NOT NULL,
    "paidMinor" INTEGER NOT NULL,
    "feeBps" INTEGER NOT NULL,
    "platformFeeMinor" INTEGER NOT NULL,
    "checkoutSessionId" TEXT,
    "paymentIntentId" TEXT,
    "paidAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GiftCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftCardRedemption" (
    "id" TEXT NOT NULL,
    "giftCardId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "orderAmountMinor" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" TIMESTAMP(3),

    CONSTRAINT "GiftCardRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartGiftCard" (
    "cartId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "giftCardId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CartGiftCard_pkey" PRIMARY KEY ("cartId","shopId")
);

-- CreateIndex
CREATE UNIQUE INDEX "GiftCard_code_key" ON "GiftCard"("code");

-- CreateIndex
CREATE UNIQUE INDEX "GiftCard_checkoutSessionId_key" ON "GiftCard"("checkoutSessionId");

-- CreateIndex
CREATE INDEX "GiftCard_shopId_createdAt_idx" ON "GiftCard"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "GiftCard_recipientEmail_idx" ON "GiftCard"("recipientEmail");

-- CreateIndex
CREATE INDEX "GiftCard_claimedById_idx" ON "GiftCard"("claimedById");

-- CreateIndex
CREATE INDEX "GiftCard_purchaserId_idx" ON "GiftCard"("purchaserId");

-- CreateIndex
CREATE INDEX "GiftCard_status_deliverAt_idx" ON "GiftCard"("status", "deliverAt");

-- CreateIndex
CREATE INDEX "GiftCardRedemption_giftCardId_idx" ON "GiftCardRedemption"("giftCardId");

-- CreateIndex
CREATE INDEX "GiftCardRedemption_orderId_idx" ON "GiftCardRedemption"("orderId");

-- CreateIndex
CREATE INDEX "CartGiftCard_giftCardId_idx" ON "CartGiftCard"("giftCardId");

-- AddForeignKey
ALTER TABLE "ShopGiftCardSettings" ADD CONSTRAINT "ShopGiftCardSettings_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCard" ADD CONSTRAINT "GiftCard_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCard" ADD CONSTRAINT "GiftCard_purchaserId_fkey" FOREIGN KEY ("purchaserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCard" ADD CONSTRAINT "GiftCard_claimedById_fkey" FOREIGN KEY ("claimedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCardRedemption" ADD CONSTRAINT "GiftCardRedemption_giftCardId_fkey" FOREIGN KEY ("giftCardId") REFERENCES "GiftCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCardRedemption" ADD CONSTRAINT "GiftCardRedemption_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartGiftCard" ADD CONSTRAINT "CartGiftCard_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartGiftCard" ADD CONSTRAINT "CartGiftCard_giftCardId_fkey" FOREIGN KEY ("giftCardId") REFERENCES "GiftCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

