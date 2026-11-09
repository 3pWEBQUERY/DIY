-- Zwei-Faktor je Sitzung: Moderations-/Adminrechte nur für Sitzungen, die den zweiten Faktor bestätigt haben
ALTER TABLE "Session" ADD COLUMN "mfaVerifiedAt" TIMESTAMP(3);

-- Bestehende Sitzungen, die NACH dem Aktivieren von 2FA angelegt und freigeschaltet wurden, haben den
-- zweiten Faktor beim Login bestätigt. Ältere Sitzungen bleiben unbestätigt (Code einmal neu eingeben).
UPDATE "Session" s
SET "mfaVerifiedAt" = s."createdAt"
FROM "User" u
WHERE s."userId" = u."id"
  AND u."totpEnabledAt" IS NOT NULL
  AND s."mfaPending" = false
  AND s."createdAt" >= u."totpEnabledAt";

-- Sign in with Apple: Refresh-Token (verschlüsselt) für den Widerruf bei der Kontolöschung
ALTER TABLE "AuthAccount" ADD COLUMN "refreshToken" TEXT;
ALTER TABLE "AuthAccount" ADD COLUMN "tokenClientId" TEXT;
