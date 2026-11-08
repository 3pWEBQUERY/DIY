import SwiftUI

// MARK: - Werkuno Studio → Bestellungen

struct StudioOrdersView: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router

    @State private var tab = "neu"
    @State private var items: [MarketOrderSummary] = []
    @State private var counts: [String: Int] = [:]
    @State private var cursor: String?
    @State private var loaded = false
    @State private var error: String?

    private var tabItems: [(value: String, label: String)] {
        MarketSellerTabs.all.map { t in
            let n = counts[t.status] ?? 0
            return (t.key, n > 0 ? "\(t.label) · \(n)" : t.label)
        }
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                PageTitle(kicker: "Werkuno Studio", title: "Bestellungen", subtitle: "In der Reihenfolge des Arbeitsablaufs – älteste offene zuerst.")
                    .padding(.horizontal, Space.gutter)
                if app.me?.shop == nil {
                    MarketNoShopCTA().padding(.horizontal, Space.gutter)
                } else {
                    ChipBar(items: tabItems, selection: $tab)
                    VStack(alignment: .leading, spacing: 12) {
                        if !loaded {
                            LoadingView()
                        } else if let error, items.isEmpty {
                            ErrorStateView(message: error) { await load(reset: true) }
                        } else if items.isEmpty {
                            EmptyStateView(symbol: "shippingbox", title: "Keine Bestellungen", message: emptyText)
                                .cardSurface()
                        } else {
                            ForEach(items) { o in MarketOrderRow(order: o, seller: true) { router.open(.sellerOrder(id: o.id)) } }
                            LoadMoreTrigger(hasMore: cursor != nil) { await load(reset: false) }
                        }
                    }
                    .padding(.horizontal, Space.gutter)
                }
            }
            .padding(.bottom, 40)
        }
        .background(Color.paper)
        .navigationTitle("Bestellungen")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: tab) { if app.me?.shop != nil { await load(reset: true) } }
        .refreshable { await load(reset: true) }
    }

    private var emptyText: String {
        switch tab {
        case "neu": "Neue, bezahlte Bestellungen erscheinen hier. Du wirst zusätzlich benachrichtigt."
        case "problemfaelle": "Keine offenen Problemfälle – schön."
        default: "In diesem Status gibt es gerade nichts."
        }
    }

    private func load(reset: Bool) async {
        do {
            let r: MarketSellerOrders = try await APIClient.shared.get("/studio/orders", query: ["tab": tab, "cursor": reset ? nil : cursor])
            withAnimation(.smooth) {
                if reset { items = r.items } else { items += r.items }
                counts = r.counts ?? counts
            }
            cursor = r.nextCursor
            error = nil
        } catch is CancellationError {
        } catch {
            self.error = (error as? APIError)?.message ?? error.localizedDescription
            cursor = nil
        }
        loaded = true
    }
}

// MARK: - Bestelldetail (Verkäufer:in)

struct SellerOrderDetailView: View {
    var id: String

    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router

    @State private var order: MarketOrderDetail?
    @State private var error: String?
    @State private var action: MarketSellerAction?
    @State private var showReceipt = false

