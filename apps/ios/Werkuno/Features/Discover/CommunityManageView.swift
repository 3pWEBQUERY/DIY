import SwiftUI

// MARK: - Community verwalten (PRD §15.3 Moderation & Leitung)

struct CommunityManageView: View {
    var slug: String

    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router

    @State private var page: CommunityPagePayload?
    @State private var manage: CommunityManagePayload?
    @State private var error: String?
    @State private var inviteHandle = ""
    @State private var rules: [CommunityRule] = []
    @State private var rulesDirty = false
    @State private var memberQuery = ""
    @State private var showChallenge = false
    @State private var removeTarget: (member: CommunityMemberRow, ban: Bool)?
    @State private var removeReason = ""
    @State private var muteTarget: CommunityMemberRow?
    @State private var muteReason = ""
    @State private var transferTarget: CommunityMemberRow?
    @State private var showDissolve = false
    @State private var dissolveName = ""

    private var id: String? { page?.community.id }
    private var isManager: Bool { page?.isManager == true }

    var body: some View {
        Group {
            if let page, let manage {
                list(page, manage)
            } else if let error {
                ErrorStateView(message: error) { await load() }
            } else {
                LoadingView()
            }
        }
        .background(Color.paper)
        .navigationTitle("Verwalten")
        .navigationBarTitleDisplayMode(.inline)
        .task { if manage == nil { await load() } }
        .reloadWhenSheetCloses { await load() }
        .sheet(isPresented: $showChallenge) {
            if let id { CommunityChallengeSheet(communityId: id) { Task { await load() } } }
        }
        .alert(removeTarget?.ban == true ? "Mitglied sperren" : "Mitglied entfernen", isPresented: Binding(get: { removeTarget != nil }, set: { if !$0 { removeTarget = nil } })) {
            TextField("Grund (optional)", text: $removeReason)
            Button("Abbrechen", role: .cancel) { removeTarget = nil }
            Button(removeTarget?.ban == true ? "Sperren" : "Entfernen", role: .destructive) {
                if let t = removeTarget { Task { await remove(t.member, ban: t.ban) } }
                removeTarget = nil
            }
        } message: {
            Text(removeTarget?.ban == true ? "\(removeTarget?.member.displayName ?? "") wird entfernt und kann nicht erneut beitreten." : "\(removeTarget?.member.displayName ?? "") wird aus der Community entfernt.")
        }
        .alert("Stummschalten", isPresented: Binding(get: { muteTarget != nil }, set: { if !$0 { muteTarget = nil } })) {
            TextField("Grund (optional)", text: $muteReason)
            Button("24 Stunden") { mute(hours: 24) }
            Button("7 Tage") { mute(hours: 24 * 7) }
            Button("30 Tage") { mute(hours: 24 * 30) }
            Button("Abbrechen", role: .cancel) { muteTarget = nil }
        } message: { Text("\(muteTarget?.displayName ?? "") kann in dieser Zeit nichts schreiben.") }
        .confirmationDialog("Leitung übertragen?", isPresented: Binding(get: { transferTarget != nil }, set: { if !$0 { transferTarget = nil } }), titleVisibility: .visible) {
            Button("An \(transferTarget?.displayName ?? "") übertragen", role: .destructive) {
                if let t = transferTarget { Task { await memberAction(t, "transfer", [:], success: "Leitung an \(t.displayName) übertragen.") } }
                transferTarget = nil
            }
        } message: { Text("Du wirst danach Admin. Nur die neue Gründer:in kann die Leitung wieder abgeben.") }
        .alert("Community auflösen?", isPresented: $showDissolve) {
            TextField(page?.community.name ?? "Name", text: $dissolveName)
            Button("Abbrechen", role: .cancel) {}
            Button("Endgültig auflösen", role: .destructive) { Task { await dissolve() } }
        } message: { Text("Tippe zur Bestätigung den Namen „\(page?.community.name ?? "")“ ein.") }
    }

