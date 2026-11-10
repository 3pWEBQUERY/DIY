import Foundation

// Modelle des Bereichs Entdecken · Suche · Communities · Blog · Materialien.
// Abgeleitet aus fixtures/*.json und den Mobile-Routen (content.ts, community.ts, social.ts).

// MARK: - Entdecken (§18.3)

struct DiscoverCollection: Decodable, Hashable, Identifiable, Sendable {
    var id: String
    var slug: String?
    var title: String
    var kicker: String?
    var description: String?
    var season: String?
    var isSeasonal: Bool?
    var projects: [ProjectCard]
    var tutorials: [TutorialCard]
}

struct DiscoverPage: Decodable, Sendable {
    var category: Category?
    var categories: [Category]
    var popular: [ProjectCard]
    var fresh: [ProjectCard]
    var tutorials: [TutorialCard]
    var creators: [CreatorSuggestion]
    var communities: [CommunityCard]
    var collections: [DiscoverCollection]
    var posts: [PostItem]?
}

// MARK: - Suche (§18)

struct DiscoverSearchHit: Decodable, Hashable, Identifiable, Sendable {
    var type: String
    var id: String
    var title: String
    var subtitle: String?
    var href: String?
    var cover: String?
    var category: String?
    var meta: [String: JSONValue]?
}

struct DiscoverSearchResponse: Decodable, Sendable {
    var q: String?
    var results: [String: [DiscoverSearchHit]]?
    var projectCards: [ProjectCard]?
    var tutorialCards: [TutorialCard]?
}

enum DiscoverSearchType: String, CaseIterable, Identifiable, Hashable {
    case project, tutorial, product, user, article, community, post
    var id: String { rawValue }
    var label: String {
        switch self {
        case .project: "Projekte"
        case .tutorial: "Anleitungen"
        case .product: "Produkte"
        case .user: "Mitglieder"
        case .article: "Artikel"
        case .community: "Communities"
        case .post: "Beiträge"
        }
    }
    var symbol: String {
        switch self {
        case .project: "hammer"
        case .tutorial: "list.number"
        case .product: "tag"
        case .user: "person.crop.circle"
        case .article: "text.book.closed"
        case .community: "person.3"
        case .post: "text.bubble"
        }
    }
}

// MARK: - Communities (§15)

struct CommunityRule: Codable, Hashable, Identifiable, Sendable {
    var id: String = UUID().uuidString
    var title: String
    var body: String

    enum CodingKeys: String, CodingKey { case id, title, body }
    init(id: String = UUID().uuidString, title: String, body: String) { self.id = id; self.title = title; self.body = body }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decodeIfPresent(String.self, forKey: .id)) ?? UUID().uuidString
        title = (try? c.decode(String.self, forKey: .title)) ?? ""
        body = (try? c.decodeIfPresent(String.self, forKey: .body)) ?? ""
    }
}

struct CommunityFull: Decodable, Hashable, Sendable {
    struct Owner: Decodable, Hashable, Sendable { var id: String?; var profile: ProfileRef.P? }
    var id: String
    var slug: String
    var name: String
    var description: String?
    var category: String?
    var coverUrl: String?
    var visibility: String
    var ownerId: String?
    var memberCount: Int?
    var region: String?
    var isFeatured: Bool?
    var state: String?
    var createdAt: Date?
    var rules: [CommunityRule]?
    var owner: Owner?
}

struct CommunityMembership: Decodable, Hashable, Sendable {
    var role: String?
    var state: String?
    var mutedUntil: Date?
}

struct CommunityChallenge: Decodable, Hashable, Identifiable, Sendable {
    var id: String
    var title: String
    var description: String?
    var startsAt: Date?
    var endsAt: Date?
    var rules: String?
    var prize: String?
    var judging: String?
    var votingEndsAt: Date?
    var resultsAt: Date?
    var entryCount: Int?

    var phase: CompetitionPhase { .compute(startsAt: startsAt, endsAt: endsAt, votingEndsAt: votingEndsAt, resultsAt: resultsAt, judging: judging) }

    var isRunning: Bool {
        let now = Date()
        return (startsAt ?? .distantPast) <= now && now <= (endsAt ?? .distantFuture)
    }
}

