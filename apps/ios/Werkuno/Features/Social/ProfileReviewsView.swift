import SwiftUI

// Profil: Bewertungen (erhalten/abgegeben, Sterne-Verteilung) und Wettbewerbs-Auszeichnungen.
// Web: components/commerce/profile-reviews.tsx, app/(app)/u/[handle]/page.tsx.

/// Sterne (gerundet), z. B. 4,3 → 4 gefüllte
struct SocialStars: View {
    var value: Double
    var size: CGFloat = 12

    var body: some View {
        HStack(spacing: 1.5) {
            ForEach(1...5, id: \.self) { n in
                Image(systemName: "star.fill")
                    .font(.wr(size: size, weight: .regular))
                    .foregroundStyle(Double(n) <= value.rounded() ? Color.clay : Color.line)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(value.formatted(.number.precision(.fractionLength(0...1)).locale(Fmt.locale))) von 5 Sternen")
    }
}

/// Tab „Bewertungen“ im Profil
struct SocialProfileReviews: View {
    var handle: String
    var shopName: String?
    var hasShop: Bool
    var counts: SocialProfileExtras.Reviews
    var isSelf: Bool

    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @State private var view: String = ""
    @State private var page: SocialReviewPage?
    @State private var error: String?

    /// Umschalter nur, wenn es beides gibt (Shop mit erhaltenen und selbst abgegebenen Bewertungen)
    private var showToggle: Bool { hasShop && (counts.given ?? 0) > 0 }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if showToggle {
                Picker("Bewertungen", selection: $view) {
                    Text("Erhalten · \(Fmt.number(counts.received ?? 0))").tag("received")
                    Text("Abgegeben · \(Fmt.number(counts.given ?? 0))").tag("given")
                }
                .pickerStyle(.segmented)
            }
            if let page, page.view == view || !showToggle {
                content(page)
            } else if let error {
                ErrorStateView(message: error) { await load() }
            } else {
                LoadingView()
            }
        }
        .task(id: view) {
            if view.isEmpty { view = hasShop ? (counts.defaultView ?? "received") : "given"; return }
            await load()
        }
    }

    private func load() async {
        do {
            let p: SocialReviewPage = try await APIClient.shared.get("/users/\(handle.lowercased())/reviews", query: ["view": view])
            withAnimation(.snappy) { page = p; error = nil }
        } catch is CancellationError {
        } catch {
            if page == nil { self.error = (error as? APIError)?.message ?? error.localizedDescription } else { app.show(error: error) }
        }
    }

    @ViewBuilder private func content(_ p: SocialReviewPage) -> some View {
        if p.view == "received" {
            if p.items.isEmpty {
                EmptyStateView(symbol: "star", title: "Noch keine Bewertungen",
                               message: isSelf ? "Sobald Käufer:innen eine Bestellung bewerten, erscheinen ihre Bewertungen hier." : "\(shopName ?? "Dieser Shop") hat noch keine Bewertungen erhalten.")
            } else {
                if let dist = p.distribution { summary(dist) }
                LazyVStack(spacing: 0) {
                    ForEach(p.items) { received($0) }
                }
                .padding(.horizontal, 16)
                .cardSurface()
            }
        } else if p.items.isEmpty {
            EmptyStateView(symbol: "star", title: "Noch keine Bewertungen", message: isSelf ? "Bewertungen, die du zu Bestellungen abgibst, erscheinen hier." : nil)
        } else {
            LazyVStack(spacing: 0) {
                ForEach(p.items) { given($0) }
            }
            .padding(.horizontal, 16)
            .cardSurface()
        }
    }

    // MARK: Zusammenfassung

