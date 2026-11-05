import SwiftUI

// MARK: - Artikel-Editor mit Blöcken (PRD §14.3)

private enum EditorPane: String, CaseIterable, Identifiable {
    case content, details, preview
    var id: String { rawValue }
    var label: String {
        switch self {
        case .content: "Inhalt"
        case .details: "Details"
        case .preview: "Vorschau"
        }
    }
}

private struct EmbedRequest: Identifiable {
    var blockId: String
    var kind: String
    var id: String { blockId }
}

struct ArticleEditorSheet: View {
    var id: String? = nil

    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @Environment(\.dismiss) private var dismiss

    @State private var pane: EditorPane = .content
    @State private var loaded = false
    @State private var loadError: String?

    @State private var articleId: String?
    @State private var title = ""
    @State private var slug = ""
    @State private var dek = ""
    @State private var coverURL: String?
    @State private var coverMediaId: String?
    @State private var coverRemoved = false
    @State private var blocks: [BlogBlock] = []
    @State private var categoryId: String?
    @State private var tags: [String] = []
    @State private var tagInput = ""
    @State private var seoTitle = ""
    @State private var seoDescription = ""
    @State private var commentsEnabled = true
    @State private var projectIds: [String] = []

    @State private var categories: [BlogCategory] = []
    @State private var projects: [IdTitle] = []
    @State private var state: String?
    @State private var everPublished = false
    @State private var publishedAt: Date?

    @State private var savedSnapshot: JSONValue?
    @State private var fields: [String: String] = [:]
    @State private var saving = false
    @State private var scheduled = false
    @State private var publishAt = Date().addingTimeInterval(86400)
    @State private var shareToFeed = true
    @State private var revisions: [BlogRevision]?
    @State private var confirmDiscard = false
    @State private var confirmDelete = false
    @State private var embedRequest: EmbedRequest?
    @State private var videoDrafts: [String: [DraftMedia]] = [:]

    private var dirty: Bool { savedSnapshot != payload }

