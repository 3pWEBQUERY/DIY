import SwiftUI

/// Werkverzeichnis: alle Projekte mit Kategorie, Sortierung, Schwierigkeit, Status und Suche.
/// `GET /projects?category=&sort=&difficulty=&status=&hasTutorial=&q=&cursor=`
struct ProjectListView: View {
    var category: String? = nil
    var sort: String? = nil

    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router

    @State private var cat = ""
    @State private var sortKey = "new"
    @State private var difficulty = 0
    @State private var status = ""
    @State private var withTutorial = false
    @State private var query = ""

    @State private var items: [ProjectCard] = []
    @State private var cursor: String?
    @State private var loading = true
    @State private var error: String?
    @State private var generation = 0

    init(category: String? = nil, sort: String? = nil) {
        self.category = category
        self.sort = sort
        _cat = State(initialValue: category ?? "")
        _sortKey = State(initialValue: ProjectsSorts.normalize(sort))
    }

    private let columns = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]

    private var filterKey: String { [cat, sortKey, "\(difficulty)", status, "\(withTutorial)", query.trimmed].joined(separator: "|") }
    private var activeFilterCount: Int { (difficulty > 0 ? 1 : 0) + (status.isEmpty ? 0 : 1) + (withTutorial ? 1 : 0) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                PageTitle(
                    kicker: "Werkverzeichnis",
                    title: cat.isEmpty ? "Projekte" : app.categoryName(cat),
                    subtitle: "Vom ersten Skizzenstrich bis zum fertigen Stück. Jedes Projekt ist ein Faden: Journal, Materialliste, Anleitung und Nachbauten hängen daran."
                )
                .padding(.horizontal, Space.gutter)

                ChipBar(items: [(value: "", label: "Alle")] + app.activeCategories.map { (value: $0.slug, label: $0.short) }, selection: $cat)

                filterSummary.padding(.horizontal, Space.gutter)

                content
            }
            .padding(.top, 8)
            .padding(.bottom, 40)
        }
        .background(Color.paper)
        .scrollDismissesKeyboard(.immediately)
        .navigationTitle("Projekte")
        .toolbarTitleDisplayMode(.inline)
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .automatic), prompt: "Projekte durchsuchen …")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) { filterMenu }
            if app.isSignedIn {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { router.present(.projectEditor()) } label: { Image(systemName: "plus") }
                        .accessibilityLabel("Neues Projekt")
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

    // MARK: Inhalt

    @ViewBuilder private var content: some View {
        if loading && items.isEmpty {
            LoadingView(text: "Projekte werden geladen …")
        } else if let error, items.isEmpty {
            ErrorStateView(message: error) { await reload() }
        } else if items.isEmpty {
            EmptyStateView(
                symbol: "point.3.connected.trianglepath.dotted",
                title: query.isEmpty ? "Noch keine Projekte" : "Keine Treffer",
                message: query.isEmpty && activeFilterCount == 0 ? "Hier ist noch alles leer. Fang deinen eigenen Faden an." : "Versuche andere Filter oder einen anderen Suchbegriff.",
                actionTitle: activeFilterCount > 0 || !query.isEmpty ? "Filter zurücksetzen" : (app.isSignedIn ? "Projekt anlegen" : nil),
                action: {
                    if activeFilterCount > 0 || !query.isEmpty { resetFilters() } else { router.present(.projectEditor()) }
                }
            )
        } else {
            LazyVGrid(columns: columns, spacing: 14) {
                ForEach(items) { p in ProjectCardView(project: p, style: .tile) }
            }
            .padding(.horizontal, Space.gutter)
            LoadMoreTrigger(hasMore: cursor != nil) { await loadMore() }
        }
    }

    private var filterSummary: some View {
        HStack(spacing: 8) {
            SpecLabel(query.trimmed.isEmpty ? (ProjectsSorts.projects.first { $0.key == sortKey }?.label ?? "Neu") : "Treffer für «\(query.trimmed)»")
            Spacer(minLength: 0)
            if difficulty > 0 { removablePill(L.difficulty[difficulty] ?? "") { difficulty = 0 } }
            if !status.isEmpty { removablePill(L.projectStatus(status)) { status = "" } }
            if withTutorial { removablePill("Mit Anleitung") { withTutorial = false } }
        }
    }

    private func removablePill(_ text: String, remove: @escaping () -> Void) -> some View {
        Button { withAnimation(.snappy) { remove() } } label: {
            HStack(spacing: 4) {
                Text(text).font(.caption.weight(.semibold))
                Image(systemName: "xmark").font(.system(size: 8, weight: .bold))
            }
            .foregroundStyle(Color.ink)
            .padding(.horizontal, 9).padding(.vertical, 5)
            .background(Color.sunken, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Filter \(text) entfernen")
    }

    private var filterMenu: some View {
        Menu {
            Picker("Sortierung", selection: $sortKey) {
                ForEach(ProjectsSorts.projects, id: \.key) { s in Text(s.label).tag(s.key) }
            }
            Menu("Schwierigkeit") {
                Picker("Schwierigkeit", selection: $difficulty) {
                    Text("Alle").tag(0)
                    ForEach(1...5, id: \.self) { d in Text(L.difficulty[d] ?? "\(d)").tag(d) }
                }
            }
            if sortKey != "completed" {
                Menu("Status") {
                    Picker("Status", selection: $status) {
                        Text("Alle").tag("")
                        ForEach(L.projectStatus.filter { $0.key != "ARCHIVED" }, id: \.key) { s in
                            Label(s.label, systemImage: ProjectsStatusStyle.symbol(s.key)).tag(s.key)
                        }
                    }
                }
            }
            Toggle("Mit Anleitung", systemImage: "list.number", isOn: $withTutorial)
            if activeFilterCount > 0 {
                Divider()
                Button("Filter zurücksetzen", systemImage: "arrow.counterclockwise", role: .destructive) { resetFilters() }
            }
        } label: {
            Image(systemName: activeFilterCount > 0 ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle")
        }
        .accessibilityLabel(activeFilterCount > 0 ? "Filter und Sortierung, \(activeFilterCount) aktiv" : "Filter und Sortierung")
    }

    private func resetFilters() {
        withAnimation(.snappy) { difficulty = 0; status = ""; withTutorial = false; query = "" }
    }

    // MARK: Laden

    private func params(cursor: String?) -> [String: String?] {
        [
            "category": cat.nilIfEmpty,
            "sort": sortKey,
            "difficulty": difficulty > 0 ? "\(difficulty)" : nil,
            "status": sortKey == "completed" ? nil : status.nilIfEmpty,
            "hasTutorial": withTutorial ? "true" : nil,
            "q": query.trimmed.nilIfEmpty,
            "cursor": cursor,
        ]
    }

    private func reload() async {
        generation += 1
        let gen = generation
        loading = true
        do {
            let page: Page<ProjectCard> = try await APIClient.shared.get("/projects", query: params(cursor: nil))
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
            let page: Page<ProjectCard> = try await APIClient.shared.get("/projects", query: params(cursor: c))
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
