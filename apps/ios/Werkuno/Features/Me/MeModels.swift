import Foundation
import SwiftUI

// Modelle des Bereichs „Ich“ (Profile, Gespeichertes, Einkaufslisten, Studio, Einstellungen, Moderation).
// Abgeleitet aus fixtures/*.json und den Services in werkraum-web/apps/web/src/server/**.
// Alles, was der Server weglassen oder null senden kann, ist optional.

// MARK: - Gemeinsame Kleinteile

struct MeHandleRef: Codable, Hashable, Sendable {
    var handle: String?
    var displayName: String?
    var avatarUrl: String?
    var followerCount: Int?
    var projectCount: Int?
    var postCount: Int?
}

struct MeUserRef: Codable, Hashable, Sendable {
    var id: String?
    var status: String?
    var role: String?
    var suspendedUntil: Date?
    var messagingRestrictedUntil: Date?
    var createdAt: Date?
    var profile: MeHandleRef?
    var handle: String? { profile?.handle }
    var name: String { profile?.displayName ?? profile?.handle.map { "@\($0)" } ?? "Unbekannt" }
}

struct MeLabelValue: Codable, Hashable, Sendable { var label: String; var value: String }

// MARK: - Profil (§12)

struct MeProfileLink: Codable, Hashable, Sendable {
    var label: String?
    var url: String?
}

struct MeProfilePage: Decodable, Sendable {
    struct Profile: Decodable, Sendable {
        struct Shop: Decodable, Sendable, Hashable { var slug: String; var name: String; var status: String; var tagline: String? }
        var userId: String
        var handle: String
        var displayName: String
        var bio: String?
        var avatarUrl: String?
        var coverUrl: String?
        var region: String?
        var country: String?
        var website: String?
        var pronouns: String?
        var links: [MeProfileLink]?
        var categories: [String]?
        var followerCount: Int?
        var followingCount: Int?
        var projectCount: Int?
        var postCount: Int?
        var isCreatorPro: Bool?
        var memberSince: Date?
        var role: String?
        var shop: Shop?
    }
    struct Viewer: Decodable, Sendable {
        var isSelf: Bool
        var following: Bool
        var muted: Bool
        var blocked: Bool
        var followsYou: Bool
    }
    struct CollectionRef: Decodable, Sendable, Identifiable, Hashable {
        var id: String
        var title: String
        var description: String?
        var visibility: String?
        var itemCount: Int?
    }
    var redirect: String?
    var profile: Profile?
    var viewer: Viewer?
    var projects: [ProjectCard]?
    var tutorials: [TutorialCard]?
    var posts: [PostItem]?
    var postsCursor: String?
    var products: [ProductCard]?
    var collections: [CollectionRef]?
    var articleCount: Int?
}

struct MeFollowUser: Decodable, Sendable, Identifiable, Hashable {
    var userId: String
    var handle: String
    var displayName: String
    var avatarUrl: String?
    var bio: String?
    var following: Bool?
    var isSelf: Bool?
    var id: String { userId }
}

// MARK: - Gespeichert & Sammlungen (§10.7)

struct MeProductMini: Decodable, Sendable, Identifiable, Hashable {
    var id: String
    var title: String
    var priceMinor: Int?
    var currency: String?
    var coverUrl: String?
    var href: String?
    var shopName: String?
    var soldOut: Bool?
}

struct MeArticleMini: Decodable, Sendable, Identifiable, Hashable {
    var id: String
    var title: String
    var dek: String?
    var coverUrl: String?
    var href: String?
    var authorName: String?
    var readingMinutes: Int?
}

/// `{ type, items }` – je nach Typ unterschiedliche Karten.
struct MeSavedSection: Decodable, Sendable {
    var type: String
    var posts: [PostItem] = []
    var projects: [ProjectCard] = []
    var tutorials: [TutorialCard] = []
    var products: [MeProductMini] = []
    var articles: [MeArticleMini] = []

    enum CodingKeys: String, CodingKey { case type, items }

