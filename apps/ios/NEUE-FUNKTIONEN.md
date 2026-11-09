# Übergabe: neue Web-Funktionen für die iOS-App

Stand: 9. November 2026. Diese Funktionen sind im Web fertig, getestet (Playwright) und live.
Die Mobile-API dafür existiert bereits. In der App fehlen die Oberflächen.
Für alle Endpunkte gilt: `/api/v1/app/*`, Antwort `{ data }`. Pfade unten **ohne** `/api/v1/app`.
Routentabelle: `apps/web/src/server/mobile/routes/*.ts`. Das Web-Gegenstück zeigt jeweils, wie es aussehen soll.

Arbeitsregeln wie in `DEVGUIDE.md`: nur in `Features/<Bereich>/`, Designsystem verwenden, Schweizer Schreibweise.

---

## 1. Materialien: Bestand („Habe ich schon“) und Preisvergleich — Bereich `Projects` oder `Me`

Web: `/materialien/[slug]` (Detail), `/materialien/bestand`, Projektseite → „Material & Werkzeug“.

| Methode | Pfad | Body | Antwort |
|---|---|---|---|
| GET | `/materials/:slug` | – | `{ material, offers, projects }` |
| PUT | `/materials/:id/stock` | `{ have: Bool }` (ID, nicht Slug) | `{ have, id }` |
| GET | `/me/material-stock` | – | `[StockEntry]` |
| POST | `/me/material-stock` | `{ materialId? , name?, quantity?, note? }` | `{ id }` |
| PATCH | `/me/material-stock/:id` | `{ quantity?, note? }` | `{ ok }` |
| DELETE | `/me/material-stock/:id` | – | `{ ok }` |
| POST | `/shopping-list-items/:id/to-stock` | – | `{ id }` (gekaufte Position → Bestand) |
| POST | `/shopping-lists/add-source` | `{ kind: "PROJECT"\|"TUTORIAL"\|"MATERIAL", id, listId?, newTitle? }` | `{ listId, added, merged, alreadyHave }` |

**`material`:**
- Felder: `id, slug, name, type, unit, brand?, productRef?, notes, safetyInfo, properties{}, category{slug,name}, usedIn`.
- `stock`: `{id, quantity, note}` oder `null`.
- `related`: `[{slug,name,type}]`.

**`offers[]`:**
- Felder: `id, retailer, title, priceMinor, currency, packLabel, isAffiliate, checkedAt, stale, perUnit {minor,label}?, href`.
- Bereits sortiert: günstigster Preis je Einheit zuerst.

**Preisvergleich (rechtlich wichtig):**
- Angebote mit `isAffiliate == true` **sichtbar als „Partnerlink“ kennzeichnen** und unter der Liste den Hinweis anzeigen: „Mit ‚Partnerlink‘ markierte Links sind Werbung: Kaufst du darüber, erhält Werkuno eine kleine Provision – der Preis bleibt für dich gleich.“
- Immer das „Stand“-Datum zeigen (`checkedAt`); bei `stale == true` in `.warn`.
- „Zum Shop“ öffnet `APP_URL + href` (`/go/:id`, zählt den Klick und leitet weiter) mit `openURL` oder SFSafariViewController. **Nicht** direkt die Händler-URL öffnen.
- Erstes Element mit Pill „Günstigster“, wenn mehr als ein Angebot vorhanden ist.

**Bestand:**
- „Habe ich schon“: Toggle-Kapsel, aktiv in `.moss`.
- „Mein Bestand“: Liste gruppiert nach `category.name`, freie Einträge unter „Eigene Einträge“. Menge und Notiz inline bearbeitbar, Wischen zum Entfernen.
- Projektseite: Bei angemeldeten Personen pro Materialzeile markieren, was im Bestand ist. Kopfzeile: „2 hast du schon, 3 fehlen“. Dafür einmal `/me/material-stock` laden und über `materialId` bzw. den Namen (ohne Gross-/Kleinschreibung) abgleichen.
- Einkaufsliste: Bei gekauften Positionen eine Aktion „In den Bestand übernehmen“ (`to-stock`). Beim Übernehmen einer Materialliste den Wert `alreadyHave` zeigen („3 hast du schon im Bestand – als ‚Habe ich‘ markiert“).

