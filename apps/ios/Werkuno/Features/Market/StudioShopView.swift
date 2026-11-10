import SwiftUI
import Charts

// MARK: - Werkuno Studio → Shop

struct StudioShopView: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router

    @State private var data: MarketStudioShop?
    @State private var error: String?
    @State private var confirmPause = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                PageTitle(kicker: "Werkuno Studio", title: "Shop", subtitle: "Status, Verifizierung, Auszahlungen und Einstellungen.")
                if let data {
                    if let s = data.shop { content(s, data) } else { MarketNoShopCTA() }
                } else if let error {
                    ErrorStateView(message: error) { await load() }
                } else {
                    LoadingView()
                }
            }
            .padding(.horizontal, Space.gutter)
            .padding(.bottom, 40)
        }
        .background(Color.paper)
        .navigationTitle("Shop")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
        .onChange(of: router.sheet) { old, new in
            if new == nil, case .shopWizard = old { Task { await load() } }
        }
        .confirmationDialog("Shop pausieren?", isPresented: $confirmPause, titleVisibility: .visible) {
            Button("Pausieren") { Task { await setPaused(true) } }
        } message: { Text("Deine Produkte bleiben sichtbar, können aber nicht bestellt werden. Offene Bestellungen bearbeitest du normal weiter.") }
    }

    private func load() async {
        do {
            let d: MarketStudioShop = try await APIClient.shared.get("/studio/shop")
            withAnimation(.smooth) { data = d }
            error = nil
        } catch is CancellationError {
        } catch {
            self.error = (error as? APIError)?.message ?? error.localizedDescription
        }
    }

    @ViewBuilder private func content(_ s: MarketMyShop, _ d: MarketStudioShop) -> some View {
        // Kopf
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(s.name).font(.display(26))
                    Text("/markt/\(s.slug)").font(.wr(.footnote).monospaced()).foregroundStyle(Color.muted)
                }
                Spacer()
                MarketStatusPill.shop(s.status)
            }
            HStack(spacing: 18) {
                StatCell(value: Fmt.number(s.salesCount ?? 0), label: "Verkäufe")
                StatCell(value: (s.ratingCount ?? 0) > 0 ? String(format: "%.1f", s.ratingAvg ?? 0) : "–", label: "\(s.ratingCount ?? 0) Bewertungen")
                StatCell(value: Fmt.percent(bps: d.feeBps), label: "Provision")
            }
            HStack(spacing: 10) {
                if s.status == "ACTIVE" || s.status == "PAUSED" {
                    Button { router.open(.shop(slug: s.slug)) } label: { Label("Öffentlicher Shop", systemImage: "storefront").frame(maxWidth: .infinity) }
                        .buttonStyle(.glass)
                }
                Button { router.present(.shopWizard) } label: { Label(s.status == "DRAFT" ? "Weiter einrichten" : "Einstellungen", systemImage: "slider.horizontal.3").frame(maxWidth: .infinity) }
                    .buttonStyle(.glass)
            }
            .controlSize(.large)
        }
        .padding(16)
        .cardSurface()

        statusNotice(s, d)

        // Verifizierung & Zahlungen
        MarketSection("Verifizierung & Auszahlungen", number: "01") {
            SpecRow(label: "Verifizierung", value: verificationLabel(s.verification?.state), symbol: "checkmark.seal")
            SpecRow(label: "Verkäufertyp", value: L.sellerType.first { $0.key == s.sellerType }?.label ?? "–", symbol: "person")
            SpecRow(label: "Zahlungsmodus", value: d.payments == "stripe" ? "Stripe" : d.payments == "simulated" ? "Testmodus" : "Noch nicht aktiviert", symbol: "creditcard")
            if d.payments == "stripe" {
                SpecRow(label: "Zahlungen annehmen", value: s.chargesEnabled == true ? "Aktiv" : "Ausstehend", symbol: "arrow.down.circle")
                SpecRow(label: "Auszahlungen", value: s.payoutsEnabled == true ? "Aktiv" : "Ausstehend", symbol: "banknote")
            }
            if let n = s.verification?.notes?.nilIfEmpty { Text(n).font(.wr(.caption)).foregroundStyle(Color.muted).padding(.top, 8) }
            VStack(spacing: 10) {
                if s.status == "DRAFT" || s.status == "PENDING_VERIFICATION" {
                    Button { router.present(.shopWizard) } label: { Label(s.status == "DRAFT" ? "Antrag fertigstellen" : "Verifizierung fortsetzen", systemImage: "arrow.right.circle").frame(maxWidth: .infinity) }
                        .primaryButton()
                }
                if d.payments == "stripe" && s.stripeAccountId != nil {
                    AsyncButton { await openDashboard() } label: { Label("Stripe-Dashboard öffnen", systemImage: "arrow.up.right.square").frame(maxWidth: .infinity) }
                        .buttonStyle(.glass).controlSize(.large)
                }
            }
            .padding(.top, 12)
        }

        // Shop öffnen/pausieren
        if s.status == "ACTIVE" || s.status == "PAUSED" {
            MarketSection("Verfügbarkeit", number: "02") {
                Text(s.status == "PAUSED" ? "Dein Shop ist pausiert. Produkte sind sichtbar, aber nicht bestellbar." : "Dein Shop nimmt Bestellungen an. Pausiere ihn z. B. während Ferien.")
                    .font(.wr(.subheadline)).foregroundStyle(Color.ink2)
                if s.status == "PAUSED" {
                    AsyncButton { await setPaused(false) } label: { Label("Shop wieder öffnen", systemImage: "play.circle").frame(maxWidth: .infinity) }
                        .primaryButton().padding(.top, 12)
                } else {
                    Button { confirmPause = true } label: { Label("Shop pausieren", systemImage: "pause.circle").frame(maxWidth: .infinity) }
                        .buttonStyle(.glass).controlSize(.large).padding(.top, 12)
                }
            }
        }

        // Richtlinien
        MarketSection("Richtlinien", number: "03") {
            SpecRow(label: "Bearbeitungszeit", value: Fmt.plural(s.processingDays ?? 0, "Werktag", "Werktage"), symbol: "hourglass")
            SpecRow(label: "Land", value: L.country(s.country), symbol: "mappin")
            if let t = s.shippingPolicy?.nilIfEmpty { MarketPolicyBlock(title: "Versand", text: t, symbol: "shippingbox").padding(.top, 10) }
            if let t = s.returnPolicy?.nilIfEmpty { MarketPolicyBlock(title: "Rückgabe", text: t, symbol: "arrow.uturn.backward").padding(.top, 10) }
        }

        // Weiter
        VStack(spacing: 10) {
            MarketStudioLink(title: "Produkte", subtitle: "Angebote anlegen und pflegen", symbol: "tag") { router.open(.studioSection(.products)) }
            MarketStudioLink(title: "Bestellungen", subtitle: "Bearbeiten, versenden, erstatten", symbol: "shippingbox") { router.open(.studioSection(.orders)) }
            MarketStudioLink(title: "Einnahmen", subtitle: "Umsatz, Gebühren, Auszahlungen", symbol: "banknote") { router.open(.studioSection(.revenue)) }
        }
    }

    @ViewBuilder private func statusNotice(_ s: MarketMyShop, _ d: MarketStudioShop) -> some View {
        switch s.status {
        case "DRAFT": NoticeView(tone: .info, title: "Entwurf", message: "Reiche deine Shop-Angaben ein, um die Verifizierung zu starten.")
        case "PENDING_VERIFICATION": NoticeView(tone: .warn, title: "Verifizierung läuft", message: d.payments == "stripe" ? "Schliesse das Stripe-Onboarding ab, damit dein Shop aktiv wird." : "Wir prüfen deine Angaben. Du wirst benachrichtigt, sobald dein Shop aktiv ist.")
        case "SUSPENDED": NoticeView(tone: .danger, title: "Shop gesperrt", message: "Details zur Entscheidung und zum Einspruch findest du in deinen Benachrichtigungen.")
        default: EmptyView()
        }
        if d.emailVerified == false { NoticeView(tone: .warn, title: "E-Mail bestätigen", message: "Bitte bestätige deine E-Mail-Adresse, um den Antrag einzureichen.") }
    }

    private func verificationLabel(_ s: String?) -> String {
        switch s {
        case "VERIFIED": "Verifiziert"
        case "PENDING": "In Prüfung"
        case "REJECTED": "Abgelehnt"
        case "NOT_STARTED": "Nicht gestartet"
        default: s ?? "–"
        }
    }

    private func setPaused(_ p: Bool) async {
        await app.run(p ? "Shop pausiert." : "Shop wieder geöffnet.") {
            _ = try await APIClient.shared.post("/studio/shop/paused", ["paused": JSONValue.bool(p)]) as JSONValue
        }
        await load()
        await app.refresh()
    }

    private func openDashboard() async {
        do {
            let r: MarketURLResult = try await APIClient.shared.post("/studio/shop/stripe-dashboard")
            if let u = AppConfig.resolve(r.url) { router.present(.web(url: u)) }
        } catch { app.show(error: error) }
    }
}

