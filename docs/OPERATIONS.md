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

## Monitoring

- Healthcheck: `GET /api/health` (DB-Latenz, Storage-Modus, Version). Railway nutzt ihn beim Deploy.
- Logs sind strukturiertes JSON ohne personenbezogene Daten (`level`, `msg`, `svc`).
- Worker loggt `worker_started`, `worker_stopping`/`worker_stopped`, `cleanup`, `outbox_failed`, `email_failed`,
  `optional_job_failed` (ein Job-Modul liess sich nicht laden – auch unter Admin → Fehler).
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

Danach `pnpm db:migrate` (idempotent) und Healthcheck prüfen. Der Audit-Trigger (`AuditEvent_immutable`)
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
