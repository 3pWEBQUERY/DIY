import SwiftUI

private enum MeProfileTab: String, Hashable { case posts, projects, tutorials, shop, blog, collections, about, reviews }

/// `GET /users/:handle` einmal laden, zweimal lesen: Profil (`MeProfilePage`) + Bewertungen/Auszeichnungen.
private struct MeProfileResponse: Decodable {
    var page: MeProfilePage
    var extras: SocialProfileExtras
    init(from decoder: Decoder) throws {
        page = try MeProfilePage(from: decoder)
        extras = try SocialProfileExtras(from: decoder)
    }
}

/// Creator-Profil (PRD §12)
struct ProfileView: View {
    var handle: String
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @Environment(\.dismiss) private var dismiss

    @State private var page: MeProfilePage?
    @State private var extras: SocialProfileExtras?
    @State private var error: String?
    @State private var tab: MeProfileTab = .posts
    @State private var posts: [PostItem] = []
    @State private var cursor: String?
    @State private var bioExpanded = false
    @State private var unblocked = false
    @State private var unmuted = false

    var body: some View {
        MePhase(value: page, error: error, retry: load) { p in
            if let prof = p.profile, let viewer = p.viewer {
                content(p, prof, viewer)
            } else {
                EmptyStateView(symbol: "person.crop.circle.badge.questionmark", title: "Profil wird weitergeleitet …")
            }
        }
        .background(Color.paper)
        .navigationTitle(page?.profile?.displayName ?? "Profil")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { toolbar }
        .task { if page == nil { await load() } }
        .refreshable { await load() }
    }

    // MARK: Laden

    private func load() async {
        do {
            let r: MeProfileResponse = try await APIClient.shared.get("/users/\(handle.lowercased())")
            let p = r.page
            if let r = p.redirect {
                dismiss()
                try? await Task.sleep(for: .milliseconds(350))
                router.open(.profile(handle: r))
                return
            }
            let first = page == nil
            page = p
            extras = r.extras
            posts = p.posts ?? []
            cursor = p.postsCursor
            error = nil
            if first {
                tab = !(p.projects ?? []).isEmpty ? .projects : .posts
                if p.viewer?.isSelf == false, let id = p.profile?.userId { SocialAPI.track("USER", id) }
            }
        } catch {
            if page == nil { self.error = MeErr.text(error) } else { app.show(error: error) }
        }
    }

    private func loadMorePosts() async {
        guard let c = cursor else { return }
        do {
            let next: Page<PostItem> = try await APIClient.shared.get("/users/\(handle.lowercased())/posts", query: ["cursor": c])
            let known = Set(posts.map(\.id))
            posts += next.items.filter { !known.contains($0.id) }
            cursor = next.nextCursor
        } catch { cursor = nil; app.show(error: error) }
    }

    // MARK: Toolbar

