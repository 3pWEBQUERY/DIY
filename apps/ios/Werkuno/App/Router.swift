import SwiftUI
import Observation

// MARK: - Navigationsziele

enum StudioSection: String, Hashable, CaseIterable, Identifiable {
    case content, projects, tutorials, articles, products, orders, shop, media, stats, revenue
    var id: String { rawValue }
    var title: String {
        switch self {
        case .content: "Meine Inhalte"
        case .projects: "Projekte"
        case .tutorials: "Anleitungen"
        case .articles: "Blog"
        case .products: "Produkte"
        case .orders: "Bestellungen"
        case .shop: "Shop"
        case .media: "Medienbibliothek"
        case .stats: "Statistiken"
        case .revenue: "Einnahmen"
        }
    }
    var symbol: String {
        switch self {
        case .content: "square.stack.3d.up"
        case .projects: "hammer"
        case .tutorials: "list.number"
        case .articles: "text.book.closed"
        case .products: "tag"
        case .orders: "shippingbox"
        case .shop: "storefront"
        case .media: "photo.on.rectangle"
        case .stats: "chart.bar.xaxis"
        case .revenue: "banknote"
        }
    }
}

enum SettingsSection: String, Hashable, CaseIterable, Identifiable {
    case profile, account, security, notifications, feed, privacy, support, developer
    var id: String { rawValue }
    var title: String {
        switch self {
        case .profile: "Profil"
        case .account: "Konto"
        case .security: "Sicherheit"
        case .notifications: "Benachrichtigungen"
        case .feed: "Feed & Interessen"
        case .privacy: "Privatsphäre"
        case .support: "Hilfe & Support"
        case .developer: "Server & Entwicklung"
        }
    }
    var symbol: String {
        switch self {
        case .profile: "person.crop.circle"
        case .account: "key"
        case .security: "lock.shield"
        case .notifications: "bell.badge"
        case .feed: "sparkles.rectangle.stack"
        case .privacy: "hand.raised"
        case .support: "questionmark.bubble"
        case .developer: "server.rack"
        }
    }
}

enum Route: Hashable {
    case post(id: String)
    case profile(handle: String)
    case follows(handle: String, following: Bool)
    case project(handle: String, slug: String)
    case projectList(category: String?, sort: String?)
    case tutorial(slug: String)
    case tutorialList(category: String?)
    case product(shopSlug: String, productSlug: String)
    case shop(slug: String)
    case cart
    case checkout
    case orders
    case order(id: String)
    case communities
    case community(slug: String)
    case communityManage(slug: String)
    case blogHome
    case article(handle: String, slug: String)
    case userBlog(handle: String)
    case conversations
    /// Posteingang mit bestimmtem Ordner (`/nachrichten?ordner=anfragen|archiv`)
    case conversationsBox(String)
    case conversation(id: String)
    case notifications
    case saved
    case collection(id: String)
    case shoppingLists
    case shoppingList(id: String)
    case sharedShoppingList(token: String)
    case materials
    case studio
    case studioSection(StudioSection)
    case creatorPro
    case sellerOrder(id: String)
    case settings
    case settingsSection(SettingsSection)
    case appeal(caseId: String)
    case moderation
    case moderationCase(id: String)
    case adminUser(id: String)
    case search(query: String)
    case category(slug: String)
    case web(path: String)
    /// Materialseite `/materialien/:slug` (Preisvergleich, Bestand)
    case material(slug: String)
    /// „Mein Bestand“ `/materialien/bestand`
    case materialStock
    /// Eigene Entwürfe & geplante Beiträge (Web: Studio → Inhalte → Beiträge/Entwürfe)
    case postDrafts
    /// Wettbewerbe (`/wettbewerbe`, optional auf eine Community gefiltert)
    case competitions(communitySlug: String? = nil)
    case competition(id: String)
    /// Events (`/events`) und Event-Detail (`/c/:slug/events/:id`)
    case events
    case event(id: String)