    private func dissolve() async {
        guard let id else { return }
        let ok = await app.run("Community aufgelöst.") {
            _ = try await APIClient.shared.send("DELETE", "/communities/\(id)", body: ["confirm": JSONValue.string(dissolveName)]) as JSONValue
        }
        if ok { router.popToRoot(); router.open(.communities) }
    }

    // MARK: Laden

    private func load() async {
        do {
            let p: CommunityPagePayload = try await APIClient.shared.get("/communities/by-slug/\(slug)")
            let m: CommunityManagePayload = try await APIClient.shared.get("/communities/\(p.community.id)/manage", query: ["q": memberQuery.trimmed.nilIfEmpty])
            withAnimation(.snappy) {
                page = p
                manage = m
                if !rulesDirty { rules = p.community.rules ?? [] }
                error = nil
            }
        } catch is CancellationError {
        } catch {
            if manage == nil { self.error = (error as? APIError)?.message ?? error.localizedDescription } else { app.show(error: error) }
        }
    }

    // MARK: Aktionen

    private func decide(_ m: CommunityMemberRow, approve: Bool) async {
        guard let id else { return }
        if await app.run(approve ? "\(m.displayName) ist jetzt Mitglied." : "Anfrage abgelehnt.", {
            try await APIClient.shared.action("POST", "/communities/\(id)/requests/\(m.userId)", ["approve": .bool(approve)])
        }) { await load() }
    }

    private func invite() async {
        guard let id else { return }
        let h = inviteHandle.trimmed.replacingOccurrences(of: "@", with: "")
        guard !h.isEmpty else { return }
        if await app.run("@\(h) eingeladen.", { try await APIClient.shared.action("POST", "/communities/\(id)/invite", ["handle": .string(h)]) }) {
            inviteHandle = ""
            await load()
        }
    }

    private func revoke(_ m: CommunityMemberRow) async {
        guard let id else { return }
        if await app.run("Einladung zurückgezogen.", { _ = try await APIClient.shared.delete("/communities/\(id)/invite/\(m.userId)") as JSONValue }) { await load() }
    }

    private func memberAction(_ m: CommunityMemberRow, _ action: String, _ body: [String: JSONValue], success: String) async {
        guard let id else { return }
        if await app.run(success, { try await APIClient.shared.action("POST", "/communities/\(id)/members/\(m.userId)/\(action)", body) }) { await load() }
    }

    private func remove(_ m: CommunityMemberRow, ban: Bool) async {
        var body: [String: JSONValue] = ["ban": .bool(ban)]
        if let r = removeReason.trimmed.nilIfEmpty { body["reason"] = .string(r) }
        removeReason = ""
        await memberAction(m, "remove", body, success: ban ? "\(m.displayName) gesperrt." : "\(m.displayName) entfernt.")
    }

    private func mute(hours: Int) {
        guard let m = muteTarget else { return }
        let until = Date().addingTimeInterval(TimeInterval(hours * 3600))
        var body: [String: JSONValue] = ["until": .string(JSON.isoFormatter.string(from: until))]
        if let r = muteReason.trimmed.nilIfEmpty { body["reason"] = .string(r) }
        muteReason = ""
        muteTarget = nil
        Task { await memberAction(m, "mute", body, success: "\(m.displayName) bis \(Fmt.dateTime(until)) stummgeschaltet.") }
    }

    private func saveRules() async {
        guard let id else { return }
        let clean = rules.filter { !$0.title.trimmed.isEmpty }
        let body: [String: JSONValue] = ["rules": .array(clean.map { ["title": .string($0.title.trimmed), "body": .string($0.body.trimmed)] })]
        if await app.run("Regeln gespeichert.", { _ = try await APIClient.shared.put("/communities/\(id)/rules", body) as JSONValue }) {
            rulesDirty = false
            await load()
        }
    }

    private func restore(_ p: PostItem) async {
        guard let id else { return }
        if await app.run("Beitrag wiederhergestellt.", { try await APIClient.shared.action("POST", "/communities/\(id)/posts/\(p.id)/hidden", ["on": false]) }) { await load() }
    }

