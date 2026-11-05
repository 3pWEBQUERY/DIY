import SwiftUI

/// Anleitungen: Schritt für Schritt zum eigenen Stück.
/// `GET /tutorials?category=&difficulty=&duration=&q=&sort=&cursor=`
struct TutorialListView: View {
    var category: String? = nil

    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router

    @State private var cat: String
    @State private var sortKey = "new"
    @State private var difficulty = 0
    @State private var duration = ""
    @State private var query = ""

    @State private var items: [TutorialCard] = []
    @State private var cursor: String?
    @State private var loading = true
    @State private var error: String?
    @State private var generation = 0

    init(category: String? = nil) {
        self.category = category
        _cat = State(initialValue: category ?? "")
    }

    private var filterKey: String { [cat, sortKey, "\(difficulty)", duration, query.trimmed].joined(separator: "|") }
    private var activeFilterCount: Int { (difficulty > 0 ? 1 : 0) + (duration.isEmpty ? 0 : 1) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                PageTitle(
                    kicker: "Werkstattbuch",
                    title: cat.isEmpty ? "Anleitungen" : "Anleitungen · \(app.categoryShort(cat))",
                    subtitle: "Schritt für Schritt nachbauen – mit Materialliste, Sicherheitshinweisen und deinem Fortschritt."
                )
                .padding(.horizontal, Space.gutter)

                ChipBar(items: [(value: "", label: "Alle")] + app.activeCategories.map { (value: $0.slug, label: $0.short) }, selection: $cat)

                ChipBar(items: [(value: "", label: "Jede Dauer")] + L.tutorialDurations.map { (value: $0.key, label: $0.label) }, selection: $duration)

                HStack(spacing: 8) {
                    SpecLabel(query.trimmed.isEmpty ? (ProjectsSorts.tutorials.first { $0.key == sortKey }?.label ?? "Neu") : "Treffer für «\(query.trimmed)»")
                    Spacer(minLength: 0)
                    if difficulty > 0 {
                        Button { withAnimation(.snappy) { difficulty = 0 } } label: {
                            HStack(spacing: 4) {
                                Text(L.difficulty[difficulty] ?? "").font(.caption.weight(.semibold))
                                Image(systemName: "xmark").font(.system(size: 8, weight: .bold))
                            }
                            .foregroundStyle(Color.ink)
                            .padding(.horizontal, 9).padding(.vertical, 5)
                            .background(Color.sunken, in: Capsule())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Filter Schwierigkeit entfernen")
                    }
                }
                .padding(.horizontal, Space.gutter)

                content
            }
            .padding(.top, 8)
            .padding(.bottom, 40)
        }
        .background(Color.paper)
        .scrollDismissesKeyboard(.immediately)
        .navigationTitle("Anleitungen")
        .toolbarTitleDisplayMode(.inline)
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .automatic), prompt: "Anleitungen durchsuchen …")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) { filterMenu }
            if app.isSignedIn {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { router.present(.tutorialEditor()) } label: { Image(systemName: "plus") }
                        .accessibilityLabel("Neue Anleitung")
                }
            }
        }
        .refreshable { await reload() }
        .task(id: filterKey) {
            if !query.isEmpty { try? await Task.sleep(for: .milliseconds(320)) }
            guard !Task.isCancelled else { return }
            await reload()
        }
    }

    @ViewBuilder private var content: some View {
        if loading && items.isEmpty {
            LoadingView(text: "Anleitungen werden geladen …")
        } else if let error, items.isEmpty {
            ErrorStateView(message: error) { await reload() }
        } else if items.isEmpty {
            EmptyStateView(
                symbol: "list.number",
                title: query.isEmpty ? "Noch keine Anleitungen" : "Keine Treffer",
                message: activeFilterCount > 0 || !query.isEmpty ? "Versuche andere Filter oder einen anderen Suchbegriff." : "Hast du ein Projekt, das andere nachbauen möchten? Schreib die erste Anleitung.",
                actionTitle: activeFilterCount > 0 || !query.isEmpty ? "Filter zurücksetzen" : (app.isSignedIn ? "Anleitung schreiben" : nil),
                action: {
                    if activeFilterCount > 0 || !query.isEmpty {
                        withAnimation(.snappy) { difficulty = 0; duration = ""; query = "" }
                    } else { router.present(.tutorialEditor()) }
                }
            )
        } else {
            LazyVStack(spacing: 12) {
                ForEach(items) { t in TutorialCardView(tutorial: t) }
            }
            .padding(.horizontal, Space.gutter)
            LoadMoreTrigger(hasMore: cursor != nil) { await loadMore() }
        }
    }

    private var filterMenu: some View {
        Menu {
            Picker("Sortierung", selection: $sortKey) {
                ForEach(ProjectsSorts.tutorials, id: \.key) { s in Text(s.label).tag(s.key) }
            }
            Menu("Schwierigkeit") {
                Picker("Schwierigkeit", selection: $difficulty) {
                    Text("Alle").tag(0)
                    ForEach(1...5, id: \.self) { d in Text(L.difficulty[d] ?? "\(d)").tag(d) }
                }
            }
            Menu("Dauer") {
                Picker("Dauer", selection: $duration) {
                    Text("Jede Dauer").tag("")
                    ForEach(L.tutorialDurations, id: \.key) { d in Text(d.label).tag(d.key) }
                }
            }
            if activeFilterCount > 0 {
                Divider()
                Button("Filter zurücksetzen", systemImage: "arrow.counterclockwise", role: .destructive) {
                    withAnimation(.snappy) { difficulty = 0; duration = "" }
                }
            }
        } label: {
            Image(systemName: activeFilterCount > 0 ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle")
        }
        .accessibilityLabel(activeFilterCount > 0 ? "Filter und Sortierung, \(activeFilterCount) aktiv" : "Filter und Sortierung")
    }

    private func params(cursor: String?) -> [String: String?] {
        [
            "category": cat.nilIfEmpty,
            "sort": sortKey,
            "difficulty": difficulty > 0 ? "\(difficulty)" : nil,
            "duration": duration.nilIfEmpty,
            "q": query.trimmed.nilIfEmpty,
            "cursor": cursor,
        ]
    }

    private func reload() async {
        generation += 1
        let gen = generation
        loading = true
        do {
            let page: Page<TutorialCard> = try await APIClient.shared.get("/tutorials", query: params(cursor: nil))
            guard gen == generation else { return }
            withAnimation(.snappy) { items = page.items; cursor = page.nextCursor; error = nil }
        } catch is CancellationError {
        } catch {
            guard gen == generation else { return }
            self.error = (error as? APIError)?.message ?? error.localizedDescription
            items = []
        }
        if gen == generation { loading = false }
    }

    private func loadMore() async {
        guard let c = cursor else { return }
        let gen = generation
        do {
            let page: Page<TutorialCard> = try await APIClient.shared.get("/tutorials", query: params(cursor: c))
            guard gen == generation else { return }
            let known = Set(items.map(\.id))
            items += page.items.filter { !known.contains($0.id) }
            cursor = page.nextCursor
        } catch {
            cursor = nil
            app.show(error: error)
        }
    }
}
