import SwiftUI
import UserNotifications

// MARK: - Übersicht

struct SettingsView: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                PageTitle(kicker: "Einstellungen", title: "Dein Konto", subtitle: app.me.map { "Angemeldet als \($0.email)" })
                MeGroup(title: "Profil & Konto") {
                    row(.profile, "Name, Handle, Bio, Bilder, Links")
                    row(.account, "E-Mail, Passwort, Datenexport, Löschen")
                    row(.security, "Angemeldete Geräte, Ereignisse")
                }
                MeGroup(title: "Erlebnis") {
                    row(.notifications, "In-App, E-Mail, Push")
                    row(.feed, "Interessen, Stummgeschaltete, Ausgeblendetes")
                    row(.privacy, "Nachrichten, Bewegung, Blockierte")
                }
                MeGroup(title: "Hilfe") {
                    row(.support, "Anfrage an das Team, Richtlinien")
                }
                MeGroup(title: "Technik") {
                    row(.developer, AppConfig.environment.label)
                }
                VStack(spacing: 4) {
                    Wordmark(size: 15)
                    Text(MeAppInfo.version).font(.caption2).foregroundStyle(Color.muted)
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 6)
            }
            .padding(.horizontal, Space.gutter)
            .padding(.bottom, 40)
        }
        .background(Color.paper)
        .navigationTitle("Einstellungen")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func row(_ s: SettingsSection, _ subtitle: String) -> some View {
        MeNavRow(symbol: s.symbol, title: s.title, subtitle: subtitle) { router.open(.settingsSection(s)) }
    }
}

enum MeAppInfo {
    static var version: String {
        let v = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
        let b = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
        return "Version \(v) (\(b))"
    }
}

struct SettingsSectionView: View {
    var section: SettingsSection
    var body: some View {
        Group {
            switch section {
            case .profile: MeProfileSettings()
            case .account: MeAccountSettings()
            case .security: MeSecuritySettings()
            case .notifications: MeNotificationSettingsView()
            case .feed: MeFeedSettingsView()
            case .privacy: MePrivacySettingsView()
            case .support: MeSupportView()
            case .developer: MeDeveloperSettings()
            }
        }
        .navigationTitle(section.title)
        .navigationBarTitleDisplayMode(.inline)
        .background(Color.paper)
    }
}

// MARK: - Profil

private struct MeEditableLink: Identifiable, Hashable {
    var id = UUID()
    var label = ""
    var url = ""
}

private struct MeProfileSettings: View {
    @Environment(AppState.self) private var app
    @State private var loaded: MeSettingsProfile?
    @State private var error: String?

    @State private var displayName = ""
    @State private var handle = ""
    @State private var bio = ""
    @State private var region = ""
    @State private var country = "CH"
    @State private var website = ""
    @State private var pronouns = ""
    @State private var links: [MeEditableLink] = []
    @State private var categories: [String] = []
    @State private var avatarId: String?
    @State private var avatarURL: String?
    @State private var coverId: String?
    @State private var coverURL: String?
    @State private var removeAvatar = false
    @State private var removeCover = false
    @State private var handleStatus: (ok: Bool, text: String)?
    @State private var fields: [String: String] = [:]