    private func deleteChallenge(_ c: CommunityChallenge) async {
        guard let id else { return }
        if await app.run("Challenge gelöscht.", { _ = try await APIClient.shared.delete("/communities/\(id)/challenges/\(c.id)") as JSONValue }) { await load() }
    }

    // MARK: Liste

    private func list(_ p: CommunityPagePayload, _ m: CommunityManagePayload) -> some View {
        List {
            Section {
                HStack(spacing: 12) {
                    CoverView(url: p.community.coverUrl, seed: p.community.id, category: p.community.category, showLabel: false)
                        .frame(width: 54, height: 54)
                        .clipShape(.rect(cornerRadius: Radius.small, style: .continuous))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(p.community.name).font(.wr(.headline))
                        Text("\(L.communityVisibility.first { $0.key == p.community.visibility }?.label ?? "") · \(Fmt.plural(p.community.memberCount ?? 0, "Mitglied", "Mitglieder"))")
                            .font(.wr(.caption)).foregroundStyle(Color.muted)
                    }
                }
                if isManager {
                    Button { router.present(.communityEditor(slug: p.community.slug)) } label: {
                        Label("Einstellungen bearbeiten", systemImage: "pencil")
                    }
                }
                Button { router.open(.community(slug: p.community.slug)) } label: { Label("Zur Community", systemImage: "arrow.up.right.square") }
            }

            Section {
                if m.requests.isEmpty {
                    Text("Keine offenen Anfragen.").foregroundStyle(Color.muted)
                }
                ForEach(m.requests) { r in
                    VStack(alignment: .leading, spacing: 8) {
                        CommunityMemberLine(member: r)
                        if let b = r.bio?.nilIfEmpty { Text(b).font(.wr(.caption)).foregroundStyle(Color.muted).lineLimit(2) }
                        HStack {
                            AsyncButton { await decide(r, approve: true) } label: { Text("Annehmen").frame(maxWidth: .infinity) }
                                .buttonStyle(.glassProminent).tint(.moss)
                            AsyncButton { await decide(r, approve: false) } label: { Text("Ablehnen").frame(maxWidth: .infinity) }
                                .buttonStyle(.glass)
                        }
                    }
                }
            } header: { Text("Beitrittsanfragen (\(m.requests.count))") }

            Section {
                HStack {
                    TextField("@handle", text: $inviteHandle)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .onSubmit { Task { await invite() } }
                    AsyncButton("Einladen") { await invite() }
                        .buttonStyle(.glassProminent).tint(.moss)
                        .disabled(inviteHandle.trimmed.isEmpty)
                }
                ForEach(m.invited) { i in
                    CommunityMemberLine(member: i)
                        .swipeActions { Button("Zurückziehen", role: .destructive) { Task { await revoke(i) } } }
                        .contextMenu { Button("Einladung zurückziehen", systemImage: "xmark", role: .destructive) { Task { await revoke(i) } } }
                }
            } header: { Text("Einladen") } footer: { Text(m.invited.isEmpty ? "Eingeladene Personen erhalten eine Benachrichtigung." : "\(Fmt.plural(m.invited.count, "offene Einladung", "offene Einladungen")) – zum Zurückziehen nach links wischen.") }

            Section {
                TextField("Mitglied suchen", text: $memberQuery)
                    .textInputAutocapitalization(.never)
                    .onSubmit { Task { await load() } }
                ForEach(m.members.items) { mem in
                    memberRow(mem)
                }
            } header: { Text("Mitglieder (\(p.community.memberCount ?? m.members.items.count))") }

            if !m.banned.isEmpty {
                Section("Gesperrt") {
                    ForEach(m.banned) { b in
                        HStack {
                            CommunityMemberLine(member: b)
                            AsyncButton("Entsperren") { await memberAction(b, "unban", [:], success: "Sperre für \(b.displayName) aufgehoben.") }
                                .buttonStyle(.glass)
                        }
                    }
                }
            }

            if isManager {
                Section {
                    ForEach($rules) { $r in
                        VStack(alignment: .leading, spacing: 6) {
                            TextField("Titel der Regel", text: $r.title).font(.wr(.headline))
                            TextField("Erläuterung (optional)", text: $r.body, axis: .vertical).font(.wr(.subheadline)).lineLimit(1...5)
                        }
                        .onChange(of: r) { rulesDirty = true }
                    }
                    .onDelete { rules.remove(atOffsets: $0); rulesDirty = true }
                    .onMove { rules.move(fromOffsets: $0, toOffset: $1); rulesDirty = true }
                    Button { rules.append(CommunityRule(title: "", body: "")); rulesDirty = true } label: { Label("Regel hinzufügen", systemImage: "plus") }
                        .disabled(rules.count >= 20)
                    if rulesDirty {
                        AsyncButton { await saveRules() } label: { Text("Regeln speichern").frame(maxWidth: .infinity) }
                            .buttonStyle(.glassProminent).tint(.moss)
                    }
                } header: { Text("Regeln") } footer: { Text("Höchstens 20 Regeln. Zum Sortieren gedrückt halten und ziehen, zum Löschen nach links wischen.") }
            }

            Section {
                if m.hidden.isEmpty { Text("Keine ausgeblendeten Beiträge.").foregroundStyle(Color.muted) }
                ForEach(m.hidden) { post in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(spacing: 8) {
                            AvatarView(url: post.author.avatarUrl, name: post.author.displayName, size: 24)
                            Text(post.author.displayName).font(.wr(.subheadline, .semibold))
                            Text(Fmt.relative(post.publishedAt)).font(.wr(.caption)).foregroundStyle(Color.muted)
                        }
                        Text(post.body.nilIfEmpty ?? "Medienbeitrag").font(.wr(.subheadline)).foregroundStyle(Color.ink2).lineLimit(4)
                        AsyncButton("Wiederherstellen") { await restore(post) }.buttonStyle(.glass)
                    }
                }
            } header: { Text("Ausgeblendete Beiträge") }

