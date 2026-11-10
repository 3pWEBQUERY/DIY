import SwiftUI

// Ergänzungen der Beitragskarte und -seite: Koautor:innen, Umfragen, Planung.
// Web-Gegenstücke: components/social/post-card.tsx, poll.tsx, coauthor-dialog.tsx, people-picker.tsx.

// MARK: - Autor:innen-Zeile („Lena Brunner mit Mattia Rossi“)

enum SocialAuthors {
    /// Namen als ein Text: „A“, „A mit B“, „A mit B und C“, „A mit B, C und D“.
    static func names(_ post: PostItem, font: Font = .wr(.subheadline, .semibold)) -> Text {
        let co = post.coauthors ?? []
        var t = Text(post.author.displayName).font(font).foregroundStyle(Color.ink)
        for (i, c) in co.enumerated() {
            let sep = i == 0 ? " mit " : i == co.count - 1 ? " und " : ", "
            let sepText = Text(sep).font(font.weight(.regular)).foregroundStyle(Color.muted)
            let name = Text(c.displayName).font(font).foregroundStyle(Color.ink)
            t = Text("\(t)\(sepText)\(name)")
        }
        return t
    }

    static func accessibility(_ post: PostItem) -> String {
        let co = (post.coauthors ?? []).map(\.displayName)
        guard !co.isEmpty else { return post.author.displayName }
        return "\(post.author.displayName) mit \(ListFormatter.localizedString(byJoining: co))"
    }
}

/// Kleine, überlappende Avatare der Koautor:innen (unten rechts am Avatar der Autorin/des Autors).
struct SocialCoauthorBadge: View {
    var coauthors: [UserMini]
    var size: CGFloat = 20

    var body: some View {
        if !coauthors.isEmpty {
            HStack(spacing: -size * 0.4) {
                ForEach(coauthors.prefix(2)) { c in
                    AvatarView(url: c.avatarUrl, name: c.displayName, size: size)
                        .padding(1.5)
                        .background(Color.card, in: Circle())
                }
            }
            .offset(x: size * 0.35, y: size * 0.35)
            .accessibilityHidden(true)
        }
    }
}

/// Koautor:innen als antippbare Zeile (Beitragsseite)
struct SocialCoauthorRow: View {
    var coauthors: [UserMini]
    @Environment(Router.self) private var router

    var body: some View {
        if !coauthors.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    SpecLabel("Mit")
                    ForEach(coauthors) { c in
                        Button { router.open(.profile(handle: c.handle)) } label: {
                            HStack(spacing: 6) {
                                AvatarView(url: c.avatarUrl, name: c.displayName, size: 22)
                                Text(c.displayName).font(.wr(.footnote, .semibold)).foregroundStyle(Color.ink)
                            }
                            .padding(.leading, 3).padding(.trailing, 10).padding(.vertical, 3)
                            .background(Color.sunken, in: Capsule())
                            .frame(minHeight: 44)
                            .contentShape(.rect)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Profil von \(c.displayName)")
                    }
                }
            }
            .scrollClipDisabled()
        }
    }
}

// MARK: - Menüpunkte (Karte & Beitragsseite)

/// „Koautor:innen“ (eigener Beitrag) bzw. „Koautorenschaft“ (bestätigte Koautor:in).
struct SocialPostMenuItems: View {
    var post: PostItem
    @Environment(Router.self) private var router

    var body: some View {
        if post.viewer?.isAuthor == true, post.repostOf == nil, post.community == nil {
            Button("Koautor:innen", systemImage: "person.2") { router.present(.coauthors(postId: post.id)) }
        } else if post.viewer?.isCoauthor == true {
            Button("Koautorenschaft …", systemImage: "person.2") { router.present(.coauthors(postId: post.id, asCoauthor: true)) }
        }
    }
}

// MARK: - Umfrage

/// Umfrage im Beitrag. Einfachauswahl stimmt mit einem Tipp ab, Mehrfachauswahl über „Abstimmen“.
/// Ergebnisse erscheinen nach der eigenen Stimme bzw. nach Ende.
struct SocialPollView: View {
    var postId: String
    @State private var poll: SocialPoll
    @State private var picked: [String] = []
    @State private var sending = false
    @Environment(AppState.self) private var app

