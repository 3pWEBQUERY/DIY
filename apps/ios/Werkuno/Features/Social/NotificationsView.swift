import SwiftUI

/// Posteingang der Benachrichtigungen mit Filtern, Gruppen nach Zeit und „Alle als gelesen“.
struct NotificationsView: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router

    @State private var filter: SocialNotificationFilter = .all
    @State private var items: [NotificationItem] = []
    @State private var cursor: String?
    @State private var unread: [String: Int] = [:]
    @State private var loaded = false
    @State private var error: String?

    var body: some View {
        List {
            Section {
                header
                    .listRowInsets(EdgeInsets(top: 4, leading: Space.gutter, bottom: 8, trailing: Space.gutter))
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                ChipBar(items: SocialNotificationFilter.allCases.map { ($0, chipLabel($0)) }, selection: $filter)
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            }

            if !loaded {
                LoadingView()
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            } else if let error, items.isEmpty {
                ErrorStateView(message: error) { await load(reset: true) }
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            } else if items.isEmpty {
                EmptyStateView(symbol: "bell.slash", title: filter.emptyTitle, message: filter.emptyBody)
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            } else {
                ForEach(groups, id: \.title) { g in
                    Section {
                        ForEach(g.items) { n in
                            NotificationRow(item: n) { Task { await open(n) } }
                                .listRowInsets(EdgeInsets(top: 0, leading: Space.gutter - 8, bottom: 0, trailing: Space.gutter - 8))
                                .listRowBackground(Color.clear)
                                .listRowSeparatorTint(Color.line)
                                .swipeActions(edge: .leading) {
                                    if !n.read {
                                        Button { Task { await markRead(n) } } label: { Label("Gelesen", systemImage: "checkmark.circle") }
                                            .tint(.moss)
                                    }
                                }
                        }
                    } header: {
                        HStack(spacing: 10) {
                            SpecLabel(g.title, color: .ink)
                            Rectangle().fill(Color.line).frame(height: 0.75)
                        }
                        .padding(.top, 8)
                        .accessibilityAddTraits(.isHeader)
                    }
                }
                LoadMoreTrigger(hasMore: cursor != nil) { await load(reset: false) }
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Color.paper)
        .navigationTitle("Benachrichtigungen")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if totalUnread > 0 {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { Task { await markAll() } } label: { Image(systemName: "checkmark.circle") }
                        .accessibilityLabel("Alle als gelesen markieren")
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button { router.open(.settingsSection(.notifications)) } label: { Image(systemName: "gearshape") }
                    .accessibilityLabel("Benachrichtigungen einstellen")
            }
        }
        .task(id: filter) { await load(reset: true) }
        .refreshable {
            await load(reset: true)
            await app.refreshCounts()
        }
    }

    // MARK: Kopf

    private var totalUnread: Int { unread["all"] ?? 0 }

    private var header: some View {
        PageTitle(
            kicker: "Posteingang",
            title: "Benachrichtigungen",
            subtitle: totalUnread > 0
                ? "\(Fmt.number(totalUnread)) ungelesen. Ähnliche Ereignisse werden gebündelt, damit dein Posteingang ruhig bleibt."
                : "Ähnliche Ereignisse werden gebündelt, damit dein Posteingang ruhig bleibt."
        )
        .contentTransition(.numericText())
    }

    private func chipLabel(_ f: SocialNotificationFilter) -> String {
        let n = unread[f.rawValue] ?? 0
        return n > 0 ? "\(f.label) \(Fmt.number(n))" : f.label
    }

    // MARK: Gruppen

    private struct TimeGroup { var title: String; var items: [NotificationItem] }

    private var groups: [TimeGroup] {
        let cal = Calendar.current
        let now = Date()
        let weekAgo = cal.date(byAdding: .day, value: -7, to: cal.startOfDay(for: now)) ?? now
        var today: [NotificationItem] = [], week: [NotificationItem] = [], older: [NotificationItem] = []
        for n in items {
            let d = n.updatedAt ?? n.createdAt ?? .distantPast
            if cal.isDateInToday(d) { today.append(n) } else if d >= weekAgo { week.append(n) } else { older.append(n) }
        }
        return [TimeGroup(title: "Heute", items: today), TimeGroup(title: "Diese Woche", items: week), TimeGroup(title: "Früher", items: older)].filter { !$0.items.isEmpty }
    }

    // MARK: Laden & Aktionen

    private func load(reset: Bool) async {
        if !reset && cursor == nil { return }
        let f = filter
        do {
            let page: NotificationPage = try await APIClient.shared.get("/notifications", query: ["filter": f.rawValue, "cursor": reset ? nil : cursor])
            guard f == filter else { return }
            withAnimation(.snappy) {
                if reset { items = page.items } else {
                    let known = Set(items.map(\.id))
                    items += page.items.filter { !known.contains($0.id) }
                }
                cursor = page.nextCursor
                if let u = page.unread { unread = u }
                error = nil
                loaded = true
            }
        } catch is CancellationError {
        } catch {
            self.error = (error as? APIError)?.message ?? error.localizedDescription
            loaded = true
            if !items.isEmpty { app.show(error: error) }
        }
    }

    private func open(_ n: NotificationItem) async {
        Haptics.tap()
        if !n.read { await markRead(n) }
        router.open(href: n.href)
    }

    private func markRead(_ n: NotificationItem) async {
        setRead([n.id])
        do {
            _ = try await APIClient.shared.post("/notifications/read", ["ids": JSONValue.array([.string(n.id)])]) as JSONValue
            await app.refreshCounts()
        } catch { app.show(error: error) }
    }

    private func markAll() async {
        let ok = await app.run("Alles als gelesen markiert.") {
            _ = try await APIClient.shared.post("/notifications/read", ["all": JSONValue.bool(true)]) as JSONValue
        }
        if ok {
            setRead(items.map(\.id))
            withAnimation(.snappy) { unread = [:] }
            await app.refreshCounts()
            await load(reset: true)
        }
    }

    private func setRead(_ ids: [String]) {
        let set = Set(ids)
        withAnimation(.snappy) {
            for i in items.indices where set.contains(items[i].id) && !items[i].read {
                items[i].read = true
                let g = items[i].group ?? ""
                if let n = unread["all"], n > 0 { unread["all"] = n - 1 }
                if let n = unread[g], n > 0 { unread[g] = n - 1 }
            }
        }
    }
}

