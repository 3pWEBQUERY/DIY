import SwiftUI

// MARK: - Gutscheine und Sets (Bundles)
//
// Gutscheine: je Shop ein Code im Warenkorb (`POST /cart/coupon`, `DELETE /cart/coupon/:shopId`).
// Sets: mehrere Produkte eines Shops mit Set-Rabatt, z. B. Materialset zu einer Anleitung
// (`GET /tutorials/:id/bundles`, `GET /bundles/for-product/:id`, `POST /bundles/:id/cart`).
// Der Rabatt wird im Warenkorb und an der Kasse auf dem Server berechnet.

struct MarketDiscountRow: Decodable, Hashable, Sendable {
    var kind: String
    var label: String
    var amountMinor: Int
}

struct MarketCartCoupon: Decodable, Hashable, Sendable {
    var id: String
    var code: String
    var valueLabel: String
    var problem: String?
}

struct MarketBundle: Decodable, Hashable, Identifiable, Sendable {
    struct Shop: Decodable, Hashable, Sendable { var slug: String; var name: String }
    struct Item: Decodable, Hashable, Identifiable, Sendable {
        var productId: String
        var title: String
        var href: String
        var coverUrl: String?
        var kind: String
        var unitMinor: Int
        var quantity: Int
        var inStock: Bool
        var id: String { productId }
    }
    var id: String
    var title: String
    var description: String?
    var discountPct: Int
    var shop: Shop
    var items: [Item]
    var fullMinor: Int
    var discountMinor: Int
    var priceMinor: Int
    var currency: String?
    var purchasable: Bool

    /// Sets mit digitalen Produkten gibt es in der App nicht (Digitales nur per In-App-Kauf)
    var hasDigital: Bool { items.contains { $0.kind == "DIGITAL" } }
}

/// Rabattzeilen (Set, Gutschein) unter dem Warenwert
struct MarketDiscountRows: View {
    var rows: [MarketDiscountRow]
    var currency: String? = "CHF"
    var body: some View {
        ForEach(Array(rows.enumerated()), id: \.offset) { _, r in
            HStack(alignment: .firstTextBaseline) {
                Text(r.label).font(.wr(.subheadline)).foregroundStyle(Color.action)
                Spacer(minLength: 12)
                Text("− " + Fmt.money(r.amountMinor, currency: currency)).font(.wr(.subheadline, .medium)).monospacedDigit().foregroundStyle(Color.action)
            }
            .accessibilityElement(children: .combine)
        }
    }
}

/// Gutscheincode für einen Shop im Warenkorb
struct MarketCouponField: View {
    var shopId: String
    var shopName: String
    var coupon: MarketCartCoupon?
    var onChange: () async -> Void

    @Environment(AppState.self) private var app
    @State private var open = false
    @State private var code = ""
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        if let c = coupon {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Image(systemName: "tag").foregroundStyle(Color.muted)
                    let code = Text(verbatim: c.code).font(.wr(.subheadline, .bold)).monospaced()
                    Text("Gutschein \(code) · \(c.valueLabel)").font(.wr(.subheadline))
                    Spacer()
                    Button("Entfernen") { Task { await remove() } }.font(.wr(.footnote, .semibold)).buttonStyle(.plain).foregroundStyle(Color.muted)
                        .accessibilityLabel("Gutschein \(c.code) entfernen")
                }
                if let p = c.problem {
                    Text("\(p) Der Rabatt wird nicht abgezogen.").font(.wr(.caption)).foregroundStyle(Color.warn).fixedSize(horizontal: false, vertical: true)
                }
            }
        } else if !open {
            Button { open = true } label: {
                Label("Gutscheincode für \(shopName)", systemImage: "tag").font(.wr(.footnote, .semibold))
            }
            .buttonStyle(.plain)
            .foregroundStyle(Color.ink2)
        } else {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    TextField("Gutscheincode", text: $code)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .font(.wr(.body).monospaced())
                        .padding(.horizontal, 12).padding(.vertical, 9)
                        .background(Color.sunken, in: .rect(cornerRadius: 12, style: .continuous))
                        .submitLabel(.done)
                        .onSubmit { Task { await apply() } }
                    Button(busy ? "Prüfe …" : "Einlösen") { Task { await apply() } }
                        .buttonStyle(.glass)
                        .disabled(busy || code.trimmed.isEmpty)
                }
                if let error { Text(error).font(.wr(.caption)).foregroundStyle(Color.danger).fixedSize(horizontal: false, vertical: true) }
            }
        }
    }

    private func apply() async {
        guard !busy, !code.trimmed.isEmpty else { return }
        busy = true
        defer { busy = false }
        do {
            _ = try await APIClient.shared.post("/cart/coupon", ["shopId": JSONValue.string(shopId), "code": .string(code.trimmed)]) as JSONValue
            Haptics.success()
            app.show("Gutschein eingelöst.")
            code = ""
            error = nil
            open = false
            await onChange()
        } catch {
            self.error = (error as? APIError)?.message ?? error.localizedDescription
        }
    }

    private func remove() async {
        if await app.run("Gutschein entfernt.", { _ = try await APIClient.shared.delete("/cart/coupon/\(shopId)") as JSONValue }) {
            await onChange()
        }
    }
}

