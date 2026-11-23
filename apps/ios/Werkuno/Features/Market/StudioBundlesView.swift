import SwiftUI

// MARK: - Modelle (GET /studio/bundles)

struct StudioBundleList: Decodable {
    struct Item: Decodable, Hashable {
        var productId: String
        var quantity: Int
        var title: String
        var priceMinor: Int
        var status: String
    }
    struct LinkedTutorial: Decodable, Hashable { var id: String; var title: String }
    struct Options: Decodable {
        struct Product: Decodable, Identifiable, Hashable {
            var id: String
            var title: String
            var kind: String
            var status: String
            var priceMinor: Int
            var hasVariants: Bool
            var isDigital: Bool { kind == "DIGITAL" }
        }
        struct Tutorial: Decodable, Identifiable, Hashable { var id: String; var title: String; var state: String }
        var products: [Product]
        var tutorials: [Tutorial]
    }
    var currency: String
    var bundles: [StudioBundle]
    var options: Options
}

struct StudioBundle: Decodable, Identifiable, Hashable {
    var id: String
    var title: String
    var description: String
    var discountPct: Int
    var active: Bool
    var tutorial: StudioBundleList.LinkedTutorial?
    var items: [StudioBundleList.Item]
    var fullMinor: Int
    var discountMinor: Int
    var priceMinor: Int
    var unavailable: [String]

    /// Status wie im Web: inaktiv, unvollständig (Teil nicht erhältlich) oder aktiv
    var state: (label: String, tint: Color) {
        if !active { return ("Inaktiv", .muted) }
        if !unavailable.isEmpty { return ("Teil fehlt", .warn) }
        return ("Aktiv", .moss)
    }
}

// MARK: - Liste

/// Werkuno Studio → Sets: Produkte gebündelt mit Set-Rabatt (wie die Sets unter /studio/rabatte im Web).
struct StudioBundlesView: View {
    @Environment(AppState.self) private var app

    @State private var data: StudioBundleList?
    @State private var error: String?
    @State private var editing: BundleEditTarget?
    @State private var confirmDelete: StudioBundle?

