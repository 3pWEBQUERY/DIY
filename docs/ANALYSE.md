# Werkuno – Gesamtanalyse (Stand 09.11.2026)

Vollständige Prüfung von Web-App, Mobile-API, Worker, Datenbank, Infrastruktur und iOS-App.
Pfade relativ zu `apps/web/src/`, sofern nicht anders angegeben.
**Schwere:** 🔴 kritisch · 🟠 hoch · 🟡 mittel · ⚪ niedrig. Alle Befunde wurden am Code nachvollzogen; „(p)“ = plausibel, Auslösung nicht live geprüft.

## 0. Automatische Prüfungen

| Prüfung | Ergebnis |
|---|---|
| `pnpm -r typecheck` | ✅ 0 Fehler |
| `pnpm -r test` | ✅ 21 Dateien, 113 Tests grün |
| `pnpm build` | ✅ erfolgreich. Aber `/richtlinien/marktplatz` wird **statisch vorgerendert** und liest dabei die Provision aus der DB (siehe C-15) |
| Schema ↔ Migrationen | ✅ Spalten, Constraints und Enums stimmen überein. Nur die Raw-SQL-Indizes fehlen im Schema (siehe I-6) |

Fazit: Der Code ist sauber typisiert und gut getestet. Die Probleme liegen in **Konfiguration/Deploy**, **Kontosicherheit**, **Geldflüssen in Sonderfällen** und am **API-Vertrag mit der iOS-App**.

---

## Bearbeitungsstand

