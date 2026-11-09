-- Browser-Push (Web Push): Schlüssel je Abo
ALTER TABLE "PushDevice" ADD COLUMN "p256dh" TEXT, ADD COLUMN "auth" TEXT, ADD COLUMN "userAgent" TEXT;
