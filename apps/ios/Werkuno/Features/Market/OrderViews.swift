import SwiftUI

// MARK: - Bestellungen (Käufer:in)

struct OrderListView: View {
    @Environment(Router.self) private var router
    @State private var items: [MarketOrderSummary] = []
    @State private var cursor: String?
    @State private var loaded = false
    @State private var error: String?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                PageTitle(kicker: "Einkäufe", title: "Bestellungen", subtitle: "Status, Versand, Belege und Bewertungen – alles an einem Ort.")
                    .padding(.bottom, 6)
                if !loaded {
                    LoadingView()
                } else if let error, items.isEmpty {
                    ErrorStateView(message: error) { await load(reset: true) }
                } else if items.isEmpty {
                    EmptyStateView(symbol: "shippingbox", title: "Noch keine Bestellungen", message: "Wenn du im Marktplatz etwas bestellst, findest du es hier.", actionTitle: "Marktplatz entdecken") {
                        router.tab = .market; router.popToRoot()
                    }
                    .cardSurface()
                } else {
                    ForEach(items) { o in MarketOrderRow(order: o, seller: false) { router.open(.order(id: o.id)) } }
                    LoadMoreTrigger(hasMore: cursor != nil) { await load(reset: false) }
                }
            }
            .padding(.horizontal, Space.gutter)
            .padding(.bottom, 30)
        }
        .background(Color.paper)
        .navigationTitle("Bestellungen")
        .navigationBarTitleDisplayMode(.inline)
        .task { if !loaded { await load(reset: true) } }
        .refreshable { await load(reset: true) }
    }

    private func load(reset: Bool) async {
        do {
            let p: Page<MarketOrderSummary> = try await APIClient.shared.get("/orders", query: ["cursor": reset ? nil : cursor])
            withAnimation(.smooth) { if reset { items = p.items } else { items += p.items } }
            cursor = p.nextCursor
            error = nil
        } catch is CancellationError {
        } catch {
            self.error = (error as? APIError)?.message ?? error.localizedDescription
            cursor = nil
        }
        loaded = true
    }
}

/// Bestellzeile (Käufer- und Verkäuferliste)
struct MarketOrderRow: View {
    var order: MarketOrderSummary
    var seller: Bool
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(alignment: .top, spacing: 12) {
                let first = order.items?.first
                CoverView(url: first?.product?.coverUrl, seed: order.id, category: first?.product?.category, showLabel: false)
                    .frame(width: 58, height: 58)
                    .clipShape(.rect(cornerRadius: Radius.inner, style: .continuous))
                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(seller ? (order.buyer?.profile?.displayName ?? "Käufer:in") : (order.shop?.name ?? "Shop"))
                            .font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink).lineLimit(1)
                        Spacer(minLength: 6)
                        Text(Fmt.money(order.totalMinor, currency: order.currency)).font(.wr(.subheadline, .semibold)).monospacedDigit().foregroundStyle(Color.ink)
                    }
                    Text((order.items ?? []).map { "\($0.quantity) × \($0.title)\($0.variantName.map { " (\($0))" } ?? "")" }.joined(separator: ", "))
                        .font(.wr(.footnote)).foregroundStyle(Color.ink2).lineLimit(2).multilineTextAlignment(.leading)
                    HStack(spacing: 8) {
                        MarketStatusPill.order(order.status)
                        SpecLabel("\(order.number) · \(Fmt.date(order.createdAt))")
                    }
                    .padding(.top, 2)
                    if let s = order.shipments?.first, let c = s.carrier {
                        Label([c, s.trackingNo].compactMap { $0?.nilIfEmpty }.joined(separator: " · "), systemImage: "shippingbox").font(.wr(.caption)).foregroundStyle(Color.muted)
                    }
                }
            }
            .padding(14)
            .cardSurface()
        }
        .buttonStyle(.pressable)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Bestellung öffnen")
    }
}

// MARK: - Bestelldetail (Käufer:in)

struct OrderDetailView: View {
    var id: String

    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router

    @State private var env: MarketBuyerOrderEnvelope?
    @State private var error: String?
    @State private var showProblem = false
    @State private var reviewItem: MarketOrderItem?
    @State private var showReceipt = false
    @State private var simulate: MarketSimulation?
    @State private var webPay: MarketWebLink?
    @State private var confirmAbandon = false

