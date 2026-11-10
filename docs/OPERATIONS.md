# WERKRAUM – Betrieb auf Railway

## Topologie

```
                    ┌──────────────────────────┐
  Browser / iOS ──▶ │ web  (Next.js, next start)│──┐
                    └──────────────────────────┘  │
                    ┌──────────────────────────┐  │   ┌───────────────┐
                    │ worker (pnpm worker)      │──┼──▶│ Postgres      │  Daten, Outbox, pg-boss-Queues,
                    └──────────────────────────┘  │   └───────────────┘  Volltextsuche, Rate Limits
                                                  │   ┌───────────────┐
                                                  └──▶│ Bucket "media"│  Rohuploads, WebP-Varianten,
                                                      └───────────────┘  private Dateien (S3-kompatibel)
```

Beide App-Services nutzen dasselbe `Dockerfile`. Unterschied ist nur der Start-Befehl:

| Service | Config | Start | Pre-Deploy |
|---|---|---|---|
| `web` | `.railway/railway.ts` | `sh -c 'cd apps/web && exec ./node_modules/.bin/next start -p ${PORT:-3000}'` (lokal: `pnpm start`) | `pnpm predeploy` (Migration + Seed) |
| `worker` | `.railway/railway.ts` | `sh -c 'cd apps/web && exec node --conditions=react-server --import tsx src/worker/index.ts'` (lokal: `pnpm worker`) | – |

Beide Start-Befehle laufen per `exec` ohne pnpm dazwischen, damit SIGTERM den Prozess direkt erreicht.

### Deploy & Herunterfahren
- Beim Deploy laufen alte und neue Version kurz **parallel**. Der Worker schützt sich davor in der Datenbank:
  Outbox-Ereignisse werden per Claim (`OutboxEvent.claimedAt/claimedBy`, 5 Min. Lease) genau einem Prozess
  zugeteilt, Push-Benachrichtigungen per bedingtem Update auf `pushedAt IS NULL`, Folgejobs (Medien, Fan-out,
  Kontolöschung) haben eine feste Job-ID je Ereignis (pg-boss legt sie nur einmal an).
- SIGTERM: Der Worker nimmt keine neue Arbeit an, gibt nicht begonnene Outbox-Claims frei und wartet bis zu 30 s
  auf laufende Takte und pg-boss-Jobs, erst dann schliesst er die DB. `RAILWAY_DEPLOYMENT_DRAINING_SECONDS`
  (worker 45 s, web 30 s) gibt ihm dafür Zeit vor dem SIGKILL. Länger laufende Jobs (Video, Kontolöschung)
  werden nach Ablauf von pg-boss wiederholt.
- Kontolöschungen laufen als eigener Job `account.purge` (bis 1 Std., 12 Wiederholungen mit Backoff) – die
  Outbox reiht nur ein und blockiert so keine Medien- oder Beitragsereignisse.
- Konfiguration wird beim Start geprüft (`env()` in `src/instrumentation.ts` bzw. beim Worker-Start): ungültige
  Pflichtvariablen brechen den Start ab, Warnungen erscheinen als `config_warning` im Log und unter Admin → System.

## Umgebungsvariablen

Siehe `apps/web/.env.example`. Auf Railway mit Referenzen:

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
APP_URL=https://${{web.RAILWAY_PUBLIC_DOMAIN}}
S3_ENDPOINT=${{media.ENDPOINT}}
S3_BUCKET=${{media.BUCKET}}
S3_REGION=${{media.REGION}}
S3_ACCESS_KEY_ID=${{media.ACCESS_KEY_ID}}
S3_SECRET_ACCESS_KEY=${{media.SECRET_ACCESS_KEY}}
SESSION_SECRET=<zufällig, 48+ Zeichen>
```

Optional: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET` (Marktplatz),
`RESEND_API_KEY`, `MAIL_FROM` (E-Mail – in web **und** worker), `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`,
`APPLE_PRIVATE_KEY` (Anmelden mit Apple – web; zusätzlich worker für den Token-Widerruf bei Kontolöschung, siehe „Apple-Schlüssel“), `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` (web, zufällig 32 Byte base64,
z. B. `openssl rand -base64 32` – hält Server-Action-IDs über Deploys stabil; wird als Build-Argument gebraucht).
In `.railway/railway.ts` stehen sie als `preserve()`: Werte im Dashboard setzen, IaC überschreibt sie nicht.
VAPID-Schlüssel (Browser-Push) erzeugt die App selbst und speichert sie in der Datenbank; `VAPID_PUBLIC_KEY`/
`VAPID_PRIVATE_KEY` nur setzen, wenn nötig – dann in web **und** worker identisch.