    var body: some View {
        NavigationStack {
            Group {
                if loaded {
                    switch pane {
                    case .content: contentPane
                    case .details: detailsPane
                    case .preview: previewPane
                    }
                } else if let loadError {
                    ErrorStateView(message: loadError) { await load() }
                } else {
                    LoadingView(text: "Editor wird vorbereitet …")
                }
            }
            .background(Color.paper)
            .navigationTitle(articleId == nil ? "Neuer Artikel" : "Artikel bearbeiten")
            .navigationBarTitleDisplayMode(.inline)
            .safeAreaInset(edge: .top) {
                if loaded {
                    Picker("Ansicht", selection: $pane) {
                        ForEach(EditorPane.allCases) { p in Text(p.label).tag(p) }
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal, Space.gutter)
                    .padding(.vertical, 8)
                }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Schliessen") { if dirty { confirmDiscard = true } else { dismiss() } }
                }
                ToolbarItem(placement: .confirmationAction) {
                    AsyncButton { _ = await save(silent: false) } label: { Text("Speichern").fontWeight(.semibold) }
                        .disabled(!loaded || saving || !dirty && articleId != nil)
                }
            }
            .confirmationDialog("Änderungen verwerfen?", isPresented: $confirmDiscard, titleVisibility: .visible) {
                Button("Speichern und schliessen") { Task { if await save(silent: false) { dismiss() } } }
                Button("Verwerfen", role: .destructive) { dismiss() }
            } message: { Text("Du hast ungespeicherte Änderungen.") }
            .confirmationDialog("Artikel löschen?", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Endgültig löschen", role: .destructive) { Task { await deleteArticle() } }
            } message: { Text("Der Artikel und alle Revisionen werden gelöscht. Das kann nicht rückgängig gemacht werden.") }
            .sheet(item: $embedRequest) { req in
                BlogEmbedPicker(kind: req.kind) { option in
                    if let i = blocks.firstIndex(where: { $0.id == req.blockId }) {
                        switch req.kind {
                        case "project": blocks[i].projectId = option.id
                        case "tutorial": blocks[i].tutorialId = option.id
                        default: blocks[i].productId = option.id
                        }
                        blocks[i].title = option.title
                    }
                }
            }
            .task { if !loaded { await load() } }
        }
        .interactiveDismissDisabled(dirty)
    }

    // MARK: Laden

    private func load() async {
        do {
            let d: BlogEditorPayload = try await APIClient.shared.get("/studio/articles/editor", query: ["id": id])
            categories = d.categories
            projects = d.projects
            if let a = d.article {
                articleId = a.id
                title = a.title
                slug = a.slug
                dek = a.dek ?? ""
                coverURL = a.coverUrl
                blocks = a.blocks
                categoryId = a.categoryId
                tags = a.tags ?? []
                seoTitle = a.seoTitle ?? ""
                seoDescription = a.seoDescription ?? ""
                commentsEnabled = a.commentsEnabled ?? true
                projectIds = a.projectIds ?? []
                state = a.state
                everPublished = a.everPublished ?? false
                publishedAt = a.publishedAt
                if a.state == "SCHEDULED", let p = a.publishedAt { scheduled = true; publishAt = p }
                for b in a.blocks where b.type == "video" {
                    if let m = b.mediaId { videoDrafts[b.id] = [DraftMedia.existing(id: m, url: nil, alt: nil)] }
                }
            } else {
                blocks = [BlogBlock.make("paragraph")]
            }
            loaded = true
            savedSnapshot = payload
        } catch {
            loadError = (error as? APIError)?.message ?? error.localizedDescription
        }
    }

    // MARK: Speichern

    private var payload: JSONValue {
        var o: [String: JSONValue] = [
            "title": .string(title.trimmed),
            "slug": .string(slug.trimmingCharacters(in: CharacterSet(charactersIn: "-"))),
            "dek": .string(dek.trimmed),
            "blocks": .array(blocks.map(\.payload)),
            "categoryId": .from(categoryId),
            "tags": .from(tags),
            "seoTitle": .string(seoTitle.trimmed),
            "seoDescription": .string(seoDescription.trimmed),
            "commentsEnabled": .bool(commentsEnabled),
            "projectIds": .from(projectIds),
        ]
        if let coverMediaId { o["coverMediaId"] = .string(coverMediaId) } else if coverRemoved { o["coverMediaId"] = .null }
        return .object(o)
    }

    @discardableResult
    private func save(silent: Bool) async -> Bool {
        fields = [:]
        if title.trimmed.count < 3 {
            fields["title"] = "Titel ist zu kurz (mindestens 3 Zeichen)."
            pane = .content
            app.show("Gib deinem Artikel einen Titel.", style: .warning)
            return false
        }
        if let p = blocks.compactMap(\.problem).first {
            pane = .content
            app.show(p, style: .warning)
            return false
        }
        if seoTitle.count > 70 || seoDescription.count > 170 {
            pane = .details
            app.show("SEO-Texte sind zu lang.", style: .warning)
            return false
        }
        saving = true
        defer { saving = false }
        do {
            let r: BlogSaveResult = if let articleId {
                try await APIClient.shared.put("/studio/articles/\(articleId)", payload)
            } else {
                try await APIClient.shared.post("/studio/articles", payload)
            }
            articleId = r.id
            slug = r.slug
            if let s = r.state { state = s }
            if let c = r.coverUrl { coverURL = c } else if coverRemoved { coverURL = nil }
            coverMediaId = nil
            coverRemoved = false
            savedSnapshot = payload
            if !silent { app.show("Gespeichert.") }
            if revisions != nil { await loadRevisions() }
            return true
        } catch let e as APIError {
            fields = e.fields ?? [:]
            app.show(error: e)
            return false
        } catch {
            app.show(error: error)
            return false
        }
    }

    private func publish() async {
        guard await save(silent: true), let articleId else { return }
        var body: [String: JSONValue] = ["shareToFeed": .bool(shareToFeed)]
        if scheduled && !everPublished { body["publishAt"] = .string(JSON.isoFormatter.string(from: publishAt)) }
        do {
            let r: BlogPublishResult = try await APIClient.shared.post("/studio/articles/\(articleId)/publish", body)
            state = r.state
            publishedAt = r.publishedAt
            if r.state == "PUBLISHED" { everPublished = true }
            Haptics.success()
            app.show(r.state == "SCHEDULED" ? "Geplant für \(Fmt.dateTime(r.publishedAt))." : "Veröffentlicht!")
        } catch { app.show(error: error) }
    }

    private func unpublish() async {
        guard let articleId else { return }
        do {
            let r: BlogPublishResult = try await APIClient.shared.post("/studio/articles/\(articleId)/unpublish")
            state = r.state ?? "DRAFT"
            if state == "DRAFT" && !everPublished { publishedAt = nil }
            app.show("Zurückgezogen – der Artikel ist wieder ein Entwurf.")
        } catch { app.show(error: error) }
    }

    private func deleteArticle() async {
        guard let articleId else { dismiss(); return }
        if await app.run("Artikel gelöscht.", { _ = try await APIClient.shared.delete("/studio/articles/\(articleId)") as JSONValue }) {
            dismiss()
        }
    }

    private func loadRevisions() async {
        guard let articleId else { revisions = []; return }
        do { revisions = try await APIClient.shared.get("/studio/articles/\(articleId)/revisions") } catch { app.show(error: error) }
    }

    private func restore(_ r: BlogRevision) async {
        guard let articleId else { return }
        do {
            let res: BlogRestoreResult = try await APIClient.shared.post("/studio/articles/\(articleId)/revisions/\(r.id)/restore")
            title = res.title
            blocks = res.blocks
            savedSnapshot = payload
            app.show("Stand vom \(Fmt.dateTime(r.createdAt)) wiederhergestellt.")
            await loadRevisions()
        } catch { app.show(error: error) }
    }

    // MARK: Inhalt

    private var contentPane: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 4) {
                    TextField("Titel", text: $title, axis: .vertical)
                        .font(.display(28))
                        .lineLimit(1...4)
                    DiscoverFieldError(message: fields["title"])
                }
                TextField("Unterzeile – worum geht es in zwei Sätzen?", text: $dek, axis: .vertical)
                    .font(.wr(.body).italic())
                    .lineLimit(2...5)
                coverRow
            } header: { Text("Kopf") }

            Section {
                if blocks.isEmpty {
                    Text("Noch keine Blöcke. Füge unten einen Absatz, ein Bild oder eine Projektkarte hinzu.")
                        .font(.wr(.subheadline)).foregroundStyle(Color.muted)
                }
                ForEach($blocks) { $b in
                    BlogBlockEditor(
                        block: $b,
                        videoDraft: Binding(get: { videoDrafts[b.id] ?? [] }, set: { videoDrafts[b.id] = $0; $b.wrappedValue.mediaId = $0.first?.mediaId; if let u = $0.first?.remoteURL { $b.wrappedValue.url = u } }),
                        canMoveUp: blocks.first?.id != b.id,
                        canMoveDown: blocks.last?.id != b.id,
                        move: { dir in moveBlock(b.id, by: dir) },
                        remove: { withAnimation { blocks.removeAll { $0.id == b.id } } },
                        pickEmbed: { kind in embedRequest = EmbedRequest(blockId: b.id, kind: kind) }
                    )
                }
                .onMove { blocks.move(fromOffsets: $0, toOffset: $1) }
                .onDelete { blocks.remove(atOffsets: $0) }
            } header: {
                HStack {
                    Text("Inhalt")
                    Spacer()
                    Text(Fmt.plural(blocks.count, "Block", "Blöcke"))
                }
            } footer: {
                Text("Zum Umsortieren einen Block gedrückt halten und ziehen. Absätze verstehen **fett**, *kursiv* und [Link](https://…).")
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom) { addBlockMenu }
    }

    private var coverRow: some View {
        HStack(spacing: 12) {
            CoverView(url: coverRemoved ? nil : coverURL, seed: articleId ?? (title.nilIfEmpty ?? "artikel"), category: nil, showLabel: false)
                .frame(width: 88, height: 66)
                .clipShape(.rect(cornerRadius: Radius.small, style: .continuous))
            VStack(alignment: .leading, spacing: 6) {
                Text("Titelbild").font(.wr(.subheadline, .semibold))
                HStack(spacing: 8) {
                    SingleImagePicker(onUploaded: { id, url in coverMediaId = id; coverURL = url; coverRemoved = false }) {
                        Text(coverURL == nil || coverRemoved ? "Wählen" : "Ändern").font(.wr(.footnote, .semibold))
                            .padding(.horizontal, 12).padding(.vertical, 6)
                            .glassEffect(.regular.interactive(), in: Capsule())
                    }
                    .buttonStyle(.borderless)
                    if coverURL != nil && !coverRemoved {
                        Button("Entfernen", role: .destructive) { coverRemoved = true; coverMediaId = nil }
                            .font(.wr(.footnote))
                            .buttonStyle(.borderless)
                    }
                }
            }
            Spacer(minLength: 0)
        }
    }

    private var addBlockMenu: some View {
        Menu {
            ForEach(BlogBlock.kinds, id: \.type) { k in
                Button { addBlock(k.type) } label: { Label(k.label, systemImage: k.symbol) }
            }
        } label: {
            Label("Block hinzufügen", systemImage: "plus")
                .font(.wr(.body, .semibold))
                .padding(.horizontal, 10)
        }
        .buttonStyle(.glassProminent)
        .tint(.moss)
        .controlSize(.large)
        .padding(.bottom, 8)
        .disabled(blocks.count >= 400)
    }

    private func addBlock(_ type: String) {
        Haptics.tap()
        let b = BlogBlock.make(type)
        withAnimation(.snappy) { blocks.append(b) }
        if ["projectCard", "tutorialCard", "productCard"].contains(type) {
            embedRequest = EmbedRequest(blockId: b.id, kind: String(type.dropLast(4)))
        }
    }

    private func moveBlock(_ id: String, by d: Int) {
        guard let i = blocks.firstIndex(where: { $0.id == id }) else { return }
        let j = i + d
        guard blocks.indices.contains(j) else { return }
        withAnimation(.snappy) { blocks.swapAt(i, j) }
    }

    // MARK: Details

    private var detailsPane: some View {
        Form {
            Section {
                HStack(spacing: 2) {
                    Text("/blog/").font(.wr(.body).monospaced()).foregroundStyle(Color.muted)
                    TextField("adresse-des-artikels", text: Binding(get: { slug }, set: { slug = Self.slugify($0) }))
                        .font(.wr(.body).monospaced())
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
                DiscoverFieldError(message: fields["slug"])
                Picker("Rubrik", selection: $categoryId) {
                    Text("Keine").tag(String?.none)
                    ForEach(categories) { c in Text(c.name).tag(Optional(c.id)) }
                }
            } header: { Text("Adresse & Rubrik") } footer: {
                Text(everPublished ? "Wenn du die Adresse änderst, leiten alte Links automatisch weiter." : "Leer lassen, um die Adresse aus dem Titel zu erzeugen.")
            }

            Section {
                if !tags.isEmpty {
                    FlowLayout(spacing: 6, lineSpacing: 6) {
                        ForEach(tags, id: \.self) { t in
                            Button { tags.removeAll { $0 == t } } label: {
                                HStack(spacing: 4) { Text("#\(t)"); Image(systemName: "xmark").font(.wr(.caption2)) }
                                    .font(.wr(.footnote)).foregroundStyle(Color.ink2)
                                    .padding(.horizontal, 9).padding(.vertical, 5)
                                    .background(Color.sunken, in: Capsule())
                            }
                            .buttonStyle(.borderless)
                            .accessibilityLabel("Schlagwort \(t) entfernen")
                        }
                    }
                }
                HStack {
                    TextField("Schlagwort hinzufügen", text: $tagInput)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .onSubmit(addTag)
                    Button("Hinzufügen", action: addTag).buttonStyle(.borderless)
                        .disabled(tagInput.trimmed.isEmpty || tags.count >= 10)
                }
                DiscoverFieldError(message: fields["tags"])
            } header: { Text("Schlagwörter (\(tags.count)/10)") }

            Section {
                VStack(alignment: .leading, spacing: 4) {
                    TextField("SEO-Titel (optional)", text: $seoTitle, axis: .vertical).lineLimit(1...3)
                    counter(seoTitle.count, 70)
                }
                VStack(alignment: .leading, spacing: 4) {
                    TextField("SEO-Beschreibung (optional)", text: $seoDescription, axis: .vertical).lineLimit(2...5)
                    counter(seoDescription.count, 170)
                }
            } header: { Text("Suchmaschinen") } footer: { Text("Leer lassen, um Titel und Unterzeile zu verwenden.") }

            Section {
                Toggle("Kommentare erlauben", isOn: $commentsEnabled)
            }

            Section {
                if projects.isEmpty { Text("Du hast noch keine Projekte.").foregroundStyle(Color.muted) }
                ForEach(projects) { p in
                    Button {
                        if let i = projectIds.firstIndex(of: p.id) { projectIds.remove(at: i) } else if projectIds.count < 12 { projectIds.append(p.id) }
                    } label: {
                        HStack {
                            Text(p.title).foregroundStyle(Color.ink)
                            Spacer()
                            if projectIds.contains(p.id) { Image(systemName: "checkmark").foregroundStyle(Color.moss).fontWeight(.semibold) }
                        }
                        .contentShape(.rect)
                    }
                    .buttonStyle(.borderless)
                    .accessibilityAddTraits(projectIds.contains(p.id) ? .isSelected : [])
                }
            } header: { Text("Verknüpfte Projekte (\(projectIds.count)/12)") } footer: { Text("Verknüpfte Projekte erscheinen unter dem Artikel – der Faden zum Werkstück.") }

            publishSection

            if articleId != nil {
                Section {
                    if let revisions {
                        if revisions.isEmpty { Text("Noch keine Revisionen.").foregroundStyle(Color.muted) }
                        ForEach(revisions) { r in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(r.title).font(.wr(.subheadline, .medium)).lineLimit(1)
                                    Text("\(Fmt.dateTime(r.createdAt)) · \(Fmt.plural(r.blockCount ?? 0, "Block", "Blöcke")) · \(Fmt.plural(r.words ?? 0, "Wort", "Wörter"))")
                                        .font(.wr(.caption)).foregroundStyle(Color.muted)
                                }
                                Spacer()
                                AsyncButton("Wiederherstellen") { await restore(r) }
                                    .font(.wr(.footnote, .semibold))
                                    .buttonStyle(.borderless)
                            }
                        }
                    } else {
                        ProgressView().frame(maxWidth: .infinity)
                    }
                } header: { Text("Revisionen") } footer: { Text("Jede Speicherung legt einen Stand ab. Die letzten 30 bleiben erhalten.") }
                .task { if revisions == nil { await loadRevisions() } }

                Section {
                    Button("Artikel löschen", role: .destructive) { confirmDelete = true }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .scrollDismissesKeyboard(.interactively)
    }

    private var publishSection: some View {
        Section {
            HStack {
                Text("Status")
                Spacer()
                Text(BlogState.label(state)).foregroundStyle(state == "PUBLISHED" ? Color.moss : state == "SCHEDULED" ? Color.clay : Color.muted).fontWeight(.medium)
            }
            if let p = publishedAt, state == "PUBLISHED" || state == "SCHEDULED" {
                SpecRow(label: state == "SCHEDULED" ? "Erscheint am" : "Veröffentlicht am", value: Fmt.dateTime(p))
            }
            if state != "PUBLISHED" {
                if !everPublished {
                    Toggle("Später veröffentlichen", isOn: $scheduled.animation())
                    if scheduled {
                        DatePicker("Zeitpunkt", selection: $publishAt, in: Date().addingTimeInterval(120)...Date().addingTimeInterval(365 * 86400))
                    }
                }
                Toggle("Im Feed ankündigen", isOn: $shareToFeed)
                AsyncButton { await publish() } label: {
                    Label(scheduled && !everPublished ? (state == "SCHEDULED" ? "Neu planen" : "Veröffentlichung planen") : "Jetzt veröffentlichen", systemImage: scheduled && !everPublished ? "calendar.badge.clock" : "paperplane.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.glassProminent)
                .tint(.moss)
            }
            if state == "PUBLISHED" || state == "SCHEDULED" {
                AsyncButton { await unpublish() } label: {
                    Label(state == "SCHEDULED" ? "Planung aufheben" : "Zurückziehen", systemImage: "arrow.uturn.backward").frame(maxWidth: .infinity)
                }
                .buttonStyle(.glass)
            }
            if state == "PUBLISHED", let handle = app.handle {
                Button {
                    let s = slug
                    dismiss()
                    Task {
                        try? await Task.sleep(for: .milliseconds(350))
                        router.open(.article(handle: handle, slug: s))
                    }
                } label: { Label("Artikel ansehen", systemImage: "arrow.up.right.square") }
                .buttonStyle(.borderless)
            }
        } header: { Text("Veröffentlichen") } footer: {
            Text(dirty ? "Ungespeicherte Änderungen werden vor dem Veröffentlichen gespeichert." : "Beim ersten Veröffentlichen kann ein Beitrag im Feed deiner Follower erscheinen.")
        }
    }

    private func counter(_ n: Int, _ max: Int) -> some View {
        HStack {
            Spacer()
            Text("\(n)/\(max)").font(.wr(.caption).monospacedDigit()).foregroundStyle(n > max ? Color.danger : Color.muted)
        }
        .accessibilityLabel("\(n) von \(max) Zeichen")
    }

    private func addTag() {
        let t = Self.slugify(tagInput.trimmed.replacingOccurrences(of: "#", with: "")).prefix(30)
        guard !t.isEmpty, tags.count < 10, !tags.contains(String(t)) else { tagInput = ""; return }
        tags.append(String(t))
        tagInput = ""
    }

    static func slugify(_ s: String) -> String {
        let map: [Character: String] = ["ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss", "é": "e", "è": "e", "à": "a", "ç": "c"]
        var out = ""
        for ch in s.lowercased() {
            if let m = map[ch] { out += m }
            else if ch.isASCII && (ch.isLetter || ch.isNumber) { out.append(ch) }
            else if !out.hasSuffix("-") && !out.isEmpty { out.append("-") }
        }
        return String(out.prefix(80))
    }

    // MARK: Vorschau

    private var previewPane: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                CoverView(url: coverRemoved ? nil : coverURL, seed: articleId ?? (title.nilIfEmpty ?? "artikel"), category: nil)
                    .frame(height: 220)
                    .frame(maxWidth: .infinity)
                    .clipped()
                VStack(alignment: .leading, spacing: 18) {
                    SpecLabel([categories.first { $0.id == categoryId }?.name, "Vorschau"].compactMap { $0 }.joined(separator: " · "), color: .clay)
                    Text(title.nilIfEmpty ?? "Ohne Titel").font(.display(32)).foregroundStyle(Color.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    if let d = dek.nilIfEmpty {
                        Text(d).font(.wr(size: 20).italic()).foregroundStyle(Color.ink2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Rectangle().fill(Color.line).frame(height: 0.75)
                    if blocks.isEmpty {
                        Text("Noch kein Inhalt.").foregroundStyle(Color.muted)
                    }
                    BlogBlocksView(blocks: blocks)
                        .allowsHitTesting(false)
                    if !tags.isEmpty { TagList(tags: tags) }
                }
                .padding(Space.gutter)
            }
            .padding(.bottom, 40)
        }
    }
}

// MARK: - Editor eines einzelnen Blocks

private struct BlogBlockEditor: View {
    @Binding var block: BlogBlock
    @Binding var videoDraft: [DraftMedia]
    var canMoveUp: Bool
    var canMoveDown: Bool
    var move: (Int) -> Void
    var remove: () -> Void
    var pickEmbed: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: BlogBlock.symbol(block.type)).font(.wr(.caption)).foregroundStyle(Color.moss)
                SpecLabel(BlogBlock.label(block.type), color: .moss)
                Spacer()
                Menu {
                    Button("Nach oben", systemImage: "arrow.up") { move(-1) }.disabled(!canMoveUp)
                    Button("Nach unten", systemImage: "arrow.down") { move(1) }.disabled(!canMoveDown)
                    Divider()
                    Button("Block löschen", systemImage: "trash", role: .destructive, action: remove)
                } label: {
                    Image(systemName: "ellipsis").foregroundStyle(Color.muted).frame(width: 36, height: 30).contentShape(.rect)
                }
                .buttonStyle(.borderless)
                .accessibilityLabel("Blockaktionen: \(BlogBlock.label(block.type))")
            }
            editor
        }
        .padding(.vertical, 4)
    }

    private func text(_ kp: WritableKeyPath<BlogBlock, String?>) -> Binding<String> {
        Binding(get: { block[keyPath: kp] ?? "" }, set: { block[keyPath: kp] = $0 })
    }

    @ViewBuilder private var editor: some View {
        switch block.type {
        case "heading":
            Picker("Ebene", selection: Binding(get: { block.level ?? 2 }, set: { block.level = $0 })) {
                Text("Zwischentitel").tag(2)
                Text("Unterpunkt").tag(3)
            }
            .pickerStyle(.segmented)
            TextField("Überschrift", text: text(\.text), axis: .vertical)
                .font(block.level == 3 ? .wr(.title3, .semibold) : .display(22))
        case "paragraph":
            TextField("Schreib los …", text: text(\.text), axis: .vertical)
                .font(.wr(.body))
                .lineLimit(3...)
        case "list":
            Toggle("Nummeriert", isOn: Binding(get: { block.ordered ?? false }, set: { block.ordered = $0 }))
            TextField("Ein Punkt pro Zeile", text: Binding(get: { (block.items ?? []).joined(separator: "\n") }, set: { block.items = $0.components(separatedBy: "\n") }), axis: .vertical)
                .lineLimit(3...)
        case "quote":
            TextField("Zitat", text: text(\.text), axis: .vertical)
                .font(.wr(.body).italic())
                .lineLimit(2...)
            TextField("Quelle (optional)", text: text(\.cite))
        case "image":
            imageEditor
        case "gallery":
            galleryEditor
        case "video":
            MediaPickerField(items: $videoDraft, maxCount: 1, allowVideo: true, title: "Video")
            TextField("Bildunterschrift (optional)", text: text(\.caption))
        case "table":
            tableEditor
        case "callout":
            Picker("Art", selection: Binding(get: { block.tone ?? "info" }, set: { block.tone = $0 })) {
                ForEach(L.calloutTones, id: \.key) { t in Text(t.label).tag(t.key) }
            }
            .pickerStyle(.segmented)
            TextField("Hinweistext", text: text(\.text), axis: .vertical).lineLimit(2...)
        case "projectCard", "tutorialCard", "productCard":
            let kind = String(block.type.dropLast(4))
            let chosen = (block.projectId ?? block.tutorialId ?? block.productId) != nil
            Button { pickEmbed(kind) } label: {
                HStack(spacing: 10) {
                    Image(systemName: BlogBlock.symbol(block.type)).foregroundStyle(Color.moss)
                    Text(chosen ? (block.title ?? "Ausgewählt") : "\(BlogBlock.label(block.type)) auswählen …")
                        .foregroundStyle(chosen ? Color.ink : Color.moss)
                        .fontWeight(chosen ? .semibold : .regular)
                    Spacer()
                    Text(chosen ? "Ändern" : "").font(.wr(.footnote)).foregroundStyle(Color.muted)
                }
                .padding(12)
                .sunkenSurface()
                .overlay(alignment: .leading) { Capsule().fill(Color.moss).frame(width: 2) }
            }
            .buttonStyle(.borderless)
        case "divider":
            HStack { Spacer(); Text("· · ·").foregroundStyle(Color.muted); Spacer() }
        default:
            Text("Unbekannter Block").foregroundStyle(Color.muted)
        }
    }

    private var imageEditor: some View {
        VStack(alignment: .leading, spacing: 8) {
            SingleImagePicker(onUploaded: { id, url in block.mediaId = id; block.url = url }) {
                ZStack {
                    if let u = block.url?.nilIfEmpty {
                        RemoteImage(path: u).frame(height: 170).frame(maxWidth: .infinity).clipped()
                    } else {
                        VStack(spacing: 6) {
                            Image(systemName: "photo.badge.plus").font(.wr(.title2))
                            Text("Bild wählen").font(.wr(.footnote, .semibold))
                        }
                        .foregroundStyle(Color.moss)
                        .frame(maxWidth: .infinity, minHeight: 120)
                        .background(Color.mossSoft)
                    }
                }
                .clipShape(.rect(cornerRadius: Radius.inner, style: .continuous))
            }
            .buttonStyle(.borderless)
            TextField("Alt-Text: Was ist zu sehen?", text: text(\.alt))
            TextField("Bildunterschrift (optional)", text: text(\.caption))
        }
    }

    private var galleryEditor: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(Array((block.images ?? []).enumerated()), id: \.element.mediaId) { i, img in
                HStack(alignment: .top, spacing: 10) {
                    RemoteImage(path: img.url) { Color.sunken }
                        .frame(width: 64, height: 64)
                        .clipShape(.rect(cornerRadius: Radius.small, style: .continuous))
                    VStack(spacing: 6) {
                        TextField("Alt-Text", text: Binding(get: { block.images?[safe: i]?.alt ?? "" }, set: { v in if block.images?.indices.contains(i) == true { block.images?[i].alt = v } }))
                        TextField("Bildunterschrift", text: Binding(get: { block.images?[safe: i]?.caption ?? "" }, set: { v in if block.images?.indices.contains(i) == true { block.images?[i].caption = v } }))
                    }
                    .font(.wr(.footnote))
                    Button(role: .destructive) { block.images?.remove(at: i) } label: { Image(systemName: "minus.circle.fill") }
                        .buttonStyle(.borderless)
                        .foregroundStyle(Color.danger)
                        .accessibilityLabel("Bild entfernen")
                }
            }
            if (block.images ?? []).count < 24 {
                SingleImagePicker(onUploaded: { id, url in
                    var list = block.images ?? []
                    list.append(BlogMedia(mediaId: id, url: url, alt: "", caption: ""))
                    block.images = list
                }) {
                    Label("Bild hinzufügen", systemImage: "plus").font(.wr(.footnote, .semibold))
                        .padding(.horizontal, 12).padding(.vertical, 7)
                        .glassEffect(.regular.interactive(), in: Capsule())
                }
                .buttonStyle(.borderless)
            }
        }
    }

    private var tableEditor: some View {
        let rows = block.rows ?? []
        let cols = rows.map(\.count).max() ?? 0
        return VStack(alignment: .leading, spacing: 8) {
            ScrollView(.horizontal, showsIndicators: false) {
                Grid(horizontalSpacing: 4, verticalSpacing: 4) {
                    ForEach(0..<rows.count, id: \.self) { r in
                        GridRow {
                            ForEach(0..<cols, id: \.self) { c in
                                TextField(r == 0 ? "Kopf" : "Zelle", text: cell(r, c))
                                    .font(r == 0 ? .wr(.footnote, .semibold) : .wr(.footnote))
                                    .padding(.horizontal, 8).padding(.vertical, 7)
                                    .frame(width: 118)
                                    .background(r == 0 ? Color.sunken : Color.paper, in: .rect(cornerRadius: 6))
                            }
                        }
                    }
                }
            }
            HStack(spacing: 14) {
                Button("+ Zeile") { var r = block.rows ?? []; r.append(Array(repeating: "", count: max(1, cols))); block.rows = r }
                    .disabled(rows.count >= 60)
                Button("− Zeile") { var r = block.rows ?? []; if r.count > 1 { r.removeLast() }; block.rows = r }
                    .disabled(rows.count <= 1)
                Button("+ Spalte") { block.rows = (block.rows ?? [[]]).map { $0 + [""] } }
                    .disabled(cols >= 8)
                Button("− Spalte") { block.rows = (block.rows ?? []).map { $0.count > 1 ? Array($0.dropLast()) : $0 } }
                    .disabled(cols <= 1)
            }
            .font(.wr(.footnote, .semibold))
            .buttonStyle(.borderless)
            Text("Die erste Zeile wird als Kopfzeile dargestellt.").font(.wr(.caption)).foregroundStyle(Color.muted)
        }
    }

    private func cell(_ r: Int, _ c: Int) -> Binding<String> {
        Binding(get: { block.rows?[safe: r]?[safe: c] ?? "" }, set: { v in
            var rows = block.rows ?? []
            guard rows.indices.contains(r) else { return }
            while rows[r].count <= c { rows[r].append("") }
            rows[r][c] = v
            block.rows = rows
        })
    }
}