## 2. Bewertungen im Profil — Bereich `Social` (Profil)

`GET /users/:handle` liefert neu:
- `reviews: { given, received, show, defaultView: "received"|"given" }`. Den Abschnitt nur zeigen, wenn `show` (Shops immer, sonst nur, wenn die Person selbst bewertet hat).
- `awards: [{ id, place, title, href, community, date }]`, siehe Abschnitt 4.

`GET /users/:handle/reviews?view=received|given` gibt `{ view, items, distribution }` zurück.
- `items[]`: `productRating, sellerRating?, body, sellerReply?, createdAt, orderItem{variantName}, product{title,slug,coverUrl,shop{slug,name}}, author{profile{handle,displayName,avatarUrl}}`.
- `distribution` gibt es nur bei „received“: `[{stars, n}]` für 5…1.
- Web: Tab „Bewertungen“ im Profil mit Umschalter „Erhalten / Abgegeben“ und Sterne-Balken.

## 3. Koautor:innen bei Beiträgen — Bereich `Social`

- `PostItem.coauthors: [{id, handle, displayName, avatarUrl}]` (nur bestätigte). Kopfzeile: „Lena Brunner mit Mattia Rossi“.
- Beim Erstellen: `POST /posts` mit `coauthors: ["handle", …]` (max. 3). Bei Entwürfen wird die Einladung beim Veröffentlichen verschickt.
- Vorschläge: `GET /me/coauthor-candidates` (Personen, denen man folgt, und Follower).

Verwalten (eigener Beitrag):

| Methode | Pfad | Body / Hinweis |
|---|---|---|
| GET | `/posts/:id/coauthors` | Status `QUEUED`/`PENDING`/`ACCEPTED` |
| POST | `/posts/:id/coauthors` | `{ handles: [...] }` |
| DELETE | `/posts/:id/coauthors/:userId` | – |

Als eingeladene Person:

| Methode | Pfad | Body / Hinweis |
|---|---|---|
| GET | `/me/coauthor-invites` | – |
| POST | `/posts/:id/coauthors/respond` | `{ accept: Bool }` |
| DELETE | `/posts/:id/coauthors/me` | Austreten |

- Benachrichtigungen: `type: "MENTION"` mit `data.kind == "coauthor_invite"` bzw. `"coauthor_accepted"`. Ziel ist `data.href`.

## 4. Wettbewerbe — Bereich `Social` (Communities)

Web: `/wettbewerbe`, `/c/[slug]/wettbewerbe/[id]`.

| Methode | Pfad | Body / Hinweis |
|---|---|---|
| GET | `/competitions` | Übersicht: laufend, Abstimmung, abgeschlossen |
| GET | `/competitions/:id` | Phase, Regeln, Einreichungen, eigene Stimmen, Ergebnis |
| GET | `/competitions/:id/project-options` | eigene Projekte zum Einreichen |
| POST | `/competitions/:id/entry` | `{ projectId, note? }` |
| DELETE | `/competitions/:id/entry` | zurückziehen |
| POST | `/competition-entries/:id/vote` | `{ on: Bool }`, max. 3 Stimmen |
| POST | `/competitions/:id/results` | Leitung, Jury-Modus: `{ places: [{ entryId, place }] }` |
| DELETE | `/competition-entries/:id` | Leitung: entfernen |

- Gewinner-Abzeichen im Profil: `awards` aus `/users/:handle` (Platz 1–3, Titel, Community, Link).

## 5. Creator Pro — Bereich `Me` (Studio)

- `GET /studio/pro` liefert `{ status, prices, enabled, featuredProjectIds, mediaKitPublic, mediaKitUrl, featuredMax }`.
- `PUT /studio/pro/featured` mit `{ ids }`, `PUT /studio/pro/media-kit` mit `{ public }`, `POST /studio/pro/cancel` mit `{ cancel }`.
- Profil: `profile.isCreatorPro` zeigt das Pro-Zeichen neben dem Namen.

