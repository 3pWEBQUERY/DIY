import SwiftUI

/// Shop eröffnen bzw. Einstellungen bearbeiten (PRD §13.2) – mehrstufiger Assistent nach `shopSetupSchema`,
/// danach Verifizierung (Testmodus oder Stripe-Onboarding).
struct ShopWizardSheet: View {
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss

    enum Step: Int, CaseIterable { case shop, legal, policies, review, verify
        var title: String {
            switch self {
            case .shop: "Dein Shop"
            case .legal: "Rechtliches"
            case .policies: "Versand & Rückgabe"
            case .review: "Prüfen & einreichen"
            case .verify: "Verifizierung"
            }
        }
    }

    @State private var studio: MarketStudioShop?
    @State private var loadError: String?
    @State private var step: Step = .shop

    // Formular (shopSetupSchema)
    @State private var name = ""
    @State private var slug = ""
    @State private var slugTouched = false
    @State private var tagline = ""
    @State private var description = ""
    @State private var sellerType = "PRIVATE"
    @State private var legalName = ""
    @State private var businessName = ""
    @State private var vatId = ""
    @State private var addressLine = ""
    @State private var postalCode = ""
    @State private var city = ""
    @State private var country = "CH"
    @State private var shippingPolicy = "Versand mit der Schweizerischen Post innert 3 Werktagen."
    @State private var returnPolicy = "Rückgabe innert 14 Tagen in unbenutztem Zustand. Auf Bestellung gefertigte Stücke sind vom Umtausch ausgeschlossen."
    @State private var processingDays = 3

    @State private var slugState: MarketSlugCheck?
    @State private var fields: [String: String] = [:]
    @State private var formError: String?
    @State private var saving = false
    @State private var webOnboarding: MarketWebLink?
    @State private var verified = false

    private var shop: MarketMyShop? { studio?.shop }
    private var slugLocked: Bool { shop != nil && shop?.status != "DRAFT" }
    private var isSettingsEdit: Bool { shop?.status == "ACTIVE" || shop?.status == "PAUSED" }
    private var steps: [Step] { isSettingsEdit ? [.shop, .legal, .policies] : Step.allCases }

    var body: some View {
        NavigationStack {
            Group {
                if studio != nil { wizard }
                else if let loadError { ErrorStateView(message: loadError) { await load() } }
                else { LoadingView() }
            }
            .background(Color.paper)
            .navigationTitle(isSettingsEdit ? "Shop-Einstellungen" : "Shop eröffnen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(verified ? "Fertig" : "Schliessen") { dismiss() } }
                if isSettingsEdit {
                    ToolbarItem(placement: .confirmationAction) {
                        Button { Task { await save(submit: false, close: true) } } label: {
                            if saving { ProgressView() } else { Text("Speichern").fontWeight(.semibold) }
                        }
                        .disabled(saving)
                    }
                }
            }
            .task { if studio == nil { await load() } }
            .sheet(item: $webOnboarding, onDismiss: { Task { await refreshStripe() } }) { l in SafariSheet(url: l.url).ignoresSafeArea() }
        }
        .interactiveDismissDisabled(saving)
    }

    // MARK: Laden

    private func load() async {
        do {
            let s: MarketStudioShop = try await APIClient.shared.get("/studio/shop")
            studio = s
            loadError = nil
            if let sh = s.shop { apply(sh) }
            else { legalName = app.me?.profile?.displayName ?? "" }
            if let sh = s.shop, sh.status == "PENDING_VERIFICATION" { step = .verify }
        } catch is CancellationError {
        } catch {
            loadError = (error as? APIError)?.message ?? error.localizedDescription
        }
    }

    private func apply(_ s: MarketMyShop) {
        name = s.name
        slug = s.slug
        slugTouched = true
        tagline = s.tagline ?? ""
        description = s.description ?? ""
        sellerType = s.sellerType ?? "PRIVATE"
        country = s.country ?? "CH"
        shippingPolicy = s.shippingPolicy ?? ""
        returnPolicy = s.returnPolicy ?? ""
        processingDays = s.processingDays ?? 3
        let v = s.verification
        legalName = v?.legalName ?? ""
        businessName = v?.businessName ?? ""
        vatId = v?.vatId ?? ""
        addressLine = v?.addressLine ?? ""
        postalCode = v?.postalCode ?? ""
        city = v?.city ?? ""
    }

