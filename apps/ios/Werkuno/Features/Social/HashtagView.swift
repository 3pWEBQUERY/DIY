import SwiftUI

// MARK: - Modelle (`GET /hashtags/:name`)

struct HashtagSummary: Codable, Hashable, Identifiable, Sendable {
    var name: String
    var display: String
    var count: Int
    var id: String { name }
}

struct HashtagCounts: Codable, Hashable, Sendable {
    var post: Int?
    var project: Int?
    var tutorial: Int?
    var article: Int?
    var product: Int?
    var comment: Int?

    func value(_ k: HashtagKind) -> Int {
        switch k {
        case .post: post ?? 0
        case .project: project ?? 0
        case .tutorial: tutorial ?? 0
        case .article: article ?? 0
        case .product: product ?? 0
        case .comment: comment ?? 0
        }
    }
}

struct HashtagCommentItem: Codable, Hashable, Identifiable, Sendable {
    struct Author: Codable, Hashable, Sendable { var handle: String; var displayName: String; var avatarUrl: String? }
    struct Target: Codable, Hashable, Sendable { var label: String; var title: String; var href: String }
    var id: String
    var body: String
    var createdAt: Date?
    var author: Author
    var target: Target
}

struct HashtagPageData: Decodable, Sendable {
    struct Tag: Codable, Hashable, Sendable { var name: String; var display: String }
    var tag: Tag
    var exists: Bool?
    var counts: HashtagCounts
    var total: Int
    var kind: String?
    var posts: [PostItem]
    var projects: [ProjectCard]
    var tutorials: [TutorialCard]
    var articles: [ArticleCard]
    var products: [ProductCard]
    var comments: [HashtagCommentItem]
    var nextCursor: String?
    var related: [HashtagSummary]
}

/// Arten auf der Hashtag-Seite (URL-Parameter `typ` wie im Web)
enum HashtagKind: String, CaseIterable, Identifiable, Hashable {
    case post, project, tutorial, article, product, comment
    var id: String { rawValue }

    var slug: String {
        switch self {
        case .post: "beitraege"
        case .project: "projekte"
        case .tutorial: "anleitungen"
        case .article: "artikel"
        case .product: "produkte"
        case .comment: "kommentare"
        }
    }

    var label: String {
        switch self {
        case .post: "Beiträge"
        case .project: "Projekte"
        case .tutorial: "Anleitungen"
        case .article: "Artikel"
        case .product: "Produkte"
        case .comment: "Kommentare"
        }
    }
}

// MARK: - Hashtag-Seite

/// Alle Inhalte mit einem Hashtag – öffnet sich im aktuellen Tab (wie bei Instagram).
/// Übersicht mit wenigen Treffern je Art; ein Filter zeigt eine Art vollständig mit Nachladen.
struct HashtagView: View {
    var tag: String
    @Environment(Router.self) private var router
    @Environment(AppState.self) private var app

    @State private var page: HashtagPageData?
    @State private var selection = "all"
    @State private var loading = true
    @State private var error: String?
    @State private var moreFailed = false

