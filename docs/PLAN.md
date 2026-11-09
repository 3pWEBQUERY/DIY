# WERKRAUM – Umsetzungsplan

> Arbeitsgrundlage für die Umsetzung der PRD v1.0 (Stand 03.11.2026).
> Jede Zeile referenziert die Anforderungs-IDs der PRD, damit nichts verloren geht.
> Status: ✅ umgesetzt · 🟡 Grundgerüst/teilweise · ⏳ geplant (spätere Phase) · 🍎 iOS-Phase (zum Schluss)

---

## 0. Leitentscheidungen

| Thema | Entscheidung | Begründung (PRD) |
|---|---|---|
| Architektur | Modularer Monolith (Next.js App Router) + separater Worker-Prozess | §25.1 |
| Sprache | TypeScript strikt, überall | §25.2 |
| Web | Next.js 16, React 19, Tailwind CSS v4, eigene shadcn-artige Primitives | §25.2 |
| Datenbank | Railway Postgres 16, Prisma 7 (Driver Adapter `pg`) | §25.3 |
| Dateien | Railway Bucket (S3-kompatibel) über Storage-Adapter, Presigned Uploads | §25.3, §25.6 |
| Jobs/Queue | `pg-boss` auf derselben Postgres-Instanz (kein Redis nötig im MVP) | §25.3, §27.3 |
| Suche | Postgres Full-Text (`tsvector`, deutsch) + `pg_trgm` für Tippfehlertoleranz | §18.4, §25.3 |
| Auth | Eigener Identity-Layer: scrypt-Hashing, DB-Sessions, Session-Widerruf, Apple-Login (OIDC) | §8, §25.5 |
| Zahlungen | Stripe Connect (Express) als Marketplace-Provider, signierte idempotente Webhooks | §13.6, §25.7 |
| E-Mail | Adapter (Resend / SMTP / Konsole in Dev) | §19.2 |
| Hosting | Railway: `web`, `worker`, `Postgres`, `Bucket` – alles per Dockerfile reproduzierbar | §25.8 |
| 3D/Motion | Three.js nur dort, wo es eine Aussage trägt (Landing: „Ein Faden – viele Projekte“), lazy geladen, `prefers-reduced-motion` respektiert | §28.1, §29.4 |
| iOS | React Native / Expo – **letzte Phase**, nutzt `packages/shared` + `/api/v1` | §25.4 |

### Designhaltung „Werkbuch“
Keine Verläufe, keine Schatten, kein Glas. Stattdessen: Papier (`#FAF9F6`), Tinte (`#252822`), Moos (`#3D604C`), Terrakotta (`#B46C4D`).
Die UI ist ein **Werkbuch**: technische Datenblätter (Mono-Labels, Masslinien), redaktionelle Serifen-Titel, haarfeine Linien.
Das USP – das verknüpfte Projekt – wird als **Projektfaden** sichtbar: eine durchgehende Linie, die Beiträge, Journal, Anleitung, Produkte und Nachbauten eines Projekts verbindet.

---

## 1. Repository-Struktur

```
/
├─ apps/
│  ├─ web/                 Next.js (UI + API /api/v1 + Server Actions)
│  │  ├─ prisma/           Schema, Migrationen, Seed
│  │  ├─ src/app/          Routen (public, app, studio, admin, api)
│  │  ├─ src/components/   Designsystem + Feature-Komponenten
│  │  ├─ src/server/       Domänenmodule (identity, social, projects, …)
│  │  └─ src/worker/       Hintergrundjobs (Medien, Benachrichtigungen, Mails)
│  └─ ios/                 🍎 Expo-App (Schlussphase)
├─ packages/shared/        Zod-Schemas, Enums, Typen (Web + iOS)
├─ docs/                   Plan, Architektur, Railway, Design, Betrieb
├─ Dockerfile              Ein Image für web + worker
└─ railway.json            Deploy-Konfiguration
```

---

## 2. Arbeitspakete & Checkliste

### WP1 – Fundament
- [x] pnpm-Workspace, TS-Konfiguration, Lint
- [x] Designtokens (§28.2), Typografie (§28.3), Primitives (§28.4)
- [x] Prisma-Schema mit allen Entitäten aus §26.1
- [x] Env-Validierung, Fehlerstruktur, Rate Limiting, Idempotenz (§27.2)
- [x] Storage-Adapter S3/Railway Bucket (§25.6, §25.8)
- [x] Event-Bus + Outbox → pg-boss (§27.3)
- [x] Audit-Log (§24.3)

