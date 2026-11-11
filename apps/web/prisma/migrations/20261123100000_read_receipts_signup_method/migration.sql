-- Lesebestätigungen (zugestellt/gelesen) und Registrierungsart
ALTER TABLE "ConversationMember" ADD COLUMN "lastDeliveredAt" TIMESTAMP(3);
ALTER TABLE "UserPreference" ADD COLUMN "readReceipts" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "signupMethod" TEXT;

-- Bisher Gelesenes gilt als zugestellt
UPDATE "ConversationMember" SET "lastDeliveredAt" = "lastReadAt" WHERE "lastReadAt" IS NOT NULL;

-- Bestehende Konten: mit Apple angelegt, wenn die Apple-Verknüpfung beim Anlegen entstand, sonst E-Mail
UPDATE "User" u SET "signupMethod" = CASE
  WHEN EXISTS (SELECT 1 FROM "AuthAccount" a WHERE a."userId" = u."id" AND a."provider" = 'apple' AND a."createdAt" <= u."createdAt" + INTERVAL '1 minute') THEN 'APPLE'
  ELSE 'EMAIL' END
WHERE u."signupMethod" IS NULL;
