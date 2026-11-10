import SwiftUI

/// Nachrichten: Posteingang, Anfragen, Archiv.
struct ConversationListView: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router

    @State private var box: SocialInboxBox
    @State private var items: [ConversationItem] = []
    @State private var counts = InboxCounts(requests: 0, unread: 0)
    @State private var loaded = false
    @State private var error: String?
    @State private var showNewGroup = false

    init(initialBox: SocialInboxBox = .inbox) {
        _box = State(initialValue: initialBox)
    }

    var body: some View {
        List {
            Section {
                PageTitle(kicker: "Werkstattgespräche", title: "Nachrichten", subtitle: subtitle)
                    .listRowInsets(EdgeInsets(top: 4, leading: Space.gutter, bottom: 8, trailing: Space.gutter))
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                ChipBar(items: SocialInboxBox.allCases.map { ($0, label($0)) }, selection: $box)
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                if box == .requests && !items.isEmpty {
                    NoticeView(tone: .info, message: "Anfragen kommen von Menschen, denen du nicht folgst. Sie sehen nicht, ob du gelesen hast, bis du annimmst.")
                        .listRowInsets(EdgeInsets(top: 8, leading: Space.gutter, bottom: 4, trailing: Space.gutter))
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                }
            }

            if !loaded {
                LoadingView()
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            } else if let error, items.isEmpty {
                ErrorStateView(message: error) { await load() }
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            } else if items.isEmpty {
                empty
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            } else {
                Section {
                    ForEach(items) { c in
                        ConversationRow(item: c) { router.open(.conversation(id: c.id)) }
                            .listRowInsets(EdgeInsets(top: 0, leading: Space.gutter, bottom: 0, trailing: Space.gutter))
                            .listRowBackground(Color.clear)
                            .listRowSeparatorTint(Color.line)
                            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                if box != .requests {
                                    Button { Task { await archive(c, box == .inbox) } } label: {
                                        Label(box == .inbox ? "Archivieren" : "Zurückholen", systemImage: box == .inbox ? "archivebox" : "tray.and.arrow.up")
                                    }
                                    .tint(box == .inbox ? .slate : .moss)
                                }
                            }
                    }
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Color.paper)
        .navigationTitle("Nachrichten")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("Neue Nachricht", systemImage: "square.and.pencil") {
                        Haptics.tap()
                        router.present(.newConversation())
                    }
                    Button("Neue Gruppe", systemImage: "person.3") {
                        Haptics.tap()
                        showNewGroup = true
                    }
                } label: { Image(systemName: "square.and.pencil") }
                .accessibilityLabel("Neue Nachricht oder Gruppe")
            }
        }
        .sheet(isPresented: $showNewGroup, onDismiss: { Task { await load() } }) {
            NewGroupSheet()
        }
        .task(id: box) { await load() }
        .onAppear { if loaded { Task { await load() } } }
        // Live: neue Nachrichten, Lesestand und Anfragen aktualisieren den Posteingang sofort
        .onReceive(NotificationCenter.default.publisher(for: LiveEvent.notification)) { n in
            guard LiveEvent(n) != nil, loaded else { return }
            Task { await load() }
        }
        .refreshable {
            await load()
            await app.refreshCounts()
        }
    }

    private var subtitle: String {
        var parts: [String] = []
        if counts.unread > 0 { parts.append(Fmt.plural(counts.unread, "ungelesene Unterhaltung", "ungelesene Unterhaltungen")) }
        if counts.requests > 0 { parts.append(Fmt.plural(counts.requests, "neue Anfrage", "neue Anfragen")) }
        return parts.isEmpty ? "Bezahle nur über den Werkuno-Checkout – nur dann gilt der Käuferschutz." : parts.joined(separator: " · ")
    }

    private func label(_ b: SocialInboxBox) -> String {
        switch b {
        case .inbox: counts.unread > 0 ? "\(b.label) \(counts.unread)" : b.label
        case .requests: counts.requests > 0 ? "\(b.label) \(counts.requests)" : b.label
        case .archived: b.label
        }
    }

    @ViewBuilder private var empty: some View {
        switch box {
        case .inbox:
            EmptyStateView(symbol: "bubble.left.and.bubble.right", title: "Noch keine Unterhaltungen", message: "Frag nach Material, Technik oder einer Bestellung – schreib einfach los.", actionTitle: "Neue Nachricht") {
                router.present(.newConversation())
            }
        case .requests:
            EmptyStateView(symbol: "tray", title: "Keine Anfragen", message: "Wenn dir jemand schreibt, dem du nicht folgst, oder dich in eine Gruppe einlädt, landet das zuerst hier.")
        case .archived:
            EmptyStateView(symbol: "archivebox", title: "Archiv ist leer", message: "Wische eine Unterhaltung nach links, um sie zu archivieren.")
        }
    }

    private func load() async {
        let b = box
        do {
            let r: SocialConversationList = try await APIClient.shared.get("/conversations", query: ["box": b.rawValue])
            guard b == box else { return }
            withAnimation(.snappy) {
                items = r.items
                if let c = r.counts { counts = c }
                error = nil
                loaded = true
            }
        } catch is CancellationError {
        } catch {
            self.error = (error as? APIError)?.message ?? error.localizedDescription
            loaded = true
        }
    }

    private func archive(_ c: ConversationItem, _ archived: Bool) async {
        Haptics.soft()
        withAnimation(.snappy) { items.removeAll { $0.id == c.id } }
        let ok = await app.run(archived ? "Archiviert." : "Zurück im Posteingang.") {
            _ = try await APIClient.shared.post("/conversations/\(c.id)/archive", ["archived": JSONValue.bool(archived)]) as JSONValue
        }
        if !ok { await load() }
        await app.refreshCounts()
    }
}

