import SwiftUI

// MARK: - Blog-Startseite: Magazin (PRD §14)

struct BlogHomeView: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router

    @State private var home: BlogHome?
    @State private var error: String?
    @State private var query = ""
    @State private var category: String?
    @State private var tag: String?
    @State private var list: [ArticleCard] = []
    @State private var cursor: String?
    @State private var listLoaded = false

    private var isFiltering: Bool { query.trimmed.count >= 2 || category != nil || tag != nil }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                masthead
                DiscoverSearchField(prompt: "Artikel, Thema oder Technik", text: $query)
                    .padding(.horizontal, Space.gutter)
                if let home, !home.categories.isEmpty {
                    ChipBar(items: [(value: String?.none, label: "Alle")] + home.categories.map { (value: Optional($0.slug), label: $0.name) }, selection: $category)
                }
                if let tag {
                    HStack {
                        Text("#\(tag)").font(.wr(.subheadline, .semibold))
                        Button { withAnimation { self.tag = nil } } label: { Image(systemName: "xmark.circle.fill") }
                            .buttonStyle(.plain).foregroundStyle(Color.muted)
                            .accessibilityLabel("Schlagwort entfernen")
                    }
                    .padding(.horizontal, 12).padding(.vertical, 6)
                    .background(Color.sunken, in: Capsule())
                    .padding(.horizontal, Space.gutter)
                }
                if isFiltering {
                    filtered
                } else if let home {
                    magazine(home)
                } else if let error {
                    ErrorStateView(message: error) { await load() }
                } else {
                    LoadingView(text: "Das Magazin wird gedruckt …")
                }
            }
            .padding(.vertical, 12)
            .padding(.bottom, 40)
        }
        .scrollDismissesKeyboard(.immediately)
        .background(Color.paper)
        .navigationTitle("Blogs")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if app.isSignedIn {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { router.present(.articleEditor()) } label: { Image(systemName: "square.and.pencil") }
                        .accessibilityLabel("Artikel schreiben")
                }
            }
        }
        .refreshable { await load(); if isFiltering { await search(reset: true) } }
        .task { if home == nil { await load() } }
        .task(id: "\(query.trimmed)|\(category ?? "")|\(tag ?? "")") {
            guard isFiltering else { list = []; listLoaded = false; return }
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            await search(reset: true)
        }
    }

    private func load() async {
        do {
            let h: BlogHome = try await APIClient.shared.get("/blog/home")
            withAnimation(.snappy) { home = h; error = nil }
        } catch is CancellationError {
        } catch {
            if home == nil { self.error = (error as? APIError)?.message ?? error.localizedDescription }
        }
    }

    private func search(reset: Bool) async {
        do {
            let q = query.trimmed.count >= 2 ? query.trimmed : nil
            let p: Page<ArticleCard> = try await APIClient.shared.get("/blog/articles", query: ["q": q, "category": category, "tag": tag, "cursor": reset ? nil : cursor])
            withAnimation(.snappy) { list = reset ? p.items : list + p.items }
            cursor = p.nextCursor
            listLoaded = true
        } catch is CancellationError {
        } catch { app.show(error: error) }
    }

    // MARK: Kopf

    private var masthead: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                SpecLabel("Werkuno Magazin", color: .clay)
                Spacer()
                SpecLabel(Fmt.date(Date(), style: .long))
            }
            Text("Geschichten vom Werktisch")
                .font(.display(36))
                .foregroundStyle(Color.ink)
                .fixedSize(horizontal: false, vertical: true)
            Text("Erfahrungsberichte, Techniken und Gedanken von Menschen, die mit den Händen denken.")
                .font(.wr(.subheadline).italic())
                .foregroundStyle(Color.ink2)
            Rectangle().fill(Color.ink).frame(height: 1.5).padding(.top, 6)
            Rectangle().fill(Color.ink).frame(height: 0.5)
        }
        .padding(.horizontal, Space.gutter)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }

    // MARK: Gefiltert

    @ViewBuilder private var filtered: some View {
        VStack(alignment: .leading, spacing: 0) {
            if !listLoaded {
                LoadingView()
            } else if list.isEmpty {
                EmptyStateView(symbol: "text.book.closed", title: "Keine Artikel gefunden", message: "Versuche ein anderes Stichwort oder eine andere Rubrik.")
            } else {
                SpecLabel(Fmt.plural(list.count, "Artikel", "Artikel")).padding(.bottom, 4)
                ForEach(list) { BlogMagazineRow(article: $0) }
                LoadMoreTrigger(hasMore: cursor != nil) { await search(reset: false) }
            }
        }
        .padding(.horizontal, Space.gutter)
    }

    // MARK: Magazin

    @ViewBuilder private func magazine(_ h: BlogHome) -> some View {
        if h.hero == nil && h.latest.isEmpty {
            EmptyStateView(symbol: "text.book.closed", title: "Noch keine Artikel", message: "Erzähl als Erste:r, wie dein letztes Projekt entstanden ist.", actionTitle: app.isSignedIn ? "Artikel schreiben" : nil) {
                router.present(.articleEditor())
            }
        } else {
            VStack(alignment: .leading, spacing: 30) {
                if let hero = h.hero { heroCard(hero).padding(.horizontal, Space.gutter) }
                if !h.latest.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        SectionHeader("Neu erschienen", number: "01")
                        let lead = Array(h.latest.prefix(2))
                        HStack(alignment: .top, spacing: 12) {
                            ForEach(lead) { a in secondaryCard(a) }
                        }
                        ForEach(h.latest.dropFirst(2)) { BlogMagazineRow(article: $0) }
                    }
                    .padding(.horizontal, Space.gutter)
                }
                ForEach(Array(h.byCategory.enumerated()), id: \.element.id) { i, g in
                    VStack(alignment: .leading, spacing: 4) {
                        SectionHeader(g.category.name, number: String(format: "%02d", i + 2)) {
                            DiscoverMoreButton(title: "Rubrik") { withAnimation { category = g.category.slug } }
                        }
                        ForEach(g.items) { BlogMagazineRow(article: $0) }
                    }
                    .padding(.horizontal, Space.gutter)
                }
                if !h.authors.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        SectionHeader("Autor:innen", subtitle: "Wer hier schreibt")
                            .padding(.horizontal, Space.gutter)
                        DiscoverCarousel(items: h.authors, width: 210) { a in authorCard(a) }
                    }
                }
            }
        }
    }

    private func open(_ a: ArticleCard) {
        if let h = a.author?.handle { router.open(.article(handle: h, slug: a.slug)) } else { router.open(href: a.href) }
    }

    private func heroCard(_ a: ArticleCard) -> some View {
        Button { open(a) } label: {
            VStack(alignment: .leading, spacing: 12) {
                CoverView(url: a.coverUrl, seed: a.id, category: nil, animated: true)
                    .frame(height: 250)
                    .frame(maxWidth: .infinity)
                    .clipShape(.rect(cornerRadius: Radius.card, style: .continuous))
                    .overlay(alignment: .topLeading) {
                        if a.isFeatured == true {
                            Label("Empfohlen", systemImage: "star.fill").font(.wr(.caption, .semibold))
                                .padding(.horizontal, 10).padding(.vertical, 6)
                                .glassEffect(.regular, in: Capsule())
                                .padding(12)
                        }
                    }
                SpecLabel([a.category?.name, a.readingMinutes.map { "\($0) Min. Lesezeit" }].compactMap { $0 }.joined(separator: " · "), color: .clay)
                Text(a.title).font(.display(30)).foregroundStyle(Color.ink).multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                if let dek = a.dek?.nilIfEmpty {
                    Text(dek).font(.wr(.body)).foregroundStyle(Color.ink2).multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let au = a.author {
                    HStack(spacing: 8) {
                        AvatarView(url: au.avatarUrl, name: au.displayName, size: 26)
                        Text(au.displayName).font(.wr(.footnote, .semibold)).foregroundStyle(Color.ink)
                        Text("· \(Fmt.date(a.publishedAt))").font(.wr(.footnote)).foregroundStyle(Color.muted)
                    }
                }
            }
        }
        .buttonStyle(.pressable)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Artikel lesen")
    }

    private func secondaryCard(_ a: ArticleCard) -> some View {
        Button { open(a) } label: {
            VStack(alignment: .leading, spacing: 8) {
                CoverView(url: a.coverUrl, seed: a.id, category: nil, showLabel: false)
                    .frame(height: 120)
                    .frame(maxWidth: .infinity)
                    .clipShape(.rect(cornerRadius: Radius.inner, style: .continuous))
                if let c = a.category?.name { SpecLabel(c, color: .clay) }
                Text(a.title).font(.wr(.headline)).foregroundStyle(Color.ink).lineLimit(4).multilineTextAlignment(.leading)
                if let au = a.author { Text(au.displayName).font(.wr(.caption)).foregroundStyle(Color.muted) }
            }
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
        .buttonStyle(.pressable)
        .accessibilityElement(children: .combine)
    }

    private func authorCard(_ a: BlogAuthor) -> some View {
        Button { router.open(.userBlog(handle: a.handle)) } label: {
            VStack(alignment: .leading, spacing: 8) {
                AvatarView(url: a.avatarUrl, name: a.displayName, size: 48)
                Text(a.displayName).font(.wr(.headline)).foregroundStyle(Color.ink)
                if let b = a.bio?.nilIfEmpty { Text(b).font(.wr(.caption)).foregroundStyle(Color.muted).lineLimit(3).multilineTextAlignment(.leading) }
                Spacer(minLength: 0)
                SpecLabel(Fmt.plural(a.articles ?? 0, "Artikel", "Artikel"), color: .moss)
            }
            .padding(14)
            .frame(maxWidth: .infinity, minHeight: 190, alignment: .topLeading)
            .cardSurface()
        }
        .buttonStyle(.pressable)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Blog einer Person

struct UserBlogView: View {
    var handle: String
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router

    @State private var current: String?
    @State private var items: [ArticleCard] = []
    @State private var cursor: String?
    @State private var loaded = false
    @State private var error: String?
    @State private var tag: String?

    private var h: String { current ?? handle }
    private var author: UserMini? { items.first?.author }
    private var tags: [String] {
        var seen = Set<String>(); var out: [String] = []
        for t in items.flatMap({ $0.tags ?? [] }) where seen.insert(t).inserted { out.append(t) }
        return out
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 10) {
                    SpecLabel("Blog", color: .clay)
                    HStack(spacing: 12) {
                        AvatarView(url: author?.avatarUrl, name: author?.displayName ?? h, size: 52)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(author?.displayName ?? "@\(h)").font(.display(26)).foregroundStyle(Color.ink)
                            Button("@\(h) · Profil ansehen") { router.open(.profile(handle: h)) }
                                .font(.wr(.footnote)).foregroundStyle(Color.moss)
                        }
                    }
                    Rectangle().fill(Color.ink).frame(height: 1).padding(.top, 4)
                }
                .padding(.horizontal, Space.gutter)
                if !tags.isEmpty || tag != nil {
                    ChipBar(items: [(value: String?.none, label: "Alle")] + (tags + (tag.map { tags.contains($0) ? [] : [$0] } ?? [])).map { (value: Optional($0), label: "#\($0)") }, selection: $tag)
                }
                Group {
                    if let error {
                        ErrorStateView(message: error) { await load(reset: true) }
                    } else if !loaded {
                        LoadingView()
                    } else if items.isEmpty {
                        EmptyStateView(symbol: "text.book.closed", title: tag == nil ? "Noch keine Artikel" : "Keine Artikel mit #\(tag!)", message: tag == nil ? "Hier erscheinen veröffentlichte Artikel von @\(h)." : nil)
                    } else {
                        VStack(spacing: 14) {
                            if let first = items.first { ArticleCardView(article: first, large: true) }
                            VStack(spacing: 0) {
                                ForEach(items.dropFirst()) { BlogMagazineRow(article: $0, showAuthor: false) }
                            }
                            LoadMoreTrigger(hasMore: cursor != nil) { await load(reset: false) }
                        }
                    }
                }
                .padding(.horizontal, Space.gutter)
            }
            .padding(.vertical, 12)
            .padding(.bottom, 30)
        }
        .background(Color.paper)
        .navigationTitle("Blog")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                ShareLink(item: AppConfig.webURL("/u/\(h)/blog")) { Image(systemName: "square.and.arrow.up") }
                    .accessibilityLabel("Blog teilen")
            }
        }
        .refreshable { await load(reset: true) }
        .task(id: tag) { await load(reset: true) }
    }

    private func load(reset: Bool) async {
        do {
            let p: BlogUserPage = try await APIClient.shared.get("/users/\(h)/blog", query: ["tag": tag, "cursor": reset ? nil : cursor])
            if let r = p.redirect, r != h {
                current = r
                await load(reset: true)
                return
            }
            withAnimation(.snappy) { items = reset ? (p.items ?? []) : items + (p.items ?? []) }
            cursor = p.nextCursor
            loaded = true
            error = nil
        } catch is CancellationError {
        } catch {
            if items.isEmpty { self.error = (error as? APIError)?.message ?? error.localizedDescription } else { app.show(error: error) }
        }
    }
}
