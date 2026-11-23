import SwiftUI

/// Kommentare & Fragen zu Beiträgen, Projekten, Anleitungen, Artikeln (§9.4)
struct CommentsSection: View {
    var type: String
    var id: String
    var title: String = "Kommentare"
    var placeholder: String = "Kommentar schreiben …"
    var allowComments = true
    var initial: [CommentItem]? = nil
    /// Nur Fragen zu diesem Anleitungsschritt (stableKey); neue Fragen werden ihm zugeordnet
    var stepKey: String? = nil
    /// Anzahl geladener Hauptbeiträge (z. B. für „Fragen (n)“ am Schritt)
    var onCount: ((Int) -> Void)? = nil

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
    @State private var meta: CommentMeta?
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHeader(title, subtitle: comments.isEmpty ? nil : Fmt.plural(total, "Beitrag", "Beiträge"))
            if let meta, meta.isOwner, meta.lockable, stepKey == nil { ownerBar(meta) }
            if meta?.locked == true {
                if meta?.isOwner != true || stepKey != nil { lockedNotice }
            } else if allowComments && app.isSignedIn { composer }
            if !loaded {
                YarnSpinner(size: 22).frame(maxWidth: .infinity).padding()
            } else if comments.isEmpty {
                Text(stepKey == nil ? "Noch keine Kommentare. Stell die erste Frage oder teile deine Erfahrung." : "Noch keine Fragen zu diesem Schritt. Hängst du hier? Frag einfach – die Autorin bzw. der Autor sieht sofort, um welchen Schritt es geht.")
                    .font(.wr(.subheadline)).foregroundStyle(Color.muted).padding(.vertical, 8)
            } else {
                VStack(alignment: .leading, spacing: 16) {
                    // Angehefteter Kommentar ganz oben, dann markierte Antworten, dann chronologisch – ältere Seiten davor
                    ForEach(comments.filter { $0.pinned == true }) { c in thread(c) }
                    ForEach(comments.filter { $0.isAnswer == true && $0.pinned != true }) { c in thread(c) }
                    if nextCursor != nil { olderButton }
                    ForEach(comments.filter { $0.isAnswer != true && $0.pinned != true }) { c in thread(c) }
                }
            }
        }
        .task(id: id) {
            if let initial, !loaded { comments = initial; loaded = true }
            async let page: Void = load()
            async let settings: Void = loadMeta()
            _ = await (page, settings)
        }
        .onChange(of: comments.count) { _, n in if nextCursor == nil { onCount?(n) } }
    }

    private var owner: CommentOwner? {
        guard let meta, meta.isOwner else { return nil }
        return CommentOwner(pro: meta.ownerPro, name: meta.ownerName)
    }

    @ViewBuilder
    private func thread(_ c: CommentItem) -> some View {
        CommentRow(comment: c, type: type, showStep: stepKey == nil, owner: owner, ownerName: meta?.ownerName ?? "", onReply: { replyTo = c; focused = true }, onDeleted: { removed(c.id) }, onChanged: { Task { await load() } })
        if let replies = c.replies, !replies.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                ForEach(replies) { r in CommentRow(comment: r, type: type, isReply: true, owner: owner, ownerName: meta?.ownerName ?? "", onReply: { replyTo = c; focused = true }, onDeleted: { removed(r.id) }, onChanged: { Task { await load() } }) }
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

    private var lockedNotice: some View {
        Label("Die Kommentare sind geschlossen.", systemImage: "lock")
            .font(.wr(.subheadline)).foregroundStyle(Color.muted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(Color.sunken, in: .rect(cornerRadius: 14, style: .continuous))
    }

    /// Inhaber:in: Kommentare schliessen/öffnen (Creator Pro); ohne Pro ein dezenter Hinweis
    private func ownerBar(_ m: CommentMeta) -> some View {
        HStack(spacing: 10) {
            if m.locked { Image(systemName: "lock").foregroundStyle(Color.muted) }
            Text(m.locked ? "Kommentare sind geschlossen." : "Du kannst Kommentare anheften und schliessen.")
                .font(.wr(.caption)).foregroundStyle(Color.muted)
            Spacer(minLength: 0)
            if m.locked || m.ownerPro {
                AsyncButton { await setLocked(!m.locked) } label: {
                    Text(m.locked ? "Öffnen" : "Schliessen").font(.wr(.caption, .semibold))
                }
                .buttonStyle(.plain).foregroundStyle(Color.moss)
            } else {
                Button("Mit Creator Pro") { router.open(.creatorPro(feature: .kommentare)) }
                    .font(.wr(.caption, .semibold)).foregroundStyle(Color.ink2).buttonStyle(.plain)
            }
        }
    }

    private func loadMeta() async {
        meta = try? await APIClient.shared.get("/comments/meta", query: ["type": type, "id": id])
    }

    private func setLocked(_ locked: Bool) async {
        let ok = await app.run(locked ? "Kommentare geschlossen." : "Kommentare wieder offen.") {
            _ = try await APIClient.shared.post("/comments/lock", ["type": JSONValue.string(type), "id": .string(id), "locked": .bool(locked)]) as JSONValue
        }
        if ok { meta?.locked = locked }
    }

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
            let page: Page<CommentItem> = try await APIClient.shared.get("/comments", query: ["type": type, "id": id, "paged": "1", "step": stepKey])
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
            let page: Page<CommentItem> = try await APIClient.shared.get("/comments", query: ["type": type, "id": id, "cursor": cursor, "step": stepKey])
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
            var payload: [String: JSONValue] = ["type": .string(type), "id": .string(id), "body": .string(body), "parentId": .from(parentId)]
            if parentId == nil, let stepKey { payload["stepKey"] = .string(stepKey) }
            let r: JSONValue = try await APIClient.shared.post("/comments", payload)
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

/// Inhaber:in des kommentierten Inhalts (darf anheften, einblenden, entfernen)
struct CommentOwner: Hashable, Sendable {
    var pro: Bool
    var name: String
}

struct CommentRow: View {
    var comment: CommentItem
    var type: String
    var isReply = false
    /// Hinweis „Schritt n“ zeigen (nicht innerhalb der Fragen eines Schritts)
    var showStep = true
    var owner: CommentOwner? = nil
    var ownerName: String = ""
    var onReply: () -> Void
    var onDeleted: () -> Void
    var onChanged: () -> Void = {}
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @Environment(\.contentLinksEnabled) private var linksEnabled

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Button { router.open(.profile(handle: comment.author.handle)) } label: {
                AvatarView(url: comment.author.avatarUrl, name: comment.author.displayName, size: isReply ? 26 : 32)
            }.buttonStyle(.plain)
            VStack(alignment: .leading, spacing: 4) {
                markers
                HStack(spacing: 6) {
                    Text(comment.author.displayName).font(.wr(.footnote, .semibold)).foregroundStyle(Color.ink)
                    Text(Fmt.relative(comment.createdAt)).font(.wr(.caption)).foregroundStyle(Color.muted)
                    if comment.isQuestion == true { Pill(text: "Frage", tint: .slate) }
                    if comment.isAnswer == true { Pill(text: "Antwort", symbol: "checkmark", tint: .moss) }
                    if showStep, !isReply, let st = comment.step { Pill(text: "Schritt \(st.n)", tint: .slate).accessibilityLabel("Frage zu Schritt \(st.n): \(st.title)") }
                }
                Text(LinkedText.attributed(comment.body, links: linksEnabled)).font(.wr(.subheadline)).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true).textSelection(.enabled).contentLinks()
                HStack(spacing: 16) {
                    LikeButton(type: "COMMENT", id: comment.id, liked: comment.liked ?? false, count: comment.likeCount ?? 0)
                        .font(.wr(.caption))
                    if app.isSignedIn { Button("Antworten", action: onReply).font(.wr(.caption, .semibold)).foregroundStyle(Color.muted).buttonStyle(.plain) }
                    Spacer()
                    Menu {
                        ownerActions
                        if comment.author.id == app.me?.id || app.me?.isModerator == true || owner != nil {
                            Button("Löschen", systemImage: "trash", role: .destructive) {
                                Task { if await app.run("Kommentar entfernt.", { _ = try await APIClient.shared.delete("/comments/\(comment.id)") as JSONValue }) { onDeleted() } }
                            }
                        }
                        Button("Melden …", systemImage: "flag") { router.present(.report(targetType: "COMMENT", targetId: comment.id)) }
                        if app.me != nil, comment.author.id != app.me?.id {
                            Divider()
                            // Blockieren blendet die Person überall aus – auch diesen Kommentar
                            Button("\(comment.author.displayName) blockieren", systemImage: "hand.raised", role: .destructive) {
                                Task { if await app.run("Profil blockiert.", { try await SocialAPI.block(comment.author.id, true) }) { onDeleted() } }
                            }
                        }
                    } label: {
                        // Tippfläche 44 × 44 pt (HIG), ohne die Zeile höher zu machen
                        Image(systemName: "ellipsis").font(.wr(.caption)).foregroundStyle(Color.muted)
                            .frame(width: 44, height: 44).contentShape(.rect).padding(.vertical, -10)
                    }
                    .accessibilityLabel("Optionen des Kommentars")
                }
            }
        }
    }
}

