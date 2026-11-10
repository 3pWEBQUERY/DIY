import SwiftUI

// MARK: - Einträge (gemeinsam für „Gespeichert“ und Sammlungen)

enum MeSavedEntry: Identifiable, Hashable {
    case post(PostItem), project(ProjectCard), tutorial(TutorialCard), product(MeProductMini), article(MeArticleMini)

    var id: String {
        switch self {
        case .post(let x): x.id
        case .project(let x): x.id
        case .tutorial(let x): x.id
        case .product(let x): x.id
        case .article(let x): x.id
        }
    }
    var type: String {
        switch self {
        case .post: "POST"
        case .project: "PROJECT"
        case .tutorial: "TUTORIAL"
        case .product: "PRODUCT"
        case .article: "ARTICLE"
        }
    }
    var title: String {
        switch self {
        case .post(let x): String(x.body.prefix(60))
        case .project(let x): x.title
        case .tutorial(let x): x.title
        case .product(let x): x.title
        case .article(let x): x.title
        }
    }
}

extension MeSavedSection {
    var entries: [MeSavedEntry] {
        posts.map(MeSavedEntry.post) + projects.map(MeSavedEntry.project) + tutorials.map(MeSavedEntry.tutorial)
            + products.map(MeSavedEntry.product) + articles.map(MeSavedEntry.article)
    }
}

/// Darstellung eines gespeicherten Inhalts
struct MeSavedEntryCard: View {
    var entry: MeSavedEntry
    @Environment(Router.self) private var router

    var body: some View {
        switch entry {
        case .post(let p): PostCardView(post: p)
        case .project(let p): ProjectCardView(project: p, style: .row).padding(12).cardSurface()
        case .tutorial(let t): TutorialCardView(tutorial: t, compact: true)
        case .product(let p):
            Button { router.open(href: p.href) } label: {
                HStack(spacing: 12) {
                    CoverView(url: p.coverUrl, seed: p.id, category: nil, showLabel: false)
                        .frame(width: 64, height: 64)
                        .clipShape(.rect(cornerRadius: Radius.small, style: .continuous))
                    VStack(alignment: .leading, spacing: 3) {
                        SpecLabel("Produkt\(p.shopName.map { " · \($0)" } ?? "")", color: .clay)
                        Text(p.title).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink).a11yLineLimit(2).multilineTextAlignment(.leading)
                        HStack(spacing: 6) {
                            Text(Fmt.money(p.priceMinor, currency: p.currency)).font(.wr(.subheadline, .bold)).monospacedDigit().foregroundStyle(Color.ink)
                            if p.soldOut == true { MeStatePill(text: "Ausverkauft", tone: .neutral) }
                        }
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right").font(.wr(.caption)).foregroundStyle(Color.lineStrong)
                }
                .padding(12)
                .cardSurface()
            }
            .buttonStyle(.pressable)
        case .article(let a):
            Button { router.open(href: a.href) } label: {
                HStack(spacing: 12) {
                    CoverView(url: a.coverUrl, seed: a.id, category: nil, showLabel: false)
                        .frame(width: 64, height: 64)
                        .clipShape(.rect(cornerRadius: Radius.small, style: .continuous))
                    VStack(alignment: .leading, spacing: 3) {
                        SpecLabel(["Artikel", a.readingMinutes.map { "\($0) Min." }].compactMap { $0 }.joined(separator: " · "), color: .clay)
                        Text(a.title).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink).a11yLineLimit(2).multilineTextAlignment(.leading)
                        if let n = a.authorName?.nilIfEmpty { Text(n).font(.wr(.caption)).foregroundStyle(Color.muted) }
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right").font(.wr(.caption)).foregroundStyle(Color.lineStrong)
                }
                .padding(12)
                .cardSurface()
            }
            .buttonStyle(.pressable)
        }
    }
}

// MARK: - Gespeichert

