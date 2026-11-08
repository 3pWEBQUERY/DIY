-- Entwürfe und geplante Veröffentlichung von Beiträgen
ALTER TABLE "Post" ADD COLUMN "scheduledAt" TIMESTAMP(3);
CREATE INDEX "Post_state_scheduledAt_idx" ON "Post"("state", "scheduledAt");