    var body: some View {
        MePhase(value: loaded, error: error, retry: load) { _ in form }
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    AsyncButton("Sichern") { await save() }
                        .disabled(loaded == nil || displayName.trimmed.isEmpty || bio.count > 500 || handleStatus?.ok == false)
                }
            }
            .task { if loaded == nil { await load() } }
            .task(id: handle) { await checkHandle() }
    }

    private var form: some View {
        Form {
            Section {
                VStack(alignment: .leading, spacing: 12) {
                    CoverView(url: removeCover ? nil : coverURL, seed: loaded?.userId ?? handle, category: categories.first, showLabel: false)
                        .frame(height: 120)
                        .frame(maxWidth: .infinity)
                        .clipShape(.rect(cornerRadius: Radius.inner, style: .continuous))
                        .overlay(alignment: .bottomLeading) {
                            AvatarView(url: removeAvatar ? nil : avatarURL, name: displayName.nilIfEmpty ?? "?", size: 64, category: categories.first)
                                .padding(3).background(Color.card, in: Circle())
                                .offset(x: 12, y: 24)
                        }
                        .padding(.bottom, 24)
                    HStack(spacing: 8) {
                        SingleImagePicker(onUploaded: { id, url in avatarId = id; avatarURL = url; removeAvatar = false }) {
                            Label("Profilbild", systemImage: "person.crop.circle.badge.plus").font(.subheadline.weight(.semibold))
                        }
                        .buttonStyle(.glass)
                        SingleImagePicker(onUploaded: { id, url in coverId = id; coverURL = url; removeCover = false }) {
                            Label("Titelbild", systemImage: "photo.badge.plus").font(.subheadline.weight(.semibold))
                        }
                        .buttonStyle(.glass)
                    }
                    HStack(spacing: 16) {
                        if avatarURL != nil && !removeAvatar { Button("Profilbild entfernen", role: .destructive) { avatarId = nil; removeAvatar = true }.font(.caption) }
                        if coverURL != nil && !removeCover { Button("Titelbild entfernen", role: .destructive) { coverId = nil; removeCover = true }.font(.caption) }
                    }
                    .buttonStyle(.borderless)
                }
                .padding(.vertical, 4)
            } header: { Text("Bilder") } footer: { Text("Ohne Foto zeigen wir eine generative Tafel in deiner Kategorie-Farbe.") }

            Section {
                TextField("Anzeigename", text: $displayName).textContentType(.name)
                if let e = fields["displayName"] { fieldError(e) }
                HStack(spacing: 2) {
                    Text("@").foregroundStyle(Color.muted)
                    TextField("handle", text: $handle)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .textContentType(.username)
                        .onChange(of: handle) { _, v in let l = v.lowercased(); if l != v { handle = l } }
                }
                if let s = handleStatus {
                    Label(s.text, systemImage: s.ok ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
                        .font(.caption).foregroundStyle(s.ok ? Color.moss : Color.danger)
                }
                if let e = fields["handle"] { fieldError(e) }
            } header: { Text("Name & Handle") } footer: {
                Text("Dein Profil: \(AppConfig.webURL("/u/\(handle)").absoluteString). Alte Handles leiten weiter. Höchstens drei Änderungen in 30 Tagen.")
            }

            Section {
                TextField("Erzähl kurz, was du machst", text: $bio, axis: .vertical).lineLimit(3...10)
                MeCharCounter(count: bio.count, max: 500)
                TextField("Pronomen (optional)", text: $pronouns)
            } header: { Text("Über dich") }

            Section {
                TextField("Region, z. B. Zürich", text: $region)
                Picker("Land", selection: $country) {
                    ForEach(L.profileCountries, id: \.key) { Text($0.label).tag($0.key) }
                }
            } header: { Text("Ort") }

            Section {
                TextField("Website", text: $website)
                    .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                if let e = fields["website"] { fieldError(e) }
                ForEach($links) { $l in
                    VStack(spacing: 6) {
                        HStack {
                            TextField("Bezeichnung, z. B. Instagram", text: $l.label)
                            Button(role: .destructive) { withAnimation { links.removeAll { $0.id == l.id } } } label: { Image(systemName: "minus.circle.fill") }
                                .buttonStyle(.borderless)
                                .accessibilityLabel("Link entfernen")
                        }
                        TextField("https://…", text: $l.url)
                            .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                            .font(.subheadline)
                    }
                }
                if links.count < 6 {
                    Button { withAnimation { links.append(MeEditableLink()) } } label: { Label("Link hinzufügen", systemImage: "plus.circle") }
                }
                if let e = fields["links"] { fieldError(e) }
            } header: { Text("Website & Links") } footer: { Text("Bis zu 6 Links. „https://“ ergänzen wir automatisch.") }

            Section {
                MeCategoryPicker(categories: app.activeCategories, selection: $categories)
                    .padding(.vertical, 6)
            } header: { Text("Kategorien") } footer: { Text("Worin arbeitest du? Erscheint auf deinem Profil und hilft bei Empfehlungen.") }
        }
        .meFormStyle()
    }

    private func fieldError(_ e: String) -> some View { Text(e).font(.caption).foregroundStyle(Color.danger) }

    private func load() async {
        do {
            let p: MeSettingsProfile = try await APIClient.shared.get("/settings/profile")
            displayName = p.displayName; handle = p.handle; bio = p.bio ?? ""; region = p.region ?? ""; country = p.country ?? "CH"
            website = p.website ?? ""; pronouns = p.pronouns ?? ""; categories = p.categories ?? []
            links = (p.links ?? []).map { MeEditableLink(label: $0.label ?? "", url: $0.url ?? "") }
            avatarURL = p.avatarUrl; coverURL = p.coverUrl; avatarId = nil; coverId = nil; removeAvatar = false; removeCover = false
            loaded = p
            error = nil
        } catch { self.error = MeErr.text(error) }
    }

    private func checkHandle() async {
        let h = handle.trimmed.lowercased()
        guard let loaded, h != loaded.handle else { handleStatus = nil; return }
        guard h.count >= 3 else { handleStatus = (false, "Mindestens 3 Zeichen"); return }
        try? await Task.sleep(for: .milliseconds(400))
        guard !Task.isCancelled else { return }
        do {
            let r: MeHandleCheck = try await APIClient.shared.post("/settings/handle-check", ["handle": JSONValue.string(h)])
            handleStatus = r.ok ? (true, "@\(r.handle ?? h) ist frei") : (false, r.reason ?? "Nicht verfügbar")
        } catch { handleStatus = nil }
    }

    private func save() async {
        let cleanLinks = links.filter { !$0.url.trimmed.isEmpty || !$0.label.trimmed.isEmpty }
        var body: [String: JSONValue] = [
            "displayName": .string(displayName.trimmed), "handle": .string(handle.trimmed.lowercased()), "bio": .string(bio.trimmed),
            "region": .string(region.trimmed), "country": .string(country), "website": .string(website.trimmed), "pronouns": .string(pronouns.trimmed),
            "links": .array(cleanLinks.map { ["label": .string($0.label.trimmed), "url": .string($0.url.trimmed)] }),
            "categories": .from(categories),
        ]
        if let avatarId { body["avatarMediaId"] = .string(avatarId) }
        if let coverId { body["coverMediaId"] = .string(coverId) }
        if removeAvatar { body["removeAvatar"] = true }
        if removeCover { body["removeCover"] = true }
        do {
            _ = try await APIClient.shared.put("/settings/profile", body) as JSONValue
            fields = [:]
            app.show("Profil gesichert.")
            Haptics.success()
            await app.refresh()
            await load()
        } catch {
            fields = (error as? APIError)?.fields ?? [:]
            app.show(error: error)
        }
    }
}