### WP2 – Identity & Onboarding (AUTH-001 … AUTH-012)
- [x] Registrierung E-Mail/Passwort, 18+-Bestätigung (§8.4)
- [x] E-Mail-Verifizierung, Passwort-Reset
- [x] Login, Logout, Sessionliste & Widerruf
- [x] Anmeldung mit Apple (OIDC, aktiv sobald Keys gesetzt)
- [x] Hinweis bei Anmeldung von neuem Gerät (Sicherheitswarnung)
- [x] Onboarding: Name/Handle → Interessen → Profil → Vorschläge → Feed (überspringbar)
- [x] Accountlöschung + Datenexport (§23.1)

### WP3 – Social / Feed (FEED-001 … FEED-025)
- [x] Feeds: Für dich, Folge ich (chronologisch), Neu – Cursor-Pagination
- [x] Composer: Text, mehrere Bilder (Reihenfolge, Alt-Text), Video, Kategorie, Projektverweis
- [x] Bearbeiten/Löschen, Sichtbarkeit
- [x] Like, Kommentar, Antwort, Speichern, Teilen, Repost mit Einordnung
- [x] Folgen, Melden, Blockieren (wechselseitig), Stummschalten
- [x] Ranking: Frische, Interessen-Match, Qualität, Diversität (Autor-Deckel), kein reines Follower-Ranking
- [x] Verkaufsposts gekennzeichnet; Dedupe im Feed
- ✅ Umfragen (2–4 Antworten, 1/3/7 Tage, Mehrfachauswahl) · ✅ Entwürfe und geplante Veröffentlichung · ✅ Koautoren (bis 3, mit Bestätigung)
- ✅ Eigenes Teilen-Menü (Werkuno-Nachricht, WhatsApp, Nachrichten, E-Mail, Instagram, …) · ✅ eigene Bestätigungsdialoge

### WP4 – Projekte (PROJ-001 … PROJ-035) – Produktkern
- [x] Projekt-CRUD mit allen Feldern aus §10.2, Status §10.3
- [x] Projektseite nach §10.4 inkl. **Projektfaden**
- [x] Journal (§10.5) mit Meilenstein, Problem/Lösung, Zeit – optional in Feed
- [x] Nachbauten (§10.6) mit Referenz & Abweichungen
- [x] Sammlungen privat/öffentlich (§10.7)

### WP5 – Tutorials (TUT-001 … TUT-030)
- [x] Schritt-Editor (Text, Bild, Dauer, Hinweis, Sicherheitswarnung, Material, Werkzeug)
- [x] Metadaten §11.3, Versionierung §11.5 (veröffentlichte Versionen eingefroren)
- [x] Schritte abhaken + Fortschritt je Konto, Merken, Fragen, Materialliste übernehmen
- [x] Sicherheitskategorien (Strom, Hitze, Chemie, Werkzeuge) & Meldung fehlerhafter Schritte

### WP6 – Profile (PROF-001 … PROF-025)
- [x] `/u/[handle]`, Tabs, leere Bereiche ausgeblendet, Profilaktionen
- ✅ Bewertungen im Profil (Shops immer, Käufer:innen mit abgegebenen Bewertungen)
- ✅ Creator Pro (Abo via Stripe Billing): Schaufenster, Pro-Kennzeichen, Medienkit, 12-Monats-Statistik + CSV, längere Videos, tiefere Provision

### WP7 – Marktplatz (SHOP-001 … SHOP-050)
- [x] Shop-Eröffnung (Studio-Wizard), Verkäuferverifizierung via Stripe Connect
- [x] Produkte physisch (Einzelstück, Kleinserie, auf Bestellung, Materialset), Varianten, Bestand
- [x] Warenkorb, Checkout (Stripe), Verfügbarkeitsprüfung + Reservierung
- [x] Bestellung ≠ Zahlung (eigene Statusmodelle), Webhooks idempotent
- [x] Bestellverwaltung (Neu → Abgeschlossen, Storniert, Erstattet, Problemfall)
- [x] Bewertungen nur nach bestätigtem Kauf, 1× pro Position
- [x] Provision konfigurierbar (Default 6 %), transparent vor Kauf
- 🟡 Digitale Produkte: Datenmodell + Entitlements + geschützter Download (Web); iOS ⏳
- ✅ Käuferangaben einmal erfassen (Name, Adresse), Schnappschuss je Bestellung
- ✅ Auszahlungen über Werkuno (Guthaben, beantragen, Auszahlungsplan, Bankkonto), Benachrichtigung bei jeder Auszahlung
- ✅ Produkte: mehrere Materialien, Masse H/B/T, Angebotsart „Unbearbeiteter Artikel“

