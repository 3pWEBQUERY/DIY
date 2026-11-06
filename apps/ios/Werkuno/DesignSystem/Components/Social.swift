import SwiftUI

// MARK: - Soziale Aktionen (API)

enum SocialAPI {
    struct LikeResult: Decodable { var liked: Bool?; var count: Int?; var likeCount: Int? }
    struct SaveResult: Decodable { var saved: Bool?; var count: Int?; var saveCount: Int? }
    struct FollowResult: Decodable { var following: Bool?; var followerCount: Int? }

    static func like(_ type: String, _ id: String, _ liked: Bool) async throws {
        _ = try await APIClient.shared.post("/likes", ["type": JSONValue.string(type), "id": .string(id), "liked": .bool(liked)]) as JSONValue
    }
    static func save(_ type: String, _ id: String, _ saved: Bool, collectionId: String? = nil) async throws {
        _ = try await APIClient.shared.post("/bookmarks", ["type": JSONValue.string(type), "id": .string(id), "saved": .bool(saved), "collectionId": .from(collectionId)]) as JSONValue
    }
    static func follow(_ userId: String, _ follow: Bool) async throws {
        _ = try await APIClient.shared.post("/users/\(userId)/follow", ["follow": JSONValue.bool(follow)]) as JSONValue
    }
    static func block(_ userId: String, _ block: Bool) async throws {
        _ = try await APIClient.shared.post("/users/\(userId)/block", ["block": JSONValue.bool(block)]) as JSONValue
    }
    static func mute(_ userId: String, _ mute: Bool) async throws {
        _ = try await APIClient.shared.post("/users/\(userId)/mute", ["mute": JSONValue.bool(mute)]) as JSONValue
    }
    static func hide(_ type: String, _ id: String) async throws {
        _ = try await APIClient.shared.post("/hide", ["type": JSONValue.string(type), "id": .string(id)]) as JSONValue
    }
    static func track(_ type: String, _ id: String) {
        Task.detached { _ = try? await APIClient.shared.post("/track", ["targetType": JSONValue.string(type), "targetId": .string(id), "ref": "ios"]) as JSONValue }
    }
}

// MARK: - Like / Speichern / Folgen

struct LikeButton: View {
    var type: String
    var id: String
    @State var liked: Bool
    @State var count: Int
    var showCount = true
    @Environment(AppState.self) private var app

    var body: some View {
        Button {
            let next = !liked
            Haptics.tap()
            withAnimation(.spring(duration: 0.3, bounce: 0.5)) { liked = next; count += next ? 1 : -1 }
            Task {
                do { try await SocialAPI.like(type, id, next) } catch {
                    withAnimation { liked = !next; count += next ? -1 : 1 }
                    app.show(error: error)
                }
            }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: liked ? "heart.fill" : "heart")
                    .foregroundStyle(liked ? Color.clay : Color.ink2)
                    .symbolEffect(.bounce, value: liked)
                if showCount { Text(Fmt.number(count)).monospacedDigit().contentTransition(.numericText()).foregroundStyle(Color.ink2) }
            }
            .font(.wr(.subheadline))
            .frame(minHeight: 32)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(liked ? "Gefällt mir nicht mehr" : "Gefällt mir")
        .accessibilityValue("\(count)")
    }
}

struct SaveButton: View {
    var type: String
    var id: String
    @State var saved: Bool
    var label = false
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router

    var body: some View {
        Button {
            let next = !saved
            Haptics.tap()
            withAnimation(.snappy) { saved = next }
            Task {
                do { try await SocialAPI.save(type, id, next); if next { app.show("Gespeichert") } } catch {
                    withAnimation { saved = !next }
                    app.show(error: error)
                }
            }
        } label: {
            if label {
                Label(saved ? "Gespeichert" : "Speichern", systemImage: saved ? "bookmark.fill" : "bookmark")
            } else {
                Image(systemName: saved ? "bookmark.fill" : "bookmark")
                    .font(.wr(.subheadline))
                    .foregroundStyle(saved ? Color.moss : Color.ink2)
                    .frame(minWidth: 32, minHeight: 32)
                    .contentShape(.rect)
            }
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button("In Sammlung speichern …", systemImage: "folder.badge.plus") { router.present(.collectionPicker(type: type, id: id)) }
        }
        .accessibilityLabel(saved ? "Nicht mehr speichern" : "Speichern")
    }
}