// MARK: - Konto

private struct MeAccountSettings: View {
    @Environment(AppState.self) private var app
    @State private var data: MeAccountOverview?
    @State private var error: String?
    @State private var current = ""
    @State private var next = ""
    @State private var confirm = ""
    @State private var exportURL: URL?
    @State private var exporting = false
    @State private var showDelete = false
    @State private var pwErrors: [String: String] = [:]

    var body: some View {
        MePhase(value: data, error: error, retry: load) { a in form(a) }
            .task { if data == nil { await load() } }
            .sheet(isPresented: $showDelete) {
                MeDeleteAccountSheet(hasPassword: data?.hasPassword ?? true, hasShop: data?.hasShop ?? false, orderCount: data?.orderCount ?? 0)
                    .environment(app)
                    .toastOverlay()
            }
    }

    private func form(_ a: MeAccountOverview) -> some View {
        Form {
            Section {
                HStack {
                    Text(a.email).font(.system(.subheadline, design: .monospaced)).textSelection(.enabled)
                    Spacer()
                    MeStatePill(text: a.emailVerifiedAt == nil ? "Nicht bestätigt" : "Bestätigt", tone: a.emailVerifiedAt == nil ? .warn : .moss)
                }
                if a.emailVerifiedAt == nil {
                    AsyncButton {
                        await app.run("Wir haben dir einen neuen Bestätigungslink geschickt.") { _ = try await APIClient.shared.post("/auth/resend-verification") as JSONValue }
                    } label: { Label("Bestätigungslink erneut senden", systemImage: "envelope") }
                }
                if (a.providers ?? []).contains("apple") { Text("Du meldest dich (auch) mit Apple an.").font(.caption).foregroundStyle(Color.muted) }
                if let c = a.createdAt { LabeledContent("Mitglied seit", value: Fmt.date(c, style: .long)) }
            } header: { Text("E-Mail-Adresse") } footer: {
                Text("An diese Adresse senden wir Sicherheitshinweise, Bestellbestätigungen und – falls aktiviert – Benachrichtigungen. Sie ist nie öffentlich sichtbar.")
            }

            Section {
                if a.hasPassword {
                    SecureField("Aktuelles Passwort", text: $current).textContentType(.password)
                    if let e = pwErrors["current"] { Text(e).font(.caption).foregroundStyle(Color.danger) }
                }
                SecureField("Neues Passwort", text: $next).textContentType(.newPassword)
                if let e = pwErrors["next"] ?? pwErrors["password"] { Text(e).font(.caption).foregroundStyle(Color.danger) }
                SecureField("Neues Passwort wiederholen", text: $confirm).textContentType(.newPassword)
                if !confirm.isEmpty && confirm != next { Text("Stimmt nicht überein").font(.caption).foregroundStyle(Color.danger) }
                AsyncButton { await changePassword(a) } label: { Text(a.hasPassword ? "Passwort ändern" : "Passwort festlegen").fontWeight(.semibold) }
                    .disabled(next.count < 10 || next != confirm || (a.hasPassword && current.isEmpty))
            } header: { Text(a.hasPassword ? "Passwort ändern" : "Passwort festlegen") } footer: {
                Text(a.hasPassword ? "Mindestens 10 Zeichen, mit Buchstaben und einer Ziffer oder einem Sonderzeichen. Alle anderen Sitzungen werden danach beendet."
                                   : "Du meldest dich bisher nur mit Apple an. Mit einem Passwort kannst du dich zusätzlich per E-Mail anmelden.")
            }

            Section {
                if let exportURL {
                    ShareLink(item: exportURL) { Label("Export sichern oder teilen", systemImage: "square.and.arrow.up") }
                    Text(exportURL.lastPathComponent).font(.caption).foregroundStyle(Color.muted)
                }
                AsyncButton { await export() } label: {
                    Label(exportURL == nil ? "Datenexport erstellen (JSON)" : "Neu erstellen", systemImage: "arrow.down.doc")
                }
            } header: { Text("Deine Daten herunterladen") } footer: {
                Text("Du hast jederzeit das Recht auf Auskunft und Datenübertragbarkeit. Der Export enthält Profil, Beiträge, Projekte mit Journal und Materiallisten, Anleitungen, Artikel, Kommentare, Bestellungen, gefolgte Profile, Gespeichertes und gesendete Nachrichten. Medien sind als Links enthalten.")
            }

            Section {
                Button(role: .destructive) { showDelete = true } label: { Label("Konto löschen …", systemImage: "person.crop.circle.badge.xmark") }
            } header: { Text("Konto löschen") } footer: {
                Text("Endgültig und nicht rückgängig zu machen. Bestellungen bleiben aus gesetzlichen Gründen (Art. 958f OR) pseudonymisiert erhalten.")
            }
        }
        .meFormStyle()
    }

    private func load() async {
        do { data = try await APIClient.shared.get("/settings/account"); error = nil }
        catch { if data == nil { self.error = MeErr.text(error) } else { app.show(error: error) } }
    }

    private func changePassword(_ a: MeAccountOverview) async {
        do {
            let r: MeCountResult = try await APIClient.shared.post("/settings/password", ["current": JSONValue.string(current), "next": .string(next), "confirm": .string(confirm)])
            let n = r.revoked ?? 0
            app.show(n > 0 ? "Passwort geändert – \(Fmt.plural(n, "andere Sitzung", "andere Sitzungen")) beendet." : "Passwort geändert.")
            current = ""; next = ""; confirm = ""; pwErrors = [:]
            await load()
        } catch {
            pwErrors = (error as? APIError)?.fields ?? [:]
            app.show(error: error)
        }
    }

