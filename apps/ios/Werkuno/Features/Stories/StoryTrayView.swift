import SwiftUI

// MARK: - Ring

/// Profilbild mit Story-Ring: Koralle = neue Stories, Haarlinie = alles gesehen.
/// Bewusst ohne Verlauf – eine klare Linie mit Papierabstand zum Bild (wie im Web).
struct StoryRingAvatar: View {
    enum Ring { case unseen, seen, none }
    var url: String?
    var name: String
    var size: CGFloat = 62
    var state: Ring

    var body: some View {
        AvatarView(url: url, name: name, size: size)
            .padding(3)
            .overlay {
                Circle().strokeBorder(ringColor, lineWidth: 2)
            }
            .padding(1)
    }

    private var ringColor: Color {
        switch state {
        case .unseen: .moss
        case .seen: .lineStrong
        case .none: .clear
        }
    }
}

// MARK: - Story-Kreis im Feed

/// Story-Kreis oben im Werkbank-Feed: eigene Story (mit Plus) und die aktiven Stories der
/// Profile, denen du folgst – Neues zuerst, Gesehenes danach mit grauem Ring.
struct StoryTrayView: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @State private var tray: StoryTray?

    var body: some View {
        // VStack statt Group: existiert auch ohne Inhalt, damit .task/.onReceive laufen
        VStack(spacing: 0) {
            if let tray, tray.enabled, let own = tray.own {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .top, spacing: 14) {
                        ownBubble(own)
                        ForEach(tray.items) { entry in
                            Button { router.openStories(handle: entry.author.handle) } label: {
                                bubble(url: entry.author.avatarUrl, name: entry.author.displayName, label: firstName(entry.author.displayName), state: entry.unseen > 0 ? .unseen : .seen, bold: entry.unseen > 0)
                            }
                            .buttonStyle(.pressable)
                            .accessibilityLabel("Story von \(entry.author.displayName)")
                            .accessibilityValue(entry.unseen > 0 ? "\(entry.unseen) neu" : "gesehen")
                        }
                        if tray.items.isEmpty {
                            Text("Stories von Profilen, denen du folgst, erscheinen hier – 24 Stunden lang.")
                                .font(.wr(.footnote))
                                .foregroundStyle(Color.muted)
                                .frame(width: 210, alignment: .leading)
                                .padding(.top, 20)
                        }
                    }
                    .padding(.horizontal, Space.gutter)
                }
                .scrollClipDisabled()
                .padding(.top, Space.l)
                .transition(.opacity)
            }
        }
        .task(id: "\(app.me?.id ?? "")-\(app.storiesEnabled)") { await load() }
        .onReceive(NotificationCenter.default.publisher(for: .storiesChanged)) { _ in Task { await load() } }
    }

    private func ownBubble(_ own: StoryTray.Own) -> some View {
        let has = own.count > 0
        return ZStack(alignment: .topLeading) {
            Button {
                if has { router.openStories(handle: own.author.handle) } else { router.present(.storyComposer) }
            } label: {
                bubble(url: own.author.avatarUrl, name: own.author.displayName, label: "Deine Story", state: has ? .seen : .none, bold: false)
            }
            .buttonStyle(.pressable)
            .accessibilityLabel(has ? "Deine Story ansehen" : "Story erstellen")
            .accessibilityHint(has ? "\(own.count) aktiv" : "")

            Button { Haptics.tap(); router.present(.storyComposer) } label: {
                Image(systemName: "plus")
                    .font(.system(size: 11, weight: .heavy))
                    .foregroundStyle(Color.paper)
                    .frame(width: 22, height: 22)
                    .background(Color.moss, in: Circle())
                    .overlay(Circle().strokeBorder(Color.paper, lineWidth: 2))
            }
            .buttonStyle(.plain)
            .frame(width: 44, height: 44)
            .contentShape(.rect)
            .offset(x: 36, y: 36)
            .accessibilityLabel("Neue Story erstellen")
        }
    }

    private func bubble(url: String?, name: String, label: String, state: StoryRingAvatar.Ring, bold: Bool) -> some View {
        VStack(spacing: 6) {
            StoryRingAvatar(url: url, name: name, size: 62, state: state)
            Text(label)
                .font(.wr(.caption, bold ? .semibold : .regular))
                .foregroundStyle(bold ? Color.ink : Color.muted)
                .lineLimit(1)
                .frame(width: 74)
        }
        .frame(width: 74)
        .contentShape(.rect)
    }

    private func firstName(_ s: String) -> String { s.split(separator: " ").first.map(String.init) ?? s }

    private func load() async {
        guard app.isSignedIn, app.storiesEnabled else { tray = nil; return }
        if let t = try? await StoryAPI.tray() { withAnimation(.snappy) { tray = t } }
    }
}
