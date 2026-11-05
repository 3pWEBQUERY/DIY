# WERKRAUM iOS – Entwickler-Leitfaden (für alle, die Feature-Bereiche bauen)

Native SwiftUI-App (iOS 26+, Swift 5-Modus, kein Drittanbieter-Code) für die Web-Plattform WERKRAUM.
**Alle Daten kommen live aus dem Backend** – es gibt keine Mock-Daten in der App.

## 1. Projekt & Build

```bash
cd apps/ios
xcodegen generate
xcodebuild -project Werkraum.xcodeproj -scheme Werkraum \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.5' \
  -derivedDataPath <eigener Ordner> build 2>&1 | grep -E "error:|BUILD" | sort -u
```
Neue Dateien unter `Werkraum/` werden von XcodeGen automatisch aufgenommen (nach `xcodegen generate`).

## 2. Backend-API

- Basis: `/api/v1/app/*` (Mobile-API), Antwort `{ data }`, Fehler `{ error: { code, message, fields } }`.
- Client: `APIClient.shared.get/post/put/patch/delete(path, …)` – Pfade **ohne** `/api/v1/app`.
  - `let x: MyModel = try await APIClient.shared.get("/projects", query: ["sort": "new", "cursor": c])`
  - Bodies als `[String: JSONValue]` (Literale gehen direkt: `["title": .string(t), "difficulty": .number(3), "tags": .from(tags)]`) oder `Encodable`-Structs.
  - Antwort egal: `_ = try await APIClient.shared.post("/x", body) as JSONValue`
  - Fehler sind `APIError` (`message` ist deutsch und für Nutzer:innen formuliert, `fields` = Feldfehler).