    var body: some View {
        Group {
            if let env { content(env.order, canPay: env.canPay) }
            else if let error { ErrorStateView(message: error) { await load() } }
            else { LoadingView(text: "Bestellung wird geladen …") }
        }
        .background(Color.paper)
        .navigationTitle(env?.order.number ?? "Bestellung")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let o = env?.order {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        if o.paidAt != nil { Button("Beleg anzeigen", systemImage: "doc.text") { showReceipt = true } }
                        if let h = o.shop.owner?.handle {
                            Button("Nachricht an den Shop", systemImage: "bubble.left") { router.present(.newConversation(handle: h, orderId: o.id)) }
                        }
                        Button("Shop ansehen", systemImage: "storefront") { router.open(.shop(slug: o.shop.slug)) }
                    } label: { Image(systemName: "ellipsis") }
                        .accessibilityLabel("Weitere Aktionen")
                }
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $showProblem) { MarketProblemSheet(orderId: id) { Task { await load() } } }
        .sheet(item: $reviewItem) { item in
            MarketReviewSheet(item: item, shopName: env?.order.shop.name ?? "") { Task { await load() } }
        }
        .sheet(isPresented: $showReceipt) { MarketReceiptSheet(orderId: id) }
        .sheet(item: $simulate) { s in
            MarketSimulatedPaymentSheet(orderIds: s.orderIds, totalMinor: s.totalMinor) { _ in Task { await load(); await app.refreshCounts() } }
        }
        .sheet(item: $webPay, onDismiss: { Task { await load(); await app.refreshCounts() } }) { l in SafariSheet(url: l.url).ignoresSafeArea() }
        .confirmationDialog("Bestellung verwerfen?", isPresented: $confirmAbandon, titleVisibility: .visible) {
            Button("Verwerfen", role: .destructive) {
                Task {
                    await app.run("Bestellung verworfen. Die Reservierung ist freigegeben.") { _ = try await APIClient.shared.post("/orders/\(id)/abandon") as JSONValue }
                    await load()
                    await app.refreshCounts()
                }
            }
        } message: { Text("Die reservierten Artikel werden wieder freigegeben. Es wird nichts belastet.") }
    }

    private func load() async {
        do {
            let e: MarketBuyerOrderEnvelope = try await APIClient.shared.get("/orders/\(id)")
            withAnimation(.smooth) { env = e }
            error = nil
        } catch is CancellationError {
        } catch {
            if env == nil { self.error = (error as? APIError)?.message ?? error.localizedDescription } else { app.show(error: error) }
        }
    }

    // MARK: Inhalt

    private func content(_ o: MarketOrderDetail, canPay: Bool) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                header(o)
                actions(o, canPay: canPay)
                MarketSection("Verlauf", number: "01", subtitle: "Jede Station deiner Bestellung.") {
                    MarketThreadTimeline(events: o.events ?? [], currentStatus: o.status)
                }
                MarketSection("Positionen", number: "02") {
                    ForEach(o.items) { i in itemRow(i, order: o) }
                    MarketOrderTotals(order: o).padding(.top, 12)
                }
                if let ships = o.shipments, !ships.isEmpty {
                    MarketSection("Versand", number: "03") { MarketShipmentList(shipments: ships) }
                }
                MarketSection(o.isDigitalOnly ? "Rechnungsadresse" : "Lieferadresse", number: "04") {
                    MarketAddressBlock(address: o.shippingAddress)
                    if let n = o.buyerNote?.nilIfEmpty {
                        VStack(alignment: .leading, spacing: 3) {
                            SpecLabel("Deine Nachricht an den Shop")
                            Text(n).font(.wr(.footnote)).foregroundStyle(Color.ink2)
                        }
                        .padding(.top, 12)
                    }
                }
                MarketSection("Zahlung", number: "05") {
                    MarketPaymentList(payments: o.payments ?? [], refunds: o.refunds ?? [], currency: o.currency)
                }
                if let ents = o.entitlements, !ents.isEmpty { downloads(ents, order: o) }
                policies(o)
            }
            .padding(.horizontal, Space.gutter)
            .padding(.bottom, 40)
        }
    }

    private func header(_ o: MarketOrderDetail) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SpecLabel("Bestellung · \(Fmt.date(o.createdAt))", color: .moss)
            Text(o.shop.name).font(.display(30)).accessibilityAddTraits(.isHeader)
            HStack(spacing: 10) {
                MarketStatusPill.order(o.status)
                Text(o.number).font(.wr(.footnote).monospaced()).foregroundStyle(Color.muted).textSelection(.enabled)
                Spacer()
                Text(Fmt.money(o.totalMinor, currency: o.currency)).font(.wr(.headline)).monospacedDigit()
            }
            Text(statusExplanation(o)).font(.wr(.subheadline)).foregroundStyle(Color.ink2).fixedSize(horizontal: false, vertical: true).padding(.top, 4)
        }
    }

    private func statusExplanation(_ o: MarketOrderDetail) -> String {
        switch o.status {
        case "PENDING_PAYMENT": return "Die Zahlung ist noch offen. Die Artikel sind für dich reserviert\(o.reservationExpiresAt.map { " bis \($0.formatted(date: .omitted, time: .shortened))" } ?? "")."
        case "NEW": return "Bezahlt. Der Shop hat deine Bestellung erhalten und beginnt bald mit der Bearbeitung."
        case "IN_PROGRESS": return "Der Shop arbeitet an deiner Bestellung."
        case "READY_TO_SHIP": return "Deine Bestellung ist verpackt und geht demnächst auf den Weg."
        case "SHIPPED": return "Unterwegs zu dir. Bestätige den Erhalt, sobald alles angekommen ist."
        case "COMPLETED": return "Abgeschlossen. Danke, dass du Handgemachtes unterstützt."
        case "CANCELLED": return "Diese Bestellung wurde storniert. Bezahlte Beträge werden erstattet."
        case "REFUNDED": return "Der Betrag wurde erstattet."
        case "PROBLEM": return "Ein Problem wurde gemeldet. Der Shop ist informiert – ihr findet gemeinsam eine Lösung."
        default: return ""
        }
    }

    @ViewBuilder private func actions(_ o: MarketOrderDetail, canPay: Bool) -> some View {
        let canProblem = (L.orderTransitions[o.status] ?? []).contains("PROBLEM")
        VStack(spacing: 10) {
            if canPay && o.status == "PENDING_PAYMENT" {
                AsyncButton { await resume(o) } label: { Label("Bezahlen fortsetzen · \(Fmt.money(o.totalMinor, currency: o.currency))", systemImage: "creditcard") }
                    .primaryButton()
                Button("Bestellung verwerfen", role: .destructive) { confirmAbandon = true }
                    .buttonStyle(.glass).controlSize(.large)
            }
            if o.status == "SHIPPED" {
                AsyncButton {
                    await app.run("Erhalt bestätigt. Danke!") { _ = try await APIClient.shared.post("/orders/\(o.id)/confirm") as JSONValue }
                    await load()
                } label: { Label("Erhalt bestätigen", systemImage: "checkmark.circle") }
                    .primaryButton()
            }
            HStack(spacing: 10) {
                if let h = o.shop.owner?.handle {
                    Button { router.present(.newConversation(handle: h, orderId: o.id)) } label: { Label("Nachricht", systemImage: "bubble.left").frame(maxWidth: .infinity) }
                        .buttonStyle(.glass)
                }
                if o.paidAt != nil {
                    Button { showReceipt = true } label: { Label("Beleg", systemImage: "doc.text").frame(maxWidth: .infinity) }
                        .buttonStyle(.glass)
                }
                if canProblem && o.status != "PENDING_PAYMENT" {
                    Button { showProblem = true } label: { Label("Problem", systemImage: "exclamationmark.bubble").frame(maxWidth: .infinity) }
                        .buttonStyle(.glass)
                        .accessibilityLabel("Problem melden")
                }
            }
            .controlSize(.regular)
        }
    }

    private func resume(_ o: MarketOrderDetail) async {
        do {
            let r: MarketURLResult = try await APIClient.shared.post("/orders/\(o.id)/resume")
            if r.url.contains("/kasse/simulation") { simulate = MarketSimulation(orderIds: [o.id], totalMinor: o.totalMinor) }
            else if let u = AppConfig.resolve(r.url) { webPay = MarketWebLink(url: u) }
        } catch {
            app.show(error: error)
            await load()
        }
    }

    private func itemRow(_ i: MarketOrderItem, order o: MarketOrderDetail) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 12) {
                Button {
                    if let p = i.product?.slug { router.open(.product(shopSlug: i.product?.shop?.slug ?? o.shop.slug, productSlug: p)) }
                } label: {
                    CoverView(url: i.product?.coverUrl, seed: i.productId ?? i.id, category: i.product?.category, showLabel: false)
                        .frame(width: 56, height: 56)
                        .clipShape(.rect(cornerRadius: Radius.small, style: .continuous))
                }
                .buttonStyle(.pressable)
                .accessibilityLabel("\(i.title) öffnen")
                VStack(alignment: .leading, spacing: 2) {
                    Text(i.title).font(.wr(.subheadline, .semibold))
                    if let v = i.variantName?.nilIfEmpty { Text(v).font(.wr(.caption)).foregroundStyle(Color.muted) }
                    Text("\(i.quantity) × \(Fmt.money(i.unitMinor, currency: o.currency))").font(.wr(.caption)).monospacedDigit().foregroundStyle(Color.muted)
                }
                Spacer()
                Text(Fmt.money(i.unitMinor * i.quantity, currency: o.currency)).font(.wr(.subheadline)).monospacedDigit()
            }
            if let r = i.review {
                HStack(spacing: 6) {
                    MarketStars(rating: Double(r.productRating), size: 10)
                    Text("Deine Bewertung").font(.wr(.caption)).foregroundStyle(Color.muted)
                }
                if let b = r.body?.nilIfEmpty { Text(b).font(.wr(.caption)).foregroundStyle(Color.ink2).lineLimit(3) }
                if let reply = r.sellerReply?.nilIfEmpty { Text("Antwort des Shops: \(reply)").font(.wr(.caption)).foregroundStyle(Color.muted) }
            } else if o.canReview {
                Button { reviewItem = i } label: { Label("Bewerten", systemImage: "star") }
                    .buttonStyle(.glass).controlSize(.small)
            }
        }
        .padding(.vertical, 10)
        .hairline()
    }

    private func downloads(_ ents: [MarketEntitlement], order o: MarketOrderDetail) -> some View {
        MarketSection("Downloads", number: "06") {
            ForEach(ents) { e in
                let title = o.items.first { $0.id == e.orderItemId }?.title ?? "Datei"
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(title).font(.wr(.subheadline, .semibold))
                        Spacer()
                        if e.revokedAt == nil {
                            Button { router.present(.web(url: AppConfig.webURL("/api/v1/downloads/\(e.id)"))) } label: { Label("Laden", systemImage: "arrow.down.circle") }
                                .buttonStyle(.glass).controlSize(.small)
                        } else {
                            Pill(text: "Widerrufen", tint: .danger)
                        }
                    }
                    if let lim = e.downloadLimit { SpecLabel("\(e.downloadCount ?? 0) von \(lim) Downloads") }
                    if let l = e.licenseText?.nilIfEmpty { Text(l).font(.wr(.caption)).foregroundStyle(Color.muted) }
                }
                .padding(.vertical, 8)
            }
        }
    }

    @ViewBuilder private func policies(_ o: MarketOrderDetail) -> some View {
        if o.shop.returnPolicy?.nilIfEmpty != nil || o.shop.shippingPolicy?.nilIfEmpty != nil {
            VStack(alignment: .leading, spacing: 10) {
                SectionHeader("Bedingungen des Shops", number: "07")
                if let s = o.shop.shippingPolicy?.nilIfEmpty { MarketPolicyBlock(title: "Versand", text: s, symbol: "shippingbox") }
                if let r = o.shop.returnPolicy?.nilIfEmpty { MarketPolicyBlock(title: "Rückgabe", text: r, symbol: "arrow.uturn.backward") }
            }
        }
    }
}