    // MARK: Assistent

    private var wizard: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                progress
                if let formError { NoticeView(tone: .danger, message: formError) }
                switch step {
                case .shop: shopStep
                case .legal: legalStep
                case .policies: policiesStep
                case .review: reviewStep
                case .verify: verifyStep
                }
            }
            .padding(Space.gutter)
            .padding(.bottom, 100)
            .animation(.smooth, value: step)
        }
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom) { if step != .verify { navBar } }
    }

    private var progress: some View {
        VStack(alignment: .leading, spacing: 8) {
            SpecLabel("Schritt \((steps.firstIndex(of: step) ?? 0) + 1) von \(steps.count) · \(step.title)", color: .moss)
            HStack(spacing: 4) {
                ForEach(steps, id: \.self) { s in
                    Capsule().fill(s.rawValue <= step.rawValue ? Color.moss : Color.lineStrong).frame(height: 3)
                }
            }
            .accessibilityHidden(true)
        }
    }

    private var navBar: some View {
        HStack(spacing: 10) {
            if step != steps.first {
                Button { go(-1) } label: { Label("Zurück", systemImage: "chevron.left") }
                    .buttonStyle(.glass).controlSize(.large)
            }
            Spacer()
            if step == .review {
                Button { Task { await save(submit: false, close: false) } } label: { Text("Entwurf") }
                    .buttonStyle(.glass).controlSize(.large).disabled(saving)
                Button { Task { await save(submit: true, close: false) } } label: {
                    if saving { ProgressView().tint(.white) } else { Label("Einreichen", systemImage: "paperplane") }
                }
                .buttonStyle(.glassProminent).tint(.moss).controlSize(.large)
                .disabled(saving || studio?.emailVerified == false)
            } else if step != steps.last {
                Button { go(1) } label: { Label("Weiter", systemImage: "chevron.right") }
                    .buttonStyle(.glassProminent).tint(.moss).controlSize(.large)
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 6)
    }

    private func go(_ d: Int) {
        if d > 0 && !validate(step) { Haptics.warning(); return }
        let all = steps
        guard let i = all.firstIndex(of: step), all.indices.contains(i + d) else { return }
        formError = nil
        withAnimation(.smooth) { step = all[i + d] }
    }

    // MARK: Schritte

    private var shopStep: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Zeig, wer hinter deinen Arbeiten steht.").font(.display(24))
            MarketWizardField(title: "Name des Shops", text: $name, error: fields["name"], prompt: "z. B. Lenas Maschen")
                .onChange(of: name) { _, v in if !slugTouched && !slugLocked { slug = MarketSlug.make(v) } }
            VStack(alignment: .leading, spacing: 6) {
                Text("Shop-Adresse").font(.wr(.subheadline, .semibold))
                HStack(spacing: 0) {
                    Text("werkuno …/markt/").font(.wr(.subheadline).monospaced()).foregroundStyle(Color.muted)
                    TextField("dein-shop", text: $slug)
                        .font(.wr(.subheadline).monospaced())
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .disabled(slugLocked)
                        .onChange(of: slug) { _, _ in slugTouched = true; fields["slug"] = nil }
                }
                .padding(12)
                .cardSurface(radius: Radius.inner)
                if slugLocked {
                    Text("Die Adresse bleibt nach der Einreichung stabil, damit geteilte Links nicht brechen.").font(.wr(.caption)).foregroundStyle(Color.muted)
                } else if let s = slugState {
                    Label(s.message ?? (s.ok ? "Verfügbar" : "Nicht verfügbar"), systemImage: s.ok ? "checkmark.circle.fill" : "xmark.circle.fill")
                        .font(.wr(.caption)).foregroundStyle(s.ok ? Color.moss : Color.danger)
                }
                MarketFieldError(text: fields["slug"])
            }
            .task(id: slug) { await checkSlug() }
            MarketWizardField(title: "Kurzbeschreibung (optional)", text: $tagline, error: fields["tagline"], prompt: "z. B. Gehäkeltes aus Naturgarn")
            MarketWizardField(title: "Über deinen Shop (optional)", text: $description, error: fields["description"], prompt: "Wie arbeitest du, welche Materialien nutzt du?", axis: .vertical)
        }
    }

    private var legalStep: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Angaben für Käufer:innen und Zahlungsanbieter.").font(.display(24))
            VStack(alignment: .leading, spacing: 6) {
                Text("Du verkaufst als").font(.wr(.subheadline, .semibold))
                Picker("Verkäufertyp", selection: $sellerType) {
                    ForEach(L.sellerType, id: \.key) { Text($0.label).tag($0.key) }
                }
                .pickerStyle(.segmented)
                Text(sellerType == "BUSINESS" ? "Gewerbliche Shops weisen Firmenname und – falls vorhanden – MWST-Nummer aus." : "Als Privatperson verkaufst du gelegentlich eigene Arbeiten.")
                    .font(.wr(.caption)).foregroundStyle(Color.muted)
            }
            MarketWizardField(title: "Rechtlicher Name", text: $legalName, error: fields["legalName"], prompt: "Vor- und Nachname")
            if sellerType == "BUSINESS" {
                MarketWizardField(title: "Firmenname", text: $businessName, error: fields["businessName"], prompt: "z. B. Atelier Muster GmbH")
                MarketWizardField(title: "MWST-/USt-Nummer (optional)", text: $vatId, error: fields["vatId"], prompt: "CHE-123.456.789")
            }
            MarketWizardField(title: "Adresse", text: $addressLine, error: fields["addressLine"], prompt: "Strasse und Hausnummer")
            HStack(alignment: .top, spacing: 12) {
                MarketWizardField(title: "PLZ", text: $postalCode, error: fields["postalCode"], prompt: "8000").frame(maxWidth: 110)
                MarketWizardField(title: "Ort", text: $city, error: fields["city"], prompt: "Zürich")
            }
            VStack(alignment: .leading, spacing: 6) {
                Text("Land").font(.wr(.subheadline, .semibold))
                Picker("Land", selection: $country) {
                    ForEach(L.shipCountries, id: \.key) { Text($0.label).tag($0.key) }
                }
                .pickerStyle(.segmented)
            }
            Text("Diese Angaben werden für die Verifizierung genutzt. Öffentlich sichtbar sind bei gewerblichen Shops Firmenname, Adresse und MWST-Nummer.")
                .font(.wr(.caption)).foregroundStyle(Color.muted)
        }
    }

    private var policiesStep: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Klare Regeln schaffen Vertrauen.").font(.display(24))
            MarketWizardField(title: "Versandrichtlinie", text: $shippingPolicy, error: fields["shippingPolicy"], prompt: "Womit und wie schnell versendest du?", axis: .vertical)
            MarketWizardField(title: "Rückgaberichtlinie", text: $returnPolicy, error: fields["returnPolicy"], prompt: "Was gilt bei Rückgabe und Umtausch?", axis: .vertical)
            VStack(alignment: .leading, spacing: 6) {
                Stepper(value: $processingDays, in: 0...120) {
                    HStack {
                        Text("Bearbeitungszeit").font(.wr(.subheadline, .semibold))
                        Spacer()
                        Text(Fmt.plural(processingDays, "Werktag", "Werktage")).font(.wr(.subheadline)).monospacedDigit().foregroundStyle(Color.ink2)
                    }
                }
                Text("So lange brauchst du in der Regel bis zum Versand.").font(.wr(.caption)).foregroundStyle(Color.muted)
            }
            .padding(14)
            .cardSurface(radius: Radius.inner)
        }
    }

    private var reviewStep: some View {
        let fee = studio?.feeBps ?? app.feeBps
        return VStack(alignment: .leading, spacing: 18) {
            Text("Fast geschafft.").font(.display(24))
            VStack(spacing: 0) {
                SpecRow(label: "Shop", value: name, symbol: "storefront")
                SpecRow(label: "Adresse", value: "/markt/\(slug)", symbol: "link")
                SpecRow(label: "Verkäufertyp", value: L.sellerType.first { $0.key == sellerType }?.label ?? sellerType, symbol: "person")
                SpecRow(label: "Rechtlicher Name", value: sellerType == "BUSINESS" ? "\(businessName) (\(legalName))" : legalName, symbol: "signature")
                SpecRow(label: "Sitz", value: [postalCode, city, L.country(country)].filter { !$0.isEmpty }.joined(separator: " "), symbol: "mappin")
                SpecRow(label: "Bearbeitungszeit", value: Fmt.plural(processingDays, "Werktag", "Werktage"), symbol: "hourglass")
            }
            VStack(alignment: .leading, spacing: 8) {
                SectionHeader("Provision – transparent", subtitle: "Bevor du etwas verkaufst, sollst du wissen, was es kostet.")
                Text("Werkuno behält eine Plattformprovision von \(Fmt.percent(bps: fee)) auf den Warenwert ein – nur bei abgeschlossenen Verkäufen, nicht auf den Versand. Gebühren des Zahlungsanbieters (Stripe) kommen separat dazu. Es gibt keine Grundgebühr und keine bezahlten Platzierungen.")
                    .font(.wr(.subheadline)).foregroundStyle(Color.ink2).fixedSize(horizontal: false, vertical: true)
                let example = 5000
                let f = MarketFee.platformFee(subtotal: example, bps: fee)
                VStack(spacing: 6) {
                    MarketAmountRow(label: "Beispiel: Verkauf zu", value: Fmt.money(example))
                    MarketAmountRow(label: "Provision \(Fmt.percent(bps: fee))", value: "− " + Fmt.money(f), muted: true)
                    MarketAmountRow(label: "Dein Anteil vor Zahlungsgebühren", value: Fmt.money(example - f), strong: true)
                }
                .padding(14)
                .sunkenSurface()
            }
            if studio?.emailVerified == false {
                NoticeView(tone: .warn, title: "E-Mail bestätigen", message: "Bitte bestätige zuerst deine E-Mail-Adresse. Du kannst den Shop bis dahin als Entwurf speichern.")
            }
            Text("Mit dem Einreichen bestätigst du die Verkäuferbedingungen und die Marktplatz-Richtlinien. Nach der Verifizierung ist dein Shop öffentlich.")
                .font(.wr(.caption)).foregroundStyle(Color.muted)
        }
    }

    @ViewBuilder private var verifyStep: some View {
        let mode = studio?.payments ?? app.paymentsMode
        VStack(alignment: .leading, spacing: 18) {
            if verified {
                VStack(alignment: .leading, spacing: 10) {
                    Image(systemName: "checkmark.seal.fill").font(.wr(size: 44)).foregroundStyle(Color.moss)
                    Text("Dein Shop ist aktiv.").font(.display(26))
                    Text("Du kannst jetzt Produkte veröffentlichen. Lege dein erstes Angebot im Werkuno Studio unter „Produkte“ an.").font(.wr(.subheadline)).foregroundStyle(Color.ink2)
                }
                Button { dismiss() } label: { Text("Fertig").frame(maxWidth: .infinity) }.primaryButton()
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Verifizierung").font(.display(26))
                    Text("Damit Käufer:innen dir vertrauen können und Auszahlungen sicher ankommen, prüfen wir deine Angaben. Erst danach ist dein Shop öffentlich.")
                        .font(.wr(.subheadline)).foregroundStyle(Color.ink2).fixedSize(horizontal: false, vertical: true)
                }
                if let s = shop { HStack { Text("Status").font(.wr(.subheadline)).foregroundStyle(Color.muted); Spacer(); MarketStatusPill.shop(s.status) } }
                if let n = shop?.verification?.notes?.nilIfEmpty { NoticeView(tone: .info, message: n) }
                switch mode {
                case "simulated":
                    NoticeView(tone: .warn, title: "Testmodus", message: "Ohne Zahlungsanbieter kannst du die Verifizierung simulieren, um den Ablauf zu testen.")
                    AsyncButton { await simulateVerification() } label: { Label("Testmodus: Shop verifizieren", systemImage: "checkmark.seal") }
                        .primaryButton()
                case "stripe":
                    Text("Die Verifizierung läuft über Stripe Connect: Identität, Bankkonto und – bei gewerblichen Shops – Firmenangaben. Das dauert meist wenige Minuten.")
                        .font(.wr(.footnote)).foregroundStyle(Color.muted)
                    AsyncButton { await startStripe() } label: { Label(shop?.stripeAccountId == nil ? "Mit Stripe verifizieren" : "Stripe-Onboarding fortsetzen", systemImage: "lock.shield") }
                        .primaryButton()
                    if shop?.stripeAccountId != nil {
                        AsyncButton { await refreshStripe() } label: { Label("Status aktualisieren", systemImage: "arrow.clockwise").frame(maxWidth: .infinity) }
                            .buttonStyle(.glass).controlSize(.large)
                    }
                default:
                    NoticeView(tone: .info, title: "Zahlungen noch nicht aktiviert", message: "Die Verifizierung über den Zahlungsanbieter ist möglich, sobald Zahlungen freigeschaltet sind. Ein Admin kann deinen Shop auch manuell freigeben – du wirst benachrichtigt.")
                }
                if shop?.status == "PENDING_VERIFICATION" {
                    Button { withAnimation { step = .shop } } label: { Label("Angaben bearbeiten", systemImage: "pencil") }
                        .buttonStyle(.glass)
                }
            }
        }
    }

    // MARK: Prüfung

    private func validate(_ s: Step) -> Bool {
        var e: [String: String] = [:]
        switch s {
        case .shop:
            if name.trimmed.count < 2 { e["name"] = "Name ist zu kurz" }
            if name.count > 60 { e["name"] = "Höchstens 60 Zeichen" }
            if !slugLocked {
                if let m = MarketSlug.problem(slug) { e["slug"] = m }
                else if slugState?.ok == false { e["slug"] = slugState?.message ?? "Bereits vergeben" }
            }
            if tagline.count > 120 { e["tagline"] = "Höchstens 120 Zeichen" }
        case .legal:
            if legalName.trimmed.count < 2 { e["legalName"] = "Bitte gib den rechtlichen Namen an" }
            if sellerType == "BUSINESS" && businessName.trimmed.isEmpty { e["businessName"] = "Firmenname ist für gewerbliche Shops Pflicht" }
            if sellerType == "BUSINESS", !vatId.trimmed.isEmpty, vatId.trimmed.range(of: #"^[A-Za-z]{2,3}[-\s]?[0-9A-Za-z.\s-]{5,20}$"#, options: .regularExpression) == nil {
                e["vatId"] = "Bitte eine gültige MWST-/USt-Nummer angeben (z. B. CHE-123.456.789)"
            }
            if addressLine.trimmed.count < 2 { e["addressLine"] = "Adresse fehlt" }
            if postalCode.trimmed.count < 3 { e["postalCode"] = "PLZ fehlt" }
            if city.trimmed.isEmpty { e["city"] = "Ort fehlt" }
        default: break
        }
        withAnimation { fields = e }
        return e.isEmpty
    }

    private func checkSlug() async {
        guard !slugLocked else { slugState = nil; return }
        let s = slug.trimmed.lowercased()
        if s.isEmpty { slugState = nil; return }
        if let m = MarketSlug.problem(s) { slugState = MarketSlugCheck(ok: false, message: m); return }
        try? await Task.sleep(for: .milliseconds(450))
        guard !Task.isCancelled else { return }
        if let r: MarketSlugCheck = try? await APIClient.shared.post("/studio/shop/slug-check", ["slug": JSONValue.string(s)]) {
            withAnimation(.snappy) { slugState = r }
        }
    }

    // MARK: Speichern & Verifizieren

    private var input: [String: JSONValue] {
        [
            "name": .string(name.trimmed), "slug": .string(slug.trimmed.lowercased()), "tagline": .string(tagline.trimmed), "description": .string(description.trimmed),
            "sellerType": .string(sellerType), "legalName": .string(legalName.trimmed),
            "businessName": .string(sellerType == "BUSINESS" ? businessName.trimmed : ""), "vatId": .string(sellerType == "BUSINESS" ? vatId.trimmed : ""),
            "addressLine": .string(addressLine.trimmed), "postalCode": .string(postalCode.trimmed), "city": .string(city.trimmed), "country": .string(country),
            "shippingPolicy": .string(shippingPolicy.trimmed), "returnPolicy": .string(returnPolicy.trimmed), "processingDays": .number(Double(processingDays)),
        ]
    }

    private func save(submit: Bool, close: Bool) async {
        for s in [Step.shop, .legal, .policies] where !validate(s) {
            withAnimation { step = s }
            formError = "Bitte prüfe die markierten Felder."
            Haptics.warning()
            return
        }
        saving = true
        defer { saving = false }
        formError = nil
        do {
            let r: MarketMessage = try await APIClient.shared.put("/studio/shop", ["input": JSONValue.object(input), "submit": .bool(submit)])
            await reloadStudio()
            await app.refresh()
            Haptics.success()
            if close {
                app.show("Shop-Einstellungen gespeichert.")
                dismiss()
            } else if submit || r.status == "PENDING_VERIFICATION" {
                app.show("Antrag eingereicht.")
                if r.status == "ACTIVE" { verified = true }
                withAnimation { step = .verify }
            } else {
                app.show("Als Entwurf gespeichert.")
                dismiss()
            }
        } catch let e as APIError {
            fields = e.fields ?? [:]
            formError = e.message
            if fields.keys.contains(where: { ["name", "slug", "tagline", "description"].contains($0) }) { step = .shop }
            else if fields.keys.contains(where: { ["legalName", "businessName", "vatId", "addressLine", "postalCode", "city", "country", "sellerType"].contains($0) }) { step = .legal }
            Haptics.warning()
        } catch {
            formError = error.localizedDescription
        }
    }

    private func reloadStudio() async {
        if let s: MarketStudioShop = try? await APIClient.shared.get("/studio/shop") { studio = s }
    }

    private func simulateVerification() async {
        let ok = await app.run("Testmodus: Shop verifiziert und aktiv.") {
            _ = try await APIClient.shared.post("/studio/shop/simulate-verification") as JSONValue
        }
        if ok {
            await reloadStudio()
            await app.refresh()
            withAnimation { verified = true }
        }
    }

    private func startStripe() async {
        do {
            let r: MarketURLResult = try await APIClient.shared.post("/studio/shop/stripe-onboarding")
            if let u = AppConfig.resolve(r.url) { webOnboarding = MarketWebLink(url: u) }
        } catch { app.show(error: error) }
    }

    private func refreshStripe() async {
        do {
            let r: MarketMessage = try await APIClient.shared.post("/studio/shop/stripe-refresh")
            await reloadStudio()
            await app.refresh()
            if r.status == "ACTIVE" {
                withAnimation { verified = true }
                app.show("Verifiziert – dein Shop ist aktiv.")
            } else {
                app.show("Die Prüfung läuft noch. Wir benachrichtigen dich, sobald dein Shop aktiv ist.", style: .info)
            }
        } catch { app.show(error: error) }
    }
}

