import SwiftUI

/// Filter des Marktplatzes – gleiche Schlüssel wie Web `/markt` (`parseProductFilters`).
struct MarketFilters: Equatable {
    var q = ""
    var category = ""
    var kind = ""
    var uniqueOnly = false
    var min = ""
    var max = ""
    var shipsFrom = ""
    var sort = "neu"

    static let sorts: [(key: String, label: String)] = [
        ("neu", "Neueste zuerst"), ("preis-auf", "Preis aufsteigend"), ("preis-ab", "Preis absteigend"),
        ("beliebt", "Am häufigsten gemerkt"), ("bewertet", "Am besten bewertet"),
    ]

    var query: [String: String?] {
        [
            "q": q.trimmed.nilIfEmpty,
            "kategorie": category.nilIfEmpty,
            "art": uniqueOnly ? nil : kind.nilIfEmpty,
            "unikat": uniqueOnly ? "1" : nil,
            "min": Self.number(min),
            "max": Self.number(max),
            "versand": shipsFrom.nilIfEmpty,
            "sort": sort == "neu" ? nil : sort,
        ]
    }

    /// Anzahl gesetzter Filter ausser Suche, Kategorie und Sortierung (für das Filter-Symbol)
    var sheetCount: Int { [uniqueOnly || !kind.isEmpty, !min.isEmpty || !max.isEmpty, !shipsFrom.isEmpty].filter { $0 }.count }
    var isFiltered: Bool { !q.trimmed.isEmpty || !category.isEmpty || sheetCount > 0 }

    private static func number(_ s: String) -> String? {
        let t = s.replacingOccurrences(of: ",", with: ".").trimmed
        guard let d = Double(t), d >= 0 else { return nil }
        return d == d.rounded() ? String(Int(d)) : String(format: "%.2f", d)
    }
}