struct FollowButton: View {
    var userId: String
    @State var following: Bool
    var compact = false
    @Environment(AppState.self) private var app

    var body: some View {
        if app.me?.id == userId { EmptyView() } else {
            Button {
                let next = !following
                Haptics.tap()
                withAnimation(.snappy) { following = next }
                Task {
                    do { try await SocialAPI.follow(userId, next) } catch {
                        withAnimation { following = !next }
                        app.show(error: error)
                    }
                }
            } label: {
                Text(following ? "Folge ich" : "Folgen")
                    .font(compact ? Font.wr(.footnote, .semibold) : .wr(.subheadline, .semibold))
                    // Gefüllt mit Tinte → Schrift in Papierfarbe (hell auf dunkel bzw. dunkel auf hell im Dark Mode)
                    .foregroundStyle(following ? Color.ink : Color.paper)
                    .padding(.horizontal, compact ? 4 : 8)
            }
            .buttonStyle(following ? AnyPrimitiveButtonStyle(.glass) : AnyPrimitiveButtonStyle(.glassProminent))
            .tint(following ? nil : .ink)
            .controlSize(compact ? .small : .regular)
            .accessibilityLabel(following ? "Entfolgen" : "Folgen")
        }
    }
}

/// Typ-Löschung für Button-Styles
struct AnyPrimitiveButtonStyle: PrimitiveButtonStyle {
    private let make: (Configuration) -> AnyView
    init<S: PrimitiveButtonStyle>(_ s: S) { make = { AnyView(s.makeBody(configuration: $0)) } }
    func makeBody(configuration: Configuration) -> some View { make(configuration) }
}

// MARK: - Sicherheitsmenü (Melden, Blockieren, Stummschalten, Ausblenden)

struct SafetyMenuItems: View {
    var targetType: String
    var targetId: String
    var authorId: String?
    var authorName: String?
    var allowHide = true
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router

    var body: some View {
        if let link = shareURL { ShareLink(item: link) { Label("Teilen", systemImage: "square.and.arrow.up") } }
        if allowHide {
            Button("Weniger davon zeigen", systemImage: "eye.slash") {
                Task { await app.run("Ausgeblendet. Wir zeigen dir weniger davon.") { try await SocialAPI.hide(targetType, targetId) } }
            }
        }
        Button("Melden …", systemImage: "flag") { router.present(.report(targetType: targetType, targetId: targetId)) }
        if let authorId, authorId != app.me?.id {
            Divider()
            Button("\(authorName ?? "Profil") stummschalten", systemImage: "speaker.slash") {
                Task { await app.run("Stummgeschaltet – Inhalte erscheinen nicht mehr im Feed.") { try await SocialAPI.mute(authorId, true) } }
            }
            Button("\(authorName ?? "Profil") blockieren", systemImage: "hand.raised", role: .destructive) {
                Task { await app.run("Profil blockiert.") { try await SocialAPI.block(authorId, true) } }
            }
        }
    }

    var shareURL: URL? = nil
}

// MARK: - Melden (§24.1)

struct ReportSheet: View {
    var targetType: String
    var targetId: String
    var title: String?
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var app
    @State private var reason = "SPAM"
    @State private var details = ""
    @State private var caseNumber: String?