struct MarketStudioLink: View {
    var title: String
    var subtitle: String
    var symbol: String
    var action: () -> Void
    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: symbol).font(.wr(.body)).foregroundStyle(Color.moss).frame(width: 36, height: 36).background(Color.mossSoft, in: Circle())
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink)
                    Text(subtitle).font(.wr(.caption)).foregroundStyle(Color.muted)
                }
                Spacer()
                Image(systemName: "chevron.right").font(.wr(.caption)).foregroundStyle(Color.muted)
            }
            .padding(12)
            .cardSurface(radius: Radius.inner)
        }
        .buttonStyle(.pressable)
    }
}

// MARK: - Werkuno Studio → Einnahmen (§20.4 – ehrlich beschriftet)

struct StudioRevenueView: View {
    @Environment(Router.self) private var router
    @Environment(AppState.self) private var app

    @State private var range = "30"
    @State private var data: MarketRevenue?
    @State private var error: String?
    @State private var payoutReload = 0

    private let ranges: [(value: String, label: String)] = [("30", "30 Tage"), ("90", "90 Tage"), ("365", "12 Monate"), ("alle", "Gesamt")]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                PageTitle(kicker: "Werkuno Studio", title: "Einnahmen & Auszahlungen", subtitle: "Bezahlte Bestellungen deines Shops – ohne Schönfärberei.")
                    .padding(.horizontal, Space.gutter)
                if app.me?.shop == nil {
                    MarketNoShopCTA().padding(.horizontal, Space.gutter)
                } else {
                    ChipBar(items: ranges, selection: $range)
                    Group {
                        if let data { content(data) }
                        else if let error { ErrorStateView(message: error) { await load() } }
                        else { LoadingView() }
                    }
                    .padding(.horizontal, Space.gutter)
                }
            }
            .padding(.bottom, 40)
        }
        .background(Color.paper)
        .navigationTitle("Einnahmen")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: range) { if app.me?.shop != nil { await load() } }
        .refreshable { payoutReload += 1; await load() }
    }

    private func load() async {
        do {
            let r: MarketRevenue = try await APIClient.shared.get("/studio/revenue", query: ["range": range])
            withAnimation(.smooth) { data = r }
            error = nil
        } catch is CancellationError {
        } catch {
            self.error = (error as? APIError)?.message ?? error.localizedDescription
        }
    }

    @ViewBuilder private func content(_ r: MarketRevenue) -> some View {
        let cur = r.currency
        if r.payments == "simulated" {
            NoticeView(tone: .warn, title: "Testmodus", message: "Zahlungen in dieser Umgebung sind simuliert. Es fliesst kein echtes Geld.")
        } else if r.connected == false {
            NoticeView(tone: .info, title: "Kein Auszahlungskonto", message: "Verbinde dein Auszahlungskonto über die Shop-Verifizierung, damit Erlöse ausgezahlt werden.")
        }

        // Guthaben, Auszahlungsplan, Bankkonto und Verlauf (Benachrichtigungen „payout“ führen hierher)
        StudioPayoutPanel(reloadKey: payoutReload) { await load() }

        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                SpecLabel("Netto im Zeitraum")
                Text(Fmt.money(r.net, currency: cur)).font(.wr(size: 34, weight: .semibold)).monospacedDigit().contentTransition(.numericText())
                Text("Aus \(Fmt.plural(r.orderCount, "bezahlter Bestellung", "bezahlten Bestellungen"))").font(.wr(.footnote)).foregroundStyle(Color.muted)
            }
            Grid(alignment: .leading, horizontalSpacing: 18, verticalSpacing: 14) {
                GridRow {
                    StatCell(value: Fmt.money(r.gross, currency: cur), label: "Umsatz brutto")
                    StatCell(value: "− " + Fmt.money(r.refunds, currency: cur), label: "Erstattungen")
                }
                GridRow {
                    StatCell(value: "− " + Fmt.money(r.fees, currency: cur), label: "Plattformgebühr")
                    StatCell(value: Fmt.money(r.paidOut ?? 0, currency: cur), label: "Ausgezahlt")
                }
            }
            if let p = r.pendingRefunds, p > 0 {
                Label("\(Fmt.money(p, currency: cur)) Erstattungen in Bearbeitung – noch nicht abgezogen.", systemImage: "clock").font(.wr(.caption)).foregroundStyle(Color.warn)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()

        if !r.rows.isEmpty { chart(r) }

        VStack(alignment: .leading, spacing: 6) {
            Text("So rechnen wir").font(.wr(.footnote, .semibold))
            Text("Umsatz brutto = bezahlte Bestellungen inkl. Versand. Erstattungen = bestätigte Rückzahlungen. Plattformgebühr = \(Fmt.percent(bps: r.feeBps ?? app.feeBps)) Provision auf den Warenwert, bei Erstattungen anteilig zurückgerechnet. Netto = Brutto − Erstattungen − Plattformgebühr. Gebühren des Zahlungsanbieters zieht Stripe separat ab; sie sind hier nicht enthalten.")
                .font(.wr(.caption)).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
        }
        .padding(14)
        .sunkenSurface()

        MarketSection("Bestellungen", number: "01", subtitle: r.rows.count >= 100 ? "Die letzten 100" : nil) {
            if r.rows.isEmpty {
                Text("Im gewählten Zeitraum gibt es keine bezahlten Bestellungen.").font(.wr(.footnote)).foregroundStyle(Color.muted)
            }
            ForEach(r.rows) { row in
                Button { router.open(.sellerOrder(id: row.id)) } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(alignment: .firstTextBaseline) {
                            Text(row.number).font(.wr(.footnote).monospaced().weight(.semibold)).foregroundStyle(Color.ink)
                            Spacer()
                            Text(Fmt.money(row.net, currency: row.currency ?? cur)).font(.wr(.subheadline, .semibold)).monospacedDigit().foregroundStyle(Color.ink)
                        }
                        HStack(spacing: 6) {
                            Text(Fmt.date(row.paidAt)).foregroundStyle(Color.muted)
                            Text("· Brutto \(Fmt.money(row.totalMinor, currency: row.currency ?? cur)) · Gebühr \(Fmt.money(row.fee, currency: row.currency ?? cur))\(row.refunded > 0 ? " · Erstattet \(Fmt.money(row.refunded, currency: row.currency ?? cur))" : "")")
                                .foregroundStyle(Color.muted)
                        }
                        .font(.wr(.caption)).monospacedDigit().lineLimit(2)
                        MarketStatusPill.order(row.status)
                    }
                    .padding(.vertical, 10)
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .hairline()
            }
        }
    }

    // MARK: Diagramm

    private struct Bucket: Identifiable { var id: Date { date }; var date: Date; var net: Int; var fee: Int }

    private func buckets(_ r: MarketRevenue) -> ([Bucket], Calendar.Component) {
        let unit: Calendar.Component = range == "30" ? .day : range == "90" ? .weekOfYear : .month
        var cal = Calendar(identifier: .gregorian)
        cal.locale = Fmt.locale
        cal.timeZone = TimeZone(identifier: "Europe/Zurich") ?? .current
        var map: [Date: (Int, Int)] = [:]
        for row in r.rows {
            guard let d = row.paidAt, let start = cal.dateInterval(of: unit, for: d)?.start else { continue }
            let cur = map[start] ?? (0, 0)
            map[start] = (cur.0 + row.net, cur.1 + row.fee)
        }
        return (map.map { Bucket(date: $0.key, net: $0.value.0, fee: $0.value.1) }.sorted { $0.date < $1.date }, unit)
    }

    private func chart(_ r: MarketRevenue) -> some View {
        let (data, unit) = buckets(r)
        return VStack(alignment: .leading, spacing: 10) {
            SectionHeader("Verlauf", subtitle: "Netto je \(unit == .day ? "Tag" : unit == .weekOfYear ? "Woche" : "Monat") (Gebühr hell)")
            Chart {
                ForEach(data) { b in
                    BarMark(x: .value("Zeitraum", b.date, unit: unit), y: .value("Netto", Double(b.net) / 100))
                        .foregroundStyle(Color.moss)
                    BarMark(x: .value("Zeitraum", b.date, unit: unit), y: .value("Gebühr", Double(b.fee) / 100))
                        .foregroundStyle(Color.moss.opacity(0.3))
                }
            }
            .chartYAxis {
                AxisMarks(position: .leading) { v in
                    AxisGridLine().foregroundStyle(Color.line)
                    AxisValueLabel { if let d = v.as(Double.self) { Text("\(Int(d))") } }
                }
            }
            .frame(height: 180)
            .accessibilityLabel("Balkendiagramm Netto-Einnahmen")
        }
        .padding(16)
        .cardSurface()
    }
}