### WP8 – Blog (BLOG-001 … BLOG-030)
- [x] Blockbasierter Editor (Überschrift, Absatz, Liste, Zitat, Bild, Hinweis, Projekt-/Tutorial-/Produktkarte)
- [x] Entwürfe, Revisionen, SEO-Titel/-Beschreibung, Slug-Weiterleitungen, Lesedauer
- [x] SSR, JSON-LD, Sitemap, Canonical

### WP9 – Communities (GROUP-001 … GROUP-030)
- [x] Öffentlich / Beitrittsanfrage / Privat, Regeln, Rollen, Anheften, Ankündigungen
- [x] Gruppenmoderation (Community-Moderator-Rolle)
- ✅ Events/Workshops/Tauschbörsen (Zusagen, Plätze, Erinnerung, .ics) · ✅ Wettbewerbe mit Einreichungen (Abstimmung mit 3 Stimmen oder Jury, Gewinner:innen, Übersicht `/wettbewerbe`)

### WP10 – Nachrichten (MSG-001 … MSG-020)
- [x] Direktnachrichten, Käufer↔Verkäufer-Kontext, Bilder, Archiv, Melden
- [x] Kontaktanfragen beschränken, Rate Limit, Warnung bei verdächtigen Zahlungslinks
- ✅ Gruppenchats (bis 25, Admins, Einladungen nach DM-Einstellung) · ❗ keine E2E-Werbung (§16.3)

### WP11 – Materialien (MAT-001 … MAT-030)
- [x] Materialdatenbank, Projekt-Materiallisten mit Mengen
- [x] Einkaufslisten: übernehmen, zusammenführen, abhaken, teilen
- ⏳ Bestand, Preisvergleich, Affiliate

### WP12 – Suche & Entdecken (SEARCH-001 … SEARCH-025)
- [x] Globale Suche (Mitglieder, Beiträge, Projekte, Tutorials, Produkte, Artikel, Communities)
- [x] Filter: Typ, Kategorie, Schwierigkeit, Preis, kostenlos/kostenpflichtig, Dauer
- [x] Entdecken-Seite mit redaktionellen Kollektionen; ⌘K-Befehlspalette

### WP13 – Benachrichtigungen (NOTIF-001 … NOTIF-015)
- [x] Alle Ereignisse aus §19.1, In-App + E-Mail, Einstellungen je Ereignis/Kanal, Bündelung
- ⏳ Browser-Push (Web)
- 🍎 iOS-Push (APNs-Schlüssel fehlen noch)
- ❗ E-Mail-Versand in Produktion erst mit `RESEND_API_KEY` aktiv

### WP14 – Werkuno Studio (CREATOR-001 … CREATOR-030)
- [x] Übersicht mit ehrlich beschrifteten Kennzahlen (§20.4)
- [x] Inhalte, Projekte, Tutorials, Blog, Produkte, Bestellungen, Shop, Medien, Einnahmen

### WP15 – Moderation & Administration (§24, §6.4)
- [x] Meldung → Fallnummer → Risikostufe → Entscheidung → Benachrichtigung → Einspruch
- [x] Massnahmen §24.2, Rollen §7.2, Audit-Log unveränderlich (Append-only, Hash-Kette)
- [x] Nutzer, Kategorien, Hervorhebungen, Feature-Flags, Systemeinstellungen

### WP16 – Recht & Vertrauen (§23)
- [x] Seiten: Impressum, Datenschutz, AGB, Community-Richtlinien, Marktplatz-Richtlinien, Sicherheitsrichtlinien
  (⚠️ Vorlagen – vor Launch juristisch prüfen, §31.4 Nr. 11)
- [x] EXIF-Entfernung, private Dateien nur via signierte URLs

### WP17 – Qualität
- [x] WCAG 2.2 AA: Fokus, Skip-Link, Labels, Kontraste, reduzierte Bewegung
- [x] Performance: RSC, Bildvarianten, Three.js nur auf Landing & lazy
- [x] Tests (Vitest) für Ranking, Gebühren, Berechtigungen, Webhook-Idempotenz
- [x] Browser-Tests (Playwright, `apps/web/e2e`): Anmeldung, Kauf, Auszahlung, Studio, Teilen, Koautoren, Creator Pro, Wettbewerbe
- [x] CI (GitHub Actions): Typen, Unit-Tests, Build und Browser-Tests bei jedem Push
- [x] Eigene Fehlerüberwachung, Feature-Flags, stabile Server-Action-IDs über Deploys
- [x] Healthcheck `/api/health`, strukturierte Logs ohne PII