- **Echte Beispielantworten aller Endpunkte**: die Fixtures (lokal erzeugbar mit curl gegen `/api/v1/app/*`) (Dateiname ≈ Endpunkt). Lies sie, bevor du Modelle schreibst! Felder können `null` sein → optional machen.
- Routentabelle (Quelle der Wahrheit): ``apps/web/src/server/mobile/routes/*.ts``.
  Services/Eingabe-Schemas: `apps/web/src/server/**` und `packages/shared/src/schemas.ts` (Zod – Pflichtfelder, Grenzen, Fehlertexte).
- Medien: `MediaPickerField` (mehrere, Alt-Text, Reihenfolge) bzw. `SingleImagePicker` laden selbst hoch; im Body `items.refsJSON` (→ `[{id, alt}]`) bzw. `mediaId` senden.
- Medien-URLs sind relativ (`/media/...`) – `RemoteImage(path:)`/`CoverView` lösen sie auf.
- Seed-Daten haben **keine Fotos** → `CoverView`/`ThreadPlate` zeigt generative Faden-Tafeln. Nie leere graue Flächen.
- Demo-Logins (lokal): `lena-haekelt@demo.werkraum.local` / `Werkraum-Demo-2026!` (hat Shop), `mattia-holz@demo.werkraum.local` (Verkäufer), Admin `admin@werkraum.local` / `Werkraum-Admin-2026!`.
  Token holen: `curl -s -X POST localhost:3000/api/v1/auth/session -H 'content-type: application/json' -H 'authorization: Bearer x' -d '{"email":"…","password":"…"}'`, dann `curl -s localhost:3000/api/v1/app/<pfad> -H "authorization: Bearer <token>"`. Der lokale Server läuft bereits auf Port 3000 (nicht neu starten!). Schreibende Tests gegen lokal sind ok.

## 3. Architektur-Regeln

- **Nur in deinem Ordner `Werkraum/Features/<Bereich>/` arbeiten.** `App/`, `Core/`, `DesignSystem/`, `Models/`, `ThreeD/` nicht ändern.
  Fehlt dir etwas Gemeinsames, baue es in deinem Ordner (private/fileprivate oder mit Bereichs-Präfix, z. B. `MarketPriceRow`), damit es keine Namenskollisionen mit anderen Bereichen gibt.
- Die Platzhalter-Datei `Features/<Bereich>/<Bereich>Stubs.swift` definiert die **exakten öffentlichen View-Namen und Initialisierer**, die `App/MainTabView.swift` aufruft. Ersetze die Stubs durch echte Views mit *gleichen* Namen/Parametern (Datei löschen, Views auf eigene Dateien verteilen).
- Eigene Modelle in `Features/<Bereich>/<Bereich>Models.swift` (Präfix vermeiden Kollisionen, z. B. `ProjectPage`, `MarketCart`). Gemeinsame Modelle in `Models/Common.swift` wiederverwenden (`PostItem`, `ProjectCard`, `TutorialCard`, `ProductCard`, `CommunityCard`, `ArticleCard`, `UserMini`, `CreatorSuggestion`, `Page<T>`, `MediaItem`, `Category` …).
- State: `@State`-ViewModels als `@MainActor @Observable final class` oder schlicht `@State` + `.task`. Laden in `.task`, Pull-to-Refresh mit `.refreshable`, Pagination mit `LoadMoreTrigger`.
- Umgebung: `@Environment(AppState.self) var app` (me, categories, toast, `app.run("Erfolgstext") { try await … }`, `app.show(error:)`), `@Environment(Router.self) var router` (`router.open(.route)`, `router.present(.sheet)`, `router.open(href:)` für Server-`href`s).
- Navigation: **nie** eigene `NavigationStack` in gepushten Views; nur in Sheets. Ziele über `Route` (siehe `App/Router.swift`) – keine `NavigationLink(destination:)` auf fremde Bereiche.
- Fehler & Zustände: `LoadingView`, `ErrorStateView(message:retry:)`, `EmptyStateView(...)`. Optimistische Updates bei Likes/Speichern sind in `LikeButton`/`SaveButton` schon gelöst.
- Rechte: Server prüft alles. UI blendet Aktionen nur aus Komfortgründen aus (z. B. `viewer.isOwner`).

## 4. Designsystem (Pflicht – kein „AI-Slop“)

Leitmotiv **„Der Faden“**: ein durchgehender Faden verbindet Projekte, Journal, Anleitungen, Produkte. Ruhige, redaktionelle Inhalte (Werkbuch), **Liquid Glass nur für Navigation & schwebende Aktionen**.

- Farben: `Color.paper` (Hintergrund), `.card`, `.sunken`, `.ink`, `.ink2`, `.muted`, `.moss` (+`.mossSoft`, `.mossInk`), `.clay` (+`.claySoft`), `.line`, `.lineStrong`, `.danger`, `.warn`, `.ochre`, `.slate`, `.plum`. `CategoryPalette.color(for: slug)`.
- Typo: `.font(.display(32))` (New York Serif, Seitentitel), `.titleSerif` / `.headlineSerif` (Abschnitte, Karten), SF für UI, `.specStyle()` bzw. `SpecLabel("…")` für Mono-Versalien-Metadaten („Datenblatt“).
- Flächen: `.cardSurface()` (Karte + Haarlinie, Radius 22), `.sunkenSurface()`, `.hairline()`. Abstände `Space.gutter` (20) seitlich.
- Liquid Glass: `.glassEffect(.regular.interactive(), in: Capsule())`, `GlassEffectContainer`, `.buttonStyle(.glass)` / `.buttonStyle(.glassProminent).tint(.moss)`, `.primaryButton()` für breite Hauptaktionen. Toolbars nutzen automatisch Glas. Schwebende Aktionsleisten (z. B. „In den Warenkorb“) als Glas-Kapsel über `safeAreaInset(edge: .bottom)`.
- Bausteine (alle in `DesignSystem/`): `PageTitle`, `SectionHeader("Titel", number: "01")`, `SpecRow`, `StatCell`, `Pill`, `StatusBadge`, `DifficultyMeter`, `ChipBar`, `FlowLayout`, `TagList`, `AvatarView`, `CoverView`, `ThreadPlate`, `NoticeView`, `AsyncButton`, `YarnSpinner`, `LoadMoreTrigger`, `ProjectCardView(style: .tile/.wide/.row)`, `TutorialCardView`, `ProductCardView`, `CommunityCardView`, `ArticleCardView`, `CreatorRowView`, `PostCardView`, `LinkedThreadRow`, `LikeButton`, `SaveButton`, `FollowButton`, `SafetyMenuItems` (Menü: Teilen/Ausblenden/Melden/Stumm/Blockieren), `ReportSheet`, `CommentsSection(type:id:)`, `MediaStrip`, `MediaPickerField`, `SingleImagePicker`, `.buttonStyle(.pressable)`.
- 3D (Three.js): `ThreeCanvas(scene: .glyph(glyph, color:), …)`, `.journal(nodes:remixes:status:color:highlight:)` mit `onEvent` (`"node"`, `["index": Int]`), `.heat(days:)`, `.knot(color:)` + `celebrateToken` (Feier), `.story(progress:)`. Sparsam einsetzen (Hero-Bereiche), Höhe fix vorgeben (z. B. 260–320).
- Sprache: Deutsch, Schweizer Schreibweise (**kein ß** → „ss“), Ansprache „du“. Formate: `Fmt.money`, `Fmt.relative`, `Fmt.date`, `Fmt.minutes`, `Fmt.number`, `Fmt.plural`. Labels: `L.*` (Status, Arten, Gründe …).
- Barrierefreiheit: Dynamic Type (keine fixen Höhen für Text), `accessibilityLabel` für Icon-Buttons, Alt-Texte, Touch-Ziele ≥ 44 pt.
- Keine Emojis als UI, keine Farbverläufe, keine Schlagschatten, keine Fake-Daten.

## 5. Qualität vor Abgabe
- Build ohne Fehler (Warnungen minimieren).
- Jede Liste hat Leer-, Lade- und Fehlerzustand; jede schreibende Aktion zeigt Erfolg/Fehler (Toast) und aktualisiert die Ansicht.
- Alle Funktionen der entsprechenden Web-Seiten abgedeckt (Web-Quelltext: `apps/web/src/app/**/page.tsx` + `components/**`).