    var body: some View {
        content
            .background(Color.paper)
            .navigationTitle("Sets")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if data != nil {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { editing = .new } label: { Image(systemName: "plus") }
                            .accessibilityLabel("Neues Set")
                    }
                }
            }
            .task { await load() }
            .refreshable { await load() }
            .sheet(item: $editing, onDismiss: { Task { await load() } }) { target in
                if let d = data { StudioBundleEditor(bundle: target.bundle, options: d.options, currency: d.currency) }
            }
            .confirmationDialog(
                "Set löschen?",
                isPresented: Binding(get: { confirmDelete != nil }, set: { if !$0 { confirmDelete = nil } }),
                titleVisibility: .visible,
                presenting: confirmDelete
            ) { b in
                Button("„\(b.title)“ löschen", role: .destructive) { Task { await delete(b) } }
            } message: { _ in
                Text("Das Set verschwindet aus deinem Shop und aus verknüpften Anleitungen. Die Produkte bleiben erhalten.")
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
        PageTitle(kicker: "Werkuno Studio", title: "Sets", subtitle: "Mehrere Produkte zusammen, mit Set-Rabatt.")
    }

    private func list(_ d: StudioBundleList) -> some View {
        List {
            Section {
                header.listRowInsets(EdgeInsets()).listRowBackground(Color.clear).listRowSeparator(.hidden)
                Text("Ein Set bündelt zwei bis zwölf Produkte aus deinem Shop – zum Beispiel ein Materialset zu deiner Anleitung. Käufer:innen legen es mit einem Tipp in den Warenkorb, der Set-Rabatt gilt, solange alle Teile im Warenkorb liegen.")
                    .font(.wr(.footnote)).foregroundStyle(Color.muted)
                    .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 8, trailing: 0))
                    .listRowBackground(Color.clear).listRowSeparator(.hidden)
            }
            if d.bundles.isEmpty {
                Section {
                    EmptyStateView(symbol: "square.stack.3d.up", title: "Noch keine Sets", message: "Zum Beispiel Garn, Nadeln und die passende Anleitung mit 10 % Set-Rabatt.", actionTitle: "Erstes Set anlegen") { editing = .new }
                        .listRowInsets(EdgeInsets()).listRowBackground(Color.clear).listRowSeparator(.hidden)
                }
            } else {
                Section {
                    ForEach(d.bundles) { b in row(b, d.currency) }
                } header: {
                    SpecLabel(Fmt.plural(d.bundles.count, "Set", "Sets"))
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .contentMargins(.horizontal, Space.gutter, for: .scrollContent)
    }

    private func row(_ b: StudioBundle, _ currency: String) -> some View {
        StudioBundleRow(bundle: b, currency: currency)
            .contentShape(.rect)
            .onTapGesture { editing = .edit(b) }
            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                Button("Löschen", systemImage: "trash", role: .destructive) { confirmDelete = b }
                Button(b.active ? "Deaktivieren" : "Aktivieren", systemImage: b.active ? "pause.circle" : "play.circle") { Task { await setActive(b, !b.active) } }
                    .tint(b.active ? .warn : .moss)
            }
            .contextMenu {
                Button("Bearbeiten", systemImage: "pencil") { editing = .edit(b) }
                Button(b.active ? "Deaktivieren" : "Aktivieren", systemImage: b.active ? "pause.circle" : "play.circle") { Task { await setActive(b, !b.active) } }
                Divider()
                Button("Löschen", systemImage: "trash", role: .destructive) { confirmDelete = b }
            }
            .listRowBackground(Color.paper)
            .listRowInsets(EdgeInsets(top: 10, leading: 0, bottom: 10, trailing: 0))
    }

    private func load() async {
        guard app.me?.shop != nil else { return }
        do {
            let d: StudioBundleList = try await APIClient.shared.get("/studio/bundles")
            withAnimation(.smooth) { data = d }
            error = nil
        } catch is CancellationError {
        } catch {
            self.error = (error as? APIError)?.message ?? error.localizedDescription
        }
    }

    private func setActive(_ b: StudioBundle, _ active: Bool) async {
        await app.run(active ? "Set aktiviert." : "Set deaktiviert.") {
            _ = try await APIClient.shared.post("/studio/bundles/\(b.id)/active", ["active": JSONValue.bool(active)]) as JSONValue
        }
        await load()
    }

    private func delete(_ b: StudioBundle) async {
        await app.run("Set gelöscht.") {
            _ = try await APIClient.shared.delete("/studio/bundles/\(b.id)") as JSONValue
        }
        await load()
    }
}

enum BundleEditTarget: Identifiable {
    case new
    case edit(StudioBundle)
    var id: String {
        switch self {
        case .new: "new"
        case .edit(let b): b.id
        }
    }
    var bundle: StudioBundle? {
        if case .edit(let b) = self { return b }
        return nil
    }
}

// MARK: - Zeile

struct StudioBundleRow: View {
    var bundle: StudioBundle
    var currency: String

    private var itemsText: String {
        bundle.items.map { "\($0.quantity)× \($0.title)" }.joined(separator: " · ")
    }

    var body: some View {
        let st = bundle.state
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text(bundle.title).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink).lineLimit(1)
                MarketStatusPill(label: st.label, tint: st.tint)
                Spacer(minLength: 8)
                Text(Fmt.money(bundle.priceMinor, currency: currency)).font(.wr(.subheadline, .semibold)).monospacedDigit().foregroundStyle(Color.ink)
            }
            Text(itemsText).font(.wr(.footnote)).foregroundStyle(Color.muted).lineLimit(2)
            priceLine
            if !bundle.unavailable.isEmpty {
                Text("Nicht erhältlich: \(bundle.unavailable.joined(separator: ", "))").font(.wr(.caption)).foregroundStyle(Color.warn)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityHint("Tippen zum Bearbeiten, wischen zum Deaktivieren oder Löschen")
    }

    private var priceLine: some View {
        HStack(spacing: 6) {
            Text("statt \(Fmt.money(bundle.fullMinor, currency: currency))")
            Text("·")
            Text("−\(bundle.discountPct) %")
            if let t = bundle.tutorial {
                Text("·")
                Text("zu „\(t.title)“").lineLimit(1)
            }
        }
        .font(.wr(.caption)).monospacedDigit().foregroundStyle(Color.ink2)
    }
}