> **⚠️ App-Store-Regel:** Creator Pro ist ein digitales Abo. Nach App Review Guideline 3.1.1 darf es in der iOS-App **nur über In-App-Kauf (StoreKit)** verkauft werden.
> - **Empfehlung für Version 1:** In der App nur Status, Vorteile und Verwaltung zeigen, ohne Kaufen-Button und ohne Link zum Web-Checkout.
> - Also `POST /studio/pro/checkout` in iOS nicht verwenden. Wer im Web abschliesst, ist in der App automatisch Pro.
> - StoreKit wäre ein eigenes Projekt (Produkt in App Store Connect, Server-Abgleich über App Store Server Notifications).
>
> Dasselbe gilt sinngemäss für **digitale Marktplatz-Produkte** (Schnittmuster, Anleitungen als PDF): vor dem Einreichen klären, ob der Kauf in der App angeboten werden darf.

## 6. Auszahlungen — Bereich `Me` (Studio → Einnahmen)

| Methode | Pfad | Body / Hinweis |
|---|---|---|
| GET | `/studio/payouts` | Guthaben (verfügbar / unterwegs), Rhythmus, Bankkonto (maskiert), Verlauf |
| POST | `/studio/payouts` | `{ amountMinor? }`; ohne Betrag = gesamtes verfügbares Guthaben |
| PUT | `/studio/payouts/schedule` | `{ interval: "manual"\|"daily"\|"weekly"\|"monthly", … }` |
| POST | `/studio/payouts/bank-link` | `{ url }`: Stripe-Seite zum Ändern des Bankkontos im Browser öffnen |

- Benachrichtigung bei jeder Auszahlung: `type: "ORDER_STATUS"`, `data.kind == "payout"`.

## 7. Teilen

- Web hat ein eigenes Teilen-Menü. In iOS **`ShareLink`** mit der absoluten URL verwenden; das ist auf iPhone die richtige Lösung (WhatsApp, Nachrichten, Instagram usw. kommen vom System).

## 8. Push (APNs)

- Server-Seite fertig (`apps/web/src/server/push/apns.ts`, Worker-Queue `push.deliver`).
- Es fehlen nur die Railway-Variablen `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY` (.p8 als eine Zeile mit `\n`) und `APNS_BUNDLE_ID=ch.werkuno.app`. Gesetzt werden sie beim **web**- und **worker**-Service.
- Den Schlüssel erstellst du im Apple Developer Account → Keys → „Apple Push Notifications service“.
- Browser-Push (Web Push) betrifft die App nicht.

## 9. E-Mail-Adresse ändern — Bereich `Me` (Einstellungen → Konto)

Web: `/einstellungen/konto` → „Adresse ändern“.

| Methode | Pfad | Body | Antwort |
|---|---|---|---|
| POST | `/me/email` | `{ email, password }` | `{ email, message }` |

- Umgestellt wird erst, wenn der Link in der Mail an die **neue** Adresse geöffnet wird (Webseite `/e-mail-bestaetigen/…`). Die App zeigt nur die `message`.
- Konten ohne Passwort (nur Apple) bekommen 422 mit `fields.password` – Hinweis „zuerst Passwort festlegen“ anzeigen.

## 10. Geänderte Fehlercodes der App-Schnittstelle (Paket L)

- Ungültiges JSON bzw. kein Objekt als Body → **400**; falsche Feldtypen → **422** mit `fields`.
- Unbekannte Methode auf bestehendem Pfad → **405** (Header `Allow`).
- Nicht gefundene Einträge (Projekt, Anleitung, Beleg, Einspruch, Editor mit `?id`) → **404** statt `data: null`.
- `take`/`limit` werden auf 1…50 (bzw. die jeweilige Obergrenze) begrenzt, `page` auf 1…500.
- Profile gebannter/gelöschter Konten → 404; bei Blockierung leere Listen.
- Gesperrte Verkäufer:innen können `/studio/orders/*` weiterhin nutzen (bestehende Bestellungen abwickeln).