struct SavedView: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router

    private static let types = ["PROJECT", "TUTORIAL", "POST", "PRODUCT", "ARTICLE"]

    @State private var type = "PROJECT"
    /// nil = alle, "ohne" = ohne Sammlung, sonst Sammlungs-ID
    @State private var filter: String?
    @State private var section: MeSavedSection?
    @State private var meta: [String: MeSavedPage.Meta] = [:]
    @State private var counts: [String: Int] = [:]
    @State private var page = 1
    @State private var hasMore = false
    @State private var unavailable = 0
    @State private var error: String?
    @State private var collections: [MeCollectionSummary] = []
    @State private var editor: MeCollectionEditorTarget?
    @State private var pendingDelete: MeCollectionSummary?
    @State private var moveAfterCreate: MeSavedEntry?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                PageTitle(kicker: "Werkbuch", title: "Gespeichert", subtitle: "Deine Merkliste – geordnet in Sammlungen, privat oder zum Teilen.")
                    .padding(.horizontal, Space.gutter)
                collectionStrip
                ChipBar(items: Self.types.map { ($0, chipLabel($0)) }, selection: $type)
                if let f = filter {
                    HStack(spacing: 8) {
                        Image(systemName: "line.3.horizontal.decrease.circle.fill").foregroundStyle(Color.moss)
                        Text(f == "ohne" ? "Nur ohne Sammlung" : "Sammlung: \(collectionName(f) ?? "…")").font(.wr(.subheadline, .medium))
                        Spacer()
                        Button("Filter aufheben") { withAnimation { filter = nil } }.font(.wr(.subheadline))
                    }
                    .padding(.horizontal, 14).padding(.vertical, 10)
                    .sunkenSurface()
                    .padding(.horizontal, Space.gutter)
                }
                list.padding(.horizontal, Space.gutter)
            }
            .padding(.bottom, 40)
        }
        .background(Color.paper)
        .navigationTitle("Gespeichert")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Picker("Filter", selection: $filter) {
                        Text("Alle Sammlungen").tag(String?.none)
                        Text("Ohne Sammlung").tag(String?.some("ohne"))
                        ForEach(collections) { c in Text(c.title).tag(String?.some(c.id)) }
                    }
                    Divider()
                    Button("Neue Sammlung", systemImage: "folder.badge.plus") { editor = .new }
                } label: {
                    Image(systemName: filter == nil ? "line.3.horizontal.decrease.circle" : "line.3.horizontal.decrease.circle.fill")
                }
                .accessibilityLabel("Nach Sammlung filtern")
            }
        }
        .task(id: "\(type)|\(filter ?? "")") { await load(reset: true) }
        .task { await loadCollections() }
        .refreshable { await load(reset: true); await loadCollections() }
        .sheet(item: $editor) { target in
            MeCollectionEditor(target: target) { id in
                Task {
                    await loadCollections()
                    if let entry = moveAfterCreate { moveAfterCreate = nil; await move(entry, to: id) }
                }
            }
            .meSheetEnvironment(app, router)
        }
        .confirmationDialog("Sammlung löschen?", isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }), titleVisibility: .visible, presenting: pendingDelete) { c in
            Button("«\(c.title)» löschen", role: .destructive) { Task { await deleteCollection(c) } }
        } message: { _ in
            Text("Die gespeicherten Inhalte bleiben unter „Gespeichert“ erhalten.")
        }
    }

    private func chipLabel(_ t: String) -> String {
        let n = counts[t] ?? 0
        return n > 0 ? "\(MeLabels.savedType(t)) \(n)" : MeLabels.savedType(t)
    }

    private func collectionName(_ id: String?) -> String? { collections.first { $0.id == id }?.title }

    // MARK: Sammlungen

    private var collectionStrip: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader("Sammlungen", subtitle: collections.isEmpty ? "Ordne Gespeichertes thematisch – z. B. „Wohnzimmer“ oder „Geschenke“." : nil) {
                Button { editor = .new } label: { Label("Neu", systemImage: "plus").font(.wr(.subheadline, .semibold)) }
                    .buttonStyle(.glass)
                    .controlSize(.small)
            }
            .padding(.horizontal, Space.gutter)
            if !collections.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(collections) { c in collectionCard(c) }
                    }
                    .padding(.horizontal, Space.gutter)
                }
                .scrollClipDisabled()
            }
        }
    }

    private func collectionCard(_ c: MeCollectionSummary) -> some View {
        Button { router.open(.collection(id: c.id)) } label: {
            VStack(alignment: .leading, spacing: 8) {
                ThreadPlate(seed: c.id, category: app.me?.profile?.categories?.first, showLabel: false)
                    .frame(width: 150, height: 84)
                    .clipShape(.rect(cornerRadius: Radius.small, style: .continuous))
                    .overlay(alignment: .topTrailing) {
                        Image(systemName: c.visibility == "PUBLIC" ? "globe" : c.visibility == "FOLLOWERS" ? "person.2" : "lock")
                            .font(.wr(.caption2, .semibold)).foregroundStyle(Color.ink2)
                            .padding(6).background(Color.card.opacity(0.9), in: Circle()).padding(6)
                            .accessibilityLabel(L.visibility(c.visibility))
                    }
                Text(c.title).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink).a11yLineLimit(1)
                Text(Fmt.plural(c.count ?? 0, "Eintrag", "Einträge")).font(.wr(.caption)).foregroundStyle(Color.muted)
            }
            .frame(width: 150, alignment: .leading)
            .padding(10)
            .cardSurface(radius: Radius.inner + 4)
        }
        .buttonStyle(.pressable)
        .contextMenu {
            Button("Danach filtern", systemImage: "line.3.horizontal.decrease") { withAnimation { filter = c.id } }
            Button("Bearbeiten", systemImage: "pencil") { editor = .edit(c) }
            if c.visibility != "PRIVATE" { ShareLink(item: MeLinks.collection(c.id)) { Label("Teilen", systemImage: "square.and.arrow.up") } }
            Button("Löschen", systemImage: "trash", role: .destructive) { pendingDelete = c }
        }
    }

    // MARK: Liste

    @ViewBuilder private var list: some View {
        if let section {
            let entries = section.entries
            if entries.isEmpty {
                EmptyStateView(symbol: "bookmark", title: "Hier ist noch nichts gespeichert",
                               message: filter == nil ? "Tippe bei \(MeLabels.savedType(type)) auf das Lesezeichen, um sie hier zu sammeln." : "In dieser Auswahl gibt es keine \(MeLabels.savedType(type)).")
            } else {
                LazyVStack(spacing: 14) {
                    if unavailable > 0 {
                        NoticeView(tone: .info, message: unavailable == 1 ? "Ein gespeicherter Inhalt ist nicht mehr verfügbar." : "\(unavailable) gespeicherte Inhalte sind nicht mehr verfügbar.")
                    }
                    ForEach(entries) { e in
                        VStack(alignment: .leading, spacing: 6) {
                            MeSavedEntryCard(entry: e)
                            actionBar(e)
                        }
                    }
                    LoadMoreTrigger(hasMore: hasMore) { await load(reset: false) }
                }
            }
        } else if let error {
            ErrorStateView(message: error) { await load(reset: true) }
        } else {
            LoadingView()
        }
    }

    private func actionBar(_ e: MeSavedEntry) -> some View {
        let m = meta[e.id]
        return HStack(spacing: 8) {
            Label(collectionName(m?.collectionId) ?? "Ohne Sammlung", systemImage: m?.collectionId == nil ? "tray" : "folder")
                .font(.wr(.caption)).foregroundStyle(Color.muted).labelStyle(.compact).a11yLineLimit(1)
            if let d = m?.savedAt { Text("· \(Fmt.relative(d))").font(.wr(.caption)).foregroundStyle(Color.muted) }
            Spacer()
            Menu {
                Menu("In Sammlung verschieben", systemImage: "folder") {
                    Button("Ohne Sammlung", systemImage: m?.collectionId == nil ? "checkmark" : "tray") { Task { await move(e, to: nil) } }
                    ForEach(collections) { c in
                        Button(c.title, systemImage: m?.collectionId == c.id ? "checkmark" : "folder") { Task { await move(e, to: c.id) } }
                    }
                    Divider()
                    Button("Neue Sammlung …", systemImage: "folder.badge.plus") { moveAfterCreate = e; editor = .new }
                }
                if case .project(let p) = e {
                    Button("Auf Einkaufsliste", systemImage: "checklist") { router.present(.shoppingListPicker(kind: "PROJECT", id: p.id, title: p.title)) }
                }
                if case .tutorial(let t) = e {
                    Button("Auf Einkaufsliste", systemImage: "checklist") { router.present(.shoppingListPicker(kind: "TUTORIAL", id: t.id, title: t.title)) }
                }
                Divider()
                Button("Aus Gespeichertem entfernen", systemImage: "bookmark.slash", role: .destructive) { Task { await remove(e) } }
            } label: {
                Image(systemName: "ellipsis").font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink2)
                    .frame(width: 44, height: 32).contentShape(.rect)
            }
            .accessibilityLabel("Aktionen für \(e.title)")
        }
        .padding(.horizontal, 6)
    }

    // MARK: Aktionen

    private func load(reset: Bool) async {
        let next = reset ? 1 : page + 1
        do {
            let r: MeSavedPage = try await APIClient.shared.get("/saved", query: ["type": type, "collection": filter, "page": String(next)])
            if reset {
                section = r.content
                meta = r.meta
                unavailable = r.unavailable ?? 0
            } else {
                section?.append(r.content)
                meta.merge(r.meta) { _, b in b }
                unavailable += r.unavailable ?? 0
            }
            counts = r.counts
            page = r.page
            hasMore = r.hasMore
            error = nil
        } catch {
            if reset && section == nil { self.error = MeErr.text(error) } else { hasMore = false; app.show(error: error) }
        }
    }

    private func loadCollections() async {
        if let c: [MeCollectionSummary] = try? await APIClient.shared.get("/collections") { collections = c }
    }

    private func move(_ e: MeSavedEntry, to collectionId: String?) async {
        let ok = await app.run(collectionId == nil ? "Ohne Sammlung gespeichert." : "In «\(collectionName(collectionId) ?? "Sammlung")» verschoben.") {
            try await SocialAPI.save(e.type, e.id, true, collectionId: collectionId)
        }
        guard ok else { return }
        Haptics.soft()
        meta[e.id] = MeSavedPage.Meta(collectionId: collectionId, savedAt: meta[e.id]?.savedAt)
        if let f = filter, f != (collectionId ?? "ohne") { withAnimation(.snappy) { section?.remove(id: e.id) } }
        await loadCollections()
    }

    private func remove(_ e: MeSavedEntry) async {
        let ok = await app.run("Aus Gespeichertem entfernt.") { try await SocialAPI.save(e.type, e.id, false) }
        guard ok else { return }
        withAnimation(.snappy) {
            section?.remove(id: e.id)
            counts[e.type] = max(0, (counts[e.type] ?? 1) - 1)
        }
        await loadCollections()
    }

    private func deleteCollection(_ c: MeCollectionSummary) async {
        let ok = await app.run("Sammlung gelöscht.") { _ = try await APIClient.shared.delete("/collections/\(c.id)") as JSONValue }
        guard ok else { return }
        if filter == c.id { filter = nil }
        await loadCollections()
        await load(reset: true)
    }
}

