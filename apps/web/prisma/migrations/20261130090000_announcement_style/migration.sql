-- Ankündigungen: Schrift, Grössen, Farben, Hintergrundbild
ALTER TABLE "Announcement"
  ADD COLUMN "titleFont" TEXT NOT NULL DEFAULT 'werkuno',
  ADD COLUMN "bodyFont" TEXT NOT NULL DEFAULT 'werkuno',
  ADD COLUMN "titleSize" TEXT NOT NULL DEFAULT 'm',
  ADD COLUMN "bodySize" TEXT NOT NULL DEFAULT 'm',
  ADD COLUMN "textColor" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "bgMode" TEXT NOT NULL DEFAULT 'tone',
  ADD COLUMN "bgColor" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "bgMediaId" TEXT,
  ADD COLUMN "bgImageUrl" TEXT,
  ADD COLUMN "bgOverlay" INTEGER NOT NULL DEFAULT 45,
  ADD COLUMN "bgImageLight" TEXT NOT NULL DEFAULT '#FFFFFF',
  ADD COLUMN "bgPosition" TEXT NOT NULL DEFAULT 'center';

CREATE INDEX "Announcement_bgMediaId_idx" ON "Announcement"("bgMediaId");
