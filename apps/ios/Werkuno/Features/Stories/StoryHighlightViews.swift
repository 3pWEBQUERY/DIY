import SwiftUI

// MARK: - Titelbild eines Highlights

/// Rundes Titelbild: Foto der Story bzw. Farbfläche mit Anfangsbuchstaben (Text-Story).
struct HighlightCoverView: View {
    var cover: StoryCover
    var title: String
    var size: CGFloat = 62

    var body: some View {
        Group {
            if let thumb = cover.thumb {
                RemoteImage(path: thumb) { Color.sunken }
            } else {
                let bg = StoryBackground.from(cover.background)
                ZStack {
                    bg.background
                    Text(String(title.trimmed.prefix(1)).uppercased())
                        .font(.wr(size: size * 0.38, weight: .bold))
                        .foregroundStyle(bg.foreground)
                }
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(Circle().strokeBorder(Color.line, lineWidth: 0.75))
        .accessibilityHidden(true)
    }
}

// MARK: - Highlights auf dem Profil

struct ProfileHighlightsRow: View {
    var highlights: [StoryHighlightSummary]
    var isSelf: Bool
    @Environment(Router.self) private var router

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(alignment: .top, spacing: 16) {
                if isSelf {
                    Button { router.open(.storyArchive) } label: {
                        VStack(spacing: 6) {
                            Image(systemName: "plus")
                                .font(.system(size: 20, weight: .medium))
                                .foregroundStyle(Color.muted)
                                .frame(width: 62, height: 62)
                                .overlay(Circle().strokeBorder(Color.lineStrong, style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
                                .padding(4)
                            Text(highlights.isEmpty ? "Highlight" : "Verwalten").font(.wr(.caption)).foregroundStyle(Color.muted).lineLimit(1)
                        }
                        .frame(width: 74)
                    }
                    .buttonStyle(.pressable)
                    .accessibilityLabel(highlights.isEmpty ? "Highlight anlegen" : "Highlights verwalten")
                }
                ForEach(highlights) { h in
                    Button { router.openHighlight(h.id) } label: {
                        VStack(spacing: 6) {
                            HighlightCoverView(cover: h.cover, title: h.title, size: 62)
                                .padding(3)
                                .overlay(Circle().strokeBorder(Color.lineStrong, lineWidth: 1))
                                .padding(1)
                            Text(h.title).font(.wr(.caption, .semibold)).foregroundStyle(Color.ink).lineLimit(1)
                        }
                        .frame(width: 74)
                    }
                    .buttonStyle(.pressable)
                    .accessibilityLabel("Highlight \(h.title), \(h.count) \(h.count == 1 ? "Story" : "Stories")")
                }
            }
            .padding(.horizontal, Space.gutter)
        }
        .scrollClipDisabled()
    }
}

// MARK: - Gesehen von

struct StoryViewersSheet: View {
    var storyId: String
    @Environment(\.dismiss) private var dismiss
    @Environment(Router.self) private var router
    @State private var data: StoryViewers?
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Group {
                if let data {
                    List {
                        Section {
                            HStack(spacing: 28) {
                                stat("Aufrufe", "\(data.views)", symbol: "eye")
                                stat("Herzen", "\(data.likes)", symbol: "heart.fill", tint: .moss)
                            }
                            .padding(.vertical, 4)
                        }
                        Section {
                            if data.viewers.isEmpty {
                                Text("Noch hat niemand deine Story gesehen.").font(.wr(.subheadline)).foregroundStyle(Color.muted)
                            }
                            ForEach(data.viewers) { v in
                                HStack(spacing: 12) {
                                    AvatarView(url: v.avatarUrl, name: v.displayName, size: 40)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(v.displayName).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink)
                                        Text("@\(v.handle) · \(Fmt.relative(v.viewedAt))").font(.wr(.caption)).foregroundStyle(Color.muted)
                                    }
                                    Spacer(minLength: 0)
                                    if v.liked {
                                        Image(systemName: "heart.fill").foregroundStyle(Color.moss).accessibilityLabel("hat ein Herz gegeben")
                                    }
                                }
                                .accessibilityElement(children: .combine)
                            }
                        } footer: { Group {
                            Text("Nur du siehst, wer deine Story angeschaut hat.")
                        }.font(.wr(.footnote)) }
                    }
                    .listStyle(.insetGrouped)
                    .formCanvas()
                } else if let error {
                    ErrorStateView(message: error) { await load() }
                } else {
                    LoadingView(text: "Wird geladen …")
                }
            }
            .background(Color.paper)
            .navigationTitle("Gesehen von")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Fertig") { dismiss() } } }
            .task { await load() }
        }
        .presentationDetents([.medium, .large])
    }

    private func stat(_ label: String, _ value: String, symbol: String, tint: Color = .muted) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            SpecLabel(label)
            HStack(spacing: 6) {
                Image(systemName: symbol).foregroundStyle(tint)
                Text(value).font(.wr(.title3, .bold)).monospacedDigit()
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func load() async {
        do { data = try await StoryAPI.viewers(storyId); error = nil } catch { self.error = (error as? APIError)?.message ?? error.localizedDescription }
    }
}

