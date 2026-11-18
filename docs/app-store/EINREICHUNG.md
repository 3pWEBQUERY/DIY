# App Store – Einreichung Werkuno (iOS)

Stand: 18. November 2026. Alle Texte sind zum Kopieren in App Store Connect gedacht.
Zeichengrenzen von Apple sind jeweils angegeben und eingehalten.

---

## 0. Bevor du einreichst (Pflicht)

1. **PR #7 mergen und deployen.** Die App setzt die neuen Server-Funktionen voraus (Melden von
   Events/Wettbewerben/Gruppen, Creator-Pro-Abo über Apple, Sperre digitaler Stripe-Zahlungen in der App).
2. **Inhaltsfilter (Guideline 1.2).** Apple verlangt bei nutzergenerierten Inhalten ausdrücklich
   „eine Methode, anstössige Inhalte vor der Veröffentlichung zu filtern“. Melden, Blockieren und
   Moderation sind vorhanden – ein automatischer Wort-/Bildfilter **noch nicht**. Empfehlung: vor der
   Einreichung einbauen (siehe Abschnitt 9), sonst ist eine Rückfrage oder Ablehnung wahrscheinlich.
3. **Build in Xcode** (die App wurde ausserhalb von Xcode geändert und noch nicht kompiliert):
   ```bash
   cd ~/DIY-stories && git pull
   cd apps/ios && xcodegen generate
   ```
   In Xcode: Target „Werkuno“ → Signing & Capabilities → **Team** wählen (DEVELOPMENT_TEAM ist leer),
   „Automatically manage signing“ an. Einmal auf einem echten iPhone durchtesten (Abschnitt 8).
4. **Versionsnummer:**
   - Wurde 1.0.0 noch **nie freigegeben** (abgelehnt oder nie eingereicht): Version 1.0.0 lassen,
     nur die **Build-Nummer erhöhen** (`CURRENT_PROJECT_VERSION` in `apps/ios/project.yml` von 2 auf 3,
     danach `xcodegen generate`).
   - Ist 1.0.0 bereits im Store: `MARKETING_VERSION` auf **1.1.0**, Build-Nummer 1 (oder höher).
5. **Archivieren und hochladen:** Xcode → Product → Archive → Distribute App → App Store Connect.
   Push: Beim Export mit Distributionsprofil setzt Xcode `aps-environment` automatisch auf
   `production` – im Organizer unter „Entitlements“ kontrollieren.

---

## 1. App Store Connect – Einrichtung

### 1.1 Verträge
- **Business → Agreements:** „Paid Applications“ aktiv, Bank- und Steuerangaben vollständig.
  Ohne diesen Vertrag können In-App-Käufe nicht geprüft werden.

### 1.2 Server-Benachrichtigungen
- App → **App-Informationen → App Store Server Notifications**: **Version 2**
  - Produktions-URL: `https://werkuno.ch/api/webhooks/apple`
  - Sandbox-URL: `https://werkuno.ch/api/webhooks/apple`

### 1.3 In-App-Käufe: digitale Produkte (Verbrauchsartikel)
Für jede Preisstufe einen **Consumable** anlegen. Produkt-ID `ch.werkuno.app.digital.chf<Betrag>`,
Preis in CHF genau dieser Betrag (Liste: `APP_STORE_TIERS_CHF` in `apps/web/src/server/commerce/appstore.ts`):
1–20, 22, 25, 28, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 120, 150, 200.

| Feld | Wert (Beispiel CHF 13) |
|---|---|
| Referenzname | Digital CHF 13 |
| Produkt-ID | ch.werkuno.app.digital.chf13 |
| Anzeigename (de-CH, max. 30) | Digitales Produkt CHF 13 |
| Beschreibung (max. 45) | Download aus einem Werkuno-Shop |
| Review-Screenshot | Produktseite eines digitalen Produkts mit Kaufleiste |
| Hinweis für Review | siehe Abschnitt 5 (gleicher Text für alle Stufen genügt) |