    init(postId: String, poll: SocialPoll) {
        self.postId = postId
        _poll = State(initialValue: poll)
    }

    private var signedIn: Bool { app.me != nil }
    private var canVote: Bool { signedIn && !poll.isEnded && poll.myVotes.isEmpty }
    private var showResults: Bool { poll.showResults == true && !canVote }
    private var maxVotes: Int { max(1, poll.options.map { $0.votes ?? 0 }.max() ?? 0) }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(poll.options) { o in
                if showResults { result(o) } else { choice(o) }
            }
            footer
        }
        .disabled(sending)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Umfrage")
    }

    private func result(_ o: SocialPoll.Option) -> some View {
        let mine = poll.myVotes.contains(o.id)
        let votes = o.votes ?? 0
        let share = poll.voters > 0 ? Double(votes) / Double(poll.voters) : 0
        let leading = votes == maxVotes && votes > 0
        return HStack(spacing: 8) {
            Text(o.label)
                .font(.wr(.subheadline, leading ? .semibold : .regular))
                .foregroundStyle(Color.ink)
                .multilineTextAlignment(.leading)
            Spacer(minLength: 4)
            if mine { Image(systemName: "checkmark").font(.wr(.caption, .bold)).foregroundStyle(Color.moss).accessibilityLabel("Deine Stimme") }
            Text("\(Int((share * 100).rounded())) %").font(.wr(.footnote, .semibold)).monospacedDigit().foregroundStyle(Color.ink)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .frame(minHeight: 44)
        .background(alignment: .leading) {
            GeometryReader { g in
                Rectangle()
                    .fill(mine ? Color.mossSoft : Color.sunken)
                    .frame(width: g.size.width * share)
                    .animation(.snappy(duration: 0.5), value: share)
            }
        }
        .clipShape(.rect(cornerRadius: Radius.inner, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: Radius.inner, style: .continuous).stroke(Color.line, lineWidth: 1) }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(o.label): \(Int((share * 100).rounded())) Prozent\(mine ? ", deine Stimme" : "")")
    }

    private func choice(_ o: SocialPoll.Option) -> some View {
        let on = picked.contains(o.id)
        return Button {
            guard canVote else { return }
            Haptics.selection()
            if !poll.isMultiple {
                Task { await vote([o.id]) }
            } else {
                withAnimation(.snappy) { if on { picked.removeAll { $0 == o.id } } else { picked.append(o.id) } }
            }
        } label: {
            HStack(spacing: 12) {
                ZStack {
                    if poll.isMultiple {
                        RoundedRectangle(cornerRadius: 5, style: .continuous).strokeBorder(on ? Color.moss : Color.lineStrong, lineWidth: 1.5)
                            .background(on ? Color.moss : .clear, in: .rect(cornerRadius: 5, style: .continuous))
                    } else {
                        Circle().strokeBorder(on ? Color.moss : Color.lineStrong, lineWidth: 1.5)
                    }
                    if on { Image(systemName: "checkmark").font(.wr(size: 10, weight: .bold)).foregroundStyle(Color.paper) }
                }
                .frame(width: 18, height: 18)
                Text(o.label).font(.wr(.subheadline)).foregroundStyle(Color.ink).multilineTextAlignment(.leading)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .frame(minHeight: 44)
            .background(on ? Color.mossSoft : Color.card, in: .rect(cornerRadius: Radius.inner, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: Radius.inner, style: .continuous).stroke(on ? Color.moss : Color.lineStrong, lineWidth: 1) }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .disabled(!canVote)
        .accessibilityAddTraits(on ? [.isSelected] : [])
        .accessibilityHint(poll.isMultiple ? "Auswählen" : "Abstimmen")
    }

    private var footer: some View {
        HStack(spacing: 10) {
            Text([Fmt.plural(poll.voters, "Stimme", "Stimmen"), Self.remaining(poll), poll.isMultiple ? "Mehrfachauswahl" : nil].compactMap { $0 }.joined(separator: " · "))
                .font(.wr(.caption))
                .foregroundStyle(Color.muted)
            Spacer(minLength: 0)
            if sending {
                ProgressView().controlSize(.small)
            } else if canVote && poll.isMultiple {
                Button("Abstimmen") { Task { await vote(picked) } }
                    .font(.wr(.footnote, .semibold))
                    .buttonStyle(.glassProminent)
                    .tint(.action)
                    .controlSize(.small)
                    .disabled(picked.isEmpty)
            } else if canVote && poll.showResults != true {
                Text("Ergebnis nach deiner Stimme").font(.wr(.caption)).foregroundStyle(Color.muted)
            } else if !signedIn && !poll.isEnded {
                Text("Anmelden zum Abstimmen").font(.wr(.caption, .semibold)).foregroundStyle(Color.ink2)
            }
        }
        .padding(.top, 2)
    }

    static func remaining(_ poll: SocialPoll) -> String {
        guard let end = poll.endsAt, !poll.isEnded else { return "Beendet" }
        let h = Int((end.timeIntervalSinceNow / 3600).rounded())
        if h < 1 { return "Endet in Kürze" }
        if h < 24 { return "Noch \(h) \(h == 1 ? "Stunde" : "Stunden")" }
        let d = Int((Double(h) / 24).rounded())
        return "Noch \(d) \(d == 1 ? "Tag" : "Tage")"
    }

    private func vote(_ ids: [String]) async {
        guard !ids.isEmpty, !sending else { return }
        sending = true
        defer { sending = false }
        do {
            let next: SocialPoll? = try await APIClient.shared.post("/posts/\(postId)/poll", ["optionIds": JSONValue.from(ids)])
            Haptics.success()
            if let next { withAnimation(.snappy) { poll = next; picked = [] } }
        } catch {
            app.show(error: error)
        }
    }
}

/// Umfrage-Editor im Composer: Antworten (2–4), Laufzeit, Mehrfachauswahl.
struct SocialPollEditor: View {
    @Binding var poll: SocialPollDraft
    var onRemove: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                SpecLabel("Umfrage")
                Spacer()
                Button("Umfrage entfernen", action: onRemove)
                    .font(.wr(.footnote))
                    .foregroundStyle(Color.muted)
                    .buttonStyle(.plain)
                    .frame(minHeight: 32)
            }
            ForEach(poll.options.indices, id: \.self) { i in
                HStack(spacing: 8) {
                    TextField("Antwort \(i + 1)", text: Binding(
                        get: { poll.options.indices.contains(i) ? poll.options[i] : "" },
                        set: { v in if poll.options.indices.contains(i) { poll.options[i] = String(v.prefix(SocialPollDraft.maxLength)) } }
                    ))
                    .font(.wr(.subheadline))
                    .padding(.horizontal, 12)
                    .frame(minHeight: 44)
                    .background(Color.card, in: .rect(cornerRadius: Radius.small, style: .continuous))
                    .overlay { RoundedRectangle(cornerRadius: Radius.small, style: .continuous).stroke(Color.lineStrong, lineWidth: 1) }
                    .accessibilityLabel("Antwort \(i + 1)")
                    if poll.options.count > 2 {
                        Button {
                            withAnimation(.snappy) { _ = poll.options.remove(at: i) }
                        } label: {
                            Image(systemName: "xmark").font(.wr(.footnote, .semibold)).foregroundStyle(Color.muted).frame(width: 36, height: 44).contentShape(.rect)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Antwort \(i + 1) entfernen")
                    }
                }
            }
            if poll.options.count < SocialPollDraft.maxOptions {
                Button {
                    withAnimation(.snappy) { poll.options.append("") }
                } label: {
                    Label("Antwort hinzufügen", systemImage: "plus").font(.wr(.footnote, .semibold)).foregroundStyle(Color.moss)
                }
                .buttonStyle(.plain)
                .frame(minHeight: 36)
            }
            Divider().overlay(Color.line)
            HStack {
                Text("Laufzeit").font(.wr(.subheadline)).foregroundStyle(Color.ink2)
                Spacer()
                Picker("Laufzeit", selection: $poll.durationHours) {
                    ForEach(SocialPollDraft.durations, id: \.hours) { Text($0.label).tag($0.hours) }
                }
                .pickerStyle(.menu)
                .tint(Color.ink)
                .labelsHidden()
            }
            .frame(minHeight: 40)
            Toggle("Mehrfachauswahl erlauben", isOn: $poll.multiple)
                .font(.wr(.subheadline))
                .foregroundStyle(Color.ink2)
                .tint(.moss)
            if !poll.isReady {
                Text("Fülle mindestens zwei verschiedene Antworten aus. Die Frage ist dein Beitragstext.")
                    .font(.wr(.caption))
                    .foregroundStyle(Color.muted)
            }
        }
        .padding(16)
        .cardSurface()
    }
}