// MARK: - Zu Highlight hinzufügen

struct StoryHighlightPickerSheet: View {
    var storyId: String
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var app
    @State private var list: [StoryOwnHighlight]?
    @State private var title = ""
    @State private var busy: String?

    var body: some View {
        NavigationStack {
            List {
                if let list {
                    if !list.isEmpty {
                        Section {
                            ForEach(list) { h in
                                Button { Task { await toggle(h) } } label: {
                                    HStack(spacing: 12) {
                                        HighlightCoverView(cover: h.cover, title: h.title, size: 44)
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(h.title).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink)
                                            Text("\(h.count) \(h.count == 1 ? "Story" : "Stories")").font(.wr(.caption)).foregroundStyle(Color.muted)
                                        }
                                        Spacer(minLength: 0)
                                        if busy == h.id {
                                            ProgressView()
                                        } else {
                                            Image(systemName: h.contains ? "checkmark.circle.fill" : "circle")
                                                .font(.title3)
                                                .foregroundStyle(h.contains ? Color.moss : Color.lineStrong)
                                        }
                                    }
                                }
                                .disabled(busy != nil)
                                .accessibilityAddTraits(h.contains ? .isSelected : [])
                            }
                        } header: { Text("Deine Highlights").font(.wr(.footnote, .semibold)) }
                    }
                    Section {
                        HStack {
                            TextField("z. B. Werkstatt, Garn, Projekte 2026", text: $title)
                                .onChange(of: title) { _, t in if t.count > StoryRules.highlightTitleMax { title = String(t.prefix(StoryRules.highlightTitleMax)) } }
                                .submitLabel(.done)
                                .onSubmit { Task { await create() } }
                            Button("Anlegen") { Task { await create() } }
                                .fontWeight(.semibold)
                                .disabled(title.trimmed.isEmpty || busy != nil)
                        }
                    } header: { Group {
                        Text("Neues Highlight")
                    }.font(.wr(.footnote, .semibold)) } footer: { Group {
                        Text("Highlights bleiben auf deinem Profil, auch wenn die Story abgelaufen ist.")
                    }.font(.wr(.footnote)) }
                } else {
                    HStack { Spacer(); ProgressView(); Spacer() }
                }
            }
            .formCanvas()
            .navigationTitle("Zu Highlight hinzufügen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Fertig") { dismiss() } } }
            .task { list = (try? await StoryAPI.myHighlights(storyId: storyId)) ?? [] }
        }
        .presentationDetents([.medium, .large])
    }

    private func toggle(_ h: StoryOwnHighlight) async {
        busy = h.id
        defer { busy = nil }
        do {
            if h.contains { _ = try await StoryAPI.removeFromHighlight(h.id, storyId: storyId) } else { _ = try await StoryAPI.addToHighlight(storyId: storyId, highlightId: h.id) }
            Haptics.selection()
            list = (list ?? []).compactMap { (x: StoryOwnHighlight) -> StoryOwnHighlight? in
                guard x.id == h.id else { return x }
                var y = x
                y.contains.toggle()
                y.count += h.contains ? -1 : 1
                return y.count > 0 ? y : nil
            }
            NotificationCenter.default.post(name: .storiesChanged, object: nil)
        } catch { app.show(error: error) }
    }

    private func create() async {
        guard let t = title.trimmed.nilIfEmpty, busy == nil else { return }
        busy = "new"
        defer { busy = nil }
        do {
            _ = try await StoryAPI.addToHighlight(storyId: storyId, title: t)
            Haptics.success()
            app.show("Highlight „\(t)“ angelegt.")
            NotificationCenter.default.post(name: .storiesChanged, object: nil)
            dismiss()
        } catch { app.show(error: error) }
    }
}

