import SwiftUI

// MARK: - Community gründen / bearbeiten (communityUpsertSchema)

struct CommunityEditorSheet: View {
    var slug: String? = nil

    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @Environment(\.dismiss) private var dismiss

    @State private var loaded = false
    @State private var loadError: String?
    @State private var communityId: String?
    @State private var name = ""
    @State private var slugText = ""
    @State private var slugTouched = false
    @State private var description = ""
    @State private var category = ""
    @State private var visibility = "PUBLIC"
    @State private var region = ""
    @State private var coverURL: String?
    @State private var coverMediaId: String?
    @State private var coverRemoved = false
    @State private var rules: [CommunityRule] = []
    @State private var originalRules: [CommunityRule] = []
    @State private var fields: [String: String] = [:]
    @State private var saving = false

    private var isEdit: Bool { slug != nil }

    private var valid: Bool {
        name.trimmed.count >= 3 && !category.isEmpty && (isEdit || slugText.isEmpty || slugText.count >= 3)
    }

    var body: some View {
        NavigationStack {
            Group {
                if loaded {
                    form
                } else if let loadError {
                    ErrorStateView(message: loadError) { await load() }
                } else {
                    LoadingView()
                }
            }
            .background(Color.paper)
            .navigationTitle(isEdit ? "Community bearbeiten" : "Community gründen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    AsyncButton(isEdit ? "Sichern" : "Gründen") { await save() }
                        .fontWeight(.semibold)
                        .disabled(!valid || saving)
                }
            }
            .task { if !loaded { await load() } }
        }
    }

    private func load() async {
        guard let slug else {
            category = app.me?.profile?.categories?.first ?? app.activeCategories.first?.slug ?? ""
            loaded = true
            return
        }
        do {
            let p: CommunityPagePayload = try await APIClient.shared.get("/communities/by-slug/\(slug)")
            let c = p.community
            communityId = c.id
            name = c.name
            slugText = c.slug
            description = c.description ?? ""
            category = c.category ?? ""
            visibility = c.visibility
            region = c.region ?? ""
            coverURL = c.coverUrl
            rules = c.rules ?? []
            originalRules = rules
            loaded = true
        } catch {
            loadError = (error as? APIError)?.message ?? error.localizedDescription
        }
    }

    private var form: some View {
        Form {
            Section {
                ZStack(alignment: .bottomTrailing) {
                    CoverView(url: coverRemoved ? nil : coverURL, seed: communityId ?? (name.nilIfEmpty ?? "neu"), category: category.nilIfEmpty)
                        .frame(height: 160)
                        .frame(maxWidth: .infinity)
                        .clipShape(.rect(cornerRadius: Radius.inner, style: .continuous))
                    HStack(spacing: 8) {
                        if coverURL != nil && !coverRemoved {
                            Button { coverRemoved = true; coverMediaId = nil } label: { Image(systemName: "trash") }
                                .buttonStyle(.glass)
                                .accessibilityLabel("Titelbild entfernen")
                        }
                        SingleImagePicker(onUploaded: { id, url in
                            coverMediaId = id
                            coverURL = url
                            coverRemoved = false
                        }) {
                            Label(coverURL == nil || coverRemoved ? "Titelbild wählen" : "Ändern", systemImage: "photo")
                                .font(.wr(.footnote, .semibold))
                                .padding(.horizontal, 12).padding(.vertical, 8)
                                .glassEffect(.regular.interactive(), in: Capsule())
                        }
                    }
                    .padding(10)
                }
                .listRowInsets(EdgeInsets(top: 8, leading: 8, bottom: 8, trailing: 8))
            } footer: { Text("Ohne Foto erhält deine Community eine eigene Faden-Tafel in der Kategoriefarbe.") }

            Section {
                TextField("Name, z. B. „Häkelkreis Zürich“", text: $name)
                    .onChange(of: name) { _, v in if !isEdit && !slugTouched { slugText = Self.slugify(v) } }
                DiscoverFieldError(message: fields["name"])
                if !isEdit {
                    HStack(spacing: 2) {
                        Text("/c/").foregroundStyle(Color.muted).font(.wr(.body).monospaced())
                        TextField("adresse", text: Binding(get: { slugText }, set: { slugText = Self.slugify($0, keepTrailingDash: true); slugTouched = true }))
                            .font(.wr(.body).monospaced())
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                    }
                    DiscoverFieldError(message: fields["slug"])
                }
                TextField("Worum geht es? Wer ist willkommen?", text: $description, axis: .vertical)
                    .lineLimit(3...10)
                DiscoverFieldError(message: fields["description"])
            } header: { Text("Grundlagen") } footer: {
                if !isEdit { Text("Die Adresse kann später nicht mehr geändert werden.") }
            }

            Section {
                Picker("Kategorie", selection: $category) {
                    if category.isEmpty { Text("Bitte wählen").tag("") }
                    ForEach(app.activeCategories) { c in
                        Label(c.name, systemImage: CategoryPalette.symbol(for: c.glyph)).tag(c.slug)
                    }
                }
                DiscoverFieldError(message: fields["category"])
                TextField("Region (optional), z. B. „Zürich“", text: $region)
            } header: { Text("Einordnung") }

            Section {
                Picker("Sichtbarkeit", selection: $visibility) {
                    ForEach(L.communityVisibility, id: \.key) { v in Text(v.label).tag(v.key) }
                }
                .pickerStyle(.inline)
                .labelsHidden()
            } header: { Text("Sichtbarkeit") } footer: { Text(visibilityHint) }

            Section {
                ForEach($rules) { $r in
                    VStack(alignment: .leading, spacing: 6) {
                        TextField("Regel", text: $r.title).font(.wr(.headline))
                        TextField("Erläuterung (optional)", text: $r.body, axis: .vertical).font(.wr(.subheadline)).lineLimit(1...4)
                    }
                }
                .onDelete { rules.remove(atOffsets: $0) }
                .onMove { rules.move(fromOffsets: $0, toOffset: $1) }
                Button { rules.append(CommunityRule(title: "", body: "")) } label: { Label("Regel hinzufügen", systemImage: "plus") }
                    .disabled(rules.count >= 20)
            } header: { Text("Regeln") } footer: { Text("Kurz und freundlich – z. B. „Kritik am Werk, nie an der Person.“ Höchstens 20.") }
        }
        .scrollContentBackground(.hidden)
    }

    private var visibilityHint: String {
        switch visibility {
        case "REQUEST": "Alle sehen Name und Beschreibung. Beiträge sehen nur Mitglieder – die Moderation nimmt Anfragen an."
        case "PRIVATE": "Nur Mitglieder sehen Inhalte. Neue Mitglieder kommen ausschliesslich per Einladung dazu."
        default: "Alle können Beiträge lesen und sofort beitreten."
        }
    }

    static func slugify(_ s: String, keepTrailingDash: Bool = false) -> String {
        let map: [Character: String] = ["ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss", "é": "e", "è": "e", "à": "a", "ç": "c"]
        var out = ""
        for ch in s.lowercased() {
            if let m = map[ch] { out += m }
            else if ch.isASCII && (ch.isLetter || ch.isNumber) { out.append(ch) }
            else if !out.hasSuffix("-") && !out.isEmpty { out.append("-") }
        }
        if !keepTrailingDash { while out.hasSuffix("-") { out.removeLast() } }
        return String(out.prefix(48))
    }

    private func save() async {
        saving = true
        defer { saving = false }
        fields = [:]
        var body: [String: JSONValue] = [
            "name": .string(name.trimmed),
            "description": .string(description.trimmed),
            "category": .string(category),
            "visibility": .string(visibility),
            "region": .string(region.trimmed),
        ]
        if let coverMediaId { body["coverMediaId"] = .string(coverMediaId) } else if coverRemoved { body["coverMediaId"] = .null }
        let cleanRules = rules.filter { !$0.title.trimmed.isEmpty }
        let rulesJSON: JSONValue = .array(cleanRules.map { ["title": .string($0.title.trimmed), "body": .string($0.body.trimmed)] })
        do {
            if let communityId {
                _ = try await APIClient.shared.patch("/communities/\(communityId)", body) as JSONValue
                if cleanRules.map({ [$0.title, $0.body] }) != originalRules.map({ [$0.title, $0.body] }) {
                    _ = try await APIClient.shared.put("/communities/\(communityId)/rules", ["rules": rulesJSON]) as JSONValue
                }
                app.show("Einstellungen gespeichert.")
                dismiss()
            } else {
                if let s = slugText.trimmingCharacters(in: CharacterSet(charactersIn: "-")).nilIfEmpty { body["slug"] = .string(s) }
                body["rules"] = rulesJSON
                let r: CommunityCreated = try await APIClient.shared.post("/communities", body)
                app.show("Deine Community ist gegründet!")
                Haptics.success()
                dismiss()
                try? await Task.sleep(for: .milliseconds(350))
                router.open(.community(slug: r.slug))
            }
        } catch let e as APIError {
            fields = e.fields ?? [:]
            app.show(error: e)
        } catch {
            app.show(error: error)
        }
    }
}