### 1.4 Abo: Creator Pro (Auto-Renewable Subscription)
- **Abo-Gruppe:** Referenzname `Creator Pro`, Anzeigename (de-CH) „Creator Pro“
- Zwei Abos auf **derselben Stufe (Level 1)**:

| Feld | Monatlich | Jährlich |
|---|---|---|
| Referenzname | Creator Pro monatlich | Creator Pro jährlich |
| Produkt-ID | ch.werkuno.app.pro.monthly | ch.werkuno.app.pro.yearly |
| Laufzeit | 1 Monat | 1 Jahr |
| Preis (Vorschlag = Web) | CHF 9.00 | CHF 90.00 |
| Anzeigename (max. 30) | Creator Pro – monatlich | Creator Pro – jährlich |
| Beschreibung (max. 45) | Schaufenster, Medienkit, Jahresstatistik | Schaufenster, Medienkit, Jahresstatistik |

- Review-Screenshot: Bildschirm „Ich › Werkuno Studio › Creator Pro“ mit beiden Laufzeiten.
- **Wichtig:** Die erste Version eines Abos und neue In-App-Käufe müssen **zusammen mit der App-Version**
  eingereicht werden (in der Version unter „In-App-Käufe und Abos“ hinzufügen).

### 1.5 Prüfkonto (Pflicht)
Lege in der Produktion ein eigenes Konto an, z. B. `review@werkuno.ch` (kein Demo-Seed – der ist in
der Produktion aus). Für dieses Konto:
- E-Mail bestätigt, Alter 18+ bestätigt, **keine** Zwei-Faktor-Anmeldung (sonst kommt Apple nicht hinein).
- Ein **aktiver Shop** mit je einem physischen und einem digitalen Produkt (digitales Produkt mit Preis, z. B. CHF 10 → App-Preis CHF 13).
- Ein paar Projekte, ein Beitrag, Mitglied in einer Community, eine laufende Story.
- **Feature-Flags** (Admin → System) für alle eingeschaltet: `stories`, `marketplace`, `pro`
  (bzw. mindestens für das Prüfkonto). Sonst fehlen Funktionen, die Apple prüft (Guideline 2.3.1).
- Zahlungsmodus der Produktion `stripe` (nicht „simulated“), damit keine Testmodus-Knöpfe erscheinen.

---

## 2. App-Informationen (Store-Eintrag, Sprache Deutsch)

**Name** (max. 30): `Werkuno`

**Untertitel** (max. 30): `Projekte, Anleitungen, Markt`

**Werbetext** (max. 170, jederzeit änderbar ohne neue Prüfung):
```
Neu: Stories, Creator Pro und mehr Sicherheit. Teile, was gerade auf deiner Werkbank entsteht – mit Menschen, die genauso gerne mit den Händen arbeiten.
```

**Schlüsselwörter** (max. 100, Komma ohne Leerzeichen):
```
DIY,Handwerk,Häkeln,Stricken,Nähen,Holz,Basteln,Anleitungen,Projekte,Handmade,Upcycling,Werkstatt
```

