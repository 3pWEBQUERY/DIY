import SwiftUI

/// Produkt anlegen/bearbeiten (PRD §13.4) – Felder nach `productUpsertSchema`, Gebührenvorschau „Du erhältst ca.“.
struct ProductEditorSheet: View {
    var id: String? = nil

    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss

    @State private var ctx: MarketEditorContext?
    @State private var loadError: String?

    @State private var title = ""
    @State private var description = ""
    @State private var kind = "SMALL_BATCH"
    @State private var category = ""
    @State private var price = ""
    @State private var stock = "1"
    @State private var materials = ""
    @State private var dimensions = ""
    @State private var productionDays = "3"
    @State private var shipping = "9.00"
    @State private var shipsFrom = "CH"
    @State private var safetyInfo = ""
    @State private var returnPolicy = ""
    @State private var projectId = ""
    @State private var tutorialId = ""
    @State private var media: [DraftMedia] = []
    @State private var variants: [VariantDraft] = []
    @State private var status = "ACTIVE"
    @State private var announce = false
    @State private var announceText = ""
    @State private var reserved = 0
    /// Bestand beim Öffnen des Editors – der Server wendet nur die Änderung dagegen an, damit Verkäufe
    /// in der Zwischenzeit nicht überschrieben werden (`stockBase`, wie der Web-Editor)
    @State private var stockBase: Int?
    /// Dasselbe je Variante (Schlüssel: Bezeichnung klein geschrieben, wie der Server sie zuordnet)
    @State private var variantStockBase: [String: Int] = [:]

    @State private var fields: [String: String] = [:]
    @State private var formError: String?
    @State private var saving = false

    struct VariantDraft: Identifiable, Hashable {
        var id = UUID().uuidString
        var name = ""
        var delta = ""
        var stock = "1"
    }

    private var isEdit: Bool { id != nil }
    private var isDigital: Bool { kind == "DIGITAL" }
    private var priceMinor: Int? { Fmt.parseMoney(price) }
    private var shippingMinor: Int { isDigital ? 0 : (Fmt.parseMoney(shipping) ?? 0) }