    @ToolbarContentBuilder private var toolbar: some ToolbarContent {
        if let prof = page?.profile, let viewer = page?.viewer {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    ShareLink(item: MeLinks.profile(prof.handle)) { Label("Profil teilen", systemImage: "square.and.arrow.up") }
                    if viewer.isSelf {
                        Button("Profil bearbeiten", systemImage: "pencil") { router.open(.settingsSection(.profile)) }
                        Button("Werkuno Studio", systemImage: "chart.bar.xaxis") { router.open(.studio) }
                        Button("Entwürfe & geplante Beiträge", systemImage: "doc.text") { router.open(.postDrafts) }
                    } else {
                        Button("Nachricht schreiben", systemImage: "bubble.left") { router.present(.newConversation(handle: prof.handle)) }
                        Divider()
                        if viewer.muted && !unmuted {
                            Button("Stummschaltung aufheben", systemImage: "speaker.wave.2") { Task { await unmute(prof) } }
                        }
                        SafetyMenuItems(targetType: "USER", targetId: prof.userId, authorId: prof.userId, authorName: prof.displayName, allowHide: false)
                    }
                } label: {
                    Image(systemName: "ellipsis")
                }
                .accessibilityLabel("Weitere Aktionen")
            }
        }
    }

    private func unmute(_ prof: MeProfilePage.Profile) async {
        if await app.run("Stummschaltung aufgehoben.", { try await SocialAPI.mute(prof.userId, false) }) { unmuted = true; await load() }
    }

    // MARK: Inhalt

    private func content(_ p: MeProfilePage, _ prof: MeProfilePage.Profile, _ viewer: MeProfilePage.Viewer) -> some View {
        let blocked = viewer.blocked && !unblocked
        return ScrollView {
            LazyVStack(alignment: .leading, spacing: 0, pinnedViews: [.sectionHeaders]) {
                hero(prof, viewer)
                if blocked {
                    blockedNotice(prof)
                } else {
                    Section {
                        tabContent(p, prof)
                            .padding(.horizontal, Space.gutter)
                            .padding(.top, 14)
                            .padding(.bottom, 40)
                    } header: {
                        MeTabSwitcher(items: tabs(p, prof), selection: $tab)
                    }
                }
            }
        }
        .scrollIndicators(.hidden)
    }

    private func tabs(_ p: MeProfilePage, _ prof: MeProfilePage.Profile) -> [(value: MeProfileTab, label: String, count: Int?)] {
        var t: [(value: MeProfileTab, label: String, count: Int?)] = [(.posts, "Beiträge", prof.postCount)]
        t.append((.projects, "Projekte", (p.projects ?? []).count))
        if !(p.tutorials ?? []).isEmpty { t.append((.tutorials, "Anleitungen", p.tutorials?.count)) }
        if !(p.products ?? []).isEmpty { t.append((.shop, "Shop", p.products?.count)) }
        if let r = extras?.reviews, r.show == true { t.append((.reviews, "Bewertungen", hasActiveShop(prof) ? r.received : r.given)) }
        if (p.articleCount ?? 0) > 0 { t.append((.blog, "Blog", p.articleCount)) }
        if !(p.collections ?? []).isEmpty { t.append((.collections, "Sammlungen", p.collections?.count)) }
        t.append((.about, "Über mich", nil))
        return t
    }

    // MARK: Kopf

    private func hero(_ prof: MeProfilePage.Profile, _ viewer: MeProfilePage.Viewer) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            CoverView(url: prof.coverUrl, seed: prof.userId, category: prof.categories?.first, showLabel: false)
                .frame(height: 170)
                .frame(maxWidth: .infinity)
                .clipped()
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .bottom) {
                    AvatarView(url: prof.avatarUrl, name: prof.displayName, size: 88, category: prof.categories?.first)
                        .padding(4)
                        .background(Color.paper, in: Circle())
                        .offset(y: -44)
                        .padding(.bottom, -44)
                    Spacer()
                    actions(prof, viewer).padding(.top, 10)
                }
                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(prof.displayName).font(.display(28)).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
                        if prof.isCreatorPro == true {
                            Image(systemName: "checkmark.seal.fill").foregroundStyle(Color.moss).accessibilityLabel("Creator Pro")
                        }
                    }
                    HStack(spacing: 6) {
                        Text("@\(prof.handle)").foregroundStyle(Color.muted)
                        if let pr = prof.pronouns?.nilIfEmpty { Text("· \(pr)").foregroundStyle(Color.muted) }
                        if viewer.followsYou { MeStatePill(text: "folgt dir", tone: .neutral) }
                        if prof.isCreatorPro == true { MeStatePill(text: "Creator Pro", tone: .moss) }
                    }
                    .font(.wr(.subheadline))
                }
                if let bio = prof.bio?.nilIfEmpty {
                    Text(bio)
                        .font(.wr(.body)).foregroundStyle(Color.ink2)
                        .lineLimit(bioExpanded ? nil : 4)
                        .fixedSize(horizontal: false, vertical: true)
                        .onTapGesture { withAnimation(.snappy) { bioExpanded.toggle() } }
                }
                metaLine(prof)
                if let cats = prof.categories, !cats.isEmpty {
                    FlowLayout(spacing: 6) {
                        ForEach(cats, id: \.self) { c in
                            Button { router.open(.category(slug: c)) } label: {
                                Pill(text: app.categoryShort(c), symbol: CategoryPalette.symbol(for: app.category(c)?.glyph), tint: CategoryPalette.color(for: c))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                counts(prof)
                SocialAwardsList(awards: extras?.awards ?? [])
                if let shop = prof.shop, shop.status == "ACTIVE" {
                    LinkedThreadRow(kicker: "Shop", title: [shop.name, shop.tagline?.nilIfEmpty].compactMap { $0 }.joined(separator: " – "), seed: shop.slug, category: prof.categories?.first, url: nil) {
                        router.open(.shop(slug: shop.slug))
                    }
                    .padding(.top, 2)
                }
            }
            .padding(.horizontal, Space.gutter)
            .padding(.bottom, 10)
        }
    }

    @ViewBuilder private func metaLine(_ prof: MeProfilePage.Profile) -> some View {
        let place = [prof.region?.nilIfEmpty, prof.country.map { L.country($0) }?.nilIfEmpty].compactMap { $0 }.joined(separator: ", ")
        let web = prof.website?.nilIfEmpty
        if !place.isEmpty || web != nil {
            HStack(spacing: 14) {
                if !place.isEmpty { Label(place, systemImage: "mappin.and.ellipse").lineLimit(1) }
                if let web, let url = URL(string: web) {
                    Link(destination: url) {
                        Label(web.replacingOccurrences(of: "https://", with: "").replacingOccurrences(of: "http://", with: ""), systemImage: "link").lineLimit(1)
                    }
                    .foregroundStyle(Color.moss)
                }
            }
            .font(.wr(.footnote))
            .foregroundStyle(Color.muted)
            .labelStyle(.compact)
        }
    }

    private func counts(_ prof: MeProfilePage.Profile) -> some View {
        HStack(spacing: 0) {
            countButton(prof.followerCount, "Follower") { router.open(.follows(handle: prof.handle, following: false)) }
            countButton(prof.followingCount, "Folgt") { router.open(.follows(handle: prof.handle, following: true)) }
            countButton(prof.projectCount, "Projekte") { withAnimation(.snappy) { tab = .projects } }
            countButton(prof.postCount, "Beiträge") { withAnimation(.snappy) { tab = .posts } }
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 14)
        .sunkenSurface()
    }

    private func countButton(_ n: Int?, _ label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            StatCell(value: Fmt.number(n), label: label).frame(maxWidth: .infinity, alignment: .leading).contentShape(.rect)
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder private func actions(_ prof: MeProfilePage.Profile, _ viewer: MeProfilePage.Viewer) -> some View {
        GlassEffectContainer(spacing: 8) {
            HStack(spacing: 8) {
                if viewer.isSelf {
                    Button { router.open(.settingsSection(.profile)) } label: {
                        Label("Profil bearbeiten", systemImage: "pencil").font(.wr(.subheadline, .semibold))
                    }
                    .buttonStyle(.glass)
                } else if !(viewer.blocked && !unblocked) {
                    FollowButton(userId: prof.userId, following: viewer.following)
                    Button { router.present(.newConversation(handle: prof.handle)) } label: {
                        Image(systemName: "bubble.left").font(.wr(.subheadline, .semibold)).frame(minWidth: 22, minHeight: 22)
                    }
                    .buttonStyle(.glass)
                    .accessibilityLabel("Nachricht schreiben")
                }
                ShareLink(item: MeLinks.profile(prof.handle)) {
                    Image(systemName: "square.and.arrow.up").font(.wr(.subheadline, .semibold)).frame(minWidth: 22, minHeight: 22)
                }
                .buttonStyle(.glass)
                .accessibilityLabel("Profil teilen")
            }
        }
    }

    private func blockedNotice(_ prof: MeProfilePage.Profile) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            NoticeView(tone: .warn, title: "Blockiert",
                       message: "Zwischen dir und \(prof.displayName) besteht eine Blockierung. Inhalte werden nicht angezeigt, und ihr könnt euch keine Nachrichten senden.")
            AsyncButton {
                if await app.run("Blockierung aufgehoben.", { try await SocialAPI.block(prof.userId, false) }) {
                    unblocked = true
                    await load()
                }
            } label: {
                Text("Blockierung aufheben").font(.wr(.subheadline, .semibold))
            }
            .buttonStyle(.glass)
            Text("Hast du nicht selbst blockiert, bleibt die Sperre bestehen.").font(.wr(.caption)).foregroundStyle(Color.muted)
        }
        .padding(Space.gutter)
    }

    // MARK: Tabs

    @ViewBuilder private func tabContent(_ p: MeProfilePage, _ prof: MeProfilePage.Profile) -> some View {
        switch tab {
        case .posts:
            if posts.isEmpty {
                EmptyStateView(symbol: "text.bubble", title: "Noch keine Beiträge", message: p.viewer?.isSelf == true ? "Teile, woran du gerade arbeitest." : nil,
                               actionTitle: p.viewer?.isSelf == true ? "Beitrag schreiben" : nil) { router.present(.composer()) }
            } else {
                LazyVStack(spacing: 12) {
                    ForEach(posts) { post in
                        PostCardView(post: post, onDelete: { withAnimation { posts.removeAll { $0.id == post.id } } })
                    }
                    LoadMoreTrigger(hasMore: cursor != nil) { await loadMorePosts() }
                }
            }
        case .projects:
            let items = p.projects ?? []
            if items.isEmpty {
                EmptyStateView(symbol: "hammer", title: "Noch keine Projekte", message: p.viewer?.isSelf == true ? "Lege dein erstes Projekt an und dokumentiere den Weg." : nil,
                               actionTitle: p.viewer?.isSelf == true ? "Projekt anlegen" : nil) { router.present(.projectEditor()) }
            } else {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 14) {
                    ForEach(items) { ProjectCardView(project: $0, style: .tile) }
                }
            }
        case .tutorials:
            LazyVStack(spacing: 12) {
                ForEach(p.tutorials ?? []) { TutorialCardView(tutorial: $0) }
            }
        case .shop:
            VStack(alignment: .leading, spacing: 14) {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 14) {
                    ForEach(p.products ?? []) { ProductCardView(product: $0) }
                }
                if let shop = prof.shop {
                    Button { router.open(.shop(slug: shop.slug)) } label: { Label("Zum Shop \(shop.name)", systemImage: "storefront") }
                        .primaryButton()
                }
            }
        case .blog:
            VStack(alignment: .leading, spacing: 12) {
                SectionHeader("Blog", subtitle: Fmt.plural(p.articleCount ?? 0, "veröffentlichter Artikel", "veröffentlichte Artikel"))
                Text("Längere Texte von \(prof.displayName) – Werkstattberichte, Techniken, Hintergründe.").font(.wr(.subheadline)).foregroundStyle(Color.muted)
                Button { router.open(.userBlog(handle: prof.handle)) } label: { Label("Blog öffnen", systemImage: "text.book.closed") }
                    .primaryButton()
            }
            .padding(16)
            .cardSurface()
        case .collections:
            LazyVStack(spacing: 10) {
                ForEach(p.collections ?? []) { c in
                    Button { router.open(.collection(id: c.id)) } label: {
                        HStack(spacing: 12) {
                            ThreadPlate(seed: c.id, category: prof.categories?.first, showLabel: false)
                                .frame(width: 56, height: 56)
                                .clipShape(.rect(cornerRadius: Radius.small, style: .continuous))
                            VStack(alignment: .leading, spacing: 3) {
                                Text(c.title).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink)
                                if let d = c.description?.nilIfEmpty { Text(d).font(.wr(.caption)).foregroundStyle(Color.muted).lineLimit(2) }
                                Text([Fmt.plural(c.itemCount ?? 0, "Eintrag", "Einträge"), L.visibility(c.visibility)].joined(separator: " · ")).font(.wr(.caption2)).foregroundStyle(Color.muted)
                            }
                            Spacer(minLength: 0)
                            Image(systemName: "chevron.right").font(.wr(.caption)).foregroundStyle(Color.lineStrong)
                        }
                        .padding(12)
                        .cardSurface()
                    }
                    .buttonStyle(.pressable)
                }
            }
        case .about:
            about(prof)
        case .reviews:
            if let r = extras?.reviews {
                SocialProfileReviews(handle: prof.handle, shopName: prof.shop?.name, hasShop: hasActiveShop(prof), counts: r, isSelf: p.viewer?.isSelf == true)
            }
        }
    }

    private func hasActiveShop(_ prof: MeProfilePage.Profile) -> Bool { prof.shop?.status == "ACTIVE" }

    private func about(_ prof: MeProfilePage.Profile) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            if let bio = prof.bio?.nilIfEmpty {
                Text(bio).font(.wr(.body)).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true).textSelection(.enabled)
            }
            VStack(spacing: 0) {
                if let pr = prof.pronouns?.nilIfEmpty { SpecRow(label: "Pronomen", value: pr, symbol: "person") }
                if let r = prof.region?.nilIfEmpty { SpecRow(label: "Region", value: r, symbol: "mappin") }
                if let c = prof.country?.nilIfEmpty { SpecRow(label: "Land", value: L.country(c), symbol: "globe.europe.africa") }
                if let since = prof.memberSince { SpecRow(label: "Mitglied seit", value: Fmt.date(since, style: .long), symbol: "calendar") }
                if let role = prof.role, role != "MEMBER" { SpecRow(label: "Rolle", value: L.roles[role] ?? role, symbol: "checkmark.shield") }
                if let shop = prof.shop { SpecRow(label: "Shop", value: "\(shop.name) · \(L.shopStatus[shop.status] ?? shop.status)", symbol: "storefront") }
            }
            let links = (prof.links ?? []).filter { ($0.url ?? "").nilIfEmpty != nil }
            if prof.website?.nilIfEmpty != nil || !links.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    SpecLabel("Website & Links")
                    if let w = prof.website?.nilIfEmpty, let url = URL(string: w) { linkRow("Website", url) }
                    ForEach(Array(links.enumerated()), id: \.offset) { _, l in
                        if let u = l.url, let url = URL(string: u) { linkRow(l.label?.nilIfEmpty ?? u, url) }
                    }
                }
            }
            if let cats = prof.categories, !cats.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    SpecLabel("Arbeitet in")
                    FlowLayout(spacing: 6) {
                        ForEach(cats, id: \.self) { Pill(text: app.categoryName($0), tint: CategoryPalette.color(for: $0)) }
                    }
                }
            }
        }
    }

    private func linkRow(_ label: String, _ url: URL) -> some View {
        Link(destination: url) {
            HStack {
                Image(systemName: "link").foregroundStyle(Color.moss)
                VStack(alignment: .leading, spacing: 1) {
                    Text(label).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink)
                    Text(url.host() ?? url.absoluteString).font(.wr(.caption)).foregroundStyle(Color.muted)
                }
                Spacer()
                Image(systemName: "arrow.up.right").font(.wr(.caption)).foregroundStyle(Color.muted)
            }
            .padding(12)
            .sunkenSurface()
        }
    }
}