> ⚠ **`SESSION_SECRET` nicht rotieren, ohne die Folgen zu kennen.** Daraus wird der Schlüssel abgeleitet, mit dem
> die TOTP-Geheimnisse der Zwei-Faktor-Anmeldung verschlüsselt sind (`src/server/auth/totp.ts`). Nach einer
> Änderung lässt sich kein 2FA-Code mehr prüfen – **alle Konten mit 2FA sind ausgesperrt** (nur noch über
> Wiederherstellungscodes bzw. manuelles Zurücksetzen von 2FA). Ausserdem werden signierte Links ungültig
> (Abmeldelinks in E-Mails, Einspruchslinks, signierte Medien-URLs). web und worker brauchen denselben Wert.

### Audit-Protokoll verankern (`AUDIT_HMAC_KEY`)

`AUDIT_HMAC_KEY` (web **und** worker, identisch, mind. 32 Zeichen, z. B. `openssl rand -base64 48`; in
`.railway/railway.ts` als `preserve()`) ist der Schlüssel der Audit-Kette (`src/server/audit.ts`):

- Neue Einträge werden mit HMAC-SHA256 verkettet (`AuditEvent.alg = "hmac-sha256-v1"`). Wer nur Schreibzugriff
  auf die Datenbank hat (und den Trigger `AuditEvent_immutable` abschaltet), kann die Kette ohne den Schlüssel
  nicht neu berechnen. Ältere Einträge (`alg = "sha256"`) bleiben prüfbar; nach dem ersten HMAC-Eintrag wird
  eine Rückstufung auf SHA-256 als Bruch gemeldet.
- Ohne Schlüssel läuft die alte, schlüssellose Verkettung weiter (Startwarnung in Produktion, Hinweis bei der Prüfung).
- **Nie wechseln oder entfernen**: HMAC-Einträge sind sonst nicht mehr prüfbar (die Prüfung meldet „AUDIT_HMAC_KEY fehlt“).
  Den Wert sicher ausserhalb von Railway aufbewahren (Passwortmanager), getrennt von DB-Backups.
- **Prüfpunkte**: Der Worker prüft täglich um 02:45 (Europe/Zurich, Job `audit.checkpoint`) die Kette inkrementell
  und schreibt einen Prüfpunkt `{seq, hash, at}` in `AuditCheckpoint` (mit HMAC beglaubigt, Trigger
  `AuditCheckpoint_immutable`) **und** als Log-Zeile `{"msg":"audit_checkpoint","seq":…,"hash":…,"at":…,"verified":…}`.
  Die Log-Zeilen liegen ausserhalb der Datenbank: Bei Verdacht den Hash eines alten Prüfpunkts aus den Logs mit
  `SELECT hash FROM "AuditEvent" WHERE seq = <seq>` vergleichen. Ein Bruch wird zusätzlich als Fehler
  `AuditChainBroken` (Admin → Fehler) gemeldet und als `level: "error"` geloggt.
- **Prüfung**: Admin → Audit-Protokoll → „Integrität prüfen“ prüft ab dem letzten geprüften Prüfpunkt bis zum
  aktuellen Eintrag (erkennt auch abgeschnittene Enden über spätere Prüfpunkte); „Vollständig prüfen“ prüft die
  ganze Kette vom ersten Eintrag an.

### iOS-App (`apps/ios`)
| Variable | Service | Zweck |
|---|---|---|
| `APPLE_IOS_CLIENT_ID` | web | Bundle-ID der App (`ch.werkuno.app`) – aktiviert „Mit Apple anmelden“ in der App (`POST /api/v1/app/auth/apple`) |
| `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY`, `APNS_BUNDLE_ID` | worker | iOS-Push. `.p8`-Schlüssel aus developer.apple.com → Certificates, IDs & Profiles → Keys (Apple Push Notifications service). Zeilenumbrüche als `\n`. |

