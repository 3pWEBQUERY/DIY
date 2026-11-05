import SwiftUI

// MARK: - Übersicht

struct ShoppingListsView: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @State private var lists: [MeShoppingListSummary]?
    @State private var error: String?
    @State private var creating = false
    @State private var newTitle = ""
    @State private var pendingDelete: MeShoppingListSummary?
    @State private var pendingMerge: (target: MeShoppingListSummary, source: MeShoppingListSummary)?

    var body: some View {
        MePhase(value: lists, error: error, retry: load) { lists in
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    PageTitle(kicker: "Materialien", title: "Einkaufslisten", subtitle: "Übernimm Materiallisten aus Projekten und Anleitungen – gleiche Positionen werden zusammengefasst.")
                    if lists.isEmpty {
                        EmptyStateView(symbol: "checklist", title: "Noch keine Einkaufsliste",
                                       message: "Lege eine Liste an oder tippe bei einem Projekt auf „Materialien auf Einkaufsliste“.",
                                       actionTitle: "Liste anlegen") { creating = true }
                    } else {
                        LazyVStack(spacing: 10) {
                            ForEach(lists) { l in row(l, others: lists.filter { $0.id != l.id }) }
                        }
                    }
                    Button { router.open(.materials) } label: {
                        Label("Materialdatenbank durchsuchen", systemImage: "shippingbox")
                            .font(.wr(.subheadline, .semibold))
                    }
                    .buttonStyle(.glass)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 6)
                }
                .padding(.horizontal, Space.gutter)
                .padding(.bottom, 40)
            }
        }
        .background(Color.paper)
        .navigationTitle("Einkaufslisten")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { creating = true } label: { Image(systemName: "plus") }.accessibilityLabel("Neue Einkaufsliste")
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .alert("Neue Einkaufsliste", isPresented: $creating) {
            TextField("Titel, z. B. „Baumarkt Samstag“", text: $newTitle)
            Button("Abbrechen", role: .cancel) { newTitle = "" }
            Button("Anlegen") { Task { await create() } }
        }
        .confirmationDialog("Liste löschen?", isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }), titleVisibility: .visible, presenting: pendingDelete) { l in
            Button("«\(l.title)» löschen", role: .destructive) { Task { await delete(l) } }
        } message: { _ in Text("Alle Positionen dieser Liste werden entfernt.") }
        .confirmationDialog("Listen zusammenführen?", isPresented: Binding(get: { pendingMerge != nil }, set: { if !$0 { pendingMerge = nil } }), titleVisibility: .visible, presenting: pendingMerge.map { MergePair(target: $0.target, source: $0.source) }) { pair in
            Button("Zusammenführen") { Task { await merge(target: pair.target, source: pair.source) } }
        } message: { pair in
            Text("Alle Positionen aus «\(pair.source.title)» werden in «\(pair.target.title)» übernommen. Gleiche Materialien werden zusammengezählt, danach wird «\(pair.source.title)» gelöscht.")
        }
    }

    private struct MergePair { var target: MeShoppingListSummary; var source: MeShoppingListSummary }

    private func row(_ l: MeShoppingListSummary, others: [MeShoppingListSummary]) -> some View {
        let total = l.total ?? 0, done = l.done ?? 0
        return Button { router.open(.shoppingList(id: l.id)) } label: {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline) {
                    Text(l.title).font(.wr(.headline)).foregroundStyle(Color.ink).multilineTextAlignment(.leading)
                    if l.shared == true { Image(systemName: "link").font(.wr(.caption)).foregroundStyle(Color.moss).accessibilityLabel("Geteilt") }
                    Spacer()
                    Text("\(done)/\(total)").font(.wr(.subheadline, .semibold)).monospacedDigit().foregroundStyle(done == total && total > 0 ? Color.moss : Color.ink2)
                }
                ProgressView(value: total == 0 ? 0 : Double(done), total: Double(max(total, 1)))
                    .tint(.moss)
                    .accessibilityLabel("\(done) von \(total) erledigt")
                HStack(spacing: 6) {
                    if let s = l.sources, !s.isEmpty {
                        Image(systemName: "point.3.connected.trianglepath.dotted").font(.wr(.caption2))
                        Text(s.joined(separator: " · ")).lineLimit(1)
                    } else {
                        Text(Fmt.plural(total, "Position", "Positionen"))
                    }
                    Spacer()
                    if let u = l.updatedAt { Text(Fmt.relative(u)) }
                }
                .font(.wr(.caption)).foregroundStyle(Color.muted)
            }
            .padding(14)
            .cardSurface()
        }
        .buttonStyle(.pressable)
        .contextMenu {
            if !others.isEmpty {
                Menu("Andere Liste hierher übernehmen", systemImage: "arrow.triangle.merge") {
                    ForEach(others) { o in Button(o.title) { pendingMerge = (l, o) } }
                }
            }
            Button("Löschen", systemImage: "trash", role: .destructive) { pendingDelete = l }
        }
    }

    private func load() async {
        do { lists = try await APIClient.shared.get("/shopping-lists"); error = nil }
        catch { if lists == nil { self.error = MeErr.text(error) } else { app.show(error: error) } }
    }

    private func create() async {
        let t = newTitle.trimmed
        newTitle = ""
        guard !t.isEmpty else { return }
        do {
            let r: MeCreated = try await APIClient.shared.post("/shopping-lists", ["title": JSONValue.string(t)])
            Haptics.success()
            await load()
            router.open(.shoppingList(id: r.id))
        } catch { app.show(error: error) }
    }

    private func delete(_ l: MeShoppingListSummary) async {
        if await app.run("Liste gelöscht.", { _ = try await APIClient.shared.delete("/shopping-lists/\(l.id)") as JSONValue }) {
            withAnimation { lists?.removeAll { $0.id == l.id } }
        }
    }

    private func merge(target: MeShoppingListSummary, source: MeShoppingListSummary) async {
        do {
            let r: MeMergeResult = try await APIClient.shared.post("/shopping-lists/\(target.id)/merge", ["sourceId": JSONValue.string(source.id)])
            app.show("Zusammengeführt: \(r.added ?? 0) neu, \(r.merged ?? 0) zusammengefasst.")
            await load()
        } catch { app.show(error: error) }
    }
}