struct CommunityPagePayload: Decodable, Sendable {
    var community: CommunityFull
    var membership: CommunityMembership?
    var canView: Bool
    var isMember: Bool
    var isMod: Bool
    var isManager: Bool
    var muted: Bool?
    var challenge: CommunityChallenge?
    var pendingCount: Int?
    var projectCount: Int?
    var pinned: [PostItem]?
    var feed: Page<PostItem>?
}

struct CommunityHome: Decodable, Sendable {
    var mine: [CommunityCard]
    var invites: [CommunityCard]
    var featured: [CommunityCard]
    var all: [CommunityCard]
    var categories: [Category]?
}

struct CommunityMemberRow: Decodable, Hashable, Identifiable, Sendable {
    var userId: String
    var role: String?
    var mutedUntil: Date?
    var joinedAt: Date?
    var since: Date?
    var handle: String
    var displayName: String
    var avatarUrl: String?
    var bio: String?
    var id: String { userId }
    var isMuted: Bool { (mutedUntil ?? .distantPast) > Date() }
}

struct CommunityProjectItem: Decodable, Hashable, Identifiable, Sendable {
    var id: String
    var slug: String
    var title: String
    var status: String?
    var category: String?
    var coverUrl: String?
    var difficulty: Int?
    var likeCount: Int?
    var ownerId: String?
    var owner: ProfileRef?
    var addedAt: Date?
    var href: String?
}

struct CommunityProjectsPayload: Decodable, Sendable {
    var projects: [CommunityProjectItem]
    var shareable: [IdTitle]
}

struct CommunityLogEntry: Decodable, Hashable, Identifiable, Sendable {
    struct Mod: Decodable, Hashable, Sendable { var handle: String?; var displayName: String? }
    var id: String
    var at: Date?
    var action: String
    var label: String
    var detail: String?
    var reason: String?
    var moderator: Mod?
    var target: String?
    var targetType: String?
}

struct CommunityManagePayload: Decodable, Sendable {
    var requests: [CommunityMemberRow]
    var invited: [CommunityMemberRow]
    var banned: [CommunityMemberRow]
    var hidden: [PostItem]
    var challenges: [CommunityChallenge]
    var log: [CommunityLogEntry]
    var members: Page<CommunityMemberRow>
}

struct CommunityJoinResult: Decodable, Sendable { var state: String? }
struct CommunityCreated: Decodable, Sendable { var id: String?; var slug: String }

// MARK: - Blog (§14)

struct BlogCategory: Decodable, Hashable, Identifiable, Sendable {
    var id: String
    var slug: String
    var name: String
}

struct BlogAuthor: Decodable, Hashable, Identifiable, Sendable {
    var userId: String
    var handle: String
    var displayName: String
    var avatarUrl: String?
    var bio: String?
    var articles: Int?
    var followerCount: Int?
    var id: String { userId }
}

struct BlogHome: Decodable, Sendable {
    struct Group: Decodable, Sendable, Identifiable {
        var category: BlogCategory
        var items: [ArticleCard]
        var id: String { category.id }
    }
    var hero: ArticleCard?
    var latest: [ArticleCard]
    var byCategory: [Group]
    var categories: [BlogCategory]
    var authors: [BlogAuthor]
}

/// Seite eines Nutzer-Blogs (oder Weiterleitung auf neuen Handle)
struct BlogUserPage: Decodable, Sendable {
    var items: [ArticleCard]?
    var nextCursor: String?
    var redirect: String?
}

/// Medium in Bild-/Galerieblöcken
struct BlogMedia: Codable, Hashable, Identifiable, Sendable {
    var mediaId: String
    var url: String?
    var alt: String?
    var caption: String?
    var id: String { mediaId }
}

/// Block eines Artikels (articleBlockSchema). Alle Felder optional – je nach `type` belegt.
struct BlogBlock: Codable, Hashable, Identifiable, Sendable {
    var id: String
    var type: String
    var level: Int?
    var text: String?
    var ordered: Bool?
    var items: [String]?
    var cite: String?
    var mediaId: String?
    var url: String?
    var alt: String?
    var caption: String?
    var images: [BlogMedia]?
    var rows: [[String]]?
    var tone: String?
    var projectId: String?
    var tutorialId: String?
    var productId: String?
    var title: String?

    static func newId() -> String {
        let chars = Array("abcdefghijkmnopqrstuvwxyz23456789")
        return String((0..<8).map { _ in chars.randomElement()! })
    }