// MARK: - Bausteine

struct MarketWizardField: View {
    var title: String
    @Binding var text: String
    var error: String?
    var prompt: String = ""
    var axis: Axis = .horizontal

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.wr(.subheadline, .semibold))
            TextField(prompt, text: $text, axis: axis)
                .lineLimit(axis == .vertical ? 3...10 : 1...1)
                .padding(12)
                .cardSurface(radius: Radius.inner)
                .overlay(RoundedRectangle(cornerRadius: Radius.inner, style: .continuous).strokeBorder(error == nil ? Color.clear : Color.danger, lineWidth: 1))
                .accessibilityLabel(title)
            MarketFieldError(text: error)
        }
    }
}

enum MarketSlug {
    static func make(_ s: String) -> String {
        let map: [Character: String] = ["ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss", "é": "e", "è": "e", "ê": "e", "à": "a", "â": "a", "ç": "c", "î": "i", "ô": "o", "û": "u"]
        var out = ""
        for ch in s.lowercased() {
            if let r = map[ch] { out += r }
            else if ch.isASCII && (ch.isLetter || ch.isNumber) { out.append(ch) }
            else { out += "-" }
        }
        while out.contains("--") { out = out.replacingOccurrences(of: "--", with: "-") }
        out = out.trimmingCharacters(in: CharacterSet(charactersIn: "-"))
        return String(out.prefix(40)).trimmingCharacters(in: CharacterSet(charactersIn: "-"))
    }

    /// Spiegel von `shopSlugSchema`
    static func problem(_ s: String) -> String? {
        let t = s.trimmed.lowercased()
        if t.count < 3 { return "Mindestens 3 Zeichen" }
        if t.count > 40 { return "Höchstens 40 Zeichen" }
        if t.range(of: #"^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$"#, options: .regularExpression) == nil { return "Nur Kleinbuchstaben, Ziffern und Bindestriche" }
        return nil
    }
}
