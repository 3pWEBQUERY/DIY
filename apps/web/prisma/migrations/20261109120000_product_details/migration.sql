-- Angebotsart „Unbearbeiteter Artikel“, Materialliste, Masse als Höhe/Breite/Tiefe
ALTER TYPE "ProductKind" ADD VALUE IF NOT EXISTS 'RAW';
ALTER TABLE "Product" ADD COLUMN "materialList" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "heightMm" INTEGER,
  ADD COLUMN "widthMm" INTEGER,
  ADD COLUMN "depthMm" INTEGER;
-- Bisherige Materialangabe als ersten Listeneintrag übernehmen
UPDATE "Product" SET "materialList" = ARRAY["materials"] WHERE "materials" <> '';
