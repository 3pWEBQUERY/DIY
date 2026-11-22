import SwiftUI

// MARK: - Modelle (GET /studio/coupons)

struct StudioCouponList: Decodable {
    struct Shop: Decodable { var id: String; var currency: String?; var status: String? }
    var shop: Shop
    var coupons: [StudioCoupon]
}

struct StudioCoupon: Decodable, Identifiable, Hashable {
    struct Stats: Decodable, Hashable { var orders: Int; var discountMinor: Int }
    var id: String
    var code: String
    var kind: String // PERCENT | FIXED
    var value: Int
    var minSubtotalMinor: Int
    var startsAt: Date?
    var endsAt: Date?
    var maxUses: Int?
    var usedCount: Int
    var onePerBuyer: Bool
    var active: Bool
    var stats: Stats?

    var isPercent: Bool { kind == "PERCENT" }

    /// Status wie im Web (Pausiert, Abgelaufen, Vergeben, Geplant, Aktiv)
    func state(now: Date = .now) -> (label: String, tint: Color) {
        if !active { return ("Pausiert", .muted) }
        if let e = endsAt, e < now { return ("Abgelaufen", .muted) }
        if let m = maxUses, usedCount >= m { return ("Vergeben", .muted) }
        if let s = startsAt, s > now { return ("Geplant", .warn) }
        return ("Aktiv", .moss)
    }

    var shareable: Bool { let l = state().label; return l == "Aktiv" || l == "Geplant" }
}

// MARK: - Liste

/// Werkuno Studio → Gutscheine: Codes des eigenen Shops mit Status und Einlösungen,
/// Anlegen und Bearbeiten im Blatt, Pausieren und Löschen (wie /studio/rabatte im Web).
struct StudioCouponsView: View {
    @Environment(AppState.self) private var app

    @State private var data: StudioCouponList?
    @State private var error: String?
    @State private var editing: CouponEditTarget?
    @State private var confirmDelete: StudioCoupon?

    private var currency: String { data?.shop.currency ?? "CHF" }

