import SwiftUI

// MARK: - Artikel lesen (PRD §14.2)

struct ArticleReaderView: View {
    var handle: String
    var slug: String

    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router

    @State private var target: (handle: String, slug: String)?
    @State private var data: BlogReadPayload?
    @State private var error: String?
    @State private var showTOC = false

    private var h: String { target?.handle ?? handle }
    private var s: String { target?.slug ?? slug }

    var body: some View {
        Group {
            if let data, let article = data.article {
                reader(data, article)
            } else if let error {
                ErrorStateView(message: error) { await load() }
            } else {
                LoadingView()
            }
        }
        .background(Color.paper)
        .navigationTitle("Artikel")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { toolbar }
        .task { if data == nil { await load() } }
        .reloadWhenSheetCloses { await load() }
    }

    private func load() async {
        do {
            let d: BlogReadPayload = try await APIClient.shared.get("/blog/read/\(h)/\(s)")
            if let r = d.redirect {
                if case .article(let nh, let ns)? = Route.from(href: r), nh != h || ns != s {
                    target = (nh, ns)
                    await load()
                } else {
                    router.open(href: r)
                }
                return
            }
            withAnimation(.snappy) { data = d; error = nil }
            if let id = d.article?.id, d.isAuthor != true { SocialAPI.track("ARTICLE", id) }
        } catch is CancellationError {
        } catch {
            if data == nil { self.error = (error as? APIError)?.message ?? error.localizedDescription } else { app.show(error: error) }
        }
    }

    // MARK: Toolbar

