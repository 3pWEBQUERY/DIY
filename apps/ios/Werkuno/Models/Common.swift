import Foundation

// Gemeinsame Modelle der Werkuno-API. Abgeleitet aus echten Antworten (fixtures/*.json).
// Felder, die der Server weglassen oder null senden kann, sind optional.

// MARK: - Paginierung

struct Page<T: Decodable & Sendable>: Decodable, Sendable {
    var items: [T]
    var nextCursor: String?
}

// MARK: - Kategorien

struct Category: Codable, Hashable, Identifiable, Sendable {
    var slug: String
    var name: String
    var short: String
    var glyph: String?
    var focus: Bool?
    var description: String?
    var isActive: Bool?
    var projectCount: Int?
    var id: String { slug }
}

// MARK: - Personen

struct UserMini: Codable, Hashable, Identifiable, Sendable {
    var id: String
    var handle: String
    var displayName: String
    var avatarUrl: String?
    var bio: String?
    var followerCount: Int?
    var projectCount: Int?
}

/// Verschachtelte Form `{ profile: { handle, displayName } }`
struct ProfileRef: Codable, Hashable, Sendable {
    struct P: Codable, Hashable, Sendable { var handle: String?; var displayName: String?; var avatarUrl: String? }
    var profile: P?
    var handle: String? { profile?.handle }
    var displayName: String? { profile?.displayName }
}

struct CreatorSuggestion: Codable, Hashable, Identifiable, Sendable {
    var userId: String
    var handle: String
    var displayName: String
    var avatarUrl: String?
    var bio: String?
    var categories: [String]?
    var followerCount: Int?
    var projectCount: Int?
    var following: Bool?
    var id: String { userId }
}

// MARK: - Medien

struct MediaVariants: Codable, Hashable, Sendable {
    var thumb: String?
    var sm: String?
    var md: String?
    var lg: String?
    var video: String?
    var poster: String?

    var best: String? { lg ?? md ?? sm ?? thumb }
    var small: String? { sm ?? thumb ?? md ?? lg }
}

/// Medium in Beiträgen (`{ id, alt, kind, preview }`) bzw. Galerien (`{ id, alt, variants }`)
struct MediaItem: Codable, Hashable, Identifiable, Sendable {
    var id: String
    var alt: String?
    var kind: String?
    var preview: String?
    var url: String?
    var variants: MediaVariants?
    var width: Int?
    var height: Int?

    var displayURL: String? { variants?.best ?? preview ?? url }
    var thumbURL: String? { variants?.small ?? preview ?? url }
    var isVideo: Bool { kind == "VIDEO" }
    var aspect: CGFloat? { if let w = width, let h = height, h > 0 { CGFloat(w) / CGFloat(h) } else { nil } }
}

struct Cover: Codable, Hashable, Sendable {
    var url: String?
    var variants: MediaVariants?
    var alt: String?
    var best: String? { variants?.best ?? url }
}

/// Für Bodies: Medienreferenz mit Alt-Text
struct MediaRef: Codable, Hashable, Sendable { var id: String; var alt: String }

// MARK: - Beiträge (§9)

struct Counts: Codable, Hashable, Sendable {
    var likes: Int?
    var comments: Int?
    var saves: Int?
    var reposts: Int?
    var remixes: Int?
    var updates: Int?
    var tutorials: Int?
    var views: Int?
    var followers: Int?
    var completions: Int?
}

struct ViewerState: Codable, Hashable, Sendable {
    var liked: Bool?
    var saved: Bool?
    var isAuthor: Bool?
    var isOwner: Bool?
}

