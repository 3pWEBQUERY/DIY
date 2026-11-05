import SwiftUI

/// Tab „Werkbank“: redaktioneller Kopf, Composer-Einstieg, eigene Werkbank, Feeds mit eingewobenen Vorschlägen.
struct FeedView: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router

    @State private var kind: SocialFeedKind = .forYou
    @State private var posts: [PostItem] = []
    @State private var cursor: String?
    @State private var loaded = false
    @State private var error: String?
    @State private var context: SocialFeedContext = .empty
    @State private var contextLoaded = false

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0, pinnedViews: [.sectionHeaders]) {
                FeedHeader(firstName: firstName)
                    .padding(.horizontal, Space.gutter)
                    .padding(.top, 4)

                FeedComposerPrompt()
                    .padding(.horizontal, Space.gutter)
                    .padding(.top, Space.l)

                if contextLoaded {
                    FeedWorkbenchStrip(projects: context.workbench)
                        .padding(.top, Space.xl)
                }

                Section {
                    feedContent
                } header: {
                    ChipBar(items: SocialFeedKind.allCases.map { ($0, $0.label) }, selection: $kind)
                        .padding(.vertical, 6)
                        .accessibilityLabel("Feed auswählen")
                }
                .padding(.top, Space.xl)
            }
            .padding(.bottom, 40)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Color.paper)
        .navigationTitle("Werkbank")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(removing: .title)
        .toolbar { inboxToolbar }
        .task { await loadContext() }
        .task(id: kind) { await loadFeed(reset: true) }
        .refreshable {
            async let a: Void = loadFeed(reset: true)
            async let b: Void = loadContext()
            async let c: Void = app.refreshCounts()
            _ = await (a, b, c)
        }
        .onReceive(NotificationCenter.default.publisher(for: .socialPostsChanged)) { note in
            if let p = note.object as? PostItem, note.userInfo?["edited"] as? Bool == true {
                if let i = posts.firstIndex(where: { $0.id == p.id }) { withAnimation(.snappy) { posts[i] = p } }
            } else if let p = note.object as? PostItem, kind != .following {
                withAnimation(.snappy) { posts.removeAll { $0.id == p.id }; posts.insert(p, at: 0) }
            } else if let deletedId = note.object as? String, note.userInfo?["deleted"] as? Bool == true {
                remove(deletedId)
            } else {
                Task { await loadFeed(reset: true) }
            }
        }
    }

    private var firstName: String? {
        app.me?.profile?.displayName.split(separator: " ").first.map(String.init)
    }

    // MARK: Toolbar

    @ToolbarContentBuilder private var inboxToolbar: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Button { router.open(.notifications) } label: {
                Image(systemName: app.unreadNotifications > 0 ? "bell.badge" : "bell")
            }
            .badge(app.unreadNotifications)
            .accessibilityLabel(app.unreadNotifications > 0 ? "Benachrichtigungen, \(app.unreadNotifications) ungelesen" : "Benachrichtigungen")
        }
        ToolbarItem(placement: .topBarTrailing) {
            Button { router.open(.conversations) } label: {
                Image(systemName: "bubble.left.and.bubble.right")
            }
            .badge(app.unreadMessages)
            .accessibilityLabel(app.unreadMessages > 0 ? "Nachrichten, \(app.unreadMessages) ungelesen" : "Nachrichten")
        }
    }

    // MARK: Inhalt

    @ViewBuilder private var feedContent: some View {
        if context.isNew == true && kind != .new && loaded && !posts.isEmpty {
            FeedNewcomerBanner()
                .padding(.horizontal, Space.gutter)
                .padding(.top, Space.m)
        }
        if !loaded {
            LoadingView(text: "Fäden werden gesponnen …")
        } else if let error, posts.isEmpty {
            ErrorStateView(message: error) { await loadFeed(reset: true) }
        } else if posts.isEmpty {
            emptyState
        } else {
            ForEach(Array(posts.enumerated()), id: \.element.id) { idx, post in
                PostCardView(post: post, onDelete: { remove(post.id) })
                    .padding(.horizontal, Space.gutter)
                    .padding(.top, Space.m)
                    .transition(.asymmetric(insertion: .move(edge: .top).combined(with: .opacity), removal: .opacity))
                interlude(after: idx)
            }
            LoadMoreTrigger(hasMore: cursor != nil) { await loadFeed(reset: false) }
            if cursor == nil { trailingModules }
        }
    }

    /// Vorschläge, die zwischen die Beiträge gewoben werden.
    @ViewBuilder private func interlude(after idx: Int) -> some View {
        switch idx {
        case 2 where !context.creators.isEmpty:
            FeedCreatorCarousel(creators: context.creators).padding(.top, Space.xl).padding(.bottom, Space.s)
        case 6 where !context.trending.isEmpty:
            FeedTrendingCard(projects: context.trending).padding(.horizontal, Space.gutter).padding(.top, Space.xl).padding(.bottom, Space.s)
        case 11 where !context.communities.isEmpty:
            FeedCommunityShelf(communities: context.communities).padding(.top, Space.xl).padding(.bottom, Space.s)
        default:
            EmptyView()
        }
    }

    /// Bei kurzen Feeds: übrige Module am Ende zeigen.
    @ViewBuilder private var trailingModules: some View {
        if posts.count <= 2, !context.creators.isEmpty {
            FeedCreatorCarousel(creators: context.creators).padding(.top, Space.xl)
        }
        if posts.count <= 6, !context.trending.isEmpty {
            FeedTrendingCard(projects: context.trending).padding(.horizontal, Space.gutter).padding(.top, Space.xl)
        }
        if posts.count <= 11, !context.communities.isEmpty {
            FeedCommunityShelf(communities: context.communities).padding(.top, Space.xl)
        }
        FeedEndNote().padding(.horizontal, Space.gutter).padding(.top, Space.xl)
    }

    @ViewBuilder private var emptyState: some View {
        if kind == .following {
            VStack(spacing: 0) {
                EmptyStateView(
                    symbol: "person.2.wave.2",
                    title: "Noch ruhig hier",
                    message: "Sobald Menschen, denen du folgst, etwas teilen, erscheint es hier – chronologisch. Folge ein paar Creatorn, die dich inspirieren.",
                    actionTitle: "Creator entdecken"
                ) { router.tab = .discover }
                if !context.creators.isEmpty {
                    FeedCreatorCarousel(creators: context.creators)
                }
            }
        } else {
            EmptyStateView(
                symbol: "square.and.pencil",
                title: "Noch keine Beiträge",
                message: "Sei die erste Person, die heute etwas teilt.",
                actionTitle: "Beitrag schreiben"
            ) { router.present(.composer()) }
        }
    }

    // MARK: Laden

    private func loadContext() async {
        do {
            let c: SocialFeedContext = try await APIClient.shared.get("/feed/context")
            withAnimation(.snappy) { context = c; contextLoaded = true }
        } catch {
            contextLoaded = true
        }
    }

    private func loadFeed(reset: Bool) async {
        if !reset && cursor == nil { return }
        let requestedKind = kind
        do {
            let page: Page<PostItem> = try await APIClient.shared.get("/feed", query: ["kind": requestedKind.rawValue, "cursor": reset ? nil : cursor])
            guard requestedKind == kind else { return }
            withAnimation(.snappy) {
                if reset { posts = page.items } else {
                    let known = Set(posts.map(\.id))
                    posts += page.items.filter { !known.contains($0.id) }
                }
                cursor = page.nextCursor
                error = nil
                loaded = true
            }
        } catch is CancellationError {
        } catch {
            guard requestedKind == kind else { return }
            self.error = (error as? APIError)?.message ?? error.localizedDescription
            loaded = true
            if !reset || !posts.isEmpty { app.show(error: error) }
        }
    }

    private func remove(_ id: String) {
        withAnimation(.snappy) { posts.removeAll { $0.id == id } }
    }
}