// MARK: - Bearbeiten

/// Anlegen/Bearbeiten eines Sets. Prüft vorab wie das Web; der Server prüft verbindlich (Feldfehler).
struct StudioBundleEditor: View {
    var bundle: StudioBundle?
    var options: StudioBundleList.Options
    var currency: String

    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss

    struct Line: Identifiable, Hashable {
        var productId: String
        var quantity: Int
        var id: String { productId }
    }

    @State private var title = ""
    @State private var text = ""
    @State private var discount = 10
    @State private var tutorialId = ""
    @State private var active = true
    @State private var lines: [Line] = []
    @State private var fields: [String: String] = [:]
    @State private var formError: String?
    @State private var saving = false
    @State private var loaded = false

    static let maxPercent = 50
    static let maxItems = 12

    private var productById: [String: StudioBundleList.Options.Product] {
        Dictionary(uniqueKeysWithValues: options.products.map { ($0.id, $0) })
    }

    private var fullMinor: Int {
        lines.reduce(0) { $0 + (productById[$1.productId]?.priceMinor ?? 0) * $1.quantity }
    }

    private var discountMinor: Int { Int((Double(fullMinor) * Double(discount) / 100).rounded()) }

    var body: some View {
        NavigationStack {
            form
                .navigationTitle(bundle == nil ? "Neues Set" : "Set bearbeiten")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) {
                        Button { Task { await save() } } label: {
                            if saving { ProgressView() } else { Text("Speichern").fontWeight(.semibold) }
                        }
                        .disabled(saving || title.trimmed.isEmpty)
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
            textSection
            itemsSection
            discountSection
            linkSection
        }
        .scrollContentBackground(.hidden)
        .background(Color.paper)
    }

    private var textSection: some View {
        Section {
            TextField("z. B. Starter-Set Socken", text: $title)
            MarketFieldError(text: fields["title"])
            TextField("Was steckt drin, für wen passt es? (optional)", text: $text, axis: .vertical)
                .lineLimit(2...6)
            MarketFieldError(text: fields["description"])
        } header: { Group { Text("Titel und Beschreibung") }.font(.wr(.footnote, .semibold)) }
    }

    private var itemsSection: some View {
        Section {
            ForEach($lines) { $line in
                lineRow($line)
            }
            .onDelete { lines.remove(atOffsets: $0) }
            if lines.count < Self.maxItems {
                addMenu
            }
            MarketFieldError(text: fields["items"])
        } header: { Group { Text("Produkte") }.font(.wr(.footnote, .semibold)) } footer: {
            Group { Text("Mindestens zwei, höchstens zwölf Produkte. Produkte mit Varianten können nicht in ein Set; digitale Produkte nur einmal.") }.font(.wr(.footnote))
        }
    }

    private func lineRow(_ line: Binding<Line>) -> some View {
        let p = productById[line.wrappedValue.productId]
        let maxQty = p?.isDigital == true ? 1 : 20
        return Stepper(value: line.quantity, in: 1...maxQty) {
            VStack(alignment: .leading, spacing: 2) {
                Text(p?.title ?? "Unbekanntes Produkt").font(.wr(.subheadline)).foregroundStyle(Color.ink).lineLimit(1)
                Text("\(line.wrappedValue.quantity)× \(Fmt.money(p?.priceMinor ?? 0, currency: currency))")
                    .font(.wr(.caption)).monospacedDigit().foregroundStyle(Color.muted)
            }
        }
    }

    private var addable: [StudioBundleList.Options.Product] {
        let chosen = Set(lines.map(\.productId))
        return options.products.filter { !$0.hasVariants && !chosen.contains($0.id) }
    }

