# WERKRAUM – native iOS-App

SwiftUI · iOS 26.1+ · Liquid Glass · Three.js-Szenen (lokal gebündelt) · keine Drittanbieter-Pakete.
Alle Daten live aus dem Web-Backend über die Mobile-API `/api/v1/app/*` (`apps/web/src/server/mobile/`).

## Starten
```bash
cd apps/ios
xcodegen generate
open Werkraum.xcodeproj
```
Server umschalten: App → Ich → Einstellungen → „Server & Entwicklung“ (Produktion/Lokal).
Im Simulator lokal: `xcrun simctl spawn booted defaults write ch.werkraum.app werkraum.server local`.

## Aufbau
- `App/` – Einstieg, Tabs (Liquid Glass), Router & Deep Links (`werkraum://…` und Web-Pfade), Erstellen-Menü, Gastmodus, Push-Delegate
- `Core/` – APIClient (Bearer-Token im Keychain, keine Cookies), AppState, Bild-Cache, Formatierung (de-CH)
- `DesignSystem/` – „Werkbuch“-Farben, Typo, Faden-Tafeln, Karten, soziale Bausteine, Kommentare, Medienauswahl
- `ThreeD/` – WKWebView-Brücke + `web/scenes.js` (Story, Glyphen, Projektfaden, Aktivitätslandschaft, Knoten)
- `Features/` – Auth, Social, Projects, Market, Discover, Me
- `DEVGUIDE.md` – Konventionen für Weiterentwicklung

## Push & Anmelden mit Apple
Siehe `docs/OPERATIONS.md` → „iOS-App“: `APPLE_IOS_CLIENT_ID` (web) und `APNS_*` (worker) setzen, in `project.yml` `DEVELOPMENT_TEAM` eintragen und für die App-ID die Capabilities „Sign in with Apple“ und „Push Notifications“ aktivieren.