// MARK: - Deine Stories (Archiv & Highlights)

/// Alle eigenen Stories (auch abgelaufene) und die Highlights fürs Profil.
struct StoryArchiveView: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @State private var items: [StoryItem] = []
    @State private var cursor: String?
    @State private var highlights: [StoryOwnHighlight] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var editor: HighlightEditorState?
    @State private var deleting: StoryOwnHighlight?

    private let columns = [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.xl) {
                VStack(alignment: .leading, spacing: 6) {
                    SpecLabel("Werkbank", color: .moss)
                    Text("Deine Stories").font(.display(32)).foregroundStyle(Color.ink)
                    Text("Stories sind 24 Stunden im Story-Kreis deiner Follower. Danach bleiben sie hier – nur für dich – und du kannst sie zu Highlights bündeln.")
                        .font(.wr(.subheadline)).foregroundStyle(Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                HStack(spacing: 10) {
                    Button { router.present(.storyComposer) } label: {
                        Label("Neue Story", systemImage: "plus").frame(maxWidth: .infinity)
                    }
                    .primaryButton()
                    Button { Task { await openEditor(HighlightEditorState(id: nil, title: "", storyIds: [], coverStoryId: nil)) } } label: {
                        Text("Highlight").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.glass)
                    .controlSize(.large)
                    .disabled(items.isEmpty)
                }

                highlightSection
                archiveSection
            }
            .padding(.horizontal, Space.gutter)
            .padding(.vertical, 12)
        }
        .background(Color.paper)
        .navigationTitle("Deine Stories")
        .navigationBarTitleDisplayMode(.inline)
        .task { if !loaded { await load() } }
        .refreshable { await load() }
        .onReceive(NotificationCenter.default.publisher(for: .storiesChanged)) { _ in Task { await load() } }
        .sheet(item: $editor) { st in
            HighlightEditorSheet(state: st, archive: items)
                .environment(app)
        }
        .confirmationDialog("Highlight löschen?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }), titleVisibility: .visible, presenting: deleting) { h in
            Button("„\(h.title)“ löschen", role: .destructive) { Task { await deleteHighlight(h) } }
        } message: { _ in
            Text("Die Stories selbst bleiben in deinem Archiv.")
        }
    }

    private var highlightSection: some View {
        VStack(alignment: .leading, spacing: Space.m) {
            SectionHeader("Highlights auf deinem Profil", number: "01")
            if highlights.isEmpty {
                Text("Noch keine Highlights. Sammle Stories zu einem Thema – etwa „Werkstatt“ oder „Garn“ – sie bleiben dauerhaft auf deinem Profil.")
                    .font(.wr(.footnote)).foregroundStyle(Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .top, spacing: 16) {
                        ForEach(highlights) { h in
                            VStack(spacing: 6) {
                                Button { router.openHighlight(h.id) } label: {
                                    HighlightCoverView(cover: h.cover, title: h.title, size: 66)
                                }
                                .buttonStyle(.pressable)
                                .accessibilityLabel("Highlight \(h.title) ansehen")
                                Text(h.title).font(.wr(.caption, .semibold)).lineLimit(1)
                                Text("\(h.count) \(h.count == 1 ? "Story" : "Stories")").font(.wr(.caption2)).foregroundStyle(Color.muted)
                            }
                            .frame(width: 80)
                            .contextMenu {
                                Button("Bearbeiten", systemImage: "pencil") { Task { await openEditor(HighlightEditorState(id: h.id, title: h.title, storyIds: h.storyIds, coverStoryId: h.coverStoryId)) } }
                                Button("Löschen", systemImage: "trash", role: .destructive) { deleting = h }
                            }
                        }
                    }
                }
                .scrollClipDisabled()
                Text("Halte ein Highlight gedrückt, um es zu bearbeiten oder zu löschen.").font(.wr(.caption)).foregroundStyle(Color.muted)
            }
        }
    }

    @ViewBuilder private var archiveSection: some View {
        VStack(alignment: .leading, spacing: Space.m) {
            SectionHeader("Archiv", number: "02")
            if !loaded {
                LoadingView(text: "Archiv wird geladen …")
            } else if let error, items.isEmpty {
                ErrorStateView(message: error) { await load() }
            } else if items.isEmpty {
                EmptyStateView(symbol: "circle.dashed", title: "Noch keine Stories", message: "Zeig, was gerade auf deiner Werkbank liegt – unfertig ist ausdrücklich erlaubt.", actionTitle: "Erste Story") { router.present(.storyComposer) }
            } else {
                LazyVGrid(columns: columns, spacing: 14) {
                    ForEach(items) { s in
                        Button { if let h = app.handle { router.openStories(handle: h, focus: s.id) } } label: {
                            VStack(alignment: .leading, spacing: 5) {
                                StoryThumbView(story: s)
                                HStack(spacing: 4) {
                                    Text(s.expired ? s.createdAt.formatted(.dateTime.day().month(.abbreviated).year()) : StoryFmt.remaining(s.expiresAt))
                                        .foregroundStyle(s.expired ? Color.muted : Color.moss)
                                        .fontWeight(s.expired ? .regular : .semibold)
                                        .lineLimit(1)
                                    Spacer(minLength: 0)
                                    Image(systemName: "eye").imageScale(.small)
                                    Text("\(s.stats?.views ?? 0)").monospacedDigit()
                                }
                                .font(.wr(.caption2))
                                .foregroundStyle(Color.muted)
                            }
                        }
                        .buttonStyle(.pressable)
                        .accessibilityLabel(s.isText ? "Text-Story: \(s.text)" : (s.isVideo ? "Video-Story" : "Foto-Story"))
                        .accessibilityValue(s.expired ? "abgelaufen" : StoryFmt.remaining(s.expiresAt))
                    }
                }
                LoadMoreTrigger(hasMore: cursor != nil) { await loadMore() }
            }
        }
    }

    private func load() async {
        do {
            async let a = StoryAPI.archive(cursor: nil)
            async let h = StoryAPI.myHighlights()
            let (page, hl) = try await (a, h)
            withAnimation(.snappy) {
                items = page.items
                cursor = page.nextCursor
                highlights = hl
                error = nil
                loaded = true
            }
        } catch {
            self.error = (error as? APIError)?.message ?? error.localizedDescription
            loaded = true
        }
    }

    private func loadMore() async {
        guard let c = cursor else { return }
        do {
            let page = try await StoryAPI.archive(cursor: c)
            let known = Set(items.map(\.id))
            items += page.items.filter { !known.contains($0.id) }
            cursor = page.nextCursor
        } catch { cursor = nil; app.show(error: error) }
    }

    /// Editor erst öffnen, wenn das ganze Archiv geladen ist – sonst fehlen ältere Stories eines Highlights in der Auswahl
    private func openEditor(_ st: HighlightEditorState) async {
        var pages = 0
        while cursor != nil, pages < 30 {
            await loadMore()
            pages += 1
        }
        editor = st
    }

    private func deleteHighlight(_ h: StoryOwnHighlight) async {
        if await app.run("Highlight gelöscht.", { try await StoryAPI.deleteHighlight(h.id) }) {
            NotificationCenter.default.post(name: .storiesChanged, object: nil)
        }
    }
}

