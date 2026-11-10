import SwiftUI

// MARK: - Suche (PRD §18, §18.4)

struct DiscoverSearchFilters: Equatable {
    var category: String?
    var difficulty: Int?
    var maxMinutes: Int?
    var priceMin = ""
    var priceMax = ""
    var free = false
    var country: String?
    var sinceDays: Int?

    var activeCount: Int {
        [category != nil, difficulty != nil, maxMinutes != nil, !priceMin.trimmed.isEmpty, !priceMax.trimmed.isEmpty, free, country != nil, sinceDays != nil].filter { $0 }.count
    }

    var query: [String: String?] {
        [
            "category": category,
            "difficulty": difficulty.map(String.init),
            "maxMinutes": maxMinutes.map(String.init),
            "priceMin": Fmt.parseMoney(priceMin).map(String.init),
            "priceMax": Fmt.parseMoney(priceMax).map(String.init),
            "free": free ? "true" : nil,
            "country": country,
            "sinceDays": sinceDays.map(String.init),
        ]
    }
}

struct SearchView: View {
    var initialQuery: String = ""

    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @AppStorage("werkuno.search.recent") private var recentRaw = ""

    @State private var localText = ""
    @State private var type: DiscoverSearchType?
    @State private var filters = DiscoverSearchFilters()
    @State private var showFilters = false
    @State private var response: DiscoverSearchResponse?
    @State private var loading = false
    @State private var error: String?
    @State private var lastKey = ""

    /// Wurzel des Such-Tabs teilt den Suchtext mit dem Router; gepushte Suchen haben eigenen Text.
    private var isShared: Bool { initialQuery.isEmpty }

    private var text: Binding<String> {
        isShared ? Binding(get: { router.searchText }, set: { router.searchText = $0 }) : $localText
    }

    private var q: String { text.wrappedValue.trimmed }

    private var recent: [String] { recentRaw.split(separator: "\n").map(String.init).filter { !$0.isEmpty } }

