import SwiftUI

/// Öffentliche Shopseite (PRD §13.2) – Kopf, Arbeiten, Richtlinien, Anbieterangaben, Bewertungen.
struct ShopView: View {
    var slug: String

    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router

    @State private var shop: MarketShopPage?
    @State private var products: [ProductCard] = []
    @State private var error: String?


    var body: some View {
        Group {
            if let shop { content(shop) }
            else if let error { ErrorStateView(message: error) { await load() } }
            else { LoadingView(text: "Shop wird geladen …") }
        }
        .background(Color.paper)
        .navigationTitle(shop?.name ?? "Shop")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let s = shop {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    MarketCartToolbarButton()
                    Menu {
                        ShareLink(item: AppConfig.webURL("/markt/\(s.slug)")) { Label("Teilen", systemImage: "square.and.arrow.up") }
                        if !(s.isOwner ?? false), let oid = s.owner?.id ?? s.ownerId {
                            SafetyMenuItems(targetType: "USER", targetId: oid, authorId: oid, authorName: s.name, allowHide: false)
                        }
                    } label: { Image(systemName: "ellipsis") }
                        .accessibilityLabel("Weitere Aktionen")
                }
            }
        }
        .task { if shop == nil { await load() } }
        .refreshable { await load() }
    }

    private func load() async {
        do {
            let s: MarketShopPage = try await APIClient.shared.get("/market/shops/\(slug)")
            withAnimation(.smooth) { shop = s }
            error = nil
            // Alle Produkte des Shops (Mobile-API-Filter `shop`)
            let page: Page<ProductCard>? = try? await APIClient.shared.get("/market/products", query: ["shop": s.slug, "take": "60"])
            withAnimation(.smooth) {
                products = (page?.items ?? []).map { var p = $0; if p.shopSlugValue == nil { p.shopSlug = s.slug }; if p.shop == nil { p.shop = .init(slug: s.slug, name: s.name) }; return p }
            }
        } catch is CancellationError {
        } catch {
            self.error = (error as? APIError)?.message ?? error.localizedDescription
        }
    }

    // MARK: Inhalt

    private func content(_ s: MarketShopPage) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 26) {
                header(s)
                VStack(alignment: .leading, spacing: 26) {
                    if s.status == "PAUSED" {
                        NoticeView(tone: .warn, title: "Der Shop macht gerade Pause", message: "Du kannst stöbern und Arbeiten merken. Bestellungen sind wieder möglich, sobald der Shop geöffnet ist.")
                    } else if s.status != "ACTIVE", s.isOwner ?? false {
                        NoticeView(tone: .info, title: "Nur für dich sichtbar", message: "Dein Shop ist \(L.shopStatus[s.status ?? ""]?.lowercased() ?? "noch nicht aktiv"). Nach der Verifizierung ist er öffentlich.")
                    }
                    actions(s)
                    if let d = s.description?.nilIfEmpty {
                        Text(d).font(.wr(.body)).foregroundStyle(Color.ink2).lineSpacing(3).fixedSize(horizontal: false, vertical: true)
                    }
                    productSection(s)
                    policies(s)
                    seller(s)
                    reviews(s)
                }
                .padding(.horizontal, Space.gutter)
            }
            .padding(.bottom, 40)
        }
    }

    private func header(_ s: MarketShopPage) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 3) {
                let covers = Array(products.prefix(3))
                if covers.isEmpty {
                    ThreadPlate(seed: s.id, category: nil, glyph: "loop", animated: true)
                } else {
                    ForEach(covers) { p in CoverView(url: p.imageURL, seed: p.id, category: p.category, showLabel: false) }
                }
            }
            .frame(height: 170)
            .clipped()
            .overlay(alignment: .bottomLeading) {
                AvatarView(url: s.owner?.profile?.avatarUrl, name: s.owner?.displayName ?? s.name, size: 64)
                    .background(Circle().fill(Color.paper).padding(-4))
                    .offset(x: Space.gutter, y: 32)
            }
            VStack(alignment: .leading, spacing: 6) {
                SpecLabel("Shop · \(L.country(s.country))", color: .moss)
                Text(s.name).font(.display(30)).foregroundStyle(Color.ink).accessibilityAddTraits(.isHeader)
                if let t = s.tagline?.nilIfEmpty { Text(t).font(.wr(.subheadline)).foregroundStyle(Color.muted) }
                HStack(spacing: 14) {
                    StatCell(value: Fmt.number(s.count?.products ?? products.count), label: "Arbeiten")
                    StatCell(value: Fmt.number(s.salesCount ?? 0), label: "Verkäufe")
                    if (s.ratingCount ?? 0) > 0, let r = s.ratingAvg { StatCell(value: String(format: "%.1f", r), label: "\(s.ratingCount ?? 0) Bewertungen") }
                    if let c = s.createdAt { StatCell(value: c.formatted(.dateTime.year().locale(Fmt.locale)), label: "Seit") }
                }
                .padding(.top, 6)
            }
            .padding(.horizontal, Space.gutter)
            .padding(.top, 30)
        }
    }

    private func actions(_ s: MarketShopPage) -> some View {
        HStack(spacing: 10) {
            if s.isOwner ?? false {
                Button { router.open(.studioSection(.shop)) } label: { Label("Shop verwalten", systemImage: "slider.horizontal.3").frame(maxWidth: .infinity) }
                    .buttonStyle(.glassProminent).tint(.moss)
                Button { router.present(.productEditor(id: nil)) } label: { Label("Neues Produkt", systemImage: "plus").frame(maxWidth: .infinity) }
                    .buttonStyle(.glass)
            } else if let h = s.owner?.handle {
                Button { router.open(.profile(handle: h)) } label: { Label("Profil", systemImage: "person.crop.circle").frame(maxWidth: .infinity) }
                    .buttonStyle(.glass)
                Button { router.present(.newConversation(handle: h)) } label: { Label("Nachricht", systemImage: "bubble.left").frame(maxWidth: .infinity) }
                    .buttonStyle(.glass)
            }
        }
        .controlSize(.large)
    }

    @ViewBuilder private func productSection(_ s: MarketShopPage) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader("Arbeiten", number: "01", subtitle: (s.count?.products ?? 0) > products.count ? "Die neuesten \(products.count) von \(s.count?.products ?? 0)" : nil)
            if products.isEmpty {
                EmptyStateView(symbol: "tag", title: "Gerade keine Arbeiten", message: s.status == "PAUSED" ? "Während der Pause sind die Arbeiten nicht bestellbar." : "Schau bald wieder vorbei.")
                    .cardSurface()
            } else {
                AdaptiveGrid(spacing: 12, rowSpacing: 12) {
                    ForEach(products) { p in ProductCardView(product: p) }
                }
                if (s.count?.products ?? 0) > products.count, let h = s.owner?.handle {
                    Button { router.open(.profile(handle: h)) } label: { Label("Alle Arbeiten im Profil", systemImage: "arrow.right") }
                        .buttonStyle(.glass)
                }
            }
        }
    }

    @ViewBuilder private func policies(_ s: MarketShopPage) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader("Richtlinien", number: "02")
            if let d = s.processingDays { SpecRow(label: "Bearbeitungszeit", value: "ca. \(Fmt.plural(d, "Werktag", "Werktage"))", symbol: "hourglass") }
            MarketPolicyBlock(title: "Versand", text: s.shippingPolicy?.nilIfEmpty ?? "Der Shop hat keine eigenen Versandbedingungen hinterlegt.", symbol: "shippingbox")
            MarketPolicyBlock(title: "Rückgabe", text: s.returnPolicy?.nilIfEmpty ?? "Der Shop hat keine eigenen Rückgabebedingungen hinterlegt. Es gelten die Marktplatz-Richtlinien.", symbol: "arrow.uturn.backward")
        }
    }

    private func seller(_ s: MarketShopPage) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader("Hinter dem Shop", number: "03")
            VStack(alignment: .leading, spacing: 12) {
                if let h = s.owner?.handle {
                    Button { router.open(.profile(handle: h)) } label: {
                        HStack(spacing: 12) {
                            AvatarView(url: s.owner?.profile?.avatarUrl, name: s.owner?.displayName ?? s.name, size: 44)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(s.owner?.displayName ?? "").font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink)
                                Text(["@\(h)", s.owner?.profile?.region, s.owner?.profile?.followerCount.map { Fmt.plural($0, "Follower", "Follower") }].compactMap { $0?.nilIfEmpty }.joined(separator: " · "))
                                    .font(.wr(.caption)).foregroundStyle(Color.muted)
                            }
                            Spacer()
                            Image(systemName: "chevron.right").font(.wr(.caption)).foregroundStyle(Color.muted)
                        }
                    }
                    .buttonStyle(.pressable)
                    .accessibilityHint("Profil öffnen")
                }
                if let bio = s.owner?.profile?.bio?.nilIfEmpty { Text(bio).font(.wr(.footnote)).foregroundStyle(Color.ink2) }
                HStack(spacing: 8) {
                    Pill(text: L.sellerType.first { $0.key == s.sellerType }?.label ?? "Privatperson", symbol: s.sellerType == "BUSINESS" ? "building.2" : "person", tint: .slate)
                    if s.verification?.state == "VERIFIED" { Pill(text: "Verifiziert", symbol: "checkmark.seal", tint: .moss) }
                }
                if let v = s.verification, s.sellerType == "BUSINESS" {
                    VStack(alignment: .leading, spacing: 2) {
                        SpecLabel("Anbieterangaben")
                        ForEach([v.businessName, v.legalName, v.addressLine, [v.postalCode, v.city].compactMap { $0 }.joined(separator: " ").nilIfEmpty, v.vatId.map { "MWST \($0)" }].compactMap { $0?.nilIfEmpty }, id: \.self) {
                            Text($0).font(.wr(.caption)).foregroundStyle(Color.ink2)
                        }
                    }
                }
            }
            .padding(16)
            .cardSurface()
        }
    }

    @ViewBuilder private func reviews(_ s: MarketShopPage) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionHeader("Bewertungen", number: "04", subtitle: "Von Käufer:innen nach bestätigtem Kauf.") {
                if (s.ratingCount ?? 0) > 0, let r = s.ratingAvg { MarketStars(rating: r) }
            }
            let list = s.reviews ?? []
            if list.isEmpty {
                Text("Noch keine Bewertungen.").font(.wr(.footnote)).foregroundStyle(Color.muted).padding(.vertical, 6)
            } else {
                ForEach(list) { r in MarketReviewRow(review: r) }
            }
        }
    }
}
