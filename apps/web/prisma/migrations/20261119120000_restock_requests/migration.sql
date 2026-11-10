-- Ausverkaufte Produkte: Sichtbarkeit wählbar
ALTER TABLE "Product" ADD COLUMN "hideWhenSoldOut" BOOLEAN NOT NULL DEFAULT false;

-- Anfragen zur Nachproduktion
CREATE TABLE "RestockRequest" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" TIMESTAMP(3),

    CONSTRAINT "RestockRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RestockRequest_productId_userId_key" ON "RestockRequest"("productId", "userId");
CREATE INDEX "RestockRequest_productId_notifiedAt_idx" ON "RestockRequest"("productId", "notifiedAt");
CREATE INDEX "RestockRequest_notifiedAt_idx" ON "RestockRequest"("notifiedAt");

ALTER TABLE "RestockRequest" ADD CONSTRAINT "RestockRequest_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RestockRequest" ADD CONSTRAINT "RestockRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