            Section {
                ForEach(m.challenges) { c in
                    VStack(alignment: .leading, spacing: 3) {
                        HStack {
                            Text(c.title).font(.wr(.headline))
                            if c.isRunning { Pill(text: "Läuft", tint: .clay) }
                        }
                        Text("\(Fmt.date(c.startsAt)) – \(Fmt.date(c.endsAt))").font(.wr(.caption)).foregroundStyle(Color.muted)
                        if let d = c.description?.nilIfEmpty { Text(d).font(.wr(.caption)).foregroundStyle(Color.ink2).lineLimit(2) }
                    }
                    .swipeActions { Button("Löschen", role: .destructive) { Task { await deleteChallenge(c) } } }
                    .contextMenu { Button("Challenge löschen", systemImage: "trash", role: .destructive) { Task { await deleteChallenge(c) } } }
                }
                Button { showChallenge = true } label: { Label("Challenge anlegen", systemImage: "flag.checkered") }
            } header: { Text("Challenges") }

            Section {
                if m.log.isEmpty { Text("Noch keine Moderationsaktionen.").foregroundStyle(Color.muted) }
                ForEach(m.log) { e in
                    VStack(alignment: .leading, spacing: 3) {
                        HStack {
                            Text(e.label).font(.wr(.subheadline, .semibold))
                            if let d = e.detail?.nilIfEmpty { Text(L.communityRoles[d] ?? L.communityVisibility.first { $0.key == d }?.label ?? d).font(.wr(.caption)).foregroundStyle(Color.muted) }
                            Spacer()
                            Text(Fmt.relative(e.at)).font(.wr(.caption)).foregroundStyle(Color.muted)
                        }
                        if let t = e.target?.nilIfEmpty { Text(t).font(.wr(.caption)).foregroundStyle(Color.ink2).lineLimit(2) }
                        HStack(spacing: 4) {
                            if let mod = e.moderator?.displayName { Text("von \(mod)") }
                            if let r = e.reason?.nilIfEmpty { Text("· „\(r)“") }
                        }
                        .font(.wr(.caption2)).foregroundStyle(Color.muted)
                    }
                    .accessibilityElement(children: .combine)
                }
            } header: { Text("Moderationsprotokoll") }

