-- Verwendungsprüfung je Medium (mediaInUse, isMediaPublic) ohne Tabellenscan
-- CreateIndex
CREATE INDEX "PostMedia_mediaId_idx" ON "PostMedia"("mediaId");

-- CreateIndex
CREATE INDEX "ProjectMedia_mediaId_idx" ON "ProjectMedia"("mediaId");

-- CreateIndex
CREATE INDEX "TutorialMedia_mediaId_idx" ON "TutorialMedia"("mediaId");

-- CreateIndex
CREATE INDEX "ProductMedia_mediaId_idx" ON "ProductMedia"("mediaId");
