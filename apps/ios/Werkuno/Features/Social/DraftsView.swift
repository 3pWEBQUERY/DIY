import SwiftUI

// Entwürfe & geplante Beiträge (Web: Studio → Inhalte → Beiträge, Zustand „Entwürfe“,
// Bearbeiten unter /studio/inhalte/beitrag/[id]).

enum SocialDraftAPI {
    /// Jetzt veröffentlichen
    static func publish(_ id: String) async throws {
        _ = try await APIClient.shared.post("/posts/\(id)/publish") as JSONValue
        NotificationCenter.default.post(name: .socialPostsChanged, object: id)
        NotificationCenter.default.post(name: .socialDraftsChanged, object: id)
    }

    /// Zeitpunkt setzen (planen) oder mit `nil` entfernen (bleibt Entwurf)
    static func schedule(_ id: String, at: Date?) async throws {
        _ = try await APIClient.shared.post("/posts/\(id)/schedule", ["scheduledAt": JSONValue.from(at.map(SocialFmt.iso))]) as SocialScheduleResult
        NotificationCenter.default.post(name: .socialDraftsChanged, object: id)
    }
}

/// Liste der eigenen Entwürfe und geplanten Beiträge (geplante zuerst, nach Zeitpunkt).
struct SocialDraftsView: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router

    @State private var items: [PostItem]?
    @State private var error: String?
    @State private var scheduleFor: PostItem?
    @State private var deleteCandidate: PostItem?

    var body: some View {
        Group {
            if let items {
                if items.isEmpty {
                    ScrollView {
                        EmptyStateView(symbol: "doc.text", title: "Keine Entwürfe",
                                       message: "Alles ist draussen in der Welt. Im Composer kannst du unter „Später“ einen Beitrag als Entwurf speichern oder planen.",
                                       actionTitle: "Beitrag schreiben") { router.present(.composer()) }
                            .padding(.top, 40)
                    }
                } else {
                    list(items)
                }
            } else if let error {
                ErrorStateView(message: error) { await load() }
            } else {
                LoadingView()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Color.paper)
        .navigationTitle("Entwürfe & geplant")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { router.present(.composer()) } label: { Image(systemName: "square.and.pencil") }
                    .accessibilityLabel("Neuer Beitrag")
            }
        }
        .task { if items == nil { await load() } }
        .refreshable { await load() }
        .onReceive(NotificationCenter.default.publisher(for: .socialDraftsChanged)) { _ in Task { await load() } }
        .onReceive(NotificationCenter.default.publisher(for: .socialPostsChanged)) { note in
            if let id = (note.object as? PostItem)?.id ?? (note.object as? String), items?.contains(where: { $0.id == id }) == true { Task { await load() } }
        }
        .sheet(item: $scheduleFor) { p in
            SocialScheduleSheet(title: p.scheduledAt == nil ? "Veröffentlichung planen" : "Zeitpunkt ändern", initial: p.scheduledAt) { date in
                await app.run("Geplant für \(SocialSchedule.label(date)).") { try await SocialDraftAPI.schedule(p.id, at: date) }
            }
        }
        .confirmationDialog("Entwurf löschen?", isPresented: Binding(get: { deleteCandidate != nil }, set: { if !$0 { deleteCandidate = nil } }), titleVisibility: .visible, presenting: deleteCandidate) { p in
            Button("Löschen", role: .destructive) { Task { await delete(p) } }
        } message: { _ in Text("Der Entwurf wird endgültig gelöscht.") }
    }

    private func list(_ items: [PostItem]) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                let scheduled = items.filter { $0.scheduledAt != nil }
                let drafts = items.filter { $0.scheduledAt == nil }
                Text("Nur du siehst diese Beiträge. Geplante erscheinen automatisch zum gewählten Zeitpunkt.")
                    .font(.wr(.footnote))
                    .foregroundStyle(Color.muted)
                if !scheduled.isEmpty {
                    SectionHeader("Geplant", number: "01", subtitle: Fmt.plural(scheduled.count, "Beitrag", "Beiträge")).padding(.top, 8)
                    ForEach(scheduled) { row($0) }
                }
                if !drafts.isEmpty {
                    SectionHeader("Entwürfe", number: scheduled.isEmpty ? "01" : "02", subtitle: Fmt.plural(drafts.count, "Entwurf", "Entwürfe")).padding(.top, 8)
                    ForEach(drafts) { row($0) }
                }
            }
            .padding(.horizontal, Space.gutter)
            .padding(.vertical, Space.l)
        }
    }

    private func row(_ p: PostItem) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                if let at = p.scheduledAt {
                    Pill(text: "Geplant · \(SocialSchedule.label(at))", symbol: "calendar.badge.clock", tint: .moss)
                } else {
                    Pill(text: "Entwurf", symbol: "doc.text", tint: .warn)
                }
                Spacer(minLength: 0)
                Text(Fmt.relative(p.editedAt ?? p.publishedAt)).font(.wr(.caption)).foregroundStyle(Color.muted)
            }
            Button { router.open(.post(id: p.id)) } label: {
                VStack(alignment: .leading, spacing: 6) {
                    Text(p.body.nilIfEmpty ?? "Ohne Text")
                        .font(.wr(.body))
                        .foregroundStyle(p.body.isEmpty ? Color.muted : Color.ink)
                        .a11yLineLimit(4)
                        .multilineTextAlignment(.leading)
                    let meta = [
                        p.media.isEmpty ? nil : Fmt.plural(p.media.count, "Medium", "Medien"),
                        p.poll == nil ? nil : "Umfrage",
                        p.project.map { "Projekt: \($0.title)" },
                        p.visibility.map { L.visibility($0) },
                    ].compactMap { $0 }
                    if !meta.isEmpty { Text(meta.joined(separator: " · ")).font(.wr(.caption)).foregroundStyle(Color.muted).a11yLineLimit(1) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .accessibilityHint("Vorschau öffnen")

            HStack(spacing: 8) {
                AsyncButton {
                    if await app.run("Veröffentlicht.", { try await SocialDraftAPI.publish(p.id) }) { Haptics.success() }
                } label: {
                    Label("Jetzt veröffentlichen", systemImage: "paperplane").font(.wr(.footnote, .semibold))
                }
                .buttonStyle(.glassProminent)
                .tint(.action)
                Menu {
                    Button("Bearbeiten", systemImage: "pencil") { router.present(.editPost(id: p.id)) }
                    Button(p.scheduledAt == nil ? "Veröffentlichung planen …" : "Zeitpunkt ändern …", systemImage: "calendar.badge.clock") { scheduleFor = p }
                    if p.scheduledAt != nil {
                        Button("Planung aufheben", systemImage: "calendar.badge.minus") {
                            Task { await app.run("Planung aufgehoben – der Beitrag bleibt ein Entwurf.") { try await SocialDraftAPI.schedule(p.id, at: nil) } }
                        }
                    }
                    if p.repostOf == nil {
                        Button("Koautor:innen", systemImage: "person.2") { router.present(.coauthors(postId: p.id)) }
                    }
                    Divider()
                    Button("Löschen", systemImage: "trash", role: .destructive) { deleteCandidate = p }
                } label: {
                    Label("Mehr", systemImage: "ellipsis").font(.wr(.footnote, .semibold))
                }
                .buttonStyle(.glass)
                .accessibilityLabel("Weitere Aktionen")
                Spacer(minLength: 0)
            }
        }
        .padding(16)
        .cardSurface()
    }

    private func load() async {
        do {
            let r: [PostItem] = try await APIClient.shared.get("/posts/drafts")
            withAnimation(.snappy) { items = r; error = nil }
        } catch is CancellationError {
        } catch {
            if items == nil { self.error = (error as? APIError)?.message ?? error.localizedDescription } else { app.show(error: error) }
        }
    }

    private func delete(_ p: PostItem) async {
        if await app.run("Entwurf gelöscht.", { _ = try await APIClient.shared.delete("/posts/\(p.id)") as JSONValue }) {
            withAnimation(.snappy) { items?.removeAll { $0.id == p.id } }
        }
    }
}

