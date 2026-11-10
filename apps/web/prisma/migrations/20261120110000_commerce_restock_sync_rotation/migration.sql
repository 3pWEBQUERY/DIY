-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "refundRetryAt" TIMESTAMP(3),
ADD COLUMN     "restockedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "connectSyncAt" TIMESTAMP(3),
ADD COLUMN     "payoutsSyncAt" TIMESTAMP(3);

