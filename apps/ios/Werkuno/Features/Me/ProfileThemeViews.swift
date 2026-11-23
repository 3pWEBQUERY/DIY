import SwiftUI

// MARK: - Profil-Design (Creator Pro)

/// Gegenstück zu `packages/shared/src/profile-theme.ts`: Akzentfarbe, Titelbild-Layout, Reihenfolge der Bereiche.
struct ProfileThemeValue: Codable, Hashable, Sendable {
    var accent: String
    var coverLayout: String
    var sections: [String]

    static let standard = ProfileThemeValue(accent: "werkstatt", coverLayout: "wide", sections: ProfileThemeValue.allSections)
    static let allSections = ["projects", "posts", "tutorials", "shop", "articles"]
    static let coverLayouts = ["wide", "framed", "none"]

    static func sectionLabel(_ s: String) -> String {
        switch s {
        case "projects": "Projekte"
        case "posts": "Beiträge"
        case "tutorials": "Anleitungen"
        case "shop": "Shop"
        case "articles": "Blog"
        default: s
        }
    }

    static func coverLabel(_ l: String) -> String {
        switch l {
        case "framed": "Gerahmt"
        case "none": "Ohne"
        default: "Breit"
        }
    }

    var accentColor: Color { ProfileAccent.color(accent) }
}

/// Kuratierte Akzentfarben (hell/dunkel) – dieselben Werte wie im Web
enum ProfileAccent {
    static let keys = ["werkstatt", "moos", "tinte", "pflaume", "ocker", "petrol", "schiefer"]

    static func label(_ k: String) -> String {
        switch k {
        case "moos": "Moos"
        case "tinte": "Tinte"
        case "pflaume": "Pflaume"
        case "ocker": "Ocker"
        case "petrol": "Petrol"
        case "schiefer": "Schiefer"
        default: "Werkstatt"
        }
    }

    static func color(_ k: String) -> Color {
        switch k {
        case "moos": Color.dynamic(light: 0x4A6A39, dark: 0x9CC283)
        case "tinte": Color.dynamic(light: 0x2F5D84, dark: 0x8FB8DE)
        case "pflaume": Color.dynamic(light: 0x7C3F66, dark: 0xD89CC3)
        case "ocker": Color.dynamic(light: 0x86580F, dark: 0xDCAE62)
        case "petrol": Color.dynamic(light: 0x1F6A6A, dark: 0x76C3C1)
        case "schiefer": Color.dynamic(light: 0x4F6475, dark: 0xA8BDCC)
        default: Color.moss
        }
    }
}

private struct ProfileThemeSettings: Decodable {
    var theme: ProfileThemeValue
    var custom: Bool
    var pro: Bool?
}

/// Editor: Farbe, Titelbild, Bereiche (Reihenfolge per Ziehen, aus-/einblenden). Ohne Pro: ausprobieren, nicht speichern.
struct ProfileThemeEditorSheet: View {
    var onSaved: () -> Void = {}
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @Environment(\.dismiss) private var dismiss
    @State private var theme = ProfileThemeValue.standard
    @State private var custom = false
    @State private var pro = false
    @State private var loaded = false