    var body: some View {
        NavigationStack {
            Group {
                if let ctx { form(ctx) }
                else if let loadError { ErrorStateView(message: loadError) { await load() } }
                else { LoadingView() }
            }
            .background(Color.paper)
            .navigationTitle(isEdit ? "Produkt bearbeiten" : "Neues Produkt")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button { Task { await save() } } label: {
                        if saving { ProgressView() } else { Text("Speichern").fontWeight(.semibold) }
                    }
                    .disabled(ctx == nil || saving || media.isUploading)
                }
            }
            .task { if ctx == nil { await load() } }
        }
        .interactiveDismissDisabled(saving || !title.isEmpty)
    }

    // MARK: Laden

    private func load() async {
        do {
            let c: MarketEditorContext = try await APIClient.shared.get("/studio/products/editor", query: ["id": id])
            ctx = c
            loadError = nil
            if category.isEmpty { category = c.categories.first?.slug ?? "" }
            if c.shop.status != "ACTIVE" { status = "DRAFT" }
            if let p = c.product { apply(p) }
        } catch is CancellationError {
        } catch {
            loadError = (error as? APIError)?.message ?? error.localizedDescription
        }
    }

    private func apply(_ p: MarketEditorProduct) {
        title = p.title
        description = p.description ?? ""
        kind = p.kind
        category = p.category
        price = Fmt.moneyInput(p.priceMinor)
        materials = p.materials ?? ""
        dimensions = p.dimensions ?? ""
        productionDays = String(p.productionDays ?? 3)
        shipping = Fmt.moneyInput(p.shippingMinor ?? 0)
        shipsFrom = p.shipsFrom ?? "CH"
        safetyInfo = p.safetyInfo ?? ""
        returnPolicy = p.returnPolicy ?? ""
        projectId = p.projectId ?? ""
        tutorialId = p.tutorialId ?? ""
        status = ["ACTIVE", "PAUSED", "DRAFT"].contains(p.status) ? p.status : (p.status == "SOLD_OUT" ? "ACTIVE" : "DRAFT")
        media = (p.media ?? []).map { DraftMedia.existing(id: $0.mediaId, url: $0.media?.variants?.small, alt: $0.alt) }
        variants = (p.variants ?? []).map { VariantDraft(name: $0.name, delta: $0.priceDeltaMinor == 0 ? "" : Fmt.moneyInput($0.priceDeltaMinor), stock: String($0.inventory?.onHand ?? 0)) }
        let base = (p.inventory ?? []).first { $0.variantId == nil }
        stock = String(base?.onHand ?? 0)
        stockBase = base?.onHand
        var vb: [String: Int] = [:]
        for v in p.variants ?? [] {
            if let n = v.inventory?.onHand { vb[v.name.trimmed.lowercased()] = n }
        }
        variantStockBase = vb
        reserved = (p.inventory ?? []).reduce(0) { $0 + $1.reserved }
    }

    // MARK: Formular

    private func form(_ c: MarketEditorContext) -> some View {
        Form {
            if c.shop.status != "ACTIVE" {
                Section {
                    NoticeView(tone: .info, title: "Shop noch nicht aktiv", message: "Du kannst Produkte als Entwurf vorbereiten. Veröffentlichen kannst du sie, sobald dein Shop verifiziert ist.")
                        .listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
                }
            }
            if let formError {
                Section { NoticeView(tone: .danger, message: formError).listRowInsets(EdgeInsets()).listRowBackground(Color.clear) }
            }

            Section {
                MediaPickerField(items: $media, maxCount: 12, title: "Produktbilder", coverHint: true)
                MarketFieldError(text: fields["media"])
            } footer: { Text("Mindestens ein Bild. Zeig die Arbeit bei Tageslicht, auch Details und Rückseite.") }

            Section {
                VStack(alignment: .leading, spacing: 4) {
                    TextField("Titel", text: $title)
                    MarketFieldError(text: fields["title"])
                }
                Picker("Art", selection: $kind) {
                    ForEach(L.productKind.filter { $0.key != "DIGITAL" || kind == "DIGITAL" }, id: \.key) { Text($0.label).tag($0.key) }
                }
                Picker("Kategorie", selection: $category) {
                    ForEach(c.categories) { Text($0.name).tag($0.slug) }
                }
                MarketFieldError(text: fields["category"])
                TextField("Beschreibung – wie ist es entstanden, wofür eignet es sich, wie pflegt man es?", text: $description, axis: .vertical)
                    .lineLimit(4...12)
            } header: { Text("Angebot") } footer: {
                if isDigital { Text("Digitale Dateien verwaltest du im Web. Auf iOS werden digitale Produkte nicht verkauft.") }
                else { Text("Konkret und ehrlich, z. B. „Gehäkelter Korb aus Baumwollkordel, natur“.") }
            }

            Section {
                HStack {
                    Text("Preis")
                    Spacer()
                    Text("CHF").foregroundStyle(Color.muted)
                    TextField("0.00", text: $price).keyboardType(.decimalPad).multilineTextAlignment(.trailing).frame(maxWidth: 110)
                }
                MarketFieldError(text: fields["priceMinor"] ?? (!price.trimmed.isEmpty && priceMinor == nil ? "Bitte gib einen gültigen Preis an, z. B. 48.00" : ((priceMinor ?? 100) < 100 && !price.isEmpty ? "Mindestpreis CHF 1.00" : nil)))
                if !isDigital && variants.isEmpty {
                    HStack {
                        Text(kind == "MADE_TO_ORDER" ? "Kapazität (Stück)" : "Bestand (Stück)")
                        Spacer()
                        TextField("0", text: $stock).keyboardType(.numberPad).multilineTextAlignment(.trailing).frame(maxWidth: 90)
                    }
                    MarketFieldError(text: fields["stock"])
                }
                feePreview(c)
            } header: { Text("Preis & Bestand") } footer: {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Inklusive allfälliger MWST. Mindestens CHF 1.00.")
                    if kind == "UNIQUE" { Text("Einzelstücke haben höchstens 1 Stück.") }
                    if reserved > 0 { Text("\(reserved) Stück sind in offenen Bestellungen reserviert.") }
                }
            }

            if !isDigital { variantSection }

            if !isDigital {
                Section("Details & Versand") {
                    TextField("Materialien, z. B. „100 % Baumwolle, Buchenholz, geölt“", text: $materials, axis: .vertical)
                    TextField("Masse, z. B. „Ø 24 cm, Höhe 18 cm, 320 g“", text: $dimensions)
                    HStack {
                        Text("Bearbeitungszeit (Tage)")
                        Spacer()
                        TextField("3", text: $productionDays).keyboardType(.numberPad).multilineTextAlignment(.trailing).frame(maxWidth: 70)
                    }
                    MarketFieldError(text: fields["productionDays"])
                    HStack {
                        Text("Versand")
                        Spacer()
                        Text("CHF").foregroundStyle(Color.muted)
                        TextField("0.00", text: $shipping).keyboardType(.decimalPad).multilineTextAlignment(.trailing).frame(maxWidth: 90)
                    }
                    MarketFieldError(text: fields["shippingMinor"])
                    Picker("Versand ab", selection: $shipsFrom) {
                        ForEach(L.shipCountries, id: \.key) { Text($0.label).tag($0.key) }
                    }
                }
            }

            Section {
                TextField("Warnhinweise, Altersempfehlung, Hersteller-/Kontaktangaben", text: $safetyInfo, axis: .vertical).lineLimit(2...8)
            } header: { Text("Sicherheitshinweise") } footer: { Text("Pflicht bei Kinderprodukten, Kerzen, Elektronik, Kosmetik u. ä.") }

            Section {
                TextField("Rückgabe & Umtausch", text: $returnPolicy, axis: .vertical).lineLimit(2...8)
            } footer: { Text("Leer lassen, um die Rückgaberegel deines Shops zu verwenden.") }

            Section {
                Picker("Projekt", selection: $projectId) {
                    Text("Keines").tag("")
                    ForEach(c.links.projects) { Text($0.title).tag($0.id) }
                }
                Picker("Anleitung", selection: $tutorialId) {
                    Text("Keine").tag("")
                    ForEach(c.links.tutorials) { Text($0.title).tag($0.id) }
                }
            } header: { Text("Der Faden dahinter") } footer: { Text("Verknüpfe das Projekt oder die Anleitung, aus der diese Arbeit entstanden ist – Käufer:innen sehen, wie sie gemacht wurde.") }

            Section {
                Picker("Status", selection: $status) {
                    Text("Aktiv").tag("ACTIVE")
                    Text("Pausiert").tag("PAUSED")
                    Text("Entwurf").tag("DRAFT")
                }
                .pickerStyle(.segmented)
                .disabled(c.shop.status != "ACTIVE")
                if status == "ACTIVE" && c.shop.status == "ACTIVE" {
                    Toggle("Im Feed ankündigen", isOn: $announce.animation())
                    if announce {
                        TextField("Neu in meinem Shop: \(title.nilIfEmpty ?? "…")", text: $announceText, axis: .vertical).lineLimit(2...5)
                    }
                }
            } header: { Text("Veröffentlichung") } footer: {
                Text(announce ? "Die Ankündigung erscheint als gekennzeichneter Verkaufsbeitrag in deinem Profil und im Feed deiner Follower." : "Aktive Produkte ohne Bestand erscheinen als ausverkauft.")
            }
        }
        .scrollContentBackground(.hidden)
        .scrollDismissesKeyboard(.interactively)
    }

    @ViewBuilder private func feePreview(_ c: MarketEditorContext) -> some View {
        if let p = priceMinor, p > 0 {
            let fee = MarketFee.platformFee(subtotal: p, bps: c.feeBps)
            VStack(spacing: 6) {
                MarketAmountRow(label: "Preis", value: Fmt.money(p))
                if !isDigital { MarketAmountRow(label: "Versand", value: Fmt.money(shippingMinor)) }
                MarketAmountRow(label: "Plattformgebühr \(Fmt.percent(bps: c.feeBps))", value: "− " + Fmt.money(fee), muted: true)
                Divider()
                MarketAmountRow(label: "Du erhältst ca.", value: Fmt.money(p + shippingMinor - fee), strong: true)
                Text("Die Provision fällt nur auf den Warenwert und nur bei abgeschlossenen Verkäufen an. Gebühren von Stripe werden separat abgezogen.")
                    .font(.wr(.caption)).foregroundStyle(Color.muted)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.vertical, 4)
        } else {
            Text("Gib einen Preis ein, um deine Auszahlung zu sehen.").font(.wr(.footnote)).foregroundStyle(Color.muted)
        }
    }

    private var variantSection: some View {
        Section {
            ForEach($variants) { $v in
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        TextField("Bezeichnung, z. B. „Gross“", text: $v.name)
                        Button(role: .destructive) { withAnimation { variants.removeAll { $0.id == v.id } } } label: { Image(systemName: "minus.circle.fill") }
                            .buttonStyle(.plain).foregroundStyle(Color.danger)
                            .accessibilityLabel("Variante entfernen")
                    }
                    HStack(spacing: 10) {
                        Text("Aufpreis CHF").font(.wr(.footnote)).foregroundStyle(Color.muted)
                        TextField("0.00", text: $v.delta).keyboardType(.numbersAndPunctuation).frame(maxWidth: 80)
                        Spacer()
                        Text("Bestand").font(.wr(.footnote)).foregroundStyle(Color.muted)
                        TextField("0", text: $v.stock).keyboardType(.numberPad).multilineTextAlignment(.trailing).frame(maxWidth: 60)
                    }
                }
                .padding(.vertical, 2)
            }
            if variants.count < 20 {
                Button { withAnimation { variants.append(VariantDraft()) } } label: { Label("Variante hinzufügen", systemImage: "plus") }
            }
            MarketFieldError(text: fields["variants"] ?? fields.first { $0.key.hasPrefix("variants.") }?.value)
        } header: { Text("Varianten (optional)") } footer: {
            Text("Z. B. Grösse oder Farbe. Jede Variante hat eigenen Bestand; der Aufpreis kann auch negativ sein.")
        }
    }

    // MARK: Speichern

    private func parseDelta(_ s: String) -> Int {
        let t = s.trimmed
        if t.isEmpty { return 0 }
        if t.hasPrefix("-") || t.hasPrefix("−") { return -(Fmt.parseMoney(String(t.dropFirst())) ?? 0) }
        return Fmt.parseMoney(t.replacingOccurrences(of: "+", with: "")) ?? 0
    }

    private func save() async {
        guard ctx != nil, !saving else { return }
        var e: [String: String] = [:]
        if title.trimmed.count < 3 { e["title"] = "Mindestens 3 Zeichen" }
        if (priceMinor ?? 0) < 100 { e["priceMinor"] = "Mindestpreis CHF 1.00" }
        if media.refs.isEmpty { e["media"] = "Mindestens ein Produktbild" }
        if category.isEmpty { e["category"] = "Bitte wähle eine Kategorie" }
        if variants.contains(where: { $0.name.trimmed.isEmpty }) { e["variants"] = "Jede Variante braucht eine Bezeichnung" }
        fields = e
        guard e.isEmpty else { formError = "Bitte prüfe die markierten Felder."; Haptics.warning(); return }
        formError = nil
        saving = true
        defer { saving = false }

        var input: [String: JSONValue] = [
            "title": .string(title.trimmed),
            "description": .string(description.trimmed),
            "kind": .string(kind),
            "category": .string(category),
            "priceMinor": .from(priceMinor),
            "currency": "CHF",
            "stock": .number(Double(Int(stock.trimmed) ?? 0)),
            "materials": .string(materials.trimmed),
            "dimensions": .string(dimensions.trimmed),
            "productionDays": .number(Double(Int(productionDays.trimmed) ?? 0)),
            "shippingMinor": .number(Double(shippingMinor)),
            "safetyInfo": .string(safetyInfo.trimmed),
            "returnPolicy": .string(returnPolicy.trimmed),
            "media": media.refsJSON,
            "variants": .array(isDigital ? [] : variants.map { v -> JSONValue in
                var o: [String: JSONValue] = ["name": .string(v.name.trimmed), "priceDeltaMinor": .number(Double(parseDelta(v.delta))), "stock": .number(Double(Int(v.stock.trimmed) ?? 0))]
                // Nur mitsenden, wenn die Variante beim Öffnen schon existierte (optional, nicht nullable)
                if let b = variantStockBase[v.name.trimmed.lowercased()] { o["stockBase"] = .number(Double(b)) }
                return .object(o)
            }),
            "status": .string(status),
        ]
        if let stockBase { input["stockBase"] = .number(Double(stockBase)) }
        if !projectId.isEmpty { input["projectId"] = .string(projectId) }
        if !tutorialId.isEmpty { input["tutorialId"] = .string(tutorialId) }
        var extra: [String: JSONValue] = ["announce": .bool(announce && status == "ACTIVE"), "announceText": .string(announceText.trimmed)]
        if !isDigital { extra["shipsFrom"] = .string(shipsFrom) }
        let body: [String: JSONValue] = ["input": .object(input), "extra": .object(extra)]

        do {
            let r: MarketUpsertResult
            if let id { r = try await APIClient.shared.put("/studio/products/\(id)", body) }
            else { r = try await APIClient.shared.post("/studio/products", body) }
            Haptics.success()
            let msg: String
            switch r.status {
            case "ACTIVE": msg = r.announced == true ? "Veröffentlicht und im Feed angekündigt." : "Veröffentlicht."
            case "SOLD_OUT": msg = "Gespeichert – ohne Bestand erscheint es als ausverkauft."
            case "PAUSED": msg = "Gespeichert und pausiert."
            default: msg = "Als Entwurf gespeichert."
            }
            app.show(msg)
            dismiss()
        } catch let err as APIError {
            fields = err.fields ?? [:]
            formError = err.message
            Haptics.warning()
        } catch {
            formError = error.localizedDescription
        }
    }
}
