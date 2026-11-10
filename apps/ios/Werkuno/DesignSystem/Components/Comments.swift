import SwiftUI

/// Kommentare & Fragen zu Beiträgen, Projekten, Anleitungen, Artikeln (§9.4)
struct CommentsSection: View {
    var type: String
    var id: String
    var title: String = "Kommentare"
    var placeholder: String = "Kommentar schreiben …"
    var allowComments = true
    var initial: [CommentItem]? = nil

    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @State private var comments: [CommentItem] = []
    @State private var loaded = false
    /// Cursor zu den nächstälteren Kommentaren (`nil` = alles geladen)
    @State private var nextCursor: String?
    /// Wurden schon ältere Seiten nachgeladen? Dann behält ein Neuladen der ersten Seite sie bei.
    @State private var loadedOlder = false
    @State private var loadingOlder = false
    @State private var text = ""
    @State private var replyTo: CommentItem?
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHeader(title, subtitle: comments.isEmpty ? nil : Fmt.plural(total, "Beitrag", "Beiträge"))
            if allowComments && app.isSignedIn { composer }
            if !loaded {
                YarnSpinner(size: 22).frame(maxWidth: .infinity).padding()
            } else if comments.isEmpty {
                Text("Noch keine Kommentare. Stell die erste Frage oder teile deine Erfahrung.").font(.wr(.subheadline)).foregroundStyle(Color.muted).padding(.vertical, 8)
            } else {
                VStack(alignment: .leading, spacing: 16) {
                    // Als Lösung markierte Antworten stehen oben, dann chronologisch – ältere Seiten davor
                    ForEach(comments.filter { $0.isAnswer == true }) { c in thread(c) }
                    if nextCursor != nil { olderButton }
                    ForEach(comments.filter { $0.isAnswer != true }) { c in thread(c) }
                }
            }
        }
        .task(id: id) {
            if let initial, !loaded { comments = initial; loaded = true }
            await load()
        }
    }

    @ViewBuilder
    private func thread(_ c: CommentItem) -> some View {
        CommentRow(comment: c, type: type, onReply: { replyTo = c; focused = true }, onDeleted: { removed(c.id) })
        if let replies = c.replies, !replies.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                ForEach(replies) { r in CommentRow(comment: r, type: type, isReply: true, onReply: { replyTo = c; focused = true }, onDeleted: { removed(r.id) }) }
            }
            .padding(.leading, 34)
            .overlay(alignment: .leading) { Rectangle().fill(Color.line).frame(width: 1).padding(.leading, 16) }
        }
    }

    private var olderButton: some View {
        Button { Task { await loadOlder() } } label: {
            HStack(spacing: 8) {
                if loadingOlder { ProgressView().controlSize(.small) } else { Image(systemName: "arrow.up.circle") }
                Text("Ältere Kommentare laden")
            }
            .font(.wr(.footnote, .semibold))
            .foregroundStyle(Color.moss)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 6)
        }
        .buttonStyle(.plain)
        .disabled(loadingOlder)
    }

    private var total: Int { comments.reduce(0) { $0 + 1 + ($1.replies?.count ?? 0) } }

    private var composer: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let r = replyTo {
                HStack {
                    Text("Antwort an \(r.author.displayName)").font(.wr(.caption)).foregroundStyle(Color.muted)
                    Button { replyTo = nil } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(Color.muted) }.buttonStyle(.plain)
                }
            }
            HStack(alignment: .bottom, spacing: 8) {
                AvatarView(url: app.me?.profile?.avatarUrl, name: app.me?.profile?.displayName ?? "Du", size: 30)
                TextField(placeholder, text: $text, axis: .vertical)
                    .lineLimit(1...6)
                    .focused($focused)
                    .padding(.horizontal, 12).padding(.vertical, 9)
                    .background(Color.sunken, in: .rect(cornerRadius: 18, style: .continuous))
                AsyncButton {
                    await send()
                } label: {
                    Image(systemName: "arrow.up").font(.wr(.subheadline, .bold)).frame(width: 34, height: 34)
                }
                .buttonStyle(.glassProminent)
                .tint(.moss)
                .buttonBorderShape(.circle)
                .disabled(text.trimmed.isEmpty)
                .accessibilityLabel("Senden")
            }
        }
    }

    /// Erste Seite (neueste Kommentare + markierte Antworten) mit `paged=1` → `{ items, nextCursor }`.
    private func load() async {
        do {
            let page: Page<CommentItem> = try await APIClient.shared.get("/comments", query: ["type": type, "id": id, "paged": "1"])
            withAnimation(.snappy) {
                comments = merged(firstPage: page.items)
                // Nach dem Nachladen älterer Seiten gilt deren Cursor weiter
                if !loadedOlder { nextCursor = page.nextCursor }
                loaded = true
            }
        } catch { loaded = true }
    }

    /// Ältere Seite vor die bisher geladenen Kommentare setzen (innerhalb der Seite chronologisch).
    private func loadOlder() async {
        guard let cursor = nextCursor, !loadingOlder else { return }
        loadingOlder = true
        defer { loadingOlder = false }
        do {
            let page: Page<CommentItem> = try await APIClient.shared.get("/comments", query: ["type": type, "id": id, "cursor": cursor])
            let known = Set(comments.map(\.id))
            let older = page.items.filter { !known.contains($0.id) && $0.isAnswer != true }
            withAnimation(.snappy) {
                comments = comments.filter { $0.isAnswer == true } + older + comments.filter { $0.isAnswer != true }
                nextCursor = page.nextCursor
                loadedOlder = true
            }
        } catch { app.show(error: error) }
    }

    /// Neu geladene erste Seite mit bereits nachgeladenen älteren Kommentaren zusammenführen: Ältere als
    /// der älteste Kommentar der neuen ersten Seite bleiben stehen (auch die, die durch neue Kommentare
    /// aus der ersten Seite gerutscht sind), damit keine Lücke entsteht.
    private func merged(firstPage: [CommentItem]) -> [CommentItem] {
        guard loadedOlder else { return firstPage }
        let answers = firstPage.filter { $0.isAnswer == true }
        let latest = firstPage.filter { $0.isAnswer != true }
        guard let oldest = latest.compactMap(\.createdAt).min() else { return firstPage }
        let fresh = Set(firstPage.map(\.id))
        let keep = comments.filter { c in
            guard c.isAnswer != true, !fresh.contains(c.id), let at = c.createdAt else { return false }
            return at <= oldest
        }
        return answers + keep + latest
    }

    /// Gelöschten Kommentar bzw. gelöschte Antwort sofort entfernen, dann die erste Seite neu laden.
    private func removed(_ commentId: String) {
        withAnimation(.snappy) {
            comments.removeAll { $0.id == commentId }
            for i in comments.indices { comments[i].replies?.removeAll { $0.id == commentId } }
        }
        Task { await load() }
    }

    private func send() async {
        let body = text.trimmed
        guard !body.isEmpty else { return }
        let parentId = replyTo?.id
        do {
            let r: JSONValue = try await APIClient.shared.post("/comments", ["type": JSONValue.string(type), "id": .string(id), "body": .string(body), "parentId": .from(parentId)])
            text = ""
            replyTo = nil
            focused = false
            Haptics.success()
            await load()
            // Antwort auf einen nachgeladenen älteren Kommentar: Der steht nicht in der neu geladenen
            // ersten Seite – die Antwort lokal anhängen, bis die Liste das nächste Mal ganz neu lädt.
            if let parentId, let newId = r["id"]?.string, let me = app.me, let p = me.profile,
               let i = comments.firstIndex(where: { $0.id == parentId }),
               comments[i].replies?.contains(where: { $0.id == newId }) != true {
                let reply = CommentItem(id: newId, body: body, createdAt: Date(), editedAt: nil, likeCount: 0, liked: false, isQuestion: false, isAnswer: false,
                                        author: UserMini(id: me.id, handle: p.handle, displayName: p.displayName, avatarUrl: p.avatarUrl), replies: nil)
                withAnimation(.snappy) { comments[i].replies = (comments[i].replies ?? []) + [reply] }
            }
        } catch { app.show(error: error) }
    }
}