/// Tab „Markt“ – ruhig, redaktionell, Community zuerst (PRD §1.4, UI-03).
struct MarketView: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router

    @State private var filters = MarketFilters()
    @State private var searchText = ""
    @State private var products: [ProductCard] = []
    @State private var cursor: String?
    @State private var shops: [ShopCard] = []
    @State private var homeCategories: [Category] = []
    @State private var payments: MarketPayments?
    @State private var loading = true
    @State private var error: String?
    @State private var showFilters = false

    private let columns = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]

    private var categories: [Category] { homeCategories.isEmpty ? app.activeCategories : homeCategories.filter { $0.isActive != false } }
    private var activeCategory: Category? { categories.first { $0.slug == filters.category } ?? app.category(filters.category.nilIfEmpty) }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                header
                    .padding(.horizontal, Space.gutter)
                    .padding(.top, 8)
                ChipBar(items: [("", "Alles")] + categories.map { ($0.slug, $0.short) }, selection: $filters.category)
                    .padding(.vertical, 14)
                VStack(alignment: .leading, spacing: 18) {
                    if (payments?.mode ?? app.paymentsMode) == "disabled" {
                        NoticeView(tone: .warn, title: "Zahlungen noch nicht aktiviert", message: "Du kannst bereits stöbern und Arbeiten merken. Bestellungen sind in Kürze möglich.")
                    }
                    activeChips
                    productGrid
                    if !filters.isFiltered && !shops.isEmpty { shopCarousel }
                    footerNote
                }
                .padding(.horizontal, Space.gutter)
                .padding(.bottom, 40)
            }
        }
        .scrollDismissesKeyboard(.immediately)
        .background(Color.paper)
        .navigationTitle("Markt")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $searchText, placement: .navigationBarDrawer(displayMode: .automatic), prompt: "Korb, Wollset, Schneidebrett …")
        .onSubmit(of: .search) { filters.q = searchText }
        .onChange(of: searchText) { _, v in if v.isEmpty && !filters.q.isEmpty { filters.q = "" } }
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button { router.open(.orders) } label: { Image(systemName: "shippingbox") }
                    .accessibilityLabel("Meine Bestellungen")
            }
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button { showFilters = true } label: {
                    Image(systemName: filters.sheetCount > 0 ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle")
                }
                .accessibilityLabel(filters.sheetCount > 0 ? "Filter (\(filters.sheetCount) aktiv)" : "Filter")
                MarketCartToolbarButton()
            }
        }
        .sheet(isPresented: $showFilters) {
            MarketFilterSheet(filters: $filters)
        }
        .task { await loadHome() }
        .task(id: filters) { await loadProducts(reset: true) }
        .refreshable {
            await loadHome()
            await loadProducts(reset: true)
            await app.refreshCounts()
        }
    }

    // MARK: Kopf

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Rectangle().fill(Color.lineStrong).frame(width: 22, height: 1)
                SpecLabel("Marktplatz", color: .moss)
            }
            Text(activeCategory?.name ?? "Gemacht von Menschen, deren Werkbank du kennst.")
                .font(.display(30))
                .foregroundStyle(Color.ink)
                .fixedSize(horizontal: false, vertical: true)
                .contentTransition(.opacity)
                .accessibilityAddTraits(.isHeader)
            Text("Einzelstücke, Kleinserien, DIY-Materialsets und Anleitungen – direkt aus der Community. Viele Arbeiten zeigen ihr Projekt: Du siehst, wie sie entstanden sind.")
                .font(.wr(.subheadline))
                .foregroundStyle(Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.bottom, 4)
    }

    // MARK: Aktive Filter

    @ViewBuilder private var activeChips: some View {
        let chips = chipList
        HStack(alignment: .firstTextBaseline) {
            if chips.isEmpty {
                SpecLabel("Alle Arbeiten")
            } else {
                FlowLayout(spacing: 6, lineSpacing: 6) {
                    ForEach(chips, id: \.label) { c in
                        Button {
                            Haptics.tap()
                            withAnimation(.snappy) { c.clear() }
                        } label: {
                            HStack(spacing: 5) {
                                Text(c.label).font(.wr(.footnote, .medium))
                                Image(systemName: "xmark").font(.wr(.caption2, .bold)).foregroundStyle(Color.muted)
                            }
                            .foregroundStyle(Color.ink)
                            .padding(.horizontal, 10).padding(.vertical, 6)
                            .background(Color.card, in: Capsule())
                            .overlay(Capsule().strokeBorder(Color.lineStrong, lineWidth: 0.75))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Filter \(c.label) entfernen")
                    }
                }
            }
            Spacer(minLength: 8)
        }
        SpecLabel("\(MarketFilters.sorts.first { $0.key == filters.sort }?.label ?? "Neueste zuerst") · keine gesponserten Platzierungen")
    }

    private struct Chip { var label: String; var clear: () -> Void }

    private var chipList: [Chip] {
        var c: [Chip] = []
        if !filters.q.trimmed.isEmpty { c.append(Chip(label: "„\(filters.q.trimmed)“") { filters.q = ""; searchText = "" }) }
        if let cat = activeCategory, !filters.category.isEmpty { c.append(Chip(label: cat.name) { filters.category = "" }) }
        if filters.uniqueOnly { c.append(Chip(label: "Nur Einzelstücke") { filters.uniqueOnly = false }) }
        else if !filters.kind.isEmpty { c.append(Chip(label: L.productKind(filters.kind)) { filters.kind = "" }) }
        if !filters.min.isEmpty || !filters.max.isEmpty {
            c.append(Chip(label: "CHF \(filters.min.nilIfEmpty ?? "0")–\(filters.max.nilIfEmpty ?? "∞")") { filters.min = ""; filters.max = "" })
        }
        if !filters.shipsFrom.isEmpty {
            c.append(Chip(label: "Versand ab \(L.shipCountries.first { $0.key == filters.shipsFrom }?.label ?? filters.shipsFrom)") { filters.shipsFrom = "" })
        }
        return c
    }

    // MARK: Raster

    @ViewBuilder private var productGrid: some View {
        if loading && products.isEmpty {
            LoadingView(text: "Arbeiten werden geladen …")
        } else if let error, products.isEmpty {
            ErrorStateView(message: error) { await loadProducts(reset: true) }
        } else if products.isEmpty {
            EmptyStateView(
                symbol: "bag.fill",
                title: filters.isFiltered ? "Nichts gefunden" : "Noch keine Arbeiten",
                message: filters.isFiltered ? "Mit diesen Filtern gibt es gerade keine Arbeiten. Lockere die Auswahl oder versuche es mit einem anderen Begriff." : "Sobald Shops ihre ersten Stücke anbieten, erscheinen sie hier.",
                actionTitle: filters.isFiltered ? "Filter zurücksetzen" : nil,
                action: filters.isFiltered ? { withAnimation { filters = MarketFilters(); searchText = "" } } : nil
            )
            .cardSurface()
        } else {
            LazyVGrid(columns: columns, spacing: 12) {
                ForEach(products) { p in ProductCardView(product: p) }
            }
            LoadMoreTrigger(hasMore: cursor != nil) { await loadProducts(reset: false) }
        }
    }

    // MARK: Shops

    private var shopCarousel: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader("Shops entdecken", number: "02", subtitle: "Nach Aktivität und Bewertungen – keine bezahlten Platzierungen.")
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(shops) { s in MarketShopCardView(shop: s) }
                }
                .padding(.vertical, 2)
            }
            .scrollClipDisabled()
        }
        .padding(.top, 14)
    }

    private var footerNote: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Transparent einkaufen").font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink)
            Text("Du zahlst den angezeigten Endpreis plus Versand – keine Zusatzgebühren für Käufer:innen. Shops geben eine Plattformprovision von \(Fmt.percent(bps: payments?.feeBps ?? app.feeBps)) auf den Warenwert ab. Bezahlt wird über einen geprüften Zahlungsanbieter.")
                .font(.wr(.footnote)).foregroundStyle(Color.muted)
                .fixedSize(horizontal: false, vertical: true)
            if app.hasActiveShop {
                Button { router.open(.studioSection(.products)) } label: { Label("Meine Produkte verwalten", systemImage: "tag") }
                    .buttonStyle(.glass).controlSize(.small).padding(.top, 2)
            } else if app.me?.shop == nil {
                Button { router.present(.shopWizard) } label: { Label("Selbst verkaufen", systemImage: "storefront") }
                    .buttonStyle(.glass).controlSize(.small).padding(.top, 2)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .sunkenSurface(radius: Radius.card)
        .padding(.top, 10)
    }

    // MARK: Laden

    private func loadHome() async {
        do {
            let h: MarketHome = try await APIClient.shared.get("/market/home")
            withAnimation(.smooth) {
                shops = h.shops
                payments = h.payments
                homeCategories = h.categories ?? []
            }
        } catch {
            if !(error is CancellationError) && products.isEmpty { self.error = (error as? APIError)?.message }
        }
    }

    private func loadProducts(reset: Bool) async {
        if reset { loading = true; cursor = nil }
        defer { loading = false }
        var q = filters.query
        q["cursor"] = reset ? nil : cursor
        do {
            let page: Page<ProductCard> = try await APIClient.shared.get("/market/products", query: q)
            withAnimation(.smooth(duration: 0.3)) {
                if reset { products = page.items } else { products += page.items.filter { n in !products.contains { $0.id == n.id } } }
            }
            cursor = page.nextCursor
            error = nil
        } catch is CancellationError {
        } catch {
            if (error as? URLError)?.code == .cancelled { return }
            self.error = (error as? APIError)?.message ?? error.localizedDescription
            if !reset { cursor = nil }
        }
    }
}

