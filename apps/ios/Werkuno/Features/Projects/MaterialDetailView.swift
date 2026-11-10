import SwiftUI

/// Materialseite (Web `/materialien/[slug]`): Stammdaten, Preisvergleich mit Partnerlink-Kennzeichnung,
/// „Habe ich schon“, Projekte mit diesem Material, verwandte Materialien. `GET /materials/:slug`
struct MaterialDetailView: View {
    var slug: String

    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @Environment(\.openURL) private var openURL
    @Environment(\.dismiss) private var dismiss

    @State private var page: MaterialPageResponse?
    @State private var error: String?
    @State private var notFound = false
    @State private var have = false

    /// Ab so vielen Tagen gilt ein Preis als veraltet (Server: OFFER_STALE_DAYS)
    private let staleDays = 90

    var body: some View {
        Group {
            if let page {
                content(page)
            } else if notFound {
                EmptyStateView(symbol: "shippingbox", title: "Material nicht gefunden", message: "Vielleicht wurde es umbenannt oder aus der Materialdatenbank entfernt.", actionTitle: "Zurück") { dismiss() }
                    .frame(maxHeight: .infinity)
            } else if let error {
                ErrorStateView(message: error) { await load() }
            } else {
                LoadingView().frame(maxHeight: .infinity)
            }
        }
        .background(Color.paper)
        .navigationTitle(page?.material.name ?? "Material")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if app.isSignedIn {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { router.open(.materialStock) } label: { Image(systemName: "archivebox") }
                        .accessibilityLabel("Mein Bestand")
                }
            }
        }
        .task { if page == nil { await load() } }
        .refreshable { await load() }
    }

    // MARK: Aufbau

    private func content(_ p: MaterialPageResponse) -> some View {
        let m = p.material
        return ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header(m)
                    .padding(.horizontal, Space.gutter)
                    .padding(.top, 8)
                    .padding(.bottom, 24)
                if let s = m.safetyInfo?.nilIfEmpty {
                    NoticeView(tone: .warn, title: "Sicherheitshinweis", message: s)
                        .padding(.horizontal, Space.gutter)
                        .padding(.bottom, 8)
                }
                offersSection(m, offers: p.offers)
                projectsSection(m, projects: p.projects ?? [])
                propertiesSection(m)
                if app.isSignedIn { stockSection(m) }
                if let r = m.related, !r.isEmpty { relatedSection(m, related: r) }
            }
            .padding(.bottom, 40)
        }
    }

    private func header(_ m: MaterialDetail) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            if let c = m.category {
                Button { router.open(.materials) } label: {
                    HStack(spacing: 6) {
                        SpecLabel("Materialien")
                        SpecLabel("/")
                        SpecLabel(c.name, color: .moss)
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Materialien, \(c.name)")
            }
            Text(m.name)
                .font(.display(32))
                .foregroundStyle(Color.ink)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            Text(subtitle(m))
                .font(.wr(.subheadline))
                .foregroundStyle(Color.muted)
                .fixedSize(horizontal: false, vertical: true)
            if let n = m.notes?.nilIfEmpty {
                Text(n)
                    .font(.wr(.body))
                    .foregroundStyle(Color.ink2)
                    .lineSpacing(3)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: 10) {
                MaterialStockToggle(materialId: m.id, name: m.name, have: $have) { _ in Task { await load(silent: true) } }
                Button {
                    guard app.isSignedIn else { app.show("Melde dich an, um Einkaufslisten zu führen.", style: .info); return }
                    router.present(.shoppingListPicker(kind: "MATERIAL", id: m.id, title: m.name))
                } label: {
                    Label("Auf Einkaufsliste", systemImage: "cart.badge.plus")
                        .font(.wr(.subheadline, .semibold))
                        .frame(minHeight: 30)
                }
                .buttonStyle(.glass)
            }
            .padding(.top, 2)
        }
    }

    private func subtitle(_ m: MaterialDetail) -> String {
        var parts: [String] = []
        if let t = m.type?.nilIfEmpty { parts.append(t) }
        if let b = m.brand?.nilIfEmpty { parts.append(b) }
        if let u = m.unit?.nilIfEmpty { parts.append("Einheit \(u)") }
        if let n = m.usedIn, n > 0 { parts.append("in \(Fmt.plural(n, "Projekt", "Projekten")) verwendet") }
        return parts.joined(separator: " · ")
    }

    // MARK: 01 Wo kaufen (Preisvergleich)

    private func offersSection(_ m: MaterialDetail, offers: [MaterialOffer]) -> some View {
        ProjectsSection(title: "Wo kaufen", number: "01", subtitle: offers.count > 1 ? "Günstigster Preis je Einheit zuerst" : nil) {
            if offers.isEmpty {
                Text("Für dieses Material sind noch keine Bezugsquellen hinterlegt. Tipp: Frag in der Community, wo andere es kaufen – oder schau im Marktplatz nach Materialsets.")
                    .font(.wr(.subheadline))
                    .foregroundStyle(Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(offers.enumerated()), id: \.element.id) { i, o in
                        offerRow(o, cheapest: i == 0 && offers.count > 1)
                        if i < offers.count - 1 { Divider().overlay(Color.line) }
                    }
                }
                .padding(.horizontal, 14)
                .cardSurface(radius: 18)
                Text(offerFootnote(hasAffiliate: offers.contains(where: \.isAffiliate)))
                    .font(.wr(.caption))
                    .foregroundStyle(Color.muted)
                    .lineSpacing(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func offerFootnote(hasAffiliate: Bool) -> String {
        var t = "Preise sind Momentaufnahmen der Redaktion und können sich geändert haben (älter als \(staleDays) Tage: farbig markiert). Die Reihenfolge richtet sich nur nach dem Preis."
        if hasAffiliate {
            t += " Mit „Partnerlink“ markierte Links sind Werbung: Kaufst du darüber, erhält Werkuno eine kleine Provision – der Preis bleibt für dich gleich."
        }
        return t
    }

    private func offerRow(_ o: MaterialOffer, cheapest: Bool) -> some View {
        let stale = o.stale == true
        let detail = [o.title?.nilIfEmpty, o.packLabel?.nilIfEmpty].compactMap { $0 }.joined(separator: " · ")
        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    FlowLayout(spacing: 6) {
                        Text(o.retailer).font(.wr(.headline)).foregroundStyle(Color.ink)
                        if cheapest { Pill(text: "Günstigster", tint: .mossInk) }
                        if o.isAffiliate {
                            Text("Partnerlink")
                                .font(.wr(.caption, .medium))
                                .foregroundStyle(Color.muted)
                                .padding(.horizontal, 8).padding(.vertical, 3)
                                .overlay { Capsule().strokeBorder(Color.lineStrong, lineWidth: 1) }
                                .accessibilityLabel("Partnerlink, Werbung")
                        }
                    }
                    Text(detail.isEmpty ? "–" : detail)
                        .font(.wr(.footnote))
                        .foregroundStyle(Color.muted)
                        .a11yLineLimit(2)
                }
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: 3) {
                    Text(Fmt.money(o.priceMinor, currency: o.currency))
                        .font(.wr(.headline).monospacedDigit())
                        .foregroundStyle(Color.ink)
                    Text(MaterialFmt.stand(o.checkedAt))
                        .font(.wr(.caption2, stale ? .semibold : nil))
                        .foregroundStyle(stale ? Color.warn : Color.muted)
                        .accessibilityLabel(stale ? "\(MaterialFmt.stand(o.checkedAt)), möglicherweise veraltet" : MaterialFmt.stand(o.checkedAt))
                }
            }
            HStack(spacing: 12) {
                if let pu = o.perUnit {
                    Text("\(Fmt.money(pu.minor, currency: o.currency)) / \(pu.label)")
                        .font(.wr(.footnote).monospacedDigit())
                        .foregroundStyle(Color.ink2)
                } else {
                    Text("–").font(.wr(.footnote)).foregroundStyle(Color.muted)
                        .accessibilityLabel("Kein Preis je Einheit")
                }
                Spacer(minLength: 8)
                Button { openURL(AppConfig.webURL(o.href)) } label: {
                    Label("Zum Shop", systemImage: "arrow.up.right")
                        .labelStyle(TrailingIconLabelStyle())
                        .font(.wr(.footnote, .semibold))
                }
                .buttonStyle(.glass)
                .accessibilityLabel(o.isAffiliate ? "Zum Shop \(o.retailer), Partnerlink" : "Zum Shop \(o.retailer)")
            }
        }
        .padding(.vertical, 14)
    }

    // MARK: 02 Projekte

    private func projectsSection(_ m: MaterialDetail, projects: [ProjectCard]) -> some View {
        ProjectsSection(title: "Projekte mit \(m.name)", number: "02") {
            if projects.isEmpty {
                Text("Noch kein öffentliches Projekt verwendet dieses Material.")
                    .font(.wr(.subheadline)).foregroundStyle(Color.muted)
            } else {
                VStack(spacing: 10) {
                    ForEach(projects) { ProjectCardView(project: $0, style: .row) }
                }
                if (m.usedIn ?? 0) > projects.count {
                    Button { router.open(.search(query: m.name)) } label: {
                        Label("Alle ansehen", systemImage: "arrow.right").font(.wr(.subheadline, .semibold))
                    }
                    .buttonStyle(.glass)
                }
            }
        }
        .hairline(.top)
    }

    // MARK: Eigenschaften

    private func propertiesSection(_ m: MaterialDetail) -> some View {
        let props = (m.properties ?? [:]).filter { !$0.value.isNull }.sorted { $0.key < $1.key }
        return ProjectsSection(title: "Eigenschaften") {
            if props.isEmpty {
                Text("Keine Eigenschaften hinterlegt.").font(.wr(.subheadline)).foregroundStyle(Color.muted)
            } else {
                VStack(spacing: 0) {
                    ForEach(props, id: \.key) { k, v in SpecRow(label: MaterialFmt.propertyLabel(k), value: MaterialFmt.propertyValue(v)) }
                }
            }
            if let ref = m.productRef?.nilIfEmpty { SpecLabel("Artikel-Nr. \(ref)") }
        }
        .hairline(.top)
    }

    // MARK: Dein Bestand

    private func stockSection(_ m: MaterialDetail) -> some View {
        ProjectsSection(title: "Dein Bestand") {
            Group {
                if let s = m.stock {
                    let qty = s.quantity?.nilIfEmpty.map { ": \($0)" } ?? ""
                    let note = s.note?.nilIfEmpty.map { " – \($0)" } ?? ""
                    Text("Im Bestand\(qty)\(note).")
                } else {
                    Text("Noch nicht in deinem Bestand.")
                }
            }
            .font(.wr(.subheadline))
            .foregroundStyle(Color.ink2)
            .fixedSize(horizontal: false, vertical: true)
            Button { router.open(.materialStock) } label: {
                Label("Bestand verwalten", systemImage: "archivebox").font(.wr(.subheadline, .semibold))
            }
            .buttonStyle(.glass)
        }
        .hairline(.top)
    }

    // MARK: Mehr aus der Kategorie

    private func relatedSection(_ m: MaterialDetail, related: [MaterialDetail.Related]) -> some View {
        ProjectsSection(title: m.category.map { "Mehr aus \($0.name)" } ?? "Verwandte Materialien") {
            VStack(spacing: 0) {
                ForEach(related) { r in
                    Button { router.open(.material(slug: r.slug)) } label: {
                        HStack(alignment: .firstTextBaseline, spacing: 12) {
                            Text(r.name).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink)
                            Spacer(minLength: 8)
                            if let t = r.type?.nilIfEmpty { SpecLabel(t) }
                            Image(systemName: "chevron.right").font(.wr(.caption2, .semibold)).foregroundStyle(Color.muted)
                        }
                        .frame(minHeight: 44)
                        .contentShape(.rect)
                        .hairline()
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .hairline(.top)
    }

    // MARK: Laden

    private func load(silent: Bool = false) async {
        do {
            let p: MaterialPageResponse = try await APIClient.shared.get("/materials/\(slug)")
            page = p
            have = p.material.stock != nil
            error = nil
            notFound = false
        } catch is CancellationError {
        } catch let e as APIError where e.status == 404 {
            if page == nil { notFound = true }
        } catch {
            if page == nil { self.error = (error as? APIError)?.message ?? error.localizedDescription } else if !silent { app.show(error: error) }
        }
    }
}

/// Symbol rechts vom Text („Zum Shop ↗“)
private struct TrailingIconLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 4) {
            configuration.title
            configuration.icon.imageScale(.small)
        }
    }
}
