import SwiftUI

/// Produktseite (PRD §13.3) – Galerie, Datenblatt, Verkäufer:in, Bewertungen, schwebende Glas-Kaufleiste.
struct ProductDetailView: View {
    var shopSlug: String
    var productSlug: String

    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router

    @State private var page: MarketProductPage?
    @State private var error: String?
    @State private var variantId: String?
    @State private var quantity = 1
    @State private var justAdded = false
    @State private var viewerMedia: MediaItem?
    @State private var tracked = false

    var body: some View {
        Group {
            if let page { content(page) }
            else if let error { ErrorStateView(message: error) { await load() } }
            else { LoadingView(text: "Arbeit wird geladen …") }
        }
        .background(Color.paper)
        .navigationTitle(page?.title ?? "")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { if let page { toolbar(page) } }
        .task { if page == nil { await load() } }
        .refreshable { await load() }
        .onChange(of: router.sheet) { old, new in
            if new == nil, case .productEditor = old { Task { await load() } }
        }
    }

    // MARK: Laden

    private func load() async {
        do {
            let p: MarketProductPage = try await APIClient.shared.get("/market/products/\(shopSlug)/\(productSlug)")
            withAnimation(.smooth) { page = p }
            error = nil
            if variantId == nil, let first = p.variantStock?.first(where: { $0.available > 0 }) { variantId = first.id }
            if !tracked { tracked = true; SocialAPI.track("PRODUCT", p.id) }
        } catch is CancellationError {
        } catch {
            self.error = (error as? APIError)?.message ?? error.localizedDescription
        }
    }

    // MARK: Ableitungen

    private func selectedVariant(_ p: MarketProductPage) -> MarketVariantStock? { p.variantStock?.first { $0.id == variantId } }
    private func needsVariant(_ p: MarketProductPage) -> Bool { !(p.variantStock ?? []).isEmpty }
    private func unitPrice(_ p: MarketProductPage) -> Int { max(0, p.priceMinor + (selectedVariant(p)?.priceDeltaMinor ?? 0)) }
    /// Verfügbare Menge für die aktuelle Auswahl (nil = unbegrenzt)
    private func availableNow(_ p: MarketProductPage) -> Int? {
        if p.isDigital { return nil }
        if needsVariant(p) { return selectedVariant(p)?.available ?? 0 }
        return p.available
    }
    private func soldOut(_ p: MarketProductPage) -> Bool { p.status == "SOLD_OUT" || (!p.isDigital && (p.available ?? 0) <= 0) }

    // MARK: Inhalt