Ablauf Push: Die App meldet ihr Gerätetoken (`PATCH /api/v1/app/devices/push`, an die Sitzung gebunden). Der Worker stellt neue, ungelesene In-App-Benachrichtigungen alle 10 s per APNs zu (`push.deliver`), höchstens 30 Min. alte. Abmelden/Sitzungswiderruf beendet den Versand, ungültige Tokens werden deaktiviert. Ohne `APNS_*` bleibt der Versand still aus.
In Xcode für Geräte-Builds das eigene Team eintragen (`DEVELOPMENT_TEAM` in `apps/ios/project.yml`) und die Capabilities „Sign in with Apple“ und „Push Notifications“ für die App-ID aktivieren.
Ohne diese Variablen laufen die betroffenen Funktionen in einem klar gekennzeichneten Deaktiviert-Zustand.

## Erstinbetriebnahme

1. Services `web` und `worker` deployen (Migration läuft automatisch im Pre-Deploy von `web`).
2. Der Seed läuft automatisch bei jedem Deploy im Pre-Deploy von `web` (`pnpm predeploy` = Migration + Seed)
   und ist idempotent. Vor dem ersten Deploy `ADMIN_EMAIL` und `ADMIN_PASSWORD` setzen – ohne
   `ADMIN_PASSWORD` bricht der Seed in Produktion ab (kein Standardpasswort). Demo-Inhalte nur ausserhalb der
   Produktion (`SEED_DEMO=true`, siehe `.railway/railway.ts`).
3. Stripe-Webhook auf `https://<domain>/api/webhooks/stripe` mit den Events
   `checkout.session.completed`, `checkout.session.expired`, `payment_intent.succeeded`,
   `payment_intent.payment_failed`, `charge.refunded`, `charge.dispute.created`, `account.updated` einrichten.

## Digitale Produkte in der iOS-App (Apple In-App-Kauf)

In der App werden digitale Produkte (Anleitungen als PDF, Schnittmuster) nur über Apple verkauft
(App Review Guideline 3.1.1); im Web weiter über Stripe. Preis in der App = Web-Preis + Aufschlag
(Admin → Systemkonfiguration „Aufschlag in der iOS-App“, Standard 30 %), aufgerundet auf eine Preisstufe.
Der Shop erhält denselben Anteil wie bei einem Web-Verkauf; Werkuno überweist ihn per Stripe aus dem
Plattformguthaben (Worker versucht es bei Fehlern erneut). Apple zahlt Werkuno monatlich aus –
das Stripe-Plattformguthaben muss die Überweisungen decken.

Einrichtung in App Store Connect:
1. Pro Preisstufe einen **Verbrauchsartikel** anlegen: Produkt-ID `ch.werkuno.app.digital.chf<Franken>`
   für 1–20, 22, 25, 28, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 120, 150, 200 (Liste:
   `APP_STORE_TIERS_CHF` in `src/server/commerce/appstore.ts`), Preis in CHF genau dieser Betrag.
2. App-Informationen → App Store Server Notifications **Version 2**, Produktions- und Sandbox-URL:
   `https://werkuno.ch/api/webhooks/apple` (Erstattungen widerrufen den Download und holen den Shop-Anteil zurück).
3. Optional `APPLE_IAP_BUNDLE_ID` (Standard `ch.werkuno.app`).

Sandbox-Käufe (TestFlight, App Review) schalten den Download frei, lösen aber keine Überweisung aus.
Lokal: Xcode-Schema nutzt `apps/ios/StoreKit/Werkuno.storekit`; der lokale Server nimmt solche
Testbelege nur mit `APPLE_IAP_ALLOW_XCODE=true` an (nie in Produktion).

## Monitoring