    var body: some View {
        content
            .background(Color.paper)
            .navigationTitle("Gutscheine")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if data != nil {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { editing = .new } label: { Image(systemName: "plus") }
                            .accessibilityLabel("Neuer Gutschein")
                    }
                }
            }
            .task { await load() }
            .refreshable { await load() }
            .sheet(item: $editing, onDismiss: { Task { await load() } }) { target in
                StudioCouponEditor(coupon: target.coupon, currency: currency)
            }
            .confirmationDialog(
                "Gutschein löschen?",
                isPresented: Binding(get: { confirmDelete != nil }, set: { if !$0 { confirmDelete = nil } }),
                titleVisibility: .visible,
                presenting: confirmDelete
            ) { c in
                Button("\(c.code) löschen", role: .destructive) { Task { await delete(c) } }
            } message: { _ in
                Text("Der Code kann danach nicht mehr eingelöst werden. Bisherige Bestellungen behalten ihren Rabatt.")
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
        PageTitle(kicker: "Werkuno Studio", title: "Gutscheine", subtitle: "Rabattcodes für Aktionen in deinem Shop.")
    }

    private func list(_ d: StudioCouponList) -> some View {
        List {
            Section {
                header.listRowInsets(EdgeInsets()).listRowBackground(Color.clear).listRowSeparator(.hidden)
                Text("Ein Code gilt für den Warenwert in deinem Shop, nicht für den Versand. Den Rabatt trägst du; die Plattformgebühr wird auf den Betrag nach Rabatt berechnet.")
                    .font(.wr(.footnote)).foregroundStyle(Color.muted)
                    .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 8, trailing: 0))
                    .listRowBackground(Color.clear).listRowSeparator(.hidden)
            }
            if d.coupons.isEmpty {
                Section {
                    EmptyStateView(symbol: "ticket", title: "Noch keine Gutscheine", message: "Zum Beispiel HERBST10 für 10 % auf alles oder WILLKOMMEN für \(Fmt.money(500, currency: currency)) ab einem Warenwert von \(Fmt.money(4000, currency: currency)).", actionTitle: "Ersten Gutschein anlegen") { editing = .new }
                        .listRowInsets(EdgeInsets()).listRowBackground(Color.clear).listRowSeparator(.hidden)
                }
            } else {
                Section {
                    ForEach(d.coupons) { c in
                        StudioCouponRow(coupon: c, currency: currency)
                            .contentShape(.rect)
                            .onTapGesture { editing = .edit(c) }
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                Button("Löschen", systemImage: "trash", role: .destructive) { confirmDelete = c }
                                Button(c.active ? "Pausieren" : "Aktivieren", systemImage: c.active ? "pause.circle" : "play.circle") { Task { await setActive(c, !c.active) } }
                                    .tint(c.active ? .warn : .moss)
                            }
                            .contextMenu { menu(c) }
                            .listRowBackground(Color.paper)
                            .listRowInsets(EdgeInsets(top: 10, leading: 0, bottom: 10, trailing: 0))
                    }
                } header: {
                    SpecLabel(Fmt.plural(d.coupons.count, "Gutschein", "Gutscheine"))
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .contentMargins(.horizontal, Space.gutter, for: .scrollContent)
    }

    @ViewBuilder private func menu(_ c: StudioCoupon) -> some View {
        Button("Bearbeiten", systemImage: "pencil") { editing = .edit(c) }
        Button("Code kopieren", systemImage: "doc.on.doc") {
            UIPasteboard.general.string = c.code
            app.show("\(c.code) kopiert.")
        }
        if c.shareable {
            ShareLink(item: AppConfig.webURL("/gutschein/\(c.id)"), message: Text(shareText(c))) {
                Label("Teilen", systemImage: "square.and.arrow.up")
            }
        }
        Button(c.active ? "Pausieren" : "Aktivieren", systemImage: c.active ? "pause.circle" : "play.circle") { Task { await setActive(c, !c.active) } }
        Divider()
        Button("Löschen", systemImage: "trash", role: .destructive) { confirmDelete = c }
    }

    private func shareText(_ c: StudioCoupon) -> String {
        let value = c.isPercent ? "\(c.value) %" : Fmt.money(c.value, currency: currency)
        let min = c.minSubtotalMinor > 0 ? " (ab \(Fmt.money(c.minSubtotalMinor, currency: currency)) Warenwert)" : ""
        let shop = app.me?.shop?.name ?? "meinen Shop"
        return "Gutschein für \(shop): Mit dem Code \(c.code) bekommst du \(value) Rabatt auf deinen Einkauf\(min). Einfach im Warenkorb eingeben."
    }

    private func load() async {
        guard app.me?.shop != nil else { return }
        do {
            let d: StudioCouponList = try await APIClient.shared.get("/studio/coupons")
            withAnimation(.smooth) { data = d }
            error = nil
        } catch is CancellationError {
        } catch {
            self.error = (error as? APIError)?.message ?? error.localizedDescription
        }
    }

    private func setActive(_ c: StudioCoupon, _ active: Bool) async {
        await app.run(active ? "Gutschein aktiviert." : "Gutschein pausiert.") {
            _ = try await APIClient.shared.post("/studio/coupons/\(c.id)/active", ["active": JSONValue.bool(active)]) as JSONValue
        }
        await load()
    }

    private func delete(_ c: StudioCoupon) async {
        await app.run("Gutschein gelöscht.") {
            _ = try await APIClient.shared.delete("/studio/coupons/\(c.id)") as JSONValue
        }
        await load()
    }
}

enum CouponEditTarget: Identifiable {
    case new
    case edit(StudioCoupon)
    var id: String {
        switch self {
        case .new: "new"
        case .edit(let c): c.id
        }
    }
    var coupon: StudioCoupon? {
        if case .edit(let c) = self { return c }
        return nil
    }
}

// MARK: - Zeile

struct StudioCouponRow: View {
    var coupon: StudioCoupon
    var currency: String

    private var conditions: String {
        var parts: [String] = []
        if coupon.minSubtotalMinor > 0 { parts.append("ab \(Fmt.money(coupon.minSubtotalMinor, currency: currency))") }
        var period: [String] = []
        if let s = coupon.startsAt { period.append("ab \(Fmt.date(s))") }
        if let e = coupon.endsAt { period.append("bis \(Fmt.date(e))") }
        if !period.isEmpty { parts.append(period.joined(separator: " ")) }
        if coupon.onePerBuyer { parts.append("1× je Konto") }
        return parts.isEmpty ? "ohne Bedingungen" : parts.joined(separator: " · ")
    }

    private var valueText: String {
        coupon.isPercent ? "\(coupon.value) %" : Fmt.money(coupon.value, currency: currency)
    }

    private var usesText: String {
        if let m = coupon.maxUses { return "\(coupon.usedCount) / \(m) eingelöst" }
        return "\(coupon.usedCount) eingelöst"
    }

    var body: some View {
        let st = coupon.state()
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text(coupon.code).font(.system(.subheadline, design: .monospaced, weight: .semibold)).foregroundStyle(Color.ink)
                MarketStatusPill(label: st.label, tint: st.tint)
                Spacer(minLength: 8)
                Text(valueText).font(.wr(.subheadline, .semibold)).monospacedDigit().foregroundStyle(Color.ink)
            }
            Text(conditions).font(.wr(.footnote)).foregroundStyle(Color.muted)
            HStack(spacing: 6) {
                Text(usesText)
                if let s = coupon.stats, s.orders > 0 {
                    Text("·")
                    Text("−\(Fmt.money(s.discountMinor, currency: currency)) in \(Fmt.plural(s.orders, "Bestellung", "Bestellungen"))")
                }
            }
            .font(.wr(.caption)).monospacedDigit().foregroundStyle(Color.ink2)
        }
        .accessibilityElement(children: .combine)
        .accessibilityHint("Tippen zum Bearbeiten, wischen zum Pausieren oder Löschen")
    }
}

