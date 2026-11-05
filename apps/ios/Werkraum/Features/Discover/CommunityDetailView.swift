import SwiftUI

// MARK: - Community-Seite (PRD §15)

private enum CommunityTab: String, CaseIterable, Identifiable {
    case posts, projects, members, rules
    var id: String { rawValue }
    var label: String {
        switch self {
        case .posts: "Beiträge"
        case .projects: "Projekte"
        case .members: "Mitglieder"
        case .rules: "Regeln"
        }
    }
}

struct CommunityDetailView: View {
    var slug: String

    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router

    @State private var data: CommunityPagePayload?
    @State private var error: String?
    @State private var tab: CommunityTab = .posts
    @State private var feed: [PostItem] = []
    @State private var pinned: [PostItem] = []
    @State private var feedCursor: String?
    @State private var projects: CommunityProjectsPayload?
    @State private var members: [CommunityMemberRow] = []
    @State private var membersCursor: String?
    @State private var membersLoaded = false
    @State private var memberQuery = ""
    @State private var hideTarget: PostItem?
    @State private var hideReason = ""
    @State private var confirmLeave = false

    var body: some View {
        Group {
            if let data {
                content(data)
            } else if let error {
                ErrorStateView(message: error) { await load() }
            } else {
                LoadingView()
            }
        }
        .background(Color.paper)
        .navigationTitle(data?.community.name ?? "Community")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { if let data { toolbar(data) } }
        .task { if data == nil { await load() } }
        .refreshable { await load(); await loadTab(force: true) }
        .reloadWhenSheetCloses { await load(); await loadTab(force: true) }
        .alert("Beitrag ausblenden", isPresented: Binding(get: { hideTarget != nil }, set: { if !$0 { hideTarget = nil } })) {
            TextField("Grund (für das Protokoll)", text: $hideReason)
            Button("Abbrechen", role: .cancel) { hideTarget = nil }
            Button("Ausblenden", role: .destructive) {
                if let p = hideTarget { Task { await moderate(p, "hidden", on: true, reason: hideReason) } }
                hideTarget = nil
            }
        } message: { Text("Der Beitrag ist danach nur noch für die Moderation sichtbar. Die Autor:in wird benachrichtigt.") }
        .confirmationDialog("Community verlassen?", isPresented: $confirmLeave, titleVisibility: .visible) {
            Button("Verlassen", role: .destructive) { Task { await leave() } }
        } message: { Text("Du kannst später wieder beitreten – bei privaten Communities nur mit neuer Einladung.") }
    }

    // MARK: Laden

    private func load() async {
        do {
            let d: CommunityPagePayload = try await APIClient.shared.get("/communities/by-slug/\(slug)")
            withAnimation(.snappy) {
                data = d
                pinned = d.pinned ?? []
                feed = d.feed?.items ?? []
                feedCursor = d.feed?.nextCursor
                error = nil
            }
        } catch is CancellationError {
        } catch {
            if data == nil { self.error = (error as? APIError)?.message ?? error.localizedDescription } else { app.show(error: error) }
        }
    }

    private func loadMorePosts() async {
        guard let id = data?.community.id, let c = feedCursor else { return }
        do {
            let p: Page<PostItem> = try await APIClient.shared.get("/communities/\(id)/posts", query: ["cursor": c])
            feed += p.items.filter { n in !feed.contains { $0.id == n.id } }
            feedCursor = p.nextCursor
        } catch { app.show(error: error) }
    }

    private func loadTab(force: Bool = false) async {
        guard let id = data?.community.id, data?.canView == true else { return }
        switch tab {
        case .projects:
            if projects != nil && !force { return }
            do { projects = try await APIClient.shared.get("/communities/\(id)/projects") } catch { app.show(error: error) }
        case .members:
            if membersLoaded && !force { return }
            await loadMembers(reset: true)
        default: break
        }
    }

    private func loadMembers(reset: Bool) async {
        guard let id = data?.community.id else { return }
        do {
            let q = memberQuery.trimmed.nilIfEmpty
            let p: Page<CommunityMemberRow> = try await APIClient.shared.get("/communities/\(id)/members", query: ["q": q, "cursor": reset ? nil : membersCursor])
            members = reset ? p.items : members + p.items
            membersCursor = p.nextCursor
            membersLoaded = true
        } catch is CancellationError {
        } catch { app.show(error: error) }
    }

