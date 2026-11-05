import SwiftUI

// Gemeinsame Bausteine des Marktplatzes (nur innerhalb von Features/Market verwendet).

// MARK: - Status

enum MarketStatusTone {
    static func order(_ s: String) -> Color {
        switch s {
        case "PENDING_PAYMENT": .warn
        case "NEW": .slate
        case "IN_PROGRESS": .clay
        case "READY_TO_SHIP": .ochre
        case "SHIPPED", "COMPLETED": .moss
        case "REFUNDED": .plum
        case "PROBLEM": .danger
        default: .muted
        }
    }

    static func payment(_ s: String) -> Color {
        switch s {
        case "SUCCEEDED": .moss
        case "REQUIRES_PAYMENT", "PROCESSING": .warn
        case "FAILED", "DISPUTED": .danger
        case "REFUNDED", "PARTIALLY_REFUNDED": .plum
        default: .muted
        }
    }

    static func product(_ s: String) -> Color {
        switch s {
        case "ACTIVE": .moss
        case "DRAFT": .slate
        case "PAUSED": .warn
        case "SOLD_OUT": .ink
        case "DISABLED": .danger
        default: .muted
        }
    }

    static func shop(_ s: String) -> Color {
        switch s {
        case "ACTIVE": .moss
        case "PENDING_VERIFICATION": .warn
        case "PAUSED": .ochre
        case "SUSPENDED": .danger
        default: .slate
        }
    }
}

/// Ruhige Status-Kapsel mit Punkt (wie `StatusBadge`, aber für Handel)
struct MarketStatusPill: View {
    var label: String
    var tint: Color

    var body: some View {
        HStack(spacing: 5) {
            Circle().fill(tint).frame(width: 6, height: 6)
            Text(label).font(.wr(.caption, .semibold)).foregroundStyle(tint)
        }
        .padding(.horizontal, 9).padding(.vertical, 4)
        .background(tint.opacity(0.12), in: Capsule())
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Status: \(label)")
    }

    static func order(_ s: String) -> MarketStatusPill { MarketStatusPill(label: L.orderStatus[s] ?? s, tint: MarketStatusTone.order(s)) }
    static func payment(_ s: String) -> MarketStatusPill { MarketStatusPill(label: L.paymentStatus[s] ?? s, tint: MarketStatusTone.payment(s)) }
    static func product(_ s: String) -> MarketStatusPill { MarketStatusPill(label: L.productStatus[s] ?? s, tint: MarketStatusTone.product(s)) }
    static func shop(_ s: String) -> MarketStatusPill { MarketStatusPill(label: L.shopStatus[s] ?? s, tint: MarketStatusTone.shop(s)) }
}

// MARK: - Sterne

struct MarketStars: View {
    var rating: Double
    var size: CGFloat = 12
    var body: some View {
        HStack(spacing: 1.5) {
            ForEach(1...5, id: \.self) { i in
                let d = Double(i)
                Image(systemName: rating >= d ? "star.fill" : rating >= d - 0.5 ? "star.leadinghalf.filled" : "star")
                    .font(.wr(size: size))
                    .foregroundStyle(rating >= d - 0.5 ? Color.ochre : Color.lineStrong)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(String(format: "%.1f von 5 Sternen", rating))
    }
}

struct MarketStarPicker: View {
    var title: String
    @Binding var rating: Int
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.wr(.subheadline, .semibold))
            HStack(spacing: 6) {
                ForEach(1...5, id: \.self) { i in
                    Button {
                        Haptics.selection()
                        rating = i
                    } label: {
                        Image(systemName: i <= rating ? "star.fill" : "star")
                            .font(.wr(.title2))
                            .foregroundStyle(i <= rating ? Color.ochre : Color.lineStrong)
                            .frame(width: 44, height: 44)
                            .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(i) von 5")
                    .accessibilityAddTraits(i == rating ? .isSelected : [])
                }
            }
        }
    }
}