// MARK: - Personen-Auswahl (Koautor:innen)

/// Vorschläge (Personen, denen du folgst, und Follower) durchsuchen oder einen Profilnamen direkt eingeben.
struct SocialPeoplePicker: View {
    @Binding var selection: [SocialPerson]
    var candidates: [SocialPerson]?
    var exclude: [String] = []
    var max: Int = SocialPerson.maxCoauthors

    @State private var query = ""

    private var term: String { query.trimmed.replacingOccurrences(of: "@", with: "").lowercased() }
    private var full: Bool { selection.count >= max }
    private var pool: [SocialPerson] { (candidates ?? []).filter { !exclude.contains($0.handle) } }
    private var shown: [SocialPerson] {
        Array(pool.filter { term.isEmpty || $0.handle.contains(term) || $0.displayName.lowercased().contains(term) }.prefix(50))
    }
    private var canAddTyped: Bool {
        term.range(of: "^[a-z0-9._]{2,30}$", options: .regularExpression) != nil
            && !(candidates ?? []).contains { $0.handle == term }
            && !selection.contains { $0.handle == term }
            && !exclude.contains(term) && !full
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !selection.isEmpty {
                FlowLayout(spacing: 6) {
                    ForEach(selection) { p in
                        Button { toggle(p) } label: {
                            HStack(spacing: 6) {
                                AvatarView(url: p.avatarUrl, name: p.displayName, size: 22)
                                Text(p.displayName).font(.wr(.footnote, .semibold)).foregroundStyle(Color.ink)
                                Image(systemName: "xmark").font(.wr(.caption2, .bold)).foregroundStyle(Color.muted)
                            }
                            .padding(.leading, 3).padding(.trailing, 10).padding(.vertical, 3)
                            .background(Color.mossSoft, in: Capsule())
                            .overlay { Capsule().stroke(Color.moss, lineWidth: 1) }
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("\(p.displayName) entfernen")
                    }
                }
            }
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundStyle(Color.muted)
                TextField("Name oder @benutzername", text: $query)
                    .font(.wr(.subheadline))
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.done)
                    .onSubmit {
                        if shown.count == 1, let p = shown.first { toggle(p) } else if canAddTyped { addTyped() }
                        query = ""
                    }
                    .accessibilityLabel("Personen suchen")
            }
            .padding(.horizontal, 12)
            .frame(minHeight: 44)
            .background(Color.card, in: .rect(cornerRadius: Radius.small, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: Radius.small, style: .continuous).stroke(Color.lineStrong, lineWidth: 1) }