    var body: some View {
        NavigationStack {
            Form {
                if loaded && !pro { proHint }
                accentSection
                coverSection
                sectionsSection
                if custom {
                    Section {
                        AsyncButton { await save(nil) } label: { Text("Standard wiederherstellen") }
                    }
                }
            }
            .environment(\.editMode, .constant(.active))
            .navigationTitle("Profil-Design")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    AsyncButton { await save(theme) } label: { Text("Sichern") }.disabled(!pro)
                }
            }
            .task { await load() }
        }
    }

    private var proHint: some View {
        Section {
            VStack(alignment: .leading, spacing: 6) {
                Text("Gehört zu Creator Pro").font(.wr(.subheadline, .semibold))
                Text("Probier es aus – speichern und auf deinem Profil zeigen geht mit Creator Pro.").font(.wr(.footnote)).foregroundStyle(Color.muted)
                Button("Mit Creator Pro freischalten") { ProUnlock.open(.profilDesign, router: router) { dismiss() } }.font(.wr(.footnote, .semibold))
            }
        }
    }

    private var accentSection: some View {
        Section("Akzentfarbe") {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 10) {
                ForEach(ProfileAccent.keys, id: \.self) { k in accentChip(k) }
            }
            .padding(.vertical, 4)
        }
    }

    private func accentChip(_ k: String) -> some View {
        let on = theme.accent == k
        return Button { theme.accent = k } label: {
            VStack(spacing: 4) {
                Circle().fill(ProfileAccent.color(k)).frame(width: 30, height: 30)
                    .overlay(Circle().strokeBorder(on ? Color.ink : Color.line, lineWidth: on ? 2 : 1).padding(-3))
                Text(ProfileAccent.label(k)).font(.wr(.caption2)).foregroundStyle(Color.ink)
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(ProfileAccent.label(k))
        .accessibilityAddTraits(on ? [.isSelected, .isButton] : .isButton)
    }

    private var coverSection: some View {
        Section("Titelbild") {
            Picker("Titelbild", selection: $theme.coverLayout) {
                ForEach(ProfileThemeValue.coverLayouts, id: \.self) { Text(ProfileThemeValue.coverLabel($0)).tag($0) }
            }
            .pickerStyle(.segmented)
        }
    }

    private var hidden: [String] { ProfileThemeValue.allSections.filter { !theme.sections.contains($0) } }

    private var sectionsSection: some View {
        Section {
            ForEach(theme.sections, id: \.self) { s in
                HStack {
                    Text(ProfileThemeValue.sectionLabel(s))
                    Spacer()
                    if theme.sections.count > 1 {
                        Button { theme.sections.removeAll { $0 == s } } label: { Image(systemName: "eye.slash") }
                            .buttonStyle(.plain).foregroundStyle(Color.muted)
                            .accessibilityLabel("\(ProfileThemeValue.sectionLabel(s)) ausblenden")
                    }
                }
            }
            .onMove { from, to in theme.sections.move(fromOffsets: from, toOffset: to) }
            ForEach(hidden, id: \.self) { s in
                Button { theme.sections.append(s) } label: {
                    Label("\(ProfileThemeValue.sectionLabel(s)) einblenden", systemImage: "eye")
                }
            }
        } header: {
            Text("Bereiche und Reihenfolge")
        } footer: {
            Text("Der erste Bereich öffnet sich beim Besuch. Bereiche ohne Inhalte bleiben ohnehin verborgen.")
        }
    }

    private func load() async {
        do {
            let s: ProfileThemeSettings = try await APIClient.shared.get("/me/profile-theme")
            theme = s.theme
            custom = s.custom
            pro = s.pro ?? false
        } catch { app.show(error: error) }
        loaded = true
    }

    private func save(_ value: ProfileThemeValue?) async {
        let body: [String: ProfileThemeValue?] = ["theme": value]
        let ok = await app.run(value == nil ? "Standard-Design wiederhergestellt." : "Profil-Design gespeichert.") {
            let s: ProfileThemeSettings = try await APIClient.shared.put("/me/profile-theme", body)
            theme = s.theme
            custom = s.custom
        }
        if ok { onSaved(); dismiss() }
    }
}

// MARK: - Wortfilter für Kommentare (Creator Pro)

private struct CommentFilterSettings: Decodable {
    var words: [String]
    var pro: Bool?
}

/// Ergebnis von „Bestehende Kommentare prüfen“ (`dryRun` zählt nur)
private struct RetroFilterResult: Decodable {
    var matched: Int
    var hidden: Int
    var scanned: Int
    var limited: Bool?
}

struct CommentFilterSheet: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var pro = false
    @State private var loaded = false
    /// Gespeicherte Wortliste (rückwirkend wirkt nur, was gespeichert ist)
    @State private var savedCount = 0
    @State private var retro: RetroFilterResult?

    var body: some View {
        NavigationStack {
            Form {
                if loaded && !pro {
                    Section {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Der Wortfilter gehört zu Creator Pro").font(.wr(.subheadline, .semibold))
                            Button("Mit Creator Pro freischalten") { ProUnlock.open(.kommentare, router: router) { dismiss() } }
                                .font(.wr(.footnote, .semibold))
                        }
                    }
                }
                Section {
                    TextField("Ein Wort oder eine Wortfolge pro Zeile", text: $text, axis: .vertical)
                        .lineLimit(5...14)
                        .textInputAutocapitalization(.never)
                        .disabled(!pro)
                } footer: {
                    Text("Neue Kommentare unter deinen Inhalten mit einem dieser Wörter werden ausgeblendet – die Person sieht ihren Kommentar weiterhin, alle anderen nicht. Gross-/Kleinschreibung und Umlaute spielen keine Rolle; Wörter ab 4 Zeichen treffen auch als Teil längerer Wörter.")
                }
                retroSection
            }
            .confirmationDialog(retroTitle, isPresented: Binding(get: { (retro?.matched ?? 0) > 0 }, set: { if !$0 { retro = nil } }), titleVisibility: .visible) {
                Button("Ausblenden", role: .destructive) { Task { await applyRetro() } }
            } message: {
                Text("Ausgeblendet sehen nur die jeweilige Person und du sie. Unter Studio → Kommentare kannst du sie jederzeit wieder einblenden.")
            }
            .navigationTitle("Wortfilter")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    AsyncButton { await save() } label: { Text("Sichern") }.disabled(!pro)
                }
            }
            .task { await load() }
        }
    }

    private var retroSection: some View {
        Section {
            AsyncButton { await checkRetro() } label: {
                Label("Bestehende Kommentare prüfen", systemImage: "text.magnifyingglass")
            }
            .disabled(!pro || savedCount == 0)
        } footer: {
            Text(savedCount == 0 && pro ? "Speichere zuerst mindestens ein Wort." : "Wendet die gespeicherte Wortliste auch auf bisherige Kommentare an. Du siehst vorher, wie viele es betrifft.")
        }
    }

    private var retroTitle: String {
        let n = retro?.matched ?? 0
        return n == 1 ? "1 Kommentar ausblenden?" : "\(n) Kommentare ausblenden?"
    }

    private func checkRetro() async {
        do {
            let r: RetroFilterResult = try await APIClient.shared.post("/studio/comment-filter/apply", ["dryRun": JSONValue.bool(true)])
            if r.matched == 0 {
                app.show(r.scanned == 0 ? "Unter deinen Inhalten gibt es noch keine Kommentare zum Prüfen." : "Keine bestehenden Kommentare treffen deinen Wortfilter.")
            } else {
                retro = r
            }
        } catch { app.show(error: error) }
    }

    private func applyRetro() async {
        retro = nil
        do {
            let r: RetroFilterResult = try await APIClient.shared.post("/studio/comment-filter/apply", ["dryRun": JSONValue.bool(false)])
            app.show(r.hidden == 1 ? "1 Kommentar ausgeblendet." : "\(r.hidden) Kommentare ausgeblendet.")
        } catch { app.show(error: error) }
    }

    private var words: [String] {
        text.split(whereSeparator: { $0 == "\n" || $0 == "," || $0 == ";" })
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { $0.count >= 2 }
    }

    private func load() async {
        do {
            let s: CommentFilterSettings = try await APIClient.shared.get("/studio/comment-filter")
            text = s.words.joined(separator: "\n")
            savedCount = s.words.count
            pro = s.pro ?? false
        } catch { app.show(error: error) }
        loaded = true
    }

    private func save() async {
        let ok = await app.run("Wortfilter gespeichert.") {
            let s: CommentFilterSettings = try await APIClient.shared.put("/studio/comment-filter", ["words": words])
            text = s.words.joined(separator: "\n")
        }
        if ok { dismiss() }
    }
}