struct MarketReviewRow: View {
    var review: MarketReview
    @Environment(Router.self) private var router

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                AvatarView(url: review.author?.profile?.avatarUrl, name: review.author?.displayName ?? "?", size: 30)
                VStack(alignment: .leading, spacing: 2) {
                    Text(review.author?.displayName ?? "Mitglied").font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink)
                    Text(Fmt.date(review.createdAt)).font(.wr(.caption)).foregroundStyle(Color.muted)
                }
                Spacer()
                MarketStars(rating: Double(review.productRating))
            }
            if let p = review.product?.title { SpecLabel(p, color: .moss) }
            if let v = review.orderItem?.variantName?.nilIfEmpty { SpecLabel("Variante: \(v)") }
            if let b = review.body?.nilIfEmpty { Text(b).font(.wr(.subheadline)).foregroundStyle(Color.ink2).fixedSize(horizontal: false, vertical: true) }
            if let s = review.sellerRating { HStack(spacing: 6) { Text("Shop").font(.wr(.caption)).foregroundStyle(Color.muted); MarketStars(rating: Double(s), size: 10) } }
            if let reply = review.sellerReply?.nilIfEmpty {
                VStack(alignment: .leading, spacing: 3) {
                    SpecLabel("Antwort des Shops")
                    Text(reply).font(.wr(.footnote)).foregroundStyle(Color.ink2)
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .sunkenSurface(radius: Radius.small)
            }
        }
        .padding(.vertical, 12)
        .hairline()
        .contextMenu {
            Button("Bewertung melden …", systemImage: "flag") { router.present(.report(targetType: "REVIEW", targetId: review.id)) }
        }
    }
}

// MARK: - Beträge

struct MarketAmountRow: View {
    var label: String
    var value: String
    var strong = false
    var muted = false
    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label).font(strong ? .wr(.body, .semibold) : .wr(.subheadline)).foregroundStyle(muted ? Color.muted : Color.ink2)
            Spacer(minLength: 12)
            Text(value).font(strong ? .wr(.title3, .semibold) : .wr(.subheadline, .medium)).monospacedDigit().foregroundStyle(muted ? Color.muted : Color.ink)
        }
        .accessibilityElement(children: .combine)
    }
}

/// Kostenaufstellung für Käufer:innen (§5.7)
struct MarketFeeSummary: View {
    var subtotal: Int
    var shipping: Int
    var total: Int
    var currency: String? = "CHF"
    var body: some View {
        VStack(spacing: 8) {
            MarketAmountRow(label: "Zwischensumme", value: Fmt.money(subtotal, currency: currency))
            MarketAmountRow(label: "Versand", value: shipping == 0 ? "kostenlos" : Fmt.money(shipping, currency: currency))
            Divider().overlay(Color.line)
            MarketAmountRow(label: "Total", value: Fmt.money(total, currency: currency), strong: true)
        }
    }
}

/// Kosten einer Bestellung; für Verkäufer:innen mit Provision und Auszahlungsbetrag.
struct MarketOrderTotals: View {
    var order: MarketOrderDetail
    var seller = false
    var body: some View {
        VStack(spacing: 8) {
            MarketFeeSummary(subtotal: order.subtotalMinor, shipping: order.shippingMinor, total: order.totalMinor, currency: order.currency)
            if seller, let fee = order.platformFeeMinor {
                MarketAmountRow(label: "Plattformgebühr (\(Fmt.percent(bps: order.feeBps ?? 0)) auf den Warenwert)", value: "− " + Fmt.money(fee, currency: order.currency), muted: true)
                MarketAmountRow(label: "Dein Anteil vor Zahlungsgebühren", value: Fmt.money(order.totalMinor - fee, currency: order.currency))
            }
            let refunded = (order.refunds ?? []).filter { $0.status == "SUCCEEDED" }.reduce(0) { $0 + $1.amountMinor }
            if refunded > 0 { MarketAmountRow(label: "Erstattet", value: "− " + Fmt.money(refunded, currency: order.currency), muted: true) }
        }
    }
}