            if full {
                Text(max == 1 ? "Du kannst noch eine Person auswählen – entferne sie, um eine andere zu wählen." : "Höchstens \(max) Personen. Entferne jemanden, um eine andere Person zu wählen.")
                    .font(.wr(.caption)).foregroundStyle(Color.muted)
            }

            VStack(spacing: 0) {
                if canAddTyped {
                    Button { addTyped() } label: {
                        HStack(spacing: 10) {
                            Image(systemName: "at").frame(width: 34, height: 34).background(Color.sunken, in: Circle()).foregroundStyle(Color.ink2)
                            Text("@\(term) hinzufügen").font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink)
                            Spacer()
                        }
                        .padding(.vertical, 6).contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                }
                if candidates == nil {
                    ProgressView().frame(maxWidth: .infinity, minHeight: 60)
                } else if shown.isEmpty && !canAddTyped {
                    Text(term.isEmpty ? "Noch keine Vorschläge. Gib einen @benutzernamen ein." : "Niemand gefunden.")
                        .font(.wr(.footnote)).foregroundStyle(Color.muted)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 12)
                }
                ForEach(shown) { p in
                    let on = selection.contains { $0.handle == p.handle }
                    Button { toggle(p) } label: {
                        HStack(spacing: 10) {
                            AvatarView(url: p.avatarUrl, name: p.displayName, size: 34)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(p.displayName).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink)
                                Text("@\(p.handle)").font(.wr(.caption)).foregroundStyle(Color.muted)
                            }
                            Spacer(minLength: 0)
                            Image(systemName: on ? "checkmark.circle.fill" : "circle")
                                .font(.wr(.title3))
                                .foregroundStyle(on ? Color.moss : Color.lineStrong)
                        }
                        .padding(.vertical, 6)
                        .frame(minHeight: 44)
                        .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                    .disabled(!on && full)
                    .opacity(!on && full ? 0.45 : 1)
                    .accessibilityAddTraits(on ? [.isSelected] : [])
                }
            }
        }
    }

    private func toggle(_ p: SocialPerson) {
        Haptics.selection()
        withAnimation(.snappy) {
            if let i = selection.firstIndex(where: { $0.handle == p.handle }) { selection.remove(at: i) } else if !full { selection.append(p) }
        }
    }

    private func addTyped() {
        let h = term
        toggle(SocialPerson(id: h, handle: h, displayName: "@\(h)", avatarUrl: nil))
        query = ""
    }
}

