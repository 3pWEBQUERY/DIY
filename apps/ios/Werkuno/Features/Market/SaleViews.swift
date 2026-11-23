import SwiftUI

// MARK: - Modell (Produktkarte, Produktseite, Shop, Warenkorb)

/// Laufende Shop-Aktion (Creator Pro). Der Server liefert Preise bereits mit Aktionsrabatt;
/// `regularMinor` bzw. `regularUnitMinor` ist der reguläre Preis zum Durchstreichen.
struct MarketSale: Codable, Hashable, Sendable {
    var id: String?
    var title: String
    var percent: Int
    var endsAt: Date
    /// Produktkarte/-seite: regulärer Grundpreis (Währung der Betrachter:in)
    var regularMinor: Int?
    /// Warenkorb: regulärer Stückpreis
    var regularUnitMinor: Int?
    /// Produktseite: regulärer Aufpreis je Variante
    var regularDeltas: [String: Int]?
    /// Shopseite: gilt für alle Arbeiten
    var allProducts: Bool?
    /// Produktseite: gilt für die betrachtende Person (nicht für den Shop selbst)
    var appliesToBuyer: Bool?

    var isRunning: Bool { endsAt > .now }
}

// MARK: - Bausteine

/// Ruhiger Countdown („noch 2 T 4 Std“), aktualisiert sich jede halbe Minute
struct SaleCountdownText: View {
    var endsAt: Date
    var prefix: String = "noch "

    var body: some View {
        TimelineView(.periodic(from: .now, by: 30)) { ctx in
            Text(label(now: ctx.date))
                .monospacedDigit()
        }
    }

    private func label(now: Date) -> String {
        let min = max(0, Int(endsAt.timeIntervalSince(now) / 60))
        if endsAt <= now { return "beendet" }
        let d = min / 1440, h = (min % 1440) / 60, m = min % 60
        if d > 0 { return "\(prefix)\(d) T \(h) Std" }
        if h > 0 { return "\(prefix)\(h) Std \(m) Min" }
        return "\(prefix)\(Swift.max(1, m)) Min"
    }
}

/// „−20 %“ als kleine, gefüllte Marke
struct SaleBadge: View {
    var percent: Int
    var body: some View {
        Text("−\(percent) %")
            .font(.wr(.caption, .bold)).monospacedDigit()
            .foregroundStyle(Color.paper)
            .padding(.horizontal, 7).padding(.vertical, 3)
            .background(Color.clay, in: .rect(cornerRadius: 6, style: .continuous))
            .accessibilityLabel("Aktion, \(percent) Prozent Rabatt")
    }
}

/// Aktionspreis mit durchgestrichenem regulärem Preis
struct SalePriceText: View {
    var priceMinor: Int
    var regularMinor: Int?
    var currency: String?
    var font: Font = .wr(.subheadline, .bold)

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(Fmt.money(priceMinor, currency: currency)).font(font).monospacedDigit().foregroundStyle(Color.clay)
            if let r = regularMinor, r > priceMinor {
                Text(Fmt.money(r, currency: currency))
                    .font(.wr(.caption)).monospacedDigit().strikethrough().foregroundStyle(Color.muted)
                    .accessibilityLabel("statt \(Fmt.money(r, currency: currency))")
            }
        }
    }
}

/// Banner auf der Shopseite
struct SaleBannerView: View {
    var sale: MarketSale
    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            SaleBadge(percent: sale.percent)
            VStack(alignment: .leading, spacing: 2) {
                Text(sale.title).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink)
                Text(sale.allProducts == false ? "Auf ausgewählte Arbeiten. Nicht mit Gutscheinen und Sets kombinierbar." : "Auf alle Arbeiten. Nicht mit Gutscheinen und Sets kombinierbar.")
                    .font(.wr(.caption)).foregroundStyle(Color.ink2).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 8)
            Label { SaleCountdownText(endsAt: sale.endsAt) } icon: { Image(systemName: "timer") }
                .font(.wr(.caption, .semibold)).foregroundStyle(Color.clay)
        }
        .padding(14)
        .background(Color.clay.opacity(0.08), in: .rect(cornerRadius: Radius.inner, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radius.inner, style: .continuous).strokeBorder(Color.clay.opacity(0.3)))
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Studio: Aktionen (GET /studio/sales)

