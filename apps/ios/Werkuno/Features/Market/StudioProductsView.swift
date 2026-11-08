import SwiftUI

/// Werkuno Studio → Produkte: Liste mit Status, Bestand, Aufrufen und Schnellaktionen.
struct StudioProductsView: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router

    @State private var data: MarketStudioProducts?
    @State private var error: String?
    @State private var status = ""
    @State private var confirmDelete: MarketStudioProduct?

    private let filters: [(value: String, label: String)] = [("", "Alle"), ("ACTIVE", "Aktiv"), ("DRAFT", "Entwurf"), ("PAUSED", "Pausiert"), ("SOLD_OUT", "Ausverkauft"), ("DISABLED", "Deaktiviert")]

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                PageTitle(kicker: "Werkuno Studio", title: "Produkte", subtitle: "Deine Angebote im Marktplatz – ruhig, ehrlich, mit dem Faden dahinter.")
                    .padding(.horizontal, Space.gutter)
                if let data, data.shop == nil {
                    MarketNoShopCTA().padding(.horizontal, Space.gutter)
                } else {
                    ChipBar(items: filters, selection: $status)
                    VStack(alignment: .leading, spacing: 12) {
                        if let s = data?.shop, s.status != "ACTIVE" {
                            NoticeView(tone: s.status == "SUSPENDED" ? .danger : .info, title: "Shop: \(L.shopStatus[s.status] ?? s.status)",
                                       message: s.status == "PAUSED" ? "Dein Shop ist pausiert – Produkte sind sichtbar, aber nicht bestellbar." : s.status == "SUSPENDED" ? "Dein Shop ist gesperrt. Details findest du in deinen Benachrichtigungen." : "Du kannst Produkte als Entwurf vorbereiten und veröffentlichen, sobald dein Shop verifiziert ist.")
                        }
                        list
                    }
                    .padding(.horizontal, Space.gutter)
                }
            }
            .padding(.bottom, 40)
        }
        .background(Color.paper)
        .navigationTitle("Produkte")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if data?.shop != nil {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { router.present(.productEditor(id: nil)) } label: { Image(systemName: "plus") }
                        .accessibilityLabel("Neues Produkt")
                }
            }
        }
        .task(id: status) { await load() }
        .refreshable { await load() }
        .onChange(of: router.sheet) { old, new in
            guard new == nil else { return }
            switch old {
            case .productEditor, .shopWizard: Task { await load() }
            default: break
            }
        }
        .confirmationDialog("Produkt löschen?", isPresented: Binding(get: { confirmDelete != nil }, set: { if !$0 { confirmDelete = nil } }), titleVisibility: .visible, presenting: confirmDelete) { p in
            Button("„\(p.title)“ löschen", role: .destructive) {
                Task {
                    await app.run("Produkt gelöscht.") { _ = try await APIClient.shared.delete("/studio/products/\(p.id)") as JSONValue }
                    await load()
                }
            }
        } message: { _ in Text("Bereits verkaufte Produkte können nicht gelöscht werden – pausiere sie stattdessen.") }
    }

    @ViewBuilder private var list: some View {
        if data == nil && error == nil {
            LoadingView()
        } else if let error, data == nil {
            ErrorStateView(message: error) { await load() }
        } else if let items = data?.products, items.isEmpty {
            EmptyStateView(symbol: "tag", title: status.isEmpty ? "Noch keine Produkte" : "Keine Produkte mit diesem Status", message: status.isEmpty ? "Lege dein erstes Angebot an – mit Fotos, ehrlichem Datenblatt und, wenn vorhanden, dem Projekt dahinter." : nil, actionTitle: status.isEmpty ? "Neues Produkt" : nil) {
                router.present(.productEditor(id: nil))
            }
            .cardSurface()
        } else if let items = data?.products {
            SpecLabel("\(Fmt.plural(items.count, "Produkt", "Produkte"))")
            ForEach(items) { p in row(p) }
        }
    }

    private func row(_ p: MarketStudioProduct) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Button { router.present(.productEditor(id: p.id)) } label: {
                HStack(alignment: .top, spacing: 12) {
                    CoverView(url: p.imageURL, seed: p.id, category: p.category, showLabel: false)
                        .frame(width: 64, height: 64)
                        .clipShape(.rect(cornerRadius: Radius.inner, style: .continuous))
                    VStack(alignment: .leading, spacing: 5) {
                        Text(p.title).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink).lineLimit(2).multilineTextAlignment(.leading)
                        HStack(spacing: 8) {
                            MarketStatusPill.product(p.status)
                            Text(Fmt.money(p.priceMinor, currency: p.currency)).font(.wr(.footnote, .semibold)).monospacedDigit().foregroundStyle(Color.ink2)
                        }
                        HStack(spacing: 10) {
                            if p.kind != "DIGITAL" {
                                Label("\(p.stockAvailable)\(p.stockOnHand != p.stockAvailable ? "/\(p.stockOnHand)" : "")", systemImage: "shippingbox").labelStyle(.compact)
                                    .accessibilityLabel("Bestand \(p.stockAvailable) verfügbar")
                            }
                            Label(Fmt.number(p.viewCount), systemImage: "eye").labelStyle(.compact).accessibilityLabel("\(p.viewCount ?? 0) Aufrufe")
                            Label(Fmt.number(p.saveCount), systemImage: "bookmark").labelStyle(.compact).accessibilityLabel("\(p.saveCount ?? 0) Mal gemerkt")
                            Label(Fmt.number(p.sold), systemImage: "bag").labelStyle(.compact).accessibilityLabel("\(p.sold) verkauft")
                        }
                        .font(.wr(.caption)).foregroundStyle(Color.muted)
                    }
                }
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            Spacer(minLength: 0)
            Menu {
                Button("Bearbeiten", systemImage: "pencil") { router.present(.productEditor(id: p.id)) }
                if let s = p.shop?.slug { Button("Ansehen", systemImage: "eye") { router.open(.product(shopSlug: s, productSlug: p.slug)) } }
                if p.status != "DISABLED" {
                    Divider()
                    if p.status != "ACTIVE" && p.status != "SOLD_OUT" { Button("Aktivieren", systemImage: "play.circle") { Task { await setStatus(p, "ACTIVE") } } }
                    if p.status == "ACTIVE" || p.status == "SOLD_OUT" { Button("Pausieren", systemImage: "pause.circle") { Task { await setStatus(p, "PAUSED") } } }
                    if p.status != "DRAFT" { Button("Zum Entwurf machen", systemImage: "doc") { Task { await setStatus(p, "DRAFT") } } }
                }
                Divider()
                Button("Löschen", systemImage: "trash", role: .destructive) { confirmDelete = p }
            } label: {
                Image(systemName: "ellipsis").frame(width: 36, height: 36).contentShape(.rect)
            }
            .accessibilityLabel("Aktionen für \(p.title)")
        }
        .padding(12)
        .cardSurface()
    }

    private func load() async {
        do {
            let d: MarketStudioProducts = try await APIClient.shared.get("/studio/products", query: ["status": status.nilIfEmpty])
            withAnimation(.smooth) { data = d }
            error = nil
        } catch is CancellationError {
        } catch {
            self.error = (error as? APIError)?.message ?? error.localizedDescription
        }
    }

    private func setStatus(_ p: MarketStudioProduct, _ s: String) async {
        let label = s == "ACTIVE" ? "Aktiviert." : s == "PAUSED" ? "Pausiert." : "Zum Entwurf gemacht."
        await app.run(label) { _ = try await APIClient.shared.post("/studio/products/\(p.id)/status", ["status": JSONValue.string(s)]) as JSONValue }
        await load()
    }
}

/// Hinweis + CTA, wenn noch kein Shop besteht
struct MarketNoShopCTA: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            ThreadPlate(seed: "shop-cta", category: "haekeln-stricken", glyph: "loop", showLabel: false, animated: true)
                .frame(height: 140)
                .clipShape(.rect(cornerRadius: Radius.inner, style: .continuous))
            Text("Verkaufe, was du machst.").font(.display(24))
            Text("Eröffne deinen Shop in wenigen Schritten. Du zahlst keine Grundgebühr – nur eine Provision von \(Fmt.percent(bps: app.feeBps)) auf den Warenwert, wenn etwas verkauft wird.")
                .font(.wr(.subheadline)).foregroundStyle(Color.ink2).fixedSize(horizontal: false, vertical: true)
            Button { router.present(.shopWizard) } label: { Label("Shop eröffnen", systemImage: "storefront") }
                .primaryButton()
        }
        .padding(16)
        .cardSurface()
    }
}