### WP18 – Railway
- [x] Dockerfile, `railway.json`, Migration im Pre-Deploy
- [x] Services: `web`, `worker`, `Postgres`, `Bucket`
- [x] Doku Backup/Restore (`docs/OPERATIONS.md`)

### WP19 – iOS (Schlussphase) 🍎
- Expo Router, native Tabs, Kamera/Fotoauswahl, Push, Keychain-Sessions, StoreKit-Prüfung für digitale Käufe

---

## 3. Abnahme (PRD §31.4) – Nachweis

| # | Kriterium | Nachweis |
|---|---|---|
| 1 | Registrierung/Login zuverlässig | `server/identity`, Tests |
| 2 | Berechtigungen serverseitig | `server/authz.ts`, jede Action prüft |
| 3 | Öffentlich/Privat getrennt | `visibility`-Filter zentral in Queries |
| 4 | Kein Datenverlust | Transaktionen, Zod-Validierung |
| 5 | Feed performant | Indizes, Cursor, Kandidaten-Limit |
| 6 | Moderation funktionsfähig | `/admin/moderation` |
| 7 | Blockieren | `UserBlock` wechselseitig in allen Queries |
| 8 | Kein Kauf nicht verfügbarer Ware | Reservierung in Transaktion |
| 9 | „Bezahlt“ nur nach Provider-Event | `payments/webhook` |
| 10 | Verkäuferprozesse inkl. Fehler | Statusmaschine + Tests |
| 11 | Rechtstexte | Vorlagen, juristische Prüfung offen |
| 12 | iPhone & Desktop | Responsive Web jetzt, iOS-App Schlussphase |
| 13 | Backup/Restore | `docs/OPERATIONS.md` |
| 14 | Monitoring/Support | Healthcheck, Logs, Supportformular |
| 15 | Keine kritischen Sicherheitsfehler | CSP, CSRF (Server Actions + Origin-Check), Rate Limits |

## 4. Offene Produktentscheidungen (§35) – gewählte Defaults

| # | Frage | Default im Code |
|---|---|---|
| 1 | Name | „WERKRAUM“ (Arbeitstitel, zentral in `src/config/brand.ts`) |
| 3 | Alter | 18+ |
| 4 | Startkategorien | Häkeln/Stricken, Nähen hervorgehoben; alle 15 angelegt |
| 5 | Launch | Web-first, iOS danach |
| 6 | Payment | Stripe Connect |
| 8 | Provision | 6 % (Admin konfigurierbar) |
| 9 | Digital auf iOS | Deaktiviert bis Klärung |
| 10 | Startmarkt | Schweiz (CHF, de-CH) |
| 12 | Upload-Limits | Bild 15 MB, Video 200 MB / 3 min |

---

## 5. Umsetzungsstand (03.11.2026)

**Web: alle Arbeitspakete WP1–WP18 umgesetzt**, getestet mit Typecheck (0 Fehler), 32 Unit-Tests,
Produktions-Build und Browser-Durchläufen (alle öffentlichen, Mitglieder-, Studio- und Admin-Seiten → HTTP 200,
keine JS-Fehler) sowie End-to-End-Abläufen:

| Ablauf | Ergebnis |
|---|---|
| Registrierung → Onboarding → Feed | ✅ |
| Beitrag mit Foto (Upload → EXIF-frei → WebP-Varianten → Alt-Text) | ✅ |
| Frage auf Projekt, Meldung mit Fallnummer | ✅ |
| Kauf: Warenkorb → Kasse → Zahlung (simuliert) → Bestellung „Neu“, Provision 6 % | ✅ |
| Einzelstück nach Kauf nicht erneut kaufbar | ✅ |

**Bewusst offen / vor Launch zu erledigen**

- Stripe-Schlüssel und Webhook-Secret in Railway setzen (bis dahin ist der Kauf im Produktionsmodus deaktiviert).
- `RESEND_API_KEY` für echte E-Mails; Apple-Login-Schlüssel.
- Rechtstexte juristisch prüfen (Platzhalter `[Firma]`, `[Adresse]`).
- Video-Transkodierung (ffmpeg-Worker) – Videos werden derzeit unverändert ausgeliefert.
- **iOS-App: Schlussphase** (WP19).