- Healthcheck: `GET /api/health` (DB-Latenz, Storage-Modus, Version). Railway nutzt ihn beim Deploy.
- Logs sind strukturiertes JSON ohne personenbezogene Daten (`level`, `msg`, `svc`).
- Worker loggt `worker_started`, `worker_stopping`/`worker_stopped`, `cleanup`, `outbox_failed`, `email_failed`,
  `optional_job_failed` (ein Job-Modul liess sich nicht laden – auch unter Admin → Fehler) und täglich
  `audit_checkpoint` (Prüfpunkt der Audit-Kette, siehe oben – diese Zeilen aufbewahren).
- Kennzahlen: Admin → Dashboard (PRD §30).

## Backup & Restore (PRD §31.4 Nr. 13)

**Postgres** – Railway erstellt Volume-Backups (Projekt → Postgres → Backups, Zeitplan einstellen: täglich, Aufbewahrung ≥ 14 Tage). Zusätzlich logisches Backup:

```bash
pg_dump "$DATABASE_URL" --format=custom --no-owner --file=werkraum-$(date +%F).dump
```

Restore in eine leere Datenbank:

```bash
pg_restore --no-owner --clean --if-exists --dbname="$TARGET_DATABASE_URL" werkraum-YYYY-MM-DD.dump
```

Danach `pnpm db:migrate` (idempotent) und Healthcheck prüfen. Der Audit-Trigger (`AuditEvent_immutable`, ebenso `AuditCheckpoint_immutable`)
wird mit dem Schema wiederhergestellt; die Hash-Kette lässt sich in Admin → Audit-Protokoll prüfen.

**Bucket** – Objekte mit einem S3-Client spiegeln, z. B.:

```bash
aws s3 sync s3://$S3_BUCKET ./bucket-backup --endpoint-url "$S3_ENDPOINT"
```

**Restore-Test**: quartalsweise ein Backup in eine Staging-Umgebung (Railway → Environment duplizieren) einspielen.

## Umzug weg von Railway (PRD §25.8)

- Container: `Dockerfile` läuft überall (Fly, Kubernetes, eigener Server).
- Datenbank: Standard-PostgreSQL ≥ 15 mit Extensions `pg_trgm`, `unaccent`.
- Storage: beliebiger S3-kompatibler Speicher (MinIO, Cloudflare R2, Exoscale SOS in der Schweiz).
- Queues: pg-boss liegt im Schema `pgboss` derselben Datenbank – kein weiterer Dienst nötig.
- Externe Dienste (Stripe, Resend, Apple) sind über Adapter in `src/server/*` gekapselt.

## Demo-Daten entfernen
In der Produktion setzt `.railway/railway.ts` `SEED_DEMO=false`; bereits angelegte Demo-Konten mit dem
Standardpasswort sperrt der Seed bei jedem Deploy für den Login (die Inhalte bleiben sichtbar).
⚠ Vor einem Purge Befund D-2 in `docs/ANALYSE.md` beachten (Kaskaden treffen auch echte Inhalte).
Einmalig vor dem Start: in Railway (Service `web`) `PURGE_DEMO=true` setzen → beim
nächsten Deploy löscht der Seed alle Konten `@demo.werkraum.local` samt Inhalten, Bestellungen, Gesprächen und
redaktionellen Demo-Sammlungen; Zähler echter Konten werden neu berechnet. Testlauf ohne Löschen: `PURGE_DEMO=dry-run`.
Danach `PURGE_DEMO` wieder entfernen (ohne Demo-Konten passiert ohnehin nichts).

## Feature-Flags
Definiert in `src/server/flags.ts`, geschaltet unter Admin → System (sofort wirksam, Web und App):
`marketplace`, `signup`, `communities.create`, `messages.new`, `uploads.video`, `realtime`.
Rollout < 100 % gilt stabil für einen Anteil angemeldeter Konten. Serverseitig über `requireFlag()` erzwungen,
die App erhält den Stand über `GET /api/v1/app/bootstrap` (`flags`).

## Fehlerüberwachung
Eigene Lösung ohne Fremddienst (`src/server/monitoring.ts`): unerwartete Fehler aus Server (Actions, API,
Rendern), Browser (`/api/v1/errors`) und Worker werden gruppiert gespeichert → Admin → Fehler. Neue Fehler und
Rückfälle erledigter Fehler erzeugen eine Benachrichtigung an Administration (max. 1×/h je Fehler; per E-Mail,
sobald `RESEND_API_KEY` gesetzt ist). Einzelvorkommen werden nach 30 Tagen gelöscht.


