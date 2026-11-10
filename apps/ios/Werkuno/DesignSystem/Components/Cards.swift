import SwiftUI

// MARK: - Projektkarte

struct ProjectCardView: View {
    enum Style { case tile, wide, row }
    var project: ProjectCard
    var style: Style = .tile
    @Environment(Router.self) private var router

    var body: some View {
        Button { router.open(.project(handle: project.owner.handle, slug: project.slug)) } label: { content }
            .buttonStyle(.pressable)
            .accessibilityElement(children: .combine)
            .accessibilityHint("Projekt öffnen")
    }

    @ViewBuilder private var content: some View {
        switch style {
        case .tile:
            VStack(alignment: .leading, spacing: 0) {
                CoverView(url: project.coverUrl, seed: project.id, category: project.category)
                    .aspectRatio(4 / 5, contentMode: .fit)
                    .overlay(alignment: .topLeading) { StatusBadge(status: project.status).padding(8) }
                VStack(alignment: .leading, spacing: 6) {
                    Text(project.title).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink)
                        .lineLimit(2, reservesSpace: true) // alle Kacheln gleich hoch, egal wie lang der Titel ist
                        .multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    HStack(spacing: 6) {
                        AvatarView(url: project.owner.avatarUrl, name: project.owner.displayName, size: 18)
                        Text(project.owner.displayName).font(.wr(.caption)).foregroundStyle(Color.muted).lineLimit(1)
                    }
                    HStack(spacing: 10) {
                        if let d = project.difficulty { DifficultyMeter(level: d, showLabel: false) }
                        Spacer(minLength: 0)
                        Label(Fmt.number(project.counts?.saves), systemImage: "bookmark").font(.wr(.caption2)).foregroundStyle(Color.muted).labelStyle(.compact)
                    }
                }
                .padding(10)
            }
            .cardSurface()
            .clipShape(.rect(cornerRadius: Radius.card, style: .continuous))
        case .wide:
            VStack(alignment: .leading, spacing: 0) {
                CoverView(url: project.coverUrl, seed: project.id, category: project.category)
                    .frame(maxWidth: .infinity)
                    .frame(height: 190)
                    .overlay(alignment: .bottom) {
                        if project.coverUrl != nil {
                            LinearGradient(colors: [.black.opacity(0), .black.opacity(0.35)], startPoint: .top, endPoint: .bottom)
                                .frame(height: 70)
                                .allowsHitTesting(false)
                        }
                    }
                    .overlay(alignment: .bottomLeading) {
                        HStack { StatusBadge(status: project.status); Spacer() }.padding(10)
                    }
                VStack(alignment: .leading, spacing: 8) {
                    SpecLabel(categoryLine)
                    Text(project.title).font(.titleSerif).foregroundStyle(Color.ink).lineLimit(2).multilineTextAlignment(.leading)
                    HStack(spacing: 8) {
                        AvatarView(url: project.owner.avatarUrl, name: project.owner.displayName, size: 22)
                        Text(project.owner.displayName).font(.wr(.footnote)).foregroundStyle(Color.ink2)
                        Spacer()
                        countsRow
                    }
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.card) // Text immer auf ruhiger Kartenfläche, nie auf dem Foto
            }
            .cardSurface()
            .clipShape(.rect(cornerRadius: Radius.card, style: .continuous))
        case .row:
            HStack(spacing: 12) {
                CoverView(url: project.coverUrl, seed: project.id, category: project.category, showLabel: false)
                    .frame(width: 64, height: 64)
                    .clipShape(.rect(cornerRadius: Radius.small, style: .continuous))
                VStack(alignment: .leading, spacing: 4) {
                    Text(project.title).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink).lineLimit(2).multilineTextAlignment(.leading)
                    Text("\(L.projectStatus(project.status)) · \(project.owner.displayName)").font(.wr(.caption)).foregroundStyle(Color.muted).lineLimit(1)
                    if let d = project.difficulty { DifficultyMeter(level: d, showLabel: false) }
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.wr(.caption)).foregroundStyle(Color.lineStrong)
            }
            .contentShape(.rect)
        }
    }

    @Environment(AppState.self) private var app
    private var categoryLine: String {
        var s = app.categoryName(project.category)
        if let d = project.difficulty, let l = L.difficulty[d] { s += " · \(l)" }
        return s
    }

    private var countsRow: some View {
        HStack(spacing: 10) {
            Label(Fmt.number(project.counts?.likes), systemImage: "heart")
            Label(Fmt.number(project.counts?.updates), systemImage: "point.3.connected.trianglepath.dotted")
            if (project.counts?.remixes ?? 0) > 0 { Label(Fmt.number(project.counts?.remixes), systemImage: "arrow.triangle.branch") }
        }
        .font(.wr(.caption2)).foregroundStyle(Color.muted).labelStyle(.compact)
    }
}

