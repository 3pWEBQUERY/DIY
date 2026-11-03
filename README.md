# WERKRAUM

**Das soziale Netzwerk für Selbstgemachtes.** Projekte, Anleitungen, Communities, Blogs und ein Handmade-Marktplatz – verbunden durch den *Projektfaden*.

> Arbeitstitel gemäss PRD v1.0 (03.11.2026). Zielmarkt D-A-CH, Start Schweiz.

## Was drin ist

| Bereich | Umfang |
|---|---|
| Community | Feeds *Für dich* (Ranking mit Vielfalt), *Folge ich* (chronologisch), *Neu* · Beiträge mit Bildern/Video, Alt-Texten, Projektverweis · Likes, Kommentare, Antworten, Speichern, Reposts · Folgen, Blockieren, Stummschalten, Melden |
| Projekte | Datenblatt, Galerie, Status, Materialien & Werkzeuge, **Projektjournal**, **Nachbauten** mit Originalnennung, Projektfaden |
| Anleitungen | Strukturierte Schritte, Sicherheitshinweise, Fortschritt je Konto, **Versionierung** mit stabilem Fortschritt |
| Marktplatz | Shop-Aktivierung, Stripe Connect, Varianten & Bestand, Reservierung, Bestellstatus ≠ Zahlungsstatus, idempotente Webhooks, Bewertungen nach Kauf |
| Creator | Creator Studio, Blog mit Block-Editor, Communities, Nachrichten |
| Vertrauen | Moderation mit Fallnummern & Einsprüchen, Hash-verkettetes Audit-Log, Rollen, Accountlöschung & Datenexport |
| Erlebnis | „Werkbuch“-Designsystem, Three.js-Scrollytelling auf der Landingpage, ⌘K-Befehlspalette, WCAG 2.2 AA |

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Prisma 7 · PostgreSQL · pg-boss · S3 (Railway Bucket) · Stripe Connect · Three.js

## Schnellstart

```bash
pnpm install
cp apps/web/.env.example apps/web/.env   # DATABASE_URL & SESSION_SECRET setzen
pnpm db:migrate
SEED_DEMO=true pnpm db:seed
pnpm dev                                  # http://localhost:3000
pnpm worker                               # zweites Terminal
```

Demo-Login: `lena-haekelt@demo.werkraum.local` / `Werkraum-Demo-2026!` · Admin: `admin@werkraum.local` / `Werkraum-Admin-2026!` (lokal, bitte in Produktion per `ADMIN_EMAIL`/`ADMIN_PASSWORD` setzen).

## Dokumentation

- [`docs/PLAN.md`](docs/PLAN.md) – Umsetzungsplan mit PRD-Abdeckung
- [`docs/ENGINEERING.md`](docs/ENGINEERING.md) – Konventionen & Designsystem
- [`docs/OPERATIONS.md`](docs/OPERATIONS.md) – Railway-Betrieb, Backup & Restore

## Struktur

```
apps/web          Next.js-App (UI, API /api/v1, Worker, Prisma)
packages/shared   Zod-Schemas, Enums, Geldlogik – geteilt mit der iOS-App
apps/ios          iOS-App (Expo) – folgt in der Schlussphase
```
