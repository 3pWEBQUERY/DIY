import SwiftUI

// MARK: - Gruppen-Avatar (zwei überlappende Profilbilder)

struct SocialGroupAvatar: View {
    var avatars: [(name: String, url: String?)]
    var size: CGFloat = 48

    var body: some View {
        let inner = (size * 0.68).rounded()
        ZStack {
            if let b = avatars[safe: 1] {
                AvatarView(url: b.url, name: b.name, size: inner)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
            }
            if let a = avatars.first {
                AvatarView(url: a.url, name: a.name, size: inner)
                    .overlay(Circle().strokeBorder(Color.paper, lineWidth: 2))
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: avatars.count > 1 ? .bottomLeading : .center)
            } else {
                Circle().fill(Color.sunken)
                    .overlay(Image(systemName: "person.3").font(.wr(size: size * 0.32)).foregroundStyle(Color.muted))
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

// MARK: - Personenauswahl

/// Auswahl aus Personen, denen ich folge – oder direkte Eingabe eines @handles.
struct GroupMemberPicker: View {
    var candidates: [SocialGroupCandidate]
    @Binding var selection: [String]
    var exclude: Set<String> = []
    var max: Int

    @State private var query = ""

    private var term: String { query.trimmed.replacingOccurrences(of: "@", with: "").lowercased() }
    private var pool: [SocialGroupCandidate] { candidates.filter { !exclude.contains($0.handle) } }
    private var shown: [SocialGroupCandidate] {
        let t = term
        return Array(pool.filter { t.isEmpty || $0.handle.lowercased().contains(t) || $0.displayName.lowercased().contains(t) }.prefix(50))
    }
    private var full: Bool { selection.count >= max }
    private var canAddTyped: Bool {
        let t = term
        return t.count >= 2 && !full && !selection.contains(t) && !exclude.contains(t) && !candidates.contains { $0.handle.lowercased() == t }
            && t.range(of: "^[a-z0-9._-]+$", options: .regularExpression) != nil
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !selection.isEmpty {
                FlowLayout(spacing: 6) {
                    ForEach(selection, id: \.self) { h in
                        let c = candidates.first { $0.handle == h }
                        Button { toggle(h) } label: {
                            HStack(spacing: 6) {
                                AvatarView(url: c?.avatarUrl, name: c?.displayName ?? h, size: 22)
                                Text(c?.displayName ?? "@\(h)").font(.wr(.footnote, .semibold)).foregroundStyle(Color.ink).lineLimit(1)
                                Image(systemName: "xmark").font(.wr(size: 9, weight: .bold)).foregroundStyle(Color.muted)
                            }
                            .padding(.leading, 3).padding(.trailing, 10).padding(.vertical, 3)
                            .background(Color.mossSoft, in: Capsule())
                            .overlay(Capsule().strokeBorder(Color.moss.opacity(0.5), lineWidth: 0.75))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("\(c?.displayName ?? "@\(h)") entfernen")
                    }
                }
            }

            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass").foregroundStyle(Color.muted)
                TextField("Name oder @benutzername", text: $query)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.done)
                    .onSubmit {
                        if canAddTyped { toggle(term); query = "" } else if shown.count == 1, let h = shown.first?.handle { toggle(h); query = "" }
                    }
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 44)
            .sunkenSurface(radius: 14)

            VStack(spacing: 0) {
                if canAddTyped {
                    Button { toggle(term); query = "" } label: {
                        HStack(spacing: 12) {
                            Text("@").font(.wr(.subheadline, .semibold)).foregroundStyle(Color.muted)
                                .frame(width: 36, height: 36).background(Color.sunken, in: Circle())
                            Text("**@\(term)** hinzufügen").font(.wr(.subheadline)).foregroundStyle(Color.ink)
                            Spacer(minLength: 0)
                        }
                        .padding(.vertical, 8)
                        .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                }
                ForEach(shown) { c in
                    let on = selection.contains(c.handle)
                    Button { toggle(c.handle) } label: {
                        HStack(spacing: 12) {
                            AvatarView(url: c.avatarUrl, name: c.displayName, size: 36)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(c.displayName).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink).lineLimit(1)
                                Text("@\(c.handle)").font(.wr(.caption)).foregroundStyle(Color.muted).lineLimit(1)
                            }
                            Spacer(minLength: 0)
                            Image(systemName: on ? "checkmark.circle.fill" : "circle")
                                .font(.wr(.title3))
                                .foregroundStyle(on ? Color.moss : Color.lineStrong)
                        }
                        .padding(.vertical, 8)
                        .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                    .disabled(!on && full)
                    .opacity(!on && full ? 0.4 : 1)
                    .accessibilityAddTraits(on ? .isSelected : [])
                    if c.id != shown.last?.id { Divider().overlay(Color.line) }
                }
                if shown.isEmpty && !canAddTyped {
                    Text(pool.isEmpty ? "Folge Personen, um sie hier zu finden – oder gib einen @benutzernamen ein." : "Niemand gefunden.")
                        .font(.wr(.footnote)).foregroundStyle(Color.muted)
                        .frame(maxWidth: .infinity)
                        .multilineTextAlignment(.center)
                        .padding(.vertical, 16)
                }
            }
        }
    }

    private func toggle(_ h: String) {
        Haptics.selection()
        withAnimation(.snappy) {
            if let i = selection.firstIndex(of: h) { selection.remove(at: i) } else if !full { selection.append(h) }
        }
    }
}

// MARK: - Neue Gruppe

struct NewGroupSheet: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var handles: [String] = []
    @State private var message = ""
    @State private var candidates: [SocialGroupCandidate]?
    @State private var fields: [String: String] = [:]
    @State private var sending = false
    @FocusState private var titleFocused: Bool

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Space.xl) {
                    Text("Für Werkstatt-Runden, gemeinsame Projekte oder eure Strickgruppe – bis zu \(SocialGroupLimits.maxMembers) Personen.")
                        .font(.wr(.subheadline)).foregroundStyle(Color.muted)

                    VStack(alignment: .leading, spacing: 8) {
                        SpecLabel("Name der Gruppe")
                        TextField("z. B. Strickrunde Oerlikon", text: $title)
                            .font(.wr(.body))
                            .focused($titleFocused)
                            .padding(.horizontal, 14).frame(minHeight: 48)
                            .cardSurface(radius: 14)
                            .onChange(of: title) { _, v in if v.count > SocialGroupLimits.titleMax { title = String(v.prefix(SocialGroupLimits.titleMax)) } }
                        if let e = fields["title"] { Text(e).font(.wr(.caption, .semibold)).foregroundStyle(Color.danger) }
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        HStack(alignment: .firstTextBaseline) {
                            SpecLabel("Mitglieder")
                            Spacer()
                            Text("\(handles.count) gewählt, mindestens 2").font(.wr(.caption)).foregroundStyle(handles.count >= 2 ? Color.moss : Color.muted)
                        }
                        Group {
                            if let candidates {
                                GroupMemberPicker(candidates: candidates, selection: $handles, max: SocialGroupLimits.maxMembers - 1)
                            } else {
                                LoadingView().frame(minHeight: 120)
                            }
                        }
                        .padding(14)
                        .cardSurface(radius: 18)
                        if let e = fields["handles"] { Text(e).font(.wr(.caption, .semibold)).foregroundStyle(Color.danger) }
                        Text("Wer nur Nachrichten von Personen annimmt, denen sie oder er folgt, bekommt eine Einladung und entscheidet selbst.")
                            .font(.wr(.caption)).foregroundStyle(Color.muted)
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        SpecLabel("Erste Nachricht (optional)")
                        TextField("Hallo zusammen …", text: $message, axis: .vertical)
                            .lineLimit(3...8)
                            .font(.wr(.body))
                            .padding(14)
                            .cardSurface(radius: 14)
                    }
                }
                .padding(.horizontal, Space.gutter)
                .padding(.vertical, Space.l)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Color.paper)
            .navigationTitle("Neue Gruppe")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button { Task { await create() } } label: {
                        if sending { ProgressView() } else { Text("Erstellen") }
                    }
                    .buttonStyle(.glassProminent)
                    .tint(.action)
                    .disabled(sending || title.trimmed.isEmpty || handles.count < 2)
                }
            }
            .task {
                titleFocused = true
                await loadCandidates()
            }
        }
        .interactiveDismissDisabled(!title.trimmed.isEmpty || !handles.isEmpty || !message.trimmed.isEmpty)
    }

    private func loadCandidates() async {
        do {
            let c: [SocialGroupCandidate] = try await APIClient.shared.get("/conversations/groups/candidates")
            withAnimation(.snappy) { candidates = c }
        } catch is CancellationError {
        } catch {
            candidates = []
            app.show(error: error)
        }
    }

    private func create() async {
        sending = true
        defer { sending = false }
        fields = [:]
        let body: [String: JSONValue] = ["title": .string(title.trimmed), "handles": .from(handles), "body": .string(message.trimmed)]
        do {
            let r: SocialGroupCreated = try await APIClient.shared.post("/conversations/groups", body)
            let invited = r.invited ?? []
            app.show(invited.isEmpty ? "Gruppe „\(title.trimmed)“ erstellt." : SocialGroupText.addedMessage(added: [], invited: invited))
            await app.refreshCounts()
            dismiss()
            let id = r.conversationId
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(350))
                router.open(.conversation(id: id))
            }
        } catch let e as APIError {
            fields = e.fields ?? [:]
            app.show(error: e)
        } catch {
            app.show(error: error)
        }
    }
}