    private var key: String { "\(q)|\(type?.rawValue ?? "*")|\(filters.query.compactMap { k, v in v.map { "\(k)=\($0)" } }.sorted().joined(separator: "&"))" }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if q.count < 2 {
                    suggestions
                } else {
                    typeChips
                    if let error {
                        ErrorStateView(message: error) { await search(force: true) }
                    } else if let r = response, r.results != nil {
                        results(r)
                    } else {
                        LoadingView(text: "Wir suchen in allen Werkstätten …")
                    }
                }
            }
            .padding(.vertical, 12)
            .padding(.bottom, 30)
        }
        .scrollDismissesKeyboard(.immediately)
        .background(Color.paper)
        .navigationTitle(q.count >= 2 ? "„\(q)“" : "Suche")
        .navigationBarTitleDisplayMode(isShared ? .large : .inline)
        .searchable(text: text, placement: .automatic, prompt: "Technik, Material, Projekt oder Creator")
        .onSubmit(of: .search) { remember(q) }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showFilters = true } label: {
                    Image(systemName: "line.3.horizontal.decrease")
                        .overlay(alignment: .topTrailing) { DiscoverBadge(count: filters.activeCount).offset(x: 8, y: -8) }
                }
                .accessibilityLabel(filters.activeCount > 0 ? "Filter, \(filters.activeCount) aktiv" : "Filter")
            }
        }
        .sheet(isPresented: $showFilters) {
            DiscoverSearchFilterSheet(filters: $filters, type: type)
                .presentationDetents([.medium, .large])
        }
        .onAppear {
            if !initialQuery.isEmpty && localText.isEmpty { localText = initialQuery }
        }
        .task(id: key) {
            guard q.count >= 2 else { response = nil; error = nil; return }
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            await search(force: false)
        }
    }

    // MARK: Laden

    private func search(force: Bool) async {
        let k = key
        if !force && k == lastKey && response != nil { return }
        loading = true
        defer { loading = false }
        var query = filters.query
        query["q"] = q
        query["types"] = type?.rawValue ?? DiscoverSearchType.allCases.map(\.rawValue).joined(separator: ",")
        query["limit"] = type == nil ? "8" : "40"
        do {
            let r: DiscoverSearchResponse = try await APIClient.shared.get("/search", query: query)
            guard !Task.isCancelled else { return }
            withAnimation(.snappy) { response = r; error = nil }
            lastKey = k
        } catch is CancellationError {
        } catch {
            self.error = (error as? APIError)?.message ?? error.localizedDescription
        }
    }

    private func remember(_ term: String) {
        let t = term.trimmed
        guard t.count >= 2 else { return }
        var list = recent.filter { $0.lowercased() != t.lowercased() }
        list.insert(t, at: 0)
        recentRaw = list.prefix(8).joined(separator: "\n")
    }

    private func hits(_ t: DiscoverSearchType) -> [DiscoverSearchHit] { response?.results?[t.rawValue] ?? [] }
    private var total: Int { DiscoverSearchType.allCases.reduce(0) { $0 + hits($1).count } }

    // MARK: Typ-Chips

    private var typeChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            GlassEffectContainer(spacing: 6) {
                HStack(spacing: 6) {
                    chip(nil, "Alle", count: type == nil ? total : nil)
                    ForEach(DiscoverSearchType.allCases) { t in
                        chip(t, t.label, count: type == nil || type == t ? hits(t).count : nil)
                    }
                }
                .padding(.horizontal, Space.gutter)
                .padding(.vertical, 4)
            }
        }
    }

    private func chip(_ t: DiscoverSearchType?, _ label: String, count: Int?) -> some View {
        let on = type == t
        return Button {
            Haptics.selection()
            withAnimation(.snappy) { type = t }
        } label: {
            HStack(spacing: 5) {
                Text(label).font(.wr(.subheadline).weight(on ? .semibold : .regular))
                if let count, response != nil { Text("\(count)").font(.wr(.caption).monospacedDigit()).opacity(0.7) }
            }
            .foregroundStyle(on ? Color.paper : Color.ink)
            .padding(.horizontal, 13).padding(.vertical, 8)
        }
        .buttonStyle(.plain)
        .glassEffect(on ? .regular.tint(Color.action).interactive() : .regular.interactive(), in: Capsule())
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    // MARK: Ergebnisse

    @ViewBuilder private func results(_ r: DiscoverSearchResponse) -> some View {
        let shown = type.map { [$0] } ?? DiscoverSearchType.allCases
        let nonEmpty = shown.filter { !hits($0).isEmpty }
        if nonEmpty.isEmpty {
            noResults
        } else {
            VStack(alignment: .leading, spacing: 28) {
                if filters.activeCount > 0 { activeFilterBar }
                ForEach(nonEmpty) { t in group(t, r: r) }
            }
            .opacity(loading ? 0.6 : 1)
        }
    }

    @ViewBuilder private func group(_ t: DiscoverSearchType, r: DiscoverSearchResponse) -> some View {
        let list = hits(t)
        let limit = type == nil ? 4 : list.count
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(t.label, subtitle: Fmt.plural(list.count, "Treffer", "Treffer")) {
                if type == nil && list.count > limit {
                    DiscoverMoreButton(title: "Alle \(list.count)") { withAnimation(.snappy) { type = t } }
                }
            }
            switch t {
            case .project:
                let cards = (r.projectCards ?? []).filter { c in list.contains { $0.id == c.id } }
                if !cards.isEmpty {
                    AdaptiveGrid(spacing: 12, rowSpacing: 12) {
                        ForEach(cards.prefix(limit)) { c in
                            ProjectCardView(project: c, style: .tile).simultaneousGesture(TapGesture().onEnded { remember(q) })
                        }
                    }
                } else {
                    hitList(Array(list.prefix(limit)))
                }
            case .tutorial:
                let cards = (r.tutorialCards ?? []).filter { c in list.contains { $0.id == c.id } }
                if !cards.isEmpty {
                    ForEach(cards.prefix(limit)) { c in
                        TutorialCardView(tutorial: c).simultaneousGesture(TapGesture().onEnded { remember(q) })
                    }
                } else {
                    hitList(Array(list.prefix(limit)))
                }
            default:
                hitList(Array(list.prefix(limit)))
            }
        }
        .padding(.horizontal, Space.gutter)
    }

    private func hitList(_ list: [DiscoverSearchHit]) -> some View {
        VStack(spacing: 0) {
            ForEach(list) { h in
                DiscoverSearchHitRow(hit: h) { remember(q); router.open(href: h.href) }
                if h.id != list.last?.id { Divider().overlay(Color.line).padding(.leading, 70) }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 4)
        .cardSurface()
    }

    private var activeFilterBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "line.3.horizontal.decrease.circle.fill").foregroundStyle(Color.clay)
            Text(Fmt.plural(filters.activeCount, "Filter aktiv", "Filter aktiv")).font(.wr(.footnote, .medium))
            Spacer()
            Button("Zurücksetzen") { withAnimation { filters = DiscoverSearchFilters() } }.font(.wr(.footnote, .semibold))
        }
        .padding(12)
        .background(Color.claySoft, in: .rect(cornerRadius: Radius.inner, style: .continuous))
        .padding(.horizontal, Space.gutter)
    }

    // MARK: Keine Treffer (§18.4)

    private var noResults: some View {
        VStack(alignment: .leading, spacing: 16) {
            EmptyStateView(
                symbol: "magnifyingglass",
                title: "Keine Treffer für „\(q)“",
                message: type.map { "Unter \($0.label) haben wir nichts gefunden." } ?? "Wir haben in Projekten, Anleitungen, Produkten, Mitgliedern, Artikeln, Communities und Beiträgen gesucht."
            )
            VStack(alignment: .leading, spacing: 10) {
                SpecLabel("So findest du eher etwas")
                tip("textformat.abc", "Prüfe die Schreibweise oder nutze ein allgemeineres Wort – z. B. „Decke“ statt „Granny-Square-Decke“.")
                tip("square.stack.3d.up", "Suche nach Material oder Technik: „Arve“, „Leinen“, „Raku“.")
                if type != nil {
                    Button { withAnimation { type = nil } } label: { Label("In allen Bereichen suchen", systemImage: "rectangle.stack") }
                        .buttonStyle(.glass)
                }
                if filters.activeCount > 0 {
                    Button { withAnimation { filters = DiscoverSearchFilters() } } label: { Label("Filter zurücksetzen (\(filters.activeCount))", systemImage: "xmark.circle") }
                        .buttonStyle(.glass)
                }
            }
            .padding(16)
            .cardSurface()
            .padding(.horizontal, Space.gutter)
            categoryChips(title: "Oder stöbere in einer Werkstatt")
        }
    }

    private func tip(_ symbol: String, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: symbol).foregroundStyle(Color.moss).frame(width: 20)
            Text(text).font(.wr(.footnote)).foregroundStyle(Color.ink2).fixedSize(horizontal: false, vertical: true)
        }
    }

    // MARK: Vorschläge (Leerzustand)

    private var suggestions: some View {
        VStack(alignment: .leading, spacing: 26) {
            if !recent.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    SectionHeader("Zuletzt gesucht") {
                        Button("Löschen") { withAnimation { recentRaw = "" } }.font(.wr(.footnote, .semibold)).foregroundStyle(Color.muted)
                    }
                    VStack(spacing: 0) {
                        ForEach(recent, id: \.self) { term in
                            HStack(spacing: 12) {
                                Button {
                                    text.wrappedValue = term
                                } label: {
                                    HStack(spacing: 12) {
                                        Image(systemName: "clock.arrow.circlepath").foregroundStyle(Color.muted)
                                        Text(term).foregroundStyle(Color.ink)
                                        Spacer()
                                    }
                                    .frame(minHeight: 44)
                                    .contentShape(.rect)
                                }
                                .buttonStyle(.plain)
                                Button {
                                    withAnimation { recentRaw = recent.filter { $0 != term }.joined(separator: "\n") }
                                } label: { Image(systemName: "xmark").font(.wr(.caption)).foregroundStyle(Color.muted).frame(width: 44, height: 44) }
                                .buttonStyle(.plain)
                                .accessibilityLabel("\(term) entfernen")
                            }
                            .hairline()
                        }
                    }
                }
                .padding(.horizontal, Space.gutter)
            }
            categoryChips(title: "Werkstätten")
            VStack(alignment: .leading, spacing: 10) {
                SectionHeader("Direkt zu")
                AdaptiveGrid(spacing: 10, rowSpacing: 10) {
                    shortcut("Projekte", "hammer") { router.open(.projectList(category: nil, sort: nil)) }
                    shortcut("Anleitungen", "list.number") { router.open(.tutorialList(category: nil)) }
                    shortcut("Communities", "person.3") { router.open(.communities) }
                    shortcut("Blogs", "text.book.closed") { router.open(.blogHome) }
                    shortcut("Materialien", "shippingbox") { router.open(.materials) }
                    shortcut("Markt", "bag.fill") { router.tab = .market }
                }
            }
            .padding(.horizontal, Space.gutter)
            if q.count == 1 {
                Text("Tippe mindestens zwei Zeichen, damit wir suchen können.").font(.wr(.footnote)).foregroundStyle(Color.muted)
                    .padding(.horizontal, Space.gutter)
            }
        }
    }

    private func categoryChips(title: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(title)
            FlowLayout(spacing: 8, lineSpacing: 8) {
                ForEach(app.activeCategories) { c in
                    Button { router.open(.category(slug: c.slug)) } label: {
                        HStack(spacing: 6) {
                            Image(systemName: CategoryPalette.symbol(for: c.glyph)).foregroundStyle(CategoryPalette.color(for: c.slug))
                            Text(c.short).foregroundStyle(Color.ink)
                        }
                        .font(.wr(.subheadline))
                        .padding(.horizontal, 12).padding(.vertical, 9)
                        .background(CategoryPalette.soft(for: c.slug), in: Capsule())
                    }
                    .buttonStyle(.pressable)
                    .accessibilityLabel(c.name)
                }
            }
        }
        .padding(.horizontal, Space.gutter)
    }

    private func shortcut(_ title: String, _ symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: symbol).foregroundStyle(Color.moss).frame(width: 22)
                Text(title).font(.wr(.subheadline, .medium)).foregroundStyle(Color.ink)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 50)
            .cardSurface(radius: 16)
        }
        .buttonStyle(.pressable)
    }
}

