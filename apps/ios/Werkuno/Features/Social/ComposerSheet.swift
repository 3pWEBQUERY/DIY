import SwiftUI

// MARK: - Gemeinsamer Beitragseditor (Composer & Bearbeiten)

/// Entwurf eines Beitrags – geteilt von `ComposerSheet` und `EditPostSheet`.
struct SocialPostDraft: Equatable {
    var body = ""
    var media: [DraftMedia] = []
    var category: String?
    var projectId: String?
    var visibility = "PUBLIC"

    static let maxBody = 5000

    var hasContent: Bool { !body.trimmed.isEmpty || media.contains { $0.state == .ready } }
    var isUploading: Bool { media.isUploading }
    var missingAlt: Bool { media.contains { !$0.isVideo && $0.state == .ready && $0.alt.trimmed.isEmpty } }
    var hasFailedUploads: Bool { media.contains { if case .failed = $0.state { true } else { false } } }
    var canSubmit: Bool { hasContent && !isUploading && body.count <= Self.maxBody }

    var readyMediaJSON: JSONValue {
        .array(media.filter { $0.state == .ready }.compactMap(\.ref).map { ["id": .string($0.id), "alt": .string($0.alt)] })
    }
}

/// Formular-Inhalt des Editors: Text, Medien, Einstellungen, Vorschau.
struct SocialPostEditor: View {
    enum Mode: Equatable { case standard, community(name: String?), repost }

    @Binding var draft: SocialPostDraft
    var mode: Mode = .standard
    var projects: [IdTitle] = []
    var projectsLoading = false
    var placeholder = "Was entsteht gerade auf deiner Werkbank?"