    /// Web-Pfade (Benachrichtigungen, geteilte Links, Server-`href`) → native Ziele.
    static func from(href: String) -> Route? {
        guard let comps = URLComponents(string: href) else { return nil }
        let path = comps.path
        let q = Dictionary((comps.queryItems ?? []).map { ($0.name, $0.value ?? "") }, uniquingKeysWith: { a, _ in a })
        let s = path.split(separator: "/").map { String($0).removingPercentEncoding ?? String($0) }
        switch s.count {
        case 0: return nil
        case 1:
            switch s[0] {
            case "projekte": return .projectList(category: q["kategorie"], sort: q["sort"])
            case "anleitungen": return .tutorialList(category: q["kategorie"])
            case "warenkorb": return .cart
            case "kasse": return .checkout
            case "bestellungen": return .orders
            case "communities": return .communities
            case "blogs": return .blogHome
            case "nachrichten":
                switch q["ordner"] {
                case "anfragen": return .conversationsBox("requests")
                case "archiv": return .conversationsBox("archived")
                default: return .conversations
                }
            case "benachrichtigungen": return .notifications
            case "gespeichert": return .saved
            case "einkaufslisten": return .shoppingLists
            case "materialien": return .materials
            case "studio": return .studio
            case "einstellungen": return .settings
            case "admin": return .moderation
            case "suche": return .search(query: q["q"] ?? "")
            case "entdecken": return q["kategorie"].map { .category(slug: $0) }
            case "wettbewerbe": return .competitions(communitySlug: q["community"])
            case "events": return .events
            default: return .web(path: href)
            }
        default:
            switch (s[0], s.count) {
            case ("beitrag", _): return .post(id: s[1])
            case ("u", 2): return .profile(handle: s[1])
            case ("u", 3) where s[2] == "blog": return .userBlog(handle: s[1])
            case ("u", 3) where s[2] == "folgt": return .follows(handle: s[1], following: true)
            case ("u", 3): return .project(handle: s[1], slug: s[2])
            case ("u", 4) where s[2] == "blog": return .article(handle: s[1], slug: s[3])
            case ("u", 4): return .project(handle: s[1], slug: s[2])
            case ("anleitungen", _): return .tutorial(slug: s[1])
            case ("markt", 2): return .shop(slug: s[1])
            case ("markt", _): return .product(shopSlug: s[1], productSlug: s[2])
            case ("bestellungen", _): return .order(id: s[1])
            case ("kasse", _): return q["bestellung"].map { .order(id: $0) } ?? .orders
            case ("c", 3) where s[2] == "verwalten": return .communityManage(slug: s[1])
            case ("c", 4) where s[2] == "wettbewerbe": return .competition(id: s[3])
            case ("c", 3) where s[2] == "wettbewerbe": return .competitions(communitySlug: s[1])
            case ("c", 4) where s[2] == "events" && s[3] != "neu": return .event(id: s[3])
            case ("c", 5) where s[2] == "events": return .event(id: s[3])
            case ("c", _): return .community(slug: s[1])
            case ("nachrichten", _) where s[1] == "gruppe": return .conversations
            case ("nachrichten", _) where s[1] != "neu": return .conversation(id: s[1])
            case ("sammlungen", _): return .collection(id: s[1])
            case ("einkaufslisten", _): return .shoppingList(id: s[1])
            case ("liste", _): return .sharedShoppingList(token: s[1])
            case ("materialien", 2) where s[1] == "bestand": return .materialStock
            case ("materialien", 2): return .material(slug: s[1])
            case ("einspruch", _): return .appeal(caseId: s[1])
            case ("studio", 3) where s[1] == "bestellungen": return .sellerOrder(id: s[2])
            case ("studio", 2) where s[1] == "pro": return .creatorPro
            case ("studio", _):
                let map: [String: StudioSection] = ["inhalte": .content, "projekte": .projects, "anleitungen": .tutorials, "blog": .articles, "produkte": .products, "bestellungen": .orders, "shop": .shop, "medien": .media, "statistiken": .stats, "einnahmen": .revenue]
                return map[s[1]].map { .studioSection($0) } ?? .studio
            case ("einstellungen", _):
                let map: [String: SettingsSection] = ["profil": .profile, "konto": .account, "sicherheit": .security, "benachrichtigungen": .notifications, "feed": .feed, "privatsphaere": .privacy, "hilfe-support": .support]
                return map[s[1]].map { .settingsSection($0) } ?? .settings
            case ("admin", 3) where s[1] == "moderation": return .moderationCase(id: s[2])
            case ("admin", 3) where s[1] == "nutzer": return .adminUser(id: s[2])
            case ("admin", _): return .moderation
            default: return .web(path: href)
            }
        }
    }
}