    private var kind: HashtagKind? { HashtagKind(rawValue: selection) }
    private var display: String { page?.tag.display ?? tag }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Color.clear.frame(height: 0)
                header
                content
            }
            .padding(.bottom, 32)
        }
        .background(Color.paper)
        .navigationTitle("#\(display)")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                ShareLink(item: AppConfig.webURL(Hashtags.path(tag))) { Image(systemName: "square.and.arrow.up") }
                    .accessibilityLabel("Hashtag teilen")
            }
        }
        .contentLinks()
        .task(id: selection) { await load() }
        .refreshable { await load() }
    }

    // MARK: Kopf

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            SpecLabel("Hashtag", color: .moss)
            Text("#\(display)")
                .font(.display(34))
                .foregroundStyle(Color.ink)
                .lineLimit(2)
                .minimumScaleFactor(0.6)
                .accessibilityAddTraits(.isHeader)
            if let p = page {
                Text(p.total == 0 ? "Noch keine Inhalte" : Fmt.plural(p.total, "Inhalt", "Inhalte"))
                    .font(.wr(.subheadline))
                    .foregroundStyle(Color.muted)
            }
        }
        .padding(.horizontal, Space.gutter)
        .padding(.top, 12)
        .padding(.bottom, 14)
    }

    private var chipItems: [(value: String, label: String)] {
        guard let p = page else { return [] }
        var items: [(value: String, label: String)] = [(value: "all", label: "Alle")]
        for k in HashtagKind.allCases {
            let n = p.counts.value(k)
            if n > 0 || selection == k.rawValue { items.append((value: k.rawValue, label: "\(k.label) \(Fmt.number(n))")) }
        }
        return items
    }

    // MARK: Inhalt

    @ViewBuilder private var content: some View {
        if loading && page == nil {
            LoadingView(text: "Inhalte werden geladen …")
        } else if let error, page == nil {
            ErrorStateView(message: error) { await load() }
        } else if let p = page {
            if p.total == 0 {
                EmptyStateView(symbol: "number", title: "Noch keine Inhalte mit #\(display)", message: "Verwende #\(display) in einem Beitrag, Projekt oder einer Anleitung – dann erscheint der Inhalt hier.")
            } else {
                if chipItems.count > 2 {
                    ChipBar(items: chipItems, selection: $selection).padding(.bottom, 14)
                }
                if let kind {
                    kindList(kind, p)
                } else {
                    overview(p)
                }
            }
            related(p)
        }
    }

    private func overview(_ p: HashtagPageData) -> some View {
        VStack(alignment: .leading, spacing: 28) {
            ForEach(HashtagKind.allCases.filter { p.counts.value($0) > 0 }) { k in
                VStack(alignment: .leading, spacing: 12) {
                    SectionHeader(k.label, subtitle: Fmt.number(p.counts.value(k))) {
                        if p.counts.value(k) > previewCount(k, p) {
                            Button("Alle anzeigen") {
                                Haptics.selection()
                                withAnimation(.snappy) { selection = k.rawValue }
                            }
                            .font(.wr(.subheadline, .semibold))
                            .foregroundStyle(Color.moss)
                        }
                    }
                    .padding(.horizontal, Space.gutter)
                    items(k, p)
                }
            }
        }
    }

    private func previewCount(_ k: HashtagKind, _ p: HashtagPageData) -> Int {
        switch k {
        case .post: p.posts.count
        case .project: p.projects.count
        case .tutorial: p.tutorials.count
        case .article: p.articles.count
        case .product: p.products.count
        case .comment: p.comments.count
        }
    }

    private func kindList(_ k: HashtagKind, _ p: HashtagPageData) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            items(k, p)
            LoadMoreTrigger(hasMore: p.nextCursor != nil, failed: moreFailed) { await loadMore() }
        }
    }

    @ViewBuilder private func items(_ k: HashtagKind, _ p: HashtagPageData) -> some View {
        switch k {
        case .post:
            LazyVStack(spacing: 12) {
                ForEach(p.posts) { post in PostCardView(post: post) }
            }
            .padding(.horizontal, Space.gutter)
        case .project:
            AdaptiveGrid(spacing: 12, rowSpacing: 14) {
                ForEach(p.projects) { ProjectCardView(project: $0, style: .tile) }
            }
            .padding(.horizontal, Space.gutter)
        case .tutorial:
            LazyVStack(spacing: 12) {
                ForEach(p.tutorials) { TutorialCardView(tutorial: $0) }
            }
            .padding(.horizontal, Space.gutter)
        case .article:
            LazyVStack(spacing: 12) {
                ForEach(p.articles) { ArticleCardView(article: $0) }
            }
            .padding(.horizontal, Space.gutter)
        case .product:
            AdaptiveGrid(spacing: 12, rowSpacing: 14) {
                ForEach(p.products) { ProductCardView(product: $0) }
            }
            .padding(.horizontal, Space.gutter)
        case .comment:
            LazyVStack(spacing: 10) {
                ForEach(p.comments) { HashtagCommentRow(comment: $0) }
            }
            .padding(.horizontal, Space.gutter)
        }
    }

    @ViewBuilder private func related(_ p: HashtagPageData) -> some View {
        if !p.related.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                SpecLabel("Ähnliche Hashtags")
                FlowLayout {
                    ForEach(p.related) { r in relatedChip(r) }
                }
            }
            .padding(.horizontal, Space.gutter)
            .padding(.top, 28)
        }
    }

    private func relatedChip(_ r: HashtagSummary) -> some View {
        Button {
            Haptics.selection()
            router.open(.hashtag(r.name))
        } label: {
            Text("#\(r.display)")
                .font(.wr(.footnote, .semibold))
                .foregroundStyle(Color.moss)
                .padding(.horizontal, 10).padding(.vertical, 5)
                .background(Color.mossSoft, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Hashtag \(r.display), \(Fmt.plural(r.count, "gemeinsamer Inhalt", "gemeinsame Inhalte"))")
    }

    // MARK: Laden

    private func query(cursor: String?) -> [String: String?] {
        ["typ": kind?.slug, "cursor": cursor]
    }

    private func load() async {
        loading = true
        moreFailed = false
        // Zeiger der vorherigen Art nicht für die neue verwenden
        page?.nextCursor = nil
        defer { loading = false }
        do {
            let p: HashtagPageData = try await APIClient.shared.get("/hashtags/\(Hashtags.normalize(tag))", query: query(cursor: nil))
            page = p
            error = nil
        } catch is CancellationError {
        } catch {
            if page == nil { self.error = error.localizedDescription } else { app.show(error: error) }
        }
    }

    private func loadMore() async {
        guard let p = page, let cursor = p.nextCursor, let kind else { return }
        do {
            let next: HashtagPageData = try await APIClient.shared.get("/hashtags/\(Hashtags.normalize(tag))", query: query(cursor: cursor))
            guard self.kind == kind else { return }
            var merged = p
            switch kind {
            case .post: merged.posts += next.posts.filter { n in !p.posts.contains { $0.id == n.id } }
            case .project: merged.projects += next.projects.filter { n in !p.projects.contains { $0.id == n.id } }
            case .tutorial: merged.tutorials += next.tutorials.filter { n in !p.tutorials.contains { $0.id == n.id } }
            case .article: merged.articles += next.articles.filter { n in !p.articles.contains { $0.id == n.id } }
            case .product: merged.products += next.products.filter { n in !p.products.contains { $0.id == n.id } }
            case .comment: merged.comments += next.comments.filter { n in !p.comments.contains { $0.id == n.id } }
            }
            merged.nextCursor = next.nextCursor
            page = merged
            moreFailed = false
        } catch is CancellationError {
        } catch {
            moreFailed = true
        }
    }
}

// MARK: - Kommentar mit Hashtag

struct HashtagCommentRow: View {
    var comment: HashtagCommentItem
    @Environment(Router.self) private var router

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            authorLine
            Text(LinkedText.attributed(comment.body))
                .font(.wr(.subheadline))
                .foregroundStyle(Color.ink)
                .fixedSize(horizontal: false, vertical: true)
            targetLink
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
    }

    private var authorLine: some View {
        Button { router.open(.profile(handle: comment.author.handle)) } label: {
            HStack(spacing: 8) {
                AvatarView(url: comment.author.avatarUrl, name: comment.author.displayName, size: 28)
                Text(comment.author.displayName).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink).lineLimit(1)
                Text(Fmt.relative(comment.createdAt)).font(.wr(.caption)).foregroundStyle(Color.muted).lineLimit(1)
            }
        }
        .buttonStyle(.plain)
    }

    private var targetLink: some View {
        Button { router.open(href: comment.target.href) } label: {
            HStack(spacing: 6) {
                Image(systemName: "arrow.turn.down.right").font(.wr(.caption2))
                Text("\(comment.target.label): \(comment.target.title)").lineLimit(1)
            }
            .font(.wr(.caption, .semibold))
            .foregroundStyle(Color.muted)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Zum \(comment.target.label) \(comment.target.title)")
    }
}