/// Koautor:innen-Auswahl im Composer (eigene Seite im Sheet-Stack).
struct SocialCoauthorPickerPage: View {
    @Binding var selection: [SocialPerson]
    @State private var candidates: [SocialPerson]?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Bis zu \(SocialPerson.maxCoauthors) Personen. Sie werden beim Veröffentlichen eingeladen und erscheinen am Beitrag, sobald sie bestätigt haben. Bearbeiten kannst nur du.")
                    .font(.wr(.footnote))
                    .foregroundStyle(Color.muted)
                SocialPeoplePicker(selection: $selection, candidates: candidates)
            }
            .padding(.horizontal, Space.gutter)
            .padding(.vertical, Space.l)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Color.paper)
        .navigationTitle("Koautor:innen")
        .navigationBarTitleDisplayMode(.inline)
        .task { if candidates == nil { candidates = (try? await APIClient.shared.get("/me/coauthor-candidates") as [SocialPerson]) ?? [] } }
    }
}

// MARK: - Koautor:innen verwalten (Sheet)

/// Autor:in: einladen, Status sehen, entfernen. Koautor:in: austreten.
struct SocialCoauthorSheet: View {
    var postId: String
    var asCoauthor = false

    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var rows: [SocialPerson]?
    @State private var error: String?
    @State private var candidates: [SocialPerson]?
    @State private var selection: [SocialPerson] = []
    @State private var confirmLeave = false

    private var free: Int { SocialPerson.maxCoauthors - (rows?.count ?? 0) }

    var body: some View {
        NavigationStack {
            Group {
                if asCoauthor {
                    coauthorContent
                } else if let rows {
                    authorContent(rows)
                } else if let error {
                    ErrorStateView(message: error) { await load() }
                } else {
                    LoadingView()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .background(Color.paper)
            .navigationTitle(asCoauthor ? "Koautorenschaft" : "Koautor:innen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Fertig") { dismiss() } } }
        }
        .presentationDetents(asCoauthor ? [.medium] : [.large])
        .task { if !asCoauthor { await load() } }
    }

    // Autor:in