    var body: some View {
        NavigationStack {
            Form {
                if let caseNumber {
                    Section {
                        VStack(alignment: .leading, spacing: 8) {
                            Image(systemName: "checkmark.seal.fill").font(.wr(.largeTitle)).foregroundStyle(Color.moss)
                            Text("Danke für deine Meldung").font(.titleSerif)
                            Text("Fallnummer \(caseNumber). Unser Moderationsteam prüft den Inhalt nach den Community-Richtlinien.").font(.wr(.subheadline)).foregroundStyle(Color.muted)
                        }.padding(.vertical, 8)
                    }
                } else {
                    Section("Grund") {
                        Picker("Grund", selection: $reason) {
                            ForEach(L.reportReasons, id: \.key) { Text($0.label).tag($0.key) }
                        }
                        .pickerStyle(.inline)
                        .labelsHidden()
                    }
                    Section {
                        TextField("Was ist passiert? (optional)", text: $details, axis: .vertical).lineLimit(3...8)
                    } header: { Text("Details") } footer: { Text("Meldungen sind vertraulich. Die gemeldete Person erfährt nicht, wer gemeldet hat.") }
                }
            }
            .navigationTitle(title ?? "Melden")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(caseNumber == nil ? "Abbrechen" : "Fertig") { dismiss() } }
                if caseNumber == nil {
                    ToolbarItem(placement: .confirmationAction) {
                        AsyncButton("Senden") {
                            do {
                                let r: JSONValue = try await APIClient.shared.post("/reports", ["targetType": JSONValue.string(targetType), "targetId": .string(targetId), "reason": .string(reason), "details": .string(details)])
                                withAnimation { caseNumber = r["caseNumber"]?.string ?? r["number"]?.string ?? r["caseId"]?.string ?? "erfasst" }
                                Haptics.success()
                            } catch { app.show(error: error) }
                        }
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

// MARK: - Beitragskarte (§9)

struct PostCardView: View {
    var post: PostItem
    var onDelete: (() -> Void)? = nil
    var showCommunity = true
    @Environment(Router.self) private var router
    @Environment(AppState.self) private var app
    @State private var confirmDelete = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            if let label = kindLabel {
                Label(label.0, systemImage: label.1).font(.wr(.caption, .semibold)).foregroundStyle(Color.moss)
            }
            if !post.body.isEmpty {
                Text(post.body).font(.wr(.body)).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
                    .textSelection(.enabled)
            }
            if !post.media.isEmpty { MediaStrip(media: post.media) }
            if let r = post.repostOf { repost(r) }
            linked
            footer
        }
        .padding(16)
        .cardSurface()
        .contentShape(.rect)
        .onTapGesture { router.open(.post(id: post.id)) }
        .confirmationDialog("Beitrag löschen?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Löschen", role: .destructive) {
                Task { if await app.run("Beitrag gelöscht.", { _ = try await APIClient.shared.delete("/posts/\(post.id)") as JSONValue }) { onDelete?() } }
            }
        }
    }

    private var header: some View {
        HStack(spacing: 10) {
            Button { router.open(.profile(handle: post.author.handle)) } label: {
                HStack(spacing: 10) {
                    AvatarView(url: post.author.avatarUrl, name: post.author.displayName, size: 38, category: post.category)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(post.author.displayName).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink)
                        HStack(spacing: 4) {
                            Text("@\(post.author.handle)")
                            Text("·")
                            Text(Fmt.relative(post.publishedAt))
                            if post.editedAt != nil { Text("· bearbeitet") }
                        }
                        .font(.wr(.caption)).foregroundStyle(Color.muted).lineLimit(1)
                    }
                }
            }
            .buttonStyle(.plain)
            Spacer(minLength: 0)
            if post.isCommercial == true { Pill(text: "Verkauf", symbol: "tag", tint: .clay) }
            if post.isAnnouncement == true { Pill(text: "Ankündigung", symbol: "megaphone", tint: .moss) }
            if post.isPinned == true { Image(systemName: "pin.fill").font(.wr(.caption)).foregroundStyle(Color.muted) }
            Menu {
                if post.viewer?.isAuthor == true {
                    Button("Bearbeiten", systemImage: "pencil") { router.present(.editPost(id: post.id)) }
                    Button("Löschen", systemImage: "trash", role: .destructive) { confirmDelete = true }
                    Divider()
                }
                SafetyMenuItems(targetType: "POST", targetId: post.id, authorId: post.author.id, authorName: post.author.displayName, allowHide: post.viewer?.isAuthor != true, shareURL: AppConfig.webURL("/beitrag/\(post.id)"))
            } label: {
                Image(systemName: "ellipsis").font(.wr(.subheadline)).foregroundStyle(Color.muted).frame(width: 32, height: 32).contentShape(.rect)
            }
            .accessibilityLabel("Weitere Aktionen")
        }
    }

    private var kindLabel: (String, String)? {
        switch post.kind {
        case "PROJECT_UPDATE": ("Projektfortschritt", "point.3.connected.trianglepath.dotted")
        case "PROJECT_SHOWCASE": ("Projektvorstellung", "sparkles")
        case "TUTORIAL_RELEASE": ("Neue Anleitung", "list.number")
        case "ARTICLE_PREVIEW": ("Neuer Artikel", "text.book.closed")
        case "COMMUNITY": showCommunity ? (post.community.map { "in \($0.name)" } ?? "Community", "person.3") : nil
        default: nil
        }
    }

    private func repost(_ r: PostItem.RepostRef) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            if let a = r.author {
                HStack(spacing: 6) {
                    Image(systemName: "arrow.2.squarepath").font(.wr(.caption2))
                    Text(a.displayName).font(.wr(.caption, .semibold))
                    Text(Fmt.relative(r.publishedAt)).font(.wr(.caption))
                }.foregroundStyle(Color.muted)
            }
            if let b = r.body?.nilIfEmpty { Text(b).font(.wr(.subheadline)).foregroundStyle(Color.ink2).lineLimit(5) }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .sunkenSurface()
        .onTapGesture { router.open(.post(id: r.id)) }
    }

    @ViewBuilder private var linked: some View {
        if let p = post.project, let h = p.handle {
            LinkedThreadRow(kicker: "Projekt · \(L.projectStatus(p.status))", title: p.title, seed: p.id, category: p.category, url: p.coverUrl) { router.open(.project(handle: h, slug: p.slug)) }
        }
        if let t = post.tutorial {
            LinkedThreadRow(kicker: "Anleitung · \(Fmt.minutes(t.minutes))", title: t.title, seed: t.id, category: t.category, url: t.coverUrl) { router.open(.tutorial(slug: t.slug)) }
        }
        if let pr = post.product, let shop = pr.shopSlug ?? pr.shop?.slug, let slug = pr.slug {
            LinkedThreadRow(kicker: "Produkt · \(Fmt.money(pr.priceMinor, currency: pr.currency))", title: pr.title, seed: pr.id, category: nil, url: pr.coverUrl) { router.open(.product(shopSlug: shop, productSlug: slug)) }
        }
        if let a = post.article {
            LinkedThreadRow(kicker: "Artikel", title: a.title, seed: a.id, category: nil, url: a.coverUrl) { router.open(href: a.href) }
        }
    }

    private var footer: some View {
        HStack(spacing: 18) {
            LikeButton(type: "POST", id: post.id, liked: post.viewer?.liked ?? false, count: post.counts.likes ?? 0)
            Button { router.open(.post(id: post.id)) } label: {
                Label(Fmt.number(post.counts.comments), systemImage: "bubble.left").font(.wr(.subheadline)).foregroundStyle(Color.ink2).labelStyle(.compact)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(post.counts.comments ?? 0) Kommentare")
            RepostButton(post: post)
            Spacer()
            SaveButton(type: "POST", id: post.id, saved: post.viewer?.saved ?? false)
        }
    }
}