// MARK: - Liste

struct ShoppingListView: View {
    var id: String
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @Environment(\.dismiss) private var dismiss
    @State private var list: MeShoppingListDetail?
    @State private var error: String?
    @State private var renaming = false
    @State private var renameText = ""
    @State private var editingQty: MeShoppingItem?
    @State private var qtyText = ""
    @State private var confirmDelete = false
    @State private var newName = ""
    @State private var newQty = ""
    @State private var materialId: String?
    @State private var materialName: String?
    @State private var suggestions: [MeMaterialHit] = []
    @FocusState private var nameFocused: Bool

    var body: some View {
        MePhase(value: list, error: error, retry: load) { l in content(l) }
            .background(Color.paper)
            .navigationTitle(list?.title ?? "Einkaufsliste")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { toolbar }
            .task { if list == nil { await load() } }
            .refreshable { await load() }
            .task(id: newName) { await suggest() }
            .safeAreaInset(edge: .bottom) { if list != nil { addBar } }
            .alert("Liste umbenennen", isPresented: $renaming) {
                TextField("Titel", text: $renameText)
                Button("Abbrechen", role: .cancel) {}
                Button("Sichern") { Task { await rename() } }
            }
            .alert("Menge ändern", isPresented: Binding(get: { editingQty != nil }, set: { if !$0 { editingQty = nil } })) {
                TextField("z. B. 200 g", text: $qtyText)
                Button("Abbrechen", role: .cancel) { editingQty = nil }
                Button("Sichern") { if let it = editingQty { Task { await patch(it, ["quantity": .string(qtyText.trimmed)]) } }; editingQty = nil }
            } message: { Text(editingQty?.name ?? "") }
            .confirmationDialog("Liste löschen?", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Löschen", role: .destructive) {
                    Task { if await app.run("Liste gelöscht.", { _ = try await APIClient.shared.delete("/shopping-lists/\(id)") as JSONValue }) { dismiss() } }
                }
            }
    }

    @ToolbarContentBuilder private var toolbar: some ToolbarContent {
        if let l = list {
            if let token = l.shareToken {
                ToolbarItem(placement: .topBarTrailing) {
                    ShareLink(item: MeLinks.list(token), subject: Text(l.title), message: Text("Meine Einkaufsliste „\(l.title)“")) {
                        Image(systemName: "square.and.arrow.up")
                    }
                    .accessibilityLabel("Link teilen")
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("Umbenennen", systemImage: "pencil") { renameText = l.title; renaming = true }
                    if l.shareToken == nil {
                        Button("Lesefreigabe per Link", systemImage: "link") { Task { await share(true) } }
                    } else {
                        Button("Freigabe beenden", systemImage: "link.badge.plus") { Task { await share(false) } }
                    }
                    Button("Erledigtes entfernen", systemImage: "checkmark.circle.badge.xmark") { Task { await clearDone() } }
                        .disabled(!l.items.contains { $0.isDone })
                    Divider()
                    Button("Liste löschen", systemImage: "trash", role: .destructive) { confirmDelete = true }
                } label: { Image(systemName: "ellipsis") }
                .accessibilityLabel("Liste verwalten")
            }
        }
    }

    private func content(_ l: MeShoppingListDetail) -> some View {
        let open = l.items.filter { !$0.isDone }
        let done = l.items.filter(\.isDone)
        let sources = Array(Set(l.items.compactMap { $0.sourceTitle?.nilIfEmpty })).sorted()
        return List {
            Section {
                VStack(alignment: .leading, spacing: 10) {
                    PageTitle(kicker: "Einkaufsliste", title: l.title, subtitle: nil)
                    HStack {
                        Text("\(done.count) von \(l.items.count) erledigt").font(.wr(.subheadline)).foregroundStyle(Color.muted)
                        Spacer()
                        if l.shareToken != nil { Label("Geteilt", systemImage: "link").font(.wr(.caption, .semibold)).foregroundStyle(Color.moss) }
                    }
                    ProgressView(value: Double(done.count), total: Double(max(l.items.count, 1))).tint(.moss)
                    if !sources.isEmpty {
                        HStack(alignment: .top, spacing: 6) {
                            Image(systemName: "point.3.connected.trianglepath.dotted").foregroundStyle(Color.moss)
                            Text("Aus: \(sources.joined(separator: ", "))").fixedSize(horizontal: false, vertical: true)
                        }
                        .font(.wr(.caption)).foregroundStyle(Color.ink2)
                    }
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 4, leading: Space.gutter, bottom: 8, trailing: Space.gutter))
                .listRowSeparator(.hidden)
            }
            if l.items.isEmpty {
                Section {
                    EmptyStateView(symbol: "cart", title: "Noch leer", message: "Füge unten Positionen hinzu – mit Vorschlägen aus der Materialdatenbank.")
                        .listRowBackground(Color.clear)
                }
            }
            if !open.isEmpty {
                Section { ForEach(open) { itemRow($0) } } header: { SpecLabel("Offen · \(open.count)") }
            }
            if !done.isEmpty {
                Section { ForEach(done) { itemRow($0) } } header: { SpecLabel("Erledigt · \(done.count)") }
            }
        }
        .listStyle(.insetGrouped)
        .meFormStyle()
        .animation(.snappy, value: l.items)
    }

    private func itemRow(_ it: MeShoppingItem) -> some View {
        HStack(spacing: 12) {
            Button {
                Haptics.selection()
                Task { await patch(it, ["purchased": .bool(!it.purchased)]) }
            } label: {
                Image(systemName: it.isDone ? "checkmark.circle.fill" : "circle")
                    .font(.wr(.title3))
                    .foregroundStyle(it.isDone ? Color.moss : Color.lineStrong)
                    .symbolEffect(.bounce, value: it.isDone)
                    .frame(width: 44, height: 44)
                    .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(it.purchased ? "Als nicht gekauft markieren" : "Als gekauft abhaken")
            VStack(alignment: .leading, spacing: 2) {
                Text(it.name)
                    .font(.wr(.body))
                    .strikethrough(it.isDone, color: Color.muted)
                    .foregroundStyle(it.isDone ? Color.muted : Color.ink)
                let sub = [it.haveIt ? "Habe ich schon" : nil, it.category, it.sourceTitle].compactMap { $0?.nilIfEmpty }
                if !sub.isEmpty { Text(sub.joined(separator: " · ")).font(.wr(.caption)).foregroundStyle(Color.muted).lineLimit(1) }
            }
            Spacer(minLength: 8)
            Button { qtyText = it.quantity ?? ""; editingQty = it } label: {
                Text(it.quantity?.nilIfEmpty ?? "Menge")
                    .font(.wr(.subheadline, .medium)).monospacedDigit()
                    .foregroundStyle(it.quantity?.nilIfEmpty == nil ? Color.muted : Color.ink2)
                    .padding(.horizontal, 10).padding(.vertical, 5)
                    .background(Color.sunken, in: Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Menge: \(it.quantity?.nilIfEmpty ?? "keine"). Ändern")
        }
        .listRowBackground(Color.card)
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) { Task { await remove(it) } } label: { Label("Entfernen", systemImage: "trash") }
        }
        .swipeActions(edge: .leading) {
            Button { Haptics.selection(); Task { await patch(it, ["haveIt": .bool(!it.haveIt)]) } } label: {
                Label(it.haveIt ? "Brauche ich" : "Habe ich", systemImage: it.haveIt ? "arrow.uturn.backward" : "house")
            }
            .tint(.slate)
        }
        .contextMenu {
            Button(it.purchased ? "Nicht gekauft" : "Gekauft", systemImage: "cart") { Task { await patch(it, ["purchased": .bool(!it.purchased)]) } }
            Button(it.haveIt ? "Brauche ich doch" : "Habe ich schon", systemImage: "house") { Task { await patch(it, ["haveIt": .bool(!it.haveIt)]) } }
            Button("Menge ändern", systemImage: "number") { qtyText = it.quantity ?? ""; editingQty = it }
            if it.materialSlug != nil { Button("Materialdatenbank", systemImage: "shippingbox") { router.open(.materials) } }
            Button("Entfernen", systemImage: "trash", role: .destructive) { Task { await remove(it) } }
        }
    }

    // MARK: Hinzufügen

    private var addBar: some View {
        VStack(spacing: 8) {
            if nameFocused && !suggestions.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(suggestions) { m in
                            Button {
                                materialName = m.name
                                materialId = m.id
                                newName = m.name
                                suggestions = []
                            } label: {
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(m.name).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink)
                                    Text([m.category, m.unit].compactMap { $0 }.joined(separator: " · ")).font(.wr(.caption2)).foregroundStyle(Color.muted)
                                }
                                .padding(.horizontal, 12).padding(.vertical, 6)
                            }
                            .buttonStyle(.plain)
                            .glassEffect(.regular.interactive(), in: Capsule())
                        }
                    }
                    .padding(.horizontal, Space.gutter)
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
            HStack(spacing: 8) {
                TextField("Position hinzufügen", text: $newName)
                    .focused($nameFocused)
                    .submitLabel(.done)
                    .onSubmit { Task { await addItem() } }
                    .onChange(of: newName) { _, v in if v != materialName { materialId = nil; materialName = nil } }
                Divider().frame(height: 20)
                TextField("Menge", text: $newQty)
                    .frame(width: 76)
                    .onSubmit { Task { await addItem() } }
                Button { Task { await addItem() } } label: {
                    Image(systemName: "plus").font(.wr(.body, .bold)).frame(width: 30, height: 30)
                }
                .buttonStyle(.glassProminent)
                .tint(.moss)
                .disabled(newName.trimmed.isEmpty)
                .accessibilityLabel("Hinzufügen")
            }
            .padding(.leading, 18).padding(.trailing, 6).padding(.vertical, 6)
            .glassEffect(.regular, in: Capsule())
            .padding(.horizontal, 12)
            .padding(.bottom, 6)
        }
        .animation(.snappy, value: suggestions)
    }

    private func suggest() async {
        let q = newName.trimmed
        guard q.count >= 2, materialId == nil else { suggestions = []; return }
        try? await Task.sleep(for: .milliseconds(250))
        guard !Task.isCancelled else { return }
        suggestions = (try? await APIClient.shared.get("/materials", query: ["q": q, "limit": "8"]) as [MeMaterialHit]) ?? []
    }

    private func addItem() async {
        let name = newName.trimmed
        guard !name.isEmpty else { return }
        var body: [String: JSONValue] = ["name": .string(name), "quantity": .string(newQty.trimmed)]
        if let materialId { body["materialId"] = .string(materialId) }
        do {
            _ = try await APIClient.shared.post("/shopping-lists/\(id)/items", body) as MeCreated
            Haptics.soft()
            newName = ""; newQty = ""; materialId = nil; materialName = nil; suggestions = []
            await load()
        } catch { app.show(error: error) }
    }

    // MARK: Aktionen

    private func load() async {
        do { list = try await APIClient.shared.get("/shopping-lists/\(id)"); error = nil }
        catch { if list == nil { self.error = MeErr.text(error) } else { app.show(error: error) } }
    }

    private func patch(_ it: MeShoppingItem, _ body: [String: JSONValue]) async {
        // Optimistisch
        if let i = list?.items.firstIndex(where: { $0.id == it.id }) {
            withAnimation(.snappy) {
                if let v = body["purchased"]?.bool { list?.items[i].purchased = v; if v { Haptics.success() } }
                if let v = body["haveIt"]?.bool { list?.items[i].haveIt = v }
                if let v = body["quantity"]?.string { list?.items[i].quantity = v }
            }
        }
        do { _ = try await APIClient.shared.patch("/shopping-list-items/\(it.id)", body) as JSONValue }
        catch { app.show(error: error); await load() }
    }

    private func remove(_ it: MeShoppingItem) async {
        withAnimation { list?.items.removeAll { $0.id == it.id } }
        do { _ = try await APIClient.shared.delete("/shopping-list-items/\(it.id)") as JSONValue }
        catch { app.show(error: error); await load() }
    }

    private func clearDone() async {
        do {
            let r: MeCountResult = try await APIClient.shared.post("/shopping-lists/\(id)/clear-done")
            app.show(r.removed == 1 ? "1 Position entfernt." : "\(r.removed ?? 0) Positionen entfernt.")
            await load()
        } catch { app.show(error: error) }
    }

    private func rename() async {
        let t = renameText.trimmed
        guard !t.isEmpty else { return }
        if await app.run("Umbenannt.", { _ = try await APIClient.shared.patch("/shopping-lists/\(id)", ["title": JSONValue.string(t)]) as JSONValue }) {
            list?.title = t
        }
    }

    private func share(_ on: Bool) async {
        do {
            let r: MeShareResult = try await APIClient.shared.post("/shopping-lists/\(id)/share", ["shared": JSONValue.bool(on)])
            list?.shareToken = r.shareToken
            app.show(on ? "Lesefreigabe aktiv – teile den Link." : "Freigabe beendet. Der alte Link funktioniert nicht mehr.")
        } catch { app.show(error: error) }
    }
}

