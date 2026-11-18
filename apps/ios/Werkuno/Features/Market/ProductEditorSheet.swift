import SwiftUI
import UniformTypeIdentifiers

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
    /// Ausverkauft weiter öffentlich zeigen (Gegenteil von `hideWhenSoldOut` auf dem Server)
    @State private var showWhenSoldOut = true
    @State private var restockRequests: [MarketRestockRequest] = []
    /// Datei eines digitalen Produkts (PDF/ZIP, privat hochgeladen)
    @State private var digitalMediaId: String?
    @State private var digitalLabel: String?
    @State private var digitalChanged = false
    @State private var digitalBusy = false
    @State private var pickingFile = false

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
                    .disabled(ctx == nil || saving || media.isUploading || digitalBusy)
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
            if let p = c.product {
                apply(p)
                struct R: Decodable { var items: [MarketRestockRequest] }
                restockRequests = ((try? await APIClient.shared.get("/studio/products/\(p.id)/restock-requests", as: R.self))?.items) ?? []
            }
            // Erst nach apply(): „Aktiv“ ist nur bei aktivem Shop erlaubt (Server lehnt es sonst ab)
            status = Self.allowedStatus(status, shopStatus: c.shop.status, isNew: c.product == nil)
        } catch is CancellationError {
        } catch {
            loadError = (error as? APIError)?.message ?? error.localizedDescription
        }
    }

    /// Status, den der Server für diesen Shop annimmt: „Aktiv“ nur bei aktivem Shop. Bei pausiertem
    /// Shop bleiben bestehende aktive Produkte pausiert, neue werden Entwürfe; bei noch nicht
    /// verifizierten Shops (Entwurf, in Prüfung) wird alles als Entwurf vorbereitet.
    static func allowedStatus(_ status: String, shopStatus: String, isNew: Bool) -> String {
        if shopStatus == "ACTIVE" { return status }
        if statusLocked(shopStatus) { return status == "ACTIVE" ? "DRAFT" : status }
        guard status == "ACTIVE" else { return status }
        return isNew ? "DRAFT" : "PAUSED"
    }

    /// Statuswahl gesperrt, solange der Shop noch nicht verifiziert ist
    static func statusLocked(_ shopStatus: String) -> Bool {
        shopStatus == "DRAFT" || shopStatus == "PENDING_VERIFICATION"
    }

    /// Hinweis oben im Formular, passend zum Shop-Status
    static func shopHint(_ shopStatus: String) -> (title: String, message: String) {
        if statusLocked(shopStatus) {
            return ("Shop noch nicht aktiv", "Du kannst Produkte als Entwurf vorbereiten. Veröffentlichen kannst du sie, sobald dein Shop verifiziert ist.")
        }
        if shopStatus == "PAUSED" {
            return ("Shop pausiert", "Du kannst Produkte bearbeiten und als pausiert oder Entwurf speichern. Aktivieren kannst du sie wieder, sobald dein Shop nicht mehr pausiert ist.")
        }
        return ("Shop nicht aktiv", "Veröffentlichen kannst du Produkte erst, wenn dein Shop wieder aktiv ist. Speichere sie solange als pausiert oder Entwurf.")
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
        showWhenSoldOut = !(p.hideWhenSoldOut ?? false)
        if let f = p.digitalFile {
            digitalMediaId = f.id
            digitalLabel = Self.fileLabel(name: nil, mime: f.mime, bytes: f.bytes)
        }
    }

    static func fileLabel(name: String?, mime: String?, bytes: Int?) -> String {
        let type = mime == "application/zip" ? "ZIP" : "PDF"
        let size = bytes.map { String(format: "%.1f MB", Double($0) / 1_048_576) }
        return [name ?? type, size].compactMap { $0 }.joined(separator: " · ")
    }

    // MARK: Ausverkauft

    private var soldOutSection: some View {
        Section {
            Toggle("Ausverkauft weiter anzeigen", isOn: $showWhenSoldOut)
            if !restockRequests.isEmpty {
                ForEach(restockRequests.prefix(20)) { r in
                    VStack(alignment: .leading, spacing: 2) {
                        HStack {
                            Text(r.user.displayName.nilIfEmpty ?? "@\(r.user.handle)").font(.wr(.subheadline, .semibold))
                            Spacer()
                            Text(Fmt.relative(r.createdAt)).font(.wr(.caption)).foregroundStyle(Color.muted)
                        }
                        if let n = r.note.nilIfEmpty { Text("„\(n)“").font(.wr(.footnote)).foregroundStyle(Color.ink2) }
                    }
                    .accessibilityElement(children: .combine)
                }
            }
        } header: { Group {
            Text(restockRequests.isEmpty ? "Wenn ausverkauft" : (restockRequests.count == 1 ? "Wenn ausverkauft · 1 Anfrage" : "Wenn ausverkauft · \(restockRequests.count) Anfragen"))
        }.font(.wr(.footnote, .semibold)) } footer: { Group {
            VStack(alignment: .leading, spacing: 4) {
                Text(showWhenSoldOut
                     ? "Ohne Bestand bleibt das Produkt als „Ausverkauft“ sichtbar, und Interessierte können eine Nachproduktion anfragen."
                     : "Ohne Bestand verschwindet das Produkt aus Shop, Marktplatz und Suche. Mit neuem Bestand ist es automatisch wieder sichtbar.")
                if !restockRequests.isEmpty { Text("Füllst du den Bestand auf, werden alle, die angefragt haben, automatisch benachrichtigt.") }
            }
        }.font(.wr(.footnote)) }
    }

    // MARK: Formular

    private func form(_ c: MarketEditorContext) -> some View {
        Form {
            if c.shop.status != "ACTIVE" {
                Section {
                    NoticeView(tone: .info, title: Self.shopHint(c.shop.status).title, message: Self.shopHint(c.shop.status).message)
                        .listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
                }
            }
            if let formError {
                Section { NoticeView(tone: .danger, message: formError).listRowInsets(EdgeInsets()).listRowBackground(Color.clear) }
            }

            Section {
                MediaPickerField(items: $media, maxCount: 12, title: "Produktbilder", coverHint: true)
                MarketFieldError(text: fields["media"])
            } footer: { Group { Text("Mindestens ein Bild. Zeig die Arbeit bei Tageslicht, auch Details und Rückseite.") }.font(.wr(.footnote)) }

            Section {
                VStack(alignment: .leading, spacing: 4) {
                    TextField("Titel", text: $title)
                    MarketFieldError(text: fields["title"])
                }
                Picker("Art", selection: $kind) {
                    ForEach(L.productKind.filter { $0.key != "DIGITAL" || kind == "DIGITAL" || c.digitalEnabled != false }, id: \.key) { Text($0.label).tag($0.key) }
                }
                Picker("Kategorie", selection: $category) {
                    ForEach(c.categories) { Text($0.name).tag($0.slug) }
                }
                MarketFieldError(text: fields["category"])
                RichTextField(placeholder: "Beschreibung – wie ist es entstanden, wofür eignet es sich, wie pflegt man es?", markup: $description, minHeight: 120)
                MarketFieldError(text: fields["description"])
            } header: { Group { Text("Angebot") }.font(.wr(.footnote, .semibold)) } footer: { Group {
                if isDigital { Text("Die Datei (PDF oder ZIP) lädst du weiter unten hoch. In der iOS-App kaufen Kund:innen über Apple; dein Anteil ist gleich wie bei einem Web-Verkauf.") }
                else if kind == "RAW" { Text("Beschreibe den Zustand ehrlich (mind. 20 Zeichen): Gebrauchsspuren, Mängel, was noch zu tun ist.") }
                else { Text("Konkret und ehrlich, z. B. „Gehäkelter Korb aus Baumwollkordel, natur“.") }
            }.font(.wr(.footnote)) }

            if isDigital { digitalFileSection }

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
                if isDigital, let store = c.appStore, store.enabled { appPriceHint(store) }
            } header: { Group { Text("Preis & Bestand") }.font(.wr(.footnote, .semibold)) } footer: { Group {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Inklusive allfälliger MWST. Mindestens CHF 1.00.")
                    if kind == "UNIQUE" { Text("Einzelstücke haben höchstens 1 Stück.") }
                    if reserved > 0 { Text("\(reserved) Stück sind in offenen Bestellungen reserviert.") }
                }
            }.font(.wr(.footnote)) }

            if !isDigital { variantSection }

            if !isDigital { soldOutSection }

            if !isDigital {
                Section {
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
                } header: { Text("Details & Versand").font(.wr(.footnote, .semibold)) }
            }

            Section {
                RichTextField(placeholder: "Warnhinweise, Altersempfehlung, Hersteller-/Kontaktangaben", markup: $safetyInfo, minHeight: 72)
            } header: { Group { Text("Sicherheitshinweise") }.font(.wr(.footnote, .semibold)) } footer: { Group { Text("Pflicht bei Kinderprodukten, Kerzen, Elektronik, Kosmetik u. ä.") }.font(.wr(.footnote)) }

            Section {
                RichTextField(placeholder: "Rückgabe & Umtausch", markup: $returnPolicy, minHeight: 72)
            } footer: { Group { Text("Leer lassen, um die Rückgaberegel deines Shops zu verwenden.") }.font(.wr(.footnote)) }

            Section {
                Picker("Projekt", selection: $projectId) {
                    Text("Keines").tag("")
                    ForEach(c.links.projects) { Text($0.title).tag($0.id) }
                }
                Picker("Anleitung", selection: $tutorialId) {
                    Text("Keine").tag("")
                    ForEach(c.links.tutorials) { Text($0.title).tag($0.id) }
                }
            } header: { Group { Text("Der Faden dahinter") }.font(.wr(.footnote, .semibold)) } footer: { Group { Text("Verknüpfe das Projekt oder die Anleitung, aus der diese Arbeit entstanden ist – Käufer:innen sehen, wie sie gemacht wurde.") }.font(.wr(.footnote)) }

            Section {
                Picker("Status", selection: $status) {
                    // „Aktiv“ nimmt der Server nur bei aktivem Shop an
                    if c.shop.status == "ACTIVE" { Text("Aktiv").tag("ACTIVE") }
                    Text("Pausiert").tag("PAUSED")
                    Text("Entwurf").tag("DRAFT")
                }
                .pickerStyle(.segmented)
                .disabled(Self.statusLocked(c.shop.status))
                if status == "ACTIVE" && c.shop.status == "ACTIVE" {
                    Toggle("Im Feed ankündigen", isOn: $announce.animation())
                    if announce {
                        TextField("Neu in meinem Shop: \(title.nilIfEmpty ?? "…")", text: $announceText, axis: .vertical).lineLimit(2...5)
                    }
                }
            } header: { Group { Text("Veröffentlichung") }.font(.wr(.footnote, .semibold)) } footer: { Group {
                Text(announce ? "Die Ankündigung erscheint als gekennzeichneter Verkaufsbeitrag in deinem Profil und im Feed deiner Follower." : "Aktive Produkte ohne Bestand erscheinen als ausverkauft.")
            }.font(.wr(.footnote)) }
        }
        .formCanvas()
        .scrollDismissesKeyboard(.interactively)
        .fileImporter(isPresented: $pickingFile, allowedContentTypes: [.pdf, .zip]) { result in
            if case .success(let url) = result { Task { await uploadDigital(url) } }
        }
    }

    // MARK: Datei (digitale Produkte)

    private var digitalFileSection: some View {
        Section {
            if let digitalLabel {
                Label(digitalLabel, systemImage: "doc.fill").font(.wr(.subheadline)).foregroundStyle(Color.ink)
            }
            Button {
                pickingFile = true
            } label: {
                HStack {
                    Label(digitalMediaId == nil ? "PDF oder ZIP hochladen" : "Datei ersetzen", systemImage: "square.and.arrow.up")
                    Spacer()
                    if digitalBusy { ProgressView() }
                }
            }
            .disabled(digitalBusy)
            MarketFieldError(text: fields["digital"])
        } header: { Group { Text("Datei") }.font(.wr(.footnote, .semibold)) } footer: { Group {
            Text("PDF oder ZIP, höchstens 100 MB. Käufer:innen laden die Datei nach dem Kauf herunter. Ohne Datei kannst du das Produkt nur als Entwurf speichern.")
        }.font(.wr(.footnote)) }
    }

    private func uploadDigital(_ picked: URL) async {
        digitalBusy = true
        defer { digitalBusy = false }
        let scoped = picked.startAccessingSecurityScopedResource()
        defer { if scoped { picked.stopAccessingSecurityScopedResource() } }
        let isZip = picked.pathExtension.lowercased() == "zip"
        // Kopie im temporären Ordner: Der Upload liest die Datei gestreamt und braucht dauerhaften Zugriff
        let tmp = FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID().uuidString).\(isZip ? "zip" : "pdf")")
        defer { try? FileManager.default.removeItem(at: tmp) }
        do {
            try FileManager.default.copyItem(at: picked, to: tmp)
            let bytes = (try? tmp.resourceValues(forKeys: [.fileSizeKey]))?.fileSize
            let r = try await APIClient.shared.upload(file: tmp, mime: isZip ? "application/zip" : "application/pdf", purpose: "private")
            if r.result.state == "FAILED" {
                fields["digital"] = "Die Datei konnte nicht verarbeitet werden. Bitte lade sie erneut hoch."
                return
            }
            digitalMediaId = r.id
            digitalLabel = Self.fileLabel(name: picked.lastPathComponent, mime: isZip ? "application/zip" : "application/pdf", bytes: bytes)
            digitalChanged = true
            fields["digital"] = nil
            Haptics.success()
        } catch let err as APIError {
            fields["digital"] = err.message
            Haptics.warning()
        } catch {
            fields["digital"] = "Die Datei konnte nicht gelesen werden. Bitte versuche es erneut."
            Haptics.warning()
        }
    }

    /// Digitale Produkte: Preis in der iOS-App (Apple-Preisstufen, ganze Franken bis zur höchsten Stufe)
    @ViewBuilder private func appPriceHint(_ store: AppStorePricing) -> some View {
        let top = store.tiersMinor.last ?? 0
        let rule = "In der App kaufen Kund:innen über Apple. Der App-Preis ist dein Preis plus \(Fmt.percent(bps: store.markupBps)) (Apple-Gebühr), aufgerundet auf ganze Franken – höchstens \(Fmt.money(top)). Kaufbar bis \(Fmt.money(store.maxWebMinor)). Dein Anteil bleibt gleich."
        if let p = priceMinor, p >= 100 {
            if let app = store.appPrice(forWeb: p) {
                NoticeView(tone: .info, title: "Preis in der App: \(Fmt.money(app))", message: rule)
                    .listRowInsets(EdgeInsets(top: 8, leading: 12, bottom: 8, trailing: 12))
            } else {
                NoticeView(tone: .warn, title: "In der App nicht kaufbar", message: "Bei diesem Preis gibt es keine Apple-Preisstufe mehr. In der App kaufbar sind digitale Produkte bis \(Fmt.money(store.maxWebMinor)).")
                    .listRowInsets(EdgeInsets(top: 8, leading: 12, bottom: 8, trailing: 12))
            }
        } else {
            NoticeView(tone: .info, title: "Preis in der App", message: rule)
                .listRowInsets(EdgeInsets(top: 8, leading: 12, bottom: 8, trailing: 12))
        }
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
        } header: { Group { Text("Varianten (optional)") }.font(.wr(.footnote, .semibold)) } footer: { Group {
            Text("Z. B. Grösse oder Farbe. Jede Variante hat eigenen Bestand; der Aufpreis kann auch negativ sein.")
        }.font(.wr(.footnote)) }
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
        if kind == "RAW" && description.trimmed.count < 20 { e["description"] = "Beschreibe den Zustand des Artikels (mind. 20 Zeichen)" }
        if isDigital && status == "ACTIVE" && digitalMediaId == nil { e["digital"] = "Bitte lade die Datei für dein digitales Produkt hoch" }
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
        if isDigital, digitalChanged, let digitalMediaId { extra["digitalMediaId"] = .string(digitalMediaId) }
        if !isDigital {
            extra["shipsFrom"] = .string(shipsFrom)
            extra["hideWhenSoldOut"] = .bool(!showWhenSoldOut)
        }
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
