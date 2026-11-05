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
                Text("Noch keine Kommentare. Stell die erste Frage oder teile deine Erfahrung.").font(.subheadline).foregroundStyle(Color.muted).padding(.vertical, 8)
            } else {
                VStack(alignment: .leading, spacing: 16) {
                    ForEach(comments) { c in
                        CommentRow(comment: c, type: type, onReply: { replyTo = c; focused = true }, onDeleted: { Task { await load() } })
                        if let replies = c.replies, !replies.isEmpty {
                            VStack(alignment: .leading, spacing: 12) {
                                ForEach(replies) { r in CommentRow(comment: r, type: type, isReply: true, onReply: { replyTo = c; focused = true }, onDeleted: { Task { await load() } }) }
                            }
                            .padding(.leading, 34)
                            .overlay(alignment: .leading) { Rectangle().fill(Color.line).frame(width: 1).padding(.leading, 16) }
                        }
                    }
                }
            }
        }
        .task(id: id) {
            if let initial, !loaded { comments = initial; loaded = true }
            await load()
        }
    }

    private var total: Int { comments.reduce(0) { $0 + 1 + ($1.replies?.count ?? 0) } }

    private var composer: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let r = replyTo {
                HStack {
                    Text("Antwort an \(r.author.displayName)").font(.caption).foregroundStyle(Color.muted)
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
                    Image(systemName: "arrow.up").font(.subheadline.weight(.bold)).frame(width: 34, height: 34)
                }
                .buttonStyle(.glassProminent)
                .tint(.moss)
                .buttonBorderShape(.circle)
                .disabled(text.trimmed.isEmpty)
                .accessibilityLabel("Senden")
            }
        }
    }

    private func load() async {
        do {
            let list: [CommentItem] = try await APIClient.shared.get("/comments", query: ["type": type, "id": id])
            withAnimation(.snappy) { comments = list; loaded = true }
        } catch { loaded = true }
    }

    private func send() async {
        let body = text.trimmed
        guard !body.isEmpty else { return }
        do {
            _ = try await APIClient.shared.post("/comments", ["type": JSONValue.string(type), "id": .string(id), "body": .string(body), "parentId": .from(replyTo?.id)]) as JSONValue
            text = ""
            replyTo = nil
            focused = false
            Haptics.success()
            await load()
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
                    Text(comment.author.displayName).font(.footnote.weight(.semibold)).foregroundStyle(Color.ink)
                    Text(Fmt.relative(comment.createdAt)).font(.caption).foregroundStyle(Color.muted)
                    if comment.isQuestion == true { Pill(text: "Frage", tint: .slate) }
                    if comment.isAnswer == true { Pill(text: "Antwort", symbol: "checkmark", tint: .moss) }
                }
                Text(comment.body).font(.subheadline).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true).textSelection(.enabled)
                HStack(spacing: 16) {
                    LikeButton(type: "COMMENT", id: comment.id, liked: comment.liked ?? false, count: comment.likeCount ?? 0)
                        .font(.caption)
                    if app.isSignedIn { Button("Antworten", action: onReply).font(.caption.weight(.semibold)).foregroundStyle(Color.muted).buttonStyle(.plain) }
                    Spacer()
                    Menu {
                        if comment.author.id == app.me?.id || app.me?.isModerator == true {
                            Button("Löschen", systemImage: "trash", role: .destructive) {
                                Task { if await app.run("Kommentar entfernt.", { _ = try await APIClient.shared.delete("/comments/\(comment.id)") as JSONValue }) { onDeleted() } }
                            }
                        }
                        Button("Melden …", systemImage: "flag") { router.present(.report(targetType: "COMMENT", targetId: comment.id)) }
                    } label: { Image(systemName: "ellipsis").font(.caption).foregroundStyle(Color.muted).frame(width: 28, height: 24) }
                }
            }
        }
    }
}