// MARK: - Faden-Zeitleiste (Bestellverlauf)

/// Status-Zeitleiste als durchgehender Faden: jede Station ein Knoten, die aktuelle hervorgehoben.
struct MarketThreadTimeline: View {
    var events: [MarketOrderEvent]
    var currentStatus: String

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(events.enumerated()), id: \.element.id) { idx, e in
                let last = idx == events.count - 1
                let tint = MarketStatusTone.order(e.to)
                HStack(alignment: .top, spacing: 14) {
                    VStack(spacing: 0) {
                        ZStack {
                            Circle().fill(last ? tint : Color.card).frame(width: 14, height: 14)
                            Circle().strokeBorder(tint, lineWidth: 2).frame(width: 14, height: 14)
                        }
                        .padding(.top, 3)
                        if !last {
                            Rectangle().fill(Color.moss.opacity(0.45)).frame(width: 2).frame(maxHeight: .infinity)
                        }
                    }
                    .frame(width: 14)
                    VStack(alignment: .leading, spacing: 3) {
                        HStack(alignment: .firstTextBaseline) {
                            Text(L.orderStatus[e.to] ?? e.to).font(.wr(.subheadline).weight(last ? .semibold : .medium)).foregroundStyle(Color.ink)
                            Spacer(minLength: 8)
                            Text(Fmt.dateTime(e.createdAt)).font(.wr(.caption)).foregroundStyle(Color.muted)
                        }
                        if let n = e.note?.nilIfEmpty { Text(n).font(.wr(.footnote)).foregroundStyle(Color.ink2).fixedSize(horizontal: false, vertical: true) }
                    }
                    .padding(.bottom, last ? 0 : 18)
                }
                .accessibilityElement(children: .combine)
            }
        }
    }
}

// MARK: - Abschnitt als Karte

struct MarketSection<Content: View>: View {
    var title: String
    var number: String?
    var subtitle: String?
    @ViewBuilder var content: () -> Content

    init(_ title: String, number: String? = nil, subtitle: String? = nil, @ViewBuilder content: @escaping () -> Content) {
        self.title = title; self.number = number; self.subtitle = subtitle; self.content = content
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(title, number: number, subtitle: subtitle)
            VStack(alignment: .leading, spacing: 0) { content() }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .cardSurface()
        }
    }
}

struct MarketAddressBlock: View {
    var address: MarketAddress?
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            ForEach(address?.lines ?? ["Keine Adresse hinterlegt"], id: \.self) { l in
                Text(l).font(.wr(.subheadline)).foregroundStyle(Color.ink2)
            }
        }
        .textSelection(.enabled)
    }
}

struct MarketFieldError: View {
    var text: String?
    var body: some View {
        if let text {
            Label(text, systemImage: "exclamationmark.circle.fill").font(.wr(.caption)).foregroundStyle(Color.danger)
        }
    }
}

/// Safari-Ziel für lokale Sheets (mit Rückmeldung beim Schliessen)
struct MarketWebLink: Identifiable, Hashable {
    let id = UUID()
    let url: URL
}

// MARK: - Toolbar: Warenkorb mit Badge

struct MarketCartToolbarButton: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    var body: some View {
        Button { router.open(.cart) } label: {
            Image(systemName: "bag")
                .overlay(alignment: .topTrailing) {
                    if app.cartCount > 0 {
                        Text("\(min(app.cartCount, 99))")
                            .font(.wr(size: 10, weight: .bold)).monospacedDigit()
                            .foregroundStyle(Color.paper)
                            .padding(.horizontal, 4).frame(minWidth: 16, minHeight: 16)
                            .background(Color.clay, in: Capsule())
                            .offset(x: 9, y: -8)
                            .contentTransition(.numericText())
                    }
                }
        }
        .accessibilityLabel(app.cartCount > 0 ? "Warenkorb, \(app.cartCount) Artikel" : "Warenkorb")
    }
}

