import SwiftUI

// Geteilter Shop-Gutschein (`/gutschein/:id`) – wie die Webseite: Rabatt, Code zum Kopieren,
// Bedingungen und der Weg zum Shop. Server: GET /market/coupons/:id (promotions.publicCoupon)

struct PublicCouponShop: Decodable, Hashable, Sendable {
    var slug: String
    var name: String
}

struct PublicCoupon: Decodable, Hashable, Sendable {
    var id: String
    var code: String?
    var valid: Bool
    var problem: String?
    var startsAt: Date?
    var endsAt: Date?
    var onePerBuyer: Bool?
    var headline: String
    var minLabel: String?
    var shop: PublicCouponShop
}

struct CouponLandingView: View {
    var id: String
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @State private var coupon: PublicCoupon?
    @State private var error: String?

    var body: some View {
        MePhase(value: coupon, error: error, retry: load) { c in content(c) }
            .background(Color.paper)
            .navigationTitle("Gutschein")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if let c = coupon, c.valid {
                    ToolbarItem(placement: .topBarTrailing) {
                        ShareLink(item: AppConfig.webURL("/gutschein/\(c.id)")) { Image(systemName: "square.and.arrow.up") }
                            .accessibilityLabel("Gutschein teilen")
                    }
                }
            }
            .task { if coupon == nil { await load() } }
    }

    private func content(_ c: PublicCoupon) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                PageTitle(kicker: "Gutschein · \(c.shop.name)", title: c.headline, subtitle: "auf deinen Einkauf bei \(c.shop.name)")
                if c.valid, let code = c.code {
                    CouponCodeCard(code: code, terms: terms(c))
                    steps(c)
                    Button { router.open(.shop(slug: c.shop.slug)) } label: { Text("Zum Shop „\(c.shop.name)“").frame(maxWidth: .infinity) }
                        .primaryButton()
                } else {
                    invalid(c)
                }
            }
            .padding(.horizontal, Space.gutter)
            .padding(.bottom, 40)
        }
    }

    private func steps(_ c: PublicCoupon) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("1. Im Shop „\(c.shop.name)“ Artikel in den Warenkorb legen.")
            Text("2. Im Warenkorb den Gutscheincode für \(c.shop.name) eingeben.")
            Text("3. Der Rabatt wird sofort abgezogen.")
        }
        .font(.wr(.subheadline))
        .foregroundStyle(Color.ink2)
    }

    private func invalid(_ c: PublicCoupon) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(c.problem ?? "Dieser Gutschein ist nicht mehr gültig.").font(.wr(.subheadline, .semibold))
            Text("Im Shop findest du trotzdem schöne Sachen.").font(.wr(.subheadline)).foregroundStyle(Color.muted)
            Button("Zum Shop „\(c.shop.name)“") { router.open(.shop(slug: c.shop.slug)) }
                .buttonStyle(.bordered)
                .padding(.top, 4)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
    }

    private func terms(_ c: PublicCoupon) -> [String] {
        var t: [String] = []
        if let m = c.minLabel { t.append(m) }
        if let s = c.startsAt, s > .now { t.append("gültig ab \(Fmt.date(s, style: .long))") }
        if let e = c.endsAt { t.append("gültig bis \(Fmt.date(e, style: .long))") }
        if c.onePerBuyer == true { t.append("einmal pro Konto") }
        t.append("nicht auf den Versand")
        return t
    }

    private func load() async {
        do { coupon = try await APIClient.shared.get("/market/coupons/\(id)"); error = nil }
        catch is CancellationError {}
        catch { if coupon == nil { self.error = MeErr.text(error) } else { app.show(error: error) } }
    }
}

private struct CouponCodeCard: View {
    var code: String
    var terms: [String]
    @Environment(AppState.self) private var app

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SpecLabel("Dein Code")
            HStack(spacing: 12) {
                Text(code).font(.system(.title2, design: .monospaced).weight(.semibold)).textSelection(.enabled)
                Spacer(minLength: 8)
                Button("Kopieren", systemImage: "doc.on.doc") {
                    UIPasteboard.general.string = code
                    Haptics.tap()
                    app.show("Code kopiert.")
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }
            Text(terms.joined(separator: " · ")).font(.wr(.caption)).foregroundStyle(Color.muted)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
    }
}