// MARK: - Follower / Folgt

struct FollowListView: View {
    var handle: String
    var following: Bool
    @Environment(Router.self) private var router
    @Environment(AppState.self) private var app
    @State private var items: [MeFollowUser]?
    @State private var cursor: String?
    @State private var error: String?

    private var path: String { "/users/\(handle.lowercased())/\(following ? "following" : "followers")" }

    var body: some View {
        MePhase(value: items, error: error, retry: { await load(reset: true) }) { list in
            if list.isEmpty {
                EmptyStateView(symbol: "person.2", title: following ? "Folgt noch niemandem" : "Noch keine Follower",
                               message: following ? "Sobald @\(handle) anderen folgt, erscheinen sie hier." : "Wer @\(handle) folgt, erscheint hier.")
            } else {
                List {
                    ForEach(list) { u in row(u).listRowBackground(Color.paper) }
                    LoadMoreTrigger(hasMore: cursor != nil) { await load(reset: false) }
                        .listRowBackground(Color.paper)
                        .listRowSeparator(.hidden)
                }
                .listStyle(.plain)
                .meFormStyle()
            }
        }
        .background(Color.paper)
        .navigationTitle(following ? "Folgt" : "Follower")
        .navigationBarTitleDisplayMode(.inline)
        .task { if items == nil { await load(reset: true) } }
        .refreshable { await load(reset: true) }
    }

    private func row(_ u: MeFollowUser) -> some View {
        HStack(spacing: 12) {
            Button { router.open(.profile(handle: u.handle)) } label: {
                HStack(spacing: 12) {
                    AvatarView(url: u.avatarUrl, name: u.displayName, size: 44)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(u.displayName).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink)
                        Text("@\(u.handle)").font(.wr(.caption)).foregroundStyle(Color.muted)
                        if let b = u.bio?.nilIfEmpty { Text(b).font(.wr(.caption)).foregroundStyle(Color.ink2).lineLimit(2) }
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            if u.isSelf != true {
                FollowButton(userId: u.userId, following: u.following ?? false, compact: true)
            }
        }
        .padding(.vertical, 4)
    }

    private func load(reset: Bool) async {
        do {
            let page: Page<MeFollowUser> = try await APIClient.shared.get(path, query: ["cursor": reset ? nil : cursor])
            if reset { items = page.items } else { items = (items ?? []) + page.items }
            cursor = page.nextCursor
            error = nil
        } catch {
            if items == nil { self.error = MeErr.text(error) } else { cursor = nil; app.show(error: error) }
        }
    }
}