    private func export() async {
        do {
            let data = try await APIClient.shared.exportData()
            let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("werkraum-datenexport-\(f.string(from: Date())).json")
            try data.write(to: url, options: .atomic)
            exportURL = url
            app.show("Export erstellt (\(Fmt.bytes(data.count))).")
        } catch { app.show(error: error) }
    }
}

private struct MeDeleteAccountSheet: View {
    var hasPassword: Bool
    var hasShop: Bool
    var orderCount: Int
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var app
    @State private var password = ""
    @State private var confirmText = ""
    @State private var finalConfirm = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    NoticeView(tone: .danger, title: "Endgültig", message: "Die Löschung kann nicht rückgängig gemacht werden. Dein Handle wird freigegeben. Lade vorher deinen Datenexport herunter, wenn du deine Projekte behalten möchtest.")
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                }
                Section("Wird gelöscht bzw. entfernt") {
                    bullet("Profil, Bio, Profil- und Titelbild, Links")
                    bullet("Beiträge, Projekte, Anleitungen und Kommentare")
                    bullet("Blogartikel (verborgen)")
                    bullet("Follower- und Folgebeziehungen")
                    bullet("Alle Sitzungen und verknüpften Anmeldungen")
                    if hasShop { bullet("Dein Shop wird gesperrt, Produkte werden deaktiviert") }
                }
                Section("Bleibt erhalten") {
                    bullet("Bestellungen und Rechnungsdaten\(orderCount > 0 ? " (\(orderCount))" : "") – 10 Jahre Aufbewahrungspflicht, vom Profil entkoppelt")
                    bullet("Moderationsentscheidungen in pseudonymisierter Form")
                    bullet("Gesendete Nachrichten im Verlauf deiner Gesprächspartner – als „Gelöschtes Konto“")
                }
                Section {
                    if hasPassword { SecureField("Passwort", text: $password).textContentType(.password) }
                    TextField("Tippe LÖSCHEN", text: $confirmText)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                } header: { Text("Bestätigen") } footer: { Text("Zur Sicherheit: \(hasPassword ? "dein Passwort und " : "")das Wort LÖSCHEN in Grossbuchstaben.") }
                Section {
                    Button(role: .destructive) { finalConfirm = true } label: {
                        Text("Konto endgültig löschen").fontWeight(.semibold).frame(maxWidth: .infinity)
                    }
                    .disabled(confirmText.trimmed.uppercased() != "LÖSCHEN" || (hasPassword && password.isEmpty))
                }
            }
            .meFormStyle()
            .navigationTitle("Konto löschen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } } }
            .confirmationDialog("Wirklich löschen?", isPresented: $finalConfirm, titleVisibility: .visible) {
                Button("Ja, Konto löschen", role: .destructive) { Task { await delete() } }
            } message: { Text("Danach wirst du abgemeldet.") }
        }
    }

    private func bullet(_ t: String) -> some View {
        Label(t, systemImage: "circle.fill").labelStyle(MeBulletStyle()).font(.subheadline).foregroundStyle(Color.ink2)
    }

    private func delete() async {
        let body: [String: JSONValue] = ["password": hasPassword ? .string(password) : .null, "confirm": .string(confirmText.trimmed)]
        if await app.run("Dein Konto wurde gelöscht.", { _ = try await APIClient.shared.post("/settings/delete-account", body) as JSONValue }) {
            dismiss()
            await app.signOut()
        }
    }
}

private struct MeBulletStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            configuration.icon.font(.system(size: 5)).foregroundStyle(Color.muted)
            configuration.title
        }
    }
}

// MARK: - Sicherheit