// MARK: - Kopf

private struct FeedHeader: View {
    var firstName: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            SpecLabel(SocialFmt.longDay(), color: .moss)
            Text(firstName.map { "\(SocialFmt.greeting()), \($0)." } ?? "\(SocialFmt.greeting()).")
                .font(.display(34))
                .foregroundStyle(Color.ink)
                .fixedSize(horizontal: false, vertical: true)
            Text("Was heute auf den Werkbänken entsteht.")
                .font(.wr(.subheadline))
                .foregroundStyle(Color.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

/// Schneller Einstieg in den Composer
private struct FeedComposerPrompt: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router

    var body: some View {
        HStack(spacing: 12) {
            Button { open() } label: {
                HStack(spacing: 12) {
                    AvatarView(url: app.me?.profile?.avatarUrl, name: app.me?.profile?.displayName ?? "Du", size: 40)
                    Text("Was entsteht gerade?")
                        .font(.wr(.body))
                        .foregroundStyle(Color.muted)
                    Spacer(minLength: 0)
                }
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Neuer Beitrag: Was entsteht gerade?")

            Button { open() } label: {
                Image(systemName: "photo.on.rectangle.angled")
                    .font(.wr(.body))
                    .foregroundStyle(Color.moss)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.glass)
            .buttonBorderShape(.circle)
            .accessibilityLabel("Beitrag mit Bildern")
        }
        .padding(.leading, 12)
        .padding(.trailing, 8)
        .padding(.vertical, 8)
        .cardSurface()
    }

    private func open() {
        Haptics.tap()
        router.present(.composer())
    }
}

private struct FeedNewcomerBanner: View {
    @Environment(Router.self) private var router
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "sparkles").foregroundStyle(Color.moss)
            Text("Folge ein paar Creatorn, damit dein Feed persönlicher wird.")
                .font(.wr(.footnote))
                .foregroundStyle(Color.ink2)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            Button("Entdecken") { router.tab = .discover }
                .font(.wr(.footnote, .semibold))
                .buttonStyle(.glass)
                .controlSize(.small)
        }
        .padding(12)
        .background(Color.mossSoft, in: .rect(cornerRadius: Radius.inner, style: .continuous))
    }
}

