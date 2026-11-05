-- iOS-Push (APNs): Gerätetokens und Zustellstatus je Benachrichtigung

ALTER TABLE "Notification" ADD COLUMN "pushedAt" TIMESTAMP(3);
-- Bestehende Benachrichtigungen gelten als zugestellt (kein Push-Schwall nach dem Deploy)
UPDATE "Notification" SET "pushedAt" = NOW() WHERE "pushedAt" IS NULL;
CREATE INDEX "Notification_pushedAt_updatedAt_idx" ON "Notification"("pushedAt", "updatedAt");

CREATE TABLE "PushDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'IOS',
    "environment" TEXT NOT NULL DEFAULT 'production',
    "disabledAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PushDevice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PushDevice_token_key" ON "PushDevice"("token");
CREATE INDEX "PushDevice_userId_idx" ON "PushDevice"("userId");
ALTER TABLE "PushDevice" ADD CONSTRAINT "PushDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