private struct MeSecuritySettings: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @State private var data: MeSecurityInfo?
    @State private var error: String?
    @State private var confirmOthers = false

    var body: some View {
        MePhase(value: data, error: error, retry: load) { d in form(d) }
            .task { if data == nil { await load() } }
            .refreshable { await load() }
            .confirmationDialog("Alle anderen Sitzungen beenden?", isPresented: $confirmOthers, titleVisibility: .visible) {
                Button("Beenden", role: .destructive) { Task { await revokeOthers() } }
            } message: { Text("Du bleibst nur auf diesem Gerät angemeldet.") }
    }

    private func form(_ d: MeSecurityInfo) -> some View {
        let others = d.sessions.filter { $0.current != true }.count
        return Form {
            Section {
                ForEach(d.sessions) { s in
                    HStack(spacing: 12) {
                        Image(systemName: s.isApp == true || s.device.contains("iOS") ? "iphone" : s.device.contains("Android") ? "smartphone" : "desktopcomputer")
                            .font(.title3).foregroundStyle(Color.ink2).frame(width: 34)
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: 6) {
                                Text(s.device).font(.subheadline.weight(.semibold))
                                if s.current == true { MeStatePill(text: "Dieses Gerät", tone: .moss) }
                            }
                            Text("Zuletzt aktiv \(Fmt.relative(s.lastUsedAt)) · seit \(Fmt.date(s.createdAt))").font(.caption).foregroundStyle(Color.muted)
                        }
                        Spacer(minLength: 4)
                        if s.current != true {
                            AsyncButton {
                                if await app.run("Sitzung beendet.", { _ = try await APIClient.shared.delete("/settings/sessions/\(s.key)") as JSONValue }) { await load() }
                            } label: { Text("Beenden").font(.footnote.weight(.semibold)) }
                            .buttonStyle(.glass)
                            .controlSize(.small)
                            .accessibilityLabel("Sitzung \(s.device) beenden")
                        }
                    }
                    .padding(.vertical, 2)
                }
                Button(role: .destructive) { confirmOthers = true } label: {
                    Label(others > 0 ? "Alle anderen Sitzungen beenden (\(others))" : "Keine anderen Sitzungen", systemImage: "rectangle.portrait.and.arrow.forward")
                }
                .disabled(others == 0)
            } header: { Text("Angemeldete Geräte") } footer: {
                Text("Kommt dir etwas unbekannt vor, beende die Sitzung und ändere dein Passwort. Sitzungen laufen nach 30 Tagen ohne Aktivität automatisch ab.")
            }

            Section {
                if d.events.isEmpty {
                    Text("Keine Ereignisse in letzter Zeit.").foregroundStyle(Color.muted)
                } else {
                    ForEach(d.events) { e in
                        VStack(alignment: .leading, spacing: 3) {
                            Text(e.text).font(.subheadline)
                            Text(Fmt.relative(e.createdAt)).specStyle()
                        }
                        .padding(.vertical, 2)
                        .padding(.leading, 10)
                        .overlay(alignment: .leading) { Capsule().fill(Color.lineStrong).frame(width: 2) }
                    }
                }
            } header: { Text("Sicherheitsereignisse") } footer: { Text("Anmeldungen von neuen Geräten, Passwortänderungen und beendete Sitzungen.") }

            Section {
                VStack(alignment: .leading, spacing: 8) {
                    tip("Nutze ein Passwort, das du nirgends sonst verwendest.")
                    tip("Wir fragen nie per Nachricht oder E-Mail nach deinem Passwort oder nach Zahlungen ausserhalb des Checkouts.")
                    tip("Verdächtige Nachrichten kannst du direkt im Chat melden.")
                }
                .padding(.vertical, 4)
                Button("Passwort ändern") { router.open(.settingsSection(.account)) }
            } header: { Text("So schützt du dein Konto") }
        }
        .meFormStyle()
    }

    private func tip(_ t: String) -> some View {
        Label { Text(t).font(.subheadline) } icon: { Image(systemName: "checkmark.shield").foregroundStyle(Color.moss) }
    }

    private func load() async {
        do { data = try await APIClient.shared.get("/settings/security"); error = nil }
        catch { if data == nil { self.error = MeErr.text(error) } else { app.show(error: error) } }
    }

    private func revokeOthers() async {
        do {
            let r: MeCountResult = try await APIClient.shared.post("/settings/sessions/revoke-others")
            app.show(r.count == 1 ? "1 Sitzung beendet." : "\(r.count ?? 0) Sitzungen beendet.")
            await load()
        } catch { app.show(error: error) }
    }
}

// MARK: - Benachrichtigungen

private struct MeNotifPref: Hashable { var inApp: Bool; var email: Bool }

private struct MeNotificationSettingsView: View {
    @Environment(AppState.self) private var app
    @State private var prefs: [String: MeNotifPref] = [:]
    @State private var locked: Set<String> = []
    @State private var order: [String] = []
    @State private var digest = "DAILY"
    @State private var loaded = false
    @State private var error: String?
    @State private var revision = 0
    @State private var saving = false
    @State private var pushStatus: UNAuthorizationStatus = .notDetermined

    var body: some View {
        MePhase(value: loaded ? true : nil, error: error, retry: load) { _ in form }
            .task { if !loaded { await load() }; await refreshPush() }
            .task(id: revision) {
                guard revision > 0 else { return }
                try? await Task.sleep(for: .milliseconds(600))
                guard !Task.isCancelled else { return }
                await save()
            }
    }