// MARK: - Shopkarte (Karussell)

struct MarketShopCardView: View {
    var shop: ShopCard
    @Environment(Router.self) private var router

    var body: some View {
        Button { router.open(.shop(slug: shop.slug)) } label: {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 4) {
                    let covers = Array((shop.covers ?? []).prefix(3))
                    if covers.isEmpty {
                        CoverView(url: nil, seed: shop.id, category: nil, showLabel: false)
                    } else {
                        ForEach(covers, id: \.self) { c in
                            CoverView(url: c.url, seed: c.id ?? shop.id, category: c.category, showLabel: false)
                        }
                    }
                }
                .frame(height: 92)
                .clipShape(.rect(cornerRadius: Radius.inner, style: .continuous))
                HStack(spacing: 8) {
                    AvatarView(url: shop.owner?.avatarUrl, name: shop.owner?.displayName ?? shop.name, size: 26)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(shop.name).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink).lineLimit(1)
                        Text(shop.owner?.displayName ?? "").font(.wr(.caption)).foregroundStyle(Color.muted).lineLimit(1)
                    }
                }
                if let t = shop.tagline?.nilIfEmpty {
                    Text(t).font(.wr(.footnote)).foregroundStyle(Color.ink2).lineLimit(2).multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                Spacer(minLength: 0)
                HStack(spacing: 8) {
                    SpecLabel(Fmt.plural(shop.productCount ?? 0, "Arbeit", "Arbeiten"))
                    if let c = shop.country { SpecLabel("· \(c)") }
                    Spacer()
                    if (shop.ratingCount ?? 0) > 0, let r = shop.ratingAvg { MarketStars(rating: r, size: 9) }
                }
            }
            .padding(12)
            .frame(width: 236, height: 236, alignment: .topLeading)
            .cardSurface()
        }
        .buttonStyle(.pressable)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Shop öffnen")
    }
}

// MARK: - Testzahlung (Zahlungsmodus „simulated“)

/// Native Testzahlungs-Ansicht – ersetzt `/kasse/simulation` im Web.
struct MarketSimulatedPaymentSheet: View {
    var orderIds: [String]
    var totalMinor: Int?
    var onFinish: (Bool) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var app

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    PageTitle(kicker: "Testmodus", title: "Zahlung simulieren", subtitle: "Es wird nichts belastet. Der Ablauf verbucht die Bestellung genau so, wie es der Zahlungsanbieter später tut.")
                    NoticeView(tone: .warn, title: "Keine echte Zahlung", message: "Dieser Bildschirm erscheint nur, solange Werkuno ohne Zahlungsanbieter läuft.")
                    VStack(spacing: 10) {
                        SpecRow(label: "Bestellungen", value: "\(orderIds.count)", symbol: "shippingbox")
                        if let totalMinor { SpecRow(label: "Betrag", value: Fmt.money(totalMinor), symbol: "creditcard") }
                    }
                    VStack(spacing: 10) {
                        AsyncButton { await run("success") } label: {
                            Label("Zahlung erfolgreich simulieren", systemImage: "checkmark.seal")
                        }
                        .primaryButton()
                        AsyncButton { await run("failure") } label: {
                            Label("Zahlung fehlgeschlagen simulieren", systemImage: "xmark.octagon").frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.glass)
                        .controlSize(.large)
                    }
                    .padding(.top, 6)
                }
                .padding(Space.gutter)
            }
            .background(Color.paper)
            .navigationTitle("Testzahlung")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Später") { dismiss() } }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func run(_ outcome: String) async {
        do {
            for id in orderIds {
                _ = try await APIClient.shared.post("/orders/\(id)/simulate", ["outcome": JSONValue.string(outcome)]) as JSONValue
            }
            if outcome == "success" { Haptics.success() } else { app.show("Zahlung als fehlgeschlagen simuliert. Die Reservierung wurde freigegeben.", style: .warning) }
            onFinish(outcome == "success")
            dismiss()
        } catch {
            app.show(error: error)
        }
    }
}