    var body: some View {
        Group {
            if let order { content(order) }
            else if let error { ErrorStateView(message: error) { await load() } }
            else { LoadingView(text: "Bestellung wird geladen …") }
        }
        .background(Color.paper)
        .navigationTitle(order?.number ?? "Bestellung")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let o = order {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        if let h = o.buyer?.profile?.handle {
                            Button("Nachricht an Käufer:in", systemImage: "bubble.left") { router.present(.newConversation(handle: h, orderId: o.id)) }
                            Button("Profil ansehen", systemImage: "person.crop.circle") { router.open(.profile(handle: h)) }
                        }
                        if o.paidAt != nil { Button("Beleg anzeigen", systemImage: "doc.text") { showReceipt = true } }
                    } label: { Image(systemName: "ellipsis") }
                        .accessibilityLabel("Weitere Aktionen")
                }
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .sheet(item: $action) { a in
            MarketSellerActionSheet(orderId: id, action: a, currency: order?.currency) { Task { await load() } }
        }
        .sheet(isPresented: $showReceipt) { MarketReceiptSheet(orderId: id) }
    }

    private func load() async {
        do {
            let o: MarketOrderDetail = try await APIClient.shared.get("/studio/orders/\(id)")
            withAnimation(.smooth) { order = o }
            error = nil
        } catch is CancellationError {
        } catch {
            if order == nil { self.error = (error as? APIError)?.message ?? error.localizedDescription } else { app.show(error: error) }
        }
    }

    private func content(_ o: MarketOrderDetail) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 8) {
                    SpecLabel("Bestellung · \(Fmt.dateTime(o.paidAt ?? o.createdAt))", color: .moss)
                    Text(o.buyer?.displayName ?? "Käufer:in").font(.display(30)).accessibilityAddTraits(.isHeader)
                    HStack(spacing: 10) {
                        MarketStatusPill.order(o.status)
                        Text(o.number).font(.wr(.footnote).monospaced()).foregroundStyle(Color.muted).textSelection(.enabled)
                        Spacer()
                        Text(Fmt.money(o.totalMinor, currency: o.currency)).font(.wr(.headline)).monospacedDigit()
                    }
                }
                nextSteps(o)
                MarketSection("Positionen", number: "01") {
                    ForEach(o.items) { i in
                        HStack(alignment: .top, spacing: 12) {
                            CoverView(url: i.product?.coverUrl, seed: i.productId ?? i.id, category: i.product?.category, showLabel: false)
                                .frame(width: 48, height: 48)
                                .clipShape(.rect(cornerRadius: Radius.small, style: .continuous))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(i.title).font(.wr(.subheadline, .semibold))
                                if let v = i.variantName?.nilIfEmpty { Text("Variante: \(v)").font(.wr(.caption)).foregroundStyle(Color.muted) }
                                Text("\(i.quantity) × \(Fmt.money(i.unitMinor, currency: o.currency))").font(.wr(.caption)).monospacedDigit().foregroundStyle(Color.muted)
                                if i.isDigital { Label("Digital", systemImage: "arrow.down.circle").font(.wr(.caption2)).foregroundStyle(Color.slate) }
                            }
                            Spacer()
                            Text(Fmt.money(i.unitMinor * i.quantity, currency: o.currency)).font(.wr(.subheadline)).monospacedDigit()
                        }
                        .padding(.vertical, 8)
                        .hairline()
                    }
                    MarketOrderTotals(order: o, seller: true).padding(.top, 12)
                }
                MarketSection(o.isDigitalOnly ? "Rechnungsadresse" : "Versandadresse", number: "02") {
                    MarketAddressBlock(address: o.shippingAddress)
                    if let n = o.buyerNote?.nilIfEmpty {
                        VStack(alignment: .leading, spacing: 3) {
                            SpecLabel("Nachricht der Käuferin bzw. des Käufers")
                            Text(n).font(.wr(.subheadline)).foregroundStyle(Color.ink2)
                        }
                        .padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.claySoft, in: .rect(cornerRadius: Radius.small, style: .continuous))
                        .padding(.top, 12)
                    }
                    if let h = o.buyer?.profile?.handle {
                        Button { router.present(.newConversation(handle: h, orderId: o.id)) } label: { Label("Nachricht an \(o.buyer?.displayName ?? "Käufer:in")", systemImage: "bubble.left") }
                            .buttonStyle(.glass).padding(.top, 12)
                    }
                }
                if let ships = o.shipments, !ships.isEmpty {
                    MarketSection("Versand", number: "03") { MarketShipmentList(shipments: ships) }
                }
                MarketSection("Zahlung", number: "04") {
                    MarketPaymentList(payments: o.payments ?? [], refunds: o.refunds ?? [], currency: o.currency)
                }
                MarketSection("Verlauf", number: "05") {
                    MarketThreadTimeline(events: o.events ?? [], currentStatus: o.status)
                }
            }
            .padding(.horizontal, Space.gutter)
            .padding(.bottom, 40)
        }
    }

    // MARK: Nächste Schritte (Statusmaschine)

    @ViewBuilder private func nextSteps(_ o: MarketOrderDetail) -> some View {
        let next = L.orderTransitions[o.status] ?? []
        let generic = next.filter { ["IN_PROGRESS", "READY_TO_SHIP", "COMPLETED", "PROBLEM"].contains($0) }
        let canShip = next.contains("SHIPPED")
        let canCancel = next.contains("CANCELLED") && (o.shipments ?? []).isEmpty && o.status != "PENDING_PAYMENT"
        let canRefund = o.isPaid && o.refundable > 0
        let primary: String? = generic.first { $0 != "PROBLEM" } ?? (canShip ? "SHIPPED" : nil)
        let secondary = generic.filter { $0 != primary }
        if primary != nil || !secondary.isEmpty || canShip || canCancel || canRefund {
            VStack(alignment: .leading, spacing: 10) {
                SpecLabel("Nächster Schritt")
                if let primary {
                    Button { action = primary == "SHIPPED" ? .ship : .transition(primary) } label: {
                        Label(MarketSellerAction.label(for: primary), systemImage: MarketSellerAction.symbol(for: primary))
                    }
                    .primaryButton()
                }
                FlowLayout(spacing: 8, lineSpacing: 8) {
                    if canShip && primary != "SHIPPED" {
                        Button { action = .ship } label: { Label("Versand erfassen", systemImage: "shippingbox") }.buttonStyle(.glass)
                    }
                    ForEach(secondary, id: \.self) { to in
                        Button { action = .transition(to) } label: { Label(MarketSellerAction.label(for: to), systemImage: MarketSellerAction.symbol(for: to)) }
                            .buttonStyle(.glass)
                    }
                    if canRefund {
                        Button { action = .refund(o.refundable) } label: { Label("Erstatten", systemImage: "arrow.uturn.backward.circle") }.buttonStyle(.glass)
                    }
                    if canCancel {
                        Button(role: .destructive) { action = .cancel } label: { Label("Stornieren", systemImage: "xmark.circle") }.buttonStyle(.glass)
                    }
                }
                Text("Jeder Schritt wird protokolliert; die Käuferin bzw. der Käufer wird benachrichtigt.").font(.wr(.caption)).foregroundStyle(Color.muted)
            }
            .padding(16)
            .cardSurface()
        }
    }
}

