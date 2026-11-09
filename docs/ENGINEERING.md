# WERKRAUM – Engineering-Konventionen

Dieses Dokument ist für alle, die am Code arbeiten. Es beschreibt, *wie* gebaut wird.

## Struktur (apps/web)

| Pfad | Inhalt |
|---|---|
| `prisma/schema.prisma` | Datenmodell (PRD §26). Migrationen unter `prisma/migrations`. |
| `src/server/<domäne>/` | Domänenmodule (modularer Monolith, §27.1). Nur hier wird auf `db` zugegriffen. Jede Datei beginnt mit `import "server-only"`. |
| `src/app/(app)/…` | Seiten mit Hauptnavigation (AppShell). |
| `src/app/(auth)/…` | Anmeldung, Registrierung, Reset. |
| `src/app/studio/…` | Werkuno Studio (eigenes Layout). |
| `src/app/admin/…` | Administration & Moderation (eigenes Layout). |
| `src/app/api/v1/…` | REST-API für iOS & Client-Fetches (`api()`-Wrapper aus `src/server/api.ts`). |
| `src/components/ui/` | Designsystem-Primitives. |
| `src/components/<domäne>/` | Feature-Komponenten. |
| `packages/shared` | Zod-Schemas, Enums, Labels, Geld – geteilt mit der iOS-App. |

## Regeln

1. **Berechtigungen immer serverseitig** (`requireUser`, `requireRole`, `assertOwnerOrMod`, `requireCommunityModerator`). UI-Verstecken ist nie Schutz (§7.3).
2. **Server Actions** liegen in `actions.ts` neben der Route, beginnen mit `"use server"` und geben über `act()` ein `ActionResult` zurück. Im Client mit `useAction()` oder direkt + `toast()`.
3. **Validierung** mit Zod – Schemas für API/iOS-relevante Eingaben in `packages/shared/src/schemas.ts`.
4. **Sichtbarkeit**: Inhalte über `canViewContent()` / `visibleContentWhere()` / `relationsFor()` filtern. Blockierungen gelten wechselseitig. `state: "REMOVED"`/`"HIDDEN"` nie öffentlich zeigen.
5. **Ereignisse**: `emit()` (Outbox) für Domänenereignisse, `notify()` für Benachrichtigungen (bündelt automatisch), `audit()` für kritische Admin-/Moderations-/Zahlungsaktionen.
6. **Rate Limits** mit `limit("<aktion>", userId)` für alle schreibenden, missbrauchsanfälligen Aktionen.
7. **Geld** immer als Integer (Rappen). Anzeige mit `formatMoney()`. Gebühren mit `computeFees()`.
8. **Medien** nur über `MediaPicker` / `uploadFile()` hochladen und serverseitig mit `attachMedia()` an Entitäten binden. Bilder mit `<MediaImage>` bzw. `<Cover>` (zeigt eine „Tafel“, wenn kein Foto vorhanden ist).
9. **Keine PII in Logs.** Strukturierte JSON-Logs.
10. **Sprache**: UI-Texte auf Deutsch mit Schweizer Schreibweise (kein „ß“ → „ss“). Ansprache „du“.

## Designsystem „Werkbuch“ (PRD §28)

- **Verboten**: Verläufe, Schatten, Glassmorphism, grosse Rundungen (max. `rounded-sm`), dekorative Illustrationen, Emojis als UI.
- **Farben** (Tailwind-Tokens): `paper` (Hintergrund), `card`, `sunken`, `ink`, `ink-2`, `muted`, `moss` (+`moss-ink`, `moss-soft`), `clay` (+`clay-ink`, `clay-soft`), `line`, `line-strong`, `danger`, `warn`.
- **Typografie**: Manrope ist die einzige Schrift. `.display` / `.headline` (Manrope, fett, enges Tracking) für Titel, `.spec` (Manrope, Versalien) für Datenblatt-Labels, `.prose-werk` für Lesetexte.
- **Muster**: Haarlinien (`border-line`), aktive Zustände in `ink`, Abschnittstitel mit `SectionTitle n="01"`, Kennzahlen mit `Spec`/`Stat`, Schwierigkeit mit `Difficulty`, Seitenkopf mit `PageHeader`, Tabs mit `TabLinks`.
- **Projektfaden**: Verknüpfungen zu einem Projekt werden mit einer linken Linie (`border-l border-ink pl-3`) bzw. Knoten auf einer vertikalen Linie dargestellt.
- **Barrierefreiheit**: Labels via `Field`, sichtbarer Fokus, `aria-*` für Toggle-Buttons, Alt-Texte, `prefers-reduced-motion`.

## Wiederverwendbare Bausteine

- UI: `Button`, `LinkButton`, `buttonClass`, `Input`, `Textarea`, `Select`, `Field`, `Checkbox`, `Badge`, `Avatar`, `Spec`, `Stat`, `SectionTitle`, `Empty`, `Notice`, `Difficulty`, `Dialog`, `toast`, `Cover`, `Plate`, `MediaImage`, `Glyph`
- Layout: `Page` (mit optionalem `aside`), `PageHeader`, `TabLinks`
- Social: `LikeButton`, `SaveButton`, `ShareButton`, `FollowButton`, `MoreMenu`, `useSafetyMenu`, `ReportDialog`, `Comments`, `PostCard`, `Composer`
- Server: `db`, `requireUser`, `currentUser`, `act`, `fail`, `limit`, `notify`, `emit`, `audit`, `getSetting`, `canViewContent`, `relationsFor`, `targetMeta`

## Lokale Entwicklung

```bash
pnpm install
cp apps/web/.env.example apps/web/.env
pnpm db:migrate && pnpm db:seed
pnpm dev            # http://localhost:3000
pnpm worker         # Hintergrundjobs
```

## Tests & CI

| Was | Befehl | Hinweis |
|---|---|---|
| Typen | `pnpm -r typecheck` | |
| Unit-Tests (Vitest) | `pnpm -r test` | `src/**/__tests__`; Video-Tests nur mit ffmpeg |
| Browser-Tests (Playwright) | `pnpm --filter @werkraum/web e2e` | `apps/web/e2e`; brauchen eine DB mit Demo-Daten (`SEED_DEMO=true pnpm db:seed`) und einen Build (`pnpm build`). Ein laufender Server auf Port 3100 (`PORT=3100 NODE_ENV=test pnpm start`) wird wiederverwendet, sonst startet Playwright ihn selbst. |

- Die Browser-Tests laufen im Testmodus (Zahlungen simuliert) und nacheinander; `e2e/global-setup.ts`
  räumt Überbleibsel früherer Läufe auf, sie sind also wiederholbar.
- Zahlungen und Worker-Jobs werden in Tests direkt ausgelöst (`runServer` in `e2e/helpers.ts`).
- Eigene Dialoge statt Browser-Dialogen: Ein `alert`/`confirm` lässt jeden Browser-Test fehlschlagen.
- **CI** (`.github/workflows/ci.yml`): bei jedem Push Typen + Unit-Tests, danach Build + Browser-Tests
  gegen eine frische Postgres-Datenbank. Bei Fehlern liegt der Playwright-Bericht als Artefakt bei.