    @ToolbarContentBuilder private var toolbar: some ToolbarContent {
        if let d = data, let a = d.article {
            if d.isAuthor == true {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { router.present(.articleEditor(id: a.id)) } label: { Label("Bearbeiten", systemImage: "pencil") }
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    ShareLink(item: AppConfig.webURL("/u/\(h)/blog/\(a.slug)")) { Label("Teilen", systemImage: "square.and.arrow.up") }
                    Button("In Sammlung speichern …", systemImage: "folder.badge.plus") { router.present(.collectionPicker(type: "ARTICLE", id: a.id)) }
                    if let au = d.author {
                        Button("Mehr von \(au.displayName)", systemImage: "text.book.closed") { router.open(.userBlog(handle: au.handle)) }
                    }
                    if d.isAuthor != true {
                        Divider()
                        SafetyMenuItems(targetType: "ARTICLE", targetId: a.id, authorId: d.author?.userId, authorName: d.author?.displayName, allowHide: true)
                    }
                } label: { Image(systemName: "ellipsis") }
                .accessibilityLabel("Weitere Aktionen")
            }
        }
    }

    // MARK: Leser

    private func headings(_ a: BlogArticleFull) -> [BlogBlock] {
        a.blocks.filter { $0.type == "heading" && $0.level != 3 && !($0.text ?? "").isEmpty }
    }

    private func reader(_ d: BlogReadPayload, _ a: BlogArticleFull) -> some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    CoverView(url: a.coverUrl, seed: a.id, category: nil, animated: true)
                        .frame(height: 280)
                        .frame(maxWidth: .infinity)
                        .clipped()
                        .id("top")
                    VStack(alignment: .leading, spacing: 22) {
                        if d.isLive == false {
                            NoticeView(tone: .warn, title: "Vorschau", message: a.state == "SCHEDULED" ? "Geplant für \(Fmt.dateTime(a.publishedAt)). Nur du siehst diesen Artikel." : "Noch nicht veröffentlicht – nur du siehst diesen Artikel.")
                        }
                        titleBlock(d, a)
                        let hs = headings(a)
                        if hs.count >= 2 { toc(hs, proxy: proxy) }
                        BlogBlocksView(blocks: a.blocks, linkedProjects: d.linkedProjects ?? [], plainText: a.plainText)
                        if let tags = a.tags, !tags.isEmpty { TagList(tags: tags) }
                        endMark
                        actions(d, a)
                        if let au = d.author { authorBox(d, au) }
                        if let lp = d.linkedProjects, !lp.isEmpty {
                            VStack(alignment: .leading, spacing: 12) {
                                SectionHeader("Verknüpfte Projekte", subtitle: "Der Faden zum Werkstück")
                                ForEach(lp) { p in
                                    LinkedThreadRow(kicker: "Projekt · \(L.projectStatus(p.status))", title: p.title, seed: p.id, category: p.category, url: p.coverUrl) {
                                        router.open(href: p.href)
                                    }
                                    .padding(12)
                                    .cardSurface(radius: Radius.inner)
                                }
                            }
                        }
                        if let rel = d.related, !rel.isEmpty {
                            VStack(alignment: .leading, spacing: 4) {
                                SectionHeader("Weiterlesen")
                                ForEach(rel) { BlogMagazineRow(article: $0) }
                            }
                        }
                        CommentsSection(type: "ARTICLE", id: a.id, allowComments: a.commentsEnabled ?? true)
                        if a.commentsEnabled == false {
                            Text("Die Kommentare sind für diesen Artikel geschlossen.").font(.wr(.footnote)).foregroundStyle(Color.muted)
                        }
                    }
                    .padding(.horizontal, Space.gutter)
                    .padding(.top, 22)
                    .padding(.bottom, 100)
                    .frame(maxWidth: 680)
                    .frame(maxWidth: .infinity)
                }
            }
            .refreshable { await load() }
            .safeAreaInset(edge: .bottom) { floatingBar(d, a, proxy: proxy) }
        }
    }

    private func titleBlock(_ d: BlogReadPayload, _ a: BlogArticleFull) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SpecLabel([a.category?.name, a.readingMinutes.map { "\($0) Min. Lesezeit" }].compactMap { $0 }.joined(separator: " · "), color: .clay)
            Text(a.title)
                .font(.display(34))
                .foregroundStyle(Color.ink)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            if let dek = a.dek?.nilIfEmpty {
                Text(dek)
                    .font(.wr(size: 20, weight: .regular).italic())
                    .foregroundStyle(Color.ink2)
                    .lineSpacing(3)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let au = d.author {
                HStack(spacing: 10) {
                    Button { router.open(.profile(handle: au.handle)) } label: {
                        HStack(spacing: 10) {
                            AvatarView(url: au.avatarUrl, name: au.displayName, size: 36)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(au.displayName).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink)
                                Text(a.publishedAt.map { Fmt.date($0, style: .long) } ?? "Entwurf").font(.wr(.caption)).foregroundStyle(Color.muted)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    Spacer()
                    if d.isAuthor != true { FollowButton(userId: au.userId, following: d.viewer?.following ?? false, compact: true) }
                }
                .padding(.vertical, 10)
                .overlay(alignment: .top) { Rectangle().fill(Color.line).frame(height: 0.75) }
                .hairline()
            }
        }
    }

    private func toc(_ hs: [BlogBlock], proxy: ScrollViewProxy) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Button { withAnimation(.snappy) { showTOC.toggle() } } label: {
                HStack {
                    Image(systemName: "list.bullet.indent").foregroundStyle(Color.moss)
                    Text("Inhalt").font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink)
                    Text("\(hs.count) Abschnitte").font(.wr(.caption)).foregroundStyle(Color.muted)
                    Spacer()
                    Image(systemName: "chevron.down").font(.wr(.caption, .semibold)).foregroundStyle(Color.muted)
                        .rotationEffect(.degrees(showTOC ? 180 : 0))
                }
                .frame(minHeight: 44)
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(showTOC ? .isSelected : [])
            if showTOC {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(hs.enumerated()), id: \.element.id) { i, b in
                        Button { withAnimation(.snappy) { proxy.scrollTo(b.id, anchor: .top) } } label: {
                            HStack(alignment: .firstTextBaseline, spacing: 10) {
                                Text(String(format: "%02d", i + 1)).font(.specLarge).foregroundStyle(Color.moss)
                                Text(b.text ?? "").font(.wr(.subheadline)).foregroundStyle(Color.ink).multilineTextAlignment(.leading)
                                Spacer(minLength: 0)
                            }
                            .padding(.vertical, 9)
                            .contentShape(.rect)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 4)
        .sunkenSurface()
    }

    private var endMark: some View {
        HStack(spacing: 8) {
            Rectangle().fill(Color.line).frame(height: 0.75)
            Image(systemName: "scribble.variable").foregroundStyle(Color.moss)
            Rectangle().fill(Color.line).frame(height: 0.75)
        }
        .padding(.vertical, 6)
        .accessibilityHidden(true)
    }

    private func actions(_ d: BlogReadPayload, _ a: BlogArticleFull) -> some View {
        HStack(spacing: 18) {
            Label(Fmt.number(a.likeCount), systemImage: "heart").labelStyle(.compact)
                .accessibilityLabel("\(a.likeCount ?? 0) Gefällt-mir")
            Label(Fmt.number(d.commentCount), systemImage: "bubble.left").labelStyle(.compact)
                .accessibilityLabel("\(d.commentCount ?? 0) Kommentare")
            if let v = a.viewCount, v > 0 {
                Label(Fmt.number(v), systemImage: "eye").labelStyle(.compact)
                    .accessibilityLabel("\(v) Aufrufe")
            }
            Spacer()
            if let u = a.updatedAt, let p = a.publishedAt, u.timeIntervalSince(p) > 86400 {
                Text("Aktualisiert \(Fmt.date(u))")
            }
        }
        .font(.wr(.footnote))
        .foregroundStyle(Color.muted)
    }

    private func authorBox(_ d: BlogReadPayload, _ au: BlogAuthor) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SpecLabel("Über die Autorin, den Autor")
            HStack(spacing: 12) {
                AvatarView(url: au.avatarUrl, name: au.displayName, size: 52)
                VStack(alignment: .leading, spacing: 2) {
                    Text(au.displayName).font(.titleSerif).foregroundStyle(Color.ink)
                    Text("@\(au.handle) · \(Fmt.plural(au.followerCount ?? 0, "Follower", "Follower"))").font(.wr(.caption)).foregroundStyle(Color.muted)
                }
                Spacer(minLength: 0)
            }
            if let b = au.bio?.nilIfEmpty { Text(b).font(.wr(.subheadline)).foregroundStyle(Color.ink2).fixedSize(horizontal: false, vertical: true) }
            HStack(spacing: 10) {
                if d.isAuthor != true { FollowButton(userId: au.userId, following: d.viewer?.following ?? false) }
                Button("Alle Artikel") { router.open(.userBlog(handle: au.handle)) }.buttonStyle(.glass)
                Button("Profil") { router.open(.profile(handle: au.handle)) }.buttonStyle(.glass)
            }
        }
        .padding(16)
        .cardSurface()
    }

    private func floatingBar(_ d: BlogReadPayload, _ a: BlogArticleFull, proxy: ScrollViewProxy) -> some View {
        GlassEffectContainer(spacing: 8) {
            HStack(spacing: 16) {
                LikeButton(type: "ARTICLE", id: a.id, liked: d.viewer?.liked ?? false, count: a.likeCount ?? 0)
                SaveButton(type: "ARTICLE", id: a.id, saved: d.viewer?.saved ?? false)
                ShareLink(item: AppConfig.webURL("/u/\(h)/blog/\(a.slug)")) {
                    Image(systemName: "square.and.arrow.up").font(.wr(.subheadline)).foregroundStyle(Color.ink2).frame(minWidth: 32, minHeight: 32)
                }
                .accessibilityLabel("Teilen")
                Button { withAnimation(.snappy) { proxy.scrollTo("top", anchor: .top) } } label: {
                    Image(systemName: "arrow.up").font(.wr(.subheadline)).foregroundStyle(Color.ink2).frame(minWidth: 32, minHeight: 32)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Zum Anfang")
            }
            .padding(.horizontal, 18).padding(.vertical, 8)
            .glassEffect(.regular.interactive(), in: Capsule())
        }
        .padding(.bottom, 8)
    }
}
