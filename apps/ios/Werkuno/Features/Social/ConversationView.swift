import SwiftUI
import PhotosUI

/// Unterhaltung: Bubbles mit Datumstrennern, Polling, Bildversand, Kontaktanfragen, Bestellkontext.
struct ConversationView: View {
    var id: String

    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase

    @State private var thread: SocialThread?
    @State private var messages: [SocialMessage] = []
    @State private var hasMore = false
    @State private var loadingOlder = false
    @State private var error: String?
    @State private var isRequest = false
    @State private var archived = false
    @State private var otherRead: Date?
    @State private var otherPending = false
    @State private var lastAt: Date?

    @State private var text = ""
    @State private var attachments: [DraftMedia] = []
    @State private var picks: [PhotosPickerItem] = []
    @State private var sending = false
    @State private var responding = false
    @State private var viewerMedia: (items: [MediaItem], start: MediaItem)?
    @State private var showViewer = false
    @State private var confirmBlock = false
    @State private var scrollTarget: String?
    @State private var showGroupInfo = false
    @State private var confirmLeaveGroup = false
    @FocusState private var focused: Bool

    private static let maxImages = 6

    var body: some View {
        Group {
            if let thread {
                content(thread)
            } else if let error {
                ErrorStateView(message: error) { await load() }
            } else {
                LoadingView()
            }
        }
        .background(Color.paper)
        .navigationBarTitleDisplayMode(.inline)
        .navigationTitle(thread?.group?.title ?? thread?.other?.displayName ?? "Unterhaltung")
        .toolbar {
            if let group = thread?.group {
                ToolbarItem(placement: .principal) { groupHeader(group) }
                ToolbarItem(placement: .topBarTrailing) { groupMenu(group) }
            } else if let other = thread?.other {
                ToolbarItem(placement: .principal) {
                    Button { router.open(.profile(handle: other.handle)) } label: {
                        HStack(spacing: 8) {
                            AvatarView(url: other.avatarUrl, name: other.displayName, size: 28)
                            VStack(alignment: .leading, spacing: 0) {
                                Text(other.displayName).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink).lineLimit(1)
                                Text(thread?.kind == "ORDER" ? "@\(other.handle) · Bestellung" : "@\(other.handle)")
                                    .font(.wr(.caption2)).foregroundStyle(Color.muted).lineLimit(1)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Profil von \(other.displayName)")
                }
                ToolbarItem(placement: .topBarTrailing) { menu(other) }
            }
        }
        .task(id: id) { await load() }
        .task(id: id) { await poll() }
        .onReceive(NotificationCenter.default.publisher(for: LiveEvent.notification)) { n in
            guard let e = LiveEvent(n), e.conversationId == id, thread != nil else { return }
            Task { await fetchNew() }
        }
        .onChange(of: picks) { _, new in
            guard !new.isEmpty else { return }
            let batch = new
            picks = []
            Task { await ingest(batch) }
        }
        .fullScreenCover(isPresented: $showViewer) {
            if let v = viewerMedia { MediaViewer(media: v.items, start: v.start) }
        }
        .sheet(isPresented: $showGroupInfo) {
            if let g = thread?.group {
                GroupInfoSheet(conversationId: id, group: g, reload: { await load(); return thread?.group }, onLeft: {
                    Task { @MainActor in
                        try? await Task.sleep(for: .milliseconds(350))
                        dismiss()
                    }
                })
            }
        }
        .confirmationDialog("Gruppe verlassen?", isPresented: $confirmLeaveGroup, titleVisibility: .visible) {
            Button("Verlassen", role: .destructive) { Task { await leaveGroup() } }
        } message: { Text("Du erhältst danach keine Nachrichten mehr aus dieser Gruppe.") }
        .confirmationDialog("\(thread?.other?.displayName ?? "Profil") blockieren?", isPresented: $confirmBlock, titleVisibility: .visible) {
            Button("Blockieren", role: .destructive) { Task { await block() } }
        } message: { Text("Ihr könnt euch dann keine Nachrichten mehr schicken und seht eure Inhalte nicht mehr.") }
    }

    // MARK: Layout

    private func content(_ t: SocialThread) -> some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 4) {
                    if let ctx = t.context {
                        SocialThreadContextCard(context: ctx)
                            .padding(.bottom, Space.m)
                    }
                    if hasMore {
                        Button { Task { await loadOlder() } } label: {
                            if loadingOlder { ProgressView().controlSize(.small) } else { Text("Ältere Nachrichten laden").font(.wr(.footnote, .semibold)) }
                        }
                        .buttonStyle(.glass)
                        .frame(maxWidth: .infinity)
                        .padding(.bottom, Space.s)
                        .disabled(loadingOlder)
                    }
                    if messages.isEmpty {
                        Text("Noch keine Nachrichten.").font(.wr(.subheadline)).foregroundStyle(Color.muted)
                            .frame(maxWidth: .infinity).padding(.top, 40)
                    }
                    ForEach(Array(messages.enumerated()), id: \.element.id) { i, m in
                        if i == 0 || !Calendar.current.isDate(messages[i - 1].createdAt, inSameDayAs: m.createdAt) {
                            daySeparator(m.createdAt)
                        }
                        if m.isSystem {
                            SocialSystemNotice(text: m.body).id(m.id)
                        } else {
                        SocialMessageBubble(
                            message: m,
                            otherName: senderName(m, t),
                            sender: t.group != nil && !m.mine && !grouped(i) ? senderMember(m, t) : nil,
                            showTime: showTime(i),
                            groupedWithPrevious: grouped(i),
                            onImage: { item in
                                viewerMedia = (m.media.map(\.asMediaItem), item)
                                showViewer = true
                            },
                            onReport: { router.present(.report(targetType: "MESSAGE", targetId: m.id, title: "Nachricht melden")) }
                        )
                        .id(m.id)
                        }
                        if t.group == nil, m.id == lastMine?.id {
                            Text(receipt)
                                .font(.wr(.caption2))
                                .foregroundStyle(Color.muted)
                                .frame(maxWidth: .infinity, alignment: .trailing)
                                .contentTransition(.opacity)
                                .accessibilityLabel("Status: \(receipt)")
                        }
                    }
                    Color.clear.frame(height: 1).id("bottom")
                }
                .padding(.horizontal, Space.gutter - 4)
                .padding(.top, Space.s)
                .padding(.bottom, Space.m)
            }
            .defaultScrollAnchor(.bottom)
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: scrollTarget) { _, target in
                guard let target else { return }
                withAnimation(.snappy) { proxy.scrollTo(target, anchor: .bottom) }
                scrollTarget = nil
            }
            .safeAreaInset(edge: .bottom, spacing: 0) { bottomBar(t) }
        }
    }

    private func daySeparator(_ d: Date) -> some View {
        HStack(spacing: 10) {
            Rectangle().fill(Color.line).frame(height: 0.75)
            SpecLabel(SocialFmt.dayLabel(d))
            Rectangle().fill(Color.line).frame(height: 0.75)
        }
        .padding(.vertical, 14)
        .accessibilityAddTraits(.isHeader)
    }

    private func showTime(_ i: Int) -> Bool {
        guard let next = messages[safe: i + 1] else { return true }
        let m = messages[i]
        return next.senderId != m.senderId || next.isSystem
            || !Calendar.current.isDate(next.createdAt, inSameDayAs: m.createdAt)
            || next.createdAt.timeIntervalSince(m.createdAt) > 5 * 60
    }

    private func grouped(_ i: Int) -> Bool {
        guard i > 0 else { return false }
        let p = messages[i - 1], m = messages[i]
        return !p.isSystem && p.senderId == m.senderId && m.createdAt.timeIntervalSince(p.createdAt) < 5 * 60 && Calendar.current.isDate(p.createdAt, inSameDayAs: m.createdAt)
    }

    private var lastMine: SocialMessage? { messages.last { $0.mine && !$0.isRemoved && !$0.isSystem } }

    private func senderMember(_ m: SocialMessage, _ t: SocialThread) -> SocialGroupMember {
        t.group?.members.first { $0.id == m.senderId } ?? SocialGroupMember(id: m.senderId, handle: "", displayName: "Ehemaliges Mitglied")
    }

    private func senderName(_ m: SocialMessage, _ t: SocialThread) -> String {
        if t.group != nil { return senderMember(m, t).displayName }
        return t.other?.displayName ?? "Unbekannt"
    }

    // MARK: Gruppenkopf

    private func groupHeader(_ g: SocialGroup) -> some View {
        Button { showGroupInfo = true } label: {
            HStack(spacing: 8) {
                SocialGroupAvatar(avatars: g.others.prefix(2).map { ($0.displayName, $0.avatarUrl) }, size: 30)
                VStack(alignment: .leading, spacing: 0) {
                    Text(g.title).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink).lineLimit(1)
                    Text(groupSubtitle(g)).font(.wr(.caption2)).foregroundStyle(Color.muted).lineLimit(1)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Gruppeninfo: \(g.title), \(groupSubtitle(g))")
    }

    private func groupSubtitle(_ g: SocialGroup) -> String {
        let names = g.activeMembers.filter { !$0.isMe }.prefix(4).map(\.firstName).joined(separator: ", ")
        let n = g.activeMembers.count
        return names.isEmpty ? Fmt.plural(n, "Mitglied", "Mitglieder") : "\(Fmt.plural(n, "Mitglied", "Mitglieder")) · \(names)"
    }

    private func groupMenu(_ g: SocialGroup) -> some View {
        Menu {
            Button("Gruppeninfo", systemImage: "info.circle") { showGroupInfo = true }
            if !isRequest {
                Button(archived ? "Zurück in den Posteingang" : "Archivieren", systemImage: archived ? "tray.and.arrow.up" : "archivebox") {
                    Task { await setArchived(!archived) }
                }
                Divider()
                Button("Gruppe verlassen", systemImage: "rectangle.portrait.and.arrow.right", role: .destructive) { confirmLeaveGroup = true }
            }
        } label: {
            Image(systemName: "ellipsis")
        }
        .accessibilityLabel("Optionen der Gruppe")
    }

    private var receipt: String {
        guard let m = lastMine else { return "" }
        if let r = otherRead, r >= m.createdAt { return "Gelesen" }
        return otherPending ? "Als Kontaktanfrage zugestellt" : "Zugestellt"
    }

    // MARK: Untere Leiste

    @ViewBuilder private func bottomBar(_ t: SocialThread) -> some View {
        VStack(spacing: 8) {
            if isRequest, let g = t.group {
                groupInviteBanner(g)
            } else if isRequest, let other = t.other {
                requestBanner(other)
            } else if otherPending, let q = t.requestQuotaLeft {
                Text("Deine Nachricht wurde als Kontaktanfrage zugestellt. Bis \(t.other?.displayName ?? "die Person") annimmt, kannst du \(q > 0 ? "noch höchstens \(Fmt.plural(q, "Nachricht", "Nachrichten"))" : "keine weiteren Nachrichten") senden.")
                    .font(.wr(.caption))
                    .foregroundStyle(Color.muted)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, Space.gutter)
            }
            if t.canSend {
                composer(t)
            } else {
                Label(disabledReason(t), systemImage: "lock")
                    .font(.wr(.footnote))
                    .foregroundStyle(Color.ink2)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 12)
                    .frame(maxWidth: .infinity)
                    .glassEffect(.regular, in: Capsule())
                    .padding(.horizontal, Space.gutter - 8)
            }
        }
        .padding(.bottom, 8)
    }

    private func disabledReason(_ t: SocialThread) -> String {
        if let until = t.messagingRestrictedUntil { return "Deine Nachrichtenfunktion ist bis \(Fmt.date(until, style: .long)) eingeschränkt." }
        if t.group != nil { return "In dieser Gruppe ist sonst niemand mehr." }
        if t.other?.declined == true { return "Diese Unterhaltung ist geschlossen." }
        if t.other?.active == false { return "Dieses Konto kann derzeit keine Nachrichten empfangen." }
        return "In dieser Unterhaltung kannst du keine Nachrichten senden."
    }

    private func groupInviteBanner(_ g: SocialGroup) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Du wurdest in die Gruppe **\(g.title)** eingeladen. Erst wenn du annimmst, sehen die anderen, dass du dabei bist.")
                .font(.wr(.footnote))
                .foregroundStyle(Color.ink2)
                .fixedSize(horizontal: false, vertical: true)
            GlassEffectContainer(spacing: 8) {
                HStack(spacing: 8) {
                    Button { Task { await respond(true) } } label: { Text("Beitreten").font(.wr(.subheadline, .semibold)).padding(.horizontal, 6) }
                        .buttonStyle(.glassProminent)
                        .tint(.action)
                    Button { Task { await respond(false) } } label: { Text("Ablehnen").font(.wr(.subheadline)).padding(.horizontal, 6) }
                        .buttonStyle(.glass)
                    Spacer(minLength: 0)
                    Button { showGroupInfo = true } label: {
                        Label("Mitglieder", systemImage: "person.3").font(.wr(.subheadline))
                    }
                    .buttonStyle(.glass)
                }
            }
            .disabled(responding)
        }
        .padding(14)
        .glassEffect(.regular, in: .rect(cornerRadius: Radius.card, style: .continuous))
        .padding(.horizontal, Space.gutter - 8)
    }

    private func requestBanner(_ other: SocialThread.Other) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("**\(other.displayName)** möchte dir schreiben. \(other.displayName) sieht nicht, ob du die Nachricht gelesen hast, bis du annimmst.")
                .font(.wr(.footnote))
                .foregroundStyle(Color.ink2)
                .fixedSize(horizontal: false, vertical: true)
            GlassEffectContainer(spacing: 8) {
                HStack(spacing: 8) {
                    Button { Task { await respond(true) } } label: { Text("Annehmen").font(.wr(.subheadline, .semibold)).padding(.horizontal, 6) }
                        .buttonStyle(.glassProminent)
                        .tint(.moss)
                    Button { Task { await respond(false) } } label: { Text("Ablehnen").font(.wr(.subheadline)).padding(.horizontal, 6) }
                        .buttonStyle(.glass)
                    Spacer(minLength: 0)
                    Button { router.present(.report(targetType: "USER", targetId: other.id, title: "\(other.displayName) melden")) } label: {
                        Label("Melden", systemImage: "flag").font(.wr(.subheadline))
                    }
                    .buttonStyle(.glass)
                }
            }
            .disabled(responding)
        }
        .padding(14)
        .glassEffect(.regular, in: .rect(cornerRadius: Radius.card, style: .continuous))
        .padding(.horizontal, Space.gutter - 8)
    }

    private func composer(_ t: SocialThread) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if !attachments.isEmpty { attachmentTray }
            HStack(alignment: .bottom, spacing: 8) {
                PhotosPicker(selection: $picks, maxSelectionCount: max(1, Self.maxImages - attachments.count), matching: .images) {
                    Image(systemName: "photo")
                        .font(.wr(.body))
                        .foregroundStyle(attachments.count >= Self.maxImages ? Color.muted : Color.ink2)
                        .frame(width: 36, height: 36)
                        .contentShape(.circle)
                }
                .disabled(attachments.count >= Self.maxImages)
                .accessibilityLabel("Bilder anhängen")

                TextField(isRequest ? (t.group != nil ? "Schreiben tritt der Gruppe bei …" : "Antworten nimmt die Anfrage an …") : "Nachricht an \(t.group?.title ?? t.other?.displayName ?? "…") …", text: $text, axis: .vertical)
                    .lineLimit(1...6)
                    .focused($focused)
                    .padding(.vertical, 8)
                    .accessibilityLabel("Nachricht")

                Button { Task { await send() } } label: {
                    ZStack {
                        if sending { ProgressView().tint(Color.paper).controlSize(.small) }
                        else { Image(systemName: "arrow.up").font(.wr(.subheadline, .bold)) }
                    }
                    .frame(width: 36, height: 36)
                }
                .buttonStyle(.glassProminent)
                .buttonBorderShape(.circle)
                .tint(.moss)
                .disabled(!canSend)
                .accessibilityLabel(attachments.isUploading ? "Bilder werden hochgeladen" : "Senden")
            }
            .padding(.leading, 8)
            .padding(.trailing, 5)
            .padding(.vertical, 4)
            .glassEffect(.regular.interactive(), in: .rect(cornerRadius: 24, style: .continuous))
        }
        .padding(.horizontal, Space.gutter - 8)
        .animation(.snappy, value: attachments.count)
    }

    private var attachmentTray: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(attachments) { a in
                    ZStack(alignment: .topTrailing) {
                        Group {
                            if let img = a.image { Image(uiImage: img).resizable().scaledToFill() } else { Color.sunken }
                        }
                        .frame(width: 64, height: 64)
                        .clipShape(.rect(cornerRadius: Radius.small, style: .continuous))
                        .overlay {
                            switch a.state {
                            case .uploading: ZStack { Color.black.opacity(0.35); ProgressView().tint(.white) }.clipShape(.rect(cornerRadius: Radius.small, style: .continuous))
                            case .failed: ZStack { Color.danger.opacity(0.55); Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.white) }.clipShape(.rect(cornerRadius: Radius.small, style: .continuous))
                            case .ready: EmptyView()
                            }
                        }
                        Button { withAnimation(.snappy) { attachments.removeAll { $0.id == a.id } } } label: {
                            Image(systemName: "xmark").font(.wr(size: 9, weight: .bold)).foregroundStyle(.white)
                                .frame(width: 20, height: 20).background(.black.opacity(0.6), in: Circle())
                        }
                        .padding(3)
                        .accessibilityLabel("Bild entfernen")
                    }
                }
            }
            .padding(.horizontal, 4)
        }
        .padding(8)
        .glassEffect(.regular, in: .rect(cornerRadius: 20, style: .continuous))
    }

    private var canSend: Bool {
        !sending && !attachments.isUploading && (!text.trimmed.isEmpty || attachments.contains { $0.state == .ready })
    }

    private func menu(_ other: SocialThread.Other) -> some View {
        Menu {
            Button("Profil ansehen", systemImage: "person.crop.circle") { router.open(.profile(handle: other.handle)) }
            if !isRequest {
                Button(archived ? "Zurück in den Posteingang" : "Archivieren", systemImage: archived ? "tray.and.arrow.up" : "archivebox") {
                    Task { await setArchived(!archived) }
                }
            }
            Divider()
            Button("\(other.displayName) melden", systemImage: "flag") {
                router.present(.report(targetType: "USER", targetId: other.id, title: "\(other.displayName) melden"))
            }
            Button("\(other.displayName) blockieren", systemImage: "hand.raised", role: .destructive) { confirmBlock = true }
        } label: {
            Image(systemName: "ellipsis")
        }
        .accessibilityLabel("Optionen der Unterhaltung")
    }

    // MARK: Laden

    private func load() async {
        do {
            let t: SocialThread = try await APIClient.shared.get("/conversations/\(id)")
            withAnimation(.snappy) {
                thread = t
                messages = t.messages
                hasMore = t.hasMore
                isRequest = t.me.isRequest
                archived = t.me.archived
                otherRead = t.other?.lastReadAt
                otherPending = t.other?.pendingRequest ?? false
                lastAt = t.messages.last?.createdAt
                error = nil
            }
            await markRead()
        } catch is CancellationError {
        } catch {
            if thread == nil { self.error = (error as? APIError)?.message ?? error.localizedDescription } else { app.show(error: error) }
        }
    }

    private func loadOlder() async {
        guard let first = messages.first, !loadingOlder else { return }
        loadingOlder = true
        defer { loadingOlder = false }
        do {
            let t: SocialThread = try await APIClient.shared.get("/conversations/\(id)", query: ["before": SocialFmt.iso(first.createdAt)])
            let known = Set(messages.map(\.id))
            let older = t.messages.filter { !known.contains($0.id) }
            messages.insert(contentsOf: older, at: 0)
            hasMore = t.hasMore
            scrollTarget = first.id
        } catch { app.show(error: error) }
    }

    /// Rückfall-Polling, solange die Ansicht sichtbar ist. Mit Live-Stream (SSE) kommen neue
    /// Nachrichten und Lesebestätigungen sofort; dann reicht ein ruhigeres Intervall.
    private func poll() async {
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(LiveStream.shared.isConnected ? 15 : 4))
            if Task.isCancelled { return }
            guard thread != nil, scenePhase == .active else { continue }
            await fetchNew()
        }
    }

    /// Neue Nachrichten und den Lesestand der anderen Seite holen.
    private func fetchNew() async {
        do {
            let r: SocialMessagesSince = try await APIClient.shared.get("/conversations/\(id)/messages", query: ["after": lastAt.map(SocialFmt.iso)])
            withAnimation(.snappy) {
                otherRead = r.otherLastReadAt
                otherPending = r.otherPendingRequest ?? false
            }
            guard !r.messages.isEmpty else { return }
            merge(r.messages)
            // Gruppenereignis (hinzugefügt, umbenannt, verlassen …): Kopf und Mitglieder neu laden
            if thread?.group != nil, r.messages.contains(where: \.isSystem) { await load() }
            if r.messages.contains(where: { !$0.mine && !$0.isSystem }) {
                Haptics.soft()
                scrollTarget = "bottom"
                await markRead()
                if let last = r.messages.last(where: { !$0.mine && !$0.isSystem }), let t = thread {
                    UIAccessibility.post(notification: .announcement, argument: "Neue Nachricht von \(senderName(last, t)): \(last.body.isEmpty ? "Bild" : String(last.body.prefix(120)))")
                }
            }
        } catch {
            // Netzwerkfehler – nächster Versuch beim nächsten Ereignis/Intervall
        }
    }

    private func merge(_ new: [SocialMessage]) {
        let known = Set(messages.map(\.id))
        let add = new.filter { !known.contains($0.id) }
        if let last = new.map(\.createdAt).max(), lastAt.map({ last > $0 }) ?? true { lastAt = last }
        guard !add.isEmpty else { return }
        withAnimation(.snappy) {
            messages = (messages + add).sorted { $0.createdAt < $1.createdAt }
        }
    }

    private func markRead() async {
        _ = try? await APIClient.shared.post("/conversations/\(id)/read") as JSONValue
        await app.refreshCounts()
    }

    // MARK: Aktionen

    private func send() async {
        guard canSend else { return }
        sending = true
        defer { sending = false }
        let body = text.trimmed
        let media = attachments.filter { $0.state == .ready }.refsJSON
        do {
            let m: SocialMessage = try await APIClient.shared.post("/conversations/\(id)/messages", ["body": JSONValue.string(body), "media": media])
            Haptics.tap()
            text = ""
            attachments = []
            merge([m])
            if isRequest { withAnimation(.snappy) { isRequest = false } }
            if archived { archived = false }
            scrollTarget = "bottom"
        } catch {
            app.show(error: error)
        }
    }

    private func respond(_ accept: Bool) async {
        responding = true
        defer { responding = false }
        let isGroup = thread?.group != nil
        let ok = await app.run(accept ? (isGroup ? "Du bist der Gruppe beigetreten." : "Anfrage angenommen.") : (isGroup ? "Einladung abgelehnt." : "Anfrage abgelehnt.")) {
            _ = try await APIClient.shared.post("/conversations/\(id)/respond", ["accept": JSONValue.bool(accept)]) as JSONValue
        }
        guard ok else { return }
        await app.refreshCounts()
        if accept {
            withAnimation(.snappy) { isRequest = false }
            if isGroup { await load() }
            focused = true
        } else {
            dismiss()
        }
    }

    private func setArchived(_ value: Bool) async {
        let ok = await app.run(value ? "Archiviert." : "Zurück im Posteingang.") {
            _ = try await APIClient.shared.post("/conversations/\(id)/archive", ["archived": JSONValue.bool(value)]) as JSONValue
        }
        if ok { archived = value }
    }

    private func leaveGroup() async {
        do {
            let r: SocialGroupLeft = try await APIClient.shared.post("/conversations/\(id)/leave")
            app.show(r.dissolved == true ? "Gruppe verlassen und aufgelöst." : "Du hast die Gruppe verlassen.")
            await app.refreshCounts()
            dismiss()
        } catch {
            app.show(error: error)
        }
    }

    private func block() async {
        guard let other = thread?.other else { return }
        let ok = await app.run("Profil blockiert.") { try await SocialAPI.block(other.id, true) }
        if ok { dismiss() }
    }

    private func ingest(_ batch: [PhotosPickerItem]) async {
        for item in batch.prefix(Self.maxImages - attachments.count) {
            guard let data = try? await item.loadTransferable(type: Data.self), let img = UIImage(data: data) else { continue }
            let d = DraftMedia(image: img, state: .uploading)
            withAnimation(.snappy) { attachments.append(d) }
            do {
                let (mid, r) = try await MediaUpload.upload(img)
                update(d.id) { $0.mediaId = mid; $0.remoteURL = r.variants?.best; $0.state = .ready }
            } catch {
                update(d.id) { $0.state = .failed(error.localizedDescription) }
                app.show(error: error)
            }
        }
    }

    private func update(_ id: String, _ f: (inout DraftMedia) -> Void) {
        if let i = attachments.firstIndex(where: { $0.id == id }) { f(&attachments[i]) }
    }
}

