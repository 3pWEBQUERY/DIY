import SwiftUI

/// „Mein Bestand“ (Web `/materialien/bestand`): was du schon zu Hause hast.
/// Gruppiert nach Materialkategorie, freie Einträge unter „Eigene Einträge“; Menge und Notiz inline,
/// Wischen zum Entfernen. `GET/POST /me/material-stock`, `PATCH/DELETE /me/material-stock/:id`
struct MaterialStockView: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router

    @State private var entries: [MaterialStockEntry]?
    @State private var error: String?
    @State private var filter = ""

    // Hinzufügen
    @State private var newName = ""
    @State private var newQty = ""
    @State private var pickedId: String?
    @State private var pickedName: String?
    @State private var suggestions: [ProjectsMaterialHit] = []
    @State private var adding = false
    @FocusState private var nameFocused: Bool

    var body: some View {
        Group {
            if let entries {
                list(entries)
            } else if let error {
                ErrorStateView(message: error) { await load() }
            } else {
                LoadingView()
            }
        }
        .background(Color.paper)
        .navigationTitle("Mein Bestand")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("Alle Materialien", systemImage: "shippingbox") { router.open(.materials) }
                    Button("Einkaufslisten", systemImage: "checklist") { router.open(.shoppingLists) }
                } label: { Image(systemName: "ellipsis") }
                .accessibilityLabel("Weitere Materialseiten")
            }
        }
        .task { if entries == nil { await load() } }
        .refreshable { await load() }
        .task(id: newName) { await suggest() }
    }

    // MARK: Liste

    private func groups(_ entries: [MaterialStockEntry]) -> [(name: String, rows: [MaterialStockEntry])] {
        let f = filter.trimmed.lowercased()
        let shown = f.isEmpty ? entries : entries.filter { "\($0.name) \($0.note ?? "") \($0.category?.name ?? "")".lowercased().contains(f) }
        let dict = Dictionary(grouping: shown, by: \.groupName)
        return dict.keys
            .sorted { a, b in
                if a == MaterialStockEntry.ownGroup { return false }
                if b == MaterialStockEntry.ownGroup { return true }
                return a.compare(b, locale: Locale(identifier: "de_CH")) == .orderedAscending
            }
            .map { (name: $0, rows: dict[$0] ?? []) }
    }

    private func list(_ entries: [MaterialStockEntry]) -> some View {
        let gs = groups(entries)
        return List {
            Section {
                PageTitle(kicker: "Materialkunde", title: "Mein Bestand", subtitle: "Was du schon zu Hause hast. In Materiallisten von Projekten siehst du dadurch sofort, was dir noch fehlt, und beim Übernehmen in eine Einkaufsliste ist Vorhandenes schon abgehakt. Nur du siehst deinen Bestand.")
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 4, leading: Space.gutter, bottom: 4, trailing: Space.gutter))
                    .listRowSeparator(.hidden)
            }
            Section {
                addForm
            } header: {
                SpecLabel("Hinzufügen")
            } footer: {
                if !suggestions.isEmpty && nameFocused { suggestionBar }
            }
            if entries.isEmpty {
                Section {
                    EmptyStateView(symbol: "archivebox", title: "Dein Bestand ist noch leer", message: "Trag ein, was du schon zu Hause hast – oder tippe bei einem Material auf „Habe ich schon“. In Materiallisten und Einkaufslisten siehst du dann sofort, was dir noch fehlt.")
                        .listRowBackground(Color.clear)
                }
            } else if gs.isEmpty {
                Section {
                    Text("Nichts gefunden für «\(filter.trimmed)».").font(.wr(.subheadline)).foregroundStyle(Color.muted)
                        .listRowBackground(Color.clear)
                }
            } else {
                ForEach(gs, id: \.name) { g in
                    Section {
                        ForEach(g.rows) { e in
                            MaterialStockRow(entry: e, onOpen: { router.open(.material(slug: $0)) }) { patch in
                                await update(e, patch)
                            }
                            .listRowBackground(Color.card)
                            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                Button(role: .destructive) { Task { await remove(e) } } label: { Label("Entfernen", systemImage: "trash") }
                            }
                            .contextMenu {
                                if let s = e.slug { Button("Materialseite", systemImage: "shippingbox") { router.open(.material(slug: s)) } }
                                Button("Aus dem Bestand entfernen", systemImage: "trash", role: .destructive) { Task { await remove(e) } }
                            }
                        }
                    } header: {
                        SpecLabel("\(g.name) · \(g.rows.count)")
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .searchable(text: $filter, placement: .navigationBarDrawer(displayMode: .automatic), prompt: "Im Bestand suchen …")
        .animation(.snappy, value: entries)
    }

    private var addForm: some View {
        VStack(spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: pickedId == nil ? "square.and.pencil" : "link")
                    .font(.wr(.footnote))
                    .foregroundStyle(pickedId == nil ? Color.muted : Color.moss)
                    .frame(width: 20)
                    .accessibilityHidden(true)
                TextField("Material, z. B. Merinowolle", text: $newName)
                    .focused($nameFocused)
                    .submitLabel(.done)
                    .onSubmit { Task { await add() } }
                    .onChange(of: newName) { _, v in if v != pickedName { pickedId = nil; pickedName = nil } }
                    .accessibilityLabel("Material zum Bestand hinzufügen")
            }
            .frame(minHeight: 36)
            Divider().overlay(Color.line)
            HStack(spacing: 8) {
                Image(systemName: "number").font(.wr(.footnote)).foregroundStyle(Color.muted).frame(width: 20).accessibilityHidden(true)
                TextField("Menge (optional)", text: $newQty)
                    .submitLabel(.done)
                    .onSubmit { Task { await add() } }
                    .accessibilityLabel("Menge")
                Button { Task { await add() } } label: {
                    if adding { ProgressView().controlSize(.small) } else { Label("Hinzufügen", systemImage: "plus").font(.wr(.subheadline, .semibold)) }
                }
                .buttonStyle(.glassProminent)
                .tint(.action)
                .disabled(newName.trimmed.isEmpty || adding)
            }
            .frame(minHeight: 36)
        }
        .listRowBackground(Color.card)
    }

    private var suggestionBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(suggestions) { m in
                    Button {
                        pickedName = m.name
                        pickedId = m.id
                        newName = m.name
                        suggestions = []
                    } label: {
                        VStack(alignment: .leading, spacing: 1) {
                            Text(m.name).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink)
                            Text([m.category, m.unit].compactMap { $0?.nilIfEmpty }.joined(separator: " · ")).font(.wr(.caption2)).foregroundStyle(Color.muted)
                        }
                        .padding(.horizontal, 12).padding(.vertical, 6)
                    }
                    .buttonStyle(.plain)
                    .glassEffect(.regular.interactive(), in: Capsule())
                }
            }
            .padding(.vertical, 6)
        }
        .textCase(nil)
    }

    // MARK: Aktionen

    private func load() async {
        do {
            let e: [MaterialStockEntry] = try await APIClient.shared.get("/me/material-stock")
            entries = e
            error = nil
        } catch is CancellationError {
        } catch {
            if entries == nil { self.error = (error as? APIError)?.message ?? error.localizedDescription } else { app.show(error: error) }
        }
    }

    private func suggest() async {
        let q = newName.trimmed
        guard q.count >= 2, pickedId == nil else { suggestions = []; return }
        try? await Task.sleep(for: .milliseconds(250))
        guard !Task.isCancelled else { return }
        let hits = (try? await APIClient.shared.get("/materials", query: ["q": q, "limit": "8"]) as [ProjectsMaterialHit]) ?? []
        guard !Task.isCancelled else { return }
        withAnimation(.snappy) { suggestions = hits }
    }

    private func add() async {
        let name = newName.trimmed
        guard !name.isEmpty, !adding else { return }
        adding = true
        defer { adding = false }
        var body: [String: JSONValue] = ["name": .string(name), "quantity": .string(newQty.trimmed)]
        if let pickedId { body["materialId"] = .string(pickedId) }
        do {
            _ = try await APIClient.shared.post("/me/material-stock", body) as MaterialCreated
            Haptics.success()
            app.show("«\(pickedName ?? name)» ist in deinem Bestand.")
            newName = ""; newQty = ""; pickedId = nil; pickedName = nil; suggestions = []
            await load()
        } catch { app.show(error: error) }
    }

    private func update(_ e: MaterialStockEntry, _ patch: MaterialStockRow.Patch) async {
        var body: [String: JSONValue] = [:]
        if let q = patch.quantity { body["quantity"] = .string(q) }
        if let n = patch.note { body["note"] = .string(n) }
        guard !body.isEmpty else { return }
        if let i = entries?.firstIndex(where: { $0.id == e.id }) {
            if let q = patch.quantity { entries?[i].quantity = q }
            if let n = patch.note { entries?[i].note = n }
        }
        do { _ = try await APIClient.shared.patch("/me/material-stock/\(e.id)", body) as JSONValue }
        catch { app.show(error: error); await load() }
    }

    private func remove(_ e: MaterialStockEntry) async {
        withAnimation { entries?.removeAll { $0.id == e.id } }
        do {
            _ = try await APIClient.shared.delete("/me/material-stock/\(e.id)") as JSONValue
            app.show("«\(e.name)» aus dem Bestand entfernt.")
        } catch { app.show(error: error); await load() }
    }
}

