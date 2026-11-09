-- Indizes für häufige Abfragen (Bestellungen, Produkt-/Projektseiten, Statistik, Posteingang, Follower, Auszahlungen)
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_userId_createdAt_idx" ON "AnalyticsEvent"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "ArticleProject_projectId_idx" ON "ArticleProject"("projectId");
CREATE INDEX IF NOT EXISTS "ChallengeEntry_userId_state_idx" ON "ChallengeEntry"("userId", "state");
CREATE INDEX IF NOT EXISTS "Follow_followeeId_createdAt_idx" ON "Follow"("followeeId", "createdAt");
CREATE INDEX IF NOT EXISTS "Follow_followerId_createdAt_idx" ON "Follow"("followerId", "createdAt");
CREATE INDEX IF NOT EXISTS "Notification_actorId_idx" ON "Notification"("actorId");
CREATE INDEX IF NOT EXISTS "Notification_recipientId_updatedAt_idx" ON "Notification"("recipientId", "updatedAt");
CREATE INDEX IF NOT EXISTS "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX IF NOT EXISTS "PayoutRecord_shopId_createdAt_idx" ON "PayoutRecord"("shopId", "createdAt");
CREATE INDEX IF NOT EXISTS "Post_repostOfId_idx" ON "Post"("repostOfId");
CREATE INDEX IF NOT EXISTS "Product_projectId_idx" ON "Product"("projectId");
CREATE INDEX IF NOT EXISTS "ProductVariant_productId_idx" ON "ProductVariant"("productId");
CREATE INDEX IF NOT EXISTS "ProjectUpdate_authorId_idx" ON "ProjectUpdate"("authorId");
CREATE INDEX IF NOT EXISTS "RateLimitBucket_resetAt_idx" ON "RateLimitBucket"("resetAt");
CREATE INDEX IF NOT EXISTS "Refund_orderId_idx" ON "Refund"("orderId");
CREATE INDEX IF NOT EXISTS "Review_orderId_idx" ON "Review"("orderId");
CREATE INDEX IF NOT EXISTS "Shipment_orderId_idx" ON "Shipment"("orderId");
CREATE INDEX IF NOT EXISTS "Tutorial_projectId_idx" ON "Tutorial"("projectId");
CREATE INDEX IF NOT EXISTS "Tutorial_authorId_idx" ON "Tutorial"("authorId");

-- E-Mail-Warteschlange: nur offene Einträge (Teilindex, bleibt klein)
CREATE INDEX IF NOT EXISTS "Notification_mail_pending_idx" ON "Notification"("createdAt", "id") WHERE "emailedAt" IS NULL;