// MARK: - Versand & Zahlungen (gemeinsam)

struct MarketShipmentList: View {
    var shipments: [MarketShipment]
    @Environment(Router.self) private var router
    var body: some View {
        ForEach(shipments) { s in
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Label(s.carrier ?? "Versand", systemImage: "shippingbox").font(.wr(.subheadline, .semibold))
                    Spacer()
                    if s.deliveredAt != nil { Pill(text: "Zugestellt", symbol: "checkmark", tint: .moss) }
                }
                if let t = s.trackingNo?.nilIfEmpty { Text("Sendungsnummer \(t)").font(.wr(.footnote).monospaced()).foregroundStyle(Color.ink2).textSelection(.enabled) }
                Text("Versendet am \(Fmt.dateTime(s.shippedAt))").font(.wr(.caption)).foregroundStyle(Color.muted)
                if let u = s.trackingUrl?.nilIfEmpty, let url = URL(string: u) {
                    Button { router.present(.web(url: url)) } label: { Label("Sendung verfolgen", systemImage: "location") }
                        .buttonStyle(.glass).controlSize(.small).padding(.top, 2)
                }
            }
            .padding(.vertical, 8)
        }
    }
}

struct MarketPaymentList: View {
    var payments: [MarketPayment]
    var refunds: [MarketRefund]
    var currency: String?
    var body: some View {
        if payments.isEmpty {
            Text("Noch keine Zahlung.").font(.wr(.footnote)).foregroundStyle(Color.muted)
        }
        ForEach(payments) { p in
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 3) {
                    MarketStatusPill.payment(p.status)
                    Text([p.provider == "simulated" ? "Testmodus" : p.provider == "stripe" ? "Stripe" : p.provider, Optional(Fmt.dateTime(p.createdAt))].compactMap { $0?.nilIfEmpty }.joined(separator: " · "))
                        .font(.wr(.caption)).foregroundStyle(Color.muted)
                    if let f = p.failureReason?.nilIfEmpty { Text(f).font(.wr(.caption)).foregroundStyle(Color.danger) }
                }
                Spacer()
                Text(Fmt.money(p.amountMinor, currency: p.currency ?? currency)).font(.wr(.subheadline, .medium)).monospacedDigit()
            }
            .padding(.vertical, 6)
        }
        if !refunds.isEmpty {
            SpecLabel("Erstattungen").padding(.top, 10)
            ForEach(refunds) { r in
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(r.reason?.nilIfEmpty ?? "Erstattung").font(.wr(.footnote)).foregroundStyle(Color.ink2)
                        Text("\(r.status == "SUCCEEDED" ? "Bestätigt" : r.status == "PENDING" ? "In Bearbeitung" : r.status == "FAILED" ? "Fehlgeschlagen" : r.status) · \(Fmt.date(r.createdAt))")
                            .font(.wr(.caption)).foregroundStyle(r.status == "FAILED" ? Color.danger : Color.muted)
                    }
                    Spacer()
                    Text("− " + Fmt.money(r.amountMinor, currency: currency)).font(.wr(.footnote, .medium)).monospacedDigit()
                }
                .padding(.vertical, 4)
            }
        }
    }
}