**Beschreibung** (max. 4000):
```
Werkuno ist das soziale Netzwerk für Menschen, die mit den eigenen Händen erschaffen. Ob Häkeln, Stricken, Nähen, Holz, Garten, Elektronik oder Upcycling – hier zeigst du, woran du arbeitest, lernst von anderen und findest Menschen mit denselben Leidenschaften.

PROJEKTE MIT JOURNAL
Halte deine Projekte von der ersten Idee bis zum fertigen Stück fest: mit Fotos, Zwischenständen, Arbeitszeit, Material und auch dem, was nicht geklappt hat. Andere können dein Projekt nachbauen und ihre Version zeigen.

ANLEITUNGEN SCHRITT FÜR SCHRITT
Schreibe Anleitungen mit Schritten, Bildern, Material- und Werkzeuglisten oder folge den Anleitungen anderer – Schritt für Schritt abhaken inklusive.

STORIES
Zeig in Stories, was heute auf deiner Werkbank passiert – als Foto, Video oder Text. Stories sind 24 Stunden sichtbar; die schönsten behältst du als Highlights in deinem Profil.

COMMUNITIES, EVENTS UND WETTBEWERBE
Tritt Communities zu deinem Handwerk bei, tausche dich aus, triff andere an Events und miss dich in Wettbewerben mit Abstimmung oder Jury.

NACHRICHTEN
Schreibe anderen direkt oder in Gruppen – mit Bildern und Lesebestätigung.

MARKTPLATZ FÜR HANDMADE
Kaufe Handgemachtes direkt bei den Menschen, die es herstellen – oder eröffne deinen eigenen Shop. Digitale Produkte wie Anleitungen und Schnittmuster kaufst du in der App sicher über Apple.

MATERIAL IM GRIFF
Merke dir, was du schon zu Hause hast, übernimm Materiallisten aus Projekten und Anleitungen in deine Einkaufsliste und vergleiche Preise.

BLOG
Lies und schreibe längere Artikel über dein Handwerk – mit Bildern, Videos und eingebetteten Projekten.

CREATOR PRO (OPTIONAL)
Für alle, die mit ihren Projekten wachsen wollen: Schaufenster mit deinen besten Arbeiten im Profil, Medienkit für Kooperationen, Statistik über 12 Monate, längere Videos und eine tiefere Provision im Shop. Pro kauft keine Reichweite – bezahlte Profile werden im Feed nicht bevorzugt. Alle Grundfunktionen bleiben kostenlos.

SICHER UND FAIR
Du entscheidest, wer dir folgen und schreiben darf. Inhalte und Personen kannst du überall melden, stummschalten oder blockieren. Unser Moderationsteam prüft Meldungen zeitnah. Wir verkaufen keine Daten und setzen keine Werbe- oder Tracking-Dienste ein.

Werkuno richtet sich an Personen ab 18 Jahren.

Creator Pro verlängert sich automatisch um die gewählte Laufzeit, wenn du es nicht mindestens 24 Stunden vor Ablauf kündigst. Die Zahlung wird deinem Apple-Account belastet. Verwalten und kündigen kannst du das Abo jederzeit in den Einstellungen deines Apple-Accounts.

Nutzungsbedingungen: https://werkuno.ch/rechtliches/agb
Datenschutz: https://werkuno.ch/rechtliches/datenschutz
```

**URLs**
- Support-URL: `https://werkuno.ch/hilfe`
- Marketing-URL: `https://werkuno.ch`
- Datenschutzrichtlinie: `https://werkuno.ch/rechtliches/datenschutz`
- Nutzungsbedingungen (Lizenzvertrag): Apple-Standard-EULA lassen (die App verlinkt sie im Abo-Bildschirm) – oder eigene AGB-URL eintragen.

**Kategorie:** Primär „Lifestyle“, sekundär „Soziale Netze“.

**Copyright:** `2026 Werkuno`

---

## 3. Neuerungen in dieser Version („Was ist neu“, max. 4000)
Nur nötig, wenn bereits eine Version im Store ist.
```
Neu in Werkuno:

• Stories: Teile Fotos, Videos und Texte für 24 Stunden – mit Herz, Antwort per Nachricht und Highlights in deinem Profil.
• Creator Pro in der App: Schaufenster, Medienkit, Jahresstatistik, längere Videos und tiefere Shop-Provision – jetzt direkt über Apple abonnierbar.
• Mehr Sicherheit: Events, Wettbewerbe und Gruppen lassen sich melden; Personen kannst du jetzt auch direkt aus Kommentaren, Stories, Events und Communities blockieren.
• Private Communities: Stelle direkt in der App eine Beitrittsanfrage.
• Artikel: Eingebettete Projekte, Anleitungen und Produkte öffnen sich direkt.
• Zuverlässigere Käufe: Ein bezahlter Kauf wird auch nach einem Verbindungsabbruch verbucht – ohne Doppelkauf.
• Profilbild im Tab „Ich“, Schwierigkeit in Werkuno-Farben und viele kleine Verbesserungen für VoiceOver, Dynamic Type und Bedienung.
```