    static func make(_ type: String) -> BlogBlock {
        var b = BlogBlock(id: newId(), type: type)
        switch type {
        case "heading": b.level = 2; b.text = ""
        case "paragraph": b.text = ""
        case "list": b.ordered = false; b.items = [""]
        case "quote": b.text = ""; b.cite = ""
        case "image": b.alt = ""; b.caption = ""
        case "gallery": b.images = []
        case "video": b.caption = ""
        case "table": b.rows = [["", ""], ["", ""]]
        case "callout": b.tone = "info"; b.text = ""
        default: break
        }
        return b
    }

    /// Body-Form gemäss articleBlockSchema (nur die Felder des jeweiligen Typs)
    var payload: JSONValue {
        var o: [String: JSONValue] = ["id": .string(id), "type": .string(type)]
        switch type {
        case "heading": o["level"] = .number(Double(level == 3 ? 3 : 2)); o["text"] = .string(text ?? "")
        case "paragraph": o["text"] = .string(text ?? "")
        case "list":
            o["ordered"] = .bool(ordered ?? false)
            o["items"] = .from((items ?? []).map(\.trimmed).filter { !$0.isEmpty })
        case "quote": o["text"] = .string(text ?? ""); o["cite"] = .string(cite ?? "")
        case "image":
            o["mediaId"] = .from(mediaId); o["url"] = .string(url ?? ""); o["alt"] = .string(alt ?? ""); o["caption"] = .string(caption ?? "")
        case "gallery":
            o["images"] = .array((images ?? []).map { ["mediaId": .string($0.mediaId), "url": .string($0.url ?? ""), "alt": .string($0.alt ?? ""), "caption": .string($0.caption ?? "")] })
        case "video": o["mediaId"] = .from(mediaId); o["url"] = .string(url ?? ""); o["caption"] = .string(caption ?? "")
        case "table": o["rows"] = .array((rows ?? []).map { .from($0) })
        case "callout": o["tone"] = .string(tone ?? "info"); o["text"] = .string(text ?? "")
        case "projectCard": o["projectId"] = .from(projectId); if let title { o["title"] = .string(title) }
        case "tutorialCard": o["tutorialId"] = .from(tutorialId); if let title { o["title"] = .string(title) }
        case "productCard": o["productId"] = .from(productId); if let title { o["title"] = .string(title) }
        default: break
        }
        return .object(o)
    }

    /// Fehlende Pflichtangaben (für die Prüfung vor dem Speichern)
    var problem: String? {
        switch type {
        case "image": mediaId == nil ? "Ein Bildblock hat noch kein Bild." : nil
        case "video": mediaId == nil ? "Ein Videoblock hat noch kein Video." : nil
        case "gallery": (images ?? []).isEmpty ? "Eine Galerie hat noch keine Bilder." : nil
        case "projectCard": projectId == nil ? "Eine Projektkarte ist noch leer." : nil
        case "tutorialCard": tutorialId == nil ? "Eine Anleitungskarte ist noch leer." : nil
        case "productCard": productId == nil ? "Eine Produktkarte ist noch leer." : nil
        case "table": (rows ?? []).isEmpty ? "Eine Tabelle hat keine Zeilen." : nil
        default: nil
        }
    }

    static let kinds: [(type: String, label: String, symbol: String)] = [
        ("heading", "Zwischentitel", "textformat.size"),
        ("paragraph", "Absatz", "text.alignleft"),
        ("list", "Liste", "list.bullet"),
        ("quote", "Zitat", "quote.opening"),
        ("image", "Bild", "photo"),
        ("gallery", "Galerie", "photo.stack"),
        ("video", "Video", "play.rectangle"),
        ("table", "Tabelle", "tablecells"),
        ("callout", "Hinweisbox", "exclamationmark.bubble"),
        ("projectCard", "Projektkarte", "hammer"),
        ("tutorialCard", "Anleitungskarte", "list.number"),
        ("productCard", "Produktkarte", "tag"),
        ("divider", "Trenner", "minus"),
    ]
    static func label(_ type: String) -> String { kinds.first { $0.type == type }?.label ?? type }
    static func symbol(_ type: String) -> String { kinds.first { $0.type == type }?.symbol ?? "square" }
}