private struct FeedEndNote: View {
    @Environment(Router.self) private var router
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Capsule().fill(Color.lineStrong).frame(width: 24, height: 1.5)
                SpecLabel("Ende des Fadens")
            }
            Text("Dein Feed mischt Frische, deine Interessen und Vielfalt – nicht nur Reichweite.")
                .font(.wr(.footnote))
                .foregroundStyle(Color.muted)
            Button("Feed anpassen") { router.open(.settingsSection(.feed)) }
                .font(.wr(.footnote, .semibold))
                .foregroundStyle(Color.moss)
                .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Auf deiner Werkbank

private struct FeedWorkbenchStrip: View {
    var projects: [SocialFeedContext.WorkbenchProject]
    @Environment(Router.self) private var router
    @Environment(AppState.self) private var app

    var body: some View {
        VStack(alignment: .leading, spacing: Space.m) {
            SectionHeader("Auf deiner Werkbank", number: "01", subtitle: projects.isEmpty ? "Noch kein Projekt in Arbeit" : Fmt.plural(projects.count, "aktives Projekt", "aktive Projekte"))
                .padding(.horizontal, Space.gutter)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(projects) { p in
                        Button {
                            if let h = p.handle ?? app.handle { router.open(.project(handle: h, slug: p.slug)) }
                        } label: { tile(p) }
                        .buttonStyle(.pressable)
                        .accessibilityElement(children: .combine)
                        .accessibilityHint("Projekt öffnen")
                    }
                    newTile
                }
                .padding(.horizontal, Space.gutter)
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.viewAligned)
            .scrollClipDisabled()
        }
    }

    private func tile(_ p: SocialFeedContext.WorkbenchProject) -> some View {
        HStack(spacing: 12) {
            CoverView(url: p.coverUrl, seed: p.id, category: p.category, showLabel: false)
                .frame(width: 58, height: 58)
                .clipShape(.rect(cornerRadius: Radius.small, style: .continuous))
            VStack(alignment: .leading, spacing: 4) {
                Text(p.title)
                    .font(.wr(.subheadline, .semibold))
                    .foregroundStyle(Color.ink)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                SpecLabel("\(L.projectStatus(p.status)) · \(Fmt.plural(p.updates, "Eintrag", "Einträge"))")
                    .lineLimit(1)
                Text(Fmt.relative(p.updatedAt)).font(.wr(.caption2)).foregroundStyle(Color.muted)
            }
            Spacer(minLength: 0)
        }
        .padding(10)
        .frame(width: 270, alignment: .leading)
        .cardSurface()
    }

    private var newTile: some View {
        Button {
            Haptics.tap()
            router.present(.projectEditor())
        } label: {
            VStack(spacing: 6) {
                Image(systemName: "plus").font(.wr(.title3, .semibold))
                Text(projects.isEmpty ? "Projekt starten" : "Neues Projekt").font(.wr(.caption, .semibold))
            }
            .foregroundStyle(Color.moss)
            .frame(width: 120, height: 78)
            .background(Color.mossSoft, in: .rect(cornerRadius: Radius.card, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Radius.card, style: .continuous).strokeBorder(Color.moss.opacity(0.35), style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
        }
        .buttonStyle(.pressable)
        .accessibilityLabel("Neues Projekt starten")
    }
}

// MARK: - Creator-Vorschläge (Karussell)

private struct FeedCreatorCarousel: View {
    var creators: [CreatorSuggestion]
    @Environment(Router.self) private var router
    @Environment(AppState.self) private var app

    var body: some View {
        VStack(alignment: .leading, spacing: Space.m) {
            SectionHeader("Creator für dich", subtitle: "Aus deinen Interessen") {
                Image(systemName: "sparkles").font(.wr(.footnote)).foregroundStyle(Color.moss)
            }
            .padding(.horizontal, Space.gutter)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(creators) { c in card(c) }
                }
                .padding(.horizontal, Space.gutter)
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.viewAligned)
            .scrollClipDisabled()
        }
    }

    private func card(_ c: CreatorSuggestion) -> some View {
        let tint = CategoryPalette.color(for: c.categories?.first)
        return VStack(alignment: .leading, spacing: 10) {
            Button { router.open(.profile(handle: c.handle)) } label: {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(alignment: .top) {
                        AvatarView(url: c.avatarUrl, name: c.displayName, size: 52, category: c.categories?.first)
                        Spacer()
                        SpecLabel(Fmt.plural(c.projectCount ?? 0, "Projekt", "Projekte"), color: tint)
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(c.displayName).font(.wr(.headline)).foregroundStyle(Color.ink).lineLimit(1)
                        Text("@\(c.handle)").font(.wr(.caption)).foregroundStyle(Color.muted).lineLimit(1)
                    }
                    Text(c.bio?.nilIfEmpty ?? (c.categories ?? []).map { app.categoryName($0) }.joined(separator: " · "))
                        .font(.wr(.footnote))
                        .foregroundStyle(Color.ink2)
                        .lineLimit(3, reservesSpace: true)
                        .multilineTextAlignment(.leading)
                }
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .combine)
            .accessibilityHint("Profil öffnen")
            HStack {
                Text(Fmt.plural(c.followerCount ?? 0, "Follower", "Follower")).font(.wr(.caption2)).foregroundStyle(Color.muted)
                Spacer()
                FollowButton(userId: c.userId, following: c.following ?? false, compact: true)
            }
        }
        .padding(14)
        .frame(width: 236, alignment: .leading)
        .cardSurface()
        .overlay(alignment: .top) {
            Capsule().fill(tint).frame(width: 28, height: 2).padding(.top, 0.5)
        }
    }
}

