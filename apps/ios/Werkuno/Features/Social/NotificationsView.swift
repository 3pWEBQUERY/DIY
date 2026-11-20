import SwiftUI

/// Posteingang der Benachrichtigungen mit Filtern, Gruppen nach Zeit und „Alle als gelesen“.
struct NotificationsView: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router

    @State private var filter: SocialNotificationFilter = .all
    @State private var items: [NotificationItem] = []
    @State private var cursor: String?
    /// Nachladen der nächsten Seite fehlgeschlagen → Knopf „Erneut versuchen“
    @State private var moreFailed = false
    @State private var unread: [String: Int] = [:]
    @State private var loaded = false
    @State private var error: String?
    /// Offene Koautor:innen-Einladungen (`GET /me/coauthor-invites`)
    @State private var invites: [SocialCoauthorInvite] = []
    @State private var confirmDeleteAll = false

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

            if !invites.isEmpty, filter == .all || filter == .mentions {
                Section {
                    ForEach(invites) { inv in
                        SocialCoauthorInviteCard(invite: inv, showExcerpt: true) { _ in
                            withAnimation(.snappy) { invites.removeAll { $0.id == inv.id } }
                        }
                        .contentShape(.rect)
                        .onTapGesture { router.open(.post(id: inv.postId)) }
                        .listRowInsets(EdgeInsets(top: 6, leading: Space.gutter, bottom: 6, trailing: Space.gutter))
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                    }
                } header: { Group {
                    HStack(spacing: 10) {
                        SpecLabel("Einladungen", color: .ink)
                        Rectangle().fill(Color.line).frame(height: 0.75)
                    }
                    .padding(.top, 8)
                    .accessibilityAddTraits(.isHeader)
                }.font(.wr(.footnote, .semibold)) }
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
                                // Nach links wischen → „Löschen“ (ganz durchwischen löscht sofort)
                                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                    Button(role: .destructive) { Task { await delete(n) } } label: { Label("Löschen", systemImage: "trash") }
                                }
                        }
                    } header: { Group {
                        HStack(spacing: 10) {
                            SpecLabel(g.title, color: .ink)
                            Rectangle().fill(Color.line).frame(height: 0.75)
                        }
                        .padding(.top, 8)
                        .accessibilityAddTraits(.isHeader)
                    }.font(.wr(.footnote, .semibold)) }
                }
                LoadMoreTrigger(hasMore: cursor != nil, failed: moreFailed) { await load(reset: false) }
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
            if !items.isEmpty {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        if items.contains(where: \.read) {
                            Button("Gelesene löschen", systemImage: "trash") { Task { await deleteAll(scope: "read") } }
                        }
                        Button("Alle löschen", systemImage: "trash", role: .destructive) { confirmDeleteAll = true }
                    } label: { Image(systemName: "trash") }
                        .accessibilityLabel("Benachrichtigungen löschen")
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button { router.open(.settingsSection(.notifications)) } label: { Image(systemName: "gearshape") }
                    .accessibilityLabel("Benachrichtigungen einstellen")
            }
        }
        .confirmationDialog("Alle Benachrichtigungen löschen?", isPresented: $confirmDeleteAll, titleVisibility: .visible) {
            Button("Alle löschen", role: .destructive) { Task { await deleteAll(scope: "all") } }
            Button("Abbrechen", role: .cancel) {}
        } message: {
            Text("Auch ungelesene werden entfernt. Das lässt sich nicht rückgängig machen.")
        }
        .task(id: filter) { await load(reset: true) }
        .task { await loadInvites() }
        // Live: neue/gebündelte Benachrichtigungen erscheinen sofort (Server-Sent Events)
        .onReceive(NotificationCenter.default.publisher(for: LiveEvent.notification)) { n in
            guard let e = LiveEvent(n), e == .counts, loaded else { return }
            // Nur die erste Seite holen und einmischen – geladene ältere Seiten und Scrollposition bleiben
            Task { await refreshHead() }
        }
        .refreshable {
            await loadInvites()
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
            moreFailed = false
        } catch is CancellationError {
        } catch {
            guard f == filter else { return }
            if !reset { moreFailed = true }
            self.error = (error as? APIError)?.message ?? error.localizedDescription
            loaded = true
            if !items.isEmpty { app.show(error: error) }
        }
    }

    /// Erste Seite neu laden und mit der Liste zusammenführen: neue/aktualisierte Einträge oben,
    /// bereits nachgeladene ältere Einträge bleiben erhalten (der Cursor zeigt weiter auf deren Ende).
    private func refreshHead() async {
        let f = filter
        guard let page: NotificationPage = try? await APIClient.shared.get("/notifications", query: ["filter": f.rawValue]),
              f == filter else { return }
        let fresh = Set(page.items.map(\.id))
        withAnimation(.snappy) {
            let wasEmpty = items.isEmpty
            items = page.items + items.filter { !fresh.contains($0.id) }
            if wasEmpty { cursor = page.nextCursor }
            if let u = page.unread { unread = u }
        }
    }

    private func loadInvites() async {
        guard app.me != nil, let list = try? await APIClient.shared.get("/me/coauthor-invites") as [SocialCoauthorInvite] else { return }
        withAnimation(.snappy) { invites = list }
    }

    /// Koautor:innen-Benachrichtigungen (`data.kind == coauthor_invite / coauthor_accepted`) führen über `href` zum Beitrag.
    private func open(_ n: NotificationItem) async {
        Haptics.tap()
        // Sofort navigieren; „gelesen“ läuft im Hintergrund
        router.open(href: n.href)
        if !n.read { Task { await markRead(n) } }
    }

    private func markRead(_ n: NotificationItem) async {
        setRead([n.id])
        app.markNotificationsRead(1) // Badge sofort, ohne auf den Server zu warten
        do {
            _ = try await APIClient.shared.post("/notifications/read", ["ids": JSONValue.array([.string(n.id)])]) as JSONValue
            await app.refreshCounts()
        } catch {
            // Optimistische Markierung zurücknehmen und Badge vom Server holen
            withAnimation(.snappy) {
                if let i = items.firstIndex(where: { $0.id == n.id }), items[i].read {
                    items[i].read = false
                    let g = items[i].group ?? ""
                    unread["all", default: 0] += 1
                    if !g.isEmpty { unread[g, default: 0] += 1 }
                }
            }
            await app.refreshCounts()
            app.show(error: error)
        }
    }

    private func markAll() async {
        app.markNotificationsRead() // optimistisch auf 0
        let ok = await app.run("Alles als gelesen markiert.") {
            _ = try await APIClient.shared.post("/notifications/read", ["all": JSONValue.bool(true)]) as JSONValue
        }
        if ok {
            setRead(items.map(\.id))
            withAnimation(.snappy) { unread = [:] }
            await load(reset: true)
        }
        await app.refreshCounts()
    }

    /// Einzelne Benachrichtigung löschen – sofort aus der Liste, bei Fehler wieder einfügen.
    private func delete(_ n: NotificationItem) async {
        guard let index = items.firstIndex(where: { $0.id == n.id }) else { return }
        Haptics.tap()
        withAnimation(.snappy) {
            items.remove(at: index)
            if !n.read {
                if let c = unread["all"], c > 0 { unread["all"] = c - 1 }
                if let g = n.group, let c = unread[g], c > 0 { unread[g] = c - 1 }
            }
        }
        if !n.read { app.markNotificationsRead(1) }
        do {
            _ = try await APIClient.shared.delete("/notifications/\(n.id)") as JSONValue
        } catch {
            withAnimation(.snappy) {
                if !items.contains(where: { $0.id == n.id }) { items.insert(n, at: min(index, items.count)) }
            }
            app.show(error: error)
        }
        await app.refreshCounts()
    }

    /// „Gelesene löschen“ (`read`) oder „Alle löschen“ (`all`).
    private func deleteAll(scope: String) async {
        let ok = await app.run(scope == "all" ? "Alle Benachrichtigungen gelöscht." : "Gelesene Benachrichtigungen gelöscht.") {
            _ = try await APIClient.shared.post("/notifications/delete", ["scope": JSONValue.string(scope)]) as JSONValue
        }
        if ok {
            withAnimation(.snappy) {
                if scope == "all" { items = []; unread = [:] } else { items.removeAll(where: \.read) }
            }
            if scope == "all" { app.markNotificationsRead() }
            await load(reset: true)
        }
        await app.refreshCounts()
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
                        .font(.wr(.subheadline))
                        .foregroundStyle(item.read ? Color.ink2 : Color.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .multilineTextAlignment(.leading)
                    if let ex = item.excerpt?.nilIfEmpty {
                        Text(ex)
                            .font(.wr(.subheadline))
                            .foregroundStyle(Color.muted)
                            .a11yLineLimit(2)
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
            .padding(.leading, 14)
            .padding(.trailing, 10)
            .background {
                // Wie im Web: links gerade mit Akzentleiste, rechts gerundet
                if !item.read {
                    Self.cardShape.fill(Color.card)
                        .overlay(alignment: .leading) { Rectangle().fill(Color.clay).frame(width: 3) }
                        .clipShape(Self.cardShape)
                }
            }
            .contentShape(Self.cardShape)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityText)
        .accessibilityHint("Öffnen")
    }

    static let cardShape = UnevenRoundedRectangle(topLeadingRadius: 0, bottomLeadingRadius: 0, bottomTrailingRadius: 18, topTrailingRadius: 18, style: .continuous)

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
                        .font(.wr(size: 9, weight: .bold))
                        .foregroundStyle(Color.paper)
                        .frame(width: 20, height: 20)
                        .background(Color.moss, in: Circle())
                        .overlay(Circle().strokeBorder(Color.paper, lineWidth: 2))
                        .offset(x: 4, y: 4)
                }
                .padding(.trailing, 2)
        } else {
            let system = item.group == "system"
            Image(systemName: symbol)
                .font(.wr(size: 16, weight: .medium))
                .foregroundStyle(system ? Color.paper : SocialNotificationIcon.tint(item.type))
                .frame(width: 40, height: 40)
                .background(system ? Color.moss : Color.paper, in: Circle())
                .overlay(Circle().strokeBorder(system ? Color.clear : Color.lineStrong, lineWidth: 0.75))
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
        case "refresh-cw": return "arrow.triangle.2.circlepath"
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
        case "RESTOCK": return "arrow.triangle.2.circlepath"
        default: return "bell"
        }
    }

    static func tint(_ type: String) -> Color {
        switch type {
        case "LIKE": .clay
        case "FOLLOW", "NEW_POST_FROM_FOLLOWED": .moss
        case "COMMENT", "REPLY", "MENTION", "MESSAGE": .slate
        case "ORDER_NEW", "ORDER_STATUS", "RESTOCK": .ochre
        case "PROJECT_ACTIVITY", "REMIX", "TUTORIAL_UPDATED": .plum
        case "MODERATION", "SECURITY": .moss
        default: .ink
        }
    }
}