    // MARK: Aktionen

    private func join() async {
        guard let c = data?.community else { return }
        var state: String?
        let ok = await app.run {
            let r: CommunityJoinResult = try await APIClient.shared.post("/communities/\(c.id)/join")
            state = r.state
        }
        if ok {
            app.show(state == "PENDING" ? "Anfrage gesendet. Die Moderation entscheidet bald." : "Willkommen in \(c.name)!")
            Haptics.success()
            await load()
        }
    }

    private func leave() async {
        guard let c = data?.community else { return }
        let wasPending = data?.membership?.state == "PENDING"
        let wasInvited = data?.membership?.state == "INVITED"
        if await app.run(wasPending ? "Anfrage zurückgezogen." : wasInvited ? "Einladung abgelehnt." : "Du hast \(c.name) verlassen.", {
            _ = try await APIClient.shared.post("/communities/\(c.id)/leave") as CommunityJoinResult
        }) { await load() }
    }

    private func moderate(_ post: PostItem, _ action: String, on: Bool, reason: String? = nil) async {
        guard let id = data?.community.id else { return }
        let msg: String = switch (action, on) {
        case ("pinned", true): "Beitrag angeheftet."
        case ("pinned", false): "Beitrag gelöst."
        case ("announcement", true): "Als Ankündigung markiert."
        case ("announcement", false): "Ankündigung aufgehoben."
        case ("hidden", true): "Beitrag ausgeblendet."
        default: "Beitrag wiederhergestellt."
        }
        var body: [String: JSONValue] = ["on": .bool(on)]
        if let r = reason?.trimmed.nilIfEmpty { body["reason"] = .string(r) }
        if await app.run(msg, { try await APIClient.shared.action("POST", "/communities/\(id)/posts/\(post.id)/\(action)", body) }) {
            hideReason = ""
            await load()
        }
    }

    // MARK: Toolbar