| Befund | Status |
|---|---|
| I-1 Demo-Konten in Produktion | ✅ `SEED_DEMO=false` in Produktion. Der Seed sperrt in Produktion Demo-Logins mit Standardpasswort, die Inhalte bleiben |
| I-3 Standard-Superadmin | ✅ In Produktion ohne `ADMIN_PASSWORD` wird kein Konto angelegt. Ein bestehendes Konto mit Standardpasswort wird gesperrt bzw. auf `ADMIN_PASSWORD` umgestellt |
| I-2 Worker ohne Mail-/Stripe-Schlüssel | ✅ IaC ergänzt. Mails bleiben ohne Schlüssel offen statt verloren. Pro-Abos gelöschter Konten werden nicht mehr fälschlich als beendet markiert, die Kündigung holt `pro.sync` nach |
| F-1 Rechtstexte | 🟡 Angaben zentral in `apps/web/src/config/legal.ts`. Solange sie unvollständig oder ungeprüft sind: `noindex` und keine Aufnahme in die Sitemap. **Die Firmendaten fehlen noch** |
| M-1 iOS-Repost | ✅ Server liefert `author.id`. Die App dekodiert den Repost zusätzlich tolerant |
| A-1 Kontoübernahme nach Apple-Anmeldung | ✅ Offene Links und Push-Geräte werden bei der Übernahme entwertet |
| D-1 Audit-Kette meldet immer „gebrochen“ | ✅ Prüfung hasht dieselben Felder wie beim Schreiben, mit Regressionstest |
| I-5 Audit-FK `SetNull` vs. Trigger | ✅ `RESTRICT` (Migration `20261118120000`). Konten mit Audit-Einträgen werden nie hart gelöscht |
| S-1 Einspruch gebannter Konten | ✅ Signierter Einspruchs-Link in der Moderationsmail (nur dieser Fall, ohne Anmeldung) |
| C-1 Chargeback ohne Rückholung | ✅ Transfer-Reversal (anteilig, idempotent je Streitfall). Fehler werden in der Fehlerüberwachung gemeldet |
| C-2 Gesperrte Shops | ✅ Zahlung auf gesperrten Shop bzw. gebanntes Konto → automatische Vollerstattung. „Erstatten“ für ADMIN unter Transaktionen. Bei einer Sperre werden die Stripe-Auszahlungen angehalten |
| C-3 Erlös ohne Haltefrist | ✅ Haltefrist: Erlös wird 3 Tage nach Abschluss der Bestellung auszahlbar. Automatischer Abschluss 14 Tage nach Versand. Werkuno führt den Auszahlungsplan aus (Stripe „manuell“). Problem- und Streitfälle bleiben zurückgehalten. Erlass je Shop durch die Administration. Beide Werte in den Systemeinstellungen |
| P-1 Medien-Route im RAM | ✅ Streaming, Range-Requests (206/416), ETag-Prüfung vor dem Laden |
| D-2 Demo-Purge | ✅ Vorprüfung auf echte Daten (Abbruch ohne Löschen), eine Transaktion, auditierte Demo-Konten bleiben |
| D-3 Moderation macht Privates öffentlich | ✅ Sichtbarkeit nur einschränkbar |
| F-2 Landing zeigt gebannte Konten | ✅ Nur aktive Konten, keine archivierten Projekte |
| F-3 „Erstellen“ ohne Namen | ✅ `aria-label` |
| I-4 Outbox-Retry 30 s | ✅ Backoff 10 s … 6 Std., 20 Versuche, Alarm beim Aufgeben (Migration `20261118130000`) |
| C-6 / M-5 Digitale Käufe in iOS | ✅ Server sperrt digitale Produkte im App-Warenkorb und an der App-Kasse (`commerce.digitalEnabledIos`). Die App zeigt keine Hinweise mehr auf den Kauf im Web |
| M-2 iOS-Kasse ignoriert Adresse | ✅ Sendet `details` (+ `shipToOther`/`address`), Formular aus gespeicherten Angaben vorbefüllt – **Xcode-Build ausstehend** |
| M-3 iOS-Login mit 2FA | ✅ Code-Schritt (TOTP/Wiederherstellungscode) für Passwort- und Apple-Login – **Xcode-Build ausstehend** |
| M-4 iOS-Downloads | ✅ Download mit Token, Anzeige über QuickLook/Teilen – **Xcode-Build ausstehend** |
| **Mittlere Befunde** | |
| A-2 … A-10 Konto & Anmeldung | ✅ Erneute Anmeldung (Passwort bzw. Apple) für 2FA, erstes Passwort und Konto löschen. 2FA wird je Sitzung geprüft (`Session.mfaVerifiedAt`), Rollenrechte nur mit bestätigter Sitzung. `securityReset` bei Passwortwechsel und -reset. Login-Limits je IP. Neue-Geräte-Warnung korrigiert. 18+ serverseitig erzwungen (Schreibaktionen, App-API). Onboarding mit Handle-Limit und Prüfung des eigenen Avatars. Projekt-API mit denselben Sichtbarkeitsregeln wie Web und App. Apple: Nonce-Prüfung, Refresh-Token und Widerruf bei Kontolöschung |
| S-2 … S-8, S-10, S-14, S-15 Social | ✅ Erlaubte Zieltypen zentral. Ausgeblendete Communities geschützt. Kommentare gebannter Konten ausgeblendet. Zahlungswarnung robust (ß, Zero-Width-Zeichen, IBAN mit Prüfziffer). Kommentar-Pagination. Gesperrte Mitglieder können nicht bearbeiten. Erwähnungen nur an Berechtigte. Unread-Badge, Kommentarzähler und Trends korrigiert |
| P-2 … P-15 Inhalte & Medien | ✅ HEIC über libheif (WASM). Aufrufe mit Dedupe und Bot-Filter. Moderationssperre für Kommentare eigene Spalte. Sichere interne Links. Video-Verarbeitung streamend. Sammlungen ohne N+1. Blog-Limit. Löschen trotz Moderation gesperrt. `/track` prüft die Sichtbarkeit. Materialzähler nur öffentlich |
| D-4 … D-13 Administration | ✅ Ausblenden und Wiederherstellen stellt den vorherigen Zustand her. Materialien: Löschschutz, Zusammenführen hängt Bestand und Angebote um. Letzte Superadministration per Lock geschützt. Keine Selbstbegünstigung in Communities. E-Mail manuell bestätigen nur durch die Superadministration. Browser-Fehler ohne Alarmflut. Flags für Gäste. `Object.hasOwn`. Pro/Rollen nicht für gesperrte Konten |
| I-6 … I-19 Infrastruktur | ✅ Schema bildet GIN-, Trigram- und Teilindizes ab (Drift leer). CI prüft Migrationsreihenfolge und Drift. Outbox-Claims gegen doppelte Verarbeitung bei mehreren Workern, Push-Claim. Kontolöschung in eigener Queue. Sauberes Herunterfahren, `exec next start`. Fehlende IaC-Variablen. Env-Prüfung beim Start. Cleanup-Indizes. E2E-Schutz. **I-8 (Produktions-Branch) ist eine Entscheidung der Betreiber** |
| C-4, C-5, C-7, C-8, C-15 Marktplatz | ✅ Gescheiterte verzögerte Zahlungen werden storniert. Preise in der Shopwährung. Kein doppeltes Pro-Abo. Erstattungs-Timeout ohne Doppelerstattung. Provision live aus den Einstellungen |
| F-4 … F-6 Frontend | ✅ Netz- und Serverfehler an rund 110 Aufrufstellen als Meldung statt Fehlerseite. Feldrahmen mit Kontrast ≥ 3:1. Sitemap in Teile aufgeteilt |
| M-7 … M-18 iOS | ✅ Feature-Flags, Offline-Start, Gruppenchats (lesen), `stockBase`, Zahlen-Absturz, Apple-Nonce und Autorisierungscode, Umfragen, App-Badge, Fallnummer, Kontolöschung, Daten beim Abmelden, Debug-Funktionen nur im Debug-Build – **Xcode-Build ausstehend** |
| **Niedrige Befunde** | |
| A-11 … A-17, D-11, D-14 | ✅ 2FA-Sperre je Herkunft (bekannte Geräte nie ausgesperrt). Reset ohne Timing-Leck. Atomare Token. JSON-Body 400 statt 500. SSE prüft die Sitzung. P2002 → 409. Apple-Callback mit Statusprüfung. Shop-Entscheid bedingt. Audit-Kette mit HMAC (`AUDIT_HMAC_KEY`), Prüfpunkten und inkrementeller Vollprüfung |
| C-9 … C-14, I-17 | ✅ Fehlgeschlagene Erstattung nach Erfolg wird zurückgebucht. Reservierungen beim Bearbeiten geschützt. Lizenz nach Klärung der Betragsabweichung. Connect-Status ohne Herabstufung. Bestand bei Vollerstattung vor dem Versand zurück (genau einmal). Worker-Stapel reihum. Simulations-Kasse zur Laufzeit statt Build, E2E-Test prüft die Seite echt |
| S-9 … S-17 | ✅ Feed-Cursor ohne Duplikate und Lücken. Realtime in Blöcken unter 8 kB. Wettbewerbsstimmen nur von aktiven Mitgliedern. Gebündelte Pushes höchstens alle 30 Min. Kontaktanfrage-Limit mit Lock. Kommentieren in Anfrage- bzw. privaten Communities nur für Mitglieder |
| P-9 … P-18 | ✅ Benachrichtigungs-Fan-out im Worker, Doppelklick-Schutz. `project_published` genau einmal. Eingefrorene leere Medien-URLs werden nachgetragen. Medienverwendung exakt, Freigabe beim Löschen. Validierung statt 500. Slug-Kollision mit Wiederholung. Kein FAILED über READY. Private Medien `private` gecacht. ffmpeg nur mit lokalen Dateien und erlaubten Formaten |
| F-7 … F-18 | ✅ Zeitzonen und Hydration. Abschaltbare Tastenkürzel plus „?“-Übersicht. Zähler im zugänglichen Namen. Kontraste ≥ 4.5:1. Three.js aufgeräumt, reduzierte Bewegung beachtet. 404 mit `main`. Öffentliche Kontaktseite `/kontakt`. Ladeleiste über Router-Ereignis. ARIA-Muster korrigiert. Fokus-Rückgabe in Dialogen. Marke über `BRAND`, Manifest ergänzt (maskierbares Icon fehlt noch als Grafik) |
| I-14, I-16, I-20 | ✅ Seed überschreibt keine Kategorienamen. Doku korrigiert. Kritische Pakete fest gepinnt. CI baut das Docker-Image (lokal nicht testbar). Apple-Variablen auch im Worker |
| M-19, M-20 + Folgen | ✅ Video-Upload aus Datei mit `durationSec`. Ein Fenster pro App. Apple-Bestätigung für Konten ohne Passwort. Kommentar-Pagination – **Xcode-Build ausstehend** |
| M-6 PrivacyInfo.xcprivacy | ✅ Manifest angelegt und in `project.yml` eingebunden – Angaben mit App Store Connect abgleichen |