// MARK: - Bearbeiten

/// Anlegen/Bearbeiten eines Gutscheins. Prüft vorab wie das Web; der Server prüft verbindlich (Feldfehler).
struct StudioCouponEditor: View {
    var coupon: StudioCoupon?
    var currency: String

    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss

    @State private var code = ""
    @State private var kind = "PERCENT"
    @State private var value = "10"
    @State private var minSubtotal = ""
    @State private var hasStart = false
    @State private var startDate = Date.now
    @State private var hasEnd = false
    @State private var endDate = Calendar.current.date(byAdding: .day, value: 30, to: .now) ?? .now
    @State private var maxUses = ""
    @State private var onePerBuyer = true
    @State private var active = true
    @State private var fields: [String: String] = [:]
    @State private var formError: String?
    @State private var saving = false

    static let maxPercent = 90

    var body: some View {
        NavigationStack {
            form
                .navigationTitle(coupon == nil ? "Neuer Gutschein" : "Gutschein bearbeiten")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) {
                        Button { Task { await save() } } label: {
                            if saving { ProgressView() } else { Text("Speichern").fontWeight(.semibold) }
                        }
                        .disabled(saving || code.isEmpty)
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
            codeSection
            valueSection
            periodSection
            limitSection
        }
        .scrollContentBackground(.hidden)
        .background(Color.paper)
    }

    private var codeSection: some View {
        Section {
            HStack {
                TextField("z. B. HERBST10", text: $code)
                    .font(.system(.body, design: .monospaced))
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .onChange(of: code) { _, new in
                        let n = Self.normalize(new)
                        if n != new { code = n }
                    }
                Button("Zufällig", systemImage: "shuffle") { code = Self.randomCode() }
                    .labelStyle(.iconOnly)
                    .accessibilityLabel("Zufälligen Code erzeugen")
            }
            MarketFieldError(text: fields["code"])
        } header: { Group { Text("Code") }.font(.wr(.footnote, .semibold)) } footer: {
            Group { Text("3–24 Zeichen: Buchstaben, Ziffern, - oder _. Kund:innen geben den Code im Warenkorb ein.") }.font(.wr(.footnote))
        }
    }

    /// Art wechseln setzt einen passenden Startwert (wie im Web); beim Laden bleibt der gespeicherte Wert
    private var kindBinding: Binding<String> {
        Binding(get: { kind }, set: { k in
            guard k != kind else { return }
            kind = k
            value = k == "PERCENT" ? "10" : "5.00"
        })
    }

    private var valueSection: some View {
        Section {
            Picker("Art", selection: kindBinding) {
                Text("Prozent").tag("PERCENT")
                Text("Betrag (\(currency))").tag("FIXED")
            }
            .pickerStyle(.segmented)
            HStack {
                Text("Rabatt")
                Spacer()
                Text(kind == "PERCENT" ? "%" : currency).foregroundStyle(Color.muted)
                TextField(kind == "PERCENT" ? "10" : "5.00", text: $value)
                    .keyboardType(kind == "PERCENT" ? .numberPad : .decimalPad)
                    .multilineTextAlignment(.trailing).frame(maxWidth: 100)
            }
            MarketFieldError(text: fields["value"])
            HStack {
                Text("Mindestwarenwert")
                Spacer()
                Text(currency).foregroundStyle(Color.muted)
                TextField("keiner", text: $minSubtotal).keyboardType(.decimalPad).multilineTextAlignment(.trailing).frame(maxWidth: 100)
            }
            MarketFieldError(text: fields["minSubtotalMinor"])
        } header: { Group { Text("Rabatt") }.font(.wr(.footnote, .semibold)) } footer: {
            Group { Text("Gilt für den Warenwert in deinem Shop, nicht für den Versand.") }.font(.wr(.footnote))
        }
    }

    private var periodSection: some View {
        Section {
            Toggle("Gültig ab", isOn: $hasStart.animation())
            if hasStart { DatePicker("Beginn", selection: $startDate, displayedComponents: .date) }
            Toggle("Gültig bis", isOn: $hasEnd.animation())
            if hasEnd { DatePicker("Ende", selection: $endDate, in: (hasStart ? startDate : .distantPast)..., displayedComponents: .date) }
            MarketFieldError(text: fields["startsAt"] ?? fields["endsAt"])
        } header: { Group { Text("Zeitraum") }.font(.wr(.footnote, .semibold)) } footer: {
            Group { Text("Ohne Angaben gilt der Code sofort und unbefristet. Das Ende gilt bis 23:59 Uhr.") }.font(.wr(.footnote))
        }
    }