---

## 4. Datenschutz-Angaben („App-Datenschutz“)
Tracking: **Nein** (keine Werbe-/Tracking-SDKs). Alle Daten „mit Identität verknüpft“, Zweck
„App-Funktionalität“ (wo angegeben zusätzlich „Analysen“ = eigene, anonymisierte Statistik für Creator).

| Datentyp | Erhoben | Zweck |
|---|---|---|
| Kontaktinfo → Name | ja | App-Funktionalität |
| Kontaktinfo → E-Mail-Adresse | ja | App-Funktionalität |
| Kontaktinfo → Telefonnummer | ja (optional, Lieferadresse) | App-Funktionalität |
| Kontaktinfo → Physische Adresse | ja (Bestellungen) | App-Funktionalität |
| Nutzerinhalte → Fotos oder Videos | ja | App-Funktionalität |
| Nutzerinhalte → E-Mails oder Textnachrichten (Direktnachrichten) | ja | App-Funktionalität |
| Nutzerinhalte → Kundensupport | ja | App-Funktionalität |
| Nutzerinhalte → Andere Inhalte (Beiträge, Kommentare, Projekte) | ja | App-Funktionalität |
| Identifikatoren → Nutzer-ID | ja | App-Funktionalität |
| Käufe → Kaufhistorie | ja | App-Funktionalität |
| Nutzungsdaten → Produktinteraktion | ja | App-Funktionalität, Analysen |

Nicht erhoben: Standort, Kontakte, Gesundheit, Finanzinfos (Zahlungen laufen über Apple bzw. Stripe),
Suchverlauf ausserhalb der App, Browserverlauf, Diagnose durch Drittanbieter.

---

## 5. Altersfreigabe
Fragebogen ehrlich beantworten: nutzergenerierte Inhalte **ja**, Nachrichten/Chat **ja**,
uneingeschränkter Webzugang **nein**. Werkuno verlangt die Bestätigung „18+“ bei der Registrierung →
Altersfreigabe **18+** wählen.

---

## 6. Hinweise für die Prüfung („App Review Information“)

**Anmeldedaten:** Benutzername und Passwort des Prüfkontos (Abschnitt 1.5).
**Kontakt:** deine Telefonnummer und `kontakt@werkuno.ch`.