struct StudioSaleList: Decodable {
    struct Shop: Decodable { var id: String; var currency: String?; var status: String? }
    struct Product: Decodable, Identifiable, Hashable { var id: String; var title: String; var priceMinor: Int; var status: String? }
    var pro: Bool
    var shop: Shop
    var maxDays: Int?
    var products: [Product]
    var sales: [StudioSale]
}

struct StudioSale: Decodable, Identifiable, Hashable {
    var id: String
    var title: String
    var percent: Int
    var startsAt: Date
    var endsAt: Date
    var productIds: [String]
    var active: Bool
    /// SCHEDULED | RUNNING | ENDED | PAUSED
    var status: String

    var statusLabel: (String, Color) {
        switch status {
        case "RUNNING": ("Läuft", .moss)
        case "SCHEDULED": ("Geplant", .warn)
        case "PAUSED": ("Pausiert", .muted)
        default: ("Beendet", .muted)
        }
    }
}

enum SaleEditTarget: Identifiable {
    case new
    case edit(StudioSale)
    var id: String {
        switch self {
        case .new: "new"
        case .edit(let s): s.id
        }
    }
    var sale: StudioSale? {
        if case .edit(let s) = self { return s }
        return nil
    }
}

/// Werkuno Studio → Aktionen: zeitlich begrenzte Rabatte mit Countdown (Creator Pro), wie /studio/aktionen im Web.
struct StudioSalesView: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router

    @State private var data: StudioSaleList?
    @State private var error: String?
    @State private var editing: SaleEditTarget?
    @State private var confirmEnd: StudioSale?
    @State private var confirmDelete: StudioSale?

    var body: some View {
        content
            .background(Color.paper)
            .navigationTitle("Aktionen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if data?.pro == true {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { editing = .new } label: { Image(systemName: "plus") }
                            .accessibilityLabel("Neue Aktion")
                    }
                }
            }
            .task { await load() }
            .refreshable { await load() }
            .sheet(item: $editing, onDismiss: { Task { await load() } }) { target in
                if let d = data { StudioSaleEditor(sale: target.sale, products: d.products, currency: d.shop.currency ?? "CHF", maxDays: d.maxDays ?? 30) }
            }
            .confirmationDialog("Aktion beenden?", isPresented: Binding(get: { confirmEnd != nil }, set: { if !$0 { confirmEnd = nil } }), titleVisibility: .visible, presenting: confirmEnd) { s in
                Button("„\(s.title)“ beenden", role: .destructive) { Task { await end(s) } }
            } message: { _ in
                Text("Ab sofort gelten wieder die regulären Preise. Bezahlte Bestellungen behalten den Aktionspreis.")
            }
            .confirmationDialog("Aktion löschen?", isPresented: Binding(get: { confirmDelete != nil }, set: { if !$0 { confirmDelete = nil } }), titleVisibility: .visible, presenting: confirmDelete) { s in
                Button("„\(s.title)“ löschen", role: .destructive) { Task { await delete(s) } }
            }
    }

    @ViewBuilder private var content: some View {
        if app.me?.shop == nil {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    header
                    MarketNoShopCTA()
                }
                .padding(.horizontal, Space.gutter)
                .padding(.bottom, 40)
            }
        } else if data == nil && error == nil {
            LoadingView()
        } else if let error, data == nil {
            ErrorStateView(message: error) { await load() }
        } else if let data {
            list(data)
        }
    }

    private var header: some View {
        PageTitle(kicker: "Werkuno Studio", title: "Aktionen", subtitle: "Zeitlich begrenzte Rabatte mit Countdown.")
    }

    private var proNotice: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Aktionen wie „−20 % bis Sonntag“ gehören zu Creator Pro – mit Countdown, automatisch ein und aus.")
                .font(.wr(.subheadline)).foregroundStyle(Color.ink2).fixedSize(horizontal: false, vertical: true)
            Button("Creator Pro ansehen") { router.open(.creatorPro) }
                .buttonStyle(.glassProminent).tint(.moss)
        }
    }

    private func list(_ d: StudioSaleList) -> some View {
        List {
            Section {
                header.listRowInsets(EdgeInsets()).listRowBackground(Color.clear).listRowSeparator(.hidden)
                if !d.pro {
                    proNotice.listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 12, trailing: 0)).listRowBackground(Color.clear).listRowSeparator(.hidden)
                }
                Text("Der Rabatt senkt den Stückpreis während der Aktion. Aktionsartikel sind von Gutscheinen und Sets ausgenommen; digitale Produkte behalten in der App den regulären App-Preis.")
                    .font(.wr(.footnote)).foregroundStyle(Color.muted)
                    .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 8, trailing: 0))
                    .listRowBackground(Color.clear).listRowSeparator(.hidden)
            }
            if d.sales.isEmpty {
                Section {
                    EmptyStateView(symbol: "timer", title: "Noch keine Aktionen", message: "Zum Beispiel „Herbst-Aktion: −20 % bis Sonntag“ auf den ganzen Shop oder ausgewählte Arbeiten.", actionTitle: d.pro ? "Erste Aktion anlegen" : nil) { editing = .new }
                        .listRowInsets(EdgeInsets()).listRowBackground(Color.clear).listRowSeparator(.hidden)
                }
            } else {
                Section {
                    ForEach(d.sales) { s in row(s, d) }
                } header: {
                    SpecLabel(Fmt.plural(d.sales.count, "Aktion", "Aktionen"))
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .contentMargins(.horizontal, Space.gutter, for: .scrollContent)
    }

    private func row(_ s: StudioSale, _ d: StudioSaleList) -> some View {
        StudioSaleRow(sale: s, productTitles: d.products)
            .contentShape(.rect)
            .onTapGesture { if d.pro && s.status != "ENDED" { editing = .edit(s) } }
            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                if s.status == "RUNNING" || s.status == "SCHEDULED" {
                    Button(s.status == "RUNNING" ? "Beenden" : "Absagen", systemImage: "stop.circle") { confirmEnd = s }.tint(.warn)
                }
                if s.status != "RUNNING" {
                    Button("Löschen", systemImage: "trash", role: .destructive) { confirmDelete = s }
                }
            }
            .listRowBackground(Color.paper)
            .listRowInsets(EdgeInsets(top: 10, leading: 0, bottom: 10, trailing: 0))
    }

    private func load() async {
        guard app.me?.shop != nil else { return }
        do {
            let d: StudioSaleList = try await APIClient.shared.get("/studio/sales")
            withAnimation(.smooth) { data = d }
            error = nil
        } catch is CancellationError {
        } catch {
            self.error = (error as? APIError)?.message ?? error.localizedDescription
        }
    }

    private func end(_ s: StudioSale) async {
        await app.run("Aktion beendet.") {
            _ = try await APIClient.shared.post("/studio/sales/\(s.id)/end") as JSONValue
        }
        await load()
    }

    private func delete(_ s: StudioSale) async {
        await app.run("Aktion gelöscht.") {
            _ = try await APIClient.shared.delete("/studio/sales/\(s.id)") as JSONValue
        }
        await load()
    }
}