// MARK: - Zeile

private struct ConversationRow: View {
    var item: ConversationItem
    var action: () -> Void

    var body: some View {
        let unread = item.unread == true
        Button(action: action) {
            HStack(alignment: .top, spacing: 12) {
                avatar
                    .overlay(alignment: .topTrailing) {
                        if unread {
                            Circle().fill(Color.clay).frame(width: 12, height: 12)
                                .overlay(Circle().strokeBorder(Color.paper, lineWidth: 2))
                                .offset(x: 2, y: -2)
                        }
                    }
                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(title)
                            .font(.wr(.subheadline).weight(unread ? .bold : .semibold))
                            .foregroundStyle(Color.ink)
                            .a11yLineLimit(1)
                        Spacer(minLength: 4)
                        Text(Fmt.relative(item.lastMessageAt))
                            .font(.wr(.caption))
                            .monospacedDigit()
                            .foregroundStyle(unread ? Color.clay : Color.muted)
                    }
                    if let ctx = contextLabel {
                        Label(ctx.0, systemImage: ctx.1)
                            .font(.wr(.caption2, .semibold))
                            .foregroundStyle(Color.clayInk)
                            .labelStyle(.compact)
                    }
                    HStack(alignment: .top, spacing: 6) {
                        if item.flagged == true {
                            Image(systemName: "exclamationmark.shield.fill").font(.wr(.caption)).foregroundStyle(Color.warn)
                                .accessibilityLabel("Warnung: möglicher Zahlungslink")
                        }
                        Text(previewText)
                            .font(.wr(.subheadline))
                            .foregroundStyle(unread ? Color.ink : Color.muted)
                            .a11yLineLimit(2)
                            .multilineTextAlignment(.leading)
                    }
                }
            }
            .padding(.vertical, 12)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibility)
    }

    @ViewBuilder private var avatar: some View {
        if item.isGroup {
            SocialGroupAvatar(avatars: (item.group?.avatars ?? []).map { ($0.name, $0.avatarUrl) }, size: 48)
        } else {
            AvatarView(url: item.other?.avatarUrl, name: item.other?.displayName ?? "?", size: 48)
        }
    }

    private var title: String { item.displayTitle }

    private var contextLabel: (String, String)? {
        if item.isGroup { return (item.group?.memberCount.map { "Gruppe · \(Fmt.plural($0, "Person", "Personen"))" } ?? "Gruppe", "person.3") }
        if let n = item.orderNumber { return ("Bestellung \(n)", "shippingbox") }
        if item.isProductInquiry == true { return ("Produktanfrage", "tag") }
        return nil
    }

    private var previewText: String {
        let p = item.preview?.nilIfEmpty ?? "Bild"
        return item.lastFromMe == true ? "Du: \(p)" : p
    }

    private var accessibility: String {
        var s = title
        if item.unread == true { s += ", ungelesen" }
        if let c = contextLabel { s += ", \(c.0)" }
        s += ": \(previewText), \(Fmt.relative(item.lastMessageAt))"
        if item.flagged == true { s += ". Warnung: möglicher Zahlungslink" }
        return s
    }
}