// MARK: - Sammlung bearbeiten / anlegen

enum MeCollectionEditorTarget: Identifiable, Hashable {
    case new
    case edit(MeCollectionSummary)
    var id: String { if case .edit(let c) = self { c.id } else { "new" } }
}

struct MeCollectionEditor: View {
    var target: MeCollectionEditorTarget
    var onSaved: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var app
    @State private var title = ""
    @State private var description = ""
    @State private var visibility = "PRIVATE"
    @State private var fieldErrors: [String: String] = [:]

    private var isNew: Bool { if case .new = target { true } else { false } }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Titel, z. B. „Wohnzimmer“", text: $title)
                        .textInputAutocapitalization(.sentences)
                    if let e = fieldErrors["title"] { Text(e).font(.wr(.caption)).foregroundStyle(Color.danger) }
                } header: { Text("Titel") }
                Section {
                    TextField("Worum geht es? (optional)", text: $description, axis: .vertical).lineLimit(2...6)
                    MeCharCounter(count: description.count, max: 500)
                } header: { Text("Beschreibung") }
                Section {
                    Picker("Sichtbarkeit", selection: $visibility) {
                        ForEach(L.visibility, id: \.key) { Text($0.label).tag($0.key) }
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
                } header: { Text("Wer sieht die Sammlung?") } footer: {
                    Text("Öffentliche Sammlungen erscheinen auf deinem Profil. Gespeicherte Inhalte anderer bleiben nur sichtbar, solange sie selbst sichtbar sind.")
                }
            }
            .meFormStyle()
            .navigationTitle(isNew ? "Neue Sammlung" : "Sammlung bearbeiten")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    AsyncButton(isNew ? "Anlegen" : "Sichern") { await save() }
                        .disabled(title.trimmed.isEmpty || description.count > 500)
                }
            }
            .onAppear {
                if case .edit(let c) = target {
                    title = c.title; description = c.description ?? ""; visibility = c.visibility ?? "PRIVATE"
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func save() async {
        let body: [String: JSONValue] = ["title": .string(title.trimmed), "description": .string(description.trimmed), "visibility": .string(visibility)]
        do {
            switch target {
            case .new:
                let r: MeCreated = try await APIClient.shared.post("/collections", body)
                app.show("Sammlung «\(r.title ?? title)» angelegt.")
                onSaved(r.id)
            case .edit(let c):
                _ = try await APIClient.shared.patch("/collections/\(c.id)", body) as JSONValue
                app.show("Sammlung gesichert.")
                onSaved(c.id)
            }
            dismiss()
        } catch {
            fieldErrors = (error as? APIError)?.fields ?? [:]
            app.show(error: error)
        }
    }
}

// MARK: - Sammlungsseite

struct CollectionView: View {
    var id: String
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @Environment(\.dismiss) private var dismiss
    @State private var page: MeCollectionPage?
    @State private var error: String?
    @State private var editor: MeCollectionEditorTarget?
    @State private var confirmDelete = false

    var body: some View {
        MePhase(value: page, error: error, retry: load) { p in content(p) }
            .background(Color.paper)
            .navigationTitle(page?.title ?? "Sammlung")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if let p = page {
                    if p.visibility != "PRIVATE" {
                        ToolbarItem(placement: .topBarTrailing) {
                            ShareLink(item: MeLinks.collection(p.id)) { Image(systemName: "square.and.arrow.up") }.accessibilityLabel("Sammlung teilen")
                        }
                    }
                    if p.isOwner == true {
                        ToolbarItem(placement: .topBarTrailing) {
                            Menu {
                                Button("Bearbeiten", systemImage: "pencil") { editor = .edit(summary(p)) }
                                Button("Sammlung löschen", systemImage: "trash", role: .destructive) { confirmDelete = true }
                            } label: { Image(systemName: "ellipsis") }
                            .accessibilityLabel("Sammlung verwalten")
                        }
                    }
                }
            }
            .task { if page == nil { await load() } }
            .refreshable { await load() }
            .sheet(item: $editor) { t in
                MeCollectionEditor(target: t) { _ in Task { await load() } }.meSheetEnvironment(app, router)
            }
            .confirmationDialog("Sammlung löschen?", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Löschen", role: .destructive) {
                    Task {
                        if await app.run("Sammlung gelöscht.", { _ = try await APIClient.shared.delete("/collections/\(id)") as JSONValue }) { dismiss() }
                    }
                }
            } message: { Text("Die Inhalte bleiben unter „Gespeichert“ erhalten.") }
    }

    private func summary(_ p: MeCollectionPage) -> MeCollectionSummary {
        MeCollectionSummary(id: p.id, title: p.title, description: p.description, visibility: p.visibility, updatedAt: p.updatedAt, count: p.total)
    }

    private func load() async {
        do { page = try await APIClient.shared.get("/collections/\(id)"); error = nil }
        catch { if page == nil { self.error = MeErr.text(error) } else { app.show(error: error) } }
    }

    private func content(_ p: MeCollectionPage) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                VStack(alignment: .leading, spacing: 12) {
                    PageTitle(kicker: "Sammlung · \(L.visibility(p.visibility))", title: p.title, subtitle: p.description?.nilIfEmpty)
                    HStack(spacing: 10) {
                        if let o = p.owner {
                            Button { router.open(.profile(handle: o.handle)) } label: {
                                HStack(spacing: 8) {
                                    AvatarView(url: o.avatarUrl, name: o.displayName, size: 26)
                                    Text(o.displayName).font(.wr(.subheadline, .medium)).foregroundStyle(Color.ink)
                                }
                            }
                            .buttonStyle(.plain)
                        }
                        Text("· \(Fmt.plural(p.total ?? 0, "Eintrag", "Einträge"))").font(.wr(.subheadline)).foregroundStyle(Color.muted)
                        if let u = p.updatedAt { Text("· \(Fmt.relative(u))").font(.wr(.subheadline)).foregroundStyle(Color.muted) }
                    }
                }
                if p.sections.isEmpty {
                    EmptyStateView(symbol: "folder", title: "Noch leer",
                                   message: p.isOwner == true ? "Halte das Lesezeichen bei Projekten, Anleitungen oder Produkten gedrückt und wähle „In Sammlung speichern“." : "Diese Sammlung enthält noch keine sichtbaren Inhalte.")
                } else {
                    ForEach(Array(p.sections.enumerated()), id: \.offset) { i, s in
                        VStack(alignment: .leading, spacing: 12) {
                            SectionHeader(MeLabels.savedType(s.type), number: String(format: "%02d", i + 1), subtitle: Fmt.plural(s.count, "Eintrag", "Einträge"))
                            ForEach(s.entries) { e in
                                MeSavedEntryCard(entry: e)
                                    .contextMenu {
                                        if p.isOwner == true {
                                            Button("Aus Sammlung nehmen", systemImage: "folder.badge.minus") { Task { await takeOut(e) } }
                                        }
                                    }
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, Space.gutter)
            .padding(.bottom, 40)
        }
    }

    private func takeOut(_ e: MeSavedEntry) async {
        if await app.run("Aus der Sammlung genommen – bleibt gespeichert.", { try await SocialAPI.save(e.type, e.id, true, collectionId: nil) }) {
            await load()
        }
    }
}

