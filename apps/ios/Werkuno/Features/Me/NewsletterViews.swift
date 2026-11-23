import SwiftUI

/// Antwort von `GET /creators/:id/newsletter` – `newsletter` fehlt, wenn er hier keine Rolle spielt
/// (kein Pro-Profil, nicht gefolgt, eigenes Profil).
struct NewsletterStateResponse: Decodable, Sendable {
    struct State: Decodable, Sendable { var subscribed: Bool; var globalOn: Bool }
    var newsletter: State?
}

/// Profil einer Pro-Creatorin für Follower:innen: Newsletter per E-Mail abonniert bzw. abbestellt.
/// Erscheint nur, wenn es etwas zu entscheiden gibt; Folgen bleibt davon unberührt.
struct NewsletterProfileButton: View {
    var creatorId: String
    var creatorName: String
    /// Ändert sich mit „Folgen“ – dann den Zustand neu laden
    var following: Bool

    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @State private var state: NewsletterStateResponse.State?
    @State private var busy = false

    var body: some View {
        Group {
            if let state {
                if state.globalOn {
                    Button { Task { await toggle(!state.subscribed) } } label: {
                        Image(systemName: state.subscribed ? "envelope.badge.fill" : "envelope")
                            .font(.wr(.subheadline, .semibold))
                            .frame(minWidth: 22, minHeight: 22)
                    }
                    .buttonStyle(.glass)
                    .disabled(busy)
                    .accessibilityLabel(state.subscribed ? "Newsletter von \(creatorName) abbestellen" : "Newsletter von \(creatorName) abonnieren")
                    .accessibilityAddTraits(state.subscribed ? .isSelected : [])
                } else {
                    Button { router.open(.settingsSection(.notifications)) } label: {
                        Image(systemName: "envelope.badge.shield.half.filled").font(.wr(.subheadline, .semibold)).frame(minWidth: 22, minHeight: 22)
                    }
                    .buttonStyle(.glass)
                    .accessibilityLabel("Newsletter sind in deinen Benachrichtigungen ausgeschaltet")
                }
            }
        }
        .task(id: "\(creatorId)-\(following)") { await load() }
    }

    private func load() async {
        guard app.isSignedIn else { state = nil; return }
        let r: NewsletterStateResponse? = try? await APIClient.shared.get("/creators/\(creatorId)/newsletter")
        state = r?.newsletter
    }

    private func toggle(_ subscribed: Bool) async {
        busy = true
        defer { busy = false }
        Haptics.selection()
        let message = subscribed ? "Du bekommst den Newsletter von \(creatorName) per E-Mail." : "Newsletter von \(creatorName) abbestellt. Du folgst weiterhin."
        let ok = await app.run(message) {
            _ = try await APIClient.shared.put("/creators/\(creatorId)/newsletter", ["subscribed": JSONValue.bool(subscribed)]) as JSONValue
        }
        if ok { state?.subscribed = subscribed }
    }
}