**Notes** (Englisch, damit jede Prüferin sie lesen kann):
```
Werkuno is a social network for makers (crafts, DIY): projects with a build journal, step-by-step tutorials, communities, events, competitions, stories, direct and group messages, a blog and a marketplace for handmade goods.

DEMO ACCOUNT
The account above has an active shop, sample projects, community memberships and stories. All features (Stories, Marketplace, Creator Pro) are enabled for it.

USER-GENERATED CONTENT (Guideline 1.2)
- Every piece of user content can be reported (posts, comments, stories, projects, tutorials, articles, products, reviews, profiles, communities, events, competitions, group chats and single messages): "..." menu > "Melden".
- Users can be blocked and muted from posts, comments, stories, profiles, messages, events and communities. Blocking hides both users from each other everywhere.
- Reports create a moderation case; our moderation team reviews reports within 24 hours and can hide/remove content and suspend or ban accounts. Users get a case number and can appeal.
- Users must confirm they are 18+ before posting.
- Contact: kontakt@werkuno.ch, in-app support form (Ich > Einstellungen > Hilfe & Support).

IN-APP PURCHASES (Guideline 3.1.1)
- Digital products (e.g. PDF patterns) sold by shops are purchased with consumable price-tier products (ch.werkuno.app.digital.chf<amount>). Each purchase is bound to the buyer's Werkuno account via appAccountToken and verified server-side; the download is then permanently available under Ich > Meine Bestellungen. Because the entitlement is stored on the account, it is restored on any device by signing in (no StoreKit restore needed for consumables). Refunds are handled via App Store Server Notifications V2.
- Creator Pro is an auto-renewable subscription (ch.werkuno.app.pro.monthly / .yearly) on Ich > Werkuno Studio > Creator Pro, with price, period, auto-renew terms, Terms of Use, Privacy Policy, "Käufe wiederherstellen" and "Abo verwalten".
- Physical goods are paid via Stripe in an SFSafariViewController (Guideline 3.1.3(e)). Digital items cannot be paid with Stripe in the app.
- Sellers receive payouts via Stripe Connect; there is no tipping.

ACCOUNT
- Sign in with Apple and e-mail sign-in are available.
- Account deletion: Ich > Einstellungen > Konto > "Konto löschen".

To test a purchase in the sandbox: open the marketplace, choose the digital product of the demo shop and tap "Kaufen".
```

---

## 7. Screenshots
Pflicht: **6,9" iPhone** (1320 × 2868 px, z. B. iPhone 16 Pro Max / 17 Pro Max Simulator), 3–10 Bilder.
iPad ist nicht nötig (die App ist nur fürs iPhone). Vorschlag für die Reihenfolge:
1. Werkbank (Feed) mit Story-Kreis
2. Projektseite mit Journal
3. Anleitung Schritt für Schritt
4. Story-Betrachter
5. Community mit Event/Wettbewerb
6. Marktplatz-Produktseite
7. Creator Pro (Abo-Bildschirm)
8. Material-Bestand / Einkaufsliste

Keine Testdaten mit „Test“, „Lorem ipsum“ o. ä. zeigen; keine Preise anderer Kanäle.

---

## 8. Test vor dem Upload (auf dem iPhone, Sandbox-Konto)
- [ ] Registrieren, E-Mail bestätigen, Onboarding inkl. 18+ abschliessen
- [ ] Mit Apple anmelden (neues und bestehendes Konto)
- [ ] Beitrag, Projekt, Story erstellen; Story ansehen, Herz, Antwort
- [ ] Melden und Blockieren aus Beitrag, Kommentar, Story, Event, Community, Gruppe
- [ ] Digitales Produkt kaufen (Sandbox) → Download unter „Meine Bestellungen“; Flugmodus während des Kaufs → „wird verbucht“, danach automatisch verbucht
- [ ] Creator Pro abonnieren (Sandbox), „Abo verwalten“, „Käufe wiederherstellen“
- [ ] Physisches Produkt in den Warenkorb, Checkout öffnet Stripe im Browser-Fenster
- [ ] Konto löschen (Testkonto)
- [ ] Abmelden und mit anderem Konto anmelden → keine Daten des alten Kontos sichtbar
- [ ] VoiceOver kurz auf Anmeldung, Feed und Kauf testen

---

## 9. Offener Punkt: Inhaltsfilter (empfohlen vor Einreichung)
Guideline 1.2 verlangt „a method for filtering objectionable material from being posted to the app“.
Vorschlag (Aufwand gering): serverseitige Wortliste (Beleidigungen, Hassrede, Spam-Muster), die beim
Erstellen von Beiträgen, Kommentaren, Stories, Nachrichten, Profilen und Produkten greift – eindeutige
Treffer blockieren mit Hinweis, Grenzfälle veröffentlichen, aber automatisch als Moderationsfall
markieren. Optional: automatisches Ausblenden ab mehreren Meldungen. Danach in den Review-Notizen
ergänzen: „Text content is filtered against a blocklist before posting; borderline content is flagged
for moderation automatically.“