    private func authorContent(_ rows: [SocialPerson]) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text("Bis zu \(SocialPerson.maxCoauthors) Personen. Sie erscheinen am Beitrag, sobald sie bestätigt haben – bearbeiten kannst nur du.")
                    .font(.wr(.footnote))
                    .foregroundStyle(Color.muted)
                if !rows.isEmpty {
                    VStack(spacing: 0) {
                        ForEach(rows) { r in
                            HStack(spacing: 12) {
                                AvatarView(url: r.avatarUrl, name: r.displayName, size: 34)
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(r.displayName).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink).a11yLineLimit(1)
                                    Text("@\(r.handle)").font(.wr(.caption)).foregroundStyle(Color.muted).a11yLineLimit(1)
                                }
                                Spacer(minLength: 4)
                                MeStatePill(text: r.statusLabel, tone: r.status == "ACCEPTED" ? .moss : .warn)
                                AsyncButton {
                                    await remove(r)
                                } label: {
                                    Image(systemName: "xmark").font(.wr(.footnote, .semibold)).foregroundStyle(Color.muted).frame(width: 36, height: 44).contentShape(.rect)
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel("\(r.displayName) entfernen")
                            }
                            .padding(.horizontal, 14)
                            .padding(.vertical, 6)
                            .overlay(alignment: .bottom) { if r.id != rows.last?.id { Rectangle().fill(Color.line).frame(height: 0.75) } }
                        }
                    }
                    .cardSurface()
                }
                if free > 0 {
                    VStack(alignment: .leading, spacing: 12) {
                        SpecLabel("Einladen")
                        SocialPeoplePicker(selection: $selection, candidates: candidates, exclude: rows.map(\.handle), max: free)
                        AsyncButton {
                            await invite()
                        } label: {
                            Text(selection.count > 1 ? "\(selection.count) Personen einladen" : "Einladen")
                        }
                        .primaryButton()
                        .disabled(selection.isEmpty)
                    }
                } else {
                    Text("Es sind bereits \(SocialPerson.maxCoauthors) Koautor:innen eingeladen. Entferne jemanden, um eine andere Person einzuladen.")
                        .font(.wr(.footnote))
                        .foregroundStyle(Color.muted)
                }
            }
            .padding(.horizontal, Space.gutter)
            .padding(.vertical, Space.l)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    private func load() async {
        do {
            let r: [SocialPerson] = try await APIClient.shared.get("/posts/\(postId)/coauthors")
            withAnimation(.snappy) { rows = r; error = nil }
            if candidates == nil { candidates = (try? await APIClient.shared.get("/me/coauthor-candidates") as [SocialPerson]) ?? [] }
        } catch is CancellationError {
        } catch {
            if rows == nil { self.error = (error as? APIError)?.message ?? error.localizedDescription } else { app.show(error: error) }
        }
    }

    private func invite() async {
        do {
            let r: SocialInviteResult = try await APIClient.shared.post("/posts/\(postId)/coauthors", ["handles": JSONValue.from(selection.map(\.handle))])
            let names = r.invited ?? []
            Haptics.success()
            app.show(r.queued == true ? "Vorgemerkt – die Einladung geht beim Veröffentlichen raus."
                     : names.count == 1 ? "\(names[0]) wurde eingeladen." : "\(names.count) Personen wurden eingeladen.")
            selection = []
            await load()
            NotificationCenter.default.post(name: .socialPostsChanged, object: postId)
        } catch {
            app.show(error: error)
        }
    }

    private func remove(_ r: SocialPerson) async {
        if await app.run("\(r.displayName) entfernt.", { _ = try await APIClient.shared.delete("/posts/\(postId)/coauthors/\(r.id)") as JSONValue }) {
            await load()
            NotificationCenter.default.post(name: .socialPostsChanged, object: postId)
        }
    }

    // Koautor:in

    private var coauthorContent: some View {
        VStack(alignment: .leading, spacing: 16) {
            NoticeView(tone: .info, title: "Du bist Koautor:in", message: "Der Beitrag erscheint mit deinem Namen und in deinem Profil. Bearbeiten und Löschen bleiben bei der Autorin bzw. beim Autor.")
            Button(role: .destructive) { confirmLeave = true } label: {
                Label("Als Koautor:in austreten", systemImage: "rectangle.portrait.and.arrow.right")
                    .font(.wr(.body, .semibold))
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.glass)
            .controlSize(.large)
            .tint(.danger)
        }
        .padding(.horizontal, Space.gutter)
        .padding(.vertical, Space.l)
        .confirmationDialog("Als Koautor:in austreten?", isPresented: $confirmLeave, titleVisibility: .visible) {
            Button("Austreten", role: .destructive) { Task { await leave() } }
        } message: { Text("Du wirst nicht mehr am Beitrag genannt, und er verschwindet aus deinem Profil.") }
    }

    private func leave() async {
        if await app.run("Du bist ausgetreten.", { _ = try await APIClient.shared.delete("/posts/\(postId)/coauthors/me") as JSONValue }) {
            NotificationCenter.default.post(name: .socialPostsChanged, object: postId)
            dismiss()
        }
    }
}