    private func content(_ p: MarketProductPage) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 26) {
                gallery(p)
                VStack(alignment: .leading, spacing: 26) {
                    titleBlock(p)
                    if p.isDigital && !(p.isOwner ?? false) { digitalNotice(p) }
                    if needsVariant(p) { variantPicker(p) }
                    if !p.isDigital && !(p.isOwner ?? false) && (p.purchasable ?? false) { quantityRow(p) }
                    if let d = p.description?.nilIfEmpty {
                        Text(d).font(.wr(.body)).foregroundStyle(Color.ink2).lineSpacing(3).fixedSize(horizontal: false, vertical: true)
                    }
                    dataSheet(p)
                    if let s = p.safetyInfo?.nilIfEmpty {
                        NoticeView(tone: .warn, title: "Sicherheitshinweis", message: s)
                    }
                    policies(p)
                    linked(p)
                    shopCard(p)
                    reviews(p)
                    more(p)
                }
                .padding(.horizontal, Space.gutter)
            }
            .padding(.bottom, 120)
        }
        .safeAreaInset(edge: .bottom) { buyBar(p) }
        .fullScreenCover(item: $viewerMedia) { m in MediaViewer(media: p.mediaItems, start: m) }
    }

    // MARK: Galerie

    @ViewBuilder private func gallery(_ p: MarketProductPage) -> some View {
        let media = p.mediaItems
        if media.isEmpty {
            CoverView(url: p.coverUrl, seed: p.id, category: p.category, animated: true)
                .aspectRatio(1, contentMode: .fit)
                .frame(maxWidth: .infinity)
        } else {
            TabView {
                ForEach(media) { m in
                    RemoteImage(path: m.displayURL) { ThreadPlate(seed: p.id, category: p.category) }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .clipped()
                        .contentShape(.rect)
                        .onTapGesture { viewerMedia = m }
                        .accessibilityLabel(m.alt?.nilIfEmpty ?? p.title)
                        .accessibilityAddTraits([.isImage, .isButton])
                        .accessibilityHint("Vollbild öffnen")
                }
            }
            .tabViewStyle(.page(indexDisplayMode: media.count > 1 ? .always : .never))
            .aspectRatio(1, contentMode: .fit)
            .frame(maxWidth: .infinity)
            .background(Color.sunken)
        }
    }

    // MARK: Titel & Preis

    private func titleBlock(_ p: MarketProductPage) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                SpecLabel([L.productKind(p.kind), app.categoryShort(p.category)].filter { !$0.isEmpty }.joined(separator: " · "), color: .moss)
                Spacer()
                if p.status == "SOLD_OUT" { Pill(text: "Ausverkauft", tint: .ink, filled: true) }
                else if p.kind == "UNIQUE" { Pill(text: "Einzelstück", tint: .clay, filled: true) }
            }
            Text(p.title).font(.display(30)).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(Fmt.money(unitPrice(p), currency: p.currency)).font(.wr(.title2, .semibold)).monospacedDigit().foregroundStyle(Color.ink)
                    .contentTransition(.numericText())
                if !p.isDigital {
                    Text((p.shippingMinor ?? 0) == 0 ? "Versand kostenlos" : "zzgl. \(Fmt.money(p.shippingMinor, currency: p.currency)) Versand")
                        .font(.wr(.footnote)).foregroundStyle(Color.muted)
                }
            }
            HStack(spacing: 12) {
                if let n = p.ratingCount, n > 0, let r = p.ratingAvg {
                    HStack(spacing: 5) {
                        MarketStars(rating: r)
                        Text("\(String(format: "%.1f", r)) · \(Fmt.plural(n, "Bewertung", "Bewertungen"))").font(.wr(.caption)).foregroundStyle(Color.muted)
                    }
                }
                Button { router.open(.shop(slug: p.shop.slug)) } label: {
                    HStack(spacing: 6) {
                        AvatarView(url: p.shop.owner?.profile?.avatarUrl, name: p.shop.owner?.displayName ?? p.shop.name, size: 20)
                        Text(p.shop.name).font(.wr(.footnote, .semibold)).foregroundStyle(Color.ink2)
                    }
                }
                .buttonStyle(.plain)
                .accessibilityHint("Shop öffnen")
            }
            if p.isOwner ?? false, p.status != "ACTIVE" && p.status != "SOLD_OUT" {
                NoticeView(tone: .info, title: "Vorschau", message: "Dieses Produkt ist \(L.productStatus[p.status]?.lowercased() ?? p.status) und für andere nicht sichtbar.")
            }
        }
    }

    // MARK: Digital (PRD §13.7)

    @ViewBuilder private func digitalNotice(_ p: MarketProductPage) -> some View {
        if let e = p.viewer?.entitlementId {
            VStack(alignment: .leading, spacing: 10) {
                NoticeView(tone: .success, title: "Du besitzt diese Anleitung", message: "Lade die Datei herunter – sie ist für deine persönliche Nutzung bestimmt.")
                Button { router.present(.web(url: AppConfig.webURL("/api/v1/downloads/\(e)"))) } label: { Label("Herunterladen", systemImage: "arrow.down.circle") }
                    .buttonStyle(.glass)
            }
        } else {
            VStack(alignment: .leading, spacing: 10) {
                NoticeView(tone: .info, title: "Digitale Anleitung", message: "Digitale Anleitungen kannst du im Web kaufen. Danach findest du den Download in deinen Bestellungen.")
                Button { router.present(.web(url: AppConfig.webURL(p.href))) } label: { Label("Im Web öffnen", systemImage: "safari") }
                    .buttonStyle(.glass)
            }
        }
    }

    // MARK: Varianten & Menge

    private func variantPicker(_ p: MarketProductPage) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SpecLabel("Variante")
            FlowLayout(spacing: 8, lineSpacing: 8) {
                ForEach(p.variantStock ?? []) { v in
                    let on = v.id == variantId
                    let out = v.available <= 0
                    Button {
                        Haptics.selection()
                        withAnimation(.snappy) { variantId = v.id; quantity = min(quantity, max(1, v.available)) }
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(v.name).font(.wr(.subheadline).weight(on ? .semibold : .regular))
                            Text(out ? "ausverkauft" : v.priceDeltaMinor == 0 ? "\(v.available) verfügbar" : "\(v.priceDeltaMinor > 0 ? "+" : "−")\(Fmt.money(abs(v.priceDeltaMinor), currency: p.currency))")
                                .font(.wr(.caption2)).foregroundStyle(on ? Color.paper.opacity(0.85) : Color.muted)
                        }
                        .foregroundStyle(on ? Color.paper : out ? Color.muted : Color.ink)
                        .padding(.horizontal, 12).padding(.vertical, 8)
                        .frame(minHeight: 44)
                        .background(on ? Color.ink : Color.card, in: .rect(cornerRadius: Radius.small, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: Radius.small, style: .continuous).strokeBorder(on ? Color.ink : Color.lineStrong, lineWidth: 0.75))
                        .opacity(out ? 0.55 : 1)
                    }
                    .buttonStyle(.plain)
                    .disabled(out)
                    .accessibilityLabel("\(v.name), \(out ? "ausverkauft" : "\(v.available) verfügbar")")
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
        }
    }

    private func quantityRow(_ p: MarketProductPage) -> some View {
        let maxQty = min(99, availableNow(p) ?? 99)
        return HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("Menge").font(.wr(.subheadline, .semibold))
                if let a = availableNow(p) { Text(a == 1 ? "Nur noch 1 Stück" : "\(a) verfügbar").font(.wr(.caption)).foregroundStyle(a <= 2 ? Color.clay : Color.muted) }
            }
            Spacer()
            MarketQuantityStepper(value: $quantity, range: 1...max(1, maxQty))
        }
        .padding(14)
        .cardSurface(radius: Radius.inner)
    }

    // MARK: Datenblatt

    private func dataSheet(_ p: MarketProductPage) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionHeader("Datenblatt", number: "01")
            VStack(spacing: 0) {
                SpecRow(label: "Art", value: L.productKind(p.kind), symbol: "tag")
                if let m = p.materials?.nilIfEmpty { SpecRow(label: "Materialien", value: m, symbol: "leaf") }
                if let d = p.dimensions?.nilIfEmpty { SpecRow(label: "Masse", value: d, symbol: "ruler") }
                if !p.isDigital, let days = p.productionDays {
                    SpecRow(label: p.kind == "MADE_TO_ORDER" ? "Herstellungszeit" : "Bearbeitungszeit", value: days == 0 ? "sofort" : Fmt.plural(days, "Tag", "Tage"), symbol: "hourglass")
                }
                if !p.isDigital {
                    SpecRow(label: "Versand", value: [(p.shippingMinor ?? 0) == 0 ? "kostenlos" : Fmt.money(p.shippingMinor, currency: p.currency), p.shipsFrom.map { "ab \(L.country($0))" }].compactMap { $0 }.joined(separator: " · "), symbol: "shippingbox")
                    if let d = p.shop.processingDays { SpecRow(label: "Versand innert", value: "ca. \(Fmt.plural(d, "Werktag", "Werktagen"))", symbol: "calendar") }
                } else {
                    SpecRow(label: "Lieferung", value: "Download nach Zahlung", symbol: "arrow.down.circle")
                }
                if let n = p.saveCount, n > 0 { SpecRow(label: "Gemerkt", value: Fmt.plural(n, "Mal", "Mal"), symbol: "bookmark") }
            }
        }
    }

    @ViewBuilder private func policies(_ p: MarketProductPage) -> some View {
        let ret = p.returnPolicy?.nilIfEmpty ?? p.shop.returnPolicy?.nilIfEmpty
        let ship = p.shop.shippingPolicy?.nilIfEmpty
        if ret != nil || ship != nil {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeader("Versand & Rückgabe", number: "02")
                if let ship { MarketPolicyBlock(title: "Versand", text: ship, symbol: "shippingbox") }
                if let ret { MarketPolicyBlock(title: "Rückgabe", text: ret, symbol: "arrow.uturn.backward") }
            }
        }
    }

    @ViewBuilder private func linked(_ p: MarketProductPage) -> some View {
        if p.project != nil || p.tutorial != nil {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeader("Der Faden dahinter", number: "03", subtitle: "So ist diese Arbeit entstanden.")
                if let pr = p.project, let h = pr.ownerHandle?.nilIfEmpty ?? p.shop.owner?.handle {
                    LinkedThreadRow(kicker: "Projekt", title: pr.title, seed: pr.id, category: pr.category, url: pr.coverUrl) {
                        router.open(.project(handle: h, slug: pr.slug))
                    }
                }
                if let t = p.tutorial {
                    LinkedThreadRow(kicker: "Anleitung", title: t.title, seed: t.id, category: t.category, url: t.coverUrl) {
                        router.open(.tutorial(slug: t.slug))
                    }
                }
            }
        }
    }

    // MARK: Shop

    private func shopCard(_ p: MarketProductPage) -> some View {
        let s = p.shop
        return VStack(alignment: .leading, spacing: 12) {
            SectionHeader("Verkauft von", number: "04")
            VStack(alignment: .leading, spacing: 12) {
                Button { router.open(.shop(slug: s.slug)) } label: {
                    HStack(spacing: 12) {
                        AvatarView(url: s.owner?.profile?.avatarUrl, name: s.owner?.displayName ?? s.name, size: 48, category: p.category)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(s.name).font(.wr(.headline)).foregroundStyle(Color.ink)
                            Text([s.owner?.displayName, s.owner?.profile?.region].compactMap { $0?.nilIfEmpty }.joined(separator: " · ")).font(.wr(.caption)).foregroundStyle(Color.muted)
                            if let t = s.tagline?.nilIfEmpty { Text(t).font(.wr(.footnote)).foregroundStyle(Color.ink2).lineLimit(2) }
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.right").font(.wr(.caption)).foregroundStyle(Color.muted)
                    }
                }
                .buttonStyle(.pressable)
                HStack(spacing: 8) {
                    Pill(text: L.sellerType.first { $0.key == s.sellerType }?.label ?? "Privatperson", symbol: s.sellerType == "BUSINESS" ? "building.2" : "person", tint: .slate)
                    if (s.ratingCount ?? 0) > 0, let r = s.ratingAvg { Pill(text: String(format: "%.1f ★ · %d", r, s.ratingCount ?? 0), tint: .ochre) }
                    if let n = s.salesCount, n > 0 { Pill(text: Fmt.plural(n, "Verkauf", "Verkäufe"), tint: .moss) }
                }
                if s.sellerType == "BUSINESS", let v = s.verification {
                    VStack(alignment: .leading, spacing: 2) {
                        SpecLabel("Anbieterangaben")
                        Text([v.businessName ?? v.legalName, v.addressLine, [v.postalCode, v.city].compactMap { $0 }.joined(separator: " ").nilIfEmpty, v.vatId.map { "MWST \($0)" }].compactMap { $0?.nilIfEmpty }.joined(separator: " · "))
                            .font(.wr(.caption)).foregroundStyle(Color.ink2)
                    }
                }
                HStack(spacing: 10) {
                    Button { router.open(.shop(slug: s.slug)) } label: { Label("Shop ansehen", systemImage: "storefront").frame(maxWidth: .infinity) }
                        .buttonStyle(.glass)
                    if !(p.isOwner ?? false), let h = s.owner?.handle {
                        Button { router.present(.newConversation(handle: h, productId: p.id)) } label: { Label("Nachricht", systemImage: "bubble.left").frame(maxWidth: .infinity) }
                            .buttonStyle(.glass)
                    }
                }
                .controlSize(.regular)
            }
            .padding(16)
            .cardSurface()
        }
    }

    // MARK: Bewertungen

    @ViewBuilder private func reviews(_ p: MarketProductPage) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionHeader("Bewertungen", number: "05", subtitle: "Nur nach bestätigtem Kauf möglich.") {
                if let n = p.ratingCount, n > 0, let r = p.ratingAvg { MarketStars(rating: r) }
            }
            let list = p.reviews ?? []
            if list.isEmpty {
                Text("Noch keine Bewertungen. Wer diese Arbeit kauft, kann sie nach dem Versand bewerten.")
                    .font(.wr(.footnote)).foregroundStyle(Color.muted)
                    .padding(.vertical, 6)
            } else {
                ForEach(list) { r in MarketReviewRow(review: r) }
            }
        }
    }

    @ViewBuilder private func more(_ p: MarketProductPage) -> some View {
        if let more = p.moreFromShop, !more.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeader("Mehr aus dem Shop", number: "06") {
                    Button("Alle") { router.open(.shop(slug: p.shop.slug)) }.font(.wr(.subheadline, .semibold))
                }
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .top, spacing: 12) {
                        ForEach(more) { m in ProductCardView(product: m).frame(width: 168) }
                    }
                    .padding(.vertical, 2)
                }
                .scrollClipDisabled()
            }
        }
    }

    // MARK: Toolbar

    @ToolbarContentBuilder private func toolbar(_ p: MarketProductPage) -> some ToolbarContent {
        ToolbarItemGroup(placement: .topBarTrailing) {
            SaveButton(type: "PRODUCT", id: p.id, saved: p.viewer?.saved ?? false)
            Menu {
                ShareLink(item: AppConfig.webURL(p.href)) { Label("Teilen", systemImage: "square.and.arrow.up") }
                if p.isOwner ?? false {
                    Button("Bearbeiten", systemImage: "pencil") { router.present(.productEditor(id: p.id)) }
                } else {
                    if let h = p.shop.owner?.handle {
                        Button("Frage an den Shop", systemImage: "bubble.left") { router.present(.newConversation(handle: h, productId: p.id)) }
                    }
                    Button("Melden …", systemImage: "flag") { router.present(.report(targetType: "PRODUCT", targetId: p.id, title: p.title)) }
                }
            } label: { Image(systemName: "ellipsis") }
                .accessibilityLabel("Weitere Aktionen")
        }
    }

    // MARK: Kaufleiste

    @ViewBuilder private func buyBar(_ p: MarketProductPage) -> some View {
        let price = unitPrice(p) * (p.isDigital ? 1 : quantity)
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 1) {
                Text(Fmt.money(price, currency: p.currency)).font(.wr(.headline)).monospacedDigit().contentTransition(.numericText())
                Text(barSubtitle(p)).font(.wr(.caption2)).foregroundStyle(Color.muted).lineLimit(2)
            }
            .layoutPriority(1)
            Spacer(minLength: 4)
            barAction(p)
        }
        .padding(.leading, 20).padding(.trailing, 8).padding(.vertical, 8)
        .glassEffect(.regular, in: Capsule())
        .padding(.horizontal, 14)
        .padding(.bottom, 6)
        .animation(.snappy, value: justAdded)
    }

    private func barSubtitle(_ p: MarketProductPage) -> String {
        if p.isOwner ?? false { return "Dein Produkt" }
        if p.isDigital { return p.viewer?.entitlementId != nil ? "Bereits gekauft" : "Kauf im Web" }
        if soldOut(p) { return "Derzeit ausverkauft" }
        if quantity > 1 { return "\(quantity) × \(Fmt.money(unitPrice(p), currency: p.currency)), zzgl. Versand" }
        return (p.shippingMinor ?? 0) == 0 ? "inkl. Versand" : "zzgl. \(Fmt.money(p.shippingMinor, currency: p.currency)) Versand"
    }

    @ViewBuilder private func barAction(_ p: MarketProductPage) -> some View {
        if p.isOwner ?? false {
            Button { router.present(.productEditor(id: p.id)) } label: { Label("Bearbeiten", systemImage: "pencil") }
                .buttonStyle(.glass).controlSize(.large)
        } else if p.isDigital {
            // PRD §13.7: Digitale Produkte werden auf iOS nicht verkauft.
            if let e = p.viewer?.entitlementId {
                Button { router.present(.web(url: AppConfig.webURL("/api/v1/downloads/\(e)"))) } label: { Label("Herunterladen", systemImage: "arrow.down.circle") }
                    .buttonStyle(.glassProminent).tint(.moss).controlSize(.large)
            } else {
                Button { router.present(.web(url: AppConfig.webURL(p.href))) } label: { Label("Im Web ansehen", systemImage: "safari") }
                    .buttonStyle(.glass).controlSize(.large)
                    .accessibilityHint("Digitale Anleitungen kannst du im Web kaufen")
            }
        } else if justAdded {
            Button { router.open(.cart) } label: { Label("Zum Warenkorb", systemImage: "bag.fill") }
                .buttonStyle(.glassProminent).tint(.ink).controlSize(.large)
                .transition(.scale.combined(with: .opacity))
        } else if app.paymentsMode == "disabled" || p.payments?.mode == "disabled" {
            Button("Bald bestellbar") {}.buttonStyle(.glass).controlSize(.large).disabled(true)
        } else if soldOut(p) || !(p.purchasable ?? false) {
            Button(soldOut(p) ? "Ausverkauft" : "Nicht erhältlich") {}.buttonStyle(.glass).controlSize(.large).disabled(true)
        } else if needsVariant(p) && (selectedVariant(p)?.available ?? 0) <= 0 {
            Button("Variante wählen") {}.buttonStyle(.glass).controlSize(.large).disabled(true)
        } else {
            AsyncButton { await addToCart(p) } label: { Label("In den Warenkorb", systemImage: "bag.badge.plus") }
                .buttonStyle(.glassProminent).tint(.moss).controlSize(.large)
        }
    }

    private func addToCart(_ p: MarketProductPage) async {
        var body: [String: JSONValue] = ["productId": .string(p.id), "quantity": .number(Double(quantity))]
        if let v = variantId, needsVariant(p) { body["variantId"] = .string(v) }
        do {
            let r: MarketCartAddResult = try await APIClient.shared.post("/cart/items", body)
            await app.refreshCounts()
            Haptics.success()
            if r.capped == true { app.show("Im Warenkorb – mehr ist leider nicht verfügbar (\(r.quantity ?? 0) Stück).", style: .warning) }
            else { app.show("In den Warenkorb gelegt") }
            withAnimation(.snappy) { justAdded = true }
            Task {
                try? await Task.sleep(for: .seconds(5))
                withAnimation(.snappy) { justAdded = false }
            }
        } catch {
            app.show(error: error)
            if let e = error as? APIError, e.marketIsConflict { await load() }
        }
    }
}

