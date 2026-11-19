# SEO – Werkuno bei Google & Bing

## Was die Website selbst liefert

| Baustein | Wo | Zweck |
|---|---|---|
| `robots.txt` | `app/robots.ts` | Crawler dürfen alles Öffentliche. Gesperrt sind private Bereiche (Studio, Admin, Einstellungen, Nachrichten, Kasse …). Verweist auf die Sitemaps. |
| Sitemap-Index | `/sitemap_index.xml` | Diese Adresse trägt man in der Search Console ein. |
| Teil-Sitemaps | `/sitemap/<teil>.xml` | Folgende Teile: <ul><li>`basis`: Seiten, Kategorien, Communities, Events, Wettbewerbe, Materialien</li><li>`projekte`</li><li>`anleitungen`: Anleitungen und Blogartikel</li><li>`markt`: Produkte und Shops</li><li>`profile`</li></ul> |
| Titel & Beschreibung | jede Seite (`metadata` / `generateMetadata`) | Treffertext in Google. |
| Canonical-URL | jede indexierbare Seite | Verhindert doppelte Treffer, z. B. durch Filter-Parameter. |
| `noindex` | Anmelden, Registrieren, Passwort, Suche, Studio, Admin, Einstellungen, Nachrichten, Kasse … | Gehören nicht in die Suchergebnisse. |
| Open Graph / Twitter | alle Seiten | Bild und Text, wenn ein Link geteilt wird (WhatsApp, Facebook, X, Pinterest, iMessage). Ohne eigenes Bild wird `app/opengraph-image.png` verwendet. |
| Strukturierte Daten (JSON-LD) | siehe unten | Rich Results: Preis und Verfügbarkeit, Brotkrumen, Event-Datum, Anleitungsschritte. |

### Strukturierte Daten (schema.org)

- **Startseite:**
  - `Organization` mit Logo
  - `WebSite` mit Suchfeld (`/suche?q=`)
- **Produkt:** `Product` mit Angebot, Preis in CHF, Verfügbarkeit, Versand und Bewertungen, dazu `BreadcrumbList`.
- **Anleitung:** `HowTo` mit Schritten, Dauer und Material, dazu `BreadcrumbList`.
- **Projekt:** `CreativeWork`, dazu `BreadcrumbList`.
- **Blogartikel:** `BlogPosting`, dazu `BreadcrumbList`.
- **Profil:** `ProfilePage` mit `Person`.
- **Event:** `Event` mit Datum, Ort oder online, abgesagt oder geplant, dazu `BreadcrumbList`.

Prüfen: <https://search.google.com/test/rich-results> → Adresse einer Produkt- oder Anleitungsseite eingeben.

## Einmalig einrichten

### 1. Google Search Console

1. <https://search.google.com/search-console> öffnen und **Property hinzufügen** wählen.
2. Den Typ **Domain** wählen und `werkuno.ch` eingeben.
3. Google zeigt einen **TXT-Eintrag**. Diesen beim Domain-Anbieter in den DNS-Einstellungen von `werkuno.ch` eintragen und dann **Bestätigen** klicken.
   - Die Bestätigung kann einige Minuten bis Stunden dauern.
   - **Alternative ohne DNS:** Property-Typ **URL-Präfix** `https://werkuno.ch/` wählen, dann Bestätigung per **HTML-Tag**. Den Wert aus `content="…"` auf Railway (Dienst `web`) als `GOOGLE_SITE_VERIFICATION` setzen und neu deployen.
4. In der Search Console links **Sitemaps** öffnen, `sitemap_index.xml` eintragen und **Senden** klicken.
5. Optional: Unter **URL-Prüfung** die Startseite sowie 2–3 wichtige Seiten eingeben und **Indexierung beantragen**. Das beschleunigt den Start.

### 2. Bing Webmaster Tools (deckt auch DuckDuckGo, Ecosia und Yahoo ab)

1. <https://www.bing.com/webmasters> öffnen.
2. **Aus Google Search Console importieren** wählen. Das ist am einfachsten, weil Bing dann Bestätigung und Sitemap übernimmt.
3. Oder manuell: Den Meta-Tag-Wert auf Railway als `BING_SITE_VERIFICATION` setzen und `https://werkuno.ch/sitemap_index.xml` einreichen.

### 3. App-Banner in Safari (sobald die App im App Store ist)

Auf Railway `APPLE_APP_STORE_ID` setzen. Das ist die Zahl aus dem App-Store-Link, z. B. `apps.apple.com/ch/app/werkuno/id`**`1234567890`**. Danach zeigt Safari auf dem iPhone oben das Banner «Im App Store laden». Die App wird ausserdem in den strukturierten Daten der Organisation verknüpft.

## Umgebungsvariablen (alle optional)

| Variable | Wert |
|---|---|
| `GOOGLE_SITE_VERIFICATION` | Code aus dem Google-HTML-Tag (nur bei URL-Präfix-Bestätigung) |
| `BING_SITE_VERIFICATION` | Code aus dem Bing-Meta-Tag (`msvalidate.01`) |
| `APPLE_APP_STORE_ID` | Numerische App-ID aus App Store Connect (App-Informationen → Apple-ID) |

## Was das Ranking zusätzlich verbessert

- **Inhalte:** Jede öffentliche Anleitung, jedes Projekt und jedes Produkt ist eine eigene Seite in Google. Mehr gute Inhalte bringen mehr Treffer. Titel sollten so lauten, wie Leute suchen, z. B. «Granny Square häkeln für Anfänger» statt «Mein Projekt».
- **Beschreibungen:** Die ersten rund 160 Zeichen einer Beschreibung erscheinen als Text in Google.
- **Bilder:** echte Fotos im Querformat, mindestens 1200 px breit. Sie dienen als Vorschaubild und erscheinen in der Google-Bildersuche.
- **Links von aussen:** Erwähnungen auf Blogs, Instagram und Pinterest sowie Einträge in Verzeichnissen wie local.ch oder Google Unternehmensprofil.
- **Geduld:** Neue Websites erscheinen nach einigen Tagen, eine gute Platzierung braucht meist Wochen bis Monate.
