import SwiftUI

// MARK: - Entdecken (Tab-Wurzel) & Kategorieseite (PRD §18.3)

struct DiscoverView: View {
    var body: some View {
        DiscoverPageContent(initialSlug: nil, isRoot: true)
    }
}

struct CategoryDiscoverView: View {
    var slug: String
    var body: some View {
        DiscoverPageContent(initialSlug: slug, isRoot: false)
    }
}

private enum DiscoverSection: Hashable {
    case categories, collections, popular, fresh, tutorials, posts, creators, communities, more
}

private struct DiscoverPageContent: View {
    var initialSlug: String?
    var isRoot: Bool

    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var active: String?
    @State private var page: DiscoverPage?
    @State private var error: String?
    @State private var loading = false
    @State private var cycle = 0
    @State private var didInit = false
    @State private var loadedKey: String?

    private var categories: [Category] {
        let c = page?.categories ?? app.activeCategories
        return c.filter { $0.isActive != false }
    }

    private var activeCategory: Category? {
        guard let active else { return nil }
        return page?.category?.slug == active ? page?.category : categories.first { $0.slug == active } ?? app.category(active)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                hero
                DiscoverCategoryChips(categories: categories, selection: $active)
                    .padding(.top, 12)
                if let page {
                    content(page)
                        .opacity(loading ? 0.55 : 1)
                        .animation(.easeOut(duration: 0.2), value: loading)
                } else if let error {
                    ErrorStateView(message: error) { await load() }
                } else {
                    LoadingView(text: "Wir legen die Werkstücke aus …")
                }
            }
            .padding(.bottom, 40)
        }
        .background(Color.paper)
        .navigationTitle(isRoot ? "Entdecken" : (activeCategory?.name ?? "Kategorie"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    router.tab = .search
                } label: { Image(systemName: "magnifyingglass") }
                .accessibilityLabel("Suchen")
            }
        }
        .refreshable { await load() }
        .task(id: active) {
            if !didInit { didInit = true; active = initialSlug; if initialSlug != nil { return } }
            if page != nil && loadedKey == (active ?? "*") { return }
            await load()
        }
        .task(id: active == nil && !reduceMotion) {
            // Ohne aktive Kategorie wandert der Faden durch alle Kategorien.
            guard active == nil, !reduceMotion else { return }
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(5))
                if Task.isCancelled { break }
                cycle += 1
            }
        }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            let p: DiscoverPage = try await APIClient.shared.get("/discover", query: ["category": active])
            withAnimation(.snappy) { page = p; error = nil }
            loadedKey = active ?? "*"
        } catch is CancellationError {
        } catch {
            if page == nil { self.error = (error as? APIError)?.message ?? error.localizedDescription } else { app.show(error: error) }
        }
    }

    // MARK: Kopf mit 3D-Faden

    private var heroCategory: Category? {
        if let c = activeCategory { return c }
        let list = categories.filter { $0.glyph != nil }
        guard !list.isEmpty, !reduceMotion else { return nil }
        return list[cycle % list.count]
    }

    private var seasonal: DiscoverCollection? { page?.collections.first { $0.isSeasonal == true } }

    private var hero: some View {
        let hc = heroCategory
        let color = hc.map { CategoryPalette.color(for: $0.slug) } ?? Color.moss
        return ZStack(alignment: .bottomLeading) {
            Rectangle().fill(color.opacity(0.07))
                .animation(.easeInOut(duration: 0.8), value: hc?.slug)
            ThreeCanvas(scene: .glyph(hc?.glyph, color: color, seed: Int((hc?.slug ?? "werkraum").stableHash % 97) + 1, spin: 0.18))
                .frame(height: 300)
                .frame(maxWidth: .infinity)
                .padding(.bottom, 40)
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    SpecLabel(heroKicker, color: color)
                    if loading { YarnSpinner(size: 14, color: color) }
                }
                Text(heroTitle)
                    .font(.display(34))
                    .foregroundStyle(Color.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .contentTransition(.opacity)
                if let s = heroSubtitle {
                    Text(s).font(.subheadline).foregroundStyle(Color.ink2)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.horizontal, Space.gutter)
            .padding(.bottom, 18)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
        }
        .frame(minHeight: 340)
        .clipped()
        .hairline()
    }

    private var heroKicker: String {
        if let c = activeCategory { return "Kategorie · \(c.short)" }
        if let s = seasonal?.season { return "Entdecken · \(seasonName(s))" }
        return "Entdecken"
    }

    private var heroTitle: String {
        if let c = activeCategory { return c.name }
        return "Was gerade entsteht"
    }

    private var heroSubtitle: String? {
        if let c = activeCategory {
            if let d = c.description?.nilIfEmpty { return d }
            let n = categories.first { $0.slug == c.slug }?.projectCount ?? 0
            return "\(Fmt.plural(n, "öffentliches Projekt", "öffentliche Projekte")), Anleitungen und Menschen, die daran arbeiten."
        }
        let total = categories.reduce(0) { $0 + ($1.projectCount ?? 0) }
        return total > 0 ? "\(Fmt.plural(total, "Projekt", "Projekte")) in \(categories.count) Werkstätten – kuratiert, saisonal, von Menschen wie dir." : "Projekte, Anleitungen und Menschen aus allen Werkstätten."
    }

    private func seasonName(_ s: String) -> String {
        ["winter": "Winter", "fruehling": "Frühling", "sommer": "Sommer", "herbst": "Herbst"][s] ?? s.capitalized
    }

    // MARK: Inhalt

    private func sections(_ p: DiscoverPage) -> [DiscoverSection] {
        var s: [DiscoverSection] = [.categories]
        if !p.collections.isEmpty { s.append(.collections) }
        if !p.popular.isEmpty { s.append(.popular) }
        if !p.fresh.isEmpty { s.append(.fresh) }
        if !p.tutorials.isEmpty { s.append(.tutorials) }
        if !(p.posts ?? []).isEmpty { s.append(.posts) }
        if !p.creators.isEmpty { s.append(.creators) }
        if !p.communities.isEmpty { s.append(.communities) }
        s.append(.more)
        return s
    }

    @ViewBuilder private func content(_ p: DiscoverPage) -> some View {
        VStack(alignment: .leading, spacing: 34) {
            quickAccess
            let list = sections(p)
            ForEach(Array(list.enumerated()), id: \.element) { i, s in
                section(s, number: String(format: "%02d", i + 1), page: p)
            }
            if p.popular.isEmpty && p.fresh.isEmpty && p.tutorials.isEmpty {
                EmptyStateView(symbol: "square.dashed", title: "Hier ist es noch ruhig", message: activeCategory.map { "In \($0.name) gibt es noch keine öffentlichen Projekte. Starte doch das erste!" } ?? "Noch keine öffentlichen Projekte.", actionTitle: "Projekt anlegen") {
                    router.present(.projectEditor())
                }
            }
        }
        .padding(.top, 22)
    }

    @ViewBuilder private func section(_ s: DiscoverSection, number: String, page p: DiscoverPage) -> some View {
        switch s {
        case .categories: categoryGrid(number)
        case .collections: collections(p.collections, number: number)
        case .popular:
            VStack(alignment: .leading, spacing: 12) {
                SectionHeader("Beliebt", number: number, subtitle: "Die meistgespeicherten Werkstücke") {
                    DiscoverMoreButton { router.open(.projectList(category: active, sort: "popular")) }
                }
                .padding(.horizontal, Space.gutter)
                DiscoverCarousel(items: p.popular, width: 196) { ProjectCardView(project: $0, style: .tile) }
            }
        case .fresh:
            VStack(alignment: .leading, spacing: 12) {
                SectionHeader("Neu am Werktisch", number: number, subtitle: "Frisch begonnene und gezeigte Projekte") {
                    DiscoverMoreButton { router.open(.projectList(category: active, sort: "new")) }
                }
                if let first = p.fresh.first { ProjectCardView(project: first, style: .wide) }
                if p.fresh.count > 1 {
                    VStack(spacing: 0) {
                        ForEach(p.fresh.dropFirst()) { pr in
                            ProjectCardView(project: pr, style: .row).padding(.vertical, 10).hairline()
                        }
                    }
                    .padding(.horizontal, 14)
                    .cardSurface()
                }
            }
            .padding(.horizontal, Space.gutter)
        case .tutorials:
            VStack(alignment: .leading, spacing: 12) {
                SectionHeader("Anleitungen", number: number, subtitle: "Schritt für Schritt nachbauen") {
                    DiscoverMoreButton { router.open(.tutorialList(category: active)) }
                }
                ForEach(p.tutorials) { TutorialCardView(tutorial: $0) }
            }
            .padding(.horizontal, Space.gutter)
        case .posts:
            VStack(alignment: .leading, spacing: 12) {
                SectionHeader("Aus der Werkstatt", number: number, subtitle: "Beiträge aus \(activeCategory?.name ?? "dieser Kategorie")")
                ForEach(p.posts ?? []) { PostCardView(post: $0) }
            }
            .padding(.horizontal, Space.gutter)
        case .creators:
            VStack(alignment: .leading, spacing: 12) {
                SectionHeader("Creator", number: number, subtitle: "Menschen, deren Faden sich lohnt")
                VStack(spacing: 14) {
                    ForEach(p.creators) { c in
                        VStack(alignment: .leading, spacing: 6) {
                            CreatorRowView(creator: c)
                            if let bio = c.bio?.nilIfEmpty {
                                Text(bio).font(.footnote).foregroundStyle(Color.muted).lineLimit(2).padding(.leading, 56)
                            }
                        }
                        if c.id != p.creators.last?.id { Divider().overlay(Color.line) }
                    }
                }
                .padding(16)
                .cardSurface()
            }
            .padding(.horizontal, Space.gutter)
        case .communities:
            VStack(alignment: .leading, spacing: 12) {
                SectionHeader("Communities", number: number, subtitle: "Gemeinsam werken, fragen, zeigen") {
                    DiscoverMoreButton { router.open(.communities) }
                }
                ForEach(p.communities) { CommunityCardView(community: $0) }
            }
            .padding(.horizontal, Space.gutter)
        case .more:
            VStack(alignment: .leading, spacing: 12) {
                SectionHeader("Weiterstöbern", number: number)
                HStack(spacing: 12) {
                    moreCard("Magazin", text: "Erfahrungsberichte, Techniken und Hintergründe", symbol: "text.book.closed", tint: .clay) { router.open(.blogHome) }
                    moreCard("Materialien", text: "Garne, Hölzer, Farben – mit Sicherheitsinfos", symbol: "shippingbox", tint: .slate) { router.open(.materials) }
                }
            }
            .padding(.horizontal, Space.gutter)
        }
    }

    // MARK: Schnellzugriffe

    private var quickAccess: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                quick("Projekte", "hammer") { router.open(.projectList(category: active, sort: nil)) }
                quick("Anleitungen", "list.number") { router.open(.tutorialList(category: active)) }
                quick("Communities", "person.3") { router.open(.communities) }
                quick("Blogs", "text.book.closed") { router.open(.blogHome) }
                quick("Materialien", "shippingbox") { router.open(.materials) }
            }
            .padding(.horizontal, Space.gutter)
        }
    }

    private func quick(_ title: String, _ symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 10) {
                Image(systemName: symbol).font(.title3).foregroundStyle(Color.moss)
                Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(Color.ink)
            }
            .padding(14)
            .frame(minWidth: 116, alignment: .leading)
            .cardSurface(radius: 18)
        }
        .buttonStyle(.pressable)
        .accessibilityLabel(title)
    }

    // MARK: Kategorien-Raster

    private func categoryGrid(_ number: String) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(active == nil ? "Werkstätten" : "Andere Werkstätten", number: number, subtitle: "Jede Kategorie hat ihren eigenen Faden")
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                ForEach(categories) { c in
                    Button {
                        Haptics.selection()
                        if isRoot { router.open(.category(slug: c.slug)) } else { withAnimation(.snappy) { active = c.slug } }
                    } label: {
                        DiscoverCategoryTile(category: c, selected: c.slug == active)
                    }
                    .buttonStyle(.pressable)
                }
            }
        }
        .padding(.horizontal, Space.gutter)
    }

    // MARK: Kollektionen

    private func collections(_ list: [DiscoverCollection], number: String) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHeader("Kollektionen", number: number, subtitle: "Von der Redaktion zusammengestellt")
                .padding(.horizontal, Space.gutter)
            ForEach(list) { col in
                collectionCard(col)
            }
        }
    }

    private func collectionCard(_ col: DiscoverCollection) -> some View {
        let seasonal = col.isSeasonal == true
        let tint: Color = seasonal ? .clay : .moss
        return VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    Image(systemName: seasonal ? seasonSymbol(col.season) : "bookmark.square").font(.caption.weight(.semibold))
                    SpecLabel([col.kicker, col.season.map(seasonName)].compactMap { $0?.nilIfEmpty }.removingDuplicates().joined(separator: " · "), color: tint)
                }
                .foregroundStyle(tint)
                Text(col.title).font(.display(seasonal ? 28 : 22)).foregroundStyle(Color.ink)
                    .fixedSize(horizontal: false, vertical: true)
                if let d = col.description?.nilIfEmpty {
                    Text(d).font(.subheadline).foregroundStyle(Color.ink2).fixedSize(horizontal: false, vertical: true)
                }
                SpecLabel([col.projects.isEmpty ? nil : Fmt.plural(col.projects.count, "Projekt", "Projekte"), col.tutorials.isEmpty ? nil : Fmt.plural(col.tutorials.count, "Anleitung", "Anleitungen")].compactMap { $0 }.joined(separator: " · "))
            }
            .padding(.horizontal, Space.gutter)
            if !col.projects.isEmpty {
                DiscoverCarousel(items: col.projects, width: seasonal ? 210 : 176) { ProjectCardView(project: $0, style: .tile) }
            }
            if !col.tutorials.isEmpty {
                DiscoverCarousel(items: col.tutorials, width: 300) { TutorialCardView(tutorial: $0, compact: true) }
            }
        }
        .padding(.vertical, 20)
        .background(seasonal ? Color.claySoft.opacity(0.55) : Color.sunken.opacity(0.6))
        .overlay(alignment: .leading) {
            Rectangle().fill(tint).frame(width: 3)
        }
    }

    private func seasonSymbol(_ s: String?) -> String {
        switch s {
        case "winter": "snowflake"
        case "fruehling": "camera.macro"
        case "sommer": "sun.max"
        default: "leaf"
        }
    }

    private func moreCard(_ title: String, text: String, symbol: String, tint: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: symbol).font(.title2).foregroundStyle(tint)
                Text(title).font(.titleSerif).foregroundStyle(Color.ink)
                Text(text).font(.caption).foregroundStyle(Color.muted).multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .padding(14)
            .frame(maxWidth: .infinity, minHeight: 150, alignment: .topLeading)
            .background(tint.opacity(0.08), in: .rect(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Color.line, lineWidth: 0.75))
        }
        .buttonStyle(.pressable)
    }
}

private extension Array where Element == String {
    func removingDuplicates() -> [String] {
        var seen = Set<String>()
        return filter { seen.insert($0.lowercased()).inserted }
    }
}