/// Miniatur einer Story im Hochformat
struct StoryThumbView: View {
    var story: StoryItem

    var body: some View {
        GeometryReader { geo in
            ZStack {
                if story.isText {
                    let bg = StoryBackground.from(story.background)
                    bg.background
                    Text(story.text)
                        .font(.wr(size: max(8, geo.size.width * StoryFmt.textScale(story.text)), weight: .bold))
                        .multilineTextAlignment(.center)
                        .foregroundStyle(bg.foreground)
                        .minimumScaleFactor(0.5)
                        .padding(.horizontal, geo.size.width * 0.09)
                } else if let t = story.thumbURL {
                    RemoteImage(path: t) { Color.sunken }
                        .frame(width: geo.size.width, height: geo.size.height)
                        .clipped()
                } else {
                    Color.sunken
                    Text(story.media?.state == "FAILED" ? "Fehlgeschlagen" : "Wird verarbeitet …")
                        .font(.wr(.caption2)).foregroundStyle(Color.muted)
                }
                if story.isVideo {
                    Image(systemName: "play.fill")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 22, height: 22)
                        .background(.black.opacity(0.55), in: Circle())
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                        .padding(7)
                }
                if story.isHidden {
                    Text("Ausgeblendet")
                        .font(.wr(size: 9, weight: .bold)).textCase(.uppercase)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 6).padding(.vertical, 3)
                        .background(Color.danger, in: .rect(cornerRadius: 6, style: .continuous))
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                        .padding(.top, 7)
                }
            }
        }
        .aspectRatio(9.0 / 16.0, contentMode: .fit)
        .clipShape(.rect(cornerRadius: Radius.inner, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radius.inner, style: .continuous).strokeBorder(Color.line, lineWidth: 0.75))
    }
}