struct CommentRow: View {
    var comment: CommentItem
    var type: String
    var isReply = false
    var onReply: () -> Void
    var onDeleted: () -> Void
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Button { router.open(.profile(handle: comment.author.handle)) } label: {
                AvatarView(url: comment.author.avatarUrl, name: comment.author.displayName, size: isReply ? 26 : 32)
            }.buttonStyle(.plain)
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(comment.author.displayName).font(.wr(.footnote, .semibold)).foregroundStyle(Color.ink)
                    Text(Fmt.relative(comment.createdAt)).font(.wr(.caption)).foregroundStyle(Color.muted)
                    if comment.isQuestion == true { Pill(text: "Frage", tint: .slate) }
                    if comment.isAnswer == true { Pill(text: "Antwort", symbol: "checkmark", tint: .moss) }
                }
                Text(comment.body).font(.wr(.subheadline)).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true).textSelection(.enabled)
                HStack(spacing: 16) {
                    LikeButton(type: "COMMENT", id: comment.id, liked: comment.liked ?? false, count: comment.likeCount ?? 0)
                        .font(.wr(.caption))
                    if app.isSignedIn { Button("Antworten", action: onReply).font(.wr(.caption, .semibold)).foregroundStyle(Color.muted).buttonStyle(.plain) }
                    Spacer()
                    Menu {
                        if comment.author.id == app.me?.id || app.me?.isModerator == true {
                            Button("Löschen", systemImage: "trash", role: .destructive) {
                                Task { if await app.run("Kommentar entfernt.", { _ = try await APIClient.shared.delete("/comments/\(comment.id)") as JSONValue }) { onDeleted() } }
                            }
                        }
                        Button("Melden …", systemImage: "flag") { router.present(.report(targetType: "COMMENT", targetId: comment.id)) }
                    } label: { Image(systemName: "ellipsis").font(.wr(.caption)).foregroundStyle(Color.muted).frame(width: 28, height: 24) }
                }
            }
        }
    }
}
