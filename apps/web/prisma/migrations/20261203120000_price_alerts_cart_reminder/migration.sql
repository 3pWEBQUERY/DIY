-- AlterTable
ALTER TABLE "Cart" ADD COLUMN     "remindedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PriceAlertSent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceAlertSent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PriceAlertSent_productId_idx" ON "PriceAlertSent"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceAlertSent_userId_productId_kind_ref_key" ON "PriceAlertSent"("userId", "productId", "kind", "ref");

-- AddForeignKey
ALTER TABLE "PriceAlertSent" ADD CONSTRAINT "PriceAlertSent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