/// Hinweis für eingeladene Personen (Beitragsseite, Benachrichtigungen): bestätigen oder ablehnen.
struct SocialCoauthorInviteCard: View {
    var invite: SocialCoauthorInvite
    var showExcerpt = false
    var onDone: (Bool) -> Void
    @Environment(AppState.self) private var app

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 10) {
                AvatarView(url: invite.author?.avatarUrl, name: invite.author?.displayName ?? "?", size: 34)
                VStack(alignment: .leading, spacing: 4) {
                    Text("\(Text(invite.author?.displayName ?? "Jemand").font(.wr(.subheadline, .semibold))) möchte dich als Koautor:in dieses Beitrags nennen. Der Beitrag erscheint dann auch in deinem Profil.")
                        .font(.wr(.subheadline))
                        .foregroundStyle(Color.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    if showExcerpt, let e = invite.excerpt?.nilIfEmpty {
                        Text("„\(e)“").font(.wr(.footnote)).foregroundStyle(Color.ink2).a11yLineLimit(2)
                    }
                    if let d = invite.createdAt { Text(Fmt.relative(d)).font(.wr(.caption)).foregroundStyle(Color.muted) }
                }
            }
            HStack(spacing: 8) {
                AsyncButton { await answer(false) } label: { Text("Ablehnen").font(.wr(.subheadline, .semibold)).frame(maxWidth: .infinity) }
                    .buttonStyle(.glass)
                AsyncButton { await answer(true) } label: { Label("Bestätigen", systemImage: "checkmark").font(.wr(.subheadline, .semibold)).frame(maxWidth: .infinity) }
                    .buttonStyle(.glassProminent)
                    .tint(.action)
            }
        }
        .padding(14)
        .background(Color.mossSoft, in: .rect(cornerRadius: Radius.inner, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: Radius.inner, style: .continuous).stroke(Color.moss.opacity(0.3), lineWidth: 1) }
    }

    private func answer(_ accept: Bool) async {
        let ok = await app.run(accept ? "Bestätigt – du bist jetzt Koautor:in." : "Einladung abgelehnt.") {
            _ = try await APIClient.shared.post("/posts/\(invite.postId)/coauthors/respond", ["accept": JSONValue.bool(accept)]) as JSONValue
        }
        if ok {
            NotificationCenter.default.post(name: .socialPostsChanged, object: invite.postId)
            onDone(accept)
        }
    }
}

// MARK: - Zeitpunkt wählen (Planen)

struct SocialScheduleSheet: View {
    var title = "Veröffentlichung planen"
    var initial: Date?
    var confirmTitle = "Planen"
    var onConfirm: (Date) async -> Bool

    @Environment(\.dismiss) private var dismiss
    @State private var date = Date()
    @State private var range = SocialSchedule.range

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                DatePicker("Veröffentlichen am", selection: $date, in: range)
                    .datePickerStyle(.graphical)
                    .tint(.moss)
                    .font(.wr(.body))
                Text("Bis dahin ist der Beitrag nur für dich sichtbar. Möglich ist ein Zeitpunkt zwischen 5 Minuten und einem Jahr ab jetzt.")
                    .font(.wr(.footnote))
                    .foregroundStyle(Color.muted)
                AsyncButton {
                    if await onConfirm(date) { dismiss() }
                } label: {
                    Label("\(confirmTitle) · \(SocialSchedule.label(date))", systemImage: "calendar.badge.clock")
                }
                .primaryButton()
                Spacer(minLength: 0)
            }
            .padding(.horizontal, Space.gutter)
            .padding(.top, Space.m)
            .background(Color.paper)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } } }
        }
        .presentationDetents([.large])
        .onAppear {
            range = SocialSchedule.range
            let fallback = Date().addingTimeInterval(3600)
            let start = initial.flatMap { range.contains($0) ? $0 : nil } ?? fallback
            date = min(max(start, range.lowerBound), range.upperBound)
        }
    }
}
