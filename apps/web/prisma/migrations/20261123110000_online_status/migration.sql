-- Online-Status (Herzschlag) und Einstellung „Online-Status zeigen“
ALTER TABLE "User" ADD COLUMN "onlineUntil" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "lastOnlineAt" TIMESTAMP(3);
ALTER TABLE "UserPreference" ADD COLUMN "showOnline" BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX "User_onlineUntil_idx" ON "User"("onlineUntil");
