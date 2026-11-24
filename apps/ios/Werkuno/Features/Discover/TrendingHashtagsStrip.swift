import SwiftUI

// Entdecken: „Beliebte Hashtags“ der letzten 30 Tage (wie im Web) – Tipp öffnet die Hashtag-Seite.
// Server: GET /hashtags/trending

private struct TrendingHashtagsPage: Decodable, Sendable {
    var items: [HashtagSummary]
}

struct TrendingHashtagsStrip: View {
    @Environment(Router.self) private var router
    @State private var items: [HashtagSummary] = []

    var body: some View {
        Group {
            if !items.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    SpecLabel("Beliebte Hashtags")
                        .padding(.horizontal, Space.gutter)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(items) { h in chip(h) }
                        }
                        .padding(.horizontal, Space.gutter)
                    }
                }
            }
        }
        .task { if items.isEmpty { await load() } }
    }

    private func chip(_ h: HashtagSummary) -> some View {
        Button {
            Haptics.selection()
            router.open(.hashtag(h.name))
        } label: {
            HStack(spacing: 2) {
                Text("#").foregroundStyle(Color.moss)
                Text(h.display).foregroundStyle(Color.ink2)
            }
            .font(.wr(.subheadline))
            .padding(.horizontal, 12)
            .frame(height: 32)
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Color.line, lineWidth: 1))
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Hashtag \(h.display), \(Fmt.plural(h.count, "Inhalt", "Inhalte"))")
    }

    private func load() async {
        // Optional: ohne Trends bleibt der Bereich einfach leer
        if let p: TrendingHashtagsPage = try? await APIClient.shared.get("/hashtags/trending") {
            withAnimation(.snappy) { items = p.items }
        }
    }
}