## 1. Sofort beheben (vor dem Launch)

1. 🔴 **Demo-Konten mit öffentlichem Passwort in Produktion.** `.railway/railway.ts:39` setzt `SEED_DEMO: "true"` für alle Umgebungen, und `predeploy` seedet bei jedem Deploy.
2. 🔴 **Superadmin mit bekanntem Standardpasswort.** Fehlt `ADMIN_PASSWORD`, legt `prisma/seed.ts:84` `Werkraum-Admin-2026!` an, ohne Prüfung auf Produktion.
3. 🔴 **Worker ohne `RESEND_API_KEY`/`STRIPE_SECRET_KEY`** in der IaC (`railway.ts:48-62`). Mails werden als „versendet“ markiert und gehen endgültig verloren (`server/notifications-mail.ts:120`). Pro-Abos gelöschter Konten werden bei Stripe nicht gekündigt (p, falls die Keys nicht manuell gesetzt sind).
4. 🔴 **Rechtstexte voller Platzhalter** (`[Firma]`, `[Adresse]`, `UID [CHE-xxx]`, Gerichtsstand `[Ort]`), mit Entwurfs-Banner, aber in der Sitemap und indexierbar.
5. 🔴 **iOS: Ein einziger Repost legt alle Feeds lahm.** `RepostRef.author` verlangt `id`, der Server liefert keine (`ios/…/Models/Common.swift:141` ↔ `server/social/posts.ts:99`).
6. 🟠 **Kontoübernahme über einen alten E-Mail-Änderungs-Link** nach der Apple-Übernahme eines unbestätigten Kontos (`server/identity/apple.ts:52`: offene `verificationToken` werden nicht gelöscht).
7. 🟠 **Audit-Kette meldet immer „gebrochen“.** `verifyAuditChain` hasht `id/seq/hash/prevHash` mit (`server/audit.ts:64`).
8. 🟠 **Verlorene Chargebacks werden nicht beim Verkäufer zurückgeholt.** Es gibt kein `transfers.createReversal` (`server/commerce/payments.ts:353`).
9. 🟠 **Gesperrte/gebannte Shops:** Bezahlte Bestellungen lassen sich weder vom Shop noch vom Admin erstatten. Zahlungen laufen weiter ein.
10. 🟠 **Gebannte Konten können keinen Einspruch einlegen.** `getSession` gibt bei BANNED `null` zurück, `/einspruch` leitet auf den Login um (DSA Art. 20).
11. 🟠 **Medien-Route lädt Dateien komplett in den RAM**, ohne Range-Requests (`app/media/[...key]/route.ts`). Das kann bei Videos bis 1 GB den Server per OOM abstürzen lassen, und auf iOS/Safari spielen Videos nicht ab.
12. 🟠 **iOS: Kasse ignoriert die eingegebene Lieferadresse.** Die App sendet `address`, der Server bevorzugt die gespeicherten `details`.
13. 🟠 **iOS: Konten mit 2FA können sich nicht anmelden.** `mfaRequired` wird nicht ausgewertet, der Token wird still verworfen.
14. 🟠 **iOS: `PrivacyInfo.xcprivacy` fehlt**, ohne die nimmt der App Store die App nicht an (ITMS-91053). Dazu das Risiko unter Guideline 3.1.1 für digitale Käufe (siehe M-5).
15. 🟠 **Demo-Purge löscht echte Daten** (Community-Posts, Gruppenchats, Bestellungen echter Käufer) und bricht wegen des Audit-Triggers mitten im Lauf ab.

---

## 2. Befunde nach Bereich

### 2.1 Infrastruktur, Deploy, Datenbank (I)