/// Hinweis auf der Beitragsseite, solange der eigene Beitrag ein Entwurf ist.
struct SocialDraftBanner: View {
    var postId: String
    var scheduledAt: Date?
    @Environment(AppState.self) private var app
    @State private var scheduling = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            NoticeView(tone: scheduledAt == nil ? .warn : .info,
                       title: scheduledAt.map { "Geplant für \(SocialSchedule.label($0))" } ?? "Entwurf",
                       message: scheduledAt == nil ? "Nur du siehst diesen Beitrag. Veröffentliche ihn jetzt oder plane einen Zeitpunkt."
                                                   : "Nur du siehst diesen Beitrag, bis er automatisch erscheint.")
            FlowLayout(spacing: 8) {
                AsyncButton {
                    if await app.run("Veröffentlicht.", { try await SocialDraftAPI.publish(postId) }) { Haptics.success() }
                } label: {
                    Label("Jetzt veröffentlichen", systemImage: "paperplane").font(.wr(.footnote, .semibold))
                }
                .buttonStyle(.glassProminent)
                .tint(.action)
                Button { scheduling = true } label: {
                    Label(scheduledAt == nil ? "Planen" : "Zeitpunkt ändern", systemImage: "calendar.badge.clock").font(.wr(.footnote, .semibold))
                }
                .buttonStyle(.glass)
                if scheduledAt != nil {
                    AsyncButton {
                        await app.run("Planung aufgehoben – der Beitrag bleibt ein Entwurf.") { try await SocialDraftAPI.schedule(postId, at: nil) }
                    } label: {
                        Label("Planung aufheben", systemImage: "calendar.badge.minus").font(.wr(.footnote, .semibold))
                    }
                    .buttonStyle(.glass)
                }
            }
        }
        .sheet(isPresented: $scheduling) {
            SocialScheduleSheet(title: scheduledAt == nil ? "Veröffentlichung planen" : "Zeitpunkt ändern", initial: scheduledAt) { date in
                await app.run("Geplant für \(SocialSchedule.label(date)).") { try await SocialDraftAPI.schedule(postId, at: date) }
            }
        }
    }
}