    @Environment(AppState.self) private var app
    @State private var showPreview = false
    @FocusState private var focused: Bool

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.xl) {
                if case .community(let name) = mode {
                    NoticeView(tone: .info, title: name.map { "Beitrag in \($0)" } ?? "Community-Beitrag", message: "Dein Beitrag erscheint in der Community und ist für alle Mitglieder sichtbar.")
                }
                writer
                VStack(alignment: .leading, spacing: 8) {
                    MediaPickerField(items: $draft.media, maxCount: 10, allowVideo: true, title: "Bilder & Videos")
                    if draft.missingAlt {
                        Label("Tipp: Beschreibe deine Bilder kurz – tippe auf ein Bild für den Alt-Text. Das hilft Menschen mit Screenreader.", systemImage: "text.below.photo")
                            .font(.wr(.caption))
                            .foregroundStyle(Color.warn)
                    }
                    if draft.hasFailedUploads {
                        Label("Ein Upload ist fehlgeschlagen. Entferne das Medium oder füge es erneut hinzu.", systemImage: "exclamationmark.triangle")
                            .font(.wr(.caption))
                            .foregroundStyle(Color.danger)
                    }
                }
                .padding(16)
                .cardSurface()

                if mode == .standard || mode == .repost { settings }

                preview
            }
            .padding(.horizontal, Space.gutter)
            .padding(.vertical, Space.l)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Color.paper)
        .onAppear { if draft.body.isEmpty { focused = true } }
    }

    // MARK: Text

    private var writer: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                AvatarView(url: app.me?.profile?.avatarUrl, name: app.me?.profile?.displayName ?? "Du", size: 36)
                VStack(alignment: .leading, spacing: 1) {
                    Text(app.me?.profile?.displayName ?? "Du").font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink)
                    if let h = app.handle { Text("@\(h)").font(.wr(.caption)).foregroundStyle(Color.muted) }
                }
            }
            TextField(placeholder, text: $draft.body, axis: .vertical)
                .font(.wr(.title3))
                .foregroundStyle(Color.ink)
                .lineLimit(5...16)
                .focused($focused)
                .accessibilityLabel("Text des Beitrags")
            HStack {
                Spacer()
                Text("\(draft.body.count)/\(SocialPostDraft.maxBody)")
                    .font(.spec)
                    .monospacedDigit()
                    .foregroundStyle(draft.body.count > SocialPostDraft.maxBody ? Color.danger : Color.muted)
                    .accessibilityLabel("\(draft.body.count) von \(SocialPostDraft.maxBody) Zeichen")
            }
        }
        .padding(16)
        .cardSurface()
    }

    // MARK: Einstellungen (Datenblatt)

    private var settings: some View {
        VStack(alignment: .leading, spacing: 0) {
            SpecLabel("Einordnung").padding(.bottom, 6)
            settingRow(symbol: "square.grid.2x2", label: "Kategorie") {
                Picker("Kategorie", selection: $draft.category) {
                    Text("Ohne Kategorie").tag(String?.none)
                    ForEach(app.activeCategories) { c in Text(c.name).tag(String?.some(c.slug)) }
                }
            }
            if mode == .standard {
                settingRow(symbol: "hammer", label: "Projekt") {
                    if projectsLoading {
                        ProgressView().controlSize(.small)
                    } else {
                        Picker("Projekt", selection: $draft.projectId) {
                            Text("Kein Projekt").tag(String?.none)
                            ForEach(projects) { p in Text(p.title).tag(String?.some(p.id)) }
                        }
                    }
                }
            }
            settingRow(symbol: visibilitySymbol, label: "Sichtbarkeit", last: true) {
                Picker("Sichtbarkeit", selection: $draft.visibility) {
                    ForEach(L.visibility, id: \.key) { v in Text(v.label).tag(v.key) }
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .cardSurface()
    }

    private var visibilitySymbol: String {
        switch draft.visibility {
        case "FOLLOWERS": "person.2"
        case "PRIVATE": "lock"
        default: "globe.europe.africa"
        }
    }

    private func settingRow<C: View>(symbol: String, label: String, last: Bool = false, @ViewBuilder control: () -> C) -> some View {
        HStack(spacing: 10) {
            Image(systemName: symbol).font(.wr(.footnote)).foregroundStyle(Color.muted).frame(width: 20)
            Text(label).font(.wr(.subheadline)).foregroundStyle(Color.ink2)
            Spacer(minLength: 8)
            control()
                .pickerStyle(.menu)
                .tint(Color.ink)
                .labelsHidden()
        }
        .frame(minHeight: 44)
        .overlay(alignment: .bottom) { if !last { Rectangle().fill(Color.line).frame(height: 0.75) } }
    }

    // MARK: Vorschau

    @ViewBuilder private var preview: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button {
                Haptics.selection()
                withAnimation(.snappy) { showPreview.toggle() }
            } label: {
                HStack {
                    Label("Vorschau", systemImage: showPreview ? "eye.fill" : "eye")
                        .font(.wr(.subheadline, .semibold))
                    Spacer()
                    Image(systemName: "chevron.down")
                        .rotationEffect(.degrees(showPreview ? 180 : 0))
                        .font(.wr(.caption, .semibold))
                }
                .foregroundStyle(Color.ink)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .glassEffect(.regular.interactive(), in: Capsule())
            .accessibilityHint("So erscheint dein Beitrag im Feed")

            if showPreview {
                if let p = previewPost, draft.hasContent {
                    PostCardView(post: p)
                        .allowsHitTesting(false)
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel("Vorschau deines Beitrags")
                        .transition(.opacity.combined(with: .move(edge: .top)))
                } else {
                    Text("Schreib etwas oder füge ein Bild hinzu, um die Vorschau zu sehen.")
                        .font(.wr(.footnote))
                        .foregroundStyle(Color.muted)
                        .padding(.horizontal, 4)
                }
            }
        }
    }

    private var previewPost: PostItem? {
        guard let me = app.me, let profile = me.profile else { return nil }
        let media = draft.media.filter { $0.state == .ready }.map { m in
            MediaItem(id: m.mediaId ?? m.id, alt: m.alt, kind: m.isVideo ? "VIDEO" : "IMAGE", preview: m.remoteURL, url: m.remoteURL)
        }
        let project = draft.projectId.flatMap { pid in projects.first { $0.id == pid } }.map {
            PostItem.ProjectRef(id: $0.id, slug: "", title: $0.title, status: nil, coverUrl: nil, category: draft.category, difficulty: nil, ownerHandle: profile.handle, owner: nil)
        }
        return PostItem(
            id: "preview",
            kind: project == nil ? "TEXT" : "PROJECT_UPDATE",
            body: draft.body.trimmed,
            category: draft.category,
            visibility: draft.visibility,
            publishedAt: Date(),
            author: UserMini(id: me.id, handle: profile.handle, displayName: profile.displayName, avatarUrl: profile.avatarUrl),
            media: media,
            project: project,
            counts: Counts(likes: 0, comments: 0, saves: 0, reposts: 0),
            viewer: ViewerState(liked: false, saved: false, isAuthor: true)
        )
    }
}

// MARK: - Composer

/// Neuer Beitrag (Feed) bzw. Community-Beitrag, wenn `communityId` gesetzt ist.
struct ComposerSheet: View {
    var projectId: String? = nil
    var communityId: String? = nil

    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss

    @State private var draft = SocialPostDraft()
    @State private var projects: [IdTitle] = []
    @State private var projectsLoading = true
    @State private var sending = false
    @State private var confirmDiscard = false

    var body: some View {
        NavigationStack {
            SocialPostEditor(
                draft: $draft,
                mode: communityId == nil ? .standard : .community(name: nil),
                projects: projects,
                projectsLoading: projectsLoading,
                placeholder: communityId == nil ? "Was entsteht gerade auf deiner Werkbank?" : "Was möchtest du mit der Community teilen?"
            )
            .navigationTitle(communityId == nil ? "Neuer Beitrag" : "Community-Beitrag")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { if draft.hasContent { confirmDiscard = true } else { dismiss() } }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button { Task { await submit() } } label: {
                        if sending { ProgressView() } else { Text(draft.isUploading ? "Lädt hoch …" : "Veröffentlichen") }
                    }
                    .buttonStyle(.glassProminent)
                    .tint(.moss)
                    .disabled(!draft.canSubmit || sending)
                }
            }
            .confirmationDialog("Entwurf verwerfen?", isPresented: $confirmDiscard, titleVisibility: .visible) {
                Button("Verwerfen", role: .destructive) { dismiss() }
                Button("Weiter schreiben", role: .cancel) {}
            }
        }
        .interactiveDismissDisabled(draft.hasContent)
        .task {
            draft.projectId = projectId
            await loadProjects()
        }
    }

    private func loadProjects() async {
        guard communityId == nil else { projectsLoading = false; return }
        projects = (try? await APIClient.shared.get("/me/project-options") as [IdTitle]) ?? []
        if let pid = projectId, !projects.contains(where: { $0.id == pid }) { draft.projectId = nil }
        projectsLoading = false
    }

    private func submit() async {
        guard draft.canSubmit, !sending else { return }
        sending = true
        defer { sending = false }
        do {
            if let communityId {
                let body: [String: JSONValue] = ["body": .string(draft.body.trimmed), "media": draft.readyMediaJSON, "isAnnouncement": false]
                let r: SocialCreatedId = try await APIClient.shared.post("/communities/\(communityId)/posts", body)
                NotificationCenter.default.post(name: .socialPostsChanged, object: r.id, userInfo: ["communityId": communityId])
            } else {
                var body: [String: JSONValue] = ["body": .string(draft.body.trimmed), "media": draft.readyMediaJSON, "visibility": .string(draft.visibility)]
                if let c = draft.category { body["category"] = .string(c) }
                if let p = draft.projectId { body["projectId"] = .string(p) }
                let post: PostItem = try await APIClient.shared.post("/posts", body)
                NotificationCenter.default.post(name: .socialPostsChanged, object: post)
            }
            Haptics.success()
            app.show("Veröffentlicht.")
            dismiss()
        } catch {
            app.show(error: error)
        }
    }
}