// MARK: - Highlight anlegen / bearbeiten

struct HighlightEditorState: Identifiable {
    var id: String?
    var title: String
    var storyIds: [String]
    var coverStoryId: String?
}

extension HighlightEditorState: Hashable {}

struct HighlightEditorSheet: View {
    var state: HighlightEditorState
    var archive: [StoryItem]
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var app
    @State private var title = ""
    @State private var picked: [String] = []
    @State private var cover: String?
    @State private var saving = false

    private let columns = [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)]
    private var choosable: [StoryItem] { archive.filter { !$0.isHidden || picked.contains($0.id) } }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text("Name").font(.wr(.subheadline, .semibold))
                            Spacer()
                            Text("\(title.count)/\(StoryRules.highlightTitleMax)").font(.wr(.caption)).monospacedDigit().foregroundStyle(Color.muted)
                        }
                        TextField("z. B. Werkstatt", text: $title)
                            .font(.wr(.body))
                            .onChange(of: title) { _, t in if t.count > StoryRules.highlightTitleMax { title = String(t.prefix(StoryRules.highlightTitleMax)) } }
                            .padding(.horizontal, 14).padding(.vertical, 11)
                            .cardSurface(radius: Radius.inner)
                    }
                    Text("Tippe Stories an, um sie auszuwählen. Halte eine ausgewählte Story gedrückt, um sie als Titelbild zu verwenden.")
                        .font(.wr(.footnote)).foregroundStyle(Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                    LazyVGrid(columns: columns, spacing: 10) {
                        ForEach(choosable) { s in
                            let on = picked.contains(s.id)
                            Button { toggle(s.id) } label: {
                                StoryThumbView(story: s)
                                    .opacity(on ? 1 : 0.75)
                                    .overlay(alignment: .topLeading) {
                                        Image(systemName: on ? "checkmark.circle.fill" : "circle")
                                            .font(.title3)
                                            .foregroundStyle(on ? Color.moss : .white)
                                            .background(Circle().fill(on ? Color.paper : .black.opacity(0.25)))
                                            .padding(6)
                                    }
                                    .overlay(alignment: .bottom) {
                                        if cover == s.id {
                                            Text("Titelbild")
                                                .font(.wr(size: 10, weight: .bold)).textCase(.uppercase)
                                                .foregroundStyle(Color.paper)
                                                .padding(.horizontal, 8).padding(.vertical, 4)
                                                .background(Color.ink, in: Capsule())
                                                .padding(.bottom, 8)
                                        }
                                    }
                                    .overlay(RoundedRectangle(cornerRadius: Radius.inner, style: .continuous).strokeBorder(on ? Color.moss : .clear, lineWidth: 2))
                            }
                            .buttonStyle(.plain)
                            .contextMenu {
                                if on { Button("Als Titelbild", systemImage: "photo") { cover = s.id } }
                            }
                            .accessibilityAddTraits(on ? .isSelected : [])
                            .accessibilityLabel(s.isText ? s.text : (s.isVideo ? "Video-Story" : "Foto-Story"))
                        }
                    }
                }
                .padding(Space.gutter)
            }
            .background(Color.paper)
            .navigationTitle(state.id == nil ? "Neues Highlight" : "Highlight bearbeiten")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button { Task { await save() } } label: { if saving { ProgressView() } else { Text("Sichern").fontWeight(.semibold) } }
                        .disabled(title.trimmed.isEmpty || picked.isEmpty || saving)
                }
                ToolbarItem(placement: .status) {
                    Text("\(picked.count) ausgewählt").font(.wr(.caption)).foregroundStyle(Color.muted)
                }
            }
            .onAppear {
                title = state.title
                picked = state.storyIds
                cover = state.coverStoryId
            }
        }
    }

    private func toggle(_ id: String) {
        Haptics.selection()
        if let i = picked.firstIndex(of: id) {
            picked.remove(at: i)
            if cover == id { cover = nil }
        } else {
            picked.append(id)
        }
    }

    private func save() async {
        saving = true
        defer { saving = false }
        // Reihenfolge im Highlight: chronologisch (älteste zuerst), wie im Web
        let order = Dictionary(uniqueKeysWithValues: archive.enumerated().map { ($1.id, $0) })
        let ids = picked.sorted { (order[$0] ?? Int.max) > (order[$1] ?? Int.max) }
        do {
            if let id = state.id {
                try await StoryAPI.updateHighlight(id, title: title.trimmed, storyIds: ids, coverStoryId: .some(cover))
            } else {
                let h = try await StoryAPI.createHighlight(title: title.trimmed, storyIds: ids)
                if let cover { try await StoryAPI.updateHighlight(h.id, coverStoryId: .some(cover)) }
            }
            Haptics.success()
            app.show(state.id == nil ? "Highlight angelegt." : "Highlight gespeichert.")
            NotificationCenter.default.post(name: .storiesChanged, object: nil)
            dismiss()
        } catch { app.show(error: error) }
    }
}