    init(type: String) { self.type = type }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        type = try c.decode(String.self, forKey: .type)
        switch type {
        case "POST": posts = try c.decodeIfPresent([PostItem].self, forKey: .items) ?? []
        case "PROJECT": projects = try c.decodeIfPresent([ProjectCard].self, forKey: .items) ?? []
        case "TUTORIAL": tutorials = try c.decodeIfPresent([TutorialCard].self, forKey: .items) ?? []
        case "PRODUCT": products = try c.decodeIfPresent([MeProductMini].self, forKey: .items) ?? []
        case "ARTICLE": articles = try c.decodeIfPresent([MeArticleMini].self, forKey: .items) ?? []
        default: break
        }
    }

    var count: Int { posts.count + projects.count + tutorials.count + products.count + articles.count }

    mutating func append(_ other: MeSavedSection) {
        posts += other.posts; projects += other.projects; tutorials += other.tutorials
        products += other.products; articles += other.articles
    }

    mutating func remove(id: String) {
        posts.removeAll { $0.id == id }; projects.removeAll { $0.id == id }; tutorials.removeAll { $0.id == id }
        products.removeAll { $0.id == id }; articles.removeAll { $0.id == id }
    }

    var ids: [String] { posts.map(\.id) + projects.map(\.id) + tutorials.map(\.id) + products.map(\.id) + articles.map(\.id) }
}

struct MeSavedPage: Decodable, Sendable {
    struct Meta: Decodable, Sendable, Hashable { var collectionId: String?; var savedAt: Date? }
    var counts: [String: Int]
    var content: MeSavedSection
    var meta: [String: Meta]
    var hasMore: Bool
    var page: Int
    var unavailable: Int?
}

struct MeCollectionSummary: Decodable, Sendable, Identifiable, Hashable {
    var id: String
    var title: String
    var slug: String?
    var description: String?
    var visibility: String?
    var updatedAt: Date?
    var count: Int?
}

struct MeCollectionPage: Decodable, Sendable {
    var id: String
    var title: String
    var description: String?
    var visibility: String?
    var updatedAt: Date?
    var owner: UserMini?
    var isOwner: Bool?
    var total: Int?
    var sections: [MeSavedSection]
}

struct MeCreated: Decodable, Sendable { var id: String; var title: String? }

// MARK: - Einkaufslisten (§17.4)

struct MeShoppingListSummary: Decodable, Sendable, Identifiable, Hashable {
    var id: String
    var title: String
    var shared: Bool?
    var updatedAt: Date?
    var total: Int?
    var done: Int?
    var sources: [String]?
}

struct MeShoppingItem: Decodable, Sendable, Identifiable, Hashable {
    var id: String
    var name: String
    var quantity: String?
    var haveIt: Bool
    var purchased: Bool
    var sourceType: String?
    var sourceTitle: String?
    var category: String?
    var materialSlug: String?
    var materialId: String?
    var isDone: Bool { haveIt || purchased }
}

struct MeShoppingListDetail: Decodable, Sendable {
    struct Owner: Decodable, Sendable { var handle: String?; var displayName: String? }
    var id: String
    var title: String
    var shareToken: String?
    var updatedAt: Date?
    var owner: Owner?
    var items: [MeShoppingItem]
}

struct MeMaterialHit: Decodable, Sendable, Identifiable, Hashable {
    var id: String
    var name: String
    var unit: String?
    var type: String?
    var brand: String?
    var category: String?
}

struct MeAddSourceResult: Decodable, Sendable { var listId: String; var added: Int?; var merged: Int?; var alreadyHave: Int? }
struct MeShareResult: Decodable, Sendable { var shareToken: String? }
struct MeMergeResult: Decodable, Sendable { var added: Int?; var merged: Int? }
struct MeCountResult: Decodable, Sendable { var count: Int?; var removed: Int?; var revoked: Int? }

// MARK: - Werkuno Studio (§20)

struct MeCurPrev: Decodable, Sendable { var cur: Int; var prev: Int }