// MARK: - Beleg (nativ)

struct MarketReceiptSheet: View {
    var orderId: String
    @Environment(\.dismiss) private var dismiss
    @State private var receipt: MarketReceipt?
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Group {
                if let r = receipt { content(r.order, seller: r.role == "seller") }
                else if let error { ErrorStateView(message: error) { await load() } }
                else { LoadingView() }
            }
            .background(Color.paper)
            .navigationTitle("Beleg")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Fertig") { dismiss() } }
                if receipt != nil {
                    ToolbarItem(placement: .topBarLeading) {
                        ShareLink(item: AppConfig.webURL("/beleg/\(orderId)")) { Image(systemName: "square.and.arrow.up") }
                            .accessibilityLabel("Beleg teilen")
                    }
                }
            }
            .task { await load() }
        }
    }

    private func load() async {
        do { receipt = try await APIClient.shared.get("/orders/\(orderId)/receipt"); error = nil }
        catch { self.error = (error as? APIError)?.message ?? error.localizedDescription }
    }

    private func content(_ o: MarketOrderDetail, seller: Bool) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 6) {
                    SpecLabel("Beleg · \(o.number)", color: .moss)
                    Text(o.shop.name).font(.display(28))
                    Text("Bezahlt am \(Fmt.dateTime(o.paidAt))").font(.wr(.subheadline)).foregroundStyle(Color.muted)
                }
                VStack(alignment: .leading, spacing: 4) {
                    SpecLabel("Verkäufer:in")
                    let v = o.shop.verification
                    ForEach([v?.businessName ?? v?.legalName, v?.addressLine, [v?.postalCode, v?.city].compactMap { $0 }.joined(separator: " ").nilIfEmpty, v?.country.map { L.country($0) }, v?.vatId.map { "MWST: \($0)" }].compactMap { $0?.nilIfEmpty }, id: \.self) {
                        Text($0).font(.wr(.subheadline)).foregroundStyle(Color.ink2)
                    }
                    Text(o.shop.sellerType == "BUSINESS" ? "Gewerbliche:r Verkäufer:in" : "Privatperson").font(.wr(.caption)).foregroundStyle(Color.muted)
                }
                VStack(alignment: .leading, spacing: 4) {
                    SpecLabel(o.isDigitalOnly ? "Rechnungsadresse" : "Lieferadresse")
                    MarketAddressBlock(address: o.shippingAddress)
                }
                VStack(spacing: 0) {
                    ForEach(o.items) { i in
                        HStack(alignment: .firstTextBaseline) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("\(i.quantity) × \(i.title)").font(.wr(.subheadline)).foregroundStyle(Color.ink)
                                if let v = i.variantName?.nilIfEmpty { Text(v).font(.wr(.caption)).foregroundStyle(Color.muted) }
                            }
                            Spacer()
                            Text(Fmt.money(i.unitMinor * i.quantity, currency: o.currency)).font(.wr(.subheadline)).monospacedDigit()
                        }
                        .padding(.vertical, 10)
                        .hairline()
                    }
                }
                MarketOrderTotals(order: o, seller: seller)
                VStack(alignment: .leading, spacing: 6) {
                    if let p = o.latestPayment {
                        Text("Zahlung: \(L.paymentStatus[p.status] ?? p.status)\(p.provider == "stripe" ? " · über Stripe" : p.provider == "simulated" ? " · TESTMODUS (keine echte Zahlung)" : "")")
                    }
                    Text("Vertragspartner ist der oben genannte Verkäufer. Werkuno vermittelt den Kauf und wickelt die Zahlung über Stripe ab. Dieser Beleg ist keine Rechnung im mehrwertsteuerrechtlichen Sinn, sofern der Verkäufer keine MWST-Nummer ausweist.")
                }
                .font(.wr(.caption)).foregroundStyle(Color.muted)
            }
            .padding(Space.gutter)
        }
    }
}
