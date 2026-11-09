import SwiftUI
import SafariServices
import WebKit

// MARK: - Werkbank-Leiste (Liquid Glass Bottom Accessory)

/// Schwebt über der Tab-Leiste: „Erstellen“ und – falls vorhanden – das aktuelle Projekt
/// auf der Werkbank mit Schnellzugriff auf einen neuen Journal-Eintrag.
struct WorkbenchAccessory: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @Environment(\.tabViewBottomAccessoryPlacement) private var placement
    @State private var active: ProjectMini?

    var body: some View {
        HStack(spacing: 12) {
            Button { router.present(.createMenu) } label: {
                Label("Erstellen", systemImage: "plus")
                    .font(.wr(.subheadline, .semibold))
                    .labelStyle(placement == .inline ? AnyLabelStyle(.iconOnly) : AnyLabelStyle(.titleAndIcon))
                    .frame(minWidth: 44, minHeight: 44)
                    .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Etwas erstellen")
            if let p = active {
                Divider().frame(height: 18)
                Button { if let h = app.handle, let s = p.slug { router.tab = .workbench; router.open(.project(handle: h, slug: s)) } } label: {
                    HStack(spacing: 8) {
                        Circle().fill(CategoryPalette.color(for: p.category)).frame(width: 7, height: 7)
                        VStack(alignment: .leading, spacing: 0) {
                            if placement != .inline { Text("Auf der Werkbank").font(.wr(size: 9, weight: .semibold)).textCase(.uppercase).foregroundStyle(Color.muted) }
                            Text(p.title).font(.wr(.footnote, .semibold)).lineLimit(1)
                        }
                    }
                }
                .buttonStyle(.plain)
                Spacer(minLength: 0)
                Button { router.present(.journalEntry(projectId: p.id, projectTitle: p.title)) } label: {
                    Image(systemName: "point.3.connected.trianglepath.dotted").font(.wr(.subheadline, .semibold))
                        .frame(width: 44, height: 44).contentShape(.rect)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Fortschritt zu \(p.title) eintragen")
            } else {
                Spacer(minLength: 0)
            }
        }
        .padding(.horizontal, 16)
        .foregroundStyle(Color.ink)
        .task(id: app.me?.id) { await loadActive() }
    }

    private func loadActive() async {
        struct Ctx: Decodable { var workbench: [ProjectMini] }
        guard app.isSignedIn, let c: Ctx = try? await APIClient.shared.get("/feed/context") else { return }
        withAnimation { active = c.workbench.first }
    }
}

struct AnyLabelStyle: LabelStyle {
    private let make: (Configuration) -> AnyView
    init<S: LabelStyle>(_ s: S) { make = { AnyView(s.makeBody(configuration: $0)) } }
    func makeBody(configuration: Configuration) -> some View { make(configuration) }
}

// MARK: - Erstellen-Menü

struct CreateMenuSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(Router.self) private var router
    @Environment(AppState.self) private var app
    @Namespace private var ns

    private struct Item: Identifiable { let id: String; let title: String; let subtitle: String; let symbol: String; let tint: Color; let sheet: SheetRoute }

    private var items: [Item] {
        var list: [Item] = [
            Item(id: "post", title: "Beitrag", subtitle: "Foto, Video oder Gedanke teilen", symbol: "text.bubble", tint: .moss, sheet: .composer()),
            Item(id: "project", title: "Projekt", subtitle: "Ein neues Vorhaben dokumentieren", symbol: "hammer", tint: .clay, sheet: .projectEditor()),
            Item(id: "tutorial", title: "Anleitung", subtitle: "Schritt für Schritt erklären", symbol: "list.number", tint: .slate, sheet: .tutorialEditor()),
            Item(id: "article", title: "Blogartikel", subtitle: "Erfahrungen ausführlich erzählen", symbol: "text.book.closed", tint: .plum, sheet: .articleEditor()),
            Item(id: "community", title: "Community", subtitle: "Eine Gruppe gründen", symbol: "person.3", tint: .ochre, sheet: .communityEditor()),
        ]
        if app.hasActiveShop && app.marketplaceEnabled {
            list.insert(Item(id: "product", title: "Produkt", subtitle: "Handgemachtes verkaufen", symbol: "tag", tint: .clay, sheet: .productEditor()), at: 3)
        }
        return list
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 6) {
                        SpecLabel("Werkbank", color: .moss)
                        Text("Was entsteht heute?").font(.display(30))
                    }
                    .padding(.top, 4)
                    GlassEffectContainer(spacing: 12) {
                        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                            ForEach(items) { item in
                                Button {
                                    Haptics.tap()
                                    dismiss()
                                    Task { try? await Task.sleep(for: .milliseconds(380)); router.present(item.sheet) }
                                } label: {
                                    VStack(alignment: .leading, spacing: 10) {
                                        Image(systemName: item.symbol).font(.wr(.title2)).foregroundStyle(item.tint)
                                            .frame(width: 44, height: 44)
                                            .background(item.tint.opacity(0.12), in: .rect(cornerRadius: 12, style: .continuous))
                                        Text(item.title).font(.wr(.headline)).foregroundStyle(Color.ink)
                                        Text(item.subtitle).font(.wr(.caption)).foregroundStyle(Color.muted).multilineTextAlignment(.leading).lineLimit(2)
                                    }
                                    .frame(maxWidth: .infinity, minHeight: 140, alignment: .topLeading)
                                    .padding(14)
                                }
                                .buttonStyle(.plain)
                                .glassEffect(.regular.interactive(), in: .rect(cornerRadius: Radius.card, style: .continuous))
                                .glassEffectID(item.id, in: ns)
                            }
                        }
                    }
                    if !app.hasActiveShop && app.marketplaceEnabled {
                        Button { dismiss(); Task { try? await Task.sleep(for: .milliseconds(380)); router.present(.shopWizard) } } label: {
                            HStack {
                                Image(systemName: "storefront").foregroundStyle(Color.clay)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Shop eröffnen").font(.wr(.subheadline, .semibold))
                                    Text("Verkaufe Einzelstücke, Kleinserien und Materialsets.").font(.wr(.caption)).foregroundStyle(Color.muted)
                                }
                                Spacer()
                                Image(systemName: "chevron.right").font(.wr(.caption)).foregroundStyle(Color.muted)
                            }
                            .padding(14)
                            .cardSurface()
                        }
                        .buttonStyle(.pressable)
                    }
                }
                .padding(Space.gutter)
            }
            .background(Color.paper)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Schliessen", systemImage: "xmark") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
        .presentationBackground(.thinMaterial)
    }
}

// MARK: - Web (Rechtstexte, Stripe-Checkout, Fallback)

struct SafariSheet: UIViewControllerRepresentable {
    var url: URL
    func makeUIViewController(context: Context) -> SFSafariViewController {
        let c = SFSafariViewController(url: url)
        return c
    }
    func updateUIViewController(_ vc: SFSafariViewController, context: Context) {}
}

/// Eingebettete Webseite (nur für statische Seiten wie Rechtstexte)
struct WebPageView: View {
    var url: URL
    var title: String? = nil
    var body: some View {
        WebView(url: url)
            .navigationTitle(title ?? "")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { ShareLink(item: url) }
            }
    }
}