// MARK: - Bubble

private struct SocialMessageBubble: View {
    var message: SocialMessage
    var otherName: String
    /// Gruppen: Name über der ersten Nachricht einer Folge
    var sender: SocialGroupMember? = nil
    var showTime: Bool
    var groupedWithPrevious: Bool
    var onImage: (MediaItem) -> Void
    var onReport: () -> Void

    var body: some View {
        let m = message
        VStack(alignment: m.mine ? .trailing : .leading, spacing: 4) {
            if let sender {
                HStack(spacing: 6) {
                    AvatarView(url: sender.avatarUrl, name: sender.displayName, size: 18)
                    Text(sender.displayName).font(.wr(.caption, .semibold)).foregroundStyle(Color.ink2).lineLimit(1)
                }
                .padding(.leading, 4)
                .accessibilityHidden(true)
            }
            if m.isSuspicious { SocialPaymentWarning() }
            HStack {
                if m.mine { Spacer(minLength: 48) }
                bubble
                if !m.mine { Spacer(minLength: 48) }
            }
            if showTime {
                Text(SocialFmt.time(m.createdAt))
                    .font(.wr(size: 10))
                    .foregroundStyle(Color.muted)
                    .padding(.horizontal, 6)
            }
        }
        .frame(maxWidth: .infinity, alignment: m.mine ? .trailing : .leading)
        .padding(.top, groupedWithPrevious ? 0 : 6)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibility)
    }

    @ViewBuilder private var bubble: some View {
        let m = message
        let shape = UnevenRoundedRectangle(
            topLeadingRadius: !m.mine && groupedWithPrevious ? 6 : 20,
            bottomLeadingRadius: m.mine ? 20 : (showTime ? 6 : 20),
            bottomTrailingRadius: m.mine ? (showTime ? 6 : 20) : 20,
            topTrailingRadius: m.mine && groupedWithPrevious ? 6 : 20,
            style: .continuous
        )
        if m.isRemoved {
            Text("Diese Nachricht wurde entfernt.")
                .font(.wr(.subheadline).italic())
                .foregroundStyle(Color.muted)
                .padding(.horizontal, 14).padding(.vertical, 9)
                .overlay(shape.strokeBorder(Color.lineStrong, style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
        } else {
            VStack(alignment: .leading, spacing: 6) {
                if !m.media.isEmpty { images }
                if !m.body.isEmpty {
                    Text(m.body)
                        .font(.wr(.body))
                        .foregroundStyle(m.mine ? Color.paper : Color.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .textSelection(.enabled)
                        .tint(m.mine ? Color.paper : Color.moss)
                        .padding(.horizontal, m.media.isEmpty ? 0 : 6)
                        .padding(.bottom, m.media.isEmpty ? 0 : 4)
                }
            }
            .padding(.horizontal, m.media.isEmpty ? 14 : 4)
            .padding(.vertical, m.media.isEmpty ? 9 : 4)
            .background(m.mine ? Color.moss : Color.card, in: shape)
            .overlay {
                if !m.mine { shape.strokeBorder(m.isSuspicious ? Color.warn : Color.line, lineWidth: m.isSuspicious ? 1.2 : 0.75) }
            }
            .contextMenu {
                if !m.body.isEmpty {
                    Button("Kopieren", systemImage: "doc.on.doc") { UIPasteboard.general.string = m.body }
                }
                if !m.mine {
                    Button("Nachricht melden …", systemImage: "flag", action: onReport)
                }
            }
        }
    }

    private var images: some View {
        let media = message.media
        let cols = media.count > 1 ? [GridItem(.flexible(), spacing: 3), GridItem(.flexible(), spacing: 3)] : [GridItem(.flexible())]
        return LazyVGrid(columns: cols, spacing: 3) {
            ForEach(media) { img in
                Button { onImage(img.asMediaItem) } label: {
                    RemoteImage(path: img.thumb?.nilIfEmpty ?? img.url) { Color.sunken }
                        .frame(height: media.count > 1 ? 120 : 220)
                        .frame(maxWidth: media.count > 1 ? .infinity : 240)
                        .clipShape(.rect(cornerRadius: 16, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(img.alt?.nilIfEmpty ?? "Bild")
                .accessibilityAddTraits(.isImage)
            }
        }
        .frame(maxWidth: 260)
    }

    private var accessibility: String {
        let who = message.mine ? "Du" : otherName
        var s = "\(who), \(SocialFmt.time(message.createdAt)): "
        if message.isRemoved { return s + "Nachricht entfernt" }
        if !message.media.isEmpty { s += Fmt.plural(message.media.count, "Bild", "Bilder") + ". " }
        s += message.body
        if message.isSuspicious { s = "Warnung, möglicher Zahlungslink. " + s }
        return s
    }
}

/// Systemhinweis im Verlauf („Lena hat Mattia hinzugefügt.“)
private struct SocialSystemNotice: View {
    var text: String
    var body: some View {
        Text(text)
            .font(.wr(.caption))
            .foregroundStyle(Color.ink2)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 14).padding(.vertical, 6)
            .background(Color.sunken, in: Capsule())
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .accessibilityLabel("Hinweis: \(text)")
    }
}

private struct SocialPaymentWarning: View {
    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "exclamationmark.shield.fill").foregroundStyle(Color.warn)
            Text("**Vorsicht:** Diese Nachricht erwähnt eine Zahlung ausserhalb von Werkuno (z. B. TWINT, IBAN, PayPal-Link oder Kurzlink). Bezahle nur über den Checkout – nur dann bist du geschützt. Teile keine Zugangsdaten.")
                .font(.wr(.caption))
                .foregroundStyle(Color.ink2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(10)
        .frame(maxWidth: 320, alignment: .leading)
        .background(Color.warn.opacity(0.12), in: .rect(cornerRadius: Radius.inner, style: .continuous))
    }
}

// MARK: - Bestell-/Produktkontext

struct SocialThreadContextCard: View {
    var context: SocialThreadContext
    @Environment(Router.self) private var router

    var body: some View {
        Button { router.open(href: context.href) } label: {
            VStack(alignment: .leading, spacing: 0) {
                if context.isOrder { order } else { product }
                Text("Zahlungen nur über den Werkuno-Checkout – nur dann gilt der Käuferschutz.")
                    .font(.wr(.caption2))
                    .foregroundStyle(Color.clayInk)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 7)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .hairline(.top)
            }
            .background(Color.claySoft, in: .rect(cornerRadius: Radius.inner, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Radius.inner, style: .continuous).strokeBorder(Color.clay.opacity(0.35), lineWidth: 0.75))
        }
        .buttonStyle(.pressable)
        .disabled(context.href == nil || (context.isOrder && context.role == nil))
        .accessibilityElement(children: .combine)
    }

    private var order: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                SpecLabel("Bestellung \(context.number ?? "") · \(Fmt.date(context.createdAt))", color: .clayInk)
                Spacer(minLength: 6)
                Text(L.orderStatus[context.status ?? ""] ?? context.status ?? "")
                    .font(.spec).textCase(.uppercase)
                    .foregroundStyle(Color.ink)
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(Color.card, in: Capsule())
            }
            HStack(spacing: 10) {
                HStack(spacing: -10) {
                    ForEach(Array((context.items ?? []).prefix(3).enumerated()), id: \.offset) { _, i in
                        thumb(i.coverUrl, seed: i.title).frame(width: 34, height: 34)
                            .overlay(RoundedRectangle(cornerRadius: 9, style: .continuous).strokeBorder(Color.paper, lineWidth: 1.5))
                    }
                }
                Text(itemsLine).font(.wr(.footnote)).foregroundStyle(Color.ink).lineLimit(2).multilineTextAlignment(.leading)
                Spacer(minLength: 4)
                VStack(alignment: .trailing, spacing: 2) {
                    Text(Fmt.money(context.totalMinor, currency: context.currency)).font(.wr(.footnote, .semibold)).monospacedDigit().foregroundStyle(Color.ink)
                    if let r = context.role {
                        Label(r == "seller" ? "Verwalten" : "Details", systemImage: "arrow.up.right").font(.wr(.caption2, .semibold)).labelStyle(.compact).foregroundStyle(Color.clayInk)
                    }
                }
            }
        }
        .padding(12)
    }

    private var product: some View {
        HStack(spacing: 12) {
            thumb(context.coverUrl, seed: context.title ?? "p").frame(width: 44, height: 44)
            VStack(alignment: .leading, spacing: 2) {
                SpecLabel("Anfrage zu Produkt · \(context.shop?.name ?? "")", color: .clayInk)
                Text(context.title ?? "Produkt").font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink).lineLimit(1)
            }
            Spacer(minLength: 4)
            Text(Fmt.money(context.priceMinor, currency: context.currency)).font(.wr(.footnote, .semibold)).monospacedDigit().foregroundStyle(Color.ink)
            Image(systemName: "arrow.up.right").font(.wr(.caption)).foregroundStyle(Color.clayInk)
        }
        .padding(12)
    }

    private var itemsLine: String {
        let items = context.items ?? []
        var s = items.map { "\($0.quantity ?? 1)× \($0.title)\($0.variantName.map { " (\($0))" } ?? "")" }.joined(separator: ", ")
        if let n = context.itemCount, n > items.count { s += " + \(n - items.count) weitere" }
        return s
    }

    private func thumb(_ url: String?, seed: String) -> some View {
        CoverView(url: url, seed: seed, category: nil, showLabel: false)
            .clipShape(.rect(cornerRadius: 9, style: .continuous))
    }
}