/// Set mit Teilen, Set-Preis und „Set in den Warenkorb“
struct MarketBundleCard: View {
    var bundle: MarketBundle
    var label: String = "Set"
    var isOwner = false

    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @State private var busy = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 4) {
                SpecLabel("\(label) · \(bundle.shop.name)")
                Text(bundle.title).font(.wr(.headline, .semibold)).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
                if let d = bundle.description?.nilIfEmpty {
                    Text(d).font(.wr(.subheadline)).foregroundStyle(Color.ink2).fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(16)
            .hairline()
            VStack(spacing: 0) {
                ForEach(bundle.items) { i in
                    Button { router.open(href: i.href) } label: {
                        HStack(alignment: .firstTextBaseline) {
                            Text(i.quantity > 1 ? "\(i.quantity) × \(i.title)" : i.title).font(.wr(.subheadline)).foregroundStyle(Color.ink).multilineTextAlignment(.leading)
                            if !i.inStock { Text("nicht verfügbar").font(.wr(.caption)).foregroundStyle(Color.warn) }
                            Spacer(minLength: 8)
                            Text(Fmt.money(i.unitMinor * i.quantity, currency: bundle.currency)).font(.wr(.subheadline)).monospacedDigit().foregroundStyle(Color.ink2)
                        }
                        .padding(.vertical, 8)
                        .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 6)
            .hairline()
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(Fmt.money(bundle.priceMinor, currency: bundle.currency)).font(.wr(.title3, .bold)).monospacedDigit()
                    if bundle.discountMinor > 0 {
                        let full = Text(verbatim: Fmt.money(bundle.fullMinor, currency: bundle.currency)).strikethrough()
                        Text("statt \(full) · −\(bundle.discountPct) %").font(.wr(.subheadline)).foregroundStyle(Color.muted)
                    }
                }
                Text("zzgl. Versand des Shops").font(.wr(.caption)).foregroundStyle(Color.muted)
                if isOwner {
                    Text("Dein Set – bearbeiten im Web-Studio unter „Gutscheine & Sets“.").font(.wr(.footnote)).foregroundStyle(Color.muted)
                } else if bundle.hasDigital {
                    Text("Enthält digitale Produkte – in der App nicht als Set erhältlich.").font(.wr(.footnote)).foregroundStyle(Color.muted)
                } else if !bundle.purchasable {
                    Text("Gerade nicht vollständig erhältlich.").font(.wr(.footnote)).foregroundStyle(Color.warn)
                } else if app.isSignedIn {
                    Button { Task { await add() } } label: {
                        Label(busy ? "Lege in den Warenkorb …" : "Set in den Warenkorb", systemImage: "bag")
                    }
                    .primaryButton()
                    .disabled(busy)
                } else {
                    Button("Anmelden und Set kaufen") { app.requestSignIn() }.primaryButton()
                }
            }
            .padding(16)
        }
        .cardSurface()
    }

    private func add() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        if await app.run("Set „\(bundle.title)“ liegt im Warenkorb.", { _ = try await APIClient.shared.post("/bundles/\(bundle.id)/cart") as JSONValue }) {
            await app.refreshCounts()
        }
    }
}

/// Lädt und zeigt die Sets zu einer Anleitung bzw. einem Produkt (leer → nichts)
struct MarketBundlesSection: View {
    enum Source: Hashable { case tutorial(String), product(String) }
    var source: Source
    var title: String
    var label: String = "Set"
    var isOwner = false
    /// Abstände nur, wenn es Sets gibt (sonst bleibt der Bereich unsichtbar und ohne Platz)
    var horizontalPadding: CGFloat = 0
    var verticalPadding: CGFloat = 0
    @State private var bundles: [MarketBundle] = []

    var body: some View {
        // Immer ein (ggf. leerer) Container, damit `.task` auch ohne Sets läuft
        VStack(alignment: .leading, spacing: 12) {
            if bundles.isEmpty {
                Color.clear.frame(height: 0)
            } else {
                SectionHeader(title)
                ForEach(bundles) { b in MarketBundleCard(bundle: b, label: label, isOwner: isOwner) }
            }
        }
        .padding(.horizontal, bundles.isEmpty ? 0 : horizontalPadding)
        .padding(.vertical, bundles.isEmpty ? 0 : verticalPadding)
        .task(id: source) {
            let path: String
            switch source {
            case .tutorial(let id): path = "/tutorials/\(id)/bundles"
            case .product(let id): path = "/bundles/for-product/\(id)"
            }
            bundles = (try? await APIClient.shared.get(path) as [MarketBundle]) ?? []
        }
    }
}