// MARK: - Sheets (modale Editoren)

enum SheetRoute: Identifiable, Hashable {
    case composer(projectId: String? = nil, communityId: String? = nil)
    case editPost(id: String)
    case createMenu
    case projectEditor(handle: String? = nil, slug: String? = nil, remixOf: String? = nil)
    case journalEntry(projectId: String, projectTitle: String)
    case tutorialEditor(id: String? = nil, seedProjectId: String? = nil)
    case articleEditor(id: String? = nil)
    case productEditor(id: String? = nil)
    case communityEditor(slug: String? = nil)
    case newConversation(handle: String? = nil, orderId: String? = nil, productId: String? = nil)
    case report(targetType: String, targetId: String, title: String? = nil)
    case shopWizard
    case collectionPicker(type: String, id: String)
    case shoppingListPicker(kind: String, id: String, title: String)
    case web(url: URL)
    /// Koautor:innen eines Beitrags verwalten (Autor:in) bzw. Koautorenschaft (eingeladene Person)
    case coauthors(postId: String, asCoauthor: Bool = false)

    var id: String { String(describing: self) }
}

// MARK: - Router

enum AppTab: Hashable { case workbench, discover, market, me, search }

@MainActor
@Observable
final class Router {
    var tab: AppTab = .workbench
    var workbench = NavigationPath()
    var discover = NavigationPath()
    var market = NavigationPath()
    var me = NavigationPath()
    var search = NavigationPath()
    var sheet: SheetRoute?
    /// Gemeinsamer Suchtext des Such-Tabs
    var searchText = ""
    /// Anzahl sichtbarer Detailseiten mit eigener Aktionsleiste (blendet die Werkbank-Leiste aus)
    var immersiveCount = 0

    func path(for tab: AppTab) -> Binding<NavigationPath> {
        Binding(
            get: { [unowned self] in
                switch tab {
                case .workbench: workbench
                case .discover: discover
                case .market: market
                case .me: me
                case .search: search
                }
            },
            set: { [unowned self] v in
                switch tab {
                case .workbench: workbench = v
                case .discover: discover = v
                case .market: market = v
                case .me: me = v
                case .search: search = v
                }
            }
        )
    }

    func open(_ route: Route) {
        if case .web(let p) = route {
            sheet = .web(url: AppConfig.webURL(p))
            return
        }
        switch tab {
        case .workbench: workbench.append(route)
        case .discover: discover.append(route)
        case .market: market.append(route)
        case .me: me.append(route)
        case .search: search.append(route)
        }
    }

    func open(href: String?) {
        guard let href, let r = Route.from(href: href) else { return }
        open(r)
    }

    func present(_ s: SheetRoute) { sheet = s }

    func popToRoot() {
        switch tab {
        case .workbench: workbench = NavigationPath()
        case .discover: discover = NavigationPath()
        case .market: market = NavigationPath()
        case .me: me = NavigationPath()
        case .search: search = NavigationPath()
        }
    }

    /// Deep Link `werkuno://pfad` oder `https://…/pfad`
    func handle(url: URL) {
        var path = url.path
        if url.scheme == "werkuno" { path = "/" + (url.host ?? "") + url.path }
        if let q = url.query { path += "?" + q }
        open(href: path)
    }
}
