-- Profil-Subdomains: {subdomain}.werkuno.ch zeigt /u/{handle}
ALTER TABLE "UserProfile" ADD COLUMN "subdomain" TEXT;
CREATE UNIQUE INDEX "UserProfile_subdomain_key" ON "UserProfile"("subdomain");

-- Ableitung aus dem Handle (gleiche Regeln wie src/lib/subdomains.ts):
-- Kleinbuchstaben, alles ausser a–z/0–9 → „-“, Ränder ohne „-“, max. 50 Zeichen.
-- Belegt oder reserviert → Suffix „--2“, „--3“ … (kann aus keinem Handle entstehen, daher kollisionsfrei).
CREATE OR REPLACE FUNCTION "userprofile_subdomain"() RETURNS trigger AS $$
DECLARE
  base text;
  cand text;
  n int := 1;
  reserved text[] := ARRAY['www', 'api', 'app', 'admin', 'mail', 'smtp', 'imap', 'pop', 'webmail', 'email', 'ns', 'ns1', 'ns2', 'mx', 'autodiscover', 'autoconfig', 'status', 'cdn', 'static', 'assets', 'media', 'img', 'images', 'files', 'docs', 'help', 'hilfe', 'support', 'blog', 'shop', 'markt', 'studio', 'dev', 'staging', 'test', 'beta', 'demo', 'auth', 'login', 'account', 'accounts', 'billing', 'pay', 'payment', 'payments', 'stripe', 'go', 'link', 'links', 'news', 'newsletter', 'community', 'forum', 'apple', 'pinterest', 'ftp', 'sftp', 'git', 'vpn', 'secure', 'm', 'mobile', 'web', 'intranet', 'internal', 'portal', 'werkraum', 'root', 'system', 'moderation', 'u', 'p', 't'];
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."handle" IS NOT DISTINCT FROM OLD."handle" AND NEW."subdomain" IS NOT NULL THEN
    RETURN NEW;
  END IF;
  base := left(trim(both '-' from regexp_replace(lower(NEW."handle"), '[^a-z0-9]+', '-', 'g')), 50);
  base := trim(both '-' from base);
  IF base = '' THEN base := 'profil'; END IF;
  cand := base;
  LOOP
    EXIT WHEN NOT (cand = ANY (reserved))
      AND NOT EXISTS (SELECT 1 FROM "UserProfile" p WHERE p."subdomain" = cand AND p."userId" <> NEW."userId");
    n := n + 1;
    cand := base || '--' || n;
  END LOOP;
  NEW."subdomain" := cand;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "userprofile_subdomain_trg"
  BEFORE INSERT OR UPDATE OF "handle", "subdomain" ON "UserProfile"
  FOR EACH ROW EXECUTE FUNCTION "userprofile_subdomain"();

-- Bestehende Profile: älteste zuerst, damit bei gleicher Grundform das ältere Profil die kurze Adresse erhält
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT "userId" FROM "UserProfile" ORDER BY "createdAt", "userId" LOOP
    UPDATE "UserProfile" SET "subdomain" = NULL WHERE "userId" = r."userId";
  END LOOP;
END $$;
