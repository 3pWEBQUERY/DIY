# Unterstützer-Abo einrichten (Apple und Stripe)

Mit dem Unterstützer-Abo unterstützen Fans eine Person (Creator) monatlich und bekommen Zugang zu deren exklusiven Anleitungen.

| | Web | iOS-App |
|---|---|---|
| Bezahlung | Stripe-Abo, verlängert sich jeden Monat | Apple In-App-Kauf (**Verbrauchsartikel**), je Kauf 1 Monat |
| Stufen | CHF 3, 5 oder 10 pro Monat | Je Stufe ein Apple-Produkt |
| Geld an den Creator | Stripe zahlt direkt auf das Stripe-Konto des Shops | Werkuno überweist den Anteil per Stripe aus dem eigenen Guthaben |
| Anteil Werkuno | `supporters.feeBps` (Standard 15 %) | gleich, gerechnet auf die Web-Stufe |

**Warum kein automatisch verlängertes Apple-Abo?** Bei automatisch verlängerten Abos erlaubt Apple pro Abo-Gruppe nur **ein** laufendes Abo. Fans sollen aber mehrere Creator gleichzeitig unterstützen können, und Gruppen lassen sich nicht pro Creator anlegen. In der App verlängert jeder Kauf um einen Monat. Drei Tage vor Ablauf erinnert Werkuno daran.

---

## 1. Apple (App Store Connect)

### 1.1 Drei In-App-Käufe anlegen

App Store Connect › **Apps** › Werkuno › **Monetarisierung › In-App-Käufe** › **＋** › Typ **Verbrauchsartikel** (englisch „Consumable“).

Jeder Kauf schaltet die Unterstützung für einen Monat frei, ein weiterer Kauf verlängert um einen Monat. Den Zeitraum führt der Werkuno-Server, darum braucht es kein Apple-Abo. Bitte **keine** Abo-Gruppe dafür anlegen: Dort gibt es nur automatisch erneuerbare Abos, und Apple erlaubt pro Gruppe nur ein laufendes Abo, also nur eine unterstützte Person.

(Falls dein App Store Connect den Typ „Abonnement ohne automatische Verlängerung“ anbietet, geht auch der. Die App akzeptiert beide Typen.)

| Produkt-ID (genau so) | Referenzname | Preis (Empfehlung) |
|---|---|---|
| `ch.werkuno.app.support.tier3` | Unterstützung CHF 3 | CHF 4.00 |
| `ch.werkuno.app.support.tier5` | Unterstützung CHF 5 | CHF 7.00 |
| `ch.werkuno.app.support.tier10` | Unterstützung CHF 10 | CHF 13.00 |

Zu den Preisen: Sie decken die Apple-Gebühr, wie bei digitalen Produkten (Aufschlag etwa 30 %). Der Creator bekommt in App und Web denselben Betrag, denn Werkuno rechnet immer mit der Web-Stufe. Du kannst die App-Preise auch gleich hoch wie im Web setzen; dann trägt Werkuno die Apple-Gebühr.

Für jedes Produkt:

1. **Verfügbarkeit:** alle Länder, in denen die App erhältlich ist (mindestens Schweiz, Deutschland, Österreich und USA).
2. **Lokalisierungen** (Apple erlaubt höchstens 30 Zeichen für den Anzeigenamen und 45 für die Beschreibung):
   - Deutsch: Anzeigename `Unterstützung · 1 Monat`, Beschreibung `Ein Monat Zugang zu exklusiven Anleitungen`
   - Englisch (falls die App Englisch als Sprache führt): Anzeigename `Support · 1 month`, Beschreibung `One month of access to exclusive tutorials`
3. **Screenshot für die Prüfung:** ein Bildschirmfoto der Karte «Unterstützen» auf einem Profil in der App (Pflichtfeld).
4. **Hinweis für die Prüfung**, zum Beispiel:
   > Consumable that grants one month (30 days) of support. Gives the buyer 30 days of access to tutorials that a creator marked as "supporters only". Buying again extends access by 30 days. To test: open the profile of the demo creator (see review notes), tap "Unterstützen".

### 1.2 Mit der nächsten App-Version zur Prüfung einreichen

1. Neue App-Version anlegen und den Build mit diesem Stand hochladen (Xcode › Product › Archive).
2. In der Version unter **In-App-Käufe und Abonnements** die drei neuen Produkte hinzufügen.
   - Fehlt dieser Abschnitt, öffne jedes Produkt einzeln und wähle dort «Zur Prüfung hinzufügen» (Produkte und Version werden zusammen geprüft).