// MARK: - Geteilte Liste (nur lesen)

struct SharedShoppingListView: View {
    var token: String
    @State private var list: MeShoppingListDetail?
    @State private var error: String?

    var body: some View {
        MePhase(value: list, error: error, retry: load) { l in
            List {
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        PageTitle(kicker: "Geteilte Einkaufsliste", title: l.title, subtitle: l.owner?.displayName.map { "von \($0)" })
                        Text("\(l.items.filter(\.isDone).count) von \(l.items.count) erledigt · nur lesen").font(.wr(.subheadline)).foregroundStyle(Color.muted)
                    }
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                }
                if l.items.isEmpty {
                    Section { Text("Diese Liste ist leer.").foregroundStyle(Color.muted) }
                } else {
                    Section {
                        ForEach(l.items) { it in
                            HStack(spacing: 12) {
                                Image(systemName: it.isDone ? "checkmark.circle.fill" : "circle").foregroundStyle(it.isDone ? Color.moss : Color.lineStrong)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(it.name).strikethrough(it.isDone, color: Color.muted).foregroundStyle(it.isDone ? Color.muted : Color.ink)
                                    if let s = it.sourceTitle?.nilIfEmpty { Text(s).font(.wr(.caption)).foregroundStyle(Color.muted) }
                                }
                                Spacer()
                                if let q = it.quantity?.nilIfEmpty { Text(q).font(.wr(.subheadline)).monospacedDigit().foregroundStyle(Color.ink2) }
                            }
                            .accessibilityElement(children: .combine)
                            .listRowBackground(Color.card)
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .meFormStyle()
        }
        .background(Color.paper)
        .navigationTitle("Einkaufsliste")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                ShareLink(item: MeLinks.list(token)) { Image(systemName: "square.and.arrow.up") }.accessibilityLabel("Link teilen")
            }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        do { list = try await APIClient.shared.get("/shopping-lists/shared/\(token)"); error = nil }
        catch { self.error = MeErr.text(error) }
    }
}

