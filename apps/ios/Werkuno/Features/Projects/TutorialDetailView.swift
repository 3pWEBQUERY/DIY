import SwiftUI

/// Anleitung: Übersicht (Version, Sicherheit, Material, Schritte, Projekt, Produkte, Fragen)
/// und ein Schritt-für-Schritt-Lesemodus im Vollbild. `GET /tutorials/by-slug/:slug`
struct TutorialDetailView: View {
    var slug: String

    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @Environment(\.dismiss) private var dismiss

    @State private var page: TutorialPage?
    @State private var error: String?
    @State private var notFound = false
    @State private var tracked = false
    @State private var done: Set<String> = []
    @State private var completedAt: Date?
    @State private var versionSeen: Int?
    @State private var reader: TutorialReaderStart?
    @State private var confirmDelete = false
    @State private var confirmReset = false
    @State private var showVersions = false
    @State private var celebrate = 0

    var body: some View {
        Group {
            if let page {
                content(page)
            } else if notFound {
                EmptyStateView(symbol: "questionmark.text.page", title: "Anleitung nicht gefunden", message: "Vielleicht wurde sie zurückgezogen oder gelöscht.", actionTitle: "Zurück") { dismiss() }
                    .frame(maxHeight: .infinity)
            } else if let error {
                ErrorStateView(message: error) { await load() }
            } else {
                LoadingView(text: "Anleitung wird geladen …").frame(maxHeight: .infinity)
            }
        }
        .background(Color.paper)
        .navigationTitle(page?.title ?? "")
        .toolbarTitleDisplayMode(.inline)
        .toolbar {
            if let page { ToolbarItem(placement: .topBarTrailing) { moreMenu(page) } }
        }
        .task { if page == nil { await load() } }
        .onChange(of: router.sheet) { old, new in
            if old != nil && new == nil { Task { await load() } }
        }
        .fullScreenCover(item: $reader) { start in
            if let page {
                TutorialReaderView(
                    page: page,
                    startIndex: start.index,
                    done: $done,
                    completedAt: $completedAt,
                    toggle: { await toggle($0, page) },
                    complete: { await complete(page) },
                    remix: { remix(page) }
                )
                .environment(app)
                .environment(router)
                .toastOverlay()
            }
        }
        .confirmationDialog("Anleitung löschen?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Endgültig löschen", role: .destructive) { Task { await deleteTutorial() } }
            Button("Abbrechen", role: .cancel) {}
        } message: { Text("Alle Versionen, Kommentare und Lesefortschritte werden entfernt.") }
        .confirmationDialog("Fortschritt zurücksetzen?", isPresented: $confirmReset, titleVisibility: .visible) {
            Button("Zurücksetzen", role: .destructive) { if let page { Task { await reset(page) } } }
            Button("Abbrechen", role: .cancel) {}
        } message: { Text("Alle Haken in dieser Anleitung werden entfernt.") }
    }

    // MARK: - Inhalt

    private func content(_ t: TutorialPage) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                CoverView(url: t.coverUrl, seed: t.id, category: t.category, animated: true)
                    .frame(height: 300)
                    .frame(maxWidth: .infinity)
                    .clipped()
                    .accessibilityHidden(t.coverUrl == nil)
                    .accessibilityLabel("Titelbild")

                header(t)
                    .padding(.horizontal, Space.gutter)
                    .padding(.top, 22)
                    .padding(.bottom, 26)

                progressCard(t)
                    .padding(.horizontal, Space.gutter)
                    .padding(.bottom, 28)

                let kinds = t.safetyKinds ?? []
                if !kinds.isEmpty {
                    ProjectsSection(title: "Sicherheit", number: "01", subtitle: "Bitte lies diese Hinweise, bevor du beginnst.") {
                        VStack(spacing: 10) { ForEach(kinds, id: \.self) { TutorialSafetyCard(kind: $0) } }
                    }
                }

                materialsSection(t, number: kinds.isEmpty ? "01" : "02")
                stepsSection(t, number: kinds.isEmpty ? "02" : "03")
                linkedSection(t)
                finishCard(t)
                    .padding(.horizontal, Space.gutter)
                    .padding(.vertical, 28)
                    .hairline(.top)
                CommentsSection(type: "TUTORIAL", id: t.id, title: "Fragen & Kommentare", placeholder: "Frage zur Anleitung stellen …", initial: t.comments)
                    .padding(.horizontal, Space.gutter)
                    .padding(.vertical, 28)
                    .hairline(.top)
            }
            .padding(.bottom, 24)
        }
        .refreshable { await load() }
        .safeAreaInset(edge: .bottom) { actionBar(t) }
    }

    private func header(_ t: TutorialPage) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            SpecLabel("Anleitung · \(app.categoryShort(t.category))", color: CategoryPalette.color(for: t.category))
            Text(t.title).font(.display(32)).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true).accessibilityAddTraits(.isHeader)
            if let s = t.summary?.nilIfEmpty {
                Text(s).font(.wr(.body)).foregroundStyle(Color.ink2).lineSpacing(3).fixedSize(horizontal: false, vertical: true)
            }

            HStack(spacing: 12) {
                Button { router.open(.profile(handle: t.author.handle)) } label: {
                    HStack(spacing: 10) {
                        AvatarView(url: t.author.avatarUrl, name: t.author.displayName, size: 38)
                        VStack(alignment: .leading, spacing: 1) {
                            SpecLabel("Geschrieben von")
                            Text(t.author.displayName).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink)
                        }
                    }
                }
                .buttonStyle(.pressable)
                .accessibilityHint("Profil öffnen")
                Spacer(minLength: 0)
                if !t.isOwner { FollowButton(userId: t.author.id, following: t.viewer?.followingAuthor ?? false, compact: true) }
            }

            HStack(spacing: 0) {
                StatCell(value: "\(t.steps.count)", label: "Schritte").frame(maxWidth: .infinity, alignment: .leading)
                StatCell(value: Fmt.minutes(t.minutes ?? t.totalStepMinutes), label: "Dauer").frame(maxWidth: .infinity, alignment: .leading)
                StatCell(value: t.difficulty.flatMap { L.difficulty[$0] } ?? "–", label: "Stufe").frame(maxWidth: .infinity, alignment: .leading)
                StatCell(value: Fmt.number(t.counts?.completions), label: "Nachgebaut").frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.vertical, 14)
            .hairline(.top)
            .hairline(.bottom)

            versionLine(t)

            if t.preview == true {
                NoticeView(tone: .info, title: "Vorschau", message: "Diese Anleitung ist noch nicht veröffentlicht. Nur du siehst diese Arbeitskopie.")
            } else if t.isOwner && t.state == "DRAFT" {
                NoticeView(tone: .info, title: "Zurückgezogen", message: "Die Anleitung ist derzeit nicht öffentlich. Über das Menü kannst du sie wieder veröffentlichen.")
            } else if t.state == "HIDDEN" {
                NoticeView(tone: .warn, title: "Von der Moderation ausgeblendet", message: "Diese Anleitung ist derzeit nur für dich sichtbar.")
            }

            if let v = t.version, let seen = versionSeen, seen < v.number, t.viewer?.hasProgress == true, !t.isOwner {
                VStack(alignment: .leading, spacing: 10) {
                    NoticeView(tone: v.isMajor == true ? .warn : .info, title: "Neue Version \(v.number)", message: v.changeNote?.nilIfEmpty ?? "Die Anleitung wurde seit deinem letzten Besuch überarbeitet. Prüfe deine erledigten Schritte.")
                    Button { Task { await markSeen(t) } } label: {
                        Label("Verstanden", systemImage: "checkmark").font(.wr(.footnote, .semibold))
                    }
                    .buttonStyle(.glass)
                }
            }
        }
    }

    private func versionLine(_ t: TutorialPage) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if let v = t.version, t.preview != true {
                Button { withAnimation(.snappy) { showVersions.toggle() } } label: {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        SpecLabel("Version \(v.number)", color: .moss)
                        Text([v.changeNote?.nilIfEmpty, Fmt.date(v.publishedAt)].compactMap { $0 }.joined(separator: " · "))
                            .font(.wr(.footnote)).foregroundStyle(Color.muted).a11yLineLimit(2).multilineTextAlignment(.leading)
                        Spacer(minLength: 0)
                        if (t.versions?.count ?? 0) > 1 {
                            Image(systemName: "chevron.down").font(.wr(.caption2, .bold)).foregroundStyle(Color.muted).rotationEffect(.degrees(showVersions ? 180 : 0))
                        }
                    }
                }
                .buttonStyle(.plain)
                .disabled((t.versions?.count ?? 0) <= 1)
                .accessibilityHint((t.versions?.count ?? 0) > 1 ? "Versionsverlauf anzeigen" : "")
                if showVersions {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(t.versions ?? []) { row in
                            HStack(alignment: .firstTextBaseline, spacing: 10) {
                                Text("v\(row.version)").font(.specLarge).foregroundStyle(row.version == v.number ? Color.moss : Color.muted).frame(width: 34, alignment: .leading)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(row.changeNote?.nilIfEmpty ?? "Ohne Änderungshinweis").font(.wr(.footnote)).foregroundStyle(Color.ink2)
                                    Text(Fmt.date(row.publishedAt) + (row.isMajor == true ? " · Grössere Änderung" : "")).font(.wr(.caption2)).foregroundStyle(Color.muted)
                                }
                            }
                            .padding(.vertical, 8)
                            .hairline()
                        }
                    }
                    .transition(.opacity)
                }
            }
        }
    }

    // MARK: Fortschritt

    private func progressCard(_ t: TutorialPage) -> some View {
        let total = t.steps.count
        let count = t.steps.filter { done.contains($0.stableKey) }.count
        let next = t.steps.firstIndex { !done.contains($0.stableKey) } ?? 0
        let remaining = t.steps.filter { !done.contains($0.stableKey) }.reduce(0) { $0 + ($1.minutes ?? 0) }
        return VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                SpecLabel("Fortschritt", color: .ink)
                Spacer()
                Text("\(count) / \(total)").font(.specLarge).monospacedDigit().foregroundStyle(Color.ink).contentTransition(.numericText())
            }
            TutorialProgressThread(steps: t.steps, done: done, current: nil) { i in reader = TutorialReaderStart(index: i) }
            Text(completedAt != nil ? "Nachgebaut – stark!" : count == total && total > 0 ? "Alle Schritte erledigt." : remaining > 0 && count > 0 ? "Noch ca. \(Fmt.minutes(remaining))" : "Gesamt ca. \(Fmt.minutes(t.minutes ?? t.totalStepMinutes))")
                .font(.wr(.footnote)).foregroundStyle(Color.muted)
            HStack(spacing: 10) {
                Button { reader = TutorialReaderStart(index: count == total ? 0 : next) } label: {
                    Label(count == 0 ? "Lesemodus starten" : count == total ? "Nochmal lesen" : "Weiter bei Schritt \(next + 1)", systemImage: "book.pages")
                }
                .primaryButton()
                .disabled(total == 0)
                if count > 0 && completedAt == nil && t.preview != true {
                    Button { confirmReset = true } label: {
                        Image(systemName: "arrow.counterclockwise").font(.wr(.body, .semibold)).frame(width: 30, height: 30)
                    }
                    .buttonStyle(.glass)
                    .buttonBorderShape(.circle)
                    .controlSize(.large)
                    .accessibilityLabel("Fortschritt zurücksetzen")
                }
            }
        }
        .padding(16)
        .cardSurface()
    }

    // MARK: Material

    private func materialsSection(_ t: TutorialPage, number: String) -> some View {
        let materials = t.materials ?? []
        let tools = t.tools ?? []
        return ProjectsSection(title: "Material & Werkzeug", number: number) {
            if materials.isEmpty && tools.isEmpty {
                Text("Keine Materialliste hinterlegt.").font(.wr(.subheadline)).foregroundStyle(Color.muted)
            } else {
                if !materials.isEmpty {
                    ProjectsSpecTable(title: "Material", rows: materials.enumerated().map { .init(id: "m\($0.offset)", name: $0.element.name, quantity: $0.element.quantity, note: $0.element.note) })
                }
                if !tools.isEmpty {
                    ProjectsSpecTable(title: "Werkzeug", rows: tools.enumerated().map { .init(id: "t\($0.offset)", name: $0.element.name, quantity: nil, note: $0.element.note) }, showQuantity: false)
                        .padding(.top, 6)
                }
                Button { router.present(.shoppingListPicker(kind: "TUTORIAL", id: t.id, title: t.title)) } label: {
                    Label("Auf Einkaufsliste", systemImage: "cart.badge.plus").font(.wr(.subheadline, .semibold)).frame(maxWidth: .infinity)
                }
                .buttonStyle(.glass)
                .controlSize(.large)
                .padding(.top, 4)
            }
        }
    }

    // MARK: Schritte (Übersicht)

    private func stepsSection(_ t: TutorialPage, number: String) -> some View {
        ProjectsSection(title: "Schritte", number: number, subtitle: Fmt.plural(t.steps.count, "Schritt", "Schritte")) {
            VStack(spacing: 0) {
                ForEach(Array(t.steps.enumerated()), id: \.element.id) { i, s in
                    let isDone = done.contains(s.stableKey)
                    Button { reader = TutorialReaderStart(index: i) } label: {
                        HStack(alignment: .firstTextBaseline, spacing: 12) {
                            Text(String(format: "%02d", i + 1))
                                .font(.wr(.title3, .semibold)).monospacedDigit()
                                .foregroundStyle(isDone ? Color.moss : Color.ink)
                                .frame(width: 34, alignment: .leading)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(s.title).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink).multilineTextAlignment(.leading)
                                HStack(spacing: 8) {
                                    if let m = s.minutes, m > 0 { Label(Fmt.minutes(m), systemImage: "clock").labelStyle(.compact) }
                                    if !(s.safetyKinds ?? []).isEmpty || s.safety?.nilIfEmpty != nil {
                                        Label("Sicherheit", systemImage: "exclamationmark.triangle.fill").labelStyle(.compact).foregroundStyle(Color.danger)
                                    }
                                    if !(s.media ?? []).isEmpty { Label("\(s.media?.count ?? 0)", systemImage: "photo").labelStyle(.compact) }
                                }
                                .font(.wr(.caption2)).foregroundStyle(Color.muted)
                            }
                            Spacer(minLength: 8)
                            Image(systemName: isDone ? "checkmark.circle.fill" : "circle")
                                .font(.wr(.title3))
                                .foregroundStyle(isDone ? Color.moss : Color.lineStrong)
                                .contentTransition(.symbolEffect(.replace))
                        }
                        .padding(.vertical, 12)
                        .contentShape(.rect)
                    }
                    .buttonStyle(.pressable)
                    .hairline()
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("Schritt \(i + 1): \(s.title)\(isDone ? ", erledigt" : "")")
                    .accessibilityHint("Im Lesemodus öffnen")
                }
            }
        }
    }

    // MARK: Verknüpft

    @ViewBuilder private func linkedSection(_ t: TutorialPage) -> some View {
        let products = t.products ?? []
        if t.project != nil || !products.isEmpty {
            ProjectsSection(title: "Am Faden", number: nil, subtitle: "Projekt und Produkte zu dieser Anleitung") {
                VStack(alignment: .leading, spacing: 14) {
                    if let p = t.project {
                        LinkedThreadRow(kicker: "Projekt\(p.ownerName.map { " · \($0)" } ?? "")\(p.status.map { " · \(L.projectStatus($0))" } ?? "")", title: p.title, seed: p.id, category: p.category ?? t.category, url: p.coverUrl) {
                            router.open(href: p.href)
                        }
                    }
                    ForEach(products) { pr in
                        LinkedThreadRow(kicker: "Produkt · \(Fmt.money(pr.priceMinor, currency: pr.currency))\(pr.soldOut == true ? " · Ausverkauft" : "")", title: pr.title, seed: pr.id, category: t.category, url: pr.coverUrl) {
                            router.open(href: pr.href)
                        }
                    }
                }
            }
        }
    }

    // MARK: Abschluss

    private func finishCard(_ t: TutorialPage) -> some View {
        let total = t.steps.count
        let count = t.steps.filter { done.contains($0.stableKey) }.count
        return VStack(alignment: .leading, spacing: 12) {
            SpecLabel("Ende der Anleitung", color: .ink)
            Text(completedAt != nil ? "Nachgebaut – stark!" : count == total && total > 0 ? "Alle Schritte erledigt." : "Fertig gebaut?")
                .font(.headlineSerif).foregroundStyle(Color.ink)
            Text(completedAt != nil ? "Zeig, wie dein Stück geworden ist: Lege ein eigenes Projekt an. Es verweist auf das Original." : "Markiere die Anleitung als nachgebaut und dokumentiere deine Version als Projekt – mit deinen Abweichungen.")
                .font(.wr(.subheadline)).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
            if completedAt != nil {
                ThreeCanvas(scene: .knot(color: .moss), celebrateToken: celebrate)
                    .frame(height: 180)
                    .frame(maxWidth: .infinity)
            }
            VStack(spacing: 10) {
                if completedAt == nil && !t.isOwner && t.preview != true {
                    AsyncButton { await complete(t) } label: { Label("Als nachgebaut markieren", systemImage: "checkmark.seal") }
                        .primaryButton()
                }
                if !t.isOwner {
                    Button { remix(t) } label: {
                        Label("Eigenes Nachbauprojekt erstellen", systemImage: "arrow.triangle.branch").font(.wr(.subheadline, .semibold)).frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.glass)
                    .controlSize(.large)
                }
            }
        }
        .padding(18)
        .cardSurface()
    }

    // MARK: Aktionsleiste & Menü

    private func actionBar(_ t: TutorialPage) -> some View {
        let next = t.steps.firstIndex { !done.contains($0.stableKey) }
        return GlassEffectContainer(spacing: 10) {
            HStack(spacing: 10) {
                HStack(spacing: 16) {
                    LikeButton(type: "TUTORIAL", id: t.id, liked: t.viewer?.liked ?? false, count: t.counts?.likes ?? 0)
                    SaveButton(type: "TUTORIAL", id: t.id, saved: t.viewer?.saved ?? false)
                    if let url = AppConfig.resolve(t.href ?? "/anleitungen/\(t.slug)") {
                        ShareLink(item: url, subject: Text(t.title)) {
                            Image(systemName: "square.and.arrow.up").font(.wr(.subheadline)).foregroundStyle(Color.ink2).frame(minWidth: 32, minHeight: 32)
                        }
                        .accessibilityLabel("Teilen")
                    }
                }
                .padding(.horizontal, 18)
                .frame(minHeight: 50)
                .glassEffect(.regular.interactive(), in: Capsule())
                .id(t.id)
                Spacer(minLength: 0)
                Button { reader = TutorialReaderStart(index: next ?? 0) } label: {
                    Label(next == nil || next == 0 ? "Lesen" : "Schritt \((next ?? 0) + 1)", systemImage: "book.pages")
                        .font(.wr(.subheadline, .semibold)).padding(.horizontal, 4).frame(minHeight: 36)
                }
                .buttonStyle(.glassProminent)
                .tint(.moss)
                .controlSize(.large)
                .disabled(t.steps.isEmpty)
                .accessibilityLabel("Schritt-für-Schritt-Lesemodus öffnen")
            }
        }
        .padding(.horizontal, Space.gutter)
        .padding(.bottom, 6)
    }

    private func moreMenu(_ t: TutorialPage) -> some View {
        Menu {
            if t.isOwner {
                Button("Bearbeiten", systemImage: "pencil") { router.present(.tutorialEditor(id: t.id)) }
                if t.preview != true {
                    if t.state == "PUBLISHED" {
                        Button("Zurückziehen", systemImage: "eye.slash") { Task { await setPublished(false, t) } }
                    } else if t.state == "DRAFT" {
                        Button("Veröffentlichen", systemImage: "paperplane") { Task { await setPublished(true, t) } }
                    }
                }
                if let url = AppConfig.resolve(t.href ?? "/anleitungen/\(t.slug)") { ShareLink(item: url) { Label("Teilen", systemImage: "square.and.arrow.up") } }
                Divider()
                Button("Anleitung löschen", systemImage: "trash", role: .destructive) { confirmDelete = true }
            } else {
                Button("Nachbauen", systemImage: "arrow.triangle.branch") { remix(t) }
                Button("Auf Einkaufsliste", systemImage: "cart.badge.plus") { router.present(.shoppingListPicker(kind: "TUTORIAL", id: t.id, title: t.title)) }
                Button("In Sammlung speichern …", systemImage: "folder.badge.plus") { router.present(.collectionPicker(type: "TUTORIAL", id: t.id)) }
                Divider()
                SafetyMenuItems(targetType: "TUTORIAL", targetId: t.id, authorId: t.author.id, authorName: t.author.displayName, shareURL: AppConfig.resolve(t.href ?? "/anleitungen/\(t.slug)"))
            }
        } label: { Image(systemName: "ellipsis") }
        .accessibilityLabel("Weitere Aktionen zur Anleitung")
    }

    // MARK: - Daten & Aktionen

    private func load() async {
        do {
            let t: TutorialPage = try await APIClient.shared.get("/tutorials/by-slug/\(slug)")
            withAnimation(.snappy) {
                page = t
                error = nil
                notFound = false
                done = Set(t.viewer?.completedKeys ?? [])
                completedAt = t.viewer?.completedAt
                versionSeen = t.viewer?.versionSeen
            }
            if !tracked {
                tracked = true
                SocialAPI.track("TUTORIAL", t.id)
            }
        } catch is CancellationError {
        } catch let e as APIError where e.status == 404 || e.code == "NOT_FOUND" {
            notFound = true
        } catch {
            if page == nil { self.error = (error as? APIError)?.message ?? error.localizedDescription } else { app.show(error: error) }
        }
    }

    private func toggle(_ step: TutorialPageStep, _ t: TutorialPage) async {
        guard t.preview != true else { app.show("In der Vorschau wird kein Fortschritt gespeichert.", style: .info); return }
        let next = !done.contains(step.stableKey)
        Haptics.tap()
        withAnimation(.spring(duration: 0.4, bounce: 0.3)) {
            if next { done.insert(step.stableKey) } else { done.remove(step.stableKey) }
        }
        do {
            let r: TutorialProgressResult = try await APIClient.shared.post("/tutorials/\(t.id)/steps/\(step.stableKey)", ["done": JSONValue.bool(next)])
            withAnimation(.snappy) { done = Set(r.completedKeys) }
            if next, let total = r.total, r.completedKeys.count == total { Haptics.success() }
        } catch {
            withAnimation { if next { done.remove(step.stableKey) } else { done.insert(step.stableKey) } }
            app.show(error: error)
        }
    }

    private func complete(_ t: TutorialPage) async {
        let ok = await app.run("Als nachgebaut markiert.") {
            _ = try await APIClient.shared.post("/tutorials/\(t.id)/complete") as JSONValue
        }
        if ok {
            Haptics.success()
            withAnimation(.snappy) {
                completedAt = Date()
                done = Set(t.steps.map(\.stableKey))
            }
            celebrate += 1
        }
    }

    private func reset(_ t: TutorialPage) async {
        let ok = await app.run("Fortschritt zurückgesetzt.") {
            _ = try await APIClient.shared.post("/tutorials/\(t.id)/reset") as JSONValue
        }
        if ok { withAnimation(.snappy) { done = [] } }
    }

    private func markSeen(_ t: TutorialPage) async {
        do {
            struct Seen: Decodable { var versionSeen: Int? }
            let r: Seen = try await APIClient.shared.post("/tutorials/\(t.id)/seen")
            withAnimation(.snappy) { versionSeen = r.versionSeen ?? t.version?.number }
        } catch { app.show(error: error) }
    }

    private func setPublished(_ published: Bool, _ t: TutorialPage) async {
        let ok = await app.run(published ? "Anleitung veröffentlicht." : "Anleitung zurückgezogen. Sie ist nicht mehr öffentlich.") {
            _ = try await APIClient.shared.post("/tutorials/\(t.id)/published", ["published": JSONValue.bool(published)]) as JSONValue
        }
        if ok { await load() }
    }

    private func deleteTutorial() async {
        guard let t = page else { return }
        let ok = await app.run("Anleitung gelöscht.") {
            _ = try await APIClient.shared.delete("/tutorials/\(t.id)") as JSONValue
        }
        if ok { dismiss() }
    }

    /// „Nachbauen“ = eigenes Projekt, das auf das verknüpfte Projekt verweist.
    private func remix(_ t: TutorialPage) {
        let target: SheetRoute = t.project.map { .projectEditor(remixOf: $0.id) } ?? .projectEditor()
        if reader != nil {
            reader = nil
            Task {
                try? await Task.sleep(for: .milliseconds(450))
                router.present(target)
            }
        } else {
            router.present(target)
        }
    }
}