struct PostItem: Codable, Hashable, Identifiable, Sendable {
    struct ProjectRef: Codable, Hashable, Sendable {
        var id: String
        var slug: String
        var title: String
        var status: String?
        var coverUrl: String?
        var category: String?
        var difficulty: Int?
        var ownerHandle: String?
        var owner: ProfileRef?
        var handle: String? { ownerHandle ?? owner?.handle }
    }
    struct TutorialRef: Codable, Hashable, Sendable { var id: String; var slug: String; var title: String; var difficulty: Int?; var minutes: Int?; var coverUrl: String?; var category: String? }
    struct ProductRef: Codable, Hashable, Sendable { var id: String; var slug: String?; var title: String; var priceMinor: Int?; var currency: String?; var coverUrl: String?; var shopSlug: String?; var shop: ShopRef?; var status: String? }
    struct ShopRef: Codable, Hashable, Sendable { var slug: String?; var name: String? }
    struct ArticleRef: Codable, Hashable, Sendable { var id: String; var slug: String?; var title: String; var dek: String?; var coverUrl: String?; var href: String?; var authorHandle: String? }
    struct CommunityRef: Codable, Hashable, Sendable { var id: String?; var slug: String; var name: String }
    struct RepostRef: Codable, Hashable, Sendable {
        var id: String
        var body: String?
        var author: UserMini?
        var media: [MediaItem]?
        var publishedAt: Date?

        private enum CodingKeys: String, CodingKey { case id, body, author, media, publishedAt }

        // Tolerant dekodieren: Ein unvollständiger Autor oder unerwartete Medien dürfen nicht die ganze
        // Feed-Seite (Page<PostItem>) unlesbar machen – dann wird nur dieses Feld weggelassen.
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            id = try c.decode(String.self, forKey: .id)
            body = try c.decodeIfPresent(String.self, forKey: .body)
            author = (try? c.decodeIfPresent(UserMini.self, forKey: .author)) ?? nil
            media = (try? c.decodeIfPresent([MediaItem].self, forKey: .media)) ?? nil
            publishedAt = (try? c.decodeIfPresent(Date.self, forKey: .publishedAt)) ?? nil
        }
    }

    /// Umfrage am Beitrag. Stimmenzahlen (`votes`) nur nach eigener Abstimmung, nach Ende oder für die Autorin.
    struct Poll: Codable, Hashable, Sendable {
        struct Option: Codable, Hashable, Identifiable, Sendable { var id: String; var label: String; var votes: Int? }
        var id: String?
        var endsAt: Date?
        var ended: Bool?
        var multiple: Bool?
        var voterCount: Int?
        var showResults: Bool?
        var viewerVotes: [String]?
        var options: [Option]

        private enum CodingKeys: String, CodingKey { case id, endsAt, ended, multiple, voterCount, showResults, viewerVotes, options }

        // Wirft nie: Eine unerwartete Umfrage darf nicht die ganze Feed-Seite (Page<PostItem>) unlesbar machen –
        // dann bleibt sie leer (`isUsable == false`) und wird nicht angezeigt.
        init(from decoder: Decoder) throws {
            guard let c = try? decoder.container(keyedBy: CodingKeys.self) else {
                options = []
                return
            }
            id = (try? c.decodeIfPresent(String.self, forKey: .id)) ?? nil
            endsAt = (try? c.decodeIfPresent(Date.self, forKey: .endsAt)) ?? nil
            ended = (try? c.decodeIfPresent(Bool.self, forKey: .ended)) ?? nil
            multiple = (try? c.decodeIfPresent(Bool.self, forKey: .multiple)) ?? nil
            voterCount = (try? c.decodeIfPresent(Int.self, forKey: .voterCount)) ?? nil
            showResults = (try? c.decodeIfPresent(Bool.self, forKey: .showResults)) ?? nil
            viewerVotes = (try? c.decodeIfPresent([String].self, forKey: .viewerVotes)) ?? nil
            options = (try? c.decodeIfPresent([Option].self, forKey: .options)) ?? []
        }

        var isUsable: Bool { id != nil && !options.isEmpty }
        var isEnded: Bool { ended == true || (endsAt.map { $0 <= Date() } ?? false) }
        var hasVoted: Bool { !(viewerVotes ?? []).isEmpty }
        var isMultiple: Bool { multiple == true }
        /// Ergebnisse zeigen: Server sagt es, oder bereits abgestimmt bzw. beendet
        var revealsResults: Bool { showResults == true || hasVoted || isEnded }
    }

    var id: String
    var kind: String
    var body: String
    var category: String?
    var visibility: String?
    var isCommercial: Bool?
    var isPinned: Bool?
    var isAnnouncement: Bool?
    var publishedAt: Date?
    var editedAt: Date?
    var author: UserMini
    var media: [MediaItem]
    var project: ProjectRef?
    var tutorial: TutorialRef?
    var product: ProductRef?
    var article: ArticleRef?
    var community: CommunityRef?
    var repostOf: RepostRef?
    var poll: Poll?
    var counts: Counts
    var viewer: ViewerState?
}