3. In den Prüfhinweisen (App Review Information) ein Demo-Konto angeben und ein Profil nennen, auf dem das Unterstützer-Abo eingeschaltet ist.
   - Lege dieses Profil vorher im Web an: Studio › Unterstützer:innen › einschalten.
   - Markiere dort eine Anleitung als «Nur für Unterstützer:innen».

### 1.3 Erstattungen

Die Server-Benachrichtigungen V2 hast du bereits für Creator Pro eingerichtet, es braucht keine neue URL. Erstattet Apple eine Unterstützung, kürzt Werkuno den bezahlten Zeitraum und holt die Überweisung an den Creator zurück.

### 1.4 Testen (Sandbox / TestFlight)

1. Mit einem Sandbox-Konto eine Unterstützung kaufen.
2. Prüfen: Die exklusive Anleitung öffnet sich, und das Profil zeigt «Du unterstützt …».
3. Sandbox-Käufe lösen **keine** Überweisung an den Creator aus, nur echte Käufe (Production).

---

## 2. Stripe (Web)

### 2.1 Webhook um ein Ereignis ergänzen

Stripe Dashboard › **Entwickler › Webhooks** › bestehender Werkuno-Endpunkt (`…/api/webhooks/stripe`) › **Ereignisse bearbeiten**.

Diese Ereignisse müssen ausgewählt sein:

- `checkout.session.completed` (schon vorhanden)
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- **`invoice.paid`** ← neu, für die Einnahmen der Creator im Studio

Danach speichern. Den Signierschlüssel des Webhooks musst du nicht ändern.

### 2.2 Stripe Connect für Creator

Creator brauchen ein Auszahlungskonto, gleich wie Verkäufer:innen im Marktplatz:

1. Studio › Shopverwaltung › Shop eröffnen und die Stripe-Verifizierung abschliessen.
2. Danach lässt sich das Unterstützer-Abo unter Studio › Unterstützer:innen einschalten.

Ohne aktiven Shop mit Stripe-Konto zeigt das Studio, was noch fehlt.

### 2.3 Guthaben für Apple-Überweisungen

Bei Käufen in der App bezahlt Apple Werkuno erst nach 30 bis 45 Tagen. Werkuno überweist den Creator-Anteil aber sofort aus dem eigenen Stripe-Guthaben. Ist das Guthaben zu klein, versucht es der Worker alle 10 Minuten erneut, bis es reicht. Nach 24 Fehlversuchen erscheint ein Eintrag unter Admin › Fehler.

Ein Startguthaben gibt es unter Stripe › **Saldo › Guthaben aufladen** (Top-up).

### 2.4 Anteil von Werkuno

Admin › **Systemkonfiguration** › «Unterstützer-Abo – Anteil Werkuno» (`supporters.feeBps`, 1500 = 15 %). Nur die Superadministration kann ihn ändern.

Bei CHF 3.– fallen ungefähr CHF 0.40 Stripe-Gebühren an, deshalb liegt der Standard bei 15 %. Eine Änderung gilt für neue Zahlungen.

---

## 3. Ablauf für Creator

1. Studio › **Unterstützer:innen**: «Unterstützungen annehmen», Stufe wählen, beschreiben, was Unterstützer:innen bekommen.
2. Anleitungs-Editor: **«Nur für Unterstützer:innen»** anhaken.
   - Ohne Unterstützung sehen alle nur Titel, Bild, Beschreibung und das Angebot.
   - Schritte, Material, Fragen, Werkstatt-Modus und Druckfassung bleiben gesperrt.
3. Schaltet ein Creator das Abo aus, enden laufende Web-Abos zum Monatsende, und die Unterstützer:innen bekommen eine Benachrichtigung. Gekaufte App-Monate laufen bis zu ihrem Ende weiter.

## 4. Ablauf für Fans

- **Web:** Profil oder exklusive Anleitung › «Unterstützen» › Stripe-Kasse.
  - Kündigen unter Einstellungen › **Unterstützungen**; das Abo läuft bis zum Ende des bezahlten Monats.
- **App:** Profil oder exklusive Anleitung › «Unterstützen» › Kauf über Apple (1 Monat).
  - «Um einen Monat verlängern» hängt einen weiteren Monat an.
  - Der Stand ist unter Einstellungen › Unterstützungen sichtbar.
