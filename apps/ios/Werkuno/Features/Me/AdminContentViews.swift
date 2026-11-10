import SwiftUI

// MARK: - Moderation → Inhalte (Web: `/admin/inhalte`)
// Projekte und Anleitungen hervorheben bzw. ausblenden. Jeder Eingriff ist begründet und protokolliert.

struct MeAdminContentRow: Decodable, Sendable, Identifiable, Hashable {
    struct Person: Decodable, Sendable, Hashable {
        struct Profile: Decodable, Sendable, Hashable { var handle: String?; var displayName: String? }
        var profile: Profile?
    }
    var id: String
    var title: String
    var slug: String
    var category: String?
    var status: String?
    var state: String
    var visibility: String?
    var isFeatured: Bool?
    var isPaid: Bool?
    var viewCount: Int?
    var saveCount: Int?
    var updatedAt: Date?
    var owner: Person?
    var author: Person?

    var handle: String? { (owner ?? author)?.profile?.handle }
}

struct MeAdminContentPage: Decodable, Sendable {
    var rows: [MeAdminContentRow]
    var total: Int
    var page: Int
    var pages: Int
}

enum MeAdminContentKind: String, CaseIterable, Hashable {
    case projects, tutorials
    var label: String { self == .projects ? "Projekte" : "Anleitungen" }
}

enum MeContentStateLabels {
    static let states = ["PUBLISHED", "DRAFT", "HIDDEN", "REMOVED"]
    static func label(_ s: String) -> String {
        switch s {
        case "PUBLISHED": "Veröffentlicht"
        case "DRAFT": "Entwurf"
        case "HIDDEN": "Ausgeblendet"
        case "REMOVED": "Entfernt"
        case "SCHEDULED": "Geplant"
        default: s
        }
    }
    static func tone(_ s: String) -> MeStatePill.Tone {
        switch s {
        case "PUBLISHED": .moss
        case "HIDDEN": .warn
        case "REMOVED": .danger
        default: .neutral
        }
    }
}

private struct MeHideTarget: Identifiable {
    var row: MeAdminContentRow
    var hide: Bool
    var id: String { "\(row.id)-\(hide)" }
}