// MARK: - Anleitungskarte

struct TutorialCardView: View {
    var tutorial: TutorialCard
    var compact = false
    @Environment(Router.self) private var router
    @Environment(AppState.self) private var app

    var body: some View {
        Button { router.open(.tutorial(slug: tutorial.slug)) } label: {
            HStack(alignment: .top, spacing: 12) {
                CoverView(url: tutorial.coverUrl, seed: tutorial.id, category: tutorial.category, showLabel: false)
                    .frame(width: compact ? 64 : 92, height: compact ? 64 : 112)
                    .clipShape(.rect(cornerRadius: Radius.inner, style: .continuous))
                    .overlay(alignment: .bottomLeading) {
                        if let steps = tutorial.steps {
                            Text("\(steps) Schritte").font(.wr(size: 9, weight: .semibold)).foregroundStyle(.white)
                                .padding(.horizontal, 6).padding(.vertical, 3).background(.black.opacity(0.45), in: Capsule()).padding(6)
                        }
                    }
                VStack(alignment: .leading, spacing: 6) {
                    SpecLabel("Anleitung · \(app.categoryShort(tutorial.category))", color: .moss)
                    Text(tutorial.title).font(compact ? .wr(.subheadline, .semibold) : .wr(.headline)).foregroundStyle(Color.ink).lineLimit(2).multilineTextAlignment(.leading)
                    if !compact, let s = tutorial.summary?.nilIfEmpty { Text(s).font(.wr(.footnote)).foregroundStyle(Color.muted).lineLimit(2).multilineTextAlignment(.leading) }
                    HStack(spacing: 10) {
                        if let d = tutorial.difficulty { DifficultyMeter(level: d, showLabel: false) }
                        Label(Fmt.minutes(tutorial.minutes), systemImage: "clock").font(.wr(.caption2)).foregroundStyle(Color.muted).labelStyle(.compact)
                        if !(tutorial.safetyKinds ?? []).isEmpty { Image(systemName: "exclamationmark.triangle.fill").font(.wr(.caption2)).foregroundStyle(Color.warn).accessibilityLabel("Sicherheitshinweise") }
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(12)
            .cardSurface()
        }
        .buttonStyle(.pressable)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Produktkarte

struct ProductCardView: View {
    var product: ProductCard
    @Environment(Router.self) private var router

    var body: some View {
        Button {
            if let s = product.shopSlugValue { router.open(.product(shopSlug: s, productSlug: product.slug)) }
        } label: {
            VStack(alignment: .leading, spacing: 0) {
                CoverView(url: product.imageURL, seed: product.id, category: product.category, showLabel: false)
                    .aspectRatio(1, contentMode: .fit)
                    .overlay(alignment: .topLeading) {
                        if product.soldOut { Pill(text: "Ausverkauft", tint: .ink, filled: true).padding(8) }
                        else if product.kind == "UNIQUE" { Pill(text: "Einzelstück", tint: .clay, filled: true).padding(8) }
                    }
                VStack(alignment: .leading, spacing: 4) {
                    Text(product.title).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink).lineLimit(2).multilineTextAlignment(.leading)
                    if let shop = product.shop?.name { Text(shop).font(.wr(.caption)).foregroundStyle(Color.muted).lineLimit(1) }
                    HStack {
                        Text(Fmt.money(product.priceMinor, currency: product.currency)).font(.wr(.subheadline, .bold)).monospacedDigit().foregroundStyle(Color.ink)
                        Spacer()
                        if let r = product.ratingAvg, (product.ratingCount ?? 0) > 0 {
                            Label(String(format: "%.1f", r), systemImage: "star.fill").font(.wr(.caption2)).foregroundStyle(Color.ochre).labelStyle(.compact)
                        }
                    }
                }
                .padding(10)
            }
            .cardSurface()
            .clipShape(.rect(cornerRadius: Radius.card, style: .continuous))
        }
        .buttonStyle(.pressable)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Community

struct CommunityCardView: View {
    var community: CommunityCard
    @Environment(Router.self) private var router
    @Environment(AppState.self) private var app

    var body: some View {
        Button { router.open(.community(slug: community.slug)) } label: {
            HStack(spacing: 12) {
                CoverView(url: community.coverUrl, seed: community.id, category: community.category, showLabel: false)
                    .frame(width: 56, height: 56)
                    .clipShape(.rect(cornerRadius: Radius.inner, style: .continuous))
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(community.name).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink).lineLimit(1)
                        if community.visibility == "PRIVATE" { Image(systemName: "lock.fill").font(.wr(.caption2)).foregroundStyle(Color.muted) }
                        if community.visibility == "REQUEST" { Image(systemName: "person.badge.clock").font(.wr(.caption2)).foregroundStyle(Color.muted) }
                    }
                    Text([app.categoryShort(community.category), community.region].compactMap { $0?.nilIfEmpty }.joined(separator: " · ")).font(.wr(.caption)).foregroundStyle(Color.muted).lineLimit(1)
                    Text(Fmt.plural(community.memberCount ?? 0, "Mitglied", "Mitglieder")).font(.wr(.caption2)).foregroundStyle(Color.muted)
                }
                Spacer(minLength: 0)
                if community.viewerState == "ACTIVE" { Pill(text: "Mitglied", symbol: "checkmark", tint: .moss) }
                else if community.viewerState == "PENDING" { Pill(text: "Angefragt", tint: .warn) }
                else if community.viewerState == "INVITED" { Pill(text: "Eingeladen", tint: .clay) }
            }
            .padding(12)
            .cardSurface()
        }
        .buttonStyle(.pressable)
    }
}

// MARK: - Artikel

struct ArticleCardView: View {
    var article: ArticleCard
    var large = false
    @Environment(Router.self) private var router

    var body: some View {
        Button {
            if let h = article.author?.handle { router.open(.article(handle: h, slug: article.slug)) }
        } label: {
            VStack(alignment: .leading, spacing: 10) {
                CoverView(url: article.coverUrl, seed: article.id, category: nil, showLabel: false)
                    .frame(height: large ? 200 : 130)
                    .clipShape(.rect(cornerRadius: Radius.inner, style: .continuous))
                SpecLabel([article.category?.name, article.readingMinutes.map { "\($0) Min. Lesezeit" }].compactMap { $0 }.joined(separator: " · "), color: .clay)
                Text(article.title).font(large ? .display(24) : .titleSerif).foregroundStyle(Color.ink).lineLimit(3).multilineTextAlignment(.leading)
                if let dek = article.dek?.nilIfEmpty { Text(dek).font(.wr(.subheadline)).foregroundStyle(Color.muted).lineLimit(large ? 3 : 2).multilineTextAlignment(.leading) }
                if let a = article.author {
                    HStack(spacing: 8) {
                        AvatarView(url: a.avatarUrl, name: a.displayName, size: 20)
                        Text(a.displayName).font(.wr(.caption)).foregroundStyle(Color.ink2)
                        Text(Fmt.date(article.publishedAt)).font(.wr(.caption)).foregroundStyle(Color.muted)
                    }
                }
            }
            .padding(12)
            .cardSurface()
        }
        .buttonStyle(.pressable)
    }
}

// MARK: - Creator

struct CreatorRowView: View {
    var creator: CreatorSuggestion
    @Environment(Router.self) private var router
    @Environment(AppState.self) private var app

    var body: some View {
        HStack(spacing: 12) {
            Button { router.open(.profile(handle: creator.handle)) } label: {
                HStack(spacing: 12) {
                    AvatarView(url: creator.avatarUrl, name: creator.displayName, size: 44, category: creator.categories?.first)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(creator.displayName).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink)
                        Text((creator.categories ?? []).prefix(2).map { app.categoryShort($0) }.joined(separator: " · ") + " · \(Fmt.plural(creator.projectCount ?? 0, "Projekt", "Projekte"))")
                            .font(.wr(.caption)).foregroundStyle(Color.muted).lineLimit(1)
                    }
                }
            }
            .buttonStyle(.plain)
            Spacer(minLength: 0)
            FollowButton(userId: creator.userId, following: creator.following ?? false, compact: true)
        }
    }
}

// MARK: - Pressable

struct PressableButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.975 : 1)
            .opacity(configuration.isPressed ? 0.92 : 1)
            .animation(.spring(duration: 0.25), value: configuration.isPressed)
    }
}

extension ButtonStyle where Self == PressableButtonStyle {
    static var pressable: PressableButtonStyle { PressableButtonStyle() }
}

struct CompactLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 3) { configuration.icon; configuration.title }
    }
}

extension LabelStyle where Self == CompactLabelStyle {
    static var compact: CompactLabelStyle { CompactLabelStyle() }
}