struct BlogArticleFull: Decodable, Sendable {
    struct ProjectLink: Decodable, Hashable, Sendable { var projectId: String }
    var id: String
    var authorId: String?
    var slug: String
    var title: String
    var dek: String?
    var coverUrl: String?
    var blocks: [BlogBlock]
    var plainText: String?
    var readingMinutes: Int?
    var categoryId: String?
    var tags: [String]?
    var state: String?
    var commentsEnabled: Bool?
    var viewCount: Int?
    var likeCount: Int?
    var isFeatured: Bool?
    var publishedAt: Date?
    var updatedAt: Date?
    var category: ArticleCard.Cat?
    var projects: [ProjectLink]?
}

struct BlogLinkedProject: Decodable, Hashable, Identifiable, Sendable {
    var id: String
    var slug: String
    var title: String
    var status: String?
    var category: String?
    var coverUrl: String?
    var difficulty: Int?
    var owner: ProfileRef?
    var href: String?
}

struct BlogReadPayload: Decodable, Sendable {
    struct Viewer: Decodable, Sendable { var liked: Bool?; var saved: Bool?; var following: Bool? }
    var redirect: String?
    var kind: String?
    var isAuthor: Bool?
    var isLive: Bool?
    var article: BlogArticleFull?
    var author: BlogAuthor?
    var viewer: Viewer?
    var commentCount: Int?
    var related: [ArticleCard]?
    var linkedProjects: [BlogLinkedProject]?
}

// MARK: Studio-Editor

struct BlogEditArticle: Decodable, Sendable {
    var id: String
    var slug: String
    var title: String
    var dek: String?
    var coverUrl: String?
    var blocks: [BlogBlock]
    var categoryId: String?
    var tags: [String]?
    var seoTitle: String?
    var seoDescription: String?
    var commentsEnabled: Bool?
    var projectIds: [String]?
    var state: String?
    var publishedAt: Date?
    var updatedAt: Date?
    var readingMinutes: Int?
    var everPublished: Bool?
}

struct BlogEditorPayload: Decodable, Sendable {
    var article: BlogEditArticle?
    var categories: [BlogCategory]
    var projects: [IdTitle]
}

struct BlogSaveResult: Decodable, Sendable {
    var id: String
    var slug: String
    var state: String?
    var updatedAt: Date?
    var coverUrl: String?
}

struct BlogPublishResult: Decodable, Sendable { var state: String?; var publishedAt: Date? }

struct BlogRevision: Decodable, Hashable, Identifiable, Sendable {
    var id: String
    var title: String
    var createdAt: Date?
    var blockCount: Int?
    var words: Int?
}

struct BlogRestoreResult: Decodable, Sendable { var title: String; var blocks: [BlogBlock] }

struct BlogEmbedOption: Decodable, Hashable, Identifiable, Sendable {
    var id: String
    var title: String
    var meta: String?
    var coverUrl: String?
    var category: String?
}

enum BlogState {
    static func label(_ s: String?) -> String {
        switch s {
        case "DRAFT": "Entwurf"
        case "SCHEDULED": "Geplant"
        case "PUBLISHED": "Veröffentlicht"
        case "HIDDEN": "Ausgeblendet"
        case "REMOVED": "Entfernt"
        default: s ?? "Neu"
        }
    }
}

// MARK: - Materialien (§17)

struct MaterialGroup: Decodable, Hashable, Identifiable, Sendable {
    struct Count: Decodable, Hashable, Sendable { var materials: Int? }
    var id: String
    var slug: String
    var name: String
    var _count: Count?
    var count: Int { _count?.materials ?? 0 }
}

struct MaterialEntry: Decodable, Hashable, Identifiable, Sendable {
    struct Cat: Decodable, Hashable, Sendable { var slug: String?; var name: String? }
    var id: String
    var slug: String?
    var name: String
    var type: String?
    var unit: String?
    var brand: String?
    var notes: String?
    var safetyInfo: String?
    var properties: [String: JSONValue]?
    var category: Cat?
    var usedIn: Int?
}

// MARK: - Hilfen

extension JSONValue {
    /// Lesbare Darstellung eines beliebigen Werts (Materialeigenschaften, Such-Meta)
    var discoverText: String {
        switch self {
        case .null: "–"
        case .bool(let b): b ? "Ja" : "Nein"
        case .number(let n): n == n.rounded() ? String(Int(n)) : String(format: "%.2f", n)
        case .string(let s): s
        case .array(let a): a.map(\.discoverText).joined(separator: ", ")
        case .object(let o): o.map { "\($0.key): \($0.value.discoverText)" }.sorted().joined(separator: ", ")
        }
    }
}
