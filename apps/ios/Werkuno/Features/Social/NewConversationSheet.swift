import SwiftUI

/// Neue Unterhaltung: Empfänger:in suchen, Vorprüfung, erste Nachricht.
struct NewConversationSheet: View {
    var handle: String? = nil
    var orderId: String? = nil
    var productId: String? = nil

    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @Environment(\.dismiss) private var dismiss

    @State private var query = ""
    @State private var hits: [SocialUserSearch.Hit] = []
    @State private var searching = false
    @State private var selectedHandle: String?
    @State private var prep: SocialConversationPrep?
    @State private var preparing = false
    @State private var prepError: String?
    @State private var text = ""
    @State private var media: [DraftMedia] = []
    @State private var sending = false
    @FocusState private var focus: Field?

    private enum Field { case search, message }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Space.xl) {
                    if selectedHandle == nil { searchSection } else { recipientSection }
                    if selectedHandle != nil, prep?.canStart == true { messageSection }
                }
                .padding(.horizontal, Space.gutter)
                .padding(.vertical, Space.l)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Color.paper)
            .navigationTitle("Neue Nachricht")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button { Task { await send() } } label: {
                        if sending { ProgressView() } else { Text(media.isUploading ? "Lädt hoch …" : "Senden") }
                    }
                    .buttonStyle(.glassProminent)
                    .tint(.moss)
                    .disabled(!canSend)
                }
            }
            .task {
                if let h = handle?.nilIfEmpty { await select(h) } else { focus = .search }
            }
            .task(id: query) { await search() }
        }
        .interactiveDismissDisabled(!text.trimmed.isEmpty || !media.isEmpty)
    }

    private var canSend: Bool {
        !sending && prep?.canStart == true && !media.isUploading && (!text.trimmed.isEmpty || media.contains { $0.state == .ready })
    }

    // MARK: Suche

    private var searchSection: some View {
        VStack(alignment: .leading, spacing: Space.m) {
            SpecLabel("An")
            HStack(spacing: 10) {
                Image(systemName: "at").foregroundStyle(Color.muted)
                TextField("Name oder @handle", text: $query)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($focus, equals: .search)
                    .submitLabel(.next)
                    .onSubmit {
                        let h = query.trimmed.replacingOccurrences(of: "@", with: "")
                        if !h.isEmpty { Task { await select(h) } }
                    }
                if searching { YarnSpinner(size: 18) }
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 50)
            .glassEffect(.regular.interactive(), in: Capsule())

            if !hits.isEmpty {
                VStack(spacing: 0) {
                    ForEach(hits) { h in
                        Button { Task { await select(h.handle) } } label: {
                            HStack(spacing: 12) {
                                AvatarView(url: h.cover, name: h.title, size: 40)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(h.title).font(.subheadline.weight(.semibold)).foregroundStyle(Color.ink)
                                    Text("@\(h.handle)").font(.caption).foregroundStyle(Color.muted)
                                    if let bio = h.meta?.bio?.nilIfEmpty {
                                        Text(bio).font(.caption).foregroundStyle(Color.ink2).lineLimit(1)
                                    }
                                }
                                Spacer(minLength: 0)
                                Image(systemName: "chevron.right").font(.caption).foregroundStyle(Color.lineStrong)
                            }
                            .padding(.vertical, 10)
                            .contentShape(.rect)
                        }
                        .buttonStyle(.plain)
                        .accessibilityElement(children: .combine)
                        .accessibilityHint("Als Empfänger:in wählen")
                        if h.id != hits.last?.id { Divider().overlay(Color.line) }
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 4)
                .cardSurface()
            } else if query.trimmed.count >= 2 && !searching {
                Text("Niemand gefunden. Prüfe die Schreibweise oder gib das genaue @handle ein.")
                    .font(.footnote).foregroundStyle(Color.muted)
            } else {
                Text("Schreib Creatorn, Verkäufer:innen oder Menschen aus deinen Communities. Bezahle nie ausserhalb des Werkuno-Checkouts.")
                    .font(.footnote).foregroundStyle(Color.muted)
            }
        }
    }

    private func search() async {
        let q = query.trimmed.replacingOccurrences(of: "@", with: "")
        guard q.count >= 2 else { hits = []; return }
        try? await Task.sleep(for: .milliseconds(300))
        if Task.isCancelled { return }
        searching = true
        defer { searching = false }
        do {
            let r: SocialUserSearch = try await APIClient.shared.get("/search", query: ["q": q, "types": "user"])
            if Task.isCancelled { return }
            let me = app.me?.id
            withAnimation(.snappy) { hits = (r.results?.user ?? []).filter { $0.id != me } }
        } catch {}
    }

    // MARK: Empfänger:in & Vorprüfung

    private func select(_ h: String) async {
        Haptics.selection()
        withAnimation(.snappy) { selectedHandle = h; prep = nil; prepError = nil }
        preparing = true
        defer { preparing = false }
        do {
            let p: SocialConversationPrep = try await APIClient.shared.get("/conversations/prepare", query: ["handle": h, "orderId": orderId, "productId": productId])
            withAnimation(.snappy) { prep = p }
            if p.canStart { focus = .message }
        } catch {
            prepError = (error as? APIError)?.message ?? error.localizedDescription
        }
    }

    private var recipientSection: some View {
        VStack(alignment: .leading, spacing: Space.m) {
            SpecLabel("An")
            HStack(spacing: 12) {
                if let r = prep?.recipient {
                    AvatarView(url: r.avatarUrl, name: r.displayName, size: 48)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(r.displayName).font(.headline).foregroundStyle(Color.ink)
                        Text("@\(r.handle)").font(.caption).foregroundStyle(Color.muted)
                        if let bio = r.bio?.nilIfEmpty { Text(bio).font(.caption).foregroundStyle(Color.ink2).lineLimit(2) }
                    }
                } else if preparing {
                    YarnSpinner(size: 24)
                    Text("@\(selectedHandle ?? "")").font(.subheadline).foregroundStyle(Color.muted)
                } else {
                    Image(systemName: "person.crop.circle.badge.questionmark").font(.title2).foregroundStyle(Color.muted)
                    Text("@\(selectedHandle ?? "")").font(.subheadline.weight(.semibold)).foregroundStyle(Color.ink)
                }
                Spacer(minLength: 0)
                if handle == nil {
                    Button("Ändern") {
                        withAnimation(.snappy) { selectedHandle = nil; prep = nil; prepError = nil }
                        focus = .search
                    }
                    .font(.footnote.weight(.semibold))
                    .buttonStyle(.glass)
                    .controlSize(.small)
                }
            }
            .padding(14)
            .cardSurface()

            if let c = prep?.context {
                Label(c.label, systemImage: c.orderId != nil ? "shippingbox" : "tag")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Color.clayInk)
                    .padding(.horizontal, 12).padding(.vertical, 8)
                    .background(Color.claySoft, in: Capsule())
            }

            if let prepError {
                NoticeView(tone: .danger, message: prepError)
            } else if let p = prep {
                status(p)
            }
        }
    }

    @ViewBuilder private func status(_ p: SocialConversationPrep) -> some View {
        let name = p.recipient?.displayName ?? "Diese Person"
        switch p.kind {
        case "ok" where p.asRequest == true:
            NoticeView(tone: .info, title: "Wird als Kontaktanfrage zugestellt", message: "\(name) folgt dir nicht. Bis die Anfrage angenommen wird, kannst du nur wenige Nachrichten senden.")
        case "existing":
            VStack(alignment: .leading, spacing: 10) {
                NoticeView(tone: .info, title: "Ihr schreibt euch bereits", message: "Deine Nachricht wird in eurer bestehenden Unterhaltung ergänzt.")
                if let cid = p.conversationId {
                    Button("Unterhaltung öffnen") { openConversation(cid) }
                        .font(.footnote.weight(.semibold))
                        .buttonStyle(.glass)
                }
            }
        case "not_found":
            if let r = p.redirectHandle {
                VStack(alignment: .leading, spacing: 10) {
                    NoticeView(tone: .warn, message: "Dieses Profil heisst jetzt @\(r).")
                    Button("@\(r) wählen") { Task { await select(r) } }.buttonStyle(.glass)
                }
            } else {
                NoticeView(tone: .danger, message: "Kein Profil mit diesem Namen gefunden.")
            }
        case "self":
            NoticeView(tone: .warn, message: "Du kannst dir nicht selbst schreiben.")
        case "unavailable":
            NoticeView(tone: .danger, message: "Du kannst dieser Person keine Nachrichten senden.")
        case "closed":
            NoticeView(tone: .warn, message: "\(name) nimmt keine Direktnachrichten an.")
        case "bad_context":
            NoticeView(tone: .danger, message: "Diese Bestellung bzw. dieses Produkt gehört nicht zu euch beiden.")
        case "restricted":
            NoticeView(tone: .danger, message: p.until.map { "Deine Nachrichtenfunktion ist bis \(Fmt.date($0, style: .long)) eingeschränkt." } ?? "Deine Nachrichtenfunktion ist eingeschränkt.")
        default:
            EmptyView()
        }
    }

    // MARK: Nachricht

    private var messageSection: some View {
        VStack(alignment: .leading, spacing: Space.m) {
            SpecLabel("Nachricht")
            VStack(alignment: .leading, spacing: 8) {
                TextField("Hallo! Ich habe eine Frage zu …", text: $text, axis: .vertical)
                    .lineLimit(4...12)
                    .focused($focus, equals: .message)
                    .accessibilityLabel("Erste Nachricht")
                HStack {
                    Spacer()
                    Text("\(text.count)/5000").font(.spec).monospacedDigit().foregroundStyle(text.count > 5000 ? Color.danger : Color.muted)
                }
            }
            .padding(16)
            .cardSurface()
            MediaPickerField(items: $media, maxCount: 6, allowVideo: false, title: "Bilder")
                .padding(16)
                .cardSurface()
            Label("Zahlungen nur über den Werkuno-Checkout – nur dann gilt der Käuferschutz. Teile keine Zugangsdaten.", systemImage: "lock.shield")
                .font(.caption)
                .foregroundStyle(Color.muted)
        }
        .transition(.opacity.combined(with: .move(edge: .bottom)))
    }

    private func send() async {
        guard canSend, let h = prep?.recipient?.handle ?? selectedHandle else { return }
        sending = true
        defer { sending = false }
        var body: [String: JSONValue] = ["recipientHandle": .string(h), "body": .string(text.trimmed), "media": media.filter { $0.state == .ready }.refsJSON]
        if let o = prep?.context?.orderId ?? orderId { body["orderId"] = .string(o) }
        if let p = prep?.context?.productId ?? productId { body["productId"] = .string(p) }
        do {
            let r: SocialConversationStarted = try await APIClient.shared.post("/conversations", body)
            Haptics.success()
            app.show(r.asRequest == true ? "Kontaktanfrage gesendet." : "Nachricht gesendet.")
            await app.refreshCounts()
            openConversation(r.conversationId)
        } catch {
            app.show(error: error)
        }
    }

    private func openConversation(_ id: String) {
        dismiss()
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(350))
            router.open(.conversation(id: id))
        }
    }
}