| # | | Stelle | Problem |
|---|---|---|---|
| I-1 | 🔴 | `.railway/railway.ts:39`, `package.json` predeploy | `SEED_DEMO=true` in Produktion. Die Bereinigung laut OPERATIONS.md wird beim nächsten `config apply` rückgängig gemacht |
| I-2 | 🔴 | `railway.ts:48-62` | Worker ohne Resend- und Stripe-Key → Mails endgültig verloren, Stripe-Sync, Erstattungen und Abo-Kündigung laufen ins Leere (p: falls nicht manuell gesetzt) |
| I-3 | 🔴 | `prisma/seed.ts:84` | Standard-Superadmin-Passwort ohne Abbruch in Produktion |
| I-4 | 🟠 | `worker/index.ts:78,280` | Outbox gibt nach 10 Versuchen à 3 s auf (≈30 s, kein Backoff, kein Alarm). Ein `UserDeleted`-Ereignis (DSG-Löschung) kann so endgültig verloren gehen |
| I-5 | 🟠 | `schema.prisma:1806` + Trigger `AuditEvent_immutable` | `onDelete: SetNull` ist ein UPDATE und vom Trigger verboten → Hard-Delete von Nutzer:innen mit Audit-Einträgen scheitert immer |
| I-6 | 🟡 | `schema.prisma` | GIN-, Trigram- und Mail-Queue-Indizes stehen nicht im Schema → das nächste `migrate dev` erzeugt 12 `DROP INDEX` und ein `DROP DEFAULT` auf generierten Spalten |
| I-7 | 🟡 | `prisma/migrations/2026111*` | Migrationen in die Zukunft datiert → neue Migrationen sortieren vor bereits angewendete |
| I-8 | 🟡 | `railway.ts:15` | Produktion deployt vom Feature-Branch, Staging von `main` (Promotion verkehrt herum). Kein „Wait for CI“ |
| I-9 | 🟡 | `worker/index.ts:64`, `push/service.ts:37` | Schutz vor Doppelverarbeitung nur pro Prozess. Während eines Deploys laufen zwei Worker → doppelter Fan-out und doppelte Pushes |
| I-10 | 🟡 | `worker/index.ts:87` | Head-of-Line-Blocking: `purgeDeletedAccount` läuft synchron im Dispatcher |
| I-11 | 🟡 | `worker/index.ts:285` | Herunterfahren wartet nicht auf laufende Ticks. `db.$disconnect()` läuft mitten in einen Dispatch (p) |
| I-12 | 🟡 | `railway.ts` | Es fehlen `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, `STRIPE_CONNECT_WEBHOOK_SECRET`, `MAIL_FROM`, `VAPID_*`, `APPLE_*` (p) |
| I-13 | ⚪ | `server/auth/totp.ts:87` | 2FA-Geheimnisse hängen an `SESSION_SECRET`. Eine Rotation sperrt alle 2FA-Konten aus, OPERATIONS.md warnt nicht davor. `env()` wird beim Start nicht validiert |
| I-14 | ⚪ | `prisma/seed.ts` | Der Seed überschreibt bei jedem Deploy die Namen der Materialkategorien |
| I-15 | ⚪ | `worker/index.ts:186` | Für Cleanup-Abfragen fehlen Indizes (`Notification.readAt`, `WebhookEvent.createdAt`, `Session.revokedAt`, `VerificationToken.expiresAt`) |
| I-16 | ⚪ | README, OPERATIONS.md | Doku widerspricht dem Code: Passwörter `Werkuno-…` vs. `Werkraum-…`, `Werkraum.xcodeproj` vs. `Werkuno`, „Seed einmalig“ vs. automatisch |
| I-17 | ⚪ | `e2e/commerce.spec.ts:33` | Die Simulations-UI ist im Build immer 404 (`NODE_ENV` eingebrannt). Der Test ist trotzdem grün |
| I-18 | ⚪ | `e2e/global-setup.ts` | Globale `DELETE`s, obwohl `E2E_BASE_URL` entfernte Ziele erlaubt → gefährlich gegen Staging/Produktion |
| I-19 | ⚪ | `worker/index.ts:190` | `optional()` schluckt Import-Fehler still |
| I-20 | ⚪ | CI, `package.json` | Kein Docker-Build und kein Drift-Check in CI. Caret-Ranges auf `next`, `prisma` und `pg-boss` |

### 2.2 Anmeldung, Konten, Mobile-API (A)

| # | | Stelle | Problem |
|---|---|---|---|
| A-1 | 🟠 | `server/identity/apple.ts:52`, `account/email-change.ts:336` | Nach einer Apple-Übernahme bleiben offene `EMAIL_CHANGE`-Links gültig → der Angreifer übernimmt das Konto |
| A-2 | 🟡 | `server/auth/mfa.ts:34`, `authz.ts:54` | 2FA-Einrichtung ohne erneute Anmeldung (Aussperrung mit gestohlener Sitzung). Alte Sitzungen bekommen Moderationsrechte, sobald 2FA aktiviert wird |
| A-3 | 🟡 | `identity/service.ts:145`, `account/service.ts:114` | Passwort-Reset und -Änderung widerrufen keine anderen offenen Links |
| A-4 | 🟡 | `identity/service.ts:166` | Apple-Konten ohne Passwort: `changePassword` setzt ohne Prüfung. `deleteAccount` verlangt keine erneute Anmeldung |
| A-5 | 🟡 | `identity/service.ts:82` | Kein Login-Limit je IP über alle Konten → Credential-Stuffing ungebremst |
| A-6 | 🟡 | `auth/session.ts:39` | Die Warnung bei neuem Gerät greift fast nie (grobes Label). Bei 2FA-Konten wird sie nie verschickt |
| A-7 | 🟡 | `app/api/v1/projects/by/[handle]/[slug]/route.ts` | Prüft weniger als Web und Mobile: Projekte gesperrter Konten bleiben abrufbar, private Originale werden über `remixOf` geleakt, Blockierte werden nicht gefiltert |
| A-8 | 🟡 | `identity/apple.ts:75` | 18+ wird für Apple-Konten nicht serverseitig erzwungen (`?tipp=aus` umgeht das Onboarding) |
| A-9 | 🟡 | `identity/onboarding.ts:195` | `completeOnboarding` ist wiederholbar: unbegrenzt Handles reservieren, fremde `/media/`-Avatare setzen |
| A-10 | ⚪ | `(onboarding)/willkommen/actions.ts:29` | Schnellbeitritt umgeht Rate-Limit, HIDDEN-Status und Blockierungen |
| A-11 | ⚪ | `auth/mfa.ts:79` | Fehlversuche zählen je Konto → wer das Passwort kennt, sperrt den Inhaber 24 h aus |
| A-12 | ⚪ | `identity/service.ts:136` | Konten über die Antwortzeit beim Passwort-Reset erkennbar (p) |
| A-13 | ⚪ | `identity/service.ts:116,147` | Token-Einlösung nicht atomar → Reset-Link doppelt einlösbar |
| A-14 | ⚪ | `server/api.ts:29` | JSON-Body `null` → 500 in mehreren v1-Routen |
| A-15 | ⚪ | `app/api/v1/stream/route.ts:13` | SSE-Stream läuft nach Sitzungswiderruf weiter |
| A-16 | ⚪ | `server/errors.ts:75` | Prisma P2002 wird nicht auf 409 abgebildet → Races ergeben 500 |
| A-17 | ⚪ | `api/auth/apple/callback/route.ts:35` | Kein Statuscheck → Gebannte landen ohne Hinweis wieder beim Login |
| A-18 | ⚪ | `identity/apple.ts:107` | Native Apple-Anmeldung ohne Nonce → abgegriffener Token wiederverwendbar (p) |

### 2.3 Marktplatz & Geld (C)

Ohne Befund: Rundung, Gebührenrechnung, atomare Bestandsführung, Webhook-Signatur und -Idempotenz, IDOR-Prüfungen, Preismanipulation.

| # | | Stelle | Problem |
|---|---|---|---|
| C-1 | 🟠 | `commerce/payments.ts:353` | Verlorener Streitfall: Die Plattform trägt den Verlust, der Verkäufer behält das Geld |
| C-2 | 🟠 | `commerce/orders.ts:168,217`, `payments.ts:55` | Gesperrter Shop: Bestellungen lassen sich nicht erstatten, auch nicht durch Admins. `markOrderPaid` prüft den Shop-Status nicht |
| C-3 | 🟠 | `commerce/stripe.ts:253` | Erlös sofort übertragen, ohne Haltefrist → „verkaufen, auszahlen, nie liefern“ |
| C-4 | 🟡 | `payments.ts:176,446`, `reservations.ts:447` | `async_payment_failed` storniert nie → Bestand dauerhaft reserviert |
| C-5 | 🟡 | `shops.ts:71`, `revenue.ts:380`, `kasse/page.tsx:53` | EUR-Produkte erlaubt, Shop und Summen fest auf CHF → falsche Beträge |
| C-6 | 🟡 | `server/settings.ts:10` | `commerce.digitalEnabledIos` wird nirgends geprüft → iOS kann digitale Produkte kaufen |
| C-7 | 🟡 | `pro/service.ts:157` | Mehrere offene Pro-Checkouts möglich → zwei Abos, Status überschreibt sich gegenseitig |
| C-8 | 🟡 | `payments.ts:220` | Timeout bei `createRefund` → zweite Erstattung möglich (p) |
| C-9 | ⚪ | `payments.ts:259` | `refund.failed` nach `succeeded` wird nicht verbucht |
| C-10 | ⚪ | `products.ts:363,390` | Produkt bearbeiten löscht Bestandszeilen samt offener Reservierungen |
| C-11 | ⚪ | `payments.ts:79,107` | Digitale Bestellung mit Betragsabweichung bekommt nie eine Lizenz |
| C-12 | ⚪ | `payments.ts:515` | Fallback setzt `chargesEnabled` fälschlich auf false |
| C-13 | ⚪ | `payments.ts:278` | Volle Erstattung vor dem Versand bucht keinen Bestand zurück |
| C-14 | ⚪ | `payments.ts:379`, `shops.ts:162`, `payouts.ts:314` | Worker-Stapel ohne Sortierung → ab 50 Fällen kommen neue nie dran |
| C-15 | 🟡 | `(legal)/richtlinien/marktplatz/page.tsx:11`, `agb/page.tsx:102`, `hilfe/page.tsx:61` | Provision auf der Richtlinienseite beim Build eingefroren (statisch), in AGB und Hilfe fest „6 %“ → widerspricht dem Admin-Wert |

### 2.4 Social, Communities, Nachrichten, Benachrichtigungen (S)

Ohne Befund: Umfragestimmen, Wettbewerbs-Stimmenlimit, Event-Kapazität, Rollenhierarchie, Abmeldetokens, Mail-Escaping.

| # | | Stelle | Problem |
|---|---|---|---|
| S-1 | 🟠 | `auth/session.ts:101`, `(app)/einspruch/[caseId]/page.tsx:20` | Gebannte Konten können keinen Einspruch einlegen |
| S-2 | 🟡 | `(app)/social-actions.ts:41-54` | Web-Actions akzeptieren jeden Zieltyp (USER, PRODUCT …) → unsichtbare Kommentare mit Push an das Opfer, umgeht `dmPolicy` |
| S-3 | 🟡 | `social/posts.ts:711` | Beiträge ausgeblendeter (HIDDEN) Communities bleiben erreichbar |
| S-4 | 🟡 | `social/interactions.ts:162` | Kommentare gebannter Konten bleiben sichtbar |
| S-5 | 🟡 | `messaging/service.ts:28` | Warnung vor Zahlungslinks umgehbar (`außerhalb` mit ß, IBAN klein, Zero-Width-Zeichen) |
| S-6 | 🟡 | `interactions.ts:163` | `take: 200` aufsteigend → neue Kommentare ab Nr. 201 unsichtbar |
| S-7 | 🟡 | `posts.ts:628` | In der Community Gebannte oder Stummgeschaltete können alte Beiträge weiter bearbeiten |
| S-8 | ⚪ | `posts.ts:550` | Erwähnungen ohne Prüfung von Sichtbarkeit und DM-Einstellung (bis 300 Pings/h) |
| S-9 | ⚪ | `posts.ts:489` | „Für dich“-Paginierung per Offset → Duplikate und Lücken |
| S-10 | ⚪ | `messaging/service.ts:171` | Unread-Badge zählt Chats mit Blockierten |
| S-11 | ⚪ | `notifications.ts:153`, `realtime/bus.ts:61` | Payload über dem `pg_notify`-Limit von 8 kB → Live-Updates bei großen Fan-outs gehen still verloren |
| S-12 | ⚪ | `communities/service.ts:593` | Wettbewerbsstimmen bleiben nach Bann oder Austritt gültig |
| S-13 | ⚪ | `notifications.ts:73` | Gebündelte Ereignisse lösen jedes Mal einen neuen Push aus |
| S-14 | ⚪ | `interactions.ts:136` | Kommentarzähler driftet beim Löschen von Eltern-Kommentaren |
| S-15 | ⚪ | `discovery/suggestions.ts:53` | „Trending“ ohne Filter auf Blockierte und Gebannte |
| S-16 | ⚪ | `messaging/service.ts:354` | Limit von 3 Nachrichten bei Kontaktanfragen per Race umgehbar (p) |
| S-17 | ⚪ | `interactions.ts:96` | Nichtmitglieder kommentieren in REQUEST-Communities (Designfrage) |

### 2.5 Inhalte & Medien (P)

Ohne Befund: IDOR-Prüfungen, XSS im Block-Renderer und JSON-LD, SVG-Ausschluss, EXIF-Entfernung, `/go/[id]`, Sitemap ohne Entwürfe.

| # | | Stelle | Problem |
|---|---|---|---|
| P-1 | 🟠 | `app/media/[...key]/route.ts:13`, `storage.ts:65` | Ganze Datei (dreifach) im RAM, keine Range-Requests, ETag erst nach dem Download geprüft |
| P-2 | 🟡 | `media/service.ts:12`, `media/process.ts:30` | HEIC wird angenommen, aber sharp kann es nicht dekodieren → iPhone-Fotos schlagen fehl |
| P-3 | 🟡 | `projects/service.ts:355`, `tutorials/service.ts:305`, `blog/service.ts:701` | Aufrufe ohne Dedupe und Bot-Filter → Statistiken beliebig aufblähbar |
| P-4 | 🟡 | `blog/service.ts:285` | Speichern überschreibt die Kommentarsperre der Moderation |
| P-5 | 🟡 | `lib/inline-marks.ts:18`, `components/blog/inline.tsx:19` | `/\evil.com` gilt als interner Link → Open Redirect bzw. Phishing ohne `nofollow` |
| P-6 | 🟡 | `media/video.ts:69`, `worker/index.ts:220` | Videos komplett im Worker-RAM → OOM bei parallelen Uploads von 1 GB (p) |
| P-7 | 🟡 | `collections/service.ts:74,181` | N+1-Abfragen: über 1000 Queries pro Aufruf einer großen Sammlung |
| P-8 | ⚪ | `blog/service.ts:218,340` | Kein Rate-Limit für Artikel |
| P-9 | ⚪ | `tutorials/service.ts:185`, `projects/service.ts:118` | Bis zu 2000 `notify` synchron in der Action → Timeout, danach doppelte Version |
| P-10 | ⚪ | `blog/service.ts:384,403` | Revision wiederherstellen bzw. endgültig löschen trotz HIDDEN/REMOVED → Moderation umgehbar, Beweise weg |
| P-11 | ⚪ | `worker/index.ts:95` | `project_published` doppelt gezählt oder ganz verloren |
| P-12 | ⚪ | `analytics/service.ts:136` | `/api/v1/track` prüft die Sichtbarkeit nicht und verrät, ob eine ID existiert |
| P-13 | ⚪ | `media/service.ts:149` | Medien im Zustand PROCESSING werden mit `url: null` eingefroren → Bild fehlt dauerhaft (p) |
| P-14 | ⚪ | `analytics/studio.ts:345` | Medien-Cleanup sieht nur die 300 neuesten Medien. `attachedAt` wird nie zurückgesetzt |
| P-15 | ⚪ | `materials/service.ts:340` | „Verwendet in“ zählt private Projekte mit |
| P-16 | ⚪ | `packages/shared/src/schemas.ts:149`, `mobile/routes/content.ts:115` | Validierungslücken → 500 statt 400 |
| P-17 | ⚪ | `media/process.ts:20` | Inline- und Worker-Verarbeitung im Race → fertiges Medium wird auf FAILED gesetzt (p) |
| P-18 | ⚪ | `app/media/[...key]/route.ts` | Private Medien mit `public, immutable` (1 Jahr) ausgeliefert. ffmpeg ohne `-protocol_whitelist` |

### 2.6 Administration & Audit (D)

Ohne Befund: Alle Admin-Actions prüfen `requireRole`.

| # | | Stelle | Problem |
|---|---|---|---|
| D-1 | 🟠 | `server/audit.ts:59,64` | Kettenprüfung immer „gebrochen“ (falsche Felder im Hash). Jede Prüfung schreibt zusätzlich `ok:false` ins Log |
| D-2 | 🟠 | `prisma/demo-purge.ts:34,83-99` | Löscht über Kaskaden echte Community-Posts, Gruppenchats und Bestellungen. Läuft ohne Transaktion und scheitert am Audit-Trigger |
| D-3 | 🟠 | `admin/content-detail.ts:357` | Moderatoren können private Inhalte auf PUBLIC stellen |
| D-4 | 🟡 | `admin/content.ts:132-146` | Ausblenden und Wiederherstellen veröffentlicht Entwürfe |
| D-5 | 🟡 | `admin/catalog.ts:107` | Material löschen oder zusammenführen vernichtet Nutzerbestände und Angebote (Cascade) |
| D-6 | 🟡 | `admin/users.ts:115` | Race: Zwei Superadmins stufen sich gleichzeitig herab → keiner bleibt übrig |
| D-7 | 🟡 | `admin/communities.ts:310-447` | Selbstbegünstigung: sich selbst die Community-Leitung übertragen, eigene Anfrage annehmen, eigenen Bann aufheben |
| D-8 | 🟡 | `admin/users.ts:182,223` | Der Superadmin-Vorbehalt für „direkt bestätigen“ ist über `verifyEmailManually` umgehbar |
| D-9 | 🟡 | `app/api/v1/errors/route.ts:14` | Fehler-Endpoint ohne Login erzeugt Admin-Alarme mit frei wählbarem Text (Phishing) |
| D-10 | ⚪ | `server/flags.ts:79` | Rollout unter 100 % schaltet das Flag für Gäste ab (z. B. `signup`) |
| D-11 | ⚪ | `admin/content.ts:264` | Race zwischen SUSPEND und APPROVE eines Shops (p) |
| D-12 | ⚪ | `admin/system.ts:48` | `key in SETTING_DEFAULTS` akzeptiert `toString` usw. → `Object.hasOwn` verwenden |
| D-13 | ⚪ | `pro/service.ts:371` | `targetType: "User"` statt `"USER"`. `changeRole` befördert auch gebannte Konten |
| D-14 | ⚪ | `server/audit.ts:17` | Hash-Kette ohne Schlüssel und Anker. Geprüft werden nur die neuesten Einträge |

### 2.7 Frontend, Barrierefreiheit, SEO, Recht (F)

Ohne Befund: tote Links, Markennamen in der UI, Skip-Link, `lang`, reduzierte Bewegung (CSS), Server-Imports im Client.

| # | | Stelle | Problem |
|---|---|---|---|
| F-1 | 🔴 | `(legal)/rechtliches/impressum`, `agb`, `datenschutz`, `components/legal/legal-doc.tsx:84` | Platzhalter, Entwurfs-Banner und „(Arbeitstitel)“ live und in der Sitemap |
| F-2 | 🟠 | `app/page.tsx:24-31` | Landing zeigt Projekte gebannter oder gelöschter Konten (Klick → 404) |
| F-3 | 🟠 | `shell/side-nav.tsx:355` | „Erstellen“ in der mobilen Navigation ohne zugänglichen Namen |
| F-4 | 🟡 | `lib/use-action.ts:31`, `pro/pro-controls.tsx` | Netzwerkfehler reißen die ganze Seite in die Error-Boundary, Eingaben gehen verloren |
| F-5 | 🟡 | `globals.css` (`line-strong`) | Rahmen von Formularfeldern mit Kontrast 1.5:1, gefordert sind 3:1 (WCAG 1.4.11) |
| F-6 | 🟡 | `app/sitemap.ts:23` | Kann das Limit von 50 000 URLs überschreiten, es gibt kein `generateSitemaps` |
| F-7 | ⚪ | `messages/thread-view.tsx:28,38`, `lib/utils.ts:137` | Zeitzonen- und Hydration-Fehler (UTC vs. Lokalzeit, `Date.now()` im Render) |
| F-8 | ⚪ | `shell/command-palette.tsx:52`, `side-nav.tsx:84` | Einzeltasten-Kürzel nicht abschaltbar (WCAG 2.1.4) |
| F-9 | ⚪ | `side-nav.tsx:158,306,363` | Anzahl Ungelesener für Screenreader unsichtbar |
| F-10 | ⚪ | `ui/chips.tsx:209`, `ui/misc.tsx:71` | Kontrast kleiner Texte 2.7–3.2:1 |
| F-11 | ⚪ | `landing/thread-story.tsx` | Materialien nicht freigegeben (`dispose`). Parallaxe trotz reduzierter Bewegung. `aria-live` spricht bei jedem Scrollen |
| F-12 | ⚪ | `app/not-found.tsx` | Ohne `<main id="main">` → Skip-Link ins Leere |
| F-13 | ⚪ | Impressum, `hilfe` | Support-Kontakt nur nach Anmeldung. Nach dem Login geht der Zielpfad verloren |
| F-14 | ⚪ | `shell/page-transition.tsx:33` | Ladeleiste hängt bei abgefangenen Klicks |
| F-15 | ⚪ | `ui/field.tsx:52` | `aria-describedby` zeigt auf ein Element, das nicht gerendert wird |
| F-16 | ⚪ | `shell/page.tsx:66`, `settings/feed-form.tsx:38`, `ui/misc.tsx:167` | Unvollständige ARIA-Muster (Tabs, Radiogruppen, `role="alert"` auf statischem Inhalt) |
| F-17 | ⚪ | `admin/offer-manager.tsx:101` u. a. | Fokus kehrt nach dem Schließen eines Dialogs nicht zurück (p) |
| F-18 | ⚪ | ~76 Stellen, `manifest.ts` | Marke fest codiert statt `BRAND`. „Fünfzehn Werkstätten“ statisch. Manifest ohne `id`/`lang`/maskable-Icon |

### 2.8 iOS-App (M)

| # | | Stelle (`apps/ios/Werkuno/…`) | Problem |
|---|---|---|---|
| M-1 | 🔴 | `Models/Common.swift:141` | Repost ohne `author.id` → Dekodierfehler, ganze Feed- und Profilseiten leer |
| M-2 | 🟠 | `Features/Market/CheckoutView.swift:66,270`, `MarketModels.swift:314` | Eingegebene Lieferadresse wird ignoriert, das Formular wird nie vorbefüllt |
| M-3 | 🟠 | `Core/APIClient.swift:294`, `Core/AppState.swift:130` | Login mit 2FA unmöglich (`mfaRequired` fehlt) |
| M-4 | 🟠 | `ProductDetailView.swift:172`, `OrderViews.swift:328` | Downloads öffnen in `SFSafariViewController` ohne Token → 401 |
| M-5 | 🟠 | `CheckoutView.swift:104`, `ProductDetailView.swift:177,409` | Digitale Güter per Stripe gekauft bzw. Verweis auf den Web-Kauf → App-Store-Guideline 3.1.1/3.1.3 |
| M-6 | 🟠 | (fehlt) | Kein `PrivacyInfo.xcprivacy` → Upload wird abgelehnt (ITMS-91053) |
| M-7 | 🟡 | `Core/AppState.swift:7` | Feature-Flags aus `/bootstrap` ignoriert → pausierter Markt bleibt sichtbar |
| M-8 | 🟡 | `Core/AppState.swift:118` | Start ohne Netz → App bleibt bis zum Neustart ohne Konto |
| M-9 | 🟡 | `Models/Common.swift:352`, `SocialModels.swift:136` | Gruppenchats erscheinen als DM, Systemhinweise als normale Blasen |
| M-10 | 🟡 | `ProductEditorSheet.swift:321` | Kein `stockBase` gesendet → überschreibt zwischenzeitliche Verkäufe |
| M-11 | 🟡 | `Core/Formatters.swift:22` | Absturz bei „inf“ oder sehr großen Zahlen in Preisfeldern |
| M-12 | 🟡 | `AuthFlowView.swift:140` | Kein Widerruf der Apple-Tokens bei Kontolöschung (Guideline 5.1.1(v)), kein Nonce |
| M-13 | 🟡 | `PostItem` | Umfragen in der App unsichtbar |
| M-14 | ⚪ | – | Badge auf dem App-Icon wird nie zurückgesetzt |
| M-15 | ⚪ | `SettingsViews.swift:1001`, `ThreeSceneView.swift` | Server-Umschalter: falsche Reihenfolge. Entwicklermenü und `isInspectable` auch im Release |
| M-16 | ⚪ | `Social.swift:227` | Fallnummer ist eine Zahl, gelesen wird ein String → „erfasst“ statt Nummer |
| M-17 | ⚪ | `SettingsViews.swift:444` | Nach der Kontolöschung erscheint „Sitzung abgelaufen“ statt der Erfolgsmeldung |
| M-18 | ⚪ | `SearchView.swift:38`, `ImageCache`, `MediaPicker.swift:53` | Daten bleiben nach dem Abmelden auf dem Gerät (Suchen, Bild-Cache, Export, Videos) |
| M-19 | ⚪ | Video-Upload | Datei komplett im RAM, `durationSec` wird nicht gesendet |
| M-20 | ⚪ | `UIApplicationSupportsMultipleScenes` | iPad-Fenster teilen sich einen Router (p) |

---

## 3. Ideen für Erweiterungen

Sortiert nach Nutzen für den Launch. ★ = Grundlage dafür ist schon im Code oder Datenmodell vorhanden.

### Vertrauen & Sicherheit
- **Erneute Anmeldung vor sensiblen Aktionen** (2FA, Passwort, E-Mail, Konto löschen) und Sitzungen mit Merkmal „2FA bestätigt“.
- **Passkeys/WebAuthn** als Login ohne Passwort bzw. als zweiter Faktor. 2FA-Verwaltung auch in der App.
- **Zentraler „Sicherheits-Reset“**, der Tokens, Sitzungen und Push-Geräte gemeinsam widerruft.
- **Echte Vier-Augen-Freigaben** (Antrag → Freigabe durch eine zweite Person, mit Ablaufzeit) für kritische Admin-Aktionen.
- **Verankertes Audit-Log** (HMAC plus externe Checkpoints, signierter Export).

### Marktplatz
- **Treuhand/Haltefrist:** Auszahlung erst nach Versand bzw. Erhalt plus X Tagen, automatischer Abschluss.
- **Admin-Werkzeuge für Geldfälle:** stornieren und erstatten, Auszahlungen bei Sperre pausieren, Transfer-Reversal bei Chargeback.
- **Rückgabe- und Widerrufsablauf** mit Rücksendung und wählbarer Rückbuchung des Bestands.
- **Versandprofile** (Land, Gewicht, „versandkostenfrei ab“) und **Rabattcodes** pro Shop.
- **PDF-Rechnungen mit MWST-Ausweis** für gewerbliche Verkäufer:innen.

### Projekte, Anleitungen, Materialien
- ★ **Ältere Anleitungsversionen ansehen** mit „Was hat sich geändert“ (Versionen sind schon eingefroren).
- ★ **Mitwirkende an Projekten** einladen und verwalten (Modell `ProjectContributor` existiert, es fehlt die UI).
- ★ **Downloads zu Anleitungen** (Schnittmuster, Pläne, STL) über das bereits vorhandene `TutorialAsset`.
- **Nachbau-Galerie an der Anleitung** mit Fotos statt nur einem Zähler, dazu Fragen pro Schritt.
- **Materialrechner:** Mengen skalieren, Einkaufsliste nach Händler gruppieren, Gesamtpreis.

### Community
- ★ **Kommentare bearbeiten** (`editedAt` existiert), Kommentar-Pagination, Sortierung „Neueste/Beste“.
- **@-Erwähnungen in Kommentaren** mit Autovervollständigung.
- **Auto-Moderation** (Wortfilter, Mindest-Kontoalter) und Weiterleitung von Meldungen an die Community-Moderation.
- **Event-Warteliste** mit automatischem Nachrücken und Check-in.
- **Threads abonnieren**, Wochen-Digest pro Community, eigene Push-Einstellungen pro Kanal.

### Erlebnis & Plattform
- **Dark Mode:** Die Tokens liegen schon sauber in `@theme`.
- **PWA-Offline-Modus** für Anleitungen und Einkaufslisten in der Werkstatt ohne Netz.
- **D-A-CH-Lokalisierung:** de-DE/de-AT-Formate, ß-Schreibung, EUR-Anzeige.
- **Tastenkürzel-Übersicht** („?“) mit Schalter zum Abschalten. Toasts mit „Rückgängig“.

### iOS-App
- **Universal Links** (Associated Domains + `apple-app-site-association`).
- ★ **Umfragen, Entwürfe, geplante Beiträge, Events und Gruppenchats**: Die Endpunkte existieren schon.
- **Push-Opt-in nach dem Onboarding** und Abgleich des Badges.
- **StoreKit** für Creator Pro und digitale Käufe.

### Betrieb
- **Getrennte Staging-Umgebung**, Demo-Daten nur dort, Seed-Guard in Produktion.
- **Worker-Heartbeat und Alarme** (Outbox-Rückstand, endgültig verworfene Events, ausstehende Mails), externes Uptime-Monitoring.
- **Backups außerhalb von Railway** mit automatisiertem Restore-Test.
- **CI-Guards:** Drift-Check, Reihenfolge der Migrationen, Docker-Build mit Smoke-Start, „Wait for CI“.
- **Externer Log-Drain/APM**: Die Fehlerüberwachung liegt heute in derselben DB.