    private var form: some View {
        Form {
            Section {
                Toggle(isOn: Binding(get: { pushStatus == .authorized || pushStatus == .provisional }, set: { on in Task { await togglePush(on) } })) {
                    Label("Push-Mitteilungen (iOS)", systemImage: "app.badge")
                }
                .tint(.moss)
                if pushStatus == .denied {
                    Button("In den iOS-Einstellungen erlauben") {
                        if let u = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(u) }
                    }
                }
            } header: { Text("Dieses Gerät") } footer: {
                Text("Der Versand per Push ist serverseitig vorbereitet und startet, sobald er freigeschaltet ist. Bis dahin erscheinen alle Mitteilungen zuverlässig in der App.")
            }

            Section {
                HStack {
                    Spacer()
                    Text("In-App").frame(width: 60)
                    Text("E-Mail").frame(width: 60)
                }
                .specStyle()
                .accessibilityHidden(true)
                ForEach(order, id: \.self) { type in
                    let label = L.notificationTypes.first { $0.key == type }?.label ?? type
                    let isLocked = locked.contains(type)
                    HStack {
                        VStack(alignment: .leading, spacing: 1) {
                            Text(label).font(.subheadline)
                            if isLocked { Text("Immer in der App").font(.caption2).foregroundStyle(Color.muted) }
                        }
                        Spacer()
                        Toggle(label + " in der App", isOn: binding(type, \.inApp))
                            .labelsHidden().tint(.moss).frame(width: 60)
                            .disabled(isLocked)
                        Toggle(label + " per E-Mail", isOn: binding(type, \.email))
                            .labelsHidden().tint(.moss).frame(width: 60)
                            .disabled(digest == "OFF")
                    }
                }
            } header: { Text("Je Ereignis") } footer: {
                Text("Moderationsentscheidungen und Sicherheitshinweise erscheinen aus rechtlichen Gründen immer in der App.")
            }

            Section {
                Picker("E-Mails", selection: Binding(get: { digest }, set: { digest = $0; revision += 1 })) {
                    ForEach(L.emailDigest, id: \.key) { Text($0.label).tag($0.key) }
                }
            } header: { Text("E-Mail-Bündelung") } footer: {
                HStack(spacing: 6) {
                    if saving { ProgressView().controlSize(.mini) }
                    Text(saving ? "Wird gesichert …" : "Änderungen werden automatisch gesichert.")
                }
            }
        }
        .meFormStyle()
    }

    private func binding(_ type: String, _ kp: WritableKeyPath<MeNotifPref, Bool>) -> Binding<Bool> {
        Binding(
            get: { prefs[type]?[keyPath: kp] ?? false },
            set: { v in
                var p = prefs[type] ?? MeNotifPref(inApp: true, email: false)
                p[keyPath: kp] = v
                prefs[type] = p
                Haptics.selection()
                revision += 1
            }
        )
    }

    private func load() async {
        do {
            let s: MeNotificationSettings = try await APIClient.shared.get("/settings/notifications")
            var p: [String: MeNotifPref] = [:]
            for r in s.matrix { p[r.type] = MeNotifPref(inApp: r.inApp, email: r.email) }
            prefs = p
            locked = Set(s.matrix.filter { $0.locked == true }.map(\.type))
            let known = L.notificationTypes.map(\.key)
            order = known.filter { p[$0] != nil } + s.matrix.map(\.type).filter { !known.contains($0) }
            digest = s.emailDigest
            loaded = true
            error = nil
        } catch { self.error = MeErr.text(error) }
    }

    private func save() async {
        saving = true
        defer { saving = false }
        var obj: [String: JSONValue] = [:]
        for (k, v) in prefs { obj[k] = ["inApp": .bool(locked.contains(k) ? true : v.inApp), "email": .bool(v.email)] }
        do { _ = try await APIClient.shared.put("/settings/notifications", ["prefs": JSONValue.object(obj), "emailDigest": .string(digest)]) as JSONValue }
        catch { app.show(error: error); await load() }
    }

    private func refreshPush() async {
        pushStatus = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
    }

    private func togglePush(_ on: Bool) async {
        if on {
            if pushStatus == .denied {
                if let u = URL(string: UIApplication.openSettingsURLString) { await UIApplication.shared.open(u) }
                return
            }
            let granted = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound])) ?? false
            if granted {
                UIApplication.shared.registerForRemoteNotifications()
                app.show("Push-Mitteilungen erlaubt.")
            }
        } else {
            if let u = URL(string: UIApplication.openSettingsURLString) { await UIApplication.shared.open(u) }
        }
        await refreshPush()
    }
}

// MARK: - Feed & Interessen

private struct MeFeedSettingsView: View {
    @Environment(AppState.self) private var app
    @State private var data: MeFeedSettings?
    @State private var error: String?
    @State private var interests: [String] = []
    @State private var hidden: [String] = []
    @State private var feedDefault = "FOR_YOU"
    @State private var dirty = false

    var body: some View {
        MePhase(value: data, error: error, retry: load) { d in form(d) }
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    AsyncButton("Sichern") { await save() }.disabled(!dirty)
                }
            }
            .task { if data == nil { await load() } }
    }

    private func form(_ d: MeFeedSettings) -> some View {
        Form {
            Section {
                MeCategoryPicker(categories: app.activeCategories, selection: Binding(get: { interests }, set: { interests = $0; hidden.removeAll { interests.contains($0) }; dirty = true }))
                    .padding(.vertical, 6)
            } header: { Text("Interessen") } footer: { Text("Bestimmt, was „Für dich“ bevorzugt zeigt.") }
            Section {
                MeCategoryPicker(categories: app.activeCategories, selection: Binding(get: { hidden }, set: { hidden = $0; dirty = true }), exclude: interests)
                    .padding(.vertical, 6)
            } header: { Text("Ausgeblendete Kategorien") } footer: { Text("Diese Kategorien erscheinen nicht mehr in deinen Empfehlungen.") }
            Section {
                Picker("Startansicht", selection: Binding(get: { feedDefault }, set: { feedDefault = $0; dirty = true })) {
                    ForEach(L.feedDefaults, id: \.key) { Text($0.label).tag($0.key) }
                }
            } header: { Text("Feed beim Öffnen") }

            Section {
                let muted = (d.muted ?? []).filter { $0.person != nil }
                if muted.isEmpty {
                    Text("Du hast niemanden stummgeschaltet.").foregroundStyle(Color.muted)
                } else {
                    ForEach(muted) { m in
                        MeRelationRow(entry: m, action: "Aufheben") {
                            if await app.run("Stummschaltung aufgehoben.", { _ = try await APIClient.shared.post("/settings/unmute/\(m.id)") as JSONValue }) { await load() }
                        }
                    }
                }
            } header: { Text("Stummgeschaltet") } footer: { Text("Stummgeschaltete Profile erfahren davon nichts. Ihre Inhalte erscheinen nicht in deinem Feed.") }

            Section {
                LabeledContent("Ausgeblendete Inhalte", value: Fmt.number(d.hiddenCount ?? 0))
                AsyncButton {
                    do {
                        let r: MeCountResult = try await APIClient.shared.post("/settings/feed/reset-hidden")
                        app.show("\(Fmt.plural(r.count ?? 0, "Inhalt", "Inhalte")) wieder sichtbar.")
                        await load()
                    } catch { app.show(error: error) }
                } label: { Text("Ausgeblendetes zurücksetzen") }
                .disabled((d.hiddenCount ?? 0) == 0)
            } header: { Text("„Weniger davon zeigen“") }
        }
        .meFormStyle()
    }

    private func load() async {
        do {
            let d: MeFeedSettings = try await APIClient.shared.get("/settings/feed")
            if data == nil || !dirty { interests = d.interests; hidden = d.hiddenCategories; feedDefault = d.feedDefault; dirty = false }
            data = d
            error = nil
        } catch { if data == nil { self.error = MeErr.text(error) } else { app.show(error: error) } }
    }

    private func save() async {
        let body: [String: JSONValue] = ["interests": .from(interests), "hiddenCategories": .from(hidden.filter { !interests.contains($0) }), "feedDefault": .string(feedDefault)]
        if await app.run("Feed-Einstellungen gesichert.", { _ = try await APIClient.shared.put("/settings/feed", body) as JSONValue }) {
            dirty = false
            await load()
        }
    }
}

