import SwiftUI

/// Projektseite (PRD §10.4) – das Herzstück: Titel, Datenblatt, **Projektfaden** (3D + Zeitleiste),
/// Material & Werkzeug, Verknüpfungen, Nachbauten, Fragen. `GET /projects/by/:handle/:slug`
struct ProjectDetailView: View {
    var handle: String
    var slug: String

    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @Environment(\.dismiss) private var dismiss

    @State private var currentHandle: String?
    @State private var currentSlug: String?
    @State private var page: ProjectPage?
    @State private var error: String?
    @State private var notFound = false
    @State private var tracked = false
    @State private var highlight: Int?
    @State private var followingProject = false
    @State private var projectFollowers = 0
    @State private var confirmDeleteProject = false
    @State private var entryToDelete: ProjectJournalEntry?
    @State private var viewerMedia: MediaItem?
    @State private var heroIndex = 0
    @State private var redirects = 0

    var body: some View {
        Group {
            if let page {
                content(page)
            } else if notFound {
                EmptyStateView(symbol: "questionmark.folder", title: "Projekt nicht gefunden", message: "Vielleicht wurde es gelöscht, umbenannt oder ist nicht öffentlich.", actionTitle: "Zurück") { dismiss() }
                    .frame(maxHeight: .infinity)
            } else if let error {
                ErrorStateView(message: error) { await load() }
            } else {
                LoadingView(text: "Projektfaden wird geladen …").frame(maxHeight: .infinity)
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
        .confirmationDialog("Projekt endgültig löschen?", isPresented: $confirmDeleteProject, titleVisibility: .visible) {
            Button("Projekt löschen", role: .destructive) { Task { await deleteProject() } }
            Button("Abbrechen", role: .cancel) {}
        } message: {
            Text("Journal, Galerie und Materialliste werden entfernt. Verknüpfte Beiträge und Anleitungen bleiben bestehen.")
        }
        .confirmationDialog("Diesen Journaleintrag löschen?", isPresented: Binding(get: { entryToDelete != nil }, set: { if !$0 { entryToDelete = nil } }), titleVisibility: .visible) {
            Button("Eintrag löschen", role: .destructive) {
                if let e = entryToDelete { Task { await deleteEntry(e) } }
            }
            Button("Abbrechen", role: .cancel) { entryToDelete = nil }
        } message: {
            Text("Ein geteilter Feed-Beitrag bleibt bestehen.")
        }
    }

    // MARK: - Aufbau

    private enum Block: Hashable { case idea, sheet, thread, materials, linked, remix }

    private func blocks(_ p: ProjectPage) -> [Block] {
        var b: [Block] = [.idea, .sheet, .thread, .materials]
        if hasLinks(p) || p.isOwner { b.append(.linked) }
        b.append(.remix)
        return b
    }

    private func number(_ b: Block, in p: ProjectPage) -> String {
        String(format: "%02d", (blocks(p).firstIndex(of: b) ?? 0) + 1)
    }

    private func hasLinks(_ p: ProjectPage) -> Bool {
        !(p.tutorials ?? []).isEmpty || !(p.products ?? []).isEmpty || !(p.articles ?? []).isEmpty || !(p.posts ?? []).isEmpty
    }

    private func content(_ p: ProjectPage) -> some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    hero(p)
                    header(p)
                        .padding(.horizontal, Space.gutter)
                        .padding(.top, 22)
                        .padding(.bottom, 28)
                    ideaSection(p)
                    sheetSection(p)
                    threadSection(p, proxy: proxy).id("thread")
                    materialsSection(p)
                    if blocks(p).contains(.linked) { linkedSection(p) }
                    remixSection(p)
                    CommentsSection(type: "PROJECT", id: p.id, title: "Fragen & Kommentare", placeholder: "Frage stellen oder Feedback geben …", initial: p.comments)
                        .padding(.horizontal, Space.gutter)
                        .padding(.vertical, 28)
                        .hairline(.top)
                }
                .padding(.bottom, 24)
            }
            .refreshable { await load() }
            .safeAreaInset(edge: .bottom) { actionBar(p) }
            .fullScreenCover(item: $viewerMedia) { m in MediaViewer(media: p.galleryItems, start: m) }
        }
    }

    // MARK: Hero

    @ViewBuilder private func hero(_ p: ProjectPage) -> some View {
        let media = p.galleryItems
        let color = CategoryPalette.color(for: p.category)
        if !media.isEmpty {
            TabView(selection: $heroIndex) {
                ForEach(Array(media.enumerated()), id: \.element.id) { i, m in
                    RemoteImage(path: m.displayURL) { ThreadPlate(seed: p.id, category: p.category) }
                        .frame(maxWidth: .infinity)
                        .clipped()
                        .overlay { if m.isVideo { Image(systemName: "play.circle.fill").font(.wr(size: 54)).foregroundStyle(.white.opacity(0.9)) } }
                        .contentShape(.rect)
                        .onTapGesture { viewerMedia = m }
                        .accessibilityLabel(m.alt?.nilIfEmpty ?? "Projektbild \(i + 1) von \(media.count)")
                        .accessibilityAddTraits([.isImage, .isButton])
                        .tag(i)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: media.count > 1 ? .always : .never))
            .frame(height: 430)
            .overlay(alignment: .bottomTrailing) {
                if media.count > 1 {
                    Text("\(heroIndex + 1) / \(media.count)")
                        .font(.wr(size: 11, weight: .semibold)).monospacedDigit()
                        .foregroundStyle(Color.ink)
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .glassEffect(.regular, in: Capsule())
                        .padding(14)
                        .accessibilityHidden(true)
                }
            }
        } else if let c = p.coverUrl {
            RemoteImage(path: c) { ThreadPlate(seed: p.id, category: p.category) }
                .frame(maxWidth: .infinity)
                .frame(height: 400)
                .clipped()
                .accessibilityLabel("Titelbild von \(p.title)")
        } else {
            ZStack(alignment: .bottomLeading) {
                ThreadPlate(seed: p.id, category: p.category, showLabel: false, lineWidth: 0.8)
                    .opacity(0.35)
                ThreeCanvas(scene: .glyph(app.category(p.category)?.glyph, color: color, seed: Int(p.id.stableHash % 997)))
                HStack {
                    Text(String(format: "Nº %03d", Int(p.id.stableHash % 997)))
                    Spacer()
                    Text(app.categoryShort(p.category).uppercased())
                }
                .font(.wr(size: 10, weight: .semibold))
                .tracking(1)
                .foregroundStyle(color)
                .padding(.horizontal, Space.gutter)
                .padding(.bottom, 14)
                .accessibilityHidden(true)
            }
            .frame(height: 340)
            .background(CategoryPalette.soft(for: p.category))
        }
    }

    // MARK: Kopf

    private func header(_ p: ProjectPage) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .center) {
                SpecLabel("Projekt · \(app.categoryShort(p.category))", color: CategoryPalette.color(for: p.category))
                Spacer()
                StatusBadge(status: p.status)
            }
            Text(p.title)
                .font(.display(34))
                .foregroundStyle(Color.ink)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)

            if let r = p.remixOf {
                Button { router.open(href: r.href) } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.triangle.branch").font(.wr(.caption, .semibold))
                        Text("Nachbau von «\(r.title)»\(r.ownerName.map { " · \($0)" } ?? "")")
                            .font(.wr(.footnote, .medium))
                            .multilineTextAlignment(.leading)
                    }
                    .foregroundStyle(Color.moss)
                }
                .buttonStyle(.plain)
            }

            HStack(spacing: 12) {
                Button { router.open(.profile(handle: p.owner.handle)) } label: {
                    HStack(spacing: 10) {
                        AvatarView(url: p.owner.avatarUrl, name: p.owner.displayName, size: 40)
                        VStack(alignment: .leading, spacing: 1) {
                            SpecLabel("Gebaut von")
                            Text(p.owner.displayName).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink)
                            if let c = p.contributors, !c.isEmpty {
                                Text("mit " + c.map(\.displayName).joined(separator: ", ")).font(.wr(.caption)).foregroundStyle(Color.muted).lineLimit(1)
                            }
                        }
                    }
                }
                .buttonStyle(.pressable)
                .accessibilityHint("Profil öffnen")
                Spacer(minLength: 0)
                if !p.isOwner {
                    FollowButton(userId: p.owner.id, following: p.viewer?.followingOwner ?? false, compact: true)
                }
            }

            HStack(spacing: 0) {
                StatCell(value: Fmt.number(p.counts?.likes), label: "Gefällt").frame(maxWidth: .infinity, alignment: .leading)
                StatCell(value: Fmt.number(p.counts?.saves), label: "Gemerkt").frame(maxWidth: .infinity, alignment: .leading)
                StatCell(value: Fmt.number(p.counts?.remixes), label: "Nachbauten").frame(maxWidth: .infinity, alignment: .leading)
                StatCell(value: Fmt.number(p.journal.count), label: "Einträge").frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.vertical, 14)
            .hairline(.top)
            .hairline(.bottom)

            if p.state == "HIDDEN" {
                NoticeView(tone: .warn, title: "Von der Moderation ausgeblendet", message: "Dieses Projekt ist derzeit nur für dich sichtbar. Details findest du in deinen Benachrichtigungen.")
            } else if p.state == "DRAFT" {
                NoticeView(tone: .info, title: "Entwurf", message: "Nur für dich sichtbar.")
            } else if p.isOwner && p.visibility == "PRIVATE" {
                NoticeView(tone: .info, message: "Nur du siehst dieses Projekt.")
            } else if p.isOwner && p.visibility == "FOLLOWERS" {
                NoticeView(tone: .info, message: "Nur Menschen, die dir folgen, sehen dieses Projekt.")
            }
        }
    }

    // MARK: 01 Idee

    private func ideaSection(_ p: ProjectPage) -> some View {
        ProjectsSection(title: "Idee & Beschreibung", number: number(.idea, in: p)) {
            if let d = p.description?.nilIfEmpty {
                Text(d).font(.wr(.body)).foregroundStyle(Color.ink2).lineSpacing(3).fixedSize(horizontal: false, vertical: true).textSelection(.enabled)
            } else {
                Text(p.isOwner ? "Noch keine Beschreibung. Erzähle, was dich zu diesem Projekt gebracht hat." : "Keine Beschreibung.")
                    .font(.wr(.subheadline)).foregroundStyle(Color.muted)
            }
            if let tags = p.tags, !tags.isEmpty { TagList(tags: tags) }
        }
    }

    // MARK: 02 Datenblatt

    private func sheetSection(_ p: ProjectPage) -> some View {
        ProjectsSection(title: "Datenblatt", number: number(.sheet, in: p)) {
            VStack(spacing: 0) {
                if let d = p.difficulty {
                    HStack(spacing: 10) {
                        Image(systemName: "gauge.with.dots.needle.33percent").font(.wr(.footnote)).foregroundStyle(Color.muted).frame(width: 18)
                        Text("Schwierigkeit").font(.wr(.subheadline)).foregroundStyle(Color.muted)
                        Spacer(minLength: 12)
                        DifficultyMeter(level: d)
                    }
                    .padding(.vertical, 10)
                    .hairline()
                }
                SpecRow(label: "Geschätzte Zeit", value: Fmt.minutes(p.estimatedMinutes), symbol: "hourglass")
                SpecRow(label: "Tatsächliche Zeit", value: Fmt.minutes(p.actualMinutes), symbol: "stopwatch")
                SpecRow(label: "Laut Journal", value: Fmt.minutes(p.journalMinutes), symbol: "point.3.connected.trianglepath.dotted")
                SpecRow(label: "Budget", value: p.budgetMinor.map { Fmt.money($0, currency: p.currency) } ?? "–", symbol: "banknote")
                SpecRow(label: "Kategorie", value: app.categoryName(p.category), symbol: CategoryPalette.symbol(for: app.category(p.category)?.glyph))
                SpecRow(label: "Status", value: L.projectStatus(p.status), symbol: ProjectsStatusStyle.symbol(p.status))
                if p.isOwner, let v = p.visibility {
                    SpecRow(label: "Sichtbarkeit", value: L.visibility(v), symbol: ProjectsStatusStyle.visibilitySymbol(v))
                }
                SpecRow(label: "Begonnen", value: Fmt.date(p.createdAt ?? p.publishedAt), symbol: "calendar")
                if let c = p.completedAt { SpecRow(label: "Abgeschlossen", value: Fmt.date(c), symbol: "checkmark.seal") }
                SpecRow(label: "Zuletzt aktiv", value: Fmt.relative(p.updatedAt), symbol: "clock.arrow.circlepath")
                SpecRow(label: "Aufrufe", value: Fmt.number(p.counts?.views), symbol: "eye")
                SpecRow(label: "Folgen dem Projekt", value: Fmt.number(projectFollowers), symbol: "bell")
            }
        }
    }

    // MARK: 03 Projektfaden

    private func threadSection(_ p: ProjectPage, proxy: ScrollViewProxy) -> some View {
        let color = CategoryPalette.color(for: p.category)
        let nodes = p.journal.map(\.nodeKind)
        let remixCount = max(p.remixes?.count ?? 0, p.counts?.remixes ?? 0)
        return ProjectsSection(
            title: "Projektfaden",
            number: number(.thread, in: p),
            subtitle: "\(Fmt.plural(p.journal.count, "Eintrag", "Einträge")) · \(Fmt.minutes(p.journalMinutes)) Arbeitszeit"
        ) {
            VStack(alignment: .leading, spacing: 10) {
                ThreeCanvas(
                    scene: .journal(nodes: nodes, remixes: remixCount, status: p.status, color: color, highlight: highlight),
                    onEvent: { type, body in
                        guard type == "node" else { return }
                        let raw = body["index"]
                        let i = (raw as? Int) ?? (raw as? Double).map { Int($0) } ?? (raw as? NSNumber)?.intValue
                        guard let i, let e = p.journal[safe: i] else { return }
                        Haptics.selection()
                        highlight = i
                        withAnimation(.smooth(duration: 0.5)) { proxy.scrollTo("journal-\(e.id)", anchor: .top) }
                    }
                )
                .id("scene-\(nodes.joined(separator: ","))-\(remixCount)-\(p.status)")
                .frame(height: 280)
                .background(Color.sunken, in: .rect(cornerRadius: Radius.card, style: .continuous))
                .overlay(alignment: .topLeading) {
                    SpecLabel(p.status == "COMPLETED" ? "Faden abgeschlossen" : "Faden läuft", color: color).padding(14)
                }
                .overlay(alignment: .bottomLeading) { legend(remixes: remixCount).padding(12) }
                .clipShape(.rect(cornerRadius: Radius.card, style: .continuous))

                if !p.journal.isEmpty {
                    Text("Tippe auf einen Knoten, um zum Eintrag zu springen. Ziehen dreht den Faden.")
                        .font(.wr(.caption)).foregroundStyle(Color.muted)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Projektfaden in 3D mit \(Fmt.plural(p.journal.count, "Eintrag", "Einträgen"))\(remixCount > 0 ? " und \(Fmt.plural(remixCount, "Nachbau", "Nachbauten"))" : "")")

            if p.isOwner {
                Button { router.present(.journalEntry(projectId: p.id, projectTitle: p.title)) } label: {
                    Label("Fortschritt eintragen", systemImage: "plus")
                        .font(.wr(.subheadline, .semibold))
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.glass)
                .controlSize(.large)
            }

            if p.journal.isEmpty {
                Text(p.isOwner ? "Halte hier deine Arbeitsschritte fest – mit Fotos, Zeit und auch mit dem, was nicht geklappt hat." : "Noch keine Journaleinträge.")
                    .font(.wr(.subheadline)).foregroundStyle(Color.muted)
                    .padding(.vertical, 4)
            }
            ProjectThreadTimeline(
                entries: p.journal,
                status: p.status,
                startedAt: p.createdAt ?? p.publishedAt,
                completedAt: p.completedAt,
                ownerId: p.owner.id,
                color: color,
                highlighted: highlight,
                onSelect: { i in withAnimation(.snappy) { highlight = i } },
                onDelete: { entryToDelete = $0 }
            )
            .padding(.top, 8)
        }
    }

    private func legend(remixes: Int) -> some View {
        HStack(spacing: 12) {
            legendItem("Meilenstein") { Circle().fill(Color.clay).frame(width: 8, height: 8) }
            legendItem("Problem") { Circle().strokeBorder(Color.ochre, lineWidth: 2).frame(width: 9, height: 9) }
            legendItem("Eintrag") { Circle().fill(Color.moss).frame(width: 7, height: 7) }
            if remixes > 0 { legendItem("Nachbau") { Capsule().fill(Color.muted).frame(width: 12, height: 2) } }
        }
        .padding(.horizontal, 10).padding(.vertical, 6)
        .background(Color.paper.opacity(0.85), in: Capsule())
    }

    private func legendItem(_ label: String, @ViewBuilder mark: () -> some View) -> some View {
        HStack(spacing: 4) {
            mark()
            Text(label).font(.wr(size: 10, weight: .medium)).foregroundStyle(Color.ink2)
        }
    }

    // MARK: 04 Material & Werkzeug

    private func materialsSection(_ p: ProjectPage) -> some View {
        let materials = p.materials ?? []
        let tools = p.tools ?? []
        return ProjectsSection(title: "Material & Werkzeug", number: number(.materials, in: p), subtitle: materials.isEmpty && tools.isEmpty ? nil : "\(Fmt.plural(materials.count, "Material", "Materialien")) · \(Fmt.plural(tools.count, "Werkzeug", "Werkzeuge"))") {
            if materials.isEmpty && tools.isEmpty {
                Text(p.isOwner ? "Noch keine Materialliste. Ergänze sie über «Bearbeiten», damit andere direkt einkaufen können." : "Keine Materialliste hinterlegt.")
                    .font(.wr(.subheadline)).foregroundStyle(Color.muted)
            } else {
                if !materials.isEmpty {
                    ProjectsSpecTable(title: "Material", rows: materials.map { .init(id: $0.id, name: $0.name, quantity: $0.quantity, note: $0.note, safety: $0.safetyInfo) })
                }
                if !tools.isEmpty {
                    ProjectsSpecTable(title: "Werkzeug", rows: tools.map { .init(id: $0.id, name: $0.name, quantity: nil, note: $0.note, safety: $0.safetyInfo) }, showQuantity: false)
                        .padding(.top, 6)
                }
                VStack(spacing: 10) {
                    Button { router.present(.shoppingListPicker(kind: "PROJECT", id: p.id, title: p.title)) } label: {
                        Label("Auf Einkaufsliste", systemImage: "cart.badge.plus").font(.wr(.subheadline, .semibold)).frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.glass)
                    .controlSize(.large)
                    if !p.isOwner && !materials.isEmpty {
                        Button { router.present(.projectEditor(remixOf: p.id)) } label: {
                            Label("Nachbau mit dieser Materialliste starten", systemImage: "arrow.triangle.branch").font(.wr(.footnote, .semibold)).foregroundStyle(Color.moss)
                        }
                        .buttonStyle(.plain)
                        .frame(minHeight: 36)
                    }
                }
                .padding(.top, 4)
            }
        }
    }

    // MARK: 05 Verknüpft

    private func linkedSection(_ p: ProjectPage) -> some View {
        ProjectsSection(title: "Am Faden", number: number(.linked, in: p), subtitle: "Anleitungen, Produkte, Artikel und Beiträge zu diesem Projekt") {
            VStack(alignment: .leading, spacing: 14) {
                ForEach(p.tutorials ?? []) { t in
                    LinkedThreadRow(
                        kicker: "Anleitung\(t.steps.map { " · \($0) Schritte" } ?? "")\(t.state == "DRAFT" ? " · Entwurf" : "")",
                        title: t.title, seed: t.id, category: t.category ?? p.category, url: t.coverUrl
                    ) { router.open(.tutorial(slug: t.slug)) }
                }
                ForEach(p.products ?? []) { pr in
                    LinkedThreadRow(
                        kicker: "Produkt · \(Fmt.money(pr.priceMinor, currency: pr.currency))\(pr.soldOut == true ? " · Ausverkauft" : "")",
                        title: pr.title, seed: pr.id, category: p.category, url: pr.coverUrl
                    ) { router.open(href: pr.href) }
                }
                ForEach(p.articles ?? []) { a in
                    LinkedThreadRow(
                        kicker: "Artikel\(a.readingMinutes.map { " · \($0) Min. Lesezeit" } ?? "")",
                        title: a.title, seed: a.id, category: p.category, url: a.coverUrl
                    ) { router.open(href: a.href) }
                }
                ForEach(p.posts ?? []) { post in
                    LinkedThreadRow(
                        kicker: "Beitrag · \(Fmt.relative(post.publishedAt))",
                        title: post.excerpt?.nilIfEmpty ?? "Beitrag mit Medien", seed: post.id, category: p.category, url: nil
                    ) { router.open(.post(id: post.id)) }
                }
                if p.isOwner {
                    if (p.tutorials ?? []).isEmpty {
                        ownerHint(title: "Noch keine Anleitung", text: "Mach aus deinem Projekt eine Schritt-für-Schritt-Anleitung, damit andere es nachbauen können.", action: "Anleitung schreiben", symbol: "list.number") {
                            router.present(.tutorialEditor(seedProjectId: p.id))
                        }
                    }
                    if app.hasActiveShop && (p.products ?? []).isEmpty {
                        ownerHint(title: "Produkte aus diesem Projekt", text: "Verkaufst du Stücke oder Materialsets dazu? Verknüpfe sie direkt mit dem Faden.", action: "Produkt anlegen", symbol: "tag") {
                            router.present(.productEditor())
                        }
                    }
                }
            }
        }
    }

    private func ownerHint(title: String, text: String, action: String, symbol: String, perform: @escaping () -> Void) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink)
            Text(text).font(.wr(.footnote)).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
            Button(action: perform) {
                Label(action, systemImage: symbol).font(.wr(.footnote, .semibold))
            }
            .buttonStyle(.glass)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .sunkenSurface()
    }

    // MARK: 06 Nachbauten

    private func remixSection(_ p: ProjectPage) -> some View {
        let remixes = p.remixes ?? []
        return ProjectsSection(title: "Nachbauten", number: number(.remix, in: p), subtitle: remixes.isEmpty ? nil : Fmt.plural(remixes.count, "Nachbau", "Nachbauten")) {
            if let r = p.remixOf {
                VStack(alignment: .leading, spacing: 12) {
                    LinkedThreadRow(kicker: "Nachbau von\(r.ownerName.map { " · \($0)" } ?? "")", title: r.title, seed: r.id, category: r.category, url: r.coverUrl) {
                        router.open(href: r.href)
                    }
                    if let dev = (r.deviations?.nilIfEmpty ?? p.remixNote?.nilIfEmpty) {
                        VStack(alignment: .leading, spacing: 4) {
                            SpecLabel("Abweichungen zum Original")
                            Text(dev).font(.wr(.subheadline)).foregroundStyle(Color.ink2).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                .padding(14)
                .cardSurface()
            } else if p.remixOfUnavailable == true {
                NoticeView(tone: .info, title: "Nachbau", message: "Das Original ist nicht mehr öffentlich verfügbar.")
            }

            if remixes.isEmpty {
                Text(p.isOwner ? "Noch hat niemand dein Projekt nachgebaut. Nachbauten erscheinen hier und verweisen auf dein Original." : "Noch keine Nachbauten. Baust du es nach? Dein Projekt verweist dann auf dieses Original – Texte und Dateien werden nicht kopiert.")
                    .font(.wr(.subheadline)).foregroundStyle(Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .top, spacing: 12) {
                        ForEach(remixes) { r in
                            VStack(alignment: .leading, spacing: 6) {
                                ProjectCardView(project: r.card, style: .tile)
                                if let d = r.deviations?.nilIfEmpty {
                                    Text(d).font(.wr(.caption)).foregroundStyle(Color.muted).lineLimit(3)
                                }
                            }
                            .frame(width: 168)
                        }
                    }
                    .padding(.horizontal, Space.gutter)
                }
                .padding(.horizontal, -Space.gutter)
                .scrollClipDisabled()
            }
            if !p.isOwner {
                Button { router.present(.projectEditor(remixOf: p.id)) } label: {
                    Label("Eigenen Nachbau starten", systemImage: "arrow.triangle.branch").font(.wr(.subheadline, .semibold)).frame(maxWidth: .infinity)
                }
                .buttonStyle(.glass)
                .controlSize(.large)
            }
        }
    }

    // MARK: Schwebende Aktionsleiste

    private func actionBar(_ p: ProjectPage) -> some View {
        GlassEffectContainer(spacing: 10) {
            HStack(spacing: 10) {
                HStack(spacing: 16) {
                    LikeButton(type: "PROJECT", id: p.id, liked: p.viewer?.liked ?? false, count: p.counts?.likes ?? 0)
                    SaveButton(type: "PROJECT", id: p.id, saved: p.viewer?.saved ?? false)
                    if !p.isOwner {
                        Button { Task { await toggleFollowProject(p) } } label: {
                            Image(systemName: followingProject ? "bell.fill" : "bell")
                                .font(.wr(.subheadline))
                                .foregroundStyle(followingProject ? Color.moss : Color.ink2)
                                .symbolEffect(.bounce, value: followingProject)
                                .frame(minWidth: 32, minHeight: 32)
                                .contentShape(.rect)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(followingProject ? "Projekt nicht mehr folgen" : "Projekt folgen")
                        .accessibilityHint("Du wirst über neue Einträge benachrichtigt")
                    }
                    if let url = shareURL(p) {
                        ShareLink(item: url, subject: Text(p.title)) {
                            Image(systemName: "square.and.arrow.up").font(.wr(.subheadline)).foregroundStyle(Color.ink2).frame(minWidth: 32, minHeight: 32)
                        }
                        .accessibilityLabel("Teilen")
                    }
                }
                .padding(.horizontal, 18)
                .frame(minHeight: 50)
                .glassEffect(.regular.interactive(), in: Capsule())
                .id(p.id + "\(p.viewer?.liked ?? false)\(p.viewer?.saved ?? false)")

                Spacer(minLength: 0)

                if p.isOwner {
                    Button { router.present(.journalEntry(projectId: p.id, projectTitle: p.title)) } label: {
                        Label("Eintrag", systemImage: "plus").font(.wr(.subheadline, .semibold)).padding(.horizontal, 4).frame(minHeight: 36)
                    }
                    .buttonStyle(.glassProminent)
                    .tint(.moss)
                    .controlSize(.large)
                    .accessibilityLabel("Journal-Eintrag hinzufügen")
                } else {
                    Button { router.present(.projectEditor(remixOf: p.id)) } label: {
                        Label("Nachbauen", systemImage: "arrow.triangle.branch").font(.wr(.subheadline, .semibold)).padding(.horizontal, 4).frame(minHeight: 36)
                    }
                    .buttonStyle(.glassProminent)
                    .tint(.moss)
                    .controlSize(.large)
                }
            }
        }
        .padding(.horizontal, Space.gutter)
        .padding(.bottom, 6)
    }

    // MARK: Menü

    private func moreMenu(_ p: ProjectPage) -> some View {
        Menu {
            if p.isOwner {
                Button("Bearbeiten", systemImage: "pencil") { router.present(.projectEditor(handle: p.owner.handle, slug: p.slug)) }
                Menu("Status ändern", systemImage: ProjectsStatusStyle.symbol(p.status)) {
                    ForEach(L.projectStatus, id: \.key) { s in
                        Button {
                            Task { await setStatus(s.key, p) }
                        } label: {
                            Label(s.label, systemImage: p.status == s.key ? "checkmark" : ProjectsStatusStyle.symbol(s.key))
                        }
                        .disabled(p.status == s.key)
                    }
                }
                Button("Journal-Eintrag", systemImage: "plus.bubble") { router.present(.journalEntry(projectId: p.id, projectTitle: p.title)) }
                Button("Anleitung aus Projekt", systemImage: "list.number") { router.present(.tutorialEditor(seedProjectId: p.id)) }
                if app.hasActiveShop { Button("Produkt anlegen", systemImage: "tag") { router.present(.productEditor()) } }
                Button("Auf Einkaufsliste", systemImage: "cart.badge.plus") { router.present(.shoppingListPicker(kind: "PROJECT", id: p.id, title: p.title)) }
                if let url = shareURL(p) { ShareLink(item: url) { Label("Teilen", systemImage: "square.and.arrow.up") } }
                Divider()
                Button("Projekt löschen", systemImage: "trash", role: .destructive) { confirmDeleteProject = true }
            } else {
                Button("Nachbauen", systemImage: "arrow.triangle.branch") { router.present(.projectEditor(remixOf: p.id)) }
                Button("Auf Einkaufsliste", systemImage: "cart.badge.plus") { router.present(.shoppingListPicker(kind: "PROJECT", id: p.id, title: p.title)) }
                Button("In Sammlung speichern …", systemImage: "folder.badge.plus") { router.present(.collectionPicker(type: "PROJECT", id: p.id)) }
                Divider()
                SafetyMenuItems(targetType: "PROJECT", targetId: p.id, authorId: p.owner.id, authorName: p.owner.displayName, shareURL: shareURL(p))
            }
        } label: {
            Image(systemName: "ellipsis")
        }
        .accessibilityLabel("Weitere Aktionen zum Projekt")
    }

    private func shareURL(_ p: ProjectPage) -> URL? {
        AppConfig.resolve(p.href ?? "/u/\(p.owner.handle)/\(p.slug)")
    }

    // MARK: - Daten

    private func load() async {
        let h = currentHandle ?? handle
        let s = currentSlug ?? slug
        do {
            let env: ProjectPageEnvelope? = try await APIClient.shared.get("/projects/by/\(h)/\(s)")
            guard let env else { notFound = true; return }
            if env.kind == "redirect", let to = env.to, redirects < 3, case .project(let nh, let ns)? = Route.from(href: to) {
                redirects += 1
                currentHandle = nh
                currentSlug = ns
                await load()
                return
            }
            guard let pr = env.project else { notFound = true; return }
            withAnimation(.snappy) {
                page = pr
                error = nil
                notFound = false
            }
            followingProject = pr.viewer?.followingProject ?? false
            projectFollowers = pr.counts?.followers ?? 0
            if !tracked {
                tracked = true
                SocialAPI.track("PROJECT", pr.id)
            }
        } catch is CancellationError {
        } catch let e as APIError where e.status == 404 || e.code == "NOT_FOUND" {
            notFound = true
        } catch {
            if page == nil { self.error = (error as? APIError)?.message ?? error.localizedDescription } else { app.show(error: error) }
        }
    }

    private func toggleFollowProject(_ p: ProjectPage) async {
        let next = !followingProject
        Haptics.tap()
        withAnimation(.snappy) {
            followingProject = next
            projectFollowers += next ? 1 : -1
        }
        do {
            _ = try await APIClient.shared.post("/projects/\(p.id)/follow", ["follow": JSONValue.bool(next)]) as JSONValue
            app.show(next ? "Du folgst diesem Projekt. Neue Einträge landen in deinen Benachrichtigungen." : "Du folgst diesem Projekt nicht mehr.", style: next ? .success : .info)
        } catch {
            withAnimation { followingProject = !next; projectFollowers += next ? -1 : 1 }
            app.show(error: error)
        }
    }

    private func setStatus(_ status: String, _ p: ProjectPage) async {
        let ok = await app.run(status == "COMPLETED" ? "Abgeschlossen – herzlichen Glückwunsch!" : "Status: \(L.projectStatus(status))") {
            _ = try await APIClient.shared.post("/projects/\(p.id)/status", ["status": JSONValue.string(status)]) as JSONValue
        }
        if ok { await load() }
    }

    private func deleteEntry(_ e: ProjectJournalEntry) async {
        entryToDelete = nil
        let ok = await app.run("Eintrag gelöscht.") {
            _ = try await APIClient.shared.delete("/project-updates/\(e.id)") as JSONValue
        }
        if ok {
            highlight = nil
            await load()
        }
    }

    private func deleteProject() async {
        guard let p = page else { return }
        let ok = await app.run("Projekt gelöscht.") {
            _ = try await APIClient.shared.delete("/projects/\(p.id)") as JSONValue
        }
        if ok { dismiss() }
    }
}
