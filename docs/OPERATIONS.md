# WERKRAUM – Betrieb auf Railway

## Topologie

```
                    ┌──────────────────────────┐
  Browser / iOS ──▶ │ web  (Next.js, pnpm start)│──┐
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
| `web` | `.railway/railway.ts` | `pnpm start` | `pnpm predeploy` (Migration + Seed) |
| `worker` | `.railway/railway.ts` | `pnpm worker` | – |

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

Optional: `STRIPE_*` (Marktplatz), `RESEND_API_KEY` (E-Mail), `APPLE_*` (Anmelden mit Apple).
Ohne diese Variablen laufen die betroffenen Funktionen in einem klar gekennzeichneten Deaktiviert-Zustand.

## Erstinbetriebnahme

1. Services `web` und `worker` deployen (Migration läuft automatisch im Pre-Deploy von `web`).
2. Seed ausführen (einmalig, z. B. per Railway-Shell im `web`-Service):
   ```bash
   ADMIN_EMAIL=… ADMIN_PASSWORD=… pnpm db:seed
   # Demo-Community zusätzlich:
   SEED_DEMO=true pnpm db:seed
   ```
3. Stripe-Webhook auf `https://<domain>/api/webhooks/stripe` mit den Events
   `checkout.session.completed`, `checkout.session.expired`, `payment_intent.succeeded`,
   `payment_intent.payment_failed`, `charge.refunded`, `charge.dispute.created`, `account.updated` einrichten.

## Monitoring

- Healthcheck: `GET /api/health` (DB-Latenz, Storage-Modus, Version). Railway nutzt ihn beim Deploy.
- Logs sind strukturiertes JSON ohne personenbezogene Daten (`level`, `msg`, `svc`).
- Worker loggt `worker_started`, `cleanup`, `outbox_failed`, `email_failed`.
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