struct MeStudioOverviewResponse: Decodable, Sendable {
    var overview: MeStudioOverview
    var heat: MeStudioHeat
}

struct MeStudioHeat: Decodable, Sendable {
    struct Day: Decodable, Sendable { var date: String; var n: Int }
    var days: [Day]
    var today: String?
    var total: Int?
    var activeDays: Int?
}

struct MeStudioOverview: Decodable, Sendable {
    struct Interactions: Decodable, Sendable { var likes: Int; var comments: Int; var saves: Int; var total: Int }
    struct InteractionPair: Decodable, Sendable { var cur: Interactions; var prev: Interactions }
    struct Followers: Decodable, Sendable { var total: Int; var gainedSeries: [Int]?; var weeks: [String]? }
    struct Shop: Decodable, Sendable { var id: String?; var name: String?; var status: String?; var currency: String? }
    struct Revenue: Decodable, Sendable {
        var gross: Int
        var grossPrev: Int
        var fees: Int?
        var orders: Int?
        var allTime: Int?
        var currency: String?
        var series: [Int]?
    }
    var periodDays: Int?
    var profileViews: MeCurPrev
    var projectViews: MeCurPrev
    var tutorialViews: MeCurPrev
    var interactions: InteractionPair
    var followers: Followers
    var meaningful: Int?
    var shop: Shop?
    var revenue: Revenue?
}

struct MeStudioContentRow: Decodable, Sendable, Identifiable, Hashable {
    var type: String
    var id: String
    var title: String
    var state: String
    var stateLabel: String?
    var updatedAt: Date?
    var href: String?
    var manageHref: String?
    var meta: String?
}

struct MeStudioContent: Decodable, Sendable {
    var rows: [MeStudioContentRow]
    var hasShop: Bool?
}

struct MeCountBox: Decodable, Sendable, Hashable {
    var updates: Int?
    var followers: Int?
    var progress: Int?
    var orderItems: Int?
}

struct MeStudioProject: Decodable, Sendable, Identifiable, Hashable {
    var id: String
    var slug: String
    var title: String
    var status: String
    var visibility: String?
    var state: String?
    var category: String?
    var coverUrl: String?
    var viewCount: Int?
    var likeCount: Int?
    var saveCount: Int?
    var remixCount: Int?
    var commentCount: Int?
    var updatedAt: Date?
    var _count: MeCountBox?
}

struct MeStudioTutorial: Decodable, Sendable, Identifiable, Hashable {
    struct Version: Decodable, Sendable, Hashable { var version: Int?; var publishedAt: Date? }
    var id: String
    var slug: String
    var title: String
    var state: String
    var category: String?
    var viewCount: Int?
    var completionCount: Int?
    var saveCount: Int?
    var likeCount: Int?
    var updatedAt: Date?
    var publishedAt: Date?
    var currentVersion: Version?
    var _count: MeCountBox?
    var hasUnpublishedChanges: Bool?
}

struct MeStudioArticle: Decodable, Sendable, Identifiable, Hashable {
    struct Cat: Decodable, Sendable, Hashable { var name: String? }
    var id: String
    var slug: String
    var title: String
    var dek: String?
    var state: String
    var coverUrl: String?
    var viewCount: Int?
    var likeCount: Int?
    var readingMinutes: Int?
    var publishedAt: Date?
    var updatedAt: Date?
    var category: Cat?
    var commentCount: Int?
}

struct MeStudioMediaItem: Decodable, Sendable, Identifiable, Hashable {
    var id: String
    var kind: String
    var state: String?
    var mime: String?
    var bytes: Int?
    var width: Int?
    var height: Int?
    var preview: String?
    var isPrivate: Bool?
    var alt: String?
    var createdAt: Date?
    var attached: Bool?
    var usedIn: [String]?
}

struct MeStudioMedia: Decodable, Sendable {
    var items: [MeStudioMediaItem]
    var totalBytes: Int?
    var count: Int?
}

