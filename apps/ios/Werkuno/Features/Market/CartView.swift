import SwiftUI

/// Warenkorb (PRD §13.5) – je Shop eine Gruppe, volle Kostentransparenz (§5.7).
struct CartView: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router

    @State private var cart: MarketCart?
    @State private var error: String?
    @State private var busyLines: Set<String> = []
    @State private var simulate: MarketSimulation?
    @State private var webPay: MarketWebLink?

    var body: some View {
        Group {
            if let cart { content(cart) }
            else if let error { ErrorStateView(message: error) { await load() } }
            else { LoadingView(text: "Warenkorb wird geladen …") }
        }
        .background(Color.paper)
        .navigationTitle("Warenkorb")
        .navigationBarTitleDisplayMode(.large)
        .task { await load() }
        .refreshable { await load() }
        .sheet(item: $simulate) { s in
            MarketSimulatedPaymentSheet(orderIds: s.orderIds, totalMinor: s.totalMinor) { ok in
                Task {
                    await load()
                    await app.refreshCounts()
                    if ok, let id = s.orderIds.first { app.show("Zahlung bestätigt"); router.open(.order(id: id)) }
                }
            }
        }
        .sheet(item: $webPay, onDismiss: { Task { await load(); await app.refreshCounts() } }) { l in
            SafariSheet(url: l.url).ignoresSafeArea()
        }
    }

    private func load() async {
        do {
            let c: MarketCart = try await APIClient.shared.get("/cart")
            withAnimation(.smooth) { cart = c }
            error = nil
        } catch is CancellationError {
        } catch {
            if cart == nil { self.error = (error as? APIError)?.message ?? error.localizedDescription } else { app.show(error: error) }
        }
    }

    // MARK: Inhalt

    @ViewBuilder private func content(_ c: MarketCart) -> some View {
        if c.groups.isEmpty && (c.pendingOrders ?? []).isEmpty {
            ScrollView {
                EmptyStateView(symbol: "bag.fill", title: "Dein Warenkorb ist leer", message: "Stöbere im Marktplatz – viele Arbeiten zeigen ihr Projekt, du siehst, wie sie entstanden sind.", actionTitle: "Marktplatz entdecken") {
                    router.tab = .market
                    router.popToRoot()
                }
                .padding(.top, 60)
            }
        } else {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    if let pending = c.pendingOrders, !pending.isEmpty { pendingSection(pending) }
                    if c.mode == "disabled" {
                        NoticeView(tone: .warn, title: "Zahlungen noch nicht aktiviert", message: "Bestellungen sind in Kürze möglich. Deine Artikel bleiben im Warenkorb.")
                    } else if c.hasProblems {
                        NoticeView(tone: .warn, title: "Bitte prüfe deinen Warenkorb", message: "Einige Artikel sind nicht mehr in der gewünschten Menge verfügbar. Passe sie an oder entferne sie, um fortzufahren.")
                    }
                    if hasDigital(c) {
                        // Digitale Produkte werden in der App nicht verkauft (App Store 3.1.1)
                        NoticeView(tone: .info, title: "Digitale Anleitungen", message: "Digitale Anleitungen sind in der App nicht erhältlich. Entferne sie aus dem Warenkorb, um die übrigen Artikel zu bestellen.")
                    }
                    ForEach(c.groups) { g in groupCard(g, feeBps: c.feeBps) }
                    if !c.groups.isEmpty { summary(c) }
                }
                .padding(.horizontal, Space.gutter)
                .padding(.top, 4)
                .padding(.bottom, 120)
            }
            .safeAreaInset(edge: .bottom) { if !c.groups.isEmpty { checkoutBar(c) } }
        }
    }

    // MARK: Offene Zahlungen

    private func pendingSection(_ list: [MarketPendingOrder]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader("Offene Zahlungen", subtitle: "Die Artikel sind für dich reserviert, bis die Frist abläuft.")
            ForEach(list) { o in
                VStack(alignment: .leading, spacing: 10) {
                    HStack(alignment: .firstTextBaseline) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(o.shop?.name ?? "Bestellung").font(.wr(.subheadline, .semibold))
                            SpecLabel(o.number)
                        }
                        Spacer()
                        Text(Fmt.money(o.totalMinor, currency: o.currency)).font(.wr(.headline)).monospacedDigit()
                    }
                    if let items = o.items, !items.isEmpty {
                        Text(items.map { "\($0.quantity) × \($0.title)" }.joined(separator: ", ")).font(.wr(.footnote)).foregroundStyle(Color.ink2).a11yLineLimit(2)
                    }
                    if let exp = o.reservationExpiresAt {
                        Label("Reserviert bis \(exp.formatted(date: .omitted, time: .shortened))", systemImage: "clock").font(.wr(.caption)).foregroundStyle(Color.warn)
                    }
                    HStack(spacing: 10) {
                        AsyncButton { await resume(o) } label: { Label("Bezahlen", systemImage: "creditcard").frame(maxWidth: .infinity) }
                            .buttonStyle(.glassProminent).tint(.moss)
                        AsyncButton(role: .destructive) { await abandon(o) } label: { Text("Verwerfen").frame(maxWidth: .infinity) }
                            .buttonStyle(.glass)
                    }
                    .controlSize(.regular)
                }
                .padding(14)
                .background(Color.warn.opacity(0.06), in: .rect(cornerRadius: Radius.card, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: Radius.card, style: .continuous).strokeBorder(Color.warn.opacity(0.35), lineWidth: 0.75))
            }
        }
    }

    private func resume(_ o: MarketPendingOrder) async {
        do {
            let r: MarketURLResult = try await APIClient.shared.post("/orders/\(o.id)/resume")
            if r.url.contains("/kasse/simulation") { simulate = MarketSimulation(orderIds: [o.id], totalMinor: o.totalMinor) }
            else if let u = AppConfig.resolve(r.url) { webPay = MarketWebLink(url: u) }
        } catch {
            app.show(error: error)
            await load()
        }
    }

    private func abandon(_ o: MarketPendingOrder) async {
        await app.run("Bestellung verworfen. Die Reservierung ist freigegeben.") {
            _ = try await APIClient.shared.post("/orders/\(o.id)/abandon") as JSONValue
        }
        await load()
    }

    // MARK: Gruppen

    private func groupCard(_ g: MarketCartGroup, feeBps: Int) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Button { router.open(.shop(slug: g.shop.slug)) } label: {
                HStack {
                    Image(systemName: "storefront").foregroundStyle(Color.moss)
                    Text(g.shop.name).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink)
                    Spacer()
                    Image(systemName: "chevron.right").font(.wr(.caption)).foregroundStyle(Color.muted)
                }
                .padding(.horizontal, 16).padding(.vertical, 12)
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .hairline()
            ForEach(g.lines) { l in line(l) }
            VStack(spacing: 6) {
                MarketAmountRow(label: "Warenwert", value: Fmt.money(g.fees.subtotal))
                MarketAmountRow(label: "Versand (kombiniert)", value: g.fees.shipping == 0 ? "kostenlos" : Fmt.money(g.fees.shipping))
                MarketAmountRow(label: "Bestellung bei \(g.shop.name)", value: Fmt.money(g.fees.total), strong: false)
                if let d = g.shop.processingDays, g.lines.contains(where: { !$0.isDigital }) {
                    Text("Versand in ca. \(Fmt.plural(d, "Werktag", "Werktagen"))").font(.wr(.caption)).foregroundStyle(Color.muted).frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(16)
        }
        .cardSurface()
    }

    private func line(_ l: MarketCartLine) -> some View {
        let busy = busyLines.contains(l.id)
        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 12) {
                Button { router.open(href: l.href) } label: {
                    CoverView(url: l.cover?.best, seed: l.productId, category: l.category, showLabel: false)
                        .frame(width: 72, height: 72)
                        .clipShape(.rect(cornerRadius: Radius.inner, style: .continuous))
                }
                .buttonStyle(.pressable)
                .accessibilityLabel("\(l.title) öffnen")
                VStack(alignment: .leading, spacing: 3) {
                    Text(l.title).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink).a11yLineLimit(2)
                    if let v = l.variantName?.nilIfEmpty { Text(v).font(.wr(.caption)).foregroundStyle(Color.muted) }
                    Text(l.quantity > 1 ? "\(l.quantity) × \(Fmt.money(l.unitMinor))" : Fmt.money(l.unitMinor)).font(.wr(.caption)).monospacedDigit().foregroundStyle(Color.muted)
                    if l.isDigital { Label("In der App nicht erhältlich", systemImage: "arrow.down.circle").font(.wr(.caption2)).foregroundStyle(Color.slate) }
                }
                Spacer(minLength: 6)
                Text(Fmt.money(l.lineMinor)).font(.wr(.subheadline, .semibold)).monospacedDigit()
            }
            if let p = l.problem {
                Label(p, systemImage: "exclamationmark.triangle.fill").font(.wr(.caption, .medium)).foregroundStyle(Color.danger)
            }
            HStack {
                if !l.isDigital {
                    MarketQuantityStepper(value: .constant(l.quantity), range: 1...max(1, min(99, max(l.quantity, l.available ?? 99)))) { n in
                        Task { await update(l, quantity: n) }
                    }
                    .disabled(busy)
                    .opacity(busy ? 0.5 : 1)
                }
                Spacer()
                Button(role: .destructive) { Task { await remove(l) } } label: {
                    Label("Entfernen", systemImage: "trash").font(.wr(.footnote))
                }
                .buttonStyle(.glass)
                .controlSize(.small)
                .disabled(busy)
            }
        }
        .padding(16)
        .hairline()
    }

    private func update(_ l: MarketCartLine, quantity: Int) async {
        busyLines.insert(l.id)
        defer { busyLines.remove(l.id) }
        do {
            let r: MarketCartAddResult = try await APIClient.shared.patch("/cart/items/\(l.id)", ["quantity": JSONValue.number(Double(quantity))])
            if r.capped == true { app.show("Mehr ist leider nicht verfügbar.", style: .warning) }
        } catch { app.show(error: error) }
        await load()
        await app.refreshCounts()
    }

    private func remove(_ l: MarketCartLine) async {
        busyLines.insert(l.id)
        defer { busyLines.remove(l.id) }
        let ok = await app.run("Entfernt") { _ = try await APIClient.shared.delete("/cart/items/\(l.id)") as JSONValue }
        if ok { Haptics.soft() }
        await load()
        await app.refreshCounts()
    }

    // MARK: Zusammenfassung

    private func summary(_ c: MarketCart) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            MarketFeeSummary(subtotal: c.totals.subtotal, shipping: c.totals.shipping, total: c.totals.total)
            if c.groups.count > 1 {
                Label("\(c.groups.count) Shops – du erhältst \(c.groups.count) getrennte Bestellungen, jede mit eigener Zahlung.", systemImage: "square.stack")
                    .font(.wr(.footnote)).foregroundStyle(Color.ink2)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text("Gebühren transparent").font(.wr(.footnote, .semibold)).foregroundStyle(Color.ink)
                Text("Für dich fallen keine weiteren Gebühren an. Die Shops zahlen eine Plattformprovision von \(Fmt.percent(bps: c.feeBps)) auf den Warenwert – sie ist im Preis bereits enthalten.")
                    .font(.wr(.footnote)).foregroundStyle(Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(16)
        .sunkenSurface(radius: Radius.card)
    }

    private func hasDigital(_ c: MarketCart) -> Bool { c.groups.contains { $0.lines.contains(where: \.isDigital) } }

    private func checkoutBar(_ c: MarketCart) -> some View {
        let blocked = c.hasProblems || c.mode == "disabled" || hasDigital(c)
        return HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 1) {
                Text(Fmt.money(c.totals.total)).font(.wr(.headline)).monospacedDigit().contentTransition(.numericText())
                Text("\(Fmt.plural(c.count, "Artikel", "Artikel")) · inkl. Versand").font(.wr(.caption2)).foregroundStyle(Color.muted)
            }
            Spacer()
            Button { router.open(.checkout) } label: { Label("Zur Kasse", systemImage: "lock") }
                .buttonStyle(.glassProminent).tint(.moss).controlSize(.large)
                .disabled(blocked)
        }
        .padding(.leading, 20).padding(.trailing, 8).padding(.vertical, 8)
        .glassEffect(.regular, in: Capsule())
        .padding(.horizontal, 14)
        .padding(.bottom, 6)
    }
}

/// Auslöser der nativen Testzahlung
struct MarketSimulation: Identifiable, Hashable {
    let id = UUID()
    var orderIds: [String]
    var totalMinor: Int?
}