// MARK: - Treffer-Zeile

struct DiscoverSearchHitRow: View {
    var hit: DiscoverSearchHit
    var action: () -> Void
    @Environment(AppState.self) private var app

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                thumb
                VStack(alignment: .leading, spacing: 3) {
                    Text(hit.title).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink).a11yLineLimit(2).multilineTextAlignment(.leading)
                    if let s = subtitle { Text(s).font(.wr(.caption)).foregroundStyle(Color.muted).a11yLineLimit(2).multilineTextAlignment(.leading) }
                }
                Spacer(minLength: 0)
                if let price = hit.meta?["priceMinor"]?.int {
                    Text(Fmt.money(price, currency: hit.meta?["currency"]?.string)).font(.wr(.subheadline, .semibold)).monospacedDigit().foregroundStyle(Color.ink)
                } else {
                    Image(systemName: "chevron.right").font(.wr(.caption)).foregroundStyle(Color.lineStrong)
                }
            }
            .padding(.vertical, 10)
            .contentShape(.rect)
        }
        .buttonStyle(.pressable)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private var thumb: some View {
        switch hit.type {
        case "user":
            AvatarView(url: hit.cover, name: hit.title, size: 46)
        case "post":
            Image(systemName: "text.bubble").font(.wr(.title3)).foregroundStyle(Color.moss)
                .frame(width: 46, height: 46).background(Color.mossSoft, in: .rect(cornerRadius: Radius.small, style: .continuous))
        default:
            CoverView(url: hit.cover, seed: hit.id, category: hit.category, showLabel: false)
                .frame(width: 46, height: 46)
                .clipShape(.rect(cornerRadius: Radius.small, style: .continuous))
        }
    }

    private var subtitle: String? {
        var parts: [String] = []
        if let s = hit.subtitle?.nilIfEmpty { parts.append(s) }
        if hit.type == "community", let c = hit.category { parts.append(app.categoryShort(c)) }
        if let dek = hit.meta?["dek"]?.string?.nilIfEmpty { parts.append(dek) }
        if let bio = hit.meta?["bio"]?.string?.nilIfEmpty { parts.append(bio) }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}