struct MeAdminContentList: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @State private var kind: MeAdminContentKind = .projects
    @State private var query = ""
    @State private var submitted = ""
    @State private var state = ""
    @State private var rows: [MeAdminContentRow]?
    @State private var total = 0
    @State private var page = 1
    @State private var pages = 1
    @State private var error: String?
    @State private var hideTarget: MeHideTarget?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Picker("Art", selection: $kind) {
                ForEach(MeAdminContentKind.allCases, id: \.self) { Text($0.label).tag($0) }
            }
            .pickerStyle(.segmented)
            HStack(spacing: 8) {
                HStack {
                    Image(systemName: "magnifyingglass").foregroundStyle(Color.muted)
                    TextField("Titel, @handle oder ID", text: $query)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                        .submitLabel(.search)
                        .onSubmit { submitted = query.trimmed }
                }
                .padding(.horizontal, 12).padding(.vertical, 9)
                .background(Color.sunken, in: Capsule())
                Menu {
                    Picker("Zustand", selection: $state) {
                        Text("Alle Zustände").tag("")
                        ForEach(MeContentStateLabels.states, id: \.self) { Text(MeContentStateLabels.label($0)).tag($0) }
                    }
                } label: {
                    Image(systemName: state.isEmpty ? "line.3.horizontal.decrease.circle" : "line.3.horizontal.decrease.circle.fill")
                        .font(.wr(.title3)).frame(width: 44, height: 44)
                }
                .accessibilityLabel("Zustand filtern")
            }
            Text("Für Regelverstösse besser einen Moderationsfall nutzen. Entfernen ist der Administration im Web vorbehalten.")
                .font(.wr(.caption)).foregroundStyle(Color.muted)
            MePhase(value: rows, error: error, retry: { await load(reset: true) }) { rows in
                if rows.isEmpty {
                    EmptyStateView(symbol: "tray", title: kind == .projects ? "Keine Projekte gefunden" : "Keine Anleitungen gefunden")
                } else {
                    LazyVStack(spacing: 0) {
                        ForEach(rows) { r in row(r).hairline() }
                        LoadMoreTrigger(hasMore: page < pages) { await load(reset: false) }
                    }
                    .cardSurface()
                    Text(Fmt.plural(total, "Eintrag", "Einträge")).font(.wr(.caption)).foregroundStyle(Color.muted)
                }
            }
        }
        .task(id: "\(kind.rawValue)|\(submitted)|\(state)") { await load(reset: true) }
        .sheet(item: $hideTarget) { t in
            MeContentHideSheet(kind: kind, row: t.row, hide: t.hide) { await load(reset: true) }
                .meSheetEnvironment(app, router)
        }
    }

    private func row(_ r: MeAdminContentRow) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Button { open(r) } label: {
                VStack(alignment: .leading, spacing: 4) {
                    Text(r.title).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink).lineLimit(2).multilineTextAlignment(.leading)
                    HStack(spacing: 6) {
                        MeStatePill(text: MeContentStateLabels.label(r.state), tone: MeContentStateLabels.tone(r.state))
                        if r.isFeatured == true { MeStatePill(text: "Hervorgehoben", tone: .clay) }
                        if r.visibility != nil && r.visibility != "PUBLIC" { MeStatePill(text: "Nicht öffentlich", tone: .slate) }
                    }
                    Text([r.handle.map { "@\($0)" }, r.category.map { app.categoryShort($0) }, r.isPaid == true ? "kostenpflichtig" : nil, r.updatedAt.map { Fmt.date($0) }]
                        .compactMap { $0 }.joined(separator: " · "))
                        .font(.wr(.caption)).foregroundStyle(Color.muted).lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .disabled(r.state == "REMOVED")
            Menu {
                if r.state == "PUBLISHED" && (kind == .tutorials || r.visibility == "PUBLIC") {
                    Button(r.isFeatured == true ? "Nicht mehr hervorheben" : "Hervorheben", systemImage: r.isFeatured == true ? "star.slash" : "star") {
                        Task { await setFeatured(r, !(r.isFeatured ?? false)) }
                    }
                }
                if r.state == "PUBLISHED" {
                    Button("Ausblenden …", systemImage: "eye.slash", role: .destructive) { hideTarget = MeHideTarget(row: r, hide: true) }
                }
                if r.state == "HIDDEN" {
                    Button("Wieder anzeigen …", systemImage: "eye") { hideTarget = MeHideTarget(row: r, hide: false) }
                }
                Button("Im Web-Admin verwalten", systemImage: "safari") {
                    router.open(.web(path: "/admin/inhalte/\(kind == .projects ? "projekte" : "anleitungen")/\(r.id)"))
                }
            } label: {
                Image(systemName: "ellipsis.circle").font(.wr(.title3)).foregroundStyle(Color.ink).frame(width: 44, height: 44)
            }
            .accessibilityLabel("Aktionen für \(r.title)")
        }
        .padding(.leading, 12).padding(.vertical, 6).padding(.trailing, 4)
    }

    private func open(_ r: MeAdminContentRow) {
        switch kind {
        case .projects: if let h = r.handle { router.open(.project(handle: h, slug: r.slug)) }
        case .tutorials: router.open(.tutorial(slug: r.slug))
        }
    }

    private func load(reset: Bool) async {
        let next = reset ? 1 : page + 1
        do {
            let r: MeAdminContentPage = try await APIClient.shared.get("/admin/content/\(kind.rawValue)", query: ["q": submitted.nilIfEmpty, "state": state.nilIfEmpty, "page": String(next)])
            rows = reset ? r.rows : (rows ?? []) + r.rows
            total = r.total; page = r.page; pages = r.pages
            error = nil
        } catch is CancellationError {
        } catch { if reset { self.error = MeErr.text(error); rows = nil } else { pages = page; app.show(error: error) } }
    }

    private func setFeatured(_ r: MeAdminContentRow, _ on: Bool) async {
        let ok = await app.run(on ? "Hervorgehoben." : "Nicht mehr hervorgehoben.") {
            _ = try await APIClient.shared.post("/admin/content/\(kind.rawValue)/\(r.id)/featured", ["featured": JSONValue.bool(on)]) as JSONValue
        }
        if ok, let i = rows?.firstIndex(where: { $0.id == r.id }) { rows?[i].isFeatured = on }
    }
}