private struct MeRelationRow: View {
    var entry: MeRelationEntry
    var action: String
    var perform: () async -> Void
    @Environment(Router.self) private var router

    var body: some View {
        let p = entry.person?.profile
        HStack(spacing: 12) {
            Button { if let h = p?.handle { router.open(.profile(handle: h)) } } label: {
                HStack(spacing: 10) {
                    AvatarView(url: p?.avatarUrl, name: p?.displayName ?? "?", size: 34)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(p?.displayName ?? "Unbekannt").font(.subheadline.weight(.semibold)).foregroundStyle(Color.ink)
                        Text([p?.handle.map { "@\($0)" }, entry.createdAt.map { "seit \(Fmt.date($0))" }].compactMap { $0 }.joined(separator: " · "))
                            .font(.caption).foregroundStyle(Color.muted)
                    }
                }
            }
            .buttonStyle(.plain)
            Spacer()
            AsyncButton { await perform() } label: { Text(action).font(.footnote.weight(.semibold)) }
                .buttonStyle(.glass)
                .controlSize(.small)
        }
    }
}

// MARK: - Privatsphäre

private struct MePrivacySettingsView: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @State private var data: MePrivacySettings?
    @State private var error: String?
    @State private var dmPolicy = "FOLLOWING"
    @State private var reduceMotion = false
    @State private var revision = 0

    var body: some View {
        MePhase(value: data, error: error, retry: load) { d in form(d) }
            .task { if data == nil { await load() } }
            .task(id: revision) {
                guard revision > 0 else { return }
                try? await Task.sleep(for: .milliseconds(400))
                guard !Task.isCancelled else { return }
                await save()
            }
    }

    private func form(_ d: MePrivacySettings) -> some View {
        Form {
            Section {
                Picker("Nachrichten von", selection: Binding(get: { dmPolicy }, set: { dmPolicy = $0; revision += 1 })) {
                    ForEach(L.dmPolicies, id: \.key) { Text($0.label).tag($0.key) }
                }
                .pickerStyle(.inline)
                .labelsHidden()
            } header: { Text("Wer darf dir schreiben?") } footer: {
                Text("Neue Kontakte landen zuerst in den Anfragen. Zu Bestellungen kann dir immer geschrieben werden.")
            }
            Section {
                Toggle("Bewegung reduzieren", isOn: Binding(get: { reduceMotion }, set: { reduceMotion = $0; revision += 1 })).tint(.moss)
            } footer: { Text("Weniger Animationen und keine automatisch drehenden 3D-Szenen im Web. In der App gilt zusätzlich die iOS-Einstellung „Bewegung reduzieren“.") }

            Section {
                let blocked = (d.blocked ?? []).filter { $0.person != nil }
                if blocked.isEmpty {
                    Text("Du hast niemanden blockiert.").foregroundStyle(Color.muted)
                } else {
                    ForEach(blocked) { b in
                        MeRelationRow(entry: b, action: "Aufheben") {
                            if await app.run("Blockierung aufgehoben.", { _ = try await APIClient.shared.post("/settings/unblock/\(b.id)") as JSONValue }) { await load() }
                        }
                    }
                }
            } header: { Text("Blockiert") } footer: { Text("Blockierte Profile können dir nicht folgen, schreiben oder deine Inhalte sehen.") }

            Section {
                Button("Datenschutzerklärung") { router.open(.web(path: "/rechtliches/datenschutz")) }
                Button("Datenexport & Konto löschen") { router.open(.settingsSection(.account)) }
            }
        }
        .meFormStyle()
    }

    private func load() async {
        do {
            let d: MePrivacySettings = try await APIClient.shared.get("/settings/privacy")
            dmPolicy = d.dmPolicy; reduceMotion = d.reduceMotion
            data = d
            error = nil
        } catch { if data == nil { self.error = MeErr.text(error) } else { app.show(error: error) } }
    }

    private func save() async {
        do { _ = try await APIClient.shared.put("/settings/privacy", ["dmPolicy": JSONValue.string(dmPolicy), "reduceMotion": .bool(reduceMotion)]) as JSONValue; app.show("Gesichert.") }
        catch { app.show(error: error); await load() }
    }
}