// MARK: - Filter-Sheet

struct DiscoverSearchFilterSheet: View {
    @Binding var filters: DiscoverSearchFilters
    var type: DiscoverSearchType?
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var draft = DiscoverSearchFilters()

    private let durations: [(Int, String)] = [(30, "Bis 30 Min."), (120, "Bis 2 Std."), (480, "Bis 8 Std."), (2880, "Bis 2 Tage")]
    private let periods: [(Int, String)] = [(7, "Letzte 7 Tage"), (30, "Letzte 30 Tage"), (365, "Letztes Jahr")]

    var body: some View {
        NavigationStack {
            Form {
                Section("Kategorie") {
                    Picker("Kategorie", selection: $draft.category) {
                        Text("Alle").tag(String?.none)
                        ForEach(app.activeCategories) { c in Text(c.name).tag(Optional(c.slug)) }
                    }
                }
                if type == nil || type == .project || type == .tutorial {
                    Section {
                        Picker("Schwierigkeit", selection: $draft.difficulty) {
                            Text("Egal").tag(Int?.none)
                            ForEach(1...5, id: \.self) { d in Text(L.difficulty[d] ?? "\(d)").tag(Optional(d)) }
                        }
                        Picker("Dauer", selection: $draft.maxMinutes) {
                            Text("Egal").tag(Int?.none)
                            ForEach(durations, id: \.0) { d in Text(d.1).tag(Optional(d.0)) }
                        }
                    } header: { Text("Projekte & Anleitungen") }
                }
                if type == nil || type == .product || type == .tutorial {
                    Section {
                        HStack {
                            TextField("Ab CHF", text: $draft.priceMin).keyboardType(.decimalPad)
                            Text("–").foregroundStyle(Color.muted)
                            TextField("Bis CHF", text: $draft.priceMax).keyboardType(.decimalPad)
                        }
                        Toggle("Nur kostenlose Anleitungen", isOn: $draft.free)
                        Picker("Versand aus", selection: $draft.country) {
                            Text("Egal").tag(String?.none)
                            ForEach(L.shipCountries, id: \.key) { c in Text(c.label).tag(Optional(c.key)) }
                        }
                    } header: { Text("Preis & Herkunft") } footer: { Text("Der Preis gilt für Produkte im Markt.") }
                }
                Section("Zeitraum") {
                    Picker("Veröffentlicht", selection: $draft.sinceDays) {
                        Text("Jederzeit").tag(Int?.none)
                        ForEach(periods, id: \.0) { p in Text(p.1).tag(Optional(p.0)) }
                    }
                }
                if draft.activeCount > 0 {
                    Section {
                        Button("Alle Filter zurücksetzen", role: .destructive) { draft = DiscoverSearchFilters() }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Color.paper)
            .navigationTitle("Filter")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Anwenden") { filters = draft; dismiss() }.fontWeight(.semibold)
                }
            }
            .onAppear { draft = filters }
        }
    }
}