// MARK: - Zeile

private struct NotificationRow: View {
    var item: NotificationItem
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(alignment: .top, spacing: 14) {
                badge
                VStack(alignment: .leading, spacing: 5) {
                    message
                        .font(.subheadline)
                        .foregroundStyle(item.read ? Color.ink2 : Color.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .multilineTextAlignment(.leading)
                    if let ex = item.excerpt?.nilIfEmpty {
                        Text(ex)
                            .font(.system(.subheadline, design: .serif))
                            .foregroundStyle(Color.muted)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                            .padding(.leading, 10)
                            .overlay(alignment: .leading) { Rectangle().fill(Color.lineStrong).frame(width: 1) }
                    }
                    SpecLabel(meta)
                }
                Spacer(minLength: 0)
                if !item.read {
                    Circle().fill(Color.clay).frame(width: 8, height: 8).padding(.top, 6)
                }
            }
            .padding(.vertical, 12)
            .padding(.horizontal, 8)
            .background(alignment: .leading) {
                if !item.read { Capsule().fill(Color.clay).frame(width: 2).padding(.vertical, 10) }
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityText)
        .accessibilityHint("Öffnen")
    }

    private var message: Text {
        if let lead = item.lead?.nilIfEmpty {
            return Text("\(Text(lead).fontWeight(.semibold).foregroundStyle(Color.ink)) \(item.body ?? item.text)")
        }
        return Text(item.body ?? item.text)
    }