struct StudioSaleRow: View {
    var sale: StudioSale
    var productTitles: [StudioSaleList.Product]

    private var scope: String {
        guard !sale.productIds.isEmpty else { return "ganzer Shop" }
        let names = sale.productIds.prefix(3).map { id in productTitles.first { $0.id == id }?.title ?? "Entfernt" }
        return "\(Fmt.plural(sale.productIds.count, "Arbeit", "Arbeiten")): \(names.joined(separator: ", "))\(sale.productIds.count > 3 ? " …" : "")"
    }

    var body: some View {
        let st = sale.statusLabel
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text(sale.title).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink)
                MarketStatusPill(label: st.0, tint: st.1)
                Spacer(minLength: 8)
                Text("−\(sale.percent) %").font(.wr(.subheadline, .bold)).monospacedDigit().foregroundStyle(Color.clay)
            }
            Text(scope).font(.wr(.footnote)).foregroundStyle(Color.muted).lineLimit(1)
            HStack(spacing: 6) {
                Text("\(Fmt.dateTime(sale.startsAt)) – \(Fmt.dateTime(sale.endsAt))")
                if sale.status == "RUNNING" {
                    Text("·")
                    SaleCountdownText(endsAt: sale.endsAt).foregroundStyle(Color.clay)
                }
            }
            .font(.wr(.caption)).monospacedDigit().foregroundStyle(Color.ink2)
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Bearbeiten

