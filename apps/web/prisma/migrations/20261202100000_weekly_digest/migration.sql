-- Wöchentlicher E-Mail-Rückblick
ALTER TABLE "UserPreference" ADD COLUMN "weeklyDigest" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "weeklyDigestSentAt" TIMESTAMP(3);