// MARK: - Story-Bezug in Nachrichten

/// Über einer Antwort auf eine Story: kleine Vorschau, solange die Story läuft.
struct StoryReplyRefView: View {
    var ref: StoryRef
    var mine: Bool
    @Environment(Router.self) private var router

    var body: some View {
        VStack(alignment: mine ? .trailing : .leading, spacing: 4) {
            Text(mine ? "Antwort auf die Story" : "Antwort auf deine Story")
                .font(.wr(.caption2))
                .foregroundStyle(Color.muted)
            if ref.available, let handle = ref.ownerHandle {
                Button { router.openStories(handle: handle, focus: ref.id) } label: {
                    preview
                        .frame(width: 72, height: 128)
                        .clipShape(.rect(cornerRadius: 12, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Color.line, lineWidth: 0.75))
                }
                .buttonStyle(.pressable)
                .accessibilityLabel("Story ansehen")
            } else {
                Text("Story nicht mehr verfügbar")
                    .font(.wr(.caption))
                    .foregroundStyle(Color.muted)
                    .padding(.horizontal, 10).padding(.vertical, 6)
                    .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Color.lineStrong, style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
            }
        }
        .padding(.horizontal, 4)
    }

    @ViewBuilder private var preview: some View {
        if ref.kind == "TEXT" {
            let bg = StoryBackground.from(ref.background)
            ZStack {
                bg.background
                Text(ref.text ?? "")
                    .font(.wr(size: 9, weight: .bold))
                    .foregroundStyle(bg.foreground)
                    .multilineTextAlignment(.center)
                    .padding(6)
            }
        } else {
            RemoteImage(path: ref.thumb) { Color.sunken }
        }
    }
}