    private var addMenu: some View {
        Menu {
            ForEach(addable) { p in
                Button("\(p.title) · \(Fmt.money(p.priceMinor, currency: currency))") {
                    lines.append(Line(productId: p.id, quantity: 1))
                }
            }
        } label: {
            Label("Produkt hinzufügen", systemImage: "plus.circle")
        }
        .disabled(addable.isEmpty)
    }

    private var discountSection: some View {
        Section {
            Stepper(value: $discount, in: 0...Self.maxPercent) {
                HStack {
                    Text("Set-Rabatt")
                    Spacer()
                    Text("\(discount) %").monospacedDigit().foregroundStyle(Color.ink2)
                }
            }
            MarketFieldError(text: fields["discountPct"])
            if lines.count >= 2 {
                summaryRow("Einzeln", Fmt.money(fullMinor, currency: currency))
                summaryRow("Set-Preis", Fmt.money(fullMinor - discountMinor, currency: currency), strong: true)
            }
            Toggle("Aktiv", isOn: $active)
        } header: { Group { Text("Preis") }.font(.wr(.footnote, .semibold)) } footer: {
            Group { Text("Höchstens \(Self.maxPercent) %. Den Rabatt trägst du; Preise in \(currency). Inaktive Sets sind gespeichert, aber nicht sichtbar.") }.font(.wr(.footnote))
        }
    }

    private func summaryRow(_ label: String, _ value: String, strong: Bool = false) -> some View {
        HStack {
            Text(label).foregroundStyle(strong ? Color.ink : Color.muted)
            Spacer()
            Text(value).monospacedDigit().fontWeight(strong ? .semibold : .regular)
        }
        .font(.wr(.subheadline))
    }

    private var linkSection: some View {
        Section {
            Picker("Anleitung", selection: $tutorialId) {
                Text("Keine").tag("")
                ForEach(options.tutorials) { t in
                    Text(t.state == "DRAFT" ? "\(t.title) (Entwurf)" : t.title).tag(t.id)
                }
            }
            MarketFieldError(text: fields["tutorialId"])
        } header: { Group { Text("Verknüpfung") }.font(.wr(.footnote, .semibold)) } footer: {
            Group { Text("Optional: Das Set erscheint dann auch bei deiner Anleitung, zum Beispiel als Materialset.") }.font(.wr(.footnote))
        }
    }

    // MARK: Logik

    private func apply() {
        guard !loaded else { return }
        loaded = true
        guard let b = bundle else { return }
        title = b.title
        text = b.description
        discount = b.discountPct
        tutorialId = b.tutorial?.id ?? ""
        active = b.active
        lines = b.items.map { Line(productId: $0.productId, quantity: $0.quantity) }
    }

    /// Prüfung wie im Web-Formular; false = Fehler (in `fields` eingetragen)
    private func validate() -> Bool {
        var e: [String: String] = [:]
        let t = title.trimmed
        if t.count < 3 { e["title"] = "Mindestens 3 Zeichen" } else if t.count > 80 { e["title"] = "Höchstens 80 Zeichen" }
        if text.trimmed.count > 500 { e["description"] = "Höchstens 500 Zeichen" }
        if lines.count < 2 { e["items"] = "Ein Set braucht mindestens zwei Produkte" }
        fields = e
        return e.isEmpty
    }

    private var payload: [String: JSONValue] {
        [
            "title": .string(title.trimmed),
            "description": .string(text.trimmed),
            "discountPct": .number(Double(discount)),
            "active": .bool(active),
            "tutorialId": tutorialId.isEmpty ? .null : .string(tutorialId),
            "items": .array(lines.map { .object(["productId": .string($0.productId), "quantity": .number(Double($0.quantity))]) }),
        ]
    }

    private func save() async {
        formError = nil
        guard validate() else { Haptics.warning(); return }
        saving = true
        defer { saving = false }
        do {
            if let b = bundle {
                _ = try await APIClient.shared.put("/studio/bundles/\(b.id)", payload) as JSONValue
            } else {
                _ = try await APIClient.shared.post("/studio/bundles", payload) as JSONValue
            }
            Haptics.success()
            app.show(bundle == nil ? "Set angelegt." : "Set gespeichert.")
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
