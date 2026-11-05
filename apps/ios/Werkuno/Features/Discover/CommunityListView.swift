import SwiftUI

// MARK: - Communities-Verzeichnis (PRD §15)

struct CommunityListView: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router

    @State private var home: CommunityHome?
    @State private var error: String?
    @State private var query = ""
    @State private var category: String?
    @State private var results: [CommunityCard] = []
    @State private var cursor: String?
    @State private var searching = false
    @State private var searched = false

    private var isFiltering: Bool { query.trimmed.count >= 2 || category != nil }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                PageTitle(kicker: "Gemeinsam werken", title: "Communities", subtitle: "Treffpunkte für Fragen, Challenges und gemeinsame Projekte – lokal und online.")
                    .padding(.horizontal, Space.gutter)
                DiscoverSearchField(prompt: "Community suchen", text: $query)
                    .padding(.horizontal, Space.gutter)
                DiscoverCategoryChips(categories: app.activeCategories, selection: $category)
                if isFiltering {
                    filtered
                } else if let home {
                    homeContent(home)
                } else if let error {
                    ErrorStateView(message: error) { await loadHome() }
                } else {
                    LoadingView()
                }
            }
            .padding(.vertical, 12)
            .padding(.bottom, 90)
        }
        .scrollDismissesKeyboard(.immediately)
        .background(Color.paper)
        .navigationTitle("Communities")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { router.present(.communityEditor()) } label: { Image(systemName: "plus") }
                    .accessibilityLabel("Community gründen")
            }
        }
        .safeAreaInset(edge: .bottom) {
            if app.isSignedIn {
                Button { router.present(.communityEditor()) } label: {
                    Label("Community gründen", systemImage: "person.3.sequence")
                        .font(.wr(.body, .semibold))
                        .padding(.horizontal, 10)
                }
                .buttonStyle(.glassProminent)
                .tint(.moss)
                .controlSize(.large)
                .padding(.bottom, 8)
            }
        }
        .refreshable { await loadHome(); if isFiltering { await search(reset: true) } }
        .task { if home == nil { await loadHome() } }
        .task(id: "\(query.trimmed)|\(category ?? "")") {
            guard isFiltering else { results = []; searched = false; return }
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            await search(reset: true)
        }
        .reloadWhenSheetCloses { await loadHome() }
    }

    private func loadHome() async {
        do {
            let h: CommunityHome = try await APIClient.shared.get("/communities/home")
            withAnimation(.snappy) { home = h; error = nil }
        } catch is CancellationError {
        } catch {
            if home == nil { self.error = (error as? APIError)?.message ?? error.localizedDescription }
        }
    }

    private func search(reset: Bool) async {
        searching = true
        defer { searching = false }
        do {
            let q = query.trimmed.count >= 2 ? query.trimmed : nil
            let p: Page<CommunityCard> = try await APIClient.shared.get("/communities", query: ["q": q, "category": category, "cursor": reset ? nil : cursor])
            withAnimation(.snappy) { results = reset ? p.items : results + p.items }
            cursor = p.nextCursor
            searched = true
        } catch is CancellationError {
        } catch { app.show(error: error) }
    }

    // MARK: Gefiltert

    @ViewBuilder private var filtered: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !searched {
                LoadingView()
            } else if results.isEmpty {
                EmptyStateView(symbol: "person.3", title: "Keine Community gefunden", message: "Versuche einen anderen Begriff oder eine andere Kategorie – oder gründe selbst eine.", actionTitle: "Community gründen") {
                    router.present(.communityEditor())
                }
            } else {
                SpecLabel(Fmt.plural(results.count, "Community", "Communities"))
                ForEach(results) { CommunityCardView(community: $0) }
                LoadMoreTrigger(hasMore: cursor != nil) { await search(reset: false) }
            }
        }
        .padding(.horizontal, Space.gutter)
    }

    // MARK: Übersicht

    @ViewBuilder private func homeContent(_ h: CommunityHome) -> some View {
        VStack(alignment: .leading, spacing: 30) {
            if !h.invites.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    SectionHeader("Einladungen", subtitle: "Du wurdest eingeladen")
                    ForEach(h.invites) { c in inviteRow(c) }
                }
                .padding(.horizontal, Space.gutter)
            }
            if !h.mine.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    SectionHeader("Meine Communities", number: "01")
                    DiscoverCarousel(items: h.mine, width: 260) { c in mineCard(c) }
                }
            }
            if !h.featured.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    SectionHeader("Hervorgehoben", number: "02", subtitle: "Von der Redaktion empfohlen")
                    ForEach(h.featured) { CommunityCardView(community: $0) }
                }
                .padding(.horizontal, Space.gutter)
            }
            let groups = grouped(h.all)
            if groups.isEmpty && h.featured.isEmpty && h.mine.isEmpty {
                EmptyStateView(symbol: "person.3", title: "Noch keine Communities", message: "Sei die erste Person, die eine Community gründet.", actionTitle: "Community gründen") {
                    router.present(.communityEditor())
                }
            }
            ForEach(Array(groups.enumerated()), id: \.element.slug) { i, g in
                VStack(alignment: .leading, spacing: 12) {
                    SectionHeader(app.categoryName(g.slug), number: String(format: "%02d", i + 3), subtitle: Fmt.plural(g.items.count, "Community", "Communities")) {
                        DiscoverMoreButton(title: "Filtern") { withAnimation { category = g.slug } }
                    }
                    ForEach(g.items) { CommunityCardView(community: $0) }
                }
                .padding(.horizontal, Space.gutter)
            }
        }
    }

    private func grouped(_ all: [CommunityCard]) -> [(slug: String, items: [CommunityCard])] {
        var order: [String] = []
        var map: [String: [CommunityCard]] = [:]
        for c in all {
            let k = c.category ?? "andere"
            if map[k] == nil { order.append(k) }
            map[k, default: []].append(c)
        }
        let catOrder = app.categories.map(\.slug)
        order.sort { (catOrder.firstIndex(of: $0) ?? 999) < (catOrder.firstIndex(of: $1) ?? 999) }
        return order.map { ($0, map[$0] ?? []) }
    }

    private func mineCard(_ c: CommunityCard) -> some View {
        Button { router.open(.community(slug: c.slug)) } label: {
            VStack(alignment: .leading, spacing: 0) {
                CoverView(url: c.coverUrl, seed: c.id, category: c.category)
                    .frame(height: 120)
                VStack(alignment: .leading, spacing: 4) {
                    Text(c.name).font(.wr(.headline)).foregroundStyle(Color.ink).lineLimit(1)
                    Text([app.categoryShort(c.category), c.region].compactMap { $0?.nilIfEmpty }.joined(separator: " · "))
                        .font(.wr(.caption)).foregroundStyle(Color.muted).lineLimit(1)
                    SpecLabel(Fmt.plural(c.memberCount ?? 0, "Mitglied", "Mitglieder"))
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .cardSurface()
            .clipShape(.rect(cornerRadius: Radius.card, style: .continuous))
        }
        .buttonStyle(.pressable)
        .accessibilityElement(children: .combine)
    }

    private func inviteRow(_ c: CommunityCard) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            CommunityCardView(community: c)
            HStack(spacing: 10) {
                AsyncButton {
                    if await app.run("Willkommen in \(c.name)!", { _ = try await APIClient.shared.post("/communities/\(c.id)/join") as CommunityJoinResult }) {
                        await loadHome()
                    }
                } label: { Text("Annehmen").frame(maxWidth: .infinity) }
                .buttonStyle(.glassProminent).tint(.moss)
                AsyncButton {
                    if await app.run("Einladung abgelehnt.", { _ = try await APIClient.shared.post("/communities/\(c.id)/leave") as CommunityJoinResult }) {
                        await loadHome()
                    }
                } label: { Text("Ablehnen").frame(maxWidth: .infinity) }
                .buttonStyle(.glass)
            }
        }
    }
}