// MARK: - Zeile mit Inline-Bearbeitung

struct MaterialStockRow: View {
    struct Patch { var quantity: String?; var note: String? }

    var entry: MaterialStockEntry
    var onOpen: (String) -> Void
    var onSave: (Patch) async -> Void

    @State private var quantity = ""
    @State private var note = ""
    @FocusState private var focus: Field?
    private enum Field { case quantity, note }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    if let slug = entry.slug {
                        Button { onOpen(slug) } label: {
                            HStack(spacing: 4) {
                                Text(entry.name).font(.wr(.body, .semibold)).foregroundStyle(Color.ink)
                                Image(systemName: "chevron.right").font(.wr(.caption2, .semibold)).foregroundStyle(Color.muted)
                            }
                        }
                        .buttonStyle(.plain)
                        .accessibilityHint("Materialseite öffnen")
                    } else {
                        Text(entry.name).font(.wr(.body, .semibold)).foregroundStyle(Color.ink)
                    }
                    let meta = [entry.type, entry.unit].compactMap { $0?.nilIfEmpty }
                    if !meta.isEmpty { SpecLabel(meta.joined(separator: " · ")) }
                }
                Spacer(minLength: 0)
            }
            HStack(spacing: 8) {
                TextField("Menge", text: $quantity)
                    .focused($focus, equals: .quantity)
                    .submitLabel(.done)
                    .onSubmit { focus = nil }
                    .font(.wr(.subheadline))
                    .padding(.horizontal, 10).frame(minHeight: 36)
                    .background(Color.sunken, in: .rect(cornerRadius: Radius.small, style: .continuous))
                    .frame(maxWidth: 120)
                    .accessibilityLabel("Menge von \(entry.name)")
                TextField("Notiz, z. B. Farbe, Lagerort", text: $note)
                    .focused($focus, equals: .note)
                    .submitLabel(.done)
                    .onSubmit { focus = nil }
                    .font(.wr(.subheadline))
                    .padding(.horizontal, 10).frame(minHeight: 36)
                    .background(Color.sunken, in: .rect(cornerRadius: Radius.small, style: .continuous))
                    .accessibilityLabel("Notiz zu \(entry.name)")
            }
        }
        .padding(.vertical, 4)
        .onAppear { quantity = entry.quantity ?? ""; note = entry.note ?? "" }
        .onChange(of: entry) { _, e in
            if focus != .quantity { quantity = e.quantity ?? "" }
            if focus != .note { note = e.note ?? "" }
        }
        .onChange(of: focus) { old, _ in if let old { commit(old) } }
    }

    private func commit(_ field: Field) {
        switch field {
        case .quantity:
            let v = String(quantity.trimmed.prefix(40))
            guard v != (entry.quantity ?? "") else { return }
            Task { await onSave(Patch(quantity: v)) }
        case .note:
            let v = String(note.trimmed.prefix(200))
            guard v != (entry.note ?? "") else { return }
            Task { await onSave(Patch(note: v)) }
        }
    }
}