// MARK: - Filter-Sheet

struct MarketFilterSheet: View {
    @Binding var filters: MarketFilters
    @State private var draft = MarketFilters()
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var app

    var body: some View {
        NavigationStack {
            Form {
                Section("Art") {
                    Toggle("Nur Einzelstücke", isOn: $draft.uniqueOnly.animation())
                    if !draft.uniqueOnly {
                        Picker("Art", selection: $draft.kind) {
                            Text("Alle Arten").tag("")
                            ForEach(L.productKind, id: \.key) { k in Text(k.label).tag(k.key) }
                        }
                    }
                }
                Section {
                    HStack {
                        TextField("Von", text: $draft.min).keyboardType(.decimalPad)
                        Text("–").foregroundStyle(Color.muted)
                        TextField("Bis", text: $draft.max).keyboardType(.decimalPad)
                    }
                } header: { Text("Preisbereich (CHF)") } footer: { Text("Leer lassen für keine Grenze.") }
                Section("Versand ab") {
                    Picker("Land", selection: $draft.shipsFrom) {
                        Text("Alle Länder").tag("")
                        ForEach(L.shipCountries, id: \.key) { c in Text(c.label).tag(c.key) }
                    }
                }
                Section("Kategorie") {
                    Picker("Kategorie", selection: $draft.category) {
                        Text("Alle Kategorien").tag("")
                        ForEach(app.activeCategories) { c in Text(c.name).tag(c.slug) }
                    }
                }
                Section("Sortierung") {
                    Picker("Sortieren nach", selection: $draft.sort) {
                        ForEach(MarketFilters.sorts, id: \.key) { s in Text(s.label).tag(s.key) }
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
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
                ToolbarItem(placement: .bottomBar) {
                    Button("Zurücksetzen", role: .destructive) {
                        withAnimation { draft = MarketFilters(q: draft.q) }
                    }
                }
            }
            .onAppear { draft = filters }
        }
        .presentationDetents([.large])
    }
}
