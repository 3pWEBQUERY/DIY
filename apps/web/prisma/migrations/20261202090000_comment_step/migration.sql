-- Fragen zu einzelnen Anleitungsschritten
ALTER TABLE "Comment" ADD COLUMN "stepKey" TEXT;
CREATE INDEX "Comment_targetType_targetId_stepKey_idx" ON "Comment"("targetType", "targetId", "stepKey");