// MARK: - Sammlung wählen (Sheet)

struct CollectionPickerSheet: View {
    var type: String
    var id: String
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var app
    @State private var collections: [MeCollectionSummary]?
    @State private var error: String?
    @State private var newTitle = ""
    @State private var newVisibility = "PRIVATE"
    @State private var busy: String?

    var body: some View {
        NavigationStack {
            Form {
                if let error {
                    Section { ErrorStateView(message: error) { await load() } }
                } else if let collections {
                    Section {
                        pickRow(title: "Nur speichern", subtitle: "Ohne Sammlung", symbol: "bookmark", key: "none") { await save(nil, name: nil) }
                        ForEach(collections) { c in
                            pickRow(title: c.title, subtitle: "\(Fmt.plural(c.count ?? 0, "Eintrag", "Einträge")) · \(L.visibility(c.visibility))", symbol: "folder", key: c.id) {
                                await save(c.id, name: c.title)
                            }
                        }
                    } header: { Text("Speichern in") }
                    Section {
                        TextField("Neue Sammlung", text: $newTitle)
                        Picker("Sichtbarkeit", selection: $newVisibility) {
                            ForEach(L.visibility, id: \.key) { Text($0.label).tag($0.key) }
                        }
                        AsyncButton {
                            await createAndSave()
                        } label: {
                            Label("Anlegen und speichern", systemImage: "folder.badge.plus").font(.wr(.body, .semibold))
                        }
                        .disabled(newTitle.trimmed.isEmpty)
                    } header: { Text("Neue Sammlung") }
                } else {
                    Section { LoadingView() }
                }
            }
            .meFormStyle()
            .navigationTitle("In Sammlung speichern")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } } }
            .task { await load() }
        }
        .presentationDetents([.medium, .large])
    }

    private func pickRow(title: String, subtitle: String, symbol: String, key: String, action: @escaping () async -> Void) -> some View {
        Button {
            guard busy == nil else { return }
            busy = key
            Task { await action(); busy = nil }
        } label: {
            HStack(spacing: 12) {
                Image(systemName: symbol).foregroundStyle(Color.moss).frame(width: 26)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).foregroundStyle(Color.ink)
                    Text(subtitle).font(.wr(.caption)).foregroundStyle(Color.muted)
                }
                Spacer()
                if busy == key { ProgressView().controlSize(.small) }
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
    }

    private func load() async {
        do { collections = try await APIClient.shared.get("/collections"); error = nil }
        catch { self.error = MeErr.text(error) }
    }

    private func save(_ collectionId: String?, name: String?) async {
        let ok = await app.run(name.map { "In «\($0)» gespeichert." } ?? "Gespeichert.") {
            try await SocialAPI.save(type, id, true, collectionId: collectionId)
        }
        if ok { Haptics.success(); dismiss() }
    }

    private func createAndSave() async {
        do {
            let r: MeCreated = try await APIClient.shared.post("/collections", ["title": JSONValue.string(newTitle.trimmed), "description": "", "visibility": .string(newVisibility)])
            await save(r.id, name: r.title ?? newTitle.trimmed)
        } catch { app.show(error: error) }
    }
}