// MARK: - Materialien übernehmen (Sheet)

struct ShoppingListPickerSheet: View {
    var kind: String
    var id: String
    var title: String
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @State private var lists: [MeShoppingListSummary]?
    @State private var error: String?
    @State private var selection: String = "new"
    @State private var newTitle = ""
    @State private var result: MeAddSourceResult?
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Group {
                if let result { success(result) } else { form }
            }
            .navigationTitle("Auf Einkaufsliste")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(result == nil ? "Abbrechen" : "Fertig") { dismiss() } }
                if result == nil {
                    ToolbarItem(placement: .confirmationAction) {
                        AsyncButton("Übernehmen") { await submit() }.disabled(lists == nil)
                    }
                }
            }
            .task {
                if newTitle.isEmpty { newTitle = "Für: \(title)" }
                await load()
            }
        }
        .presentationDetents([.medium, .large])
    }

    private var form: some View {
        Form {
            Section {
                HStack(spacing: 12) {
                    Image(systemName: kind == "TUTORIAL" ? "list.number" : "hammer").foregroundStyle(Color.moss).frame(width: 26)
                    VStack(alignment: .leading, spacing: 2) {
                        SpecLabel(kind == "TUTORIAL" ? "Anleitung" : "Projekt", color: .moss)
                        Text(title).font(.wr(.subheadline, .semibold))
                    }
                }
            } footer: { Text("Alle Materialien werden übernommen. Was schon auf der Liste steht, wird zusammengezählt.") }
            if let error {
                Section { ErrorStateView(message: error) { await load() } }
            } else if let lists {
                Section {
                    Picker("Liste", selection: $selection) {
                        Label("Neue Liste", systemImage: "plus.circle").tag("new")
                        ForEach(lists) { l in
                            Text("\(l.title) · \(Fmt.plural(l.total ?? 0, "Position", "Positionen"))").tag(l.id)
                        }
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
                } header: { Text("Wohin?") }
                if selection == "new" {
                    Section { TextField("Titel der neuen Liste", text: $newTitle) } header: { Text("Neue Liste") }
                }
            } else {
                Section { LoadingView() }
            }
        }
        .meFormStyle()
    }

    private func success(_ r: MeAddSourceResult) -> some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "checklist.checked").font(.wr(size: 44)).foregroundStyle(Color.moss).symbolEffect(.bounce, value: r.listId)
            Text("Auf der Liste").font(.display(26))
            Text("\(Fmt.plural(r.added ?? 0, "Position", "Positionen")) neu, \(r.merged ?? 0) zusammengefasst.").font(.wr(.subheadline)).foregroundStyle(Color.muted)
            Button {
                dismiss()
                let target = r.listId
                Task { try? await Task.sleep(for: .milliseconds(350)); router.open(.shoppingList(id: target)) }
            } label: { Text("Liste öffnen") }
            .primaryButton()
            .padding(.horizontal, 32)
            Spacer()
        }
        .frame(maxWidth: .infinity)
        .background(Color.paper)
    }

    private func load() async {
        do {
            let l: [MeShoppingListSummary] = try await APIClient.shared.get("/shopping-lists")
            lists = l
            error = nil
        } catch { self.error = MeErr.text(error) }
    }

    private func submit() async {
        var body: [String: JSONValue] = ["kind": .string(kind == "TUTORIAL" ? "TUTORIAL" : "PROJECT"), "id": .string(id)]
        if selection == "new" { body["newTitle"] = .string(newTitle.trimmed) } else { body["listId"] = .string(selection) }
        do {
            let r: MeAddSourceResult = try await APIClient.shared.post("/shopping-lists/add-source", body)
            Haptics.success()
            app.show("Materialien übernommen – \(r.added ?? 0) neu, \(r.merged ?? 0) zusammengefasst.")
            withAnimation(.snappy) { result = r }
        } catch { app.show(error: error) }
    }
}