// MARK: - Hilfe & Support

private struct MeSupportView: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @State private var tickets: [MeSupportTicket]?
    @State private var topic = "GENERAL"
    @State private var subject = ""
    @State private var message = ""
    @State private var fields: [String: String] = [:]

    var body: some View {
        Form {
            Section {
                Picker("Thema", selection: $topic) {
                    ForEach(L.supportTopics, id: \.key) { Text($0.label).tag($0.key) }
                }
                TextField("Betreff", text: $subject)
                if let e = fields["subject"] { Text(e).font(.caption).foregroundStyle(Color.danger) }
                TextField("Beschreibe dein Anliegen", text: $message, axis: .vertical).lineLimit(5...14)
                MeCharCounter(count: message.trimmed.count, min: 20, max: 5000)
                if let e = fields["body"] { Text(e).font(.caption).foregroundStyle(Color.danger) }
                AsyncButton { await submit() } label: { Text("Anfrage senden").fontWeight(.semibold) }
                    .disabled(subject.trimmed.count < 4 || message.trimmed.count < 20 || message.count > 5000)
            } header: { Text("Neue Anfrage") } footer: {
                Text("Wir melden uns in der Regel innerhalb von zwei Werktagen per E-Mail. Bei Betrugsversuchen oder übernommenem Konto: sofort Passwort ändern und alle Sitzungen beenden.")
            }

            Section {
                if let tickets {
                    if tickets.isEmpty {
                        Text("Noch keine Anfragen.").foregroundStyle(Color.muted)
                    } else {
                        ForEach(tickets) { t in
                            HStack(alignment: .firstTextBaseline) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(t.subject).font(.subheadline.weight(.semibold))
                                    Text([L.supportTopics.first { $0.key == t.topic }?.label, Fmt.date(t.createdAt), "#\(t.id.suffix(6).uppercased())"].compactMap { $0 }.joined(separator: " · "))
                                        .font(.caption).foregroundStyle(Color.muted)
                                }
                                Spacer()
                                MeStatePill(text: L.supportStatus[t.status ?? ""] ?? (t.status ?? ""), tone: t.status == "CLOSED" ? .neutral : t.status == "WAITING" ? .warn : .moss)
                            }
                        }
                    }
                } else {
                    ProgressView()
                }
            } header: { Text("Deine Anfragen") }

            Section {
                Button("Hilfe-Center") { router.open(.web(path: "/hilfe")) }
                Button("Community-Richtlinien") { router.open(.web(path: "/richtlinien/community")) }
                Button("Datenschutz") { router.open(.web(path: "/rechtliches/datenschutz")) }
                Button("AGB") { router.open(.web(path: "/rechtliches/agb")) }
                Button("Impressum") { router.open(.web(path: "/rechtliches/impressum")) }
            } header: { Text("Hilfe & Richtlinien") }
        }
        .meFormStyle()
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        tickets = (try? await APIClient.shared.get("/support/tickets") as [MeSupportTicket]) ?? tickets ?? []
    }

    private func submit() async {
        do {
            let r: MeTicketCreated = try await APIClient.shared.post("/support/tickets", ["topic": JSONValue.string(topic), "subject": .string(subject.trimmed), "body": .string(message.trimmed)])
            app.show("Danke! Deine Anfrage ist eingegangen (#\(r.ref ?? String(r.id.suffix(6)).uppercased())).")
            subject = ""; message = ""; fields = [:]
            await load()
        } catch {
            fields = (error as? APIError)?.fields ?? [:]
            app.show(error: error)
        }
    }
}

// MARK: - Server & Entwicklung

private struct MeDeveloperSettings: View {
    @Environment(AppState.self) private var app
    @State private var env = AppConfig.environment
    @State private var pending: ServerEnvironment?

    var body: some View {
        Form {
            Section {
                Picker("Server", selection: Binding(get: { env }, set: { if $0 != env { pending = $0 } })) {
                    ForEach(ServerEnvironment.allCases) { Text($0.label).tag($0) }
                }
                .pickerStyle(.inline)
                .labelsHidden()
            } header: { Text("Server-Umgebung") } footer: { Text("Beim Wechsel wirst du abgemeldet, weil Konten je Server getrennt sind.") }
            Section {
                LabeledContent("Basis-URL") { Text(AppConfig.baseURL.absoluteString).font(.system(.footnote, design: .monospaced)).textSelection(.enabled) }
                LabeledContent("App-API") { Text("/api/v1/app").font(.system(.footnote, design: .monospaced)) }
                LabeledContent("App", value: MeAppInfo.version)
            } header: { Text("Verbindung") }
            Section {
                Button("Bild-Cache leeren", systemImage: "trash") {
                    ImageCache.shared.clear()
                    app.show("Bild-Cache geleert.")
                }
            } footer: { Text("Bilder werden beim nächsten Anzeigen neu geladen.") }
        }
        .meFormStyle()
        .confirmationDialog("Server wechseln?", isPresented: Binding(get: { pending != nil }, set: { if !$0 { pending = nil } }), titleVisibility: .visible, presenting: pending) { e in
            Button("Zu \(e.label) wechseln", role: .destructive) {
                Task {
                    AppConfig.environment = e
                    env = e
                    await app.signOut()
                    await app.refresh()
                }
            }
        } message: { _ in Text("Du wirst abgemeldet und meldest dich danach auf dem anderen Server an.") }
    }
}
