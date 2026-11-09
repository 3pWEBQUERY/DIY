-- Materialien: eigener Bestand und Preisvergleich (mit Partnerlinks)
CREATE TABLE "MaterialStock" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "materialId" TEXT,
  "name" TEXT NOT NULL,
  "quantity" TEXT NOT NULL DEFAULT '',
  "note" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MaterialStock_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MaterialStock_userId_materialId_key" ON "MaterialStock"("userId", "materialId");
CREATE INDEX "MaterialStock_userId_idx" ON "MaterialStock"("userId");
ALTER TABLE "MaterialStock" ADD CONSTRAINT "MaterialStock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialStock" ADD CONSTRAINT "MaterialStock_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MaterialOffer" (
  "id" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "retailer" TEXT NOT NULL,
  "title" TEXT NOT NULL DEFAULT '',
  "url" TEXT NOT NULL,
  "priceMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'CHF',
  "packAmount" DOUBLE PRECISION,
  "packLabel" TEXT NOT NULL DEFAULT '',
  "isAffiliate" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "clickCount" INTEGER NOT NULL DEFAULT 0,
  "lastClickAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MaterialOffer_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MaterialOffer_materialId_active_idx" ON "MaterialOffer"("materialId", "active");
ALTER TABLE "MaterialOffer" ADD CONSTRAINT "MaterialOffer_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;
