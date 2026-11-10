import SwiftUI

/// Einzelner Beitrag mit voller Karte, Datenblatt, Kommentaren und schwebender Aktionsleiste.
struct PostDetailView: View {
    var id: String

    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @Environment(\.dismiss) private var dismiss

    @State private var post: PostItem?
    @State private var error: APIError?
    @State private var tracked = false
    @State private var confirmDelete = false
    /// Offene Koautor:innen-Einladung der angemeldeten Person zu diesem Beitrag
    @State private var invite: SocialCoauthorInvite?

    var body: some View {
        Group {
            if let post {
                content(post)
            } else if let error {
                if error.status == 404 || error.code == "NOT_FOUND" {
                    EmptyStateView(symbol: "text.page.slash", title: "Beitrag nicht gefunden", message: "Er wurde gelöscht oder ist nicht mehr sichtbar.", actionTitle: "Zurück") { dismiss() }
                        .frame(maxHeight: .infinity)
                } else {
                    ErrorStateView(message: error.message) { await load() }
                }
            } else {
                LoadingView()
            }
        }
        .background(Color.paper)
        .navigationTitle("Beitrag")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { if let post { ToolbarItem(placement: .topBarTrailing) { menu(post) } } }
        .task(id: id) { await load() }
        .refreshable { await load() }
        .onReceive(NotificationCenter.default.publisher(for: .socialPostsChanged)) { note in
            guard note.userInfo?["deleted"] == nil else { return }
            if (note.object as? String) == id || (note.object as? PostItem)?.id == id { Task { await load() } }
        }
        .confirmationDialog("Beitrag löschen?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Löschen", role: .destructive) { Task { await delete() } }
        } message: { Text("Der Beitrag verschwindet aus Feed und Profil. Das kann nicht rückgängig gemacht werden.") }
    }

    // MARK: Inhalt

    private func content(_ post: PostItem) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.xl) {
                if post.viewer?.isAuthor == true, let d = post.draft {
                    SocialDraftBanner(postId: post.id, scheduledAt: d.scheduledAt)
                        .padding(.horizontal, Space.gutter)
                }
                if let invite {
                    SocialCoauthorInviteCard(invite: invite) { _ in withAnimation(.snappy) { self.invite = nil } }
                        .padding(.horizontal, Space.gutter)
                        .transition(.opacity.combined(with: .move(edge: .top)))
                }
                article(post)
                    .padding(.horizontal, Space.gutter)
                datasheet(post)
                    .padding(.horizontal, Space.gutter)
                CommentsSection(type: "POST", id: post.id)
                    .padding(.horizontal, Space.gutter)
                    .id("comments")
            }
            .padding(.top, Space.s)
            .padding(.bottom, 24)
        }
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom) { actionBar(post) }
    }

    private func article(_ post: PostItem) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Button { router.open(.profile(handle: post.author.handle)) } label: {
                HStack(spacing: 12) {
                    AvatarView(url: post.author.avatarUrl, name: post.author.displayName, size: 46, category: post.category)
                        .overlay(alignment: .bottomTrailing) { SocialCoauthorBadge(coauthors: post.coauthors ?? [], size: 22) }
                    VStack(alignment: .leading, spacing: 2) {
                        SocialAuthors.names(post, font: .wr(.headline))
                        Text("@\(post.author.handle)").font(.wr(.footnote)).foregroundStyle(Color.muted)
                    }
                    Spacer(minLength: 0)
                    if post.isPinned == true { Image(systemName: "pin.fill").font(.wr(.caption)).foregroundStyle(Color.muted).accessibilityLabel("Angeheftet") }
                }
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(SocialAuthors.accessibility(post))
            .accessibilityHint("Profil öffnen")

            SocialCoauthorRow(coauthors: post.coauthors ?? [])

            if let k = kindLabel(post) {
                HStack(spacing: 8) {
                    Capsule().fill(Color.moss).frame(width: 18, height: 2)
                    SpecLabel(k, color: .moss)
                }
            }

            HStack(spacing: 6) {
                if post.isCommercial == true { Pill(text: "Verkauf", symbol: "tag", tint: .clay) }
                if post.isAnnouncement == true { Pill(text: "Ankündigung", symbol: "megaphone", tint: .moss) }
            }

            if !post.body.isEmpty {
                Text(post.body)
                    .font(.wr(.title3))
                    .lineSpacing(3)
                    .foregroundStyle(Color.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .textSelection(.enabled)
            }

            if let poll = post.poll {
                SocialPollView(postId: post.id, poll: poll)
                    .id("\(poll.id)-\(poll.voters)-\(poll.myVotes.count)")
            }

            if !post.media.isEmpty { MediaStrip(media: post.media) }

            if let r = post.repostOf { repost(r) }

            linked(post)

            HStack(spacing: 6) {
                Text(Fmt.dateTime(post.publishedAt))
                if post.editedAt != nil { Text("· bearbeitet") }
            }
            .font(.wr(.caption))
            .foregroundStyle(Color.muted)
        }
        .padding(18)
        .cardSurface()
    }

    private func repost(_ r: PostItem.RepostRef) -> some View {
        Button { router.open(.post(id: r.id)) } label: {
            VStack(alignment: .leading, spacing: 8) {
                if let a = r.author {
                    HStack(spacing: 8) {
                        Image(systemName: "arrow.2.squarepath").font(.wr(.caption2))
                        AvatarView(url: a.avatarUrl, name: a.displayName, size: 20)
                        Text(a.displayName).font(.wr(.caption, .semibold))
                        Text(Fmt.relative(r.publishedAt)).font(.wr(.caption))
                    }
                    .foregroundStyle(Color.muted)
                }
                if let b = r.body?.nilIfEmpty {
                    Text(b).font(.wr(.subheadline)).foregroundStyle(Color.ink2).lineLimit(6).multilineTextAlignment(.leading)
                }
                if let m = r.media, !m.isEmpty {
                    SpecLabel(Fmt.plural(m.count, "Bild", "Bilder"))
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .sunkenSurface()
        }
        .buttonStyle(.pressable)
        .accessibilityHint("Ursprünglichen Beitrag öffnen")
    }

    @ViewBuilder private func linked(_ post: PostItem) -> some View {
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
        if let c = post.community {
            LinkedThreadRow(kicker: "Community", title: c.name, seed: c.id ?? c.slug, category: post.category, url: nil) { router.open(.community(slug: c.slug)) }
        }
    }

    private func datasheet(_ post: PostItem) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            SectionHeader("Datenblatt", number: "01")
                .padding(.bottom, 8)
            HStack(spacing: 0) {
                StatCell(value: Fmt.number(post.counts.likes), label: "Gefällt").frame(maxWidth: .infinity, alignment: .leading)
                StatCell(value: Fmt.number(post.counts.comments), label: "Kommentare").frame(maxWidth: .infinity, alignment: .leading)
                StatCell(value: Fmt.number(post.counts.saves), label: "Gemerkt").frame(maxWidth: .infinity, alignment: .leading)
                StatCell(value: Fmt.number(post.counts.reposts), label: "Geteilt").frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.vertical, 10)
            .hairline()
            if let c = post.category {
                SpecRow(label: "Kategorie", value: app.categoryName(c), symbol: CategoryPalette.symbol(for: app.category(c)?.glyph))
            }
            if let v = post.visibility {
                SpecRow(label: "Sichtbarkeit", value: L.visibility(v), symbol: v == "PUBLIC" ? "globe.europe.africa" : v == "FOLLOWERS" ? "person.2" : "lock")
            }
            SpecRow(label: "Veröffentlicht", value: Fmt.date(post.publishedAt, style: .long), symbol: "calendar")
            if let e = post.editedAt {
                SpecRow(label: "Bearbeitet", value: Fmt.relative(e), symbol: "pencil")
            }
        }
    }

    /// Schwebende Glas-Aktionsleiste
    private func actionBar(_ post: PostItem) -> some View {
        HStack(spacing: 22) {
            LikeButton(type: "POST", id: post.id, liked: post.viewer?.liked ?? false, count: post.counts.likes ?? 0)
                .id("like-\(post.id)-\(post.counts.likes ?? 0)")
            RepostButton(post: post)
            SaveButton(type: "POST", id: post.id, saved: post.viewer?.saved ?? false)
                .id("save-\(post.id)-\(post.viewer?.saved ?? false)")
            ShareLink(item: AppConfig.webURL("/beitrag/\(post.id)")) {
                Image(systemName: "square.and.arrow.up")
                    .font(.wr(.subheadline))
                    .foregroundStyle(Color.ink2)
                    .frame(minWidth: 32, minHeight: 32)
                    .contentShape(.rect)
            }
            .accessibilityLabel("Teilen")
        }
        .padding(.horizontal, 22)
        .padding(.vertical, 8)
        .glassEffect(.regular.interactive(), in: Capsule())
        .padding(.bottom, 8)
    }

    private func menu(_ post: PostItem) -> some View {
        Menu {
            if post.viewer?.isAuthor == true {
                Button("Bearbeiten", systemImage: "pencil") { router.present(.editPost(id: post.id)) }
                SocialPostMenuItems(post: post)
                Button("Löschen", systemImage: "trash", role: .destructive) { confirmDelete = true }
                Divider()
            } else if post.viewer?.isCoauthor == true {
                SocialPostMenuItems(post: post)
                Divider()
            }
            Button("Link kopieren", systemImage: "link") {
                UIPasteboard.general.url = AppConfig.webURL("/beitrag/\(post.id)")
                app.show("Link kopiert.", style: .info)
            }
            SafetyMenuItems(targetType: "POST", targetId: post.id, authorId: post.author.id, authorName: post.author.displayName, allowHide: post.viewer?.isAuthor != true, shareURL: nil)
        } label: {
            Image(systemName: "ellipsis")
        }
        .accessibilityLabel("Weitere Aktionen")
    }

    private func kindLabel(_ post: PostItem) -> String? {
        switch post.kind {
        case "PROJECT_UPDATE": "Projektfortschritt"
        case "PROJECT_SHOWCASE": "Projektvorstellung"
        case "TUTORIAL_RELEASE": "Neue Anleitung"
        case "ARTICLE_PREVIEW": "Neuer Artikel"
        case "REPOST": "Geteilt mit Einordnung"
        case "COMMUNITY": post.community.map { "In \($0.name)" } ?? "Community"
        default: nil
        }
    }

    // MARK: Aktionen

    private func load() async {
        do {
            let p: PostItem = try await APIClient.shared.get("/posts/\(id)")
            withAnimation(.snappy) { post = p; error = nil }
            if !tracked { tracked = true; SocialAPI.track("POST", id) }
            await loadInvite(p)
        } catch is CancellationError {
        } catch let e as APIError {
            if post == nil { error = e } else { app.show(error: e) }
        } catch {
            if post == nil { self.error = APIError(code: "UNKNOWN", message: error.localizedDescription, fields: nil, status: 0) }
        }
    }

    /// Eingeladene Personen sehen hier „Bestätigen / Ablehnen“ (Web: CoauthorInviteBanner).
    private func loadInvite(_ p: PostItem) async {
        guard app.me != nil, p.viewer?.isAuthor != true, p.viewer?.isCoauthor != true else { invite = nil; return }
        let all = (try? await APIClient.shared.get("/me/coauthor-invites") as [SocialCoauthorInvite]) ?? []
        withAnimation(.snappy) { invite = all.first { $0.postId == p.id } }
    }

    private func delete() async {
        let ok = await app.run("Beitrag gelöscht.") { _ = try await APIClient.shared.delete("/posts/\(id)") as JSONValue }
        if ok {
            NotificationCenter.default.post(name: .socialPostsChanged, object: id, userInfo: ["deleted": true])
            if post?.draft != nil { NotificationCenter.default.post(name: .socialDraftsChanged, object: id) }
            dismiss()
        }
    }
}