/// Anlegen/Bearbeiten einer Aktion. Laufende Aktionen: nur Titel und Ende änderbar (wie im Web).
struct StudioSaleEditor: View {
    var sale: StudioSale?
    var products: [StudioSaleList.Product]
    var currency: String
    var maxDays: Int

    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var percent = "20"
    @State private var startsAt = Date.now
    @State private var endsAt = Calendar.current.date(byAdding: .day, value: 3, to: .now) ?? .now
    @State private var allProducts = true
    @State private var picked: Set<String> = []
    @State private var fields: [String: String] = [:]
    @State private var formError: String?
    @State private var saving = false
    @State private var applied = false

    static let minPercent = 5
    static let maxPercent = 70

    private var running: Bool { sale?.status == "RUNNING" }

    var body: some View {
        NavigationStack {
            form
                .navigationTitle(sale == nil ? "Neue Aktion" : (running ? "Ende ändern" : "Aktion bearbeiten"))
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) {
                        Button { Task { await save() } } label: {
                            if saving { ProgressView() } else { Text("Speichern").fontWeight(.semibold) }
                        }
                        .disabled(saving || title.trimmed.count < 3)
                    }
                }
                .onAppear(perform: apply)
        }
        .interactiveDismissDisabled(saving)
    }

    private var form: some View {
        Form {
            if let formError {
                Section { NoticeView(tone: .danger, message: formError).listRowInsets(EdgeInsets()).listRowBackground(Color.clear) }
            }
            basicsSection
            periodSection
            productsSection
            previewSection
        }
        .scrollContentBackground(.hidden)
        .background(Color.paper)
    }

    private var basicsSection: some View {
        Section {
            TextField("z. B. Herbst-Aktion", text: $title)
            MarketFieldError(text: fields["title"])
            HStack {
                Text("Rabatt")
                Spacer()
                TextField("20", text: $percent).keyboardType(.numberPad).multilineTextAlignment(.trailing).frame(maxWidth: 70).disabled(running)
                Text("%").foregroundStyle(Color.muted)
            }
            MarketFieldError(text: fields["percent"])
        } header: { Group { Text("Aktion") }.font(.wr(.footnote, .semibold)) } footer: {
            Group { Text(running ? "Bei einer laufenden Aktion bleiben Rabatt, Beginn und Arbeiten fest." : "\(Self.minPercent)–\(Self.maxPercent) %. Der Titel ist für Käufer:innen sichtbar.") }.font(.wr(.footnote))
        }
    }

    private var periodSection: some View {
        Section {
            DatePicker("Beginn", selection: $startsAt).disabled(running)
            DatePicker("Ende", selection: $endsAt, in: startsAt...)
            MarketFieldError(text: fields["startsAt"] ?? fields["endsAt"])
        } header: { Group { Text("Zeitraum") }.font(.wr(.footnote, .semibold)) } footer: {
            Group { Text("Höchstens \(maxDays) Tage. Die Aktion startet und endet automatisch.") }.font(.wr(.footnote))
        }
    }

    private var productsSection: some View {
        Section {
            Toggle("Ganzer Shop", isOn: $allProducts.animation()).disabled(running)
            if !allProducts {
                ForEach(products) { p in productToggle(p) }
            }
            MarketFieldError(text: fields["productIds"])
        } header: { Group { Text("Gilt für") }.font(.wr(.footnote, .semibold)) }
    }

    private func productToggle(_ p: StudioSaleList.Product) -> some View {
        Toggle(isOn: Binding(get: { picked.contains(p.id) }, set: { on in if on { picked.insert(p.id) } else { picked.remove(p.id) } })) {
            HStack {
                Text(p.title).lineLimit(1)
                Spacer()
                Text(Fmt.money(p.priceMinor, currency: currency)).font(.wr(.footnote)).monospacedDigit().foregroundStyle(Color.muted)
            }
        }
        .disabled(running)
    }

    @ViewBuilder private var previewSection: some View {
        let pct = Int(percent.trimmed) ?? 0
        let list = (allProducts ? products.filter { $0.status == "ACTIVE" } : products.filter { picked.contains($0.id) }).prefix(5)
        if pct >= Self.minPercent && pct <= Self.maxPercent && !list.isEmpty {
            Section {
                ForEach(Array(list)) { p in
                    HStack {
                        Text(p.title).lineLimit(1)
                        Spacer()
                        SalePriceText(priceMinor: Self.salePrice(p.priceMinor, pct), regularMinor: p.priceMinor, currency: currency, font: .wr(.footnote, .semibold))
                    }
                }
            } header: { Group { Text("Vorschau") }.font(.wr(.footnote, .semibold)) }
        }
    }

    /// Wie `salePrice` in packages/shared: auf 10 Rappen/Cent gerundet, nie unter 10
    static func salePrice(_ unit: Int, _ pct: Int) -> Int {
        guard pct > 0, unit > 0 else { return unit }
        let raw = Double(unit) * Double(100 - pct) / 100
        return min(unit, max(10, Int((raw / 10).rounded()) * 10))
    }

    private func apply() {
        guard !applied else { return }
        applied = true
        guard let s = sale else { return }
        title = s.title
        percent = String(s.percent)
        startsAt = s.startsAt
        endsAt = s.endsAt
        allProducts = s.productIds.isEmpty
        picked = Set(s.productIds)
    }

    private func save() async {
        formError = nil
        var e: [String: String] = [:]
        let pct = Int(percent.trimmed) ?? 0
        if pct < Self.minPercent || pct > Self.maxPercent { e["percent"] = "Ganze Prozent von \(Self.minPercent) bis \(Self.maxPercent)" }
        if !allProducts && picked.isEmpty { e["productIds"] = "Wähle mindestens eine Arbeit oder den ganzen Shop" }
        if endsAt <= startsAt { e["endsAt"] = "Das Ende muss nach dem Beginn liegen" }
        fields = e
        guard e.isEmpty else { Haptics.warning(); return }
        saving = true
        defer { saving = false }
        let input: [String: JSONValue] = [
            "title": .string(title.trimmed),
            "percent": .number(Double(pct)),
            "startsAt": .string(JSON.isoFormatter.string(from: startsAt)),
            "endsAt": .string(JSON.isoFormatter.string(from: endsAt)),
            "productIds": .array(allProducts ? [] : picked.sorted().map { JSONValue.string($0) }),
            "active": .bool(true),
        ]
        do {
            if let s = sale {
                _ = try await APIClient.shared.put("/studio/sales/\(s.id)", input) as JSONValue
            } else {
                _ = try await APIClient.shared.post("/studio/sales", input) as JSONValue
            }
            Haptics.success()
            app.show(sale == nil ? "Aktion angelegt." : "Aktion gespeichert.")
            dismiss()
        } catch let err as APIError {
            fields = err.fields ?? [:]
            formError = (err.fields?.isEmpty ?? true) ? err.message : nil
            Haptics.warning()
        } catch {
            formError = error.localizedDescription
        }
    }
}

/// Warenkorb: „statt CHF 85.00 · −20 % Herbst-Aktion · noch 2 T 4 Std“
struct CartSaleLine: View {
    var sale: MarketSale
    var currency: String?
    var body: some View {
        HStack(spacing: 4) {
            if let r = sale.regularUnitMinor {
                Text("statt")
                Text(Fmt.money(r, currency: currency)).strikethrough()
                Text("·")
            }
            Text("−\(sale.percent) % \(sale.title) ·").foregroundStyle(Color.clay)
            SaleCountdownText(endsAt: sale.endsAt).foregroundStyle(Color.clay)
        }
        .font(.wr(.caption2)).monospacedDigit().foregroundStyle(Color.muted)
        .lineLimit(1)
        .minimumScaleFactor(0.8)
        .accessibilityElement(children: .combine)
    }
}