// MARK: - Problem melden

struct MarketProblemSheet: View {
    var orderId: String
    var onDone: () -> Void
    @State private var note = ""
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var app

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Was ist passiert?", text: $note, axis: .vertical).lineLimit(4...10)
                } header: { Text("Beschreibung") } footer: {
                    Text(note.trimmed.count < 10 ? "Mindestens 10 Zeichen. Der Shop wird informiert und kann dir direkt antworten." : "Der Shop wird informiert und kann dir direkt antworten.")
                }
            }
            .scrollContentBackground(.hidden)
            .background(Color.paper)
            .navigationTitle("Problem melden")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    AsyncButton("Senden") {
                        let r = await app.run {
                            let m: MarketMessage = try await APIClient.shared.post("/orders/\(orderId)/problem", ["note": JSONValue.string(note.trimmed)])
                            app.show(m.message ?? "Danke. Der Shop wurde informiert.")
                        }
                        if r { onDone(); dismiss() }
                    }
                    .disabled(note.trimmed.count < 10 || note.count > 2000)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

// MARK: - Bewertung

struct MarketReviewSheet: View {
    var item: MarketOrderItem
    var shopName: String
    var onDone: () -> Void
    @State private var productRating = 0
    @State private var sellerRating = 0
    @State private var text = ""
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var app

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    MarketStarPicker(title: "Wie gefällt dir „\(item.title)“?", rating: $productRating)
                    MarketStarPicker(title: "Wie war es mit \(shopName)? (optional)", rating: $sellerRating)
                }
                Section {
                    TextField("Was sollen andere wissen?", text: $text, axis: .vertical).lineLimit(3...8)
                } header: { Text("Deine Worte (optional)") } footer: { Text("Bewertungen erscheinen öffentlich mit deinem Namen. Bleib fair und konkret.") }
            }
            .scrollContentBackground(.hidden)
            .background(Color.paper)
            .navigationTitle("Bewerten")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    AsyncButton("Senden") {
                        var body: [String: JSONValue] = ["orderItemId": .string(item.id), "productRating": .number(Double(productRating)), "body": .string(text.trimmed)]
                        if sellerRating > 0 { body["sellerRating"] = .number(Double(sellerRating)) }
                        let ok = await app.run("Danke für deine Bewertung.") { _ = try await APIClient.shared.post("/reviews", body) as JSONValue }
                        if ok { onDone(); dismiss() }
                    }
                    .disabled(productRating == 0 || text.count > 2000)
                }
            }
        }
    }
}