struct TutorialReaderStart: Identifiable, Hashable {
    var index: Int
    var id: Int { index }
}

// MARK: - Sicherheitskarte

struct TutorialSafetyCard: View {
    var kind: String
    var body: some View {
        let s = L.safety(kind)
        HStack(alignment: .center, spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color.danger).frame(width: 44, height: 44)
                Image(systemName: s.symbol).font(.wr(.title3, .semibold)).foregroundStyle(Color.paper)
            }
            VStack(alignment: .leading, spacing: 2) {
                SpecLabel("Achtung", color: .danger)
                Text(s.label).font(.wr(.headline)).foregroundStyle(Color.ink)
                Text(Self.advice(kind)).font(.wr(.caption)).foregroundStyle(Color.ink2).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(Color.danger.opacity(0.08), in: .rect(cornerRadius: Radius.inner, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radius.inner, style: .continuous).strokeBorder(Color.danger.opacity(0.35), lineWidth: 1))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Sicherheitshinweis: \(s.label). \(Self.advice(kind))")
    }

    static func advice(_ kind: String) -> String {
        switch kind {
        case "ELECTRICITY": "Nur mit Schutzkleinspannung und geprüften Netzteilen arbeiten."
        case "HEAT": "Heisse Werkzeuge sicher ablegen, hitzefeste Unterlage verwenden."
        case "CHEMICALS": "Handschuhe tragen, gut lüften, Herstellerangaben beachten."
        case "SHARP_TOOLS": "Vom Körper weg schneiden, Klingen sicher verwahren."
        case "POWER_TOOLS": "Schutzbrille und Gehörschutz tragen, Werkstück fixieren."
        case "CHILDREN": "Kleinteile und Normen für Kinderprodukte beachten."
        case "DUST": "Staubmaske tragen und für Absaugung oder Lüftung sorgen."
        default: "Bitte die Hinweise im Schritt beachten."
        }
    }
}