            if p.membership?.role == "OWNER" {
                Section {
                    Button(role: .destructive) { dissolveName = ""; showDissolve = true } label: {
                        Label("Community auflösen …", systemImage: "trash")
                    }
                } header: { Text("Gefahrenzone") } footer: {
                    Text("Die Community wird archiviert und ist nicht mehr erreichbar. Beiträge und Moderationsverlauf bleiben für Meldungen nachvollziehbar. Mitglieder werden benachrichtigt.")
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .refreshable { await load() }
    }

    private func memberRow(_ mem: CommunityMemberRow) -> some View {
        let isSelf = mem.userId == app.me?.id
        let isOwner = mem.role == "OWNER"
        return CommunityMemberLine(member: mem, trailing: (isSelf || isOwner) ? nil : AnyView(
            Menu {
                if isManager {
                    Section("Rolle") {
                        ForEach(["ADMIN", "MODERATOR", "MEMBER"], id: \.self) { role in
                            Button {
                                Task { await memberAction(mem, "role", ["role": .string(role)], success: "\(mem.displayName) ist jetzt \(L.communityRoles[role] ?? role).") }
                            } label: {
                                if mem.role == role { Label(L.communityRoles[role] ?? role, systemImage: "checkmark") } else { Text(L.communityRoles[role] ?? role) }
                            }
                        }
                    }
                    if page?.membership?.role == "OWNER" || app.me?.isAdmin == true {
                        Button("Leitung übertragen …", systemImage: "crown") { transferTarget = mem }
                    }
                }
                Section {
                    if mem.isMuted {
                        Button("Stummschaltung aufheben", systemImage: "speaker.wave.2") {
                            Task { await memberAction(mem, "mute", ["until": .null], success: "Stummschaltung aufgehoben.") }
                        }
                    } else {
                        Button("Stummschalten …", systemImage: "speaker.slash") { muteTarget = mem }
                    }
                    Button("Entfernen …", systemImage: "person.badge.minus") { removeTarget = (mem, false) }
                    Button("Sperren …", systemImage: "hand.raised", role: .destructive) { removeTarget = (mem, true) }
                }
            } label: {
                Image(systemName: "ellipsis.circle").font(.wr(.title3)).foregroundStyle(Color.muted).frame(width: 44, height: 44)
            }
            .accessibilityLabel("Aktionen für \(mem.displayName)")
        ))
    }
}

// MARK: - Challenge anlegen

struct CommunityChallengeSheet: View {
    var communityId: String
    var onCreated: () -> Void
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var description = ""
    @State private var startsAt = Date()
    @State private var endsAt = Date().addingTimeInterval(86400 * 30)
    @State private var fields: [String: String] = [:]

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Titel, z. B. „Novemberdecke“", text: $title)
                    DiscoverFieldError(message: fields["title"])
                    TextField("Worum geht es? Regeln, Ziel, Hashtag …", text: $description, axis: .vertical).lineLimit(3...8)
                }
                Section {
                    DatePicker("Start", selection: $startsAt)
                    DatePicker("Ende", selection: $endsAt, in: startsAt...)
                    DiscoverFieldError(message: fields["endsAt"])
                } footer: { Text("Laufende und bald startende Challenges erscheinen als Banner auf der Community-Seite.") }
            }
            .scrollContentBackground(.hidden)
            .background(Color.paper)
            .navigationTitle("Neue Challenge")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    AsyncButton("Anlegen") { await save() }
                        .disabled(title.trimmed.count < 3 || endsAt <= startsAt)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func save() async {
        let body: [String: JSONValue] = [
            "title": .string(title.trimmed), "description": .string(description.trimmed),
            "startsAt": .string(JSON.isoFormatter.string(from: startsAt)), "endsAt": .string(JSON.isoFormatter.string(from: endsAt)),
        ]
        do {
            try await APIClient.shared.action("POST", "/communities/\(communityId)/challenges", body)
            app.show("Challenge angelegt.")
            onCreated()
            dismiss()
        } catch let e as APIError {
            fields = e.fields ?? [:]
            app.show(error: e)
        } catch { app.show(error: error) }
    }
}
