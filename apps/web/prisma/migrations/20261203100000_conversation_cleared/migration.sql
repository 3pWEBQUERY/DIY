-- Chat löschen (nur für ein Mitglied)
ALTER TABLE "ConversationMember" ADD COLUMN "clearedAt" TIMESTAMP(3);
