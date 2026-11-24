import SwiftUI

// Einstellungen › Feed: Profile, deren Stories ausgeblendet sind (wie im Web unter Feed & Interessen).
// Server: GET /me/story-mutes, POST /users/:id/story-mute { muted: false }

struct StoryMutesSection: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @State private var items: [StoryAuthor]?

    var body: some View {
        Section {
            if let items {
                if items.isEmpty {
                    Text("Du siehst die Stories aller Profile, denen du folgst.").foregroundStyle(Color.muted)
                } else {
                    ForEach(items) { a in row(a) }
                }
            } else {
                ProgressView()
            }
        } header: {
            Group { Text("Stories ausgeblendet") }.font(.wr(.footnote, .semibold))
        } footer: {
            Group { Text("Die Stories dieser Profile erscheinen nicht mehr im Story-Kreis. Ihre Beiträge siehst du weiterhin.") }.font(.wr(.footnote))
        }
        .task { if items == nil { await load() } }
    }

    private func row(_ a: StoryAuthor) -> some View {
        HStack(spacing: 12) {
            Button { router.open(.profile(handle: a.handle)) } label: {
                HStack(spacing: 10) {
                    AvatarView(url: a.avatarUrl, name: a.displayName, size: 34)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(a.displayName).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink)
                        Text("@\(a.handle)").font(.wr(.caption)).foregroundStyle(Color.muted)
                    }
                }
            }
            .buttonStyle(.plain)
            Spacer(minLength: 4)
            AsyncButton { await unmute(a) } label: { Text("Wieder anzeigen").font(.wr(.footnote, .semibold)) }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .accessibilityLabel("Stories von \(a.displayName) wieder anzeigen")
        }
    }

    private func load() async {
        do { items = try await APIClient.shared.get("/me/story-mutes") as [StoryAuthor] }
        catch is CancellationError {}
        catch { items = []; app.show(error: error) }
    }

    private func unmute(_ a: StoryAuthor) async {
        if await app.run("Stories von \(a.displayName) werden wieder angezeigt.", { _ = try await APIClient.shared.post("/users/\(a.id)/story-mute", ["muted": JSONValue.bool(false)]) as JSONValue }) {
            withAnimation { items?.removeAll { $0.id == a.id } }
        }
    }
}