## Apple-Schlüssel (Anmelden mit Apple, Push)

Alles unter developer.apple.com → Account (Apple Developer Program, kostenpflichtig) → **Certificates, Identifiers & Profiles**:

1. **Team-ID** (`APPLE_TEAM_ID`, `APNS_TEAM_ID`): oben rechts im Account bzw. unter *Membership details* (10 Zeichen).
2. **App-ID** `ch.werkuno.app` (*Identifiers*) mit der Fähigkeit *Sign in with Apple* (und *Push Notifications*).
   Das ist `APPLE_IOS_CLIENT_ID` bzw. `APNS_BUNDLE_ID`.
3. **Services-ID** für das Web (*Identifiers* → *Services IDs*, z. B. `ch.werkuno.web`) mit *Sign in with Apple*,
   primäre App-ID von Schritt 2, Domain `werkuno.ch` und Return-URL `https://<domain>/api/auth/apple/callback`.
   Das ist `APPLE_CLIENT_ID`.
4. **Schlüssel** (*Keys* → *+*): Name vergeben, *Sign in with Apple* aktivieren (→ *Configure* → primäre App-ID
   wählen) und – falls derselbe Schlüssel auch für Push dienen soll – *Apple Push Notifications service (APNs)*.
   Nach *Register* die `.p8`-Datei herunterladen: **das geht nur ein einziges Mal**. Die angezeigte *Key ID* ist
   `APPLE_KEY_ID` (bzw. `APNS_KEY_ID`).
5. Inhalt der `.p8`-Datei (beginnt mit `-----BEGIN PRIVATE KEY-----`) als `APPLE_PRIVATE_KEY` (bzw.
   `APNS_PRIVATE_KEY`) in Railway eintragen – in **web und worker**. Mehrzeilig einfügen oder Zeilenumbrüche
   als `\n` schreiben; beides wird gelesen.

Die `.p8`-Datei ist ein Geheimnis: nie ins Repository, nur in Railway bzw. einem Passwortmanager aufbewahren.
Bei Verlust in Apple einen neuen Schlüssel erstellen, den alten widerrufen und die Variablen ersetzen.

## Auszahlungen & Haltefrist

- Bei Stripe steht jedes Verkäuferkonto auf **manuelle Auszahlung**. Werkuno führt den Auszahlungsplan des Shops aus
  (Studio → Einnahmen: auf Anfrage, täglich, wöchentlich, monatlich) – Worker-Job `payouts.run`, stündlich um :20.
- Ausgezahlt wird nur **freigegebenes** Guthaben: Der Erlös einer Bestellung wird `commerce.payoutHoldDays` (Standard 3)
  Tage nach ihrem **Abschluss** frei. Abgeschlossen ist eine Bestellung mit der Erhaltsbestätigung der Käuferin bzw. des
  Käufers, spätestens automatisch `commerce.autoCompleteDays` (Standard 14) Tage nach dem Versand; digitale Bestellungen
  mit der Zahlung. Problemfälle und angefochtene Zahlungen bleiben bis zur Klärung zurückgehalten.
- Beim ersten Lauf nach dem Deploy übernimmt der Worker bestehende automatische Stripe-Auszahlungspläne in Werkuno und
  stellt Stripe auf „manuell“ um (`Shop.payoutScheduleMigratedAt`).
- Einzelnen vertrauenswürdigen Shops kann die Administration die Frist erlassen (Admin → Marktplatz → Shop → Zahlungen,
  begründet, im Audit-Protokoll). Gesperrten Shops wird nichts ausgezahlt; nach einer Kontolöschung wird das Restguthaben
  nach Ablauf der Frist täglich ausgezahlt.
- Lautet das Bankkonto auf eine andere Währung als der Shop (z. B. EUR), wird der zurückgehaltene Betrag aus der tatsächlichen
  Gutschrift je Zahlung bei Stripe ermittelt (an der Zahlung zwischengespeichert). Ist sie nicht ermittelbar, wird vorsichtshalber
  nichts ausgezahlt, bis die Gutschrift abrufbar ist.