    private var meta: String {
        var s = SocialFmt.time(item.updatedAt ?? item.createdAt)
        let d = item.updatedAt ?? item.createdAt
        if let d, !Calendar.current.isDateInToday(d) { s = "\(Fmt.relative(d)) · \(s)" }
        if let c = item.count, c > 1 { s += " · \(c) Ereignisse" }
        return s
    }

    private var accessibilityText: String {
        var s = [item.lead, item.body ?? item.text].compactMap { $0?.nilIfEmpty }.joined(separator: " ")
        if let ex = item.excerpt?.nilIfEmpty { s += ". \(ex)" }
        s += ". \(Fmt.relative(item.updatedAt ?? item.createdAt))"
        if !item.read { s += ", ungelesen" }
        return s
    }

    @ViewBuilder private var badge: some View {
        let symbol = SocialNotificationIcon.symbol(icon: item.icon, type: item.type)
        if let a = item.actor {
            AvatarView(url: a.avatarUrl, name: a.displayName, size: 40)
                .overlay(alignment: .bottomTrailing) {
                    Image(systemName: symbol)
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(Color.paper)
                        .frame(width: 20, height: 20)
                        .background(SocialNotificationIcon.tint(item.type), in: Circle())
                        .overlay(Circle().strokeBorder(Color.paper, lineWidth: 1.5))
                        .offset(x: 4, y: 4)
                }
                .padding(.trailing, 2)
        } else {
            let system = item.group == "system"
            Image(systemName: symbol)
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(system ? Color.paper : SocialNotificationIcon.tint(item.type))
                .frame(width: 40, height: 40)
                .background(system ? Color.moss : Color.card, in: .rect(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(system ? Color.clear : Color.lineStrong, lineWidth: 0.75))
        }
    }
}

/// Zuordnung der Server-Icons (lucide-Namen) bzw. Typen zu SF Symbols.
enum SocialNotificationIcon {
    static func symbol(icon: String?, type: String) -> String {
        switch icon {
        case "user-plus": return "person.badge.plus"
        case "message-circle": return "bubble.left"
        case "corner-down-right": return "arrowshape.turn.up.left"
        case "at-sign": return "at"
        case "heart": return "heart.fill"
        case "layers": return "square.3.layers.3d"
        case "git-fork": return "arrow.triangle.branch"
        case "pen-line": return "pencil.line"
        case "mail": return "envelope"
        case "shopping-bag": return "bag"
        case "package": return "shippingbox"
        case "shield": return "shield.lefthalf.filled"
        case "users": return "person.3"
        case "book-open": return "book"
        case "key-round": return "key"
        case "bell": return "bell"
        default: break
        }
        switch type {
        case "FOLLOW": return "person.badge.plus"
        case "COMMENT": return "bubble.left"
        case "REPLY": return "arrowshape.turn.up.left"
        case "MENTION": return "at"
        case "LIKE": return "heart.fill"
        case "PROJECT_ACTIVITY": return "square.3.layers.3d"
        case "REMIX": return "arrow.triangle.branch"
        case "NEW_POST_FROM_FOLLOWED": return "pencil.line"
        case "MESSAGE": return "envelope"
        case "ORDER_NEW": return "bag"
        case "ORDER_STATUS": return "shippingbox"
        case "MODERATION": return "shield.lefthalf.filled"
        case "COMMUNITY_INVITE": return "person.3"
        case "TUTORIAL_UPDATED": return "book"
        case "SECURITY": return "key"
        default: return "bell"
        }
    }

    static func tint(_ type: String) -> Color {
        switch type {
        case "LIKE": .clay
        case "FOLLOW", "NEW_POST_FROM_FOLLOWED": .moss
        case "COMMENT", "REPLY", "MENTION", "MESSAGE": .slate
        case "ORDER_NEW", "ORDER_STATUS": .ochre
        case "PROJECT_ACTIVITY", "REMIX", "TUTORIAL_UPDATED": .plum
        case "MODERATION", "SECURITY": .moss
        default: .ink
        }
    }
}