// MARK: - Einbettung wählen (/embeds)

struct BlogEmbedPicker: View {
    var kind: String
    var onPick: (BlogEmbedOption) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var app
    @State private var query = ""
    @State private var options: [BlogEmbedOption]?

    private var title: String {
        switch kind {
        case "project": "Projekt einbetten"
        case "tutorial": "Anleitung einbetten"
        default: "Produkt einbetten"
        }
    }

    var body: some View {
        NavigationStack {
            List {
                if let options {
                    if options.isEmpty {
                        Text(query.isEmpty ? "Du hast hier noch nichts, das du einbetten kannst." : "Nichts gefunden für „\(query)“.")
                            .foregroundStyle(Color.muted)
                    }
                    ForEach(options) { o in
                        Button {
                            onPick(o)
                            dismiss()
                        } label: {
                            HStack(spacing: 12) {
                                CoverView(url: o.coverUrl, seed: o.id, category: o.category, showLabel: false)
                                    .frame(width: 44, height: 44)
                                    .clipShape(.rect(cornerRadius: Radius.small, style: .continuous))
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(o.title).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink)
                                    if let m = o.meta { Text(m).font(.wr(.caption)).foregroundStyle(Color.muted) }
                                }
                            }
                        }
                    }
                } else {
                    ProgressView().frame(maxWidth: .infinity)
                }
            }
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Eigene Inhalte suchen")
            .scrollContentBackground(.hidden)
            .background(Color.paper)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } } }
            .task(id: query) {
                if options != nil { try? await Task.sleep(for: .milliseconds(250)) }
                guard !Task.isCancelled else { return }
                do { options = try await APIClient.shared.get("/embeds", query: ["type": kind, "q": query.trimmed]) } catch is CancellationError {} catch { app.show(error: error); options = options ?? [] }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