struct MeStatRow: Decodable, Sendable, Identifiable, Hashable {
    var id: String
    var title: String?
    var body: String?
    var viewCount: Int?
    var likeCount: Int?
    var saveCount: Int?
    var commentCount: Int?
    var remixCount: Int?
    var completionCount: Int?
    var repostCount: Int?
    var ratingCount: Int?
    var publishedAt: Date?
    var _count: MeCountBox?

    var label: String {
        if let t = title?.nilIfEmpty { return t }
        let b = (body ?? "").trimmed
        return b.isEmpty ? "Ohne Titel" : String(b.prefix(70))
    }
}

struct MeStudioStats: Decodable, Sendable {
    var projects: [MeStatRow]?
    var tutorials: [MeStatRow]?
    var articles: [MeStatRow]?
    var posts: [MeStatRow]?
    var products: [MeStatRow]?
    var weeks: [String]?
}

// MARK: - Einstellungen (§23)

struct MeSettingsProfile: Decodable, Sendable {
    var userId: String?
    var handle: String
    var displayName: String
    var bio: String?
    var avatarUrl: String?
    var coverUrl: String?
    var region: String?
    var country: String?
    var website: String?
    var links: [MeProfileLink]?
    var categories: [String]?
    var pronouns: String?
    var isCreatorPro: Bool?
    var followerCount: Int?
    var followingCount: Int?
    var postCount: Int?
    var projectCount: Int?
    var dmPolicy: String?
}

struct MeHandleCheck: Decodable, Sendable { var ok: Bool; var reason: String?; var handle: String? }

struct MeAccountOverview: Decodable, Sendable {
    var email: String
    var emailVerifiedAt: Date?
    var hasPassword: Bool
    var createdAt: Date?
    var providers: [String]?
    var hasShop: Bool?
    var orderCount: Int?
}

struct MeSecurityInfo: Decodable, Sendable {
    struct Session: Decodable, Sendable, Identifiable, Hashable {
        var key: String
        var device: String
        var isApp: Bool?
        /// Browser aus dem User-Agent (safari, chrome, firefox, edge, opera, brave, vivaldi, duckduckgo, app)
        var browser: String?
        var lastUsedAt: Date?
        var createdAt: Date?
        var expiresAt: Date?
        var current: Bool?
        var id: String { key }
    }
    struct Event: Decodable, Sendable, Identifiable, Hashable {
        var id: String
        var data: JSONValue?
        var createdAt: Date?
        var readAt: Date?
        /// Gleiche Formulierung wie im Web (`notificationText` für SECURITY)
        var text: String {
            if let m = data?["message"]?.string?.nilIfEmpty { return m }
            if let d = data?["device"]?.string?.nilIfEmpty { return "Neue Anmeldung bei deinem Konto: \(d)." }
            return "Sicherheitsrelevante Änderung an deinem Konto."
        }
    }
    var sessions: [Session]
    var events: [Event]
}

struct MeNotificationSettings: Decodable, Sendable {
    struct Row: Decodable, Sendable, Hashable { var type: String; var inApp: Bool; var email: Bool; var locked: Bool? }
    var matrix: [Row]
    var emailDigest: String
}

struct MeRelationEntry: Decodable, Sendable, Identifiable, Hashable {
    struct Person: Decodable, Sendable, Hashable { var id: String; var profile: MeHandleRef? }
    var createdAt: Date?
    var muted: Person?
    var blocked: Person?
    var person: Person? { muted ?? blocked }
    var id: String { person?.id ?? "" }
}

struct MeFeedSettings: Decodable, Sendable {
    var interests: [String]
    var hiddenCategories: [String]
    var feedDefault: String
    var muted: [MeRelationEntry]?
    var hiddenCount: Int?
}

struct MePrivacySettings: Decodable, Sendable {
    var dmPolicy: String
    var reduceMotion: Bool
    /// Lesebestätigungen in Einzelchats (ältere Server: fehlt)
    var readReceipts: Bool?
    /// Online-Status zeigen (ältere Server: fehlt)
    var showOnline: Bool?
    var blocked: [MeRelationEntry]?
}