/// Verknüpfter Inhalt – mit der Faden-Linie links (Projektfaden)
struct LinkedThreadRow: View {
    var kicker: String
    var title: String
    var seed: String
    var category: String?
    var url: String?
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                CoverView(url: url, seed: seed, category: category, showLabel: false)
                    .frame(width: 46, height: 46)
                    .clipShape(.rect(cornerRadius: Radius.small, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    SpecLabel(kicker, color: .moss)
                    Text(title).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink).lineLimit(2).multilineTextAlignment(.leading)
                }
                Spacer(minLength: 0)
                Image(systemName: "arrow.up.right").font(.wr(.caption)).foregroundStyle(Color.muted)
            }
            .padding(.leading, 12)
            .overlay(alignment: .leading) { Capsule().fill(Color.moss).frame(width: 2) }
        }
        .buttonStyle(.pressable)
    }
}

struct RepostButton: View {
    var post: PostItem
    @Environment(AppState.self) private var app
    @State private var showing = false
    @State private var text = ""

    var body: some View {
        Button { showing = true } label: {
            Label(Fmt.number(post.counts.reposts), systemImage: "arrow.2.squarepath").font(.wr(.subheadline)).foregroundStyle(Color.ink2).labelStyle(.compact)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Teilen mit Einordnung")
        .alert("Mit Einordnung teilen", isPresented: $showing) {
            TextField("Deine Einordnung (optional)", text: $text)
            Button("Abbrechen", role: .cancel) {}
            Button("Teilen") {
                Task { await app.run("Geteilt.") { _ = try await APIClient.shared.post("/posts/\(post.id)/repost", ["body": JSONValue.string(text)]) as JSONValue } ; text = "" }
            }
        } message: { Text("Der Beitrag erscheint mit deinem Kommentar auf deinem Profil und im Feed deiner Follower.") }
    }
}

/// Horizontale Medienleiste mit Vollbild
struct MediaStrip: View {
    var media: [MediaItem]
    @State private var selected: MediaItem?

