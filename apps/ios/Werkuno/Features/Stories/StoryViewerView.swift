import SwiftUI
import AVFoundation
import Combine

/// Story-Betrachter im Vollbild. Tippen links/rechts blättert, Gedrückthalten pausiert,
/// nach unten Wischen schliesst, seitlich Wischen springt zur nächsten Person.
/// VoiceOver: Aktionen „Nächste Story“, „Vorherige Story“, Magic Tap pausiert.
struct StoryViewerView: View {
    var request: StoryViewerRequest

    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase

    // Reihenfolge: Handles (Stories) bzw. ein Highlight; geladene Gruppen je Index
    @State private var sequence: [String] = []
    @State private var groups: [Int: StoryGroup] = [:]
    @State private var unavailable: Set<Int> = []
    @State private var pendingStart: Int?
    @State private var gi = 0
    @State private var ii = 0
    @State private var loadError: String?

    // Wiedergabe
    @State private var elapsed: Double = 0
    @State private var progress: Double = 0
    @State private var mediaReady = false
    @State private var image: UIImage?
    @State private var player: AVPlayer?
    @State private var muted = false

    // Bedienung
    @State private var holding = false
    @State private var userPaused = false
    @State private var touchStart: Date?
    @State private var holdTask: Task<Void, Never>?
    @State private var dragY: CGFloat = 0
    @State private var reply = ""
    @FocusState private var replyFocused: Bool
    @State private var sending = false
    @State private var sheet: ViewerSheet?
    @State private var confirmDelete = false
    /// Person, die nach Rückfrage blockiert werden soll (Story pausiert so lange)
    @State private var blockTarget: StoryGroup?
    @State private var changed = false

    private enum ViewerSheet: Identifiable {
        case viewers(String), highlight(String), report(String)
        var id: String {
            switch self {
            case .viewers(let s): "v\(s)"
            case .highlight(let s): "h\(s)"
            case .report(let s): "r\(s)"
            }
        }
    }

    private var group: StoryGroup? { groups[gi] }
    private var item: StoryItem? { group.flatMap { ii < $0.items.count ? $0.items[ii] : nil } }
    private var paused: Bool { holding || userPaused || replyFocused || sheet != nil || confirmDelete || blockTarget != nil || scenePhase != .active }

