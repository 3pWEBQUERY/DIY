-- Reihum-Auswahl in den Stripe-/Auszahlungs-Workern: auch bei Fehlern gesetzt, damit dauerhaft
-- scheiternde Shops die übrigen nicht verdrängen
ALTER TABLE "Shop" ADD COLUMN "payoutAttemptAt" TIMESTAMP(3);
ALTER TABLE "Shop" ADD COLUMN "stripeModeCheckAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Comment_postId_idx" ON "Comment"("postId");

-- CreateIndex
CREATE INDEX "Bookmark_targetType_targetId_idx" ON "Bookmark"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "CommunityChallenge_communityId_state_idx" ON "CommunityChallenge"("communityId", "state");

-- CreateIndex: Verwendungsprüfung von Medien (mediaInUse, Bereinigung im Worker)
CREATE INDEX "Story_mediaId_idx" ON "Story"("mediaId");