    private func summary(_ dist: [SocialReviewPage.Bucket]) -> some View {
        let total = dist.reduce(0) { $0 + $1.n }
        let avg = total > 0 ? Double(dist.reduce(0) { $0 + $1.stars * $1.n }) / Double(total) : 0
        let maxN = max(1, dist.map(\.n).max() ?? 0)
        return HStack(alignment: .center, spacing: 22) {
            VStack(alignment: .leading, spacing: 6) {
                Text(avg.formatted(.number.precision(.fractionLength(1)).locale(Fmt.locale)))
                    .font(.wr(size: 44, weight: .bold, relativeTo: .largeTitle))
                    .monospacedDigit()
                    .foregroundStyle(Color.ink)
                SocialStars(value: avg, size: 14)
                Text(Fmt.plural(total, "Bewertung", "Bewertungen")).font(.wr(.caption)).foregroundStyle(Color.muted)
            }
            VStack(spacing: 6) {
                ForEach(dist, id: \.stars) { b in
                    HStack(spacing: 8) {
                        HStack(spacing: 2) {
                            Text("\(b.stars)").font(.wr(.caption)).monospacedDigit()
                            Image(systemName: "star.fill").font(.wr(size: 9, weight: .regular)).foregroundStyle(Color.clay)
                        }
                        .foregroundStyle(Color.ink2)
                        .frame(width: 28, alignment: .leading)
                        GeometryReader { g in
                            ZStack(alignment: .leading) {
                                Capsule().fill(Color.sunken)
                                Capsule().fill(Color.clay).frame(width: g.size.width * CGFloat(b.n) / CGFloat(maxN))
                            }
                        }
                        .frame(height: 6)
                        Text("\(b.n)").font(.wr(.caption)).monospacedDigit().foregroundStyle(Color.muted).frame(minWidth: 22, alignment: .trailing)
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(b.stars) Sterne: \(b.n)")
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Verteilung der Bewertungen")
        }
        .padding(18)
        .cardSurface()
    }

    // MARK: Einträge

    private func received(_ r: SocialReview) -> some View {
        let author = r.author?.profile
        return HStack(alignment: .top, spacing: 12) {
            Button { if let h = author?.handle { router.open(.profile(handle: h)) } } label: {
                AvatarView(url: author?.avatarUrl, name: author?.displayName ?? "?", size: 36)
            }
            .buttonStyle(.plain)
            .disabled(author?.handle == nil)
            .accessibilityLabel(author?.displayName.map { "Profil von \($0)" } ?? "Ehemaliges Mitglied")
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(author?.displayName ?? "Ehemaliges Mitglied").font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink)
                    Text(Fmt.relative(r.createdAt)).font(.wr(.caption)).foregroundStyle(Color.muted)
                }
                HStack(spacing: 8) {
                    SocialStars(value: r.sellerRating ?? r.productRating ?? 0)
                    productLink(r, subtitle: r.orderItem?.variantName?.nilIfEmpty)
                }
                reviewBody(r)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 14)
        .overlay(alignment: .bottom) { Rectangle().fill(Color.line).frame(height: 0.75) }
    }

    private func given(_ r: SocialReview) -> some View {
        HStack(alignment: .top, spacing: 12) {
            CoverView(url: r.product?.coverUrl, seed: r.id, category: nil, showLabel: false)
                .frame(width: 56, height: 56)
                .clipShape(.rect(cornerRadius: Radius.small, style: .continuous))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                productLink(r, subtitle: nil, prominent: true)
                HStack(spacing: 4) {
                    if let shop = r.product?.shop, let name = shop.name {
                        if let slug = shop.slug, ["ACTIVE", "PAUSED"].contains(shop.status ?? "") {
                            Button(name) { router.open(.shop(slug: slug)) }.buttonStyle(.plain).foregroundStyle(Color.ink2)
                        } else {
                            Text(name)
                        }
                        Text("·")
                    }
                    Text(Fmt.relative(r.createdAt))
                }
                .font(.wr(.caption))
                .foregroundStyle(Color.muted)
                SocialStars(value: r.productRating ?? 0).padding(.top, 2)
                reviewBody(r)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 14)
        .overlay(alignment: .bottom) { Rectangle().fill(Color.line).frame(height: 0.75) }
    }

    @ViewBuilder private func productLink(_ r: SocialReview, subtitle: String?, prominent: Bool = false) -> some View {
        let title = [r.product?.title ?? "Produkt", subtitle].compactMap { $0 }.joined(separator: " · ")
        let font: Font = prominent ? .wr(.subheadline, .semibold) : .wr(.footnote)
        if r.productIsPublic, let shop = r.product?.shop?.slug, let slug = r.product?.slug {
            Button { router.open(.product(shopSlug: shop, productSlug: slug)) } label: {
                Text(title).font(font).foregroundStyle(prominent ? Color.ink : Color.ink2).lineLimit(2).multilineTextAlignment(.leading)
            }
            .buttonStyle(.plain)
        } else {
            Text(title).font(font).foregroundStyle(prominent ? Color.ink : Color.muted).lineLimit(2)
        }
    }

    @ViewBuilder private func reviewBody(_ r: SocialReview) -> some View {
        if let b = r.body?.nilIfEmpty {
            Text(b).font(.wr(.subheadline)).foregroundStyle(Color.ink2).fixedSize(horizontal: false, vertical: true)
        }
        if let reply = r.sellerReply?.nilIfEmpty {
            VStack(alignment: .leading, spacing: 2) {
                Text("Antwort von \(r.product?.shop?.name ?? "Shop")").font(.wr(.caption, .semibold)).foregroundStyle(Color.ink2)
                Text(reply).font(.wr(.footnote)).foregroundStyle(Color.ink2).fixedSize(horizontal: false, vertical: true)
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .sunkenSurface()
        }
    }
}

/// Gewinner-Abzeichen (Platz 1–3) im Profilkopf
struct SocialAwardsList: View {
    var awards: [SocialAward]
    @Environment(Router.self) private var router

    private var wins: Int { awards.filter { $0.place == 1 }.count }

    var body: some View {
        if !awards.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    SpecLabel("Auszeichnungen")
                    if wins > 0 { Text("· \(wins == 1 ? "1 Sieg" : "\(wins) Siege")").font(.wr(.caption)).foregroundStyle(Color.muted) }
                }
                ForEach(awards.prefix(5)) { a in
                    Button { router.open(href: a.href) } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "medal.fill")
                                .font(.wr(.footnote, .semibold))
                                .foregroundStyle(.white)
                                .frame(width: 32, height: 32)
                                .background(color(a.place), in: Circle())
                                .accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: 1) {
                                Text("\(a.place). Platz · \(a.title)").font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink).lineLimit(1)
                                Text([a.community, a.date.map { $0.formatted(.dateTime.month(.abbreviated).year().locale(Fmt.locale)) }].compactMap { $0 }.joined(separator: " · "))
                                    .font(.wr(.caption)).foregroundStyle(Color.muted).lineLimit(1)
                            }
                            Spacer(minLength: 0)
                            Image(systemName: "chevron.right").font(.wr(.caption)).foregroundStyle(Color.lineStrong)
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .frame(minHeight: 44)
                        .background(Color.card, in: .rect(cornerRadius: Radius.inner, style: .continuous))
                        .overlay { RoundedRectangle(cornerRadius: Radius.inner, style: .continuous).stroke(Color.line, lineWidth: 1) }
                        .contentShape(.rect)
                    }
                    .buttonStyle(.pressable)
                    .disabled(a.href == nil)
                }
            }
        }
    }

    private func color(_ place: Int) -> Color {
        switch place {
        case 1: .ochre
        case 2: .slate
        default: .mossInk
        }
    }
}