struct MeSupportTicket: Decodable, Sendable, Identifiable, Hashable {
    var id: String
    var subject: String
    var topic: String?
    var status: String?
    var createdAt: Date?
}

struct MeTicketCreated: Decodable, Sendable { var id: String; var ref: String? }

// MARK: - Einspruch (§24.1 Nr. 8)

struct MeAppealContext: Decodable, Sendable {
    struct Decision: Decodable, Sendable { var action: String; var publicNote: String?; var until: Date?; var createdAt: Date? }
    struct Appeal: Decodable, Sendable { var id: String; var status: String; var statement: String?; var decision: String?; var createdAt: Date?; var decidedAt: Date? }
    var id: String
    var number: Int
    var status: String
    var targetType: String?
    var reasonLabel: String?
    var title: String?
    var decision: Decision?
    var deadline: Date?
    var appeal: Appeal?
    var canAppeal: Bool
}

// MARK: - Moderation & Administration (§24)

struct MeAdminDashboard: Decodable, Sendable {
    struct Activity: Decodable, Sendable { var wau: Int?; var mau: Int?; var users: Int?; var newUsers7: Int?; var stickiness: Double?; var meaningfulCreators7: Int?; var seriesUsers: [Int]? }
    struct Projects: Decodable, Sendable { var published: Int?; var new7: Int?; var newPrev7: Int?; var completed: Int?; var completed7: Int?; var shareWithMaterials: Double?; var shareWithTutorial: Double?; var remixRate: Double?; var commentsPerProject: Double? }
    struct Community: Decodable, Sendable { var posts7: Int?; var postsPrev7: Int? }
    struct Moderation: Decodable, Sendable { var openCases: Int?; var appealsOpen: Int?; var medianHandlingSeconds: Double?; var resolved30: Int? }
    struct Market: Decodable, Sendable { var activeSellers: Int?; var pendingSellers: Int?; var activeProducts: Int?; var orders30: Int?; var refundRate: Double? }
    struct Money: Decodable, Sendable { var gmv30: Int?; var gmvPrev30: Int?; var commission30: Int?; var aov: Int? }
    struct KPIs: Decodable, Sendable {
        var activity: Activity?
        var projects: Projects?
        var community: Community?
        var moderation: Moderation?
        var market: Market?
        var money: Money?
    }
    struct Counts: Decodable, Sendable { var cases: Int?; var appeals: Int?; var shops: Int?; var tickets: Int?; var disputes: Int? }
    var kpis: KPIs
    var counts: Counts?
    var role: String?
}

struct MeModAction: Decodable, Sendable, Identifiable, Hashable {
    var id: String?
    var action: String
    var reason: String?
    var publicNote: String?
    var until: Date?
    var createdAt: Date?
    var moderatorId: String?
    var moderator: MeUserRef?
    var stableId: String { id ?? "\(action)-\(createdAt?.timeIntervalSince1970 ?? 0)" }
}

struct MeModReport: Decodable, Sendable, Identifiable, Hashable {
    struct CaseRef: Decodable, Sendable, Hashable { var id: String; var number: Int?; var status: String?; var riskScore: Int? }
    var id: String
    var reporterId: String?
    var targetType: String?
    var targetId: String?
    var reason: String
    var details: String?
    var caseId: String?
    var createdAt: Date?
    var reporter: MeUserRef?
    var `case`: CaseRef?
}

struct MeModAppealRef: Decodable, Sendable, Identifiable, Hashable {
    var id: String
    var statement: String?
    var status: String
    var decision: String?
    var createdAt: Date?
    var decidedAt: Date?
}