    @ToolbarContentBuilder private func toolbar(_ d: CommunityPagePayload) -> some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Menu {
                ShareLink(item: AppConfig.webURL("/c/\(d.community.slug)")) { Label("Teilen", systemImage: "square.and.arrow.up") }
                if d.isManager || d.isMod {
                    Button("Verwalten", systemImage: "slider.horizontal.3") { router.open(.communityManage(slug: d.community.slug)) }
                }
                if d.isManager {
                    Button("Einstellungen bearbeiten", systemImage: "pencil") { router.present(.communityEditor(slug: d.community.slug)) }
                }
                if d.isMember && d.membership?.role != "OWNER" {
                    Button("Community verlassen", systemImage: "rectangle.portrait.and.arrow.right", role: .destructive) { confirmLeave = true }
                }
                Divider()
                Button("Community melden …", systemImage: "flag") {
                    router.present(.report(targetType: "COMMUNITY", targetId: d.community.id, title: d.community.name))
                }
            } label: { Image(systemName: "ellipsis") }
            .accessibilityLabel("Weitere Aktionen")
        }
    }

    // MARK: Inhalt

    private func content(_ d: CommunityPagePayload) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header(d)
                if d.canView {
                    if let ch = d.challenge { challengeBanner(ch).padding(.horizontal, Space.gutter) }
                    if d.isMod, let n = d.pendingCount, n > 0 {
                        Button { router.open(.communityManage(slug: d.community.slug)) } label: {
                            HStack(spacing: 10) {
                                Image(systemName: "person.badge.clock").foregroundStyle(Color.warn)
                                Text(Fmt.plural(n, "offene Beitrittsanfrage", "offene Beitrittsanfragen")).font(.subheadline.weight(.semibold)).foregroundStyle(Color.ink)
                                Spacer()
                                Image(systemName: "chevron.right").font(.caption).foregroundStyle(Color.muted)
                            }
                            .padding(12)
                            .background(Color.warn.opacity(0.1), in: .rect(cornerRadius: Radius.inner, style: .continuous))
                        }
                        .buttonStyle(.pressable)
                        .padding(.horizontal, Space.gutter)
                    }
                    Picker("Bereich", selection: $tab) {
                        ForEach(CommunityTab.allCases) { t in Text(tabLabel(t, d)).tag(t) }
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal, Space.gutter)
                    tabContent(d)
                        .padding(.horizontal, Space.gutter)
                } else {
                    lockScreen(d).padding(.horizontal, Space.gutter)
                }
            }
            .padding(.bottom, 100)
        }
        .onChange(of: tab) { Task { await loadTab() } }
        .safeAreaInset(edge: .bottom) { composerBar(d) }
    }

    private func tabLabel(_ t: CommunityTab, _ d: CommunityPagePayload) -> String {
        switch t {
        case .projects: if let n = d.projectCount, n > 0 { return "Projekte \(n)" }
        case .rules: if let n = d.community.rules?.count, n > 0 { return "Regeln \(n)" }
        default: break
        }
        return t.label
    }

    // MARK: Kopf

    private func header(_ d: CommunityPagePayload) -> some View {
        let c = d.community
        let color = CategoryPalette.color(for: c.category)
        return VStack(alignment: .leading, spacing: 14) {
            CoverView(url: c.coverUrl, seed: c.id, category: c.category, animated: true)
                .frame(height: 210)
                .frame(maxWidth: .infinity)
                .clipped()
                .overlay(alignment: .bottomLeading) {
                    HStack(spacing: 6) {
                        Image(systemName: visibilitySymbol(c.visibility))
                        Text(L.communityVisibility.first { $0.key == c.visibility }?.label ?? c.visibility)
                    }
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 10).padding(.vertical, 6)
                    .glassEffect(.regular, in: Capsule())
                    .padding(12)
                }
            VStack(alignment: .leading, spacing: 10) {
                SpecLabel("Community · \(app.categoryName(c.category))", color: color)
                Text(c.name).font(.display(30)).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 14) {
                    StatCell(value: Fmt.number(c.memberCount), label: c.memberCount == 1 ? "Mitglied" : "Mitglieder")
                    if let n = d.projectCount { StatCell(value: Fmt.number(n), label: "Projekte") }
                    if let r = c.region?.nilIfEmpty { StatCell(value: r, label: "Region") }
                }
                if let desc = c.description?.nilIfEmpty {
                    Text(desc).font(.body).foregroundStyle(Color.ink2).fixedSize(horizontal: false, vertical: true)
                }
                if let o = c.owner?.profile, let h = o.handle {
                    Button { router.open(.profile(handle: h)) } label: {
                        HStack(spacing: 8) {
                            AvatarView(url: o.avatarUrl, name: o.displayName ?? h, size: 22)
                            Text("Gegründet von \(o.displayName ?? h)").font(.footnote).foregroundStyle(Color.muted)
                        }
                    }
                    .buttonStyle(.plain)
                }
                membershipButton(d)
            }
            .padding(.horizontal, Space.gutter)
        }
    }

    private func visibilitySymbol(_ v: String) -> String {
        switch v {
        case "PRIVATE": "lock.fill"
        case "REQUEST": "person.badge.clock"
        default: "globe.europe.africa"
        }
    }

    @ViewBuilder private func membershipButton(_ d: CommunityPagePayload) -> some View {
        let state = d.membership?.state
        if !app.isSignedIn {
            EmptyView()
        } else if d.isMember {
            HStack(spacing: 10) {
                Label(L.communityRoles[d.membership?.role ?? "MEMBER"] ?? "Mitglied", systemImage: "checkmark.seal.fill")
                    .font(.subheadline.weight(.semibold)).foregroundStyle(Color.moss)
                    .padding(.horizontal, 12).padding(.vertical, 8)
                    .background(Color.mossSoft, in: Capsule())
                if d.isManager || d.isMod {
                    Button { router.open(.communityManage(slug: d.community.slug)) } label: {
                        Label("Verwalten", systemImage: "slider.horizontal.3").font(.subheadline.weight(.semibold))
                    }
                    .buttonStyle(.glass)
                }
                Spacer()
            }
        } else if state == "PENDING" {
            HStack {
                Label("Anfrage gesendet", systemImage: "hourglass").font(.subheadline.weight(.semibold)).foregroundStyle(Color.warn)
                Spacer()
                AsyncButton("Zurückziehen") { await leave() }.buttonStyle(.glass)
            }
        } else if state == "INVITED" {
            HStack(spacing: 10) {
                AsyncButton { await join() } label: { Text("Einladung annehmen").frame(maxWidth: .infinity) }
                    .buttonStyle(.glassProminent).tint(.moss).controlSize(.large)
                AsyncButton("Ablehnen") { await leave() }.buttonStyle(.glass).controlSize(.large)
            }
        } else if state == "BANNED" {
            NoticeView(tone: .danger, message: "Du kannst dieser Community nicht beitreten.")
        } else if d.community.visibility == "PRIVATE" {
            NoticeView(tone: .info, title: "Nur auf Einladung", message: "Private Communities nehmen neue Mitglieder nur per Einladung auf.")
        } else {
            AsyncButton { await join() } label: {
                Label(d.community.visibility == "REQUEST" ? "Beitritt anfragen" : "Beitreten", systemImage: "person.badge.plus")
            }
            .primaryButton()
        }
    }

    // MARK: Challenge

    private func challengeBanner(_ ch: CommunityChallenge) -> some View {
        let start = ch.startsAt ?? Date()
        let end = ch.endsAt ?? Date()
        let total = max(1, end.timeIntervalSince(start))
        let progress = min(1, max(0, Date().timeIntervalSince(start) / total))
        let running = ch.isRunning
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "flag.checkered").foregroundStyle(Color.clay)
                SpecLabel(running ? "Challenge · läuft bis \(Fmt.date(end))" : "Challenge · ab \(Fmt.date(start))", color: .clay)
            }
            Text(ch.title).font(.titleSerif).foregroundStyle(Color.ink)
            if let d = ch.description?.nilIfEmpty { Text(d).font(.subheadline).foregroundStyle(Color.ink2).fixedSize(horizontal: false, vertical: true) }
            if running {
                GeometryReader { g in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Color.clay.opacity(0.15))
                        Capsule().fill(Color.clay).frame(width: g.size.width * progress)
                    }
                }
                .frame(height: 4)
                .accessibilityLabel("Fortschritt der Challenge")
                .accessibilityValue("\(Int(progress * 100)) Prozent der Zeit vergangen")
                let days = max(0, Int(ceil(end.timeIntervalSinceNow / 86400)))
                Text(days == 1 ? "Noch 1 Tag" : "Noch \(days) Tage").font(.caption).foregroundStyle(Color.muted)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.claySoft.opacity(0.6), in: .rect(cornerRadius: Radius.card, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radius.card, style: .continuous).strokeBorder(Color.clay.opacity(0.25), lineWidth: 0.75))
    }

    // MARK: Gesperrt (privat)

    private func lockScreen(_ d: CommunityPagePayload) -> some View {
        VStack(spacing: 14) {
            ZStack {
                ThreadPlate(seed: d.community.id, category: d.community.category, glyph: "ring", showLabel: false, animated: true)
                    .frame(width: 140, height: 140)
                    .clipShape(Circle())
                Image(systemName: "lock.fill").font(.largeTitle).foregroundStyle(Color.ink)
                    .padding(18)
                    .glassEffect(.regular, in: Circle())
            }
            Text("Diese Community ist geschlossen").font(.titleSerif).multilineTextAlignment(.center)
            Text(d.community.visibility == "REQUEST"
                 ? "Beiträge, Projekte und Mitglieder siehst du, sobald die Moderation deine Anfrage angenommen hat."
                 : "Beiträge, Projekte und Mitglieder sind nur für Mitglieder sichtbar. Neue Mitglieder kommen per Einladung dazu.")
                .font(.subheadline).foregroundStyle(Color.muted).multilineTextAlignment(.center)
            if let rules = d.community.rules, !rules.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    SpecLabel("Regeln")
                    ForEach(Array(rules.enumerated()), id: \.offset) { i, r in
                        Text("\(i + 1). \(r.title)").font(.footnote).foregroundStyle(Color.ink2)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(14)
                .sunkenSurface()
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity)
        .cardSurface()
    }

    // MARK: Tabs

    @ViewBuilder private func tabContent(_ d: CommunityPagePayload) -> some View {
        switch tab {
        case .posts: postsTab(d)
        case .projects: projectsTab(d)
        case .members: membersTab(d)
        case .rules: rulesTab(d)
        }
    }

    @ViewBuilder private func postsTab(_ d: CommunityPagePayload) -> some View {
        LazyVStack(alignment: .leading, spacing: 14) {
            if !pinned.isEmpty {
                SpecLabel("Angeheftet", color: .moss)
                ForEach(pinned) { p in postCell(p, d) }
                if !feed.isEmpty { SpecLabel("Neueste Beiträge").padding(.top, 8) }
            }
            let rest = feed.filter { f in !pinned.contains { $0.id == f.id } }
            ForEach(rest) { p in postCell(p, d) }
            if pinned.isEmpty && rest.isEmpty {
                EmptyStateView(symbol: "text.bubble", title: "Noch keine Beiträge", message: d.isMember ? "Stell dich vor, zeig ein Werkstück oder frag in die Runde." : "Tritt bei, um mitzuschreiben.", actionTitle: d.isMember && d.muted != true ? "Ersten Beitrag schreiben" : nil) {
                    router.present(.composer(communityId: d.community.id))
                }
            }
            LoadMoreTrigger(hasMore: feedCursor != nil) { await loadMorePosts() }
        }
    }

    private func postCell(_ p: PostItem, _ d: CommunityPagePayload) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            PostCardView(post: p, onDelete: { Task { await load() } }, showCommunity: false)
            if d.isMod {
                HStack(spacing: 8) {
                    Image(systemName: "shield.lefthalf.filled").font(.caption).foregroundStyle(Color.muted)
                    modButton(p.isPinned == true ? "Lösen" : "Anheften", p.isPinned == true ? "pin.slash" : "pin") { await moderate(p, "pinned", on: p.isPinned != true) }
                    modButton(p.isAnnouncement == true ? "Keine Ankündigung" : "Ankündigung", "megaphone") { await moderate(p, "announcement", on: p.isAnnouncement != true) }
                    Button { hideTarget = p } label: {
                        Label("Ausblenden", systemImage: "eye.slash").font(.caption.weight(.semibold))
                    }
                    .buttonStyle(.glass).controlSize(.small).tint(.danger)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 4)
            }
        }
    }

    private func modButton(_ title: String, _ symbol: String, action: @escaping () async -> Void) -> some View {
        AsyncButton(action: action) { Label(title, systemImage: symbol).font(.caption.weight(.semibold)) }
            .buttonStyle(.glass)
            .controlSize(.small)
    }

    @ViewBuilder private func projectsTab(_ d: CommunityPagePayload) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            if let projects {
                if d.isMember && !projects.shareable.isEmpty {
                    Menu {
                        ForEach(projects.shareable) { p in
                            Button(p.title) { Task { await share(p, d) } }
                        }
                    } label: {
                        Label("Eigenes Projekt teilen", systemImage: "plus.square.on.square")
                            .font(.subheadline.weight(.semibold))
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.glass)
                    .controlSize(.large)
                }
                if projects.projects.isEmpty {
                    EmptyStateView(symbol: "hammer", title: "Noch keine Projekte", message: "Mitglieder können ihre öffentlichen Projekte hier mit der Community teilen.")
                } else {
                    ForEach(projects.projects) { p in projectRow(p, d) }
                }
            } else {
                LoadingView()
            }
        }
    }

    private func projectRow(_ p: CommunityProjectItem, _ d: CommunityPagePayload) -> some View {
        HStack(spacing: 10) {
            LinkedThreadRow(kicker: [L.projectStatus(p.status), p.owner?.displayName].compactMap { $0?.nilIfEmpty }.joined(separator: " · "), title: p.title, seed: p.id, category: p.category, url: p.coverUrl) {
                router.open(href: p.href)
            }
            if p.ownerId == app.me?.id || d.isMod {
                Menu {
                    Button("Aus Community entfernen", systemImage: "minus.circle", role: .destructive) { Task { await unshare(p, d) } }
                } label: {
                    Image(systemName: "ellipsis").foregroundStyle(Color.muted).frame(width: 36, height: 44)
                }
                .accessibilityLabel("Projektaktionen")
            }
        }
        .padding(12)
        .cardSurface(radius: Radius.inner)
    }

    private func share(_ p: IdTitle, _ d: CommunityPagePayload) async {
        if await app.run("„\(p.title)“ geteilt.", { try await APIClient.shared.action("POST", "/communities/\(d.community.id)/projects", ["projectId": .string(p.id)]) }) {
            await loadTab(force: true)
            await load()
        }
    }

    private func unshare(_ p: CommunityProjectItem, _ d: CommunityPagePayload) async {
        if await app.run("Projekt entfernt.", { _ = try await APIClient.shared.delete("/communities/\(d.community.id)/projects/\(p.id)") as JSONValue }) {
            await loadTab(force: true)
            await load()
        }
    }

    private func membersTab(_ d: CommunityPagePayload) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            DiscoverSearchField(prompt: "Mitglieder suchen", text: $memberQuery)
                .task(id: memberQuery) {
                    guard membersLoaded else { return }
                    try? await Task.sleep(for: .milliseconds(300))
                    guard !Task.isCancelled else { return }
                    await loadMembers(reset: true)
                }
            if !membersLoaded {
                LoadingView()
            } else if members.isEmpty {
                EmptyStateView(symbol: "person.2", title: memberQuery.isEmpty ? "Noch keine Mitglieder" : "Niemand gefunden", message: memberQuery.isEmpty ? nil : "Kein Mitglied passt zu „\(memberQuery)“.")
            } else {
                LazyVStack(spacing: 0) {
                    ForEach(members) { m in
                        CommunityMemberLine(member: m)
                            .padding(.horizontal, 14)
                    }
                    LoadMoreTrigger(hasMore: membersCursor != nil) { await loadMembers(reset: false) }
                }
                .cardSurface()
            }
        }
    }

    private func rulesTab(_ d: CommunityPagePayload) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            if let rules = d.community.rules, !rules.isEmpty {
                ForEach(Array(rules.enumerated()), id: \.offset) { i, r in
                    HStack(alignment: .top, spacing: 14) {
                        Text(String(format: "%02d", i + 1)).font(.specLarge).foregroundStyle(Color.moss)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(r.title).font(.headline).foregroundStyle(Color.ink)
                            if !r.body.isEmpty { Text(r.body).font(.subheadline).foregroundStyle(Color.ink2).fixedSize(horizontal: false, vertical: true) }
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(.vertical, 12)
                    .hairline()
                }
            } else {
                EmptyStateView(symbol: "list.bullet.clipboard", title: "Keine eigenen Regeln", message: "Hier gelten die Grundregeln von WERKRAUM: freundlich, ehrlich, sicher.")
            }
            if d.isManager {
                Button { router.open(.communityManage(slug: d.community.slug)) } label: {
                    Label("Regeln bearbeiten", systemImage: "pencil")
                }
                .buttonStyle(.glass)
            }
        }
    }

    // MARK: Schreib-Leiste

    @ViewBuilder private func composerBar(_ d: CommunityPagePayload) -> some View {
        if d.canView && d.isMember && tab == .posts {
            if d.muted == true {
                NoticeView(tone: .warn, title: "Stummgeschaltet", message: d.membership?.mutedUntil.map { "Du kannst bis \(Fmt.dateTime($0)) nichts schreiben." } ?? "Du kannst gerade nichts schreiben.")
                    .padding(.horizontal, Space.gutter)
                    .padding(.bottom, 8)
                    .background(Color.paper.opacity(0.01))
            } else {
                Button { router.present(.composer(communityId: d.community.id)) } label: {
                    Label("Beitrag schreiben", systemImage: "square.and.pencil")
                        .font(.body.weight(.semibold))
                        .padding(.horizontal, 10)
                }
                .buttonStyle(.glassProminent)
                .tint(.moss)
                .controlSize(.large)
                .padding(.bottom, 8)
            }
        }
    }
}

// MARK: - Mitgliederzeile

struct CommunityMemberLine: View {
    var member: CommunityMemberRow
    var trailing: AnyView? = nil
    @Environment(Router.self) private var router

    var body: some View {
        HStack(spacing: 12) {
            Button { router.open(.profile(handle: member.handle)) } label: {
                HStack(spacing: 12) {
                    AvatarView(url: member.avatarUrl, name: member.displayName, size: 40)
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 6) {
                            Text(member.displayName).font(.subheadline.weight(.semibold)).foregroundStyle(Color.ink).lineLimit(1)
                            if member.isMuted { Image(systemName: "speaker.slash.fill").font(.caption2).foregroundStyle(Color.warn).accessibilityLabel("Stummgeschaltet") }
                        }
                        Text("@\(member.handle)").font(.caption).foregroundStyle(Color.muted).lineLimit(1)
                    }
                }
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            Spacer(minLength: 0)
            if let r = member.role, r != "MEMBER" {
                Pill(text: L.communityRoles[r] ?? r, tint: r == "OWNER" ? .clay : .moss)
            }
            if let trailing { trailing }
        }
        .padding(.vertical, 10)
        .hairline()
    }
}