struct CommentItem: Codable, Hashable, Identifiable, Sendable {
    var id: String
    var body: String
    var createdAt: Date?
    var editedAt: Date?
    var likeCount: Int?
    var liked: Bool?
    var isQuestion: Bool?
    var isAnswer: Bool?
    var author: UserMini
    var replies: [CommentItem]?
}

// MARK: - Projekte (§10)

struct ProjectCard: Codable, Hashable, Identifiable, Sendable {
    var id: String
    var slug: String
    var href: String?
    var title: String
    var category: String
    var difficulty: Int?
    var status: String
    var visibility: String?
    var coverUrl: String?
    var owner: UserMini
    var counts: Counts?
    var publishedAt: Date?
    var updatedAt: Date?
    var completedAt: Date?
}

/// Kompakte Projektliste (Werkbank, Trends, Optionen)
struct ProjectMini: Codable, Hashable, Identifiable, Sendable {
    var id: String
    var slug: String?
    var title: String
    var status: String?
    var category: String?
    var coverUrl: String?
    var difficulty: Int?
    var updatedAt: Date?
    var handle: String?
    var owner: ProfileRef?
    var href: String?
    var ownerHandle: String? { handle ?? owner?.handle }
}

struct IdTitle: Codable, Hashable, Identifiable, Sendable { var id: String; var title: String }

// MARK: - Anleitungen (§11)

struct TutorialCard: Codable, Hashable, Identifiable, Sendable {
    struct ProjectLink: Codable, Hashable, Sendable { var title: String?; var href: String? }
    var id: String
    var slug: String
    var href: String?
    var title: String
    var summary: String?
    var category: String
    var difficulty: Int?
    var minutes: Int?
    var coverUrl: String?
    var isPaid: Bool?
    var priceMinor: Int?
    var safetyKinds: [String]?
    var state: String?
    var steps: Int?
    var version: Int?
    var counts: Counts?
    var author: UserMini?
    var project: ProjectLink?
    var publishedAt: Date?
    var updatedAt: Date?
}

// MARK: - Marktplatz (§13)

struct ProductCard: Codable, Hashable, Identifiable, Sendable {
    struct ShopMini: Codable, Hashable, Sendable { var slug: String; var name: String? }
    var id: String
    var slug: String
    var title: String
    var priceMinor: Int
    var currency: String?
    var kind: String?
    var category: String?
    var status: String?
    var cover: Cover?
    var coverUrl: String?
    var shop: ShopMini?
    var shopSlug: String?
    var ratingAvg: Double?
    var ratingCount: Int?
    var href: String?

    var shopSlugValue: String? { shop?.slug ?? shopSlug }
    var imageURL: String? { cover?.best ?? coverUrl }
    var soldOut: Bool { status == "SOLD_OUT" }
}

struct ShopCard: Codable, Hashable, Identifiable, Sendable {
    struct CoverRef: Codable, Hashable, Sendable { var id: String?; var url: String?; var category: String? }
    struct Owner: Codable, Hashable, Sendable { var handle: String?; var displayName: String?; var avatarUrl: String? }
    var id: String
    var slug: String
    var name: String
    var tagline: String?
    var country: String?
    var ratingAvg: Double?
    var ratingCount: Int?
    var salesCount: Int?
    var productCount: Int?
    var owner: Owner?
    var covers: [CoverRef]?
}

// MARK: - Communities (§15)