// MARK: - Creator Pro: Anheften, Wortfilter

extension CommentRow {
    @ViewBuilder
    var markers: some View {
        if comment.pinned == true, !isReply {
            Label(ownerName.isEmpty ? "Angeheftet" : "Angeheftet von \(ownerName)", systemImage: "pin.fill")
                .font(.wr(.caption2, .semibold)).foregroundStyle(Color.moss)
        }
        if comment.filtered == true {
            Label("Ausgeblendet durch deinen Wortfilter", systemImage: "eye.slash")
                .font(.wr(.caption2, .semibold)).foregroundStyle(Color.muted)
        }
    }

    @ViewBuilder
    var ownerActions: some View {
        if let owner {
            if comment.filtered == true {
                Button("Einblenden", systemImage: "eye") {
                    Task { if await app.run("Kommentar eingeblendet.", { _ = try await APIClient.shared.post("/comments/\(comment.id)/unfilter") as JSONValue }) { onChanged() } }
                }
            } else if !isReply, ["POST", "PROJECT", "TUTORIAL", "ARTICLE"].contains(type) {
                if comment.pinned == true || owner.pro {
                    Button(comment.pinned == true ? "Lösen" : "Anheften", systemImage: comment.pinned == true ? "pin.slash" : "pin") {
                        let pin = comment.pinned != true
                        Task { if await app.run(pin ? "Kommentar angeheftet." : "Kommentar gelöst.", { _ = try await APIClient.shared.post("/comments/\(comment.id)/pin", ["pinned": JSONValue.bool(pin)]) as JSONValue }) { onChanged() } }
                    }
                } else {
                    Button("Anheften (Creator Pro)", systemImage: "pin") { router.open(.creatorPro(feature: .kommentare)) }
                }
            }
            Divider()
        }
    }
}