struct MeModCase: Decodable, Sendable, Identifiable, Hashable {
    struct Counter: Decodable, Sendable, Hashable { var reports: Int?; var appeals: Int? }
    var id: String
    var number: Int
    var targetType: String
    var targetId: String?
    var subjectUserId: String?
    var status: String
    var riskScore: Int?
    var primaryReason: String
    var reportCount: Int?
    var assigneeId: String?
    var snapshot: JSONValue?
    var resolvedAt: Date?
    var createdAt: Date?
    var assignee: MeUserRef?
    var subjectUser: MeUserRef?
    var reports: [MeModReport]?
    var actions: [MeModAction]?
    var appeals: [MeModAppealRef]?
    var _count: Counter?

    var title: String? { snapshot?["title"]?.string?.nilIfEmpty }
    var href: String? { snapshot?["href"]?.string?.nilIfEmpty }
}

struct MeModQueue: Decodable, Sendable {
    var rows: [MeModCase]
    var total: Int
    var byStatus: [String: Int]?
    var page: Int
    var pages: Int
}

struct MeModPreview: Decodable, Sendable {
    var exists: Bool
    var title: String?
    var href: String?
    var state: String?
    var body: String?
    var imageUrl: String?
    var meta: [MeLabelValue]?
    var ownerId: String?
}

struct MeModCaseDetail: Decodable, Sendable {
    var `case`: MeModCase
    var preview: MeModPreview?
    var history: [MeModCase]?
    var reporterStats: [String: Int]?
}

struct MeModAppeal: Decodable, Sendable, Identifiable, Hashable {
    struct CaseRef: Decodable, Sendable, Hashable {
        var id: String
        var number: Int?
        var targetType: String?
        var primaryReason: String?
        var snapshot: JSONValue?
        var actions: [MeModAction]?
        var title: String? { snapshot?["title"]?.string?.nilIfEmpty }
    }
    var id: String
    var caseId: String?
    var userId: String?
    var statement: String
    var status: String
    var decision: String?
    var createdAt: Date?
    var decidedAt: Date?
    var user: MeUserRef?
    var `case`: CaseRef?
}

struct MeModReports: Decodable, Sendable {
    var rows: [MeModReport]
    var total: Int
    var page: Int
    var pages: Int
    var byReason: [String: Int]?
}

struct MeAdminUserRow: Decodable, Sendable, Identifiable, Hashable {
    struct ShopRef: Decodable, Sendable, Hashable { var status: String? }
    struct Counter: Decodable, Sendable, Hashable { var moderationSubject: Int? }
    var id: String
    var email: String?
    var role: String
    var status: String
    var emailVerifiedAt: Date?
    var lastSeenAt: Date?
    var createdAt: Date?
    var profile: MeHandleRef?
    var shop: ShopRef?
    var _count: Counter?
}

struct MeAdminUsers: Decodable, Sendable {
    var rows: [MeAdminUserRow]
    var total: Int
    var page: Int
    var pages: Int
}

struct MeAdminUserDetail: Decodable, Sendable {
    struct User: Decodable, Sendable {
        struct Profile: Decodable, Sendable {
            var handle: String?
            var displayName: String?
            var bio: String?
            var avatarUrl: String?
            var region: String?
            var country: String?
            var categories: [String]?
            var followerCount: Int?
            var followingCount: Int?
            var postCount: Int?
            var projectCount: Int?
            var dmPolicy: String?
        }
        struct ShopRef: Decodable, Sendable { var slug: String?; var name: String?; var status: String? }
        var id: String
        var email: String?
        var role: String
        var status: String
        var suspendedUntil: Date?
        var messagingRestrictedUntil: Date?
        var emailVerifiedAt: Date?
        var adultConfirmedAt: Date?
        var onboardedAt: Date?
        var lastSeenAt: Date?
        var createdAt: Date?
        var deletedAt: Date?
        var profile: Profile?
        var shop: ShopRef?
        var authAccounts: [JSONValue]?
    }
    struct Counts: Decodable, Sendable { var sessions: Int?; var posts: Int?; var projects: Int?; var tutorials: Int?; var articles: Int?; var comments: Int?; var products: Int?; var reportsFiled: Int? }
    struct Audit: Decodable, Sendable, Hashable { var seq: JSONValue?; var action: String; var createdAt: Date?; var actor: MeUserRef? }
    var user: User
    var counts: Counts?
    var recentAudit: [Audit]?
    var history: [MeModCase]?
}