// MARK: - Gruppeninfo

/// Mitglieder, Umbenennen, Hinzufügen/Entfernen, Admin-Rechte (Admins) und Verlassen (alle).
struct GroupInfoSheet: View {
    var conversationId: String
    var group: SocialGroup
    /// Nach jeder Änderung: Unterhaltung neu laden (liefert die aktuelle Gruppe)
    var reload: () async -> SocialGroup?
    var onLeft: () -> Void

    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @Environment(\.dismiss) private var dismiss

    @State private var current: SocialGroup
    @State private var title: String
    @State private var editing = false
    @State private var adding = false
    @State private var candidates: [SocialGroupCandidate]?
    @State private var handles: [String] = []
    @State private var busy = false
    @State private var removeTarget: SocialGroupMember?
    @State private var confirmLeave = false

    init(conversationId: String, group: SocialGroup, reload: @escaping () async -> SocialGroup?, onLeft: @escaping () -> Void) {
        self.conversationId = conversationId
        self.group = group
        self.reload = reload
        self.onLeft = onLeft
        _current = State(initialValue: group)
        _title = State(initialValue: group.title)
    }

    private var room: Int { SocialGroupLimits.maxMembers - current.members.count }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    if editing {
                        HStack(spacing: 10) {
                            TextField("Gruppenname", text: $title)
                                .font(.wr(.body))
                                .submitLabel(.done)
                                .onSubmit { Task { await rename() } }
                                .onChange(of: title) { _, v in if v.count > SocialGroupLimits.titleMax { title = String(v.prefix(SocialGroupLimits.titleMax)) } }
                            AsyncButton("Speichern") { await rename() }
                                .buttonStyle(.glassProminent).tint(.action)
                                .disabled(title.trimmed.isEmpty)
                        }
                    } else {
                        HStack(spacing: 14) {
                            SocialGroupAvatar(avatars: current.others.prefix(2).map { ($0.displayName, $0.avatarUrl) }, size: 52)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(current.title).font(.titleSerif).foregroundStyle(Color.ink)
                                Text("\(current.members.count) von \(SocialGroupLimits.maxMembers) Personen").font(.wr(.caption)).foregroundStyle(Color.muted)
                            }
                            Spacer(minLength: 0)
                            if current.isAdmin {
                                Button { editing = true } label: { Image(systemName: "pencil") }
                                    .buttonStyle(.glass)
                                    .accessibilityLabel("Gruppe umbenennen")
                            }
                        }
                    }
                }
                .listRowBackground(Color.card)

                if adding {
                    Section {
                        if let candidates {
                            GroupMemberPicker(candidates: candidates, selection: $handles, exclude: Set(current.members.map(\.handle)), max: max(0, room))
                                .padding(.vertical, 6)
                        } else {
                            LoadingView().frame(minHeight: 100)
                        }
                        HStack {
                            Button("Abbrechen") { withAnimation(.snappy) { adding = false; handles = [] } }
                                .buttonStyle(.glass)
                            Spacer()
                            AsyncButton { await addMembers() } label: { Text("Hinzufügen").font(.wr(.subheadline, .semibold)) }
                                .buttonStyle(.glassProminent).tint(.action)
                                .disabled(handles.isEmpty)
                        }
                    } header: { Text("Personen hinzufügen") }
                    .listRowBackground(Color.card)
                }

                Section {
                    ForEach(current.sortedMembers) { m in memberRow(m) }
                } header: {
                    HStack {
                        Text("Mitglieder")
                        Spacer()
                        if current.isAdmin && room > 0 && !adding {
                            Button {
                                withAnimation(.snappy) { adding = true }
                                if candidates == nil { Task { await loadCandidates() } }
                            } label: { Label("Hinzufügen", systemImage: "person.badge.plus").font(.wr(.footnote, .semibold)) }
                            .textCase(nil)
                        }
                    }
                }
                .listRowBackground(Color.card)

                Section {
                    Button(role: .destructive) { confirmLeave = true } label: {
                        Label("Gruppe verlassen", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                    .disabled(busy)
                } footer: { Text("Du erhältst danach keine Nachrichten mehr aus dieser Gruppe.") }
                .listRowBackground(Color.card)
            }
            .scrollContentBackground(.hidden)
            .background(Color.paper)
            .navigationTitle("Gruppeninfo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Fertig") { dismiss() } }
            }
            .confirmationDialog("\(removeTarget?.displayName ?? "Person") aus der Gruppe entfernen?", isPresented: Binding(get: { removeTarget != nil }, set: { if !$0 { removeTarget = nil } }), titleVisibility: .visible) {
                Button("Entfernen", role: .destructive) {
                    if let m = removeTarget { Task { await remove(m) } }
                    removeTarget = nil
                }
            }
            .confirmationDialog("Gruppe verlassen?", isPresented: $confirmLeave, titleVisibility: .visible) {
                Button("Verlassen", role: .destructive) { Task { await leave() } }
            } message: { Text("Du erhältst danach keine Nachrichten mehr aus dieser Gruppe.") }
        }
    }

    private func memberRow(_ m: SocialGroupMember) -> some View {
        HStack(spacing: 12) {
            Button {
                dismiss()
                let h = m.handle
                Task { @MainActor in
                    try? await Task.sleep(for: .milliseconds(350))
                    router.open(.profile(handle: h))
                }
            } label: {
                HStack(spacing: 12) {
                    AvatarView(url: m.avatarUrl, name: m.displayName, size: 38)
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 6) {
                            Text(m.isMe ? "Du" : m.displayName).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink).lineLimit(1)
                            if m.isAdmin { Pill(text: "Admin", tint: .moss) }
                            if m.isPending { Pill(text: "Eingeladen", tint: .muted) }
                        }
                        Text("@\(m.handle)").font(.wr(.caption)).foregroundStyle(Color.muted).lineLimit(1)
                    }
                }
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .disabled(m.handle.isEmpty)
            Spacer(minLength: 0)
            if current.isAdmin && !m.isMe {
                Menu {
                    if !m.isPending {
                        Button(m.isAdmin ? "Admin-Rechte entziehen" : "Zum Admin machen", systemImage: "checkmark.shield") {
                            Task { await setAdmin(m, !m.isAdmin) }
                        }
                    }
                    Button(m.isPending ? "Einladung zurückziehen" : "Aus der Gruppe entfernen", systemImage: "person.badge.minus", role: .destructive) { removeTarget = m }
                } label: {
                    Image(systemName: "ellipsis.circle").font(.wr(.title3)).foregroundStyle(Color.muted).frame(width: 44, height: 44)
                }
                .disabled(busy)
                .accessibilityLabel("Aktionen für \(m.displayName)")
            }
        }
    }

    // MARK: Aktionen

    private func refresh() async {
        if let g = await reload() {
            withAnimation(.snappy) { current = g; if !editing { title = g.title } }
        }
    }

    private func loadCandidates() async {
        do {
            let c: [SocialGroupCandidate] = try await APIClient.shared.get("/conversations/groups/candidates")
            withAnimation(.snappy) { candidates = c }
        } catch {
            candidates = []
            app.show(error: error)
        }
    }

    private func rename() async {
        let t = title.trimmed
        guard !t.isEmpty else { return }
        busy = true
        defer { busy = false }
        if await app.run("Gruppe umbenannt.", { _ = try await APIClient.shared.patch("/conversations/\(conversationId)", ["title": JSONValue.string(t)]) as JSONValue }) {
            editing = false
            await refresh()
        }
    }

    private func addMembers() async {
        busy = true
        defer { busy = false }
        do {
            let r: SocialGroupMembersAdded = try await APIClient.shared.post("/conversations/\(conversationId)/members", ["handles": JSONValue.from(handles)])
            app.show(SocialGroupText.addedMessage(added: r.added ?? [], invited: r.invited ?? []))
            withAnimation(.snappy) { adding = false; handles = [] }
            await refresh()
        } catch {
            app.show(error: error)
        }
    }

    private func remove(_ m: SocialGroupMember) async {
        busy = true
        defer { busy = false }
        if await app.run("\(m.displayName) entfernt.", { _ = try await APIClient.shared.delete("/conversations/\(conversationId)/members/\(m.id)") as JSONValue }) {
            await refresh()
        }
    }

    private func setAdmin(_ m: SocialGroupMember, _ admin: Bool) async {
        busy = true
        defer { busy = false }
        if await app.run(admin ? "\(m.displayName) ist jetzt Admin." : "\(m.displayName) ist kein Admin mehr.", {
            _ = try await APIClient.shared.post("/conversations/\(conversationId)/members/\(m.id)/admin", ["admin": JSONValue.bool(admin)]) as JSONValue
        }) {
            await refresh()
        }
    }

    private func leave() async {
        busy = true
        defer { busy = false }
        do {
            let r: SocialGroupLeft = try await APIClient.shared.post("/conversations/\(conversationId)/leave")
            app.show(r.dissolved == true ? "Gruppe verlassen und aufgelöst." : "Du hast die Gruppe verlassen.")
            await app.refreshCounts()
            dismiss()
            onLeft()
        } catch {
            app.show(error: error)
        }
    }
}