    private var limitSection: some View {
        Section {
            HStack {
                Text("Höchstens einlösbar")
                Spacer()
                TextField("unbegrenzt", text: $maxUses).keyboardType(.numberPad).multilineTextAlignment(.trailing).frame(maxWidth: 110)
            }
            MarketFieldError(text: fields["maxUses"])
            Toggle("Einmal je Konto", isOn: $onePerBuyer)
            Toggle("Aktiv", isOn: $active)
        } header: { Group { Text("Einlösungen") }.font(.wr(.footnote, .semibold)) } footer: {
            Group { Text(active ? "Der Code ist einlösbar, sobald du speicherst." : "Pausiert: Der Code ist gespeichert, aber nicht einlösbar.") }.font(.wr(.footnote))
        }
    }

    // MARK: Logik

    /// Wie `couponCodeSchema`: Grossbuchstaben, ohne Leerzeichen, höchstens 24 Zeichen
    static func normalize(_ s: String) -> String {
        String(s.uppercased().filter { !$0.isWhitespace }.prefix(24))
    }

    static func randomCode() -> String {
        let abc = Array("ABCDEFGHJKLMNPQRSTUVWXYZ23456789")
        return String((0..<8).map { _ in abc.randomElement()! })
    }

    private static var zurich: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Zurich") ?? .current
        return c
    }

    private func apply() {
        guard let c = coupon, code.isEmpty else { return }
        code = c.code
        kind = c.kind
        value = c.isPercent ? String(c.value) : Fmt.moneyInput(c.value)
        minSubtotal = c.minSubtotalMinor > 0 ? Fmt.moneyInput(c.minSubtotalMinor) : ""
        if let s = c.startsAt { hasStart = true; startDate = s }
        if let e = c.endsAt { hasEnd = true; endDate = e }
        maxUses = c.maxUses.map(String.init) ?? ""
        onePerBuyer = c.onePerBuyer
        active = c.active
    }

    /// Prüfung wie im Web-Dialog; nil = Fehler (in `fields` eingetragen)
    private func validatedValue() -> (value: Int, min: Int, maxUses: Int?)? {
        var e: [String: String] = [:]
        var v: Int?
        if kind == "PERCENT" {
            v = Int(value.trimmed)
            if v == nil || v! < 1 || v! > Self.maxPercent { e["value"] = "Ganze Prozent von 1 bis \(Self.maxPercent)" }
        } else {
            v = Fmt.parseMoney(value)
            if v == nil || v! < 1 { e["value"] = "Betrag in \(currency), z. B. 5 oder 7.50" }
        }
        let min = minSubtotal.trimmed.isEmpty ? 0 : Fmt.parseMoney(minSubtotal)
        if min == nil { e["minSubtotalMinor"] = "Betrag in \(currency), z. B. 40" }
        var uses: Int?
        if !maxUses.trimmed.isEmpty {
            uses = Int(maxUses.trimmed)
            if uses == nil || uses! < 1 { e["maxUses"] = "Ganze Zahl ab 1" }
        }
        fields = e
        guard e.isEmpty, let v, let min else { return nil }
        return (v, min, uses)
    }

    private func payload(_ v: (value: Int, min: Int, maxUses: Int?)) -> [String: JSONValue] {
        let cal = Self.zurich
        let start = hasStart ? cal.startOfDay(for: startDate) : nil
        let end = hasEnd ? cal.date(bySettingHour: 23, minute: 59, second: 59, of: endDate) : nil
        return [
            "code": .string(code),
            "kind": .string(kind),
            "value": .number(Double(v.value)),
            "minSubtotalMinor": .number(Double(v.min)),
            "startsAt": start.map { .string(JSON.isoFormatter.string(from: $0)) } ?? .null,
            "endsAt": end.map { .string(JSON.isoFormatter.string(from: $0)) } ?? .null,
            "maxUses": v.maxUses.map { .number(Double($0)) } ?? .null,
            "onePerBuyer": .bool(onePerBuyer),
            "active": .bool(active),
        ]
    }

    private func save() async {
        formError = nil
        guard let v = validatedValue() else { Haptics.warning(); return }
        saving = true
        defer { saving = false }
        do {
            let input = payload(v)
            if let c = coupon {
                _ = try await APIClient.shared.put("/studio/coupons/\(c.id)", input) as JSONValue
            } else {
                _ = try await APIClient.shared.post("/studio/coupons", input) as JSONValue
            }
            Haptics.success()
            app.show(coupon == nil ? "Gutschein angelegt." : "Gutschein gespeichert.")
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