// MARK: - Fortschrittsfaden

/// Ein Faden über alle Schritte, der mit jedem Haken wächst. Knoten = Schritte.
struct TutorialProgressThread: View {
    var steps: [TutorialPageStep]
    var done: Set<String>
    var current: Int?
    var onTap: ((Int) -> Void)? = nil

    var body: some View {
        let total = max(steps.count, 1)
        let count = steps.filter { done.contains($0.stableKey) }.count
        let fraction = CGFloat(count) / CGFloat(total)
        GeometryReader { g in
            let w = g.size.width
            let inset: CGFloat = 8
            let usable = max(w - inset * 2, 1)
            ZStack(alignment: .leading) {
                Capsule().fill(Color.line).frame(height: 3).padding(.horizontal, inset)
                Capsule().fill(Color.moss).frame(width: max(0, usable * fraction), height: 3).padding(.leading, inset)
                ForEach(Array(steps.enumerated()), id: \.element.id) { i, s in
                    let x = inset + (steps.count == 1 ? usable : usable * CGFloat(i) / CGFloat(max(steps.count - 1, 1)))
                    let isDone = done.contains(s.stableKey)
                    let isCurrent = current == i
                    ZStack {
                        Circle().fill(isDone ? Color.moss : Color.paper).frame(width: isCurrent ? 14 : 10, height: isCurrent ? 14 : 10)
                        Circle().strokeBorder(isCurrent ? Color.ink : (isDone ? Color.moss : Color.lineStrong), lineWidth: isCurrent ? 2 : 1.5)
                            .frame(width: isCurrent ? 14 : 10, height: isCurrent ? 14 : 10)
                    }
                    .frame(width: 28, height: 28)
                    .contentShape(Circle())
                    .position(x: x, y: g.size.height / 2)
                    .onTapGesture { onTap?(i) }
                }
            }
            .animation(.spring(duration: 0.5, bounce: 0.2), value: count)
            .animation(.snappy, value: current)
        }
        .frame(height: 28)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Fortschritt")
        .accessibilityValue("\(count) von \(steps.count) Schritten erledigt")
    }
}