    var body: some View {
        ZStack {
            Color(hex: 0x151312).ignoresSafeArea()
            if let group, let item {
                content(group, item)
                    .offset(y: dragY)
                    .scaleEffect(1 - min(dragY, 300) / 1600)
            } else if let loadError {
                gone(loadError)
            } else {
                ProgressView().tint(.white).controlSize(.large)
            }
        }
        .statusBarHidden()
        .persistentSystemOverlays(.hidden)
        .task { await start() }
        .task(id: TickKey(item: item?.id, paused: paused, ready: mediaReady)) { await tick() }
        .onChange(of: item?.id) { _, _ in prepareItem() }
        .onChange(of: gi) { _, _ in prefetchNext() }
        .onChange(of: muted) { _, m in player?.isMuted = m }
        .onDisappear {
            player?.pause()
            player = nil
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            if changed { NotificationCenter.default.post(name: .storiesChanged, object: nil) }
        }
        // Videos unter der Höchstlänge: Ende des Videos → nächste Story
        .onReceive(NotificationCenter.default.publisher(for: AVPlayerItem.didPlayToEndTimeNotification).receive(on: RunLoop.main)) { note in
            if let p = player, (note.object as? AVPlayerItem) === p.currentItem { next() }
        }
        .sheet(item: $sheet) { s in
            Group {
                switch s {
                case .viewers(let id): StoryViewersSheet(storyId: id)
                case .highlight(let id): StoryHighlightPickerSheet(storyId: id)
                case .report(let id): ReportSheet(targetType: "STORY", targetId: id, title: "Story")
                }
            }
            .environment(app)
            .environment(router)
            .toastOverlay()
        }
        .confirmationDialog("Story löschen?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Löschen", role: .destructive) { Task { await deleteCurrent() } }
        } message: {
            Text("Sie verschwindet sofort aus dem Story-Kreis, deinem Archiv und allen Highlights.")
        }
        .confirmationDialog(
            "\(blockTarget?.author.displayName ?? "Profil") blockieren?",
            isPresented: Binding(get: { blockTarget != nil }, set: { if !$0 { blockTarget = nil } }),
            titleVisibility: .visible,
            presenting: blockTarget
        ) { g in
            Button("Blockieren", role: .destructive) { Task { await block(g) } }
        } message: { _ in
            Text("Ihr seht gegenseitig keine Stories, Beiträge und Nachrichten mehr. Du kannst das in den Einstellungen rückgängig machen.")
        }
    }

    private struct TickKey: Hashable { var item: String?; var paused: Bool; var ready: Bool }

    // MARK: Aufbau

    @ViewBuilder private func content(_ g: StoryGroup, _ s: StoryItem) -> some View {
        VStack(spacing: 10) {
            GeometryReader { geo in
                ZStack {
                    stage(s, width: geo.size.width)
                    // Tipp-, Halte- und Wischfläche
                    Color.clear
                        .contentShape(.rect)
                        .gesture(touch(width: geo.size.width))
                        .accessibilityHidden(true)
                    VStack(spacing: 0) {
                        header(g, s)
                        Spacer(minLength: 0)
                        footerInStage(s)
                    }
                }
                .clipShape(.rect(cornerRadius: 18, style: .continuous))
            }
            bottomBar(g, s)
                .padding(.horizontal, 12)
                .padding(.bottom, 4)
        }
        .padding(.top, 6)
        .accessibilityElement(children: .contain)
        .accessibilityAction(named: "Nächste Story") { next() }
        .accessibilityAction(named: "Vorherige Story") { prev() }
        .accessibilityAction(.magicTap) { userPaused.toggle() }
    }

    /// Inhalt der Story: Text auf Farbfläche, Foto oder Video
    @ViewBuilder private func stage(_ s: StoryItem, width: CGFloat) -> some View {
        if s.isText {
            let bg = StoryBackground.from(s.background)
            ZStack {
                bg.background
                Text(s.text)
                    .font(.wr(size: max(15, width * StoryFmt.textScale(s.text)), weight: .bold))
                    .tracking(-0.3)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(bg.foreground)
                    .minimumScaleFactor(0.6)
                    .padding(.horizontal, width * 0.09)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(s.text)
        } else if let m = s.media, m.isReady {
            ZStack {
                (Color(hexString: m.dominant) ?? Color(hex: 0x151312))
                if m.isVideo, let player {
                    StoryPlayerLayer(player: player, fill: m.fills)
                } else if let image {
                    Image(uiImage: image)
                        .resizable()
                        .aspectRatio(contentMode: m.fills ? .fill : .fit)
                } else {
                    RemoteImage(path: m.poster) { Color.clear }
                    ProgressView().tint(.white)
                }
            }
            .clipped()
            .accessibilityElement()
            .accessibilityLabel(s.alt?.nilIfEmpty ?? (m.isVideo ? "Video" : "Foto"))
        } else {
            VStack(spacing: 10) {
                if s.media?.state == "FAILED" {
                    Image(systemName: "exclamationmark.triangle").font(.title2)
                    Text("\(s.media?.error ?? "Diese Datei konnte nicht verarbeitet werden.") Lösche die Story und versuche es mit einer anderen Datei.")
                } else {
                    ProgressView().tint(.white)
                    Text("Das Video wird verarbeitet – deine Story erscheint, sobald es fertig ist.")
                }
            }
            .font(.wr(.subheadline))
            .foregroundStyle(.white.opacity(0.85))
            .multilineTextAlignment(.center)
            .padding(32)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color(hex: 0x1F1C1B))
        }
    }

    private func header(_ g: StoryGroup, _ s: StoryItem) -> some View {
        VStack(spacing: 10) {
            HStack(spacing: 4) {
                ForEach(Array(g.items.enumerated()), id: \.element.id) { idx, _ in
                    GeometryReader { geo in
                        Capsule().fill(.white.opacity(0.45))
                            .overlay(alignment: .leading) {
                                Capsule().fill(.white)
                                    .frame(width: geo.size.width * (idx < ii ? 1 : idx == ii ? progress : 0))
                            }
                            .overlay(Capsule().strokeBorder(.black.opacity(0.18), lineWidth: 0.5))
                    }
                    .frame(height: 3)
                }
            }
            .accessibilityHidden(true)

            // Abstand 0: Die Knöpfe haben 44-pt-Tippflächen um 36-pt-Kreise (sichtbarer Abstand bleibt 8 pt)
            HStack(spacing: 0) {
                Button {
                    let h = g.author.handle
                    dismiss()
                    Task { try? await Task.sleep(for: .milliseconds(350)); router.open(.profile(handle: h)) }
                } label: {
                    HStack(spacing: 8) {
                        AvatarView(url: g.author.avatarUrl, name: g.author.displayName, size: 30)
                        VStack(alignment: .leading, spacing: 0) {
                            Text(g.isHighlight ? (g.title ?? "Highlight") : g.author.displayName)
                                .font(.wr(.footnote, .semibold))
                                .lineLimit(1)
                            HStack(spacing: 4) {
                                Text(g.isHighlight ? "@\(g.author.handle)" : StoryFmt.age(s.createdAt))
                                if s.isFollowersOnly { Text("· Follower") }
                                if s.viewer.own && s.expired { Text("· archiviert") }
                            }
                            .font(.wr(.caption2))
                            .foregroundStyle(.white.opacity(0.8))
                        }
                    }
                    .foregroundStyle(.white)
                    .padding(.leading, 3).padding(.trailing, 12).padding(.vertical, 3)
                    .background(.black.opacity(0.35), in: Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(g.author.displayName), \(StoryFmt.age(s.createdAt))")
                .accessibilityHint("Profil öffnen")

                Spacer(minLength: 0)

                if s.isVideo {
                    stageButton(muted ? "speaker.slash.fill" : "speaker.wave.2.fill", label: muted ? "Ton an" : "Ton aus") { muted.toggle() }
                }
                stageButton(userPaused ? "play.fill" : "pause.fill", label: userPaused ? "Fortsetzen" : "Pausieren") { userPaused.toggle() }
                Menu {
                    menuItems(g, s)
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 36, height: 36)
                        .background(.black.opacity(0.35), in: Circle())
                        .frame(width: 44, height: 44)
                        .contentShape(.rect)
                }
                .accessibilityLabel("Story-Optionen")
                stageButton("xmark", label: "Stories schliessen") { close() }
            }
        }
        .padding(.horizontal, 10)
        .padding(.top, 10)
    }

    @ViewBuilder private func menuItems(_ g: StoryGroup, _ s: StoryItem) -> some View {
        if s.viewer.own {
            Button("Zu Highlight hinzufügen", systemImage: "star") { sheet = .highlight(s.id) }
            Button("Story löschen", systemImage: "trash", role: .destructive) { confirmDelete = true }
        } else {
            Button("Profil ansehen", systemImage: "person.crop.circle") {
                let h = g.author.handle
                dismiss()
                Task { try? await Task.sleep(for: .milliseconds(350)); router.open(.profile(handle: h)) }
            }
            if app.isSignedIn && !g.isHighlight {
                Button("Stories von \(firstName(g.author.displayName)) ausblenden", systemImage: "eye.slash") { Task { await muteStories(g) } }
            }
            if app.isSignedIn {
                Button("Story melden …", systemImage: "flag") { sheet = .report(s.id) }
                Button("\(firstName(g.author.displayName)) blockieren", systemImage: "hand.raised", role: .destructive) { blockTarget = g }
            }
        }
    }

    private func stageButton(_ symbol: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 36, height: 36)
                .background(.black.opacity(0.35), in: Circle())
                // Sichtbar 36 pt, Tippfläche 44 × 44 pt (Mindestgrösse)
                .frame(width: 44, height: 44)
                .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    /// Bildunterschrift und Projektfaden unten auf der Story
    @ViewBuilder private func footerInStage(_ s: StoryItem) -> some View {
        VStack(spacing: 10) {
            if !s.isText, let caption = s.text.nilIfEmpty {
                Text(caption)
                    .font(.wr(.subheadline))
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 14).padding(.vertical, 9)
                    .background(.black.opacity(0.55), in: .rect(cornerRadius: 14, style: .continuous))
            }
            if let p = s.project {
                Button {
                    dismiss()
                    Task { try? await Task.sleep(for: .milliseconds(350)); router.open(.project(handle: p.handle, slug: p.slug)) }
                } label: {
                    HStack(spacing: 10) {
                        CoverView(url: p.coverUrl, seed: p.id, category: nil, showLabel: false)
                            .frame(width: 40, height: 40)
                            .clipShape(.rect(cornerRadius: 10, style: .continuous))
                        VStack(alignment: .leading, spacing: 1) {
                            SpecLabel("Projekt")
                            Text(p.title).font(.wr(.subheadline, .semibold)).foregroundStyle(Color(hex: 0x262427)).lineLimit(1)
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "arrow.up.right").font(.footnote.weight(.semibold)).foregroundStyle(Color(hex: 0x6B6461))
                    }
                    .padding(8).padding(.trailing, 4)
                    .background(.white, in: .rect(cornerRadius: 16, style: .continuous))
                    .frame(maxWidth: 340)
                }
                .buttonStyle(.plain)
                .environment(\.colorScheme, .light)
                .accessibilityLabel("Projekt \(p.title) öffnen")
            }
        }
        .padding(.horizontal, 12)
        .padding(.bottom, 14)
    }

    @ViewBuilder private func bottomBar(_ g: StoryGroup, _ s: StoryItem) -> some View {
        if s.viewer.own {
            HStack(spacing: 10) {
                Button { sheet = .viewers(s.id) } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "eye")
                        Text("\(s.stats?.views ?? 0)").monospacedDigit().fontWeight(.semibold)
                        Text("gesehen").foregroundStyle(.white.opacity(0.75))
                        if let likes = s.stats?.likes, likes > 0 {
                            Image(systemName: "heart.fill").foregroundStyle(Color(hex: 0xE47F6B))
                            Text("\(likes)").monospacedDigit()
                        }
                    }
                    .font(.wr(.subheadline))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 14).frame(height: 44)
                    .background(.white.opacity(0.1), in: Capsule())
                }
                .buttonStyle(.plain)
                Spacer(minLength: 0)
                Button { sheet = .highlight(s.id) } label: {
                    Label("Highlight", systemImage: "star")
                        .font(.wr(.subheadline, .semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 16).frame(height: 44)
                        .overlay(Capsule().strokeBorder(.white.opacity(0.4)))
                }
                .buttonStyle(.plain)
            }
        } else if app.isSignedIn {
            HStack(spacing: 10) {
                TextField("", text: $reply, prompt: Text("Antworten an \(firstName(g.author.displayName)) …").foregroundStyle(.white.opacity(0.7)))
                    .font(.wr(.body))
                    .foregroundStyle(.white)
                    .tint(.white)
                    .focused($replyFocused)
                    .submitLabel(.send)
                    .onSubmit { Task { await sendReply() } }
                    .padding(.horizontal, 16)
                    .frame(height: 44)
                    .overlay(Capsule().strokeBorder(.white.opacity(replyFocused ? 0.8 : 0.4)))
                    .accessibilityLabel("Antwort an \(g.author.displayName)")
                if reply.trimmed.isEmpty {
                    Button { Task { await toggleLike() } } label: {
                        Image(systemName: s.viewer.liked ? "heart.fill" : "heart")
                            .font(.system(size: 22, weight: .regular))
                            .foregroundStyle(s.viewer.liked ? Color(hex: 0xE47F6B) : .white)
                            .symbolEffect(.bounce, value: s.viewer.liked)
                            .frame(width: 44, height: 44)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(s.viewer.liked ? "Herz entfernen" : "Story mit Herz markieren")
                } else {
                    Button { Task { await sendReply() } } label: {
                        Group {
                            if sending { ProgressView().tint(.white) } else { Image(systemName: "paperplane.fill") }
                        }
                        .foregroundStyle(.white)
                        .frame(width: 44, height: 44)
                        .background(Color(hex: 0xB64B3A), in: Circle())
                    }
                    .buttonStyle(.plain)
                    .disabled(sending)
                    .accessibilityLabel("Antwort senden")
                }
            }
        } else {
            Text("Melde dich an, um zu antworten.")
                .font(.wr(.subheadline))
                .foregroundStyle(.white.opacity(0.75))
                .frame(maxWidth: .infinity, minHeight: 44)
        }
    }

    private func gone(_ message: String) -> some View {
        VStack(spacing: 14) {
            SpecLabel("Stories", color: .white.opacity(0.6))
            Text("Gerade keine Stories.").font(.display(28)).foregroundStyle(.white)
            Text(message).font(.wr(.subheadline)).foregroundStyle(.white.opacity(0.75)).multilineTextAlignment(.center)
            Button("Schliessen") { close() }
                .font(.wr(.subheadline, .semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, 22).frame(height: 44)
                .overlay(Capsule().strokeBorder(.white.opacity(0.4)))
                .padding(.top, 6)
        }
        .padding(32)
    }

    // MARK: Gesten

    private func touch(width: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { v in
                if touchStart == nil {
                    touchStart = .now
                    holdTask = Task {
                        try? await Task.sleep(for: .milliseconds(200))
                        if !Task.isCancelled { holding = true }
                    }
                }
                let dy = v.translation.height
                if dy > 0, dy > abs(v.translation.width) { dragY = dy }
            }
            .onEnded { v in
                holdTask?.cancel()
                let wasHolding = holding
                holding = false
                let duration = Date.now.timeIntervalSince(touchStart ?? .now)
                touchStart = nil
                let dx = v.translation.width, dy = v.translation.height
                if dy > 120, dy > abs(dx) { close(); return }
                withAnimation(.snappy) { dragY = 0 }
                if abs(dx) > 70, abs(dx) > abs(dy) { goGroup(dx < 0 ? 1 : -1); return }
                if wasHolding || duration > 0.45 || abs(dx) > 12 || abs(dy) > 12 { return }
                if v.location.x < width * 0.3 { prev() } else { next() }
            }
    }

    // MARK: Ablauf

    private func start() async {
        do {
            switch request.source {
            case .user(let handle, let focus):
                let r = try await StoryAPI.start(handle: handle, focus: focus)
                // Erste Gruppe immer die angetippte Person (auch nach einer Handle-Weiterleitung)
                sequence = r.sequence.first == r.group.author.handle ? r.sequence : [r.group.author.handle] + r.sequence.dropFirst()
                groups[0] = r.group
                ii = min(r.group.startIndex, max(0, r.group.items.count - 1))
            case .highlight(let id):
                let g = try await StoryAPI.highlight(id)
                sequence = [g.key]
                groups[0] = g
                ii = 0
            }
            prefetchNext()
        } catch {
            loadError = (error as? APIError)?.status == 404
                ? "Stories bleiben 24 Stunden sichtbar. Diese sind abgelaufen, wurden gelöscht oder sind nur für Follower."
                : ((error as? APIError)?.message ?? error.localizedDescription)
        }
    }

    private func load(_ i: Int) async {
        guard i >= 0, i < sequence.count, groups[i] == nil, !unavailable.contains(i) else { return }
        if let g = try? await StoryAPI.group(handle: sequence[i]), !g.items.isEmpty {
            groups[i] = g
            if pendingStart == i, gi == i {
                pendingStart = nil
                ii = min(g.startIndex, g.items.count - 1)
            }
        } else {
            unavailable.insert(i)
            if gi == i { goGroup(1) }
        }
    }

    private func prefetchNext() {
        let n = gi + 1
        guard n < sequence.count, groups[n] == nil, !unavailable.contains(n) else { return }
        Task { await load(n) }
    }

    private func next() {
        guard let g = group else { return }
        if ii < g.items.count - 1 { ii += 1 } else { goGroup(1) }
    }

    private func prev() {
        if ii > 0 { ii -= 1 } else { goGroup(-1) }
    }

    private func goGroup(_ dir: Int) {
        var j = gi + dir
        while j >= 0, j < sequence.count, unavailable.contains(j) { j += dir }
        if j < 0 { restartItem(); return }
        if j >= sequence.count { close(); return }
        withAnimation(.snappy(duration: 0.25)) {
            gi = j
            if let g = groups[j] {
                ii = dir > 0 ? min(g.startIndex, g.items.count - 1) : 0
            } else {
                ii = 0
                pendingStart = j
            }
        }
        if groups[j] == nil { Task { await load(j) } }
    }

    private func restartItem() {
        elapsed = 0
        progress = 0
        player?.seek(to: .zero)
    }

    /// Neue Story: Zeit zurücksetzen, Medium laden, als gesehen melden
    private func prepareItem() {
        elapsed = 0
        progress = 0
        image = nil
        player?.pause()
        player = nil
        guard let s = item else { return }
        if s.isText || s.media?.isReady != true {
            mediaReady = true
        } else if let m = s.media, m.isVideo, let url = AppConfig.resolve(m.video) {
            mediaReady = false
            try? AVAudioSession.sharedInstance().setCategory(.soloAmbient, mode: .moviePlayback)
            let p = AVPlayer(url: url)
            p.isMuted = muted
            p.automaticallyWaitsToMinimizeStalling = true
            player = p
            // Bereit, sobald das erste Bild abspielbar ist (spätestens nach 4 s)
            Task {
                for _ in 0..<40 {
                    if p.currentItem?.status == .readyToPlay { break }
                    try? await Task.sleep(for: .milliseconds(100))
                }
                if player === p { mediaReady = true }
            }
        } else if let m = s.media, let url = AppConfig.resolve(m.image ?? m.poster) {
            mediaReady = false
            let id = s.id
            Task {
                let img = await ImageCache.shared.load(url)
                guard item?.id == id else { return }
                image = img
                mediaReady = true
            }
        } else {
            mediaReady = true
        }
        if !s.viewer.own, !s.viewer.seen, app.isSignedIn {
            patch(s.id) { $0.viewer.seen = true }
            changed = true
            Task { await StoryAPI.seen(s.id) }
        }
    }

    /// Fortschritt: Zeit bei Fotos/Text, Abspielposition bei Videos
    private func tick() async {
        guard let s = item else { return }
        guard !paused, mediaReady else {
            player?.pause()
            return
        }
        player?.play()
        var last = Date.now
        while !Task.isCancelled {
            try? await Task.sleep(for: .milliseconds(40))
            if Task.isCancelled { break }
            if let p = player, s.isVideo {
                let t = p.currentTime().seconds
                elapsed = t.isFinite ? t : elapsed
            } else {
                elapsed += Date.now.timeIntervalSince(last)
            }
            last = .now
            progress = min(1, elapsed / max(1, s.durationSec))
            // Videos enden über die Benachrichtigung „zu Ende gespielt“; längere werden bei der Höchstlänge abgeschnitten
            if s.isVideo ? elapsed >= StoryRules.videoMaxSeconds : progress >= 1 {
                next()
                return
            }
        }
        player?.pause()
    }

    private func patch(_ id: String, _ f: (inout StoryItem) -> Void) {
        guard var g = groups[gi], let i = g.items.firstIndex(where: { $0.id == id }) else { return }
        f(&g.items[i])
        groups[gi] = g
    }

    // MARK: Aktionen

    private func close() {
        player?.pause()
        dismiss()
    }

    private func toggleLike() async {
        guard let s = item else { return }
        let liked = !s.viewer.liked
        Haptics.selection()
        patch(s.id) { $0.viewer.liked = liked }
        do {
            try await StoryAPI.like(s.id, liked)
        } catch {
            patch(s.id) { $0.viewer.liked = !liked }
            app.show(error: error)
        }
    }

    private func sendReply() async {
        guard let s = item, let body = reply.trimmed.nilIfEmpty, !sending else { return }
        sending = true
        defer { sending = false }
        do {
            let r = try await StoryAPI.reply(s.id, body)
            reply = ""
            replyFocused = false
            Haptics.success()
            app.show(r.asRequest == true ? "Als Kontaktanfrage gesendet." : "Antwort gesendet.")
        } catch {
            app.show(error: error)
        }
    }

    private func deleteCurrent() async {
        guard let s = item, var g = group else { return }
        do {
            try await StoryAPI.delete(s.id)
            changed = true
            app.show("Story gelöscht.")
            g.items.removeAll { $0.id == s.id }
            if g.items.isEmpty { close(); return }
            groups[gi] = g
            ii = min(ii, g.items.count - 1)
        } catch {
            app.show(error: error)
        }
    }

    private func muteStories(_ g: StoryGroup) async {
        do {
            try await StoryAPI.muteStories(of: g.author.id, true)
            changed = true
            app.show("Stories von \(g.author.displayName) sind ausgeblendet.")
            unavailable.insert(gi)
            goGroup(1)
        } catch {
            app.show(error: error)
        }
    }

    private func block(_ g: StoryGroup) async {
        do {
            try await SocialAPI.block(g.author.id, true)
            changed = true
            app.show("\(g.author.displayName) ist blockiert.")
            unavailable.insert(gi)
            goGroup(1)
        } catch {
            app.show(error: error)
        }
    }

    private func firstName(_ s: String) -> String { s.split(separator: " ").first.map(String.init) ?? s }
}

// MARK: - Video ohne Bedienelemente

/// AVPlayerLayer für Story-Videos (keine Systemsteuerung, füllt oder passt ein)
struct StoryPlayerLayer: UIViewRepresentable {
    var player: AVPlayer
    var fill: Bool

    final class PlayerView: UIView {
        override class var layerClass: AnyClass { AVPlayerLayer.self }
        var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
    }

    func makeUIView(context: Context) -> PlayerView {
        let v = PlayerView()
        v.playerLayer.player = player
        v.playerLayer.videoGravity = fill ? .resizeAspectFill : .resizeAspect
        v.backgroundColor = .clear
        return v
    }

    func updateUIView(_ v: PlayerView, context: Context) {
        if v.playerLayer.player !== player { v.playerLayer.player = player }
        v.playerLayer.videoGravity = fill ? .resizeAspectFill : .resizeAspect
    }
}