// MARK: - Bezeichnungen des Bereichs

enum MeLabels {
    static func caseStatus(_ s: String) -> String {
        ["OPEN": "Offen", "IN_REVIEW": "In Prüfung", "RESOLVED": "Entschieden", "APPEALED": "Einspruch", "CLOSED": "Abgeschlossen"][s] ?? s
    }
    static func appealStatus(_ s: String) -> String {
        ["OPEN": "Offen", "UPHELD": "Bestätigt", "OVERTURNED": "Aufgehoben"][s] ?? s
    }
    static func accountStatus(_ s: String) -> String {
        ["ACTIVE": "Aktiv", "SUSPENDED": "Gesperrt", "BANNED": "Dauerhaft gesperrt", "DELETED": "Gelöscht"][s] ?? s
    }
    static func targetType(_ s: String?) -> String {
        guard let s else { return "" }
        return ["POST": "Beitrag", "COMMENT": "Kommentar", "PROJECT": "Projekt", "TUTORIAL": "Anleitung", "TUTORIAL_STEP": "Anleitungsschritt", "PRODUCT": "Produkt",
                "USER": "Profil", "MESSAGE": "Nachricht", "ARTICLE": "Artikel", "COMMUNITY": "Community", "REVIEW": "Bewertung"][s] ?? s
    }
    static func reason(_ s: String?) -> String {
        guard let s else { return "" }
        return L.reportReasons.first { $0.key == s }?.label ?? s
    }
    static func action(_ s: String?) -> String {
        guard let s else { return "" }
        return L.moderationActions.first { $0.key == s }?.label ?? s
    }
    static func articleState(_ s: String) -> String {
        ["DRAFT": "Entwurf", "PUBLISHED": "Veröffentlicht", "SCHEDULED": "Geplant", "HIDDEN": "Ausgeblendet", "REMOVED": "Entfernt"][s] ?? s
    }
    static func tutorialState(_ s: String) -> String {
        ["DRAFT": "Entwurf", "PUBLISHED": "Veröffentlicht", "HIDDEN": "Ausgeblendet", "REMOVED": "Entfernt"][s] ?? s
    }
    static func contentType(_ s: String) -> (label: String, symbol: String) {
        switch s {
        case "post": ("Beitrag", "text.bubble")
        case "project": ("Projekt", "hammer")
        case "tutorial": ("Anleitung", "list.number")
        case "article": ("Artikel", "text.book.closed")
        case "product": ("Produkt", "tag")
        default: (s, "doc")
        }
    }
    static func savedType(_ s: String) -> String {
        ["POST": "Beiträge", "PROJECT": "Projekte", "TUTORIAL": "Anleitungen", "PRODUCT": "Produkte", "ARTICLE": "Artikel"][s] ?? s
    }
    /// Risikostufe aus dem Risikowert (0–100)
    static func risk(_ score: Int?) -> (label: String, tone: NoticeView.Tone) {
        let s = score ?? 0
        if s >= 70 { return ("Hohes Risiko", .danger) }
        if s >= 40 { return ("Mittleres Risiko", .warn) }
        return ("Niedriges Risiko", .info)
    }

    /// Spiegel von `allowedActions` (server/moderation/service.ts)
    static func allowedActions(targetType: String, hasSubject: Bool) -> [String] {
        let user = hasSubject ? ["RESTRICT_MESSAGING", "SUSPEND", "BAN"] : []
        let base = ["NONE"] + (hasSubject ? ["WARN"] : [])
        switch targetType {
        case "POST": return base + ["LIMIT_REACH", "HIDE", "REMOVE"] + user
        case "PRODUCT": return base + ["DISABLE_LISTING", "HIDE"] + user
        case "USER": return base + user
        default: return base + ["HIDE", "REMOVE"] + user
        }
    }
}