// MARK: - Aktionen

enum MarketSellerAction: Identifiable, Hashable {
    case transition(String)
    case ship
    case refund(Int)
    case cancel

    var id: String {
        switch self {
        case .transition(let s): "t-\(s)"
        case .ship: "ship"
        case .refund: "refund"
        case .cancel: "cancel"
        }
    }

    static func label(for status: String) -> String {
        switch status {
        case "IN_PROGRESS": "In Bearbeitung nehmen"
        case "READY_TO_SHIP": "Als versandbereit markieren"
        case "SHIPPED": "Versand erfassen"
        case "COMPLETED": "Als abgeschlossen markieren"
        case "PROBLEM": "Als Problemfall markieren"
        default: L.orderStatus[status] ?? status
        }
    }

    static func symbol(for status: String) -> String {
        switch status {
        case "IN_PROGRESS": "hammer"
        case "READY_TO_SHIP": "shippingbox"
        case "SHIPPED": "paperplane"
        case "COMPLETED": "checkmark.circle"
        case "PROBLEM": "exclamationmark.triangle"
        default: "arrow.right.circle"
        }
    }
}

struct MarketSellerActionSheet: View {
    var orderId: String
    var action: MarketSellerAction
    var currency: String?
    var onDone: () -> Void

    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss

    @State private var note = ""
    @State private var carrier = "Die Post"
    @State private var trackingNo = ""
    @State private var trackingUrl = ""
    @State private var amount = ""
    @State private var fields: [String: String] = [:]
    @State private var formError: String?

    private var title: String {
        switch action {
        case .transition(let s): MarketSellerAction.label(for: s)
        case .ship: "Versand erfassen"
        case .refund: "Erstattung"
        case .cancel: "Stornieren & erstatten"
        }
    }

