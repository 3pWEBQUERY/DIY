import SwiftUI

/// GET /studio/scheduled
struct ScheduledContentResponse: Decodable, Sendable {
    struct Item: Decodable, Identifiable, Sendable {
        var id: String
        var kind: String
        var title: String
        var at: String
        var href: String
    }
    var items: [Item]
    var pro: Bool?
}

/// Studio › Geplant: alles, was zeitgesteuert erscheint (Beiträge, Artikel, Projekte, Anleitungen,
/// Newsletter). Den Monatskalender gibt es im Web unter Studio › Inhaltskalender.
struct ScheduledContentView: View {
    @Environment(Router.self) private var router
    @State private var data: ScheduledContentResponse?
    @State private var error: String?

    var body: some View {
        List {
            if let data {
                if data.items.isEmpty {
                    EmptyStateView(symbol: "calendar.badge.clock", title: "Nichts geplant", message: emptyMessage(pro: data.pro == true))
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                } else {
                    ForEach(data.items) { it in
                        row(it)
                    }
                }
                if data.pro != true {
                    ProUnlockCard(feature: .kalender, message: "Mit Creator Pro planst du auch Projekte und Anleitungen und siehst alles Geplante im Inhaltskalender.")
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                }
            } else if let error {
                ErrorStateView(message: error) { await load() }
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            } else {
                LoadingView().listRowBackground(Color.clear).listRowSeparator(.hidden)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Color.paper)
        .navigationTitle("Geplant")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
    }

    private func row(_ it: ScheduledContentResponse.Item) -> some View {
        Button {
            if let r = Route.from(href: it.href) { router.open(r) } else { router.open(.web(path: it.href)) }
        } label: {
            HStack(spacing: 12) {
                Image(systemName: symbol(it.kind)).foregroundStyle(Color.moss).frame(width: 22)
                VStack(alignment: .leading, spacing: 3) {
                    Text(it.title).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink).lineLimit(2)
                    Text(subtitle(it)).font(.wr(.caption)).foregroundStyle(Color.muted)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.wr(.caption)).foregroundStyle(Color.muted)
            }
            .padding(.vertical, 6)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .listRowBackground(Color.clear)
    }

    private func subtitle(_ it: ScheduledContentResponse.Item) -> String {
        let when = PublishScheduleSection.parse(it.at).map { $0.formatted(date: .abbreviated, time: .shortened) } ?? ""
        return "\(label(it.kind)) · \(when)"
    }

    private func label(_ kind: String) -> String {
        switch kind {
        case "POST": "Beitrag"
        case "ARTICLE": "Artikel"
        case "PROJECT": "Projekt"
        case "TUTORIAL": "Anleitung"
        case "NEWSLETTER": "Newsletter"
        default: "Inhalt"
        }
    }

    private func symbol(_ kind: String) -> String {
        switch kind {
        case "ARTICLE": "text.book.closed"
        case "PROJECT": "hammer"
        case "TUTORIAL": "list.number"
        case "NEWSLETTER": "envelope"
        default: "text.bubble"
        }
    }

    private func emptyMessage(pro: Bool) -> String {
        pro ? "Beim Veröffentlichen von Beiträgen, Artikeln, Projekten und Anleitungen kannst du einen Zeitpunkt wählen." : "Beiträge und Artikel kannst du beim Veröffentlichen auf später legen."
    }

    private func load() async {
        do {
            data = try await APIClient.shared.get("/studio/scheduled")
            error = nil
        } catch is CancellationError {
        } catch {
            self.error = (error as? APIError)?.message ?? error.localizedDescription
        }
    }
}
