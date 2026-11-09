-- Kommentarsperre der Moderation getrennt vom Autorenschalter: Speichern im Editor hob sie bisher auf
ALTER TABLE "BlogArticle" ADD COLUMN "commentsLockedAt" TIMESTAMP(3);

-- Bestehende Moderationssperren übernehmen (letzter Sperr-/Freigabe-Eintrag im Audit-Protokoll)
UPDATE "BlogArticle" a
SET "commentsLockedAt" = e."createdAt", "commentsEnabled" = true
FROM (
  SELECT DISTINCT ON ("targetId") "targetId", "action", "createdAt"
  FROM "AuditEvent"
  WHERE "targetType" = 'ARTICLE' AND "action" IN ('admin.comments_locked', 'admin.comments_unlocked')
  ORDER BY "targetId", "seq" DESC
) e
WHERE e."targetId" = a."id" AND e."action" = 'admin.comments_locked' AND a."commentsEnabled" = false;