// MARK: - Gerade viel gemerkt

private struct FeedTrendingCard: View {
    var projects: [ProjectMini]
    @Environment(Router.self) private var router

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            SectionHeader("Gerade viel gemerkt", subtitle: "Die meistgespeicherten Projekte der letzten zwei Wochen") {
                Image(systemName: "bookmark").font(.wr(.footnote)).foregroundStyle(Color.moss)
            }
            .padding(.bottom, 8)
            ForEach(Array(projects.enumerated()), id: \.element.id) { i, p in
                Button {
                    if let h = p.ownerHandle, let s = p.slug { router.open(.project(handle: h, slug: s)) }
                } label: {
                    HStack(spacing: 14) {
                        Text(String(format: "%02d", i + 1))
                            .font(.specLarge)
                            .foregroundStyle(Color.moss)
                            .frame(width: 24, alignment: .leading)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(p.title).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink).lineLimit(1)
                            Text("von \(p.owner?.displayName ?? p.ownerHandle ?? "")").font(.wr(.caption)).foregroundStyle(Color.muted).lineLimit(1)
                        }
                        Spacer(minLength: 0)
                        CoverView(url: p.coverUrl, seed: p.id, category: p.category, showLabel: false)
                            .frame(width: 40, height: 40)
                            .clipShape(.rect(cornerRadius: Radius.small, style: .continuous))
                    }
                    .padding(.vertical, 8)
                    .contentShape(.rect)
                }
                .buttonStyle(.pressable)
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Platz \(i + 1): \(p.title)")
                if i < projects.count - 1 { Divider().overlay(Color.line) }
            }
        }
        .padding(16)
        .cardSurface()
    }
}

// MARK: - Communities

private struct FeedCommunityShelf: View {
    var communities: [CommunityCard]
    @Environment(Router.self) private var router

    var body: some View {
        VStack(alignment: .leading, spacing: Space.m) {
            SectionHeader("Communities für dich", subtitle: "Gemeinsam an Projekten dranbleiben") {
                Button("Alle") { router.open(.communities) }
                    .font(.wr(.footnote, .semibold))
                    .buttonStyle(.glass)
                    .controlSize(.small)
            }
            .padding(.horizontal, Space.gutter)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(communities) { c in
                        CommunityCardView(community: c).frame(width: 300)
                    }
                }
                .padding(.horizontal, Space.gutter)
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.viewAligned)
            .scrollClipDisabled()
        }
    }
}