struct CommunityCard: Codable, Hashable, Identifiable, Sendable {
    var id: String
    var slug: String
    var name: String
    var description: String?
    var category: String?
    var coverUrl: String?
    var visibility: String?
    var memberCount: Int?
    var isFeatured: Bool?
    var region: String?
    var createdAt: Date?
    var viewerState: String?
}

// MARK: - Blog (§14)

struct ArticleCard: Codable, Hashable, Identifiable, Sendable {
    struct Cat: Codable, Hashable, Sendable { var slug: String?; var name: String? }
    var id: String
    var slug: String
    var title: String
    var dek: String?
    var coverUrl: String?
    var readingMinutes: Int?
    var publishedAt: Date?
    var likeCount: Int?
    var viewCount: Int?
    var tags: [String]?
    var isFeatured: Bool?
    var category: Cat?
    var author: UserMini?
    var href: String?
}

// MARK: - Benachrichtigungen (§19)

struct NotificationItem: Codable, Hashable, Identifiable, Sendable {
    var id: String
    var type: String
    var group: String?
    var icon: String?
    var count: Int?
    var read: Bool
    var createdAt: Date?
    var updatedAt: Date?
    var href: String?
    var text: String
    var lead: String?
    var body: String?
    var excerpt: String?
    var actor: UserMini?
}

struct NotificationPage: Decodable, Sendable {
    var items: [NotificationItem]
    var nextCursor: String?
    var unread: [String: Int]?
}

// MARK: - Nachrichten (§16)

struct ConversationItem: Codable, Hashable, Identifiable, Sendable {
    /// Gruppenunterhaltung (`kind == "GROUP"`): Titel, Mitgliederzahl und bis zu zwei Avatare
    struct GroupInfo: Codable, Hashable, Sendable {
        struct Avatar: Codable, Hashable, Sendable { var name: String?; var avatarUrl: String? }
        var title: String?
        var memberCount: Int?
        var avatars: [Avatar]?
    }
    var id: String
    var kind: String?
    var group: GroupInfo?
    var orderNumber: String?
    var isProductInquiry: Bool?
    var lastMessageAt: Date?
    var preview: String?
    var lastFromMe: Bool?
    var flagged: Bool?
    var unread: Bool?
    var other: UserMini?

    var isGroup: Bool { kind == "GROUP" || group != nil }
    /// Anzeigename in der Liste: Gruppentitel bzw. Gegenüber
    var displayTitle: String { isGroup ? (group?.title?.nilIfEmpty ?? "Gruppe") : (other?.displayName ?? "Unterhaltung") }

    private enum CodingKeys: String, CodingKey { case id, kind, group, orderNumber, isProductInquiry, lastMessageAt, preview, lastFromMe, flagged, unread, other }

    // Tolerant dekodieren: Ein unerwarteter Gruppenblock oder ein unvollständiges Gegenüber darf nicht
    // den ganzen Posteingang unlesbar machen.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        kind = (try? c.decodeIfPresent(String.self, forKey: .kind)) ?? nil
        group = (try? c.decodeIfPresent(GroupInfo.self, forKey: .group)) ?? nil
        orderNumber = (try? c.decodeIfPresent(String.self, forKey: .orderNumber)) ?? nil
        isProductInquiry = (try? c.decodeIfPresent(Bool.self, forKey: .isProductInquiry)) ?? nil
        lastMessageAt = (try? c.decodeIfPresent(Date.self, forKey: .lastMessageAt)) ?? nil
        preview = (try? c.decodeIfPresent(String.self, forKey: .preview)) ?? nil
        lastFromMe = (try? c.decodeIfPresent(Bool.self, forKey: .lastFromMe)) ?? nil
        flagged = (try? c.decodeIfPresent(Bool.self, forKey: .flagged)) ?? nil
        unread = (try? c.decodeIfPresent(Bool.self, forKey: .unread)) ?? nil
        other = (try? c.decodeIfPresent(UserMini.self, forKey: .other)) ?? nil
    }
}

struct InboxCounts: Codable, Hashable, Sendable { var requests: Int; var unread: Int }