// MARK: - Bausteine

/// Mengen-Stepper mit grossen Touch-Zielen
struct MarketQuantityStepper: View {
    @Binding var value: Int
    var range: ClosedRange<Int>
    var onChange: ((Int) -> Void)? = nil

    var body: some View {
        HStack(spacing: 0) {
            Button { set(value - 1) } label: { Image(systemName: "minus").frame(width: 40, height: 40).contentShape(.rect) }
                .disabled(value <= range.lowerBound)
                .accessibilityLabel("Weniger")
            Text("\(value)").font(.wr(.body, .semibold)).monospacedDigit().frame(minWidth: 28).contentTransition(.numericText())
                .accessibilityHidden(true)
            Button { set(value + 1) } label: { Image(systemName: "plus").frame(width: 40, height: 40).contentShape(.rect) }
                .disabled(value >= range.upperBound)
                .accessibilityLabel("Mehr")
        }
        .buttonStyle(.plain)
        .foregroundStyle(Color.ink)
        .background(Color.sunken, in: Capsule())
        .accessibilityElement(children: .contain)
        .accessibilityValue("\(value)")
        .accessibilityAdjustableAction { dir in
            switch dir {
            case .increment: set(value + 1)
            case .decrement: set(value - 1)
            @unknown default: break
            }
        }
    }

    private func set(_ v: Int) {
        let n = min(range.upperBound, max(range.lowerBound, v))
        guard n != value else { return }
        Haptics.selection()
        withAnimation(.snappy) { value = n }
        onChange?(n)
    }
}

struct MarketPolicyBlock: View {
    var title: String
    var text: String
    var symbol: String
    @State private var expanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label(title, systemImage: symbol).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink)
            Text(text).font(.wr(.footnote)).foregroundStyle(Color.ink2)
                .lineLimit(expanded ? nil : 4)
                .fixedSize(horizontal: false, vertical: true)
            if text.count > 220 {
                Button(expanded ? "Weniger" : "Mehr lesen") { withAnimation(.snappy) { expanded.toggle() } }
                    .font(.wr(.footnote, .semibold))
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .sunkenSurface()
    }
}
