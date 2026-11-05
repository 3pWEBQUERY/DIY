import SwiftUI

/// Gast-Feed: aktuelle öffentliche Beiträge (`/feed?kind=new`) und Einladung zur Anmeldung.
struct GuestFeedView: View {
    @Environment(AppState.self) private var app
    @State private var items: [PostItem] = []
    @State private var cursor: String?
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                VStack(alignment: .leading, spacing: 12) {
                    SpecLabel("Werkuno · Gastzugang", color: .moss)
                    Text("Sieh dich um.").font(.display(36))
                    Text("Projekte, Anleitungen und Menschen, die mit den Händen arbeiten. Mit einem Konto kannst du folgen, speichern und selbst dokumentieren.")
                        .font(.wr(.subheadline)).foregroundStyle(Color.muted)
                    Button { app.requestSignIn() } label: { Text("Anmelden oder registrieren").frame(maxWidth: .infinity) }
                        .primaryButton()
                }
                .padding(.bottom, 8)
                SectionHeader("Neu in der Werkstatt", number: "01")
                if loading && items.isEmpty { LoadingView() }
                else if let error, items.isEmpty { ErrorStateView(message: error) { await load(reset: true) } }
                ForEach(items) { p in PostCardView(post: p) }
                LoadMoreTrigger(hasMore: cursor != nil) { await load() }
            }
            .padding(.horizontal, Space.gutter)
            .padding(.vertical, 12)
        }
        .background(Color.paper)
        .refreshable { await load(reset: true) }
        .task { if items.isEmpty { await load(reset: true) } }
        .toolbar {
            ToolbarItem(placement: .principal) { Wordmark(size: 17) }
        }
        .navigationBarTitleDisplayMode(.inline)
    }

    private func load(reset: Bool = false) async {
        do {
            let page: Page<PostItem> = try await APIClient.shared.get("/feed", query: ["kind": "new", "cursor": reset ? nil : cursor])
            withAnimation { items = reset ? page.items : items + page.items; cursor = page.nextCursor; error = nil }
        } catch { self.error = (error as? APIError)?.message ?? error.localizedDescription }
        loading = false
    }
}

struct GuestMeView: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                ThreeCanvas(scene: .glyph("thread", color: .clay, spin: 0.15))
                    .frame(height: 220)
                PageTitle(kicker: "Dein Werkuno", title: "Noch ohne Konto", subtitle: "Mit einem kostenlosen Konto dokumentierst du Projekte, sammelst Anleitungen und tauschst dich mit der Community aus.")
                Button { app.requestSignIn() } label: { Text("Anmelden oder registrieren").frame(maxWidth: .infinity) }.primaryButton()
                VStack(spacing: 0) {
                    ForEach([("Hilfe", "/hilfe"), ("Community-Richtlinien", "/richtlinien/community"), ("Datenschutz", "/rechtliches/datenschutz"), ("AGB", "/rechtliches/agb"), ("Impressum", "/rechtliches/impressum")], id: \.1) { item in
                        Button { router.open(.web(path: item.1)) } label: {
                            HStack { Text(item.0).foregroundStyle(Color.ink); Spacer(); Image(systemName: "arrow.up.right").font(.wr(.caption)).foregroundStyle(Color.muted) }
                                .padding(.vertical, 14).contentShape(.rect)
                        }
                        .buttonStyle(.plain)
                        .hairline()
                    }
                }
            }
            .padding(Space.gutter)
        }
        .background(Color.paper)
    }
}

struct GuestAccessory: View {
    @Environment(AppState.self) private var app
    var body: some View {
        Button { app.requestSignIn() } label: {
            HStack {
                Image(systemName: "person.crop.circle.badge.plus")
                Text("Konto erstellen oder anmelden").font(.wr(.subheadline, .semibold))
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.wr(.caption))
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 44)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .foregroundStyle(Color.ink)
    }
}