    var body: some View {
        NavigationStack {
            Form {
                if let formError { Section { NoticeView(tone: .danger, message: formError).listRowInsets(EdgeInsets()).listRowBackground(Color.clear) } }
                switch action {
                case .transition(let s):
                    Section {
                        TextField("Notiz an die Käuferin bzw. den Käufer (optional)", text: $note, axis: .vertical).lineLimit(2...6)
                    } footer: {
                        Text(s == "PROBLEM" ? "Beschreibe kurz, was nicht stimmt. Ihr klärt es am besten direkt per Nachricht." : "Die Notiz erscheint im Bestellverlauf und in der Benachrichtigung.")
                    }
                case .ship:
                    Section {
                        TextField("Versanddienstleister", text: $carrier)
                        MarketFieldError(text: fields["carrier"])
                        TextField("Sendungsnummer (optional)", text: $trackingNo).textInputAutocapitalization(.never)
                        TextField("Link zur Sendungsverfolgung (https, optional)", text: $trackingUrl)
                            .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                        MarketFieldError(text: fields["trackingUrl"] ?? (!trackingUrl.isEmpty && !trackingUrl.hasPrefix("https://") ? "Bitte eine https-Adresse angeben" : nil))
                        TextField("Notiz (optional)", text: $note, axis: .vertical).lineLimit(2...4)
                    } footer: { Text("Die Bestellung wird als versendet markiert und die Käuferin bzw. der Käufer benachrichtigt.") }
                case .refund(let max):
                    Section {
                        HStack {
                            Text("Betrag")
                            Spacer()
                            Text(currency ?? "CHF").foregroundStyle(Color.muted)
                            TextField(Fmt.moneyInput(max), text: $amount).keyboardType(.decimalPad).multilineTextAlignment(.trailing).frame(maxWidth: 110)
                        }
                        MarketFieldError(text: fields["amountMinor"])
                        Button("Ganzen Betrag erstatten") { amount = Fmt.moneyInput(max) }
                        TextField("Grund", text: $note, axis: .vertical).lineLimit(2...5)
                        MarketFieldError(text: fields["reason"])
                    } footer: { Text("Erstattbar: \(Fmt.money(max, currency: currency)). Die Plattformgebühr wird anteilig zurückerstattet. Die Erstattung gilt als bestätigt, sobald der Zahlungsanbieter sie verbucht hat.") }
                case .cancel:
                    Section {
                        TextField("Grund der Stornierung", text: $note, axis: .vertical).lineLimit(2...5)
                        MarketFieldError(text: fields["reason"])
                    } footer: { Text("Der Bestand wird zurückgebucht und der bezahlte Betrag vollständig erstattet. Das lässt sich nicht rückgängig machen.") }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Color.paper)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    AsyncButton(confirmTitle, role: isDestructive ? .destructive : nil) { await submit() }
                        .disabled(!valid)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private var confirmTitle: String {
        switch action {
        case .transition: "Bestätigen"
        case .ship: "Versendet"
        case .refund: "Erstatten"
        case .cancel: "Stornieren"
        }
    }

    private var isDestructive: Bool { if case .cancel = action { true } else { false } }

    private var valid: Bool {
        switch action {
        case .transition: return note.count <= 1000
        case .ship: return carrier.trimmed.count >= 2 && (trackingUrl.isEmpty || trackingUrl.hasPrefix("https://"))
        case .refund(let max):
            guard let a = Fmt.parseMoney(amount), a >= 1, a <= max else { return false }
            return note.trimmed.count >= 3
        case .cancel: return note.trimmed.count >= 3
        }
    }

    private func submit() async {
        formError = nil
        do {
            let r: MarketMessage
            switch action {
            case .transition(let to):
                r = try await APIClient.shared.post("/studio/orders/\(orderId)/transition", ["to": JSONValue.string(to), "note": .string(note.trimmed)])
            case .ship:
                r = try await APIClient.shared.post("/studio/orders/\(orderId)/shipment", ["carrier": JSONValue.string(carrier.trimmed), "trackingNo": .string(trackingNo.trimmed), "trackingUrl": .string(trackingUrl.trimmed), "note": .string(note.trimmed)])
            case .refund:
                r = try await APIClient.shared.post("/studio/orders/\(orderId)/refund", ["amountMinor": JSONValue.from(Fmt.parseMoney(amount)), "reason": .string(note.trimmed)])
            case .cancel:
                r = try await APIClient.shared.post("/studio/orders/\(orderId)/cancel", ["reason": JSONValue.string(note.trimmed)])
            }
            Haptics.success()
            app.show(r.message ?? "Gespeichert.")
            onDone()
            dismiss()
        } catch let e as APIError {
            fields = e.fields ?? [:]
            formError = e.message
            Haptics.warning()
        } catch {
            formError = error.localizedDescription
        }
    }
}