    var body: some View {
        Group {
            if media.count == 1, let m = media.first {
                tile(m).aspectRatio(m.aspect ?? 4 / 3, contentMode: .fit).frame(maxHeight: 420)
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(media) { m in tile(m).frame(width: 220, height: 260) }
                    }
                }
                .scrollClipDisabled()
            }
        }
        .fullScreenCover(item: $selected) { m in MediaViewer(media: media, start: m) }
    }

    private func tile(_ m: MediaItem) -> some View {
        RemoteImage(path: m.displayURL) { Color.sunken }
            .clipShape(.rect(cornerRadius: Radius.inner, style: .continuous))
            .overlay { if m.isVideo { Image(systemName: "play.circle.fill").font(.wr(.largeTitle)).foregroundStyle(.white.opacity(0.9)) } }
            .contentShape(.rect)
            .onTapGesture { selected = m }
            .accessibilityLabel(m.alt?.nilIfEmpty ?? "Bild")
            .accessibilityAddTraits(.isImage)
    }
}

struct MediaViewer: View {
    var media: [MediaItem]
    var start: MediaItem
    @Environment(\.dismiss) private var dismiss
    @State private var current: String = ""

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Color.black.ignoresSafeArea()
            TabView(selection: $current) {
                ForEach(media) { m in
                    VStack {
                        Spacer()
                        RemoteImage(path: m.displayURL, contentMode: .fit) { ProgressView().tint(.white) }
                        Spacer()
                        if let alt = m.alt?.nilIfEmpty { Text(alt).font(.wr(.footnote)).foregroundStyle(.white.opacity(0.8)).padding() }
                    }
                    .tag(m.id)
                }
            }
            .tabViewStyle(.page)
            Button { dismiss() } label: { Image(systemName: "xmark").font(.wr(.headline)).padding(12) }
                .buttonStyle(.glass)
                .padding()
                .accessibilityLabel("Schliessen")
        }
        .onAppear { current = start.id }
    }
}
