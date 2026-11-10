import SwiftUI

/// Kasse (PRD §13.5): persönliche Angaben (einmal erfasst, danach gespeichert), optional abweichende
/// Lieferadresse, Notiz, vollständige Kosten, dann zahlungspflichtig bestellen.
struct CheckoutView: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router

    @State private var page: MarketCheckoutPage?
    @State private var loadError: String?

    // Persönliche Angaben (= Rechnungsadresse; Lieferadresse, sofern nicht abweichend)
    @State private var firstName = ""
    @State private var lastName = ""
    @State private var line1 = ""
    @State private var line2 = ""
    @State private var postalCode = ""
    @State private var city = ""
    @State private var country = "CH"
    @State private var phone = ""
    @State private var hasSavedDetails = false
    @State private var saveDetails = true
    // Abweichende Lieferadresse
    @State private var shipToOther = false
    @State private var shipName = ""
    @State private var shipLine1 = ""
    @State private var shipLine2 = ""
    @State private var shipPostalCode = ""
    @State private var shipCity = ""
    @State private var shipCountry = "CH"
    @State private var note = ""
    @State private var prefilled = false

    /// Einmal pro Bildschirm (Doppeltipp/Netzwerk-Retry → gleiche Bestellung)
    @State private var idempotencyKey = UUID().uuidString
    @State private var fieldErrors: [String: String] = [:]
    @State private var submitError: String?
    @State private var submitting = false

    @State private var started: MarketCheckoutStarted?
    @State private var simulate: MarketSimulation?
    @State private var webPay: MarketWebLink?
    @State private var outcome: Outcome?
    @State private var celebrate = 0

    enum Outcome: Equatable { case paid([String]), failed([String]), pending([String]) }

    private enum Field: Hashable { case firstName, lastName, line1, line2, postalCode, city, phone, shipName, shipLine1, shipLine2, shipPostalCode, shipCity, note }
    @FocusState private var focus: Field?

    var body: some View {
        Group {
            if let outcome { done(outcome) }
            else if let page { content(page) }
            else if let loadError { ErrorStateView(message: loadError) { await load() } }
            else { LoadingView(text: "Kasse wird vorbereitet …") }
        }
        .background(Color.paper)
        .navigationTitle(outcome == nil ? "Kasse" : "")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(outcome != nil)
        .task { if page == nil { await load() } }
        .sheet(item: $simulate) { s in
            MarketSimulatedPaymentSheet(orderIds: s.orderIds, totalMinor: s.totalMinor) { ok in
                Task { await finish(ids: s.orderIds, paid: ok) }
            }
            .interactiveDismissDisabled(false)
        }
        .sheet(item: $webPay, onDismiss: { Task { await afterStripe() } }) { l in
            SafariSheet(url: l.url).ignoresSafeArea()
        }
    }

    // MARK: Laden

    private func load() async {
        do {
            let p: MarketCheckoutPage = try await APIClient.shared.get("/checkout")
            withAnimation(.smooth) { page = p }
            loadError = nil
            if !prefilled {
                prefilled = true
                hasSavedDetails = p.details != nil
                if let d = p.details {
                    firstName = d.firstName ?? ""
                    lastName = d.lastName ?? ""
                    line1 = d.line1 ?? ""
                    line2 = d.line2 ?? ""
                    postalCode = d.postalCode ?? ""
                    city = d.city ?? ""
                    phone = d.phone ?? ""
                    if let c = d.country, L.shipCountries.contains(where: { $0.key == c }) { country = c }
                }
            }
        } catch is CancellationError {
        } catch {
            loadError = (error as? APIError)?.message ?? error.localizedDescription
        }
    }

    // MARK: Inhalt

    @ViewBuilder private func content(_ p: MarketCheckoutPage) -> some View {
        let c = p.cart
        if c.groups.isEmpty {
            EmptyStateView(symbol: "bag.fill", title: "Nichts zu bestellen", message: "Dein Warenkorb ist leer.", actionTitle: "Zum Warenkorb") { router.open(.cart) }
                .padding(.top, 60)
        } else if c.mode == "disabled" || c.hasProblems {
            VStack(alignment: .leading, spacing: 16) {
                NoticeView(tone: .warn, title: c.mode == "disabled" ? "Zahlungen noch nicht aktiviert" : "Bitte prüfe deinen Warenkorb",
                           message: c.mode == "disabled" ? "Bestellungen sind in Kürze möglich. Deine Artikel bleiben im Warenkorb." : "Einige Artikel sind nicht mehr in der gewünschten Menge verfügbar.")
                Button("Zum Warenkorb") { router.open(.cart) }.buttonStyle(.glass)
                Spacer()
            }
            .padding(Space.gutter)
        } else if p.hasDigitalItems {
            // Digitale Produkte werden in der App nicht verkauft (App Store 3.1.1) – keine Kasse dafür.
            VStack(alignment: .leading, spacing: 16) {
                NoticeView(tone: .info, title: "Digitale Anleitungen",
                           message: (p.digitalOnly ?? false) ? "In der App nicht erhältlich." : "Digitale Anleitungen sind in der App nicht erhältlich. Entferne sie aus dem Warenkorb, um die übrigen Artikel zu bestellen.")
                Button("Zum Warenkorb") { router.open(.cart) }.buttonStyle(.glass)
                Spacer()
            }
            .padding(Space.gutter)
        } else {
            form(p)
        }
    }

    private func form(_ p: MarketCheckoutPage) -> some View {
        let c = p.cart
        let digitalOnly = p.digitalOnly ?? false
        return ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 6) {
                    SpecLabel("Warenkorb → Kasse → Zahlung", color: .moss)
                    Text("Kasse").font(.display(32)).accessibilityAddTraits(.isHeader)
                }

                // Persönliche Angaben (Rechnungsadresse)
                VStack(alignment: .leading, spacing: 12) {
                    SectionHeader("Deine Angaben", number: "01",
                                  subtitle: hasSavedDetails ? (digitalOnly ? "Rechnungsadresse" : "Rechnungs- und Lieferadresse") : "Einmalig: Name und Adresse brauchen die Shops für Rechnung und Versand. Wir speichern sie für deine nächsten Bestellungen.")
                    VStack(spacing: 0) {
                        HStack(spacing: 12) {
                            field("Vorname", text: $firstName, key: "details.firstName", focus: .firstName, content: .givenName)
                            field("Nachname", text: $lastName, key: "details.lastName", focus: .lastName, content: .familyName)
                        }
                        field("Strasse und Hausnummer", text: $line1, key: "details.line1", focus: .line1, content: .fullStreetAddress)
                        field("Adresszusatz (optional)", text: $line2, key: "details.line2", focus: .line2, content: .streetAddressLine2)
                        HStack(spacing: 12) {
                            field("PLZ", text: $postalCode, key: "details.postalCode", focus: .postalCode, content: .postalCode, keyboard: .numbersAndPunctuation)
                                .frame(maxWidth: 110)
                            field("Ort", text: $city, key: "details.city", focus: .city, content: .addressCity)
                        }
                        countryRow(selection: $country, key: "details.country")
                        field("Telefon (optional)", text: $phone, key: "details.phone", focus: .phone, content: .telephoneNumber, keyboard: .phonePad)
                    }
                    .cardSurface(radius: Radius.inner)
                    Text("Bestellungen derzeit aus der Schweiz, Deutschland, Österreich und Liechtenstein. Die Telefonnummer dient nur für Rückfragen zur Lieferung.").font(.wr(.caption)).foregroundStyle(Color.muted)
                    if hasSavedDetails {
                        Toggle(isOn: $saveDetails) { Text("Änderungen für künftige Bestellungen speichern").font(.wr(.subheadline)) }
                            .tint(.moss)
                            .padding(.horizontal, 4)
                    }
                }

                // Abweichende Lieferadresse
                if !digitalOnly {
                    VStack(alignment: .leading, spacing: 12) {
                        Toggle(isOn: $shipToOther.animation(.snappy)) { Text("An eine andere Adresse liefern").font(.wr(.subheadline, .semibold)) }
                            .tint(.moss)
                            .padding(.horizontal, 4)
                        if shipToOther {
                            VStack(spacing: 0) {
                                field("Name der Empfängerin / des Empfängers", text: $shipName, key: "address.name", focus: .shipName, content: .name)
                                field("Strasse und Hausnummer", text: $shipLine1, key: "address.line1", focus: .shipLine1, content: .fullStreetAddress)
                                field("Adresszusatz (optional)", text: $shipLine2, key: "address.line2", focus: .shipLine2, content: .streetAddressLine2)
                                HStack(spacing: 12) {
                                    field("PLZ", text: $shipPostalCode, key: "address.postalCode", focus: .shipPostalCode, content: .postalCode, keyboard: .numbersAndPunctuation)
                                        .frame(maxWidth: 110)
                                    field("Ort", text: $shipCity, key: "address.city", focus: .shipCity, content: .addressCity)
                                }
                                countryRow(selection: $shipCountry, key: "address.country")
                            }
                            .cardSurface(radius: Radius.inner)
                            .transition(.opacity.combined(with: .move(edge: .top)))
                        }
                    }
                }

                // Notiz
                VStack(alignment: .leading, spacing: 10) {
                    SectionHeader("Nachricht an den Shop", number: "02", subtitle: "Optional – z. B. Wunschfarbe oder Liefertermin.")
                    TextField("Deine Nachricht …", text: $note, axis: .vertical)
                        .lineLimit(3...6)
                        .focused($focus, equals: .note)
                        .padding(14)
                        .cardSurface(radius: Radius.inner)
                    if note.count > 1000 { MarketFieldError(text: "Höchstens 1000 Zeichen") }
                }

                // Zusammenfassung
                VStack(alignment: .leading, spacing: 12) {
                    SectionHeader("Deine Bestellung", number: "03")
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(c.groups) { g in
                            VStack(alignment: .leading, spacing: 6) {
                                Text(g.shop.name).font(.wr(.subheadline, .semibold))
                                ForEach(g.lines) { l in
                                    HStack(alignment: .firstTextBaseline) {
                                        Text("\(l.quantity) × \(l.title)\(l.variantName.map { " (\($0))" } ?? "")").font(.wr(.footnote)).foregroundStyle(Color.ink2)
                                        Spacer(minLength: 8)
                                        Text(Fmt.money(l.lineMinor)).font(.wr(.footnote)).monospacedDigit()
                                    }
                                }
                                HStack {
                                    Text("Versand").font(.wr(.caption)).foregroundStyle(Color.muted)
                                    Spacer()
                                    Text(g.fees.shipping == 0 ? "kostenlos" : Fmt.money(g.fees.shipping)).font(.wr(.caption)).monospacedDigit().foregroundStyle(Color.muted)
                                }
                                if let d = g.shop.processingDays, !g.lines.allSatisfy(\.isDigital) {
                                    Text("Versand in ca. \(Fmt.plural(d, "Werktag", "Werktagen"))").font(.wr(.caption2)).foregroundStyle(Color.muted)
                                }
                            }
                            .padding(16)
                            .hairline()
                        }
                        VStack(alignment: .leading, spacing: 8) {
                            MarketFeeSummary(subtotal: c.totals.subtotal, shipping: c.totals.shipping, total: c.totals.total)
                            Text("Endpreis. Keine Zusatzgebühren für Käufer:innen.").font(.wr(.caption)).foregroundStyle(Color.muted)
                        }
                        .padding(16)
                    }
                    .cardSurface()
                }

                VStack(alignment: .leading, spacing: 10) {
                    if c.mode == "simulated" {
                        NoticeView(tone: .warn, title: "Testmodus – keine echte Zahlung", message: "Nach dem Bestellen kannst du eine erfolgreiche oder fehlgeschlagene Zahlung simulieren.")
                    }
                    if c.groups.count > 1 {
                        NoticeView(tone: .info, title: "\(c.groups.count) getrennte Bestellungen", message: "Jeder Shop erhält eine eigene Bestellung mit eigener Zahlung, eigenem Versand und eigenem Beleg.")
                    }
                    NoticeView(tone: .info, title: "Provision & Zahlungsanbieter", message: "Die Shops zahlen eine Plattformprovision von \(Fmt.percent(bps: c.feeBps)) auf den Warenwert – sie ist im Preis enthalten. \(c.mode == "stripe" ? "Du bezahlst sicher über Stripe; Kartendaten werden nicht bei Werkuno gespeichert." : "Im Testmodus wird nichts belastet.")")
                    if let submitError { NoticeView(tone: .danger, message: submitError) }
                }

                Text("Mit der Bestellung akzeptierst du die Marktplatz-Richtlinien und die Rückgabebedingungen der Shops.")
                    .font(.wr(.caption)).foregroundStyle(Color.muted)
            }
            .padding(.horizontal, Space.gutter)
            .padding(.bottom, 120)
        }
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom) { orderBar(c) }
    }

    private func field(_ title: String, text: Binding<String>, key: String, focus f: Field, content: UITextContentType, keyboard: UIKeyboardType = .default) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            TextField(title, text: text)
                .textContentType(content)
                .keyboardType(keyboard)
                .focused($focus, equals: f)
                .submitLabel(.next)
                .onSubmit { advance(from: f) }
                .onChange(of: text.wrappedValue) { _, _ in fieldErrors[key] = nil }
            MarketFieldError(text: fieldErrors[key])
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .hairline()
    }

    private func countryRow(selection: Binding<String>, key: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text("Land").foregroundStyle(Color.ink2)
                Spacer()
                Picker("Land", selection: selection) {
                    ForEach(L.shipCountries, id: \.key) { Text($0.label).tag($0.key) }
                }
                .labelsHidden()
                .onChange(of: selection.wrappedValue) { _, _ in fieldErrors[key] = nil }
            }
            MarketFieldError(text: fieldErrors[key])
        }
        .padding(.horizontal, 14).padding(.vertical, 6)
        .hairline()
    }

    private func advance(from f: Field) {
        switch f {
        case .firstName: focus = .lastName
        case .lastName: focus = .line1
        case .line1: focus = .line2
        case .line2: focus = .postalCode
        case .postalCode: focus = .city
        case .city: focus = .phone
        case .shipName: focus = .shipLine1
        case .shipLine1: focus = .shipLine2
        case .shipLine2: focus = .shipPostalCode
        case .shipPostalCode: focus = .shipCity
        default: focus = nil
        }
    }

    private func orderBar(_ c: MarketCart) -> some View {
        VStack(spacing: 4) {
            Button { Task { await submit(c) } } label: {
                HStack(spacing: 8) {
                    if submitting { ProgressView().tint(.white) } else { Image(systemName: "lock.fill") }
                    Text(submitting ? "Einen Moment …" : "Zahlungspflichtig bestellen · \(Fmt.money(c.totals.total))")
                        .monospacedDigit()
                }
                .font(.wr(.body, .semibold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 4)
            }
            .buttonStyle(.glassProminent)
            .tint(.moss)
            .controlSize(.large)
            .disabled(submitting)
        }
        .padding(.horizontal, 14)
        .padding(.bottom, 6)
    }

    // MARK: Bestellen

    /// Spiegelt `customerDetailsSchema` / `shippingAddressSchema` grob – der Server prüft verbindlich.
    private func validate(digitalOnly: Bool) -> Bool {
        var e: [String: String] = [:]
        if firstName.trimmed.isEmpty { e["details.firstName"] = "Pflichtfeld" } else if firstName.trimmed.count > 60 { e["details.firstName"] = "Höchstens 60 Zeichen" }
        if lastName.trimmed.isEmpty { e["details.lastName"] = "Pflichtfeld" } else if lastName.trimmed.count > 60 { e["details.lastName"] = "Höchstens 60 Zeichen" }
        if line1.trimmed.count < 3 { e["details.line1"] = "Strasse und Hausnummer angeben" }
        let plz = postalCode.trimmed
        if plz.isEmpty { e["details.postalCode"] = "PLZ angeben" }
        else if plz.range(of: country == "DE" ? "^[0-9]{5}$" : "^[0-9]{4}$", options: .regularExpression) == nil { e["details.postalCode"] = country == "DE" ? "5-stellige PLZ" : "4-stellige PLZ" }
        if city.trimmed.count < 2 { e["details.city"] = "Ort angeben" }
        let tel = phone.trimmed
        if !tel.isEmpty && (tel.count > 30 || tel.range(of: "^\\+?[0-9 ()/.-]{7,}$", options: .regularExpression) == nil) { e["details.phone"] = "Ungültige Telefonnummer" }
        if shipToOther && !digitalOnly {
            if shipName.trimmed.count < 2 { e["address.name"] = "Bitte gib den Namen an" }
            if shipLine1.trimmed.count < 2 { e["address.line1"] = "Adresse fehlt" }
            if shipPostalCode.trimmed.count < 3 { e["address.postalCode"] = "PLZ fehlt" }
            if shipCity.trimmed.isEmpty { e["address.city"] = "Ort fehlt" }
        }
        withAnimation { fieldErrors = e }
        return e.isEmpty && note.count <= 1000
    }

    private func submit(_ c: MarketCart) async {
        guard !submitting else { return }
        submitError = nil
        let digitalOnly = page?.digitalOnly ?? false
        guard validate(digitalOnly: digitalOnly) else { Haptics.warning(); return }
        focus = nil
        submitting = true
        defer { submitting = false }
        // Eingegebene Angaben immer mitsenden – sonst nimmt der Server die gespeicherten (`details ?? saved`).
        let details: JSONValue = [
            "firstName": .string(firstName.trimmed), "lastName": .string(lastName.trimmed),
            "line1": .string(line1.trimmed), "line2": .string(line2.trimmed),
            "postalCode": .string(postalCode.trimmed), "city": .string(city.trimmed), "country": .string(country),
            "phone": .string(phone.trimmed),
        ]
        let ship = shipToOther && !digitalOnly
        var body: [String: JSONValue] = [
            "details": details,
            "saveDetails": .bool(!hasSavedDetails || saveDetails),
            "shipToOther": .bool(ship),
            "buyerNote": .string(note.trimmed),
            "idempotencyKey": .string(idempotencyKey),
            "expectedTotalMinor": .number(Double(c.totals.total)),
        ]
        if ship {
            body["address"] = [
                "name": .string(shipName.trimmed), "line1": .string(shipLine1.trimmed), "line2": .string(shipLine2.trimmed),
                "postalCode": .string(shipPostalCode.trimmed), "city": .string(shipCity.trimmed), "country": .string(shipCountry),
            ]
        }
        do {
            let r: MarketCheckoutStarted = try await APIClient.shared.post("/checkout", body)
            started = r
            await app.refreshCounts()
            if r.mode == "simulated" {
                simulate = MarketSimulation(orderIds: r.orderIds, totalMinor: c.totals.total)
            } else if let u = AppConfig.resolve(r.url) {
                webPay = MarketWebLink(url: u)
            }
        } catch let e as APIError {
            if let f = e.fields { fieldErrors = f }
            submitError = e.message
            Haptics.warning()
            if e.marketIsConflict {
                // Preis/Bestand geändert → neu laden, neue Bestätigung nötig
                idempotencyKey = UUID().uuidString
                await load()
            }
        } catch {
            submitError = error.localizedDescription
        }
    }

    /// Rückkehr aus Stripe Checkout: Status der ersten Bestellung prüfen.
    private func afterStripe() async {
        guard let ids = started?.orderIds, let first = ids.first else { return }
        // Webhook braucht einen Moment
        for _ in 0..<3 {
            if let o: MarketBuyerOrderEnvelope = try? await APIClient.shared.get("/orders/\(first)"), o.order.status != "PENDING_PAYMENT" {
                await finish(ids: ids, paid: o.order.isPaid || o.order.status == "NEW")
                return
            }
            try? await Task.sleep(for: .seconds(1.5))
        }
        withAnimation { outcome = .pending(ids) }
        await app.refreshCounts()
    }

    private func finish(ids: [String], paid: Bool) async {
        await app.refreshCounts()
        withAnimation(.smooth) { outcome = paid ? .paid(ids) : .failed(ids) }
        if paid { celebrate += 1; Haptics.success() }
    }

    // MARK: Abschluss

    @ViewBuilder private func done(_ o: Outcome) -> some View {
        ScrollView {
            VStack(spacing: 20) {
                switch o {
                case .paid(let ids):
                    ThreeCanvas(scene: .knot(color: .moss), celebrateToken: celebrate)
                        .frame(height: 240)
                    VStack(spacing: 8) {
                        SpecLabel("Bestellung bestätigt", color: .moss)
                        Text("Danke – der Faden ist geknüpft.").font(.display(28)).multilineTextAlignment(.center)
                        Text(ids.count > 1 ? "Deine \(ids.count) Bestellungen sind bezahlt. Die Shops wurden informiert und melden sich, sobald es losgeht." : "Deine Bestellung ist bezahlt. Der Shop wurde informiert und meldet sich, sobald sie unterwegs ist.")
                            .font(.wr(.subheadline)).foregroundStyle(Color.muted).multilineTextAlignment(.center)
                    }
                    VStack(spacing: 10) {
                        ForEach(Array(ids.enumerated()), id: \.element) { i, id in
                            Button { router.open(.order(id: id)) } label: {
                                Label(ids.count > 1 ? "Bestellung \(i + 1) ansehen" : "Bestellung ansehen", systemImage: "shippingbox").frame(maxWidth: .infinity)
                            }
                            .modifier(MarketPrimaryIf(primary: i == 0))
                        }
                        Button { router.tab = .market; router.popToRoot() } label: { Text("Weiter stöbern").frame(maxWidth: .infinity) }
                            .buttonStyle(.glass).controlSize(.large)
                    }
                case .failed(let ids):
                    Image(systemName: "xmark.octagon").font(.wr(size: 52)).foregroundStyle(Color.danger).padding(.top, 50)
                    VStack(spacing: 8) {
                        Text("Zahlung nicht abgeschlossen").font(.display(26)).multilineTextAlignment(.center)
                        Text("Es wurde nichts belastet. Die Reservierung ist freigegeben – du kannst es erneut versuchen.").font(.wr(.subheadline)).foregroundStyle(Color.muted).multilineTextAlignment(.center)
                    }
                    Button { router.open(.cart) } label: { Text("Zurück zum Warenkorb").frame(maxWidth: .infinity) }.primaryButton()
                    if let id = ids.first {
                        Button { router.open(.order(id: id)) } label: { Text("Bestellung ansehen").frame(maxWidth: .infinity) }.buttonStyle(.glass).controlSize(.large)
                    }
                case .pending(let ids):
                    YarnSpinner(size: 56).padding(.top, 50)
                    VStack(spacing: 8) {
                        Text("Zahlung wird geprüft").font(.display(26)).multilineTextAlignment(.center)
                        Text("Sobald der Zahlungsanbieter die Zahlung bestätigt, ist deine Bestellung verbindlich. Offene Zahlungen findest du im Warenkorb.").font(.wr(.subheadline)).foregroundStyle(Color.muted).multilineTextAlignment(.center)
                    }
                    if let id = ids.first {
                        Button { router.open(.order(id: id)) } label: { Text("Bestellung ansehen").frame(maxWidth: .infinity) }.primaryButton()
                    }
                    Button { router.open(.cart) } label: { Text("Zum Warenkorb").frame(maxWidth: .infinity) }.buttonStyle(.glass).controlSize(.large)
                }
            }
            .padding(Space.gutter)
        }
    }
}

struct MarketPrimaryIf: ViewModifier {
    var primary: Bool
    func body(content: Content) -> some View {
        if primary { content.primaryButton() } else { content.buttonStyle(.glass).controlSize(.large) }
    }
}