// MARK: - Bearbeiten

struct EditPostSheet: View {
    var id: String

    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss

    @State private var draft = SocialPostDraft()
    @State private var original = SocialPostDraft()
    @State private var source: SocialPostEdit?
    @State private var projects: [IdTitle] = []
    @State private var projectsLoading = true
    @State private var error: String?
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Group {
                if let source {
                    SocialPostEditor(
                        draft: $draft,
                        mode: source.community != nil ? .community(name: source.community?.name) : source.repostOf != nil ? .repost : .standard,
                        projects: projects,
                        projectsLoading: projectsLoading
                    )
                } else if let error {
                    ErrorStateView(message: error) { await load() }
                } else {
                    LoadingView()
                }
            }
            .background(Color.paper)
            .navigationTitle("Beitrag bearbeiten")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button { Task { await save() } } label: {
                        if saving { ProgressView() } else { Text(draft.isUploading ? "Lädt hoch …" : "Sichern") }
                    }
                    .buttonStyle(.glassProminent)
                    .tint(.moss)
                    .disabled(source == nil || !canSave || saving)
                }
            }
        }
        .interactiveDismissDisabled(draft != original)
        .task { await load() }
    }

    private var canSave: Bool {
        // Reposts dürfen ohne eigenen Text bestehen
        (draft.canSubmit || (source?.repostOf != nil && !draft.isUploading)) && draft != original
    }

    private func load() async {
        do {
            let s: SocialPostEdit = try await APIClient.shared.get("/posts/\(id)/edit")
            var d = SocialPostDraft()
            d.body = s.body
            d.category = s.category
            d.visibility = s.visibility ?? "PUBLIC"
            d.projectId = s.projectId
            d.media = s.media.map { m in
                var x = DraftMedia.existing(id: m.id, url: m.preview?.nilIfEmpty, alt: m.alt)
                x.isVideo = m.kind == "VIDEO"
                return x
            }
            draft = d
            original = d
            withAnimation(.snappy) { source = s; error = nil }
            projects = (try? await APIClient.shared.get("/me/project-options") as [IdTitle]) ?? []
            if let p = s.project, !projects.contains(where: { $0.id == p.id }) { projects.insert(p, at: 0) }
            projectsLoading = false
        } catch is CancellationError {
        } catch {
            self.error = (error as? APIError)?.message ?? error.localizedDescription
        }
    }

    private func save() async {
        guard !saving else { return }
        saving = true
        defer { saving = false }
        var body: [String: JSONValue] = [
            "body": .string(draft.body.trimmed),
            "visibility": .string(draft.visibility),
            "media": draft.readyMediaJSON,
            "projectId": .from(draft.projectId),
        ]
        if let c = draft.category { body["category"] = .string(c) }
        do {
            let post: PostItem = try await APIClient.shared.patch("/posts/\(id)", body)
            NotificationCenter.default.post(name: .socialPostsChanged, object: post, userInfo: ["edited": true])
            Haptics.success()
            app.show("Änderungen gesichert.")
            dismiss()
        } catch {
            app.show(error: error)
        }
    }
}