private struct MeContentHideSheet: View {
    var kind: MeAdminContentKind
    var row: MeAdminContentRow
    var hide: Bool
    var onDone: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var app
    @State private var reason = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(row.title).font(.wr(.subheadline, .semibold))
                } footer: {
                    Text(hide ? "Der Inhalt ist danach nur noch für die Person selbst sichtbar. Für Regelverstösse besser einen Moderationsfall nutzen." : "Der Inhalt wird wieder öffentlich angezeigt.")
                }
                Section {
                    TextField("Begründung (mind. 5 Zeichen)", text: $reason, axis: .vertical).lineLimit(2...6)
                } header: { Text("Begründung") } footer: {
                    Text("Wird protokolliert und der Person in der Benachrichtigung angezeigt.")
                }
            }
            .meFormStyle()
            .navigationTitle(hide ? "Inhalt ausblenden" : "Inhalt wieder anzeigen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    AsyncButton(hide ? "Ausblenden" : "Anzeigen") { await submit() }.disabled(reason.trimmed.count < 5)
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func submit() async {
        let ok = await app.run(hide ? "Inhalt ausgeblendet." : "Inhalt wieder sichtbar.") {
            _ = try await APIClient.shared.post("/admin/content/\(kind.rawValue)/\(row.id)/hidden", ["hidden": JSONValue.bool(hide), "reason": .string(reason.trimmed)]) as JSONValue
        }
        if ok { await onDone(); dismiss() }
    }
}

// MARK: - Nutzer:in → E-Mail-Adresse ändern (nur Administration, `PUT /admin/users/:id/email`)

enum MeRoleRank {
    static func rank(_ role: String?) -> Int {
        switch role {
        case "SUPERADMIN": 3
        case "ADMIN": 2
        case "PLATFORM_MODERATOR": 1
        default: 0
        }
    }
}

struct MeAdminEmailSheet: View {
    var userId: String
    var current: String
    var canMarkVerified: Bool
    var onDone: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var app
    @State private var email = ""
    @State private var reason = ""
    @State private var markVerified = false
    @State private var fields: [String: String] = [:]
    @State private var errorText: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("name@beispiel.ch", text: $email)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    if let e = fields["email"] { Text(e).font(.wr(.caption)).foregroundStyle(Color.danger) }
                } header: { Text("Neue E-Mail-Adresse") } footer: { Text("Aktuell: \(current)") }
                Section {
                    TextField("Begründung (mind. 10 Zeichen)", text: $reason, axis: .vertical).lineLimit(3...6)
                    if let e = fields["reason"] { Text(e).font(.wr(.caption)).foregroundStyle(Color.danger) }
                } header: { Text("Begründung (intern, im Audit-Protokoll)") } footer: {
                    Text("Zum Beispiel Ticketnummer und wie die Identität geprüft wurde.")
                }
                if canMarkVerified {
                    Section {
                        Toggle("Neue Adresse direkt als bestätigt markieren", isOn: $markVerified).tint(.moss)
                    } footer: {
                        Text("Nur wenn sie nachweislich der Person gehört – sonst geht ein Bestätigungslink an die neue Adresse.")
                    }
                }
                Section {
                    NoticeView(tone: .warn, message: "Die Person meldet sich danach mit der neuen Adresse an; alle ihre Sitzungen werden beendet. Die alte Adresse erhält eine Sicherheitsmeldung, offene Bestätigungs- und Passwort-Links verfallen.")
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                }
                if let errorText {
                    Section { Text(errorText).font(.wr(.subheadline)).foregroundStyle(Color.danger) }
                }
            }
            .meFormStyle()
            .navigationTitle("E-Mail-Adresse ändern")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    AsyncButton("Ändern") { await submit() }
                        .disabled(!email.contains("@") || reason.trimmed.count < 10)
                }
            }
        }
    }

    private func submit() async {
        fields = [:]
        errorText = nil
        do {
            _ = try await APIClient.shared.put("/admin/users/\(userId)/email", ["email": JSONValue.string(email.trimmed), "reason": .string(reason.trimmed), "markVerified": .bool(canMarkVerified && markVerified)]) as JSONValue
            app.show("E-Mail-Adresse geändert.")
            await onDone()
            dismiss()
        } catch let e as APIError {
            if let f = e.fields, !f.isEmpty { fields = f } else { errorText = e.message }
            Haptics.warning()
        } catch {
            app.show(error: error)
        }
    }
}
