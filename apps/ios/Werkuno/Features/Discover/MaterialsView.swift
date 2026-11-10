import SwiftUI

// MARK: - Materialdatenbank (PRD §17)

struct MaterialsView: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router

    @State private var groups: [MaterialGroup] = []
    @State private var category: String?
    @State private var query = ""
    @State private var items: [MaterialEntry] = []
    @State private var cursor: String?
    @State private var loaded = false
    @State private var error: String?
    @State private var expanded: Set<String> = []

    private var total: Int { groups.reduce(0) { $0 + $1.count } }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                PageTitle(kicker: "Datenblatt", title: "Materialien", subtitle: total > 0 ? "\(Fmt.plural(total, "Material", "Materialien")) mit Einheiten, Eigenschaften und Sicherheitsinfos – die Grundlage für Materiallisten und Einkaufslisten." : "Garne, Hölzer, Farben und mehr – mit Eigenschaften und Sicherheitsinfos.")
                    .padding(.horizontal, Space.gutter)
                DiscoverSearchField(prompt: "Material, Typ oder Marke", text: $query)
                    .padding(.horizontal, Space.gutter)
                if !groups.isEmpty {
                    ChipBar(items: [(value: String?.none, label: "Alle")] + groups.map { (value: Optional($0.slug), label: "\($0.name) \($0.count)") }, selection: $category)
                }
                Group {
                    if let error {
                        ErrorStateView(message: error) { await load(reset: true) }
                    } else if !loaded {
                        LoadingView()
                    } else if items.isEmpty {
                        EmptyStateView(symbol: "shippingbox", title: "Kein Material gefunden", message: query.isEmpty ? "In dieser Kategorie gibt es noch keine Einträge." : "Nichts passt zu „\(query)“. Versuche einen allgemeineren Begriff wie „Garn“ oder „Holz“.")
                    } else {
                        LazyVStack(spacing: 10) {
                            ForEach(items) { m in card(m) }
                            LoadMoreTrigger(hasMore: cursor != nil) { await load(reset: false) }
                        }
                    }
                }
                .padding(.horizontal, Space.gutter)
            }
            .padding(.vertical, 12)
            .padding(.bottom, 30)
        }
        .scrollDismissesKeyboard(.immediately)
        .background(Color.paper)
        .navigationTitle("Materialien")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if app.isSignedIn {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { router.open(.materialStock) } label: { Image(systemName: "archivebox") }
                        .accessibilityLabel("Mein Bestand")
                }
            }
        }
        .refreshable { await loadGroups(); await load(reset: true) }
        .task { if groups.isEmpty { await loadGroups() } }
        .task(id: "\(query.trimmed)|\(category ?? "")") {
            if loaded { try? await Task.sleep(for: .milliseconds(300)) }
            guard !Task.isCancelled else { return }
            await load(reset: true)
        }
    }

    private func loadGroups() async {
        if let g: [MaterialGroup] = try? await APIClient.shared.get("/materials/categories") { groups = g }
    }

    private func load(reset: Bool) async {
        do {
            let p: Page<MaterialEntry> = try await APIClient.shared.get("/materials/browse", query: ["category": category, "q": query.trimmed.nilIfEmpty, "cursor": reset ? nil : cursor])
            withAnimation(.snappy) { items = reset ? p.items : items + p.items.filter { n in !items.contains { $0.id == n.id } } }
            cursor = p.nextCursor
            loaded = true
            error = nil
        } catch is CancellationError {
        } catch {
            if items.isEmpty { self.error = (error as? APIError)?.message ?? error.localizedDescription } else { app.show(error: error) }
        }
    }

    private func card(_ m: MaterialEntry) -> some View {
        let open = expanded.contains(m.id)
        let props = (m.properties ?? [:]).filter { !$0.value.isNull }.sorted { $0.key < $1.key }
        let hasDetails = !props.isEmpty || m.notes?.nilIfEmpty != nil || m.safetyInfo?.nilIfEmpty != nil
        return VStack(alignment: .leading, spacing: 10) {
            Button {
                // Materialseite (Preisvergleich, Bestand); ohne Slug: Details aufklappen
                if let slug = m.slug?.nilIfEmpty { router.open(.material(slug: slug)); return }
                guard hasDetails else { return }
                withAnimation(.snappy) { if open { expanded.remove(m.id) } else { expanded.insert(m.id) } }
            } label: {
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: symbol(m.category?.slug))
                        .font(.wr(.title3))
                        .foregroundStyle(Color.slate)
                        .frame(width: 44, height: 44)
                        .background(Color.slate.opacity(0.1), in: .rect(cornerRadius: Radius.small, style: .continuous))
                    VStack(alignment: .leading, spacing: 3) {
                        HStack(spacing: 6) {
                            Text(m.name).font(.wr(.headline)).foregroundStyle(Color.ink)
                            if m.safetyInfo?.nilIfEmpty != nil {
                                Image(systemName: "exclamationmark.triangle.fill").font(.wr(.caption)).foregroundStyle(Color.warn)
                                    .accessibilityLabel("Mit Sicherheitshinweis")
                            }
                        }
                        Text([m.type, m.brand, m.category?.name].compactMap { $0?.nilIfEmpty }.joined(separator: " · "))
                            .font(.wr(.caption)).foregroundStyle(Color.muted).lineLimit(2)
                        HStack(spacing: 10) {
                            if let u = m.unit?.nilIfEmpty { SpecLabel("Einheit \(u)") }
                            if let n = m.usedIn, n > 0 { SpecLabel("in \(Fmt.plural(n, "Projekt", "Projekten"))", color: .moss) }
                        }
                    }
                    Spacer(minLength: 0)
                }
                .padding(.trailing, hasDetails ? 28 : 0)
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .combine)
            .accessibilityHint(m.slug?.nilIfEmpty != nil ? "Materialseite mit Preisvergleich öffnen" : (hasDetails ? (open ? "Details ausblenden" : "Details anzeigen") : ""))
            .overlay(alignment: .topTrailing) {
                if hasDetails {
                    Button {
                        withAnimation(.snappy) { if open { expanded.remove(m.id) } else { expanded.insert(m.id) } }
                    } label: {
                        Image(systemName: "chevron.down").font(.wr(.caption, .semibold)).foregroundStyle(Color.muted)
                            .rotationEffect(.degrees(open ? 180 : 0))
                            .frame(width: 44, height: 44)
                            .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                    .offset(x: 12, y: -6)
                    .accessibilityLabel(open ? "Details zu \(m.name) ausblenden" : "Details zu \(m.name) anzeigen")
                }
            }
            if open {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(props, id: \.key) { k, v in SpecRow(label: propertyLabel(k), value: v.discoverText) }
                    if let notes = m.notes?.nilIfEmpty {
                        Text(notes).font(.wr(.subheadline)).foregroundStyle(Color.ink2).padding(.vertical, 10)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    if let s = m.safetyInfo?.nilIfEmpty {
                        NoticeView(tone: .warn, title: "Sicherheit", message: s).padding(.top, 8)
                    }
                }
                .transition(.opacity)
            }
        }
        .padding(14)
        .cardSurface(radius: 18)
    }

    private func propertyLabel(_ k: String) -> String {
        let map = ["weight": "Gewicht", "thickness": "Stärke", "needleSize": "Nadelstärke", "hardness": "Härte", "density": "Dichte", "temperature": "Temperatur", "color": "Farbe", "fiber": "Faser", "length": "Länge", "width": "Breite", "material": "Material", "finish": "Oberfläche", "voltage": "Spannung"]
        if let m = map[k] { return m }
        // camelCase → Wörter
        var out = ""
        for ch in k { if ch.isUppercase && !out.isEmpty { out += " " }; out.append(ch) }
        return out.prefix(1).uppercased() + out.dropFirst().lowercased()
    }

    private func symbol(_ slug: String?) -> String {
        switch slug {
        case "garne": "circle.dotted.circle"
        case "holz": "tree"
        case "farben": "paintbrush"
        case "keramik": "cup.and.saucer"
        case "elektronik": "cpu"
        case "druck": "square.3.layers.3d"
        case "stoffe", "textil": "scissors"
        case "papier": "doc"
        case "metall": "wrench.and.screwdriver"
        case "garten", "pflanzen": "leaf"
        default: "shippingbox"
        }
    }
}
