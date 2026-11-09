import Foundation

// Modelle des Bereichs Social (Feed, Beiträge, Nachrichten, Benachrichtigungen).
// Abgeleitet aus fixtures/feed_context.json, post_edit.json, thread.json, conversations.json,
// message_sent.json, conversation_started.json und den Mobile-Routen (server/mobile/routes/*.ts).

// MARK: - Feed

enum SocialFeedKind: String, CaseIterable, Hashable {
    case forYou = "for-you"
    case following
    case new

    var label: String {
        switch self {
        case .forYou: "Für dich"
        case .following: "Folge ich"
        case .new: "Neu"
        }
    }
}

/// `GET /feed/context` – Werkbank, Vorschläge, Trends (+ Composer-Optionen)
struct SocialFeedContext: Decodable, Sendable {
    struct WorkbenchProject: Decodable, Hashable, Identifiable, Sendable {
        struct C: Decodable, Hashable, Sendable { var updates: Int? }
        var id: String
        var slug: String
        var title: String
        var status: String?
        var category: String?
        var coverUrl: String?
        var updatedAt: Date?
        var handle: String?
        var _count: C?
        var updates: Int { _count?.updates ?? 0 }
    }

    var workbench: [WorkbenchProject]
    var creators: [CreatorSuggestion]
    var communities: [CommunityCard]
    var trending: [ProjectMini]
    var isNew: Bool?
    var projectOptions: [IdTitle]?

    static let empty = SocialFeedContext(workbench: [], creators: [], communities: [], trending: [], isNew: false, projectOptions: [])
}

// MARK: - Beitrag bearbeiten

/// `GET /posts/:id/edit`
struct SocialPostEdit: Decodable, Sendable {
    struct Media: Decodable, Hashable, Sendable { var id: String; var alt: String?; var kind: String?; var preview: String? }
    struct CommunityRef: Decodable, Hashable, Sendable { var name: String; var slug: String }
    struct RepostRef: Decodable, Hashable, Sendable { var id: String; var body: String? }
    var id: String
    var kind: String?
    var body: String
    var category: String?
    var visibility: String?
    var state: String?
    var projectId: String?
    var project: IdTitle?
    var community: CommunityRef?
    var repostOf: RepostRef?
    var media: [Media]
}

/// `POST /communities/:id/posts` → `{ id }`
struct SocialCreatedId: Decodable, Sendable { var id: String }

// MARK: - Benachrichtigungen

enum SocialNotificationFilter: String, CaseIterable, Hashable {
    case all, mentions, projects, shop, system
    var label: String {
        switch self {
        case .all: "Alle"
        case .mentions: "Erwähnungen"
        case .projects: "Projekte"
        case .shop: "Shop"
        case .system: "System"
        }
    }
    var emptyTitle: String {
        switch self {
        case .all: "Alles ruhig"
        case .mentions: "Keine Erwähnungen"
        case .projects: "Noch keine Projektaktivität"
        case .shop: "Keine Shop-Meldungen"
        case .system: "Keine Systemmeldungen"
        }
    }
    var emptyBody: String {
        switch self {
        case .all: "Wenn jemand auf deine Projekte reagiert, dir folgt oder dir schreibt, erfährst du es hier."
        case .mentions: "Kommentare, Antworten und Erwähnungen erscheinen hier."
        case .projects: "Gefällt-mir, Nachbauten und Updates zu Projekten und Anleitungen sammeln sich hier."
        case .shop: "Neue Bestellungen und Statusänderungen deiner Käufe erscheinen hier."
        case .system: "Sicherheitshinweise und Moderationsentscheidungen erscheinen hier."
        }
    }
}

// MARK: - Nachrichten

enum SocialInboxBox: String, CaseIterable, Hashable {
    case inbox, requests, archived
    var label: String {
        switch self {
        case .inbox: "Posteingang"
        case .requests: "Anfragen"
        case .archived: "Archiv"
        }
    }
}

/// `GET /conversations?box=`
struct SocialConversationList: Decodable, Sendable {
    var items: [ConversationItem]
    var counts: InboxCounts?
}

/// Bild in einer Nachricht (`{ id, url, thumb, alt, width, height }`)
struct SocialMessageMedia: Codable, Hashable, Identifiable, Sendable {
    var id: String
    var url: String?
    var thumb: String?
    var alt: String?
    var width: Int?
    var height: Int?

    var asMediaItem: MediaItem { MediaItem(id: id, alt: alt, kind: "IMAGE", preview: thumb, url: url, width: width, height: height) }
}

struct SocialMessage: Codable, Hashable, Identifiable, Sendable {
    var id: String
    /// Gruppenereignis („X hat Y hinzugefügt“) statt einer echten Nachricht
    var system: Bool?
    var body: String
    var media: [SocialMessageMedia]
    var flags: [String]?
    var removed: Bool?
    var createdAt: Date
    var senderId: String
    var mine: Bool

    var isRemoved: Bool { removed == true }
    var isSystem: Bool { system == true }
    var isSuspicious: Bool { !mine && !isSystem && (flags ?? []).contains("SUSPICIOUS_PAYMENT_LINK") }
}

/// Bestell- bzw. Produktkontext einer Unterhaltung (`type: "order" | "product"`)
struct SocialThreadContext: Decodable, Hashable, Sendable {
    struct Shop: Decodable, Hashable, Sendable { var name: String?; var slug: String? }
    struct Item: Decodable, Hashable, Sendable { var title: String; var quantity: Int?; var variantName: String?; var coverUrl: String? }
    var type: String
    var role: String?
    var number: String?
    var status: String?
    var totalMinor: Int?
    var currency: String?
    var createdAt: Date?
    var shop: Shop?
    var items: [Item]?
    var itemCount: Int?
    var title: String?
    var coverUrl: String?
    var priceMinor: Int?
    var href: String?

    var isOrder: Bool { type == "order" }
}

/// `GET /conversations/:id`
struct SocialThread: Decodable, Sendable {
    struct Me: Decodable, Sendable { var isRequest: Bool; var archived: Bool; var lastReadAt: Date? }
    struct Other: Decodable, Sendable {
        var id: String
        var handle: String
        var displayName: String
        var avatarUrl: String?
        var active: Bool?
        var lastReadAt: Date?
        var pendingRequest: Bool?
        var declined: Bool?
    }
    /// Gruppenunterhaltung: Titel und aktuelle Mitglieder (inkl. mir) für Namen über den Nachrichten
    struct GroupInfo: Decodable, Sendable {
        struct Member: Decodable, Sendable {
            var id: String
            var handle: String?
            var displayName: String?
            var avatarUrl: String?
            var role: String?
            var pending: Bool?
            var me: Bool?
        }
        var title: String?
        var isAdmin: Bool?
        var members: [Member]?

        private enum CodingKeys: String, CodingKey { case title, isAdmin, members }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            title = (try? c.decodeIfPresent(String.self, forKey: .title)) ?? nil
            isAdmin = (try? c.decodeIfPresent(Bool.self, forKey: .isAdmin)) ?? nil
            members = (try? c.decodeIfPresent([Member].self, forKey: .members)) ?? nil
        }

        var displayTitle: String { title?.nilIfEmpty ?? "Gruppe" }
        func member(_ id: String) -> Member? { members?.first { $0.id == id } }
    }
    var id: String
    var kind: String?
    var group: GroupInfo?
    var messages: [SocialMessage]
    var hasMore: Bool
    var me: Me
    var other: Other?
    var context: SocialThreadContext?
    var canSend: Bool
    var requestQuotaLeft: Int?
    var messagingRestrictedUntil: Date?
}

/// `GET /conversations/:id/messages?after=`
struct SocialMessagesSince: Decodable, Sendable {
    var messages: [SocialMessage]
    var otherLastReadAt: Date?
    var otherPendingRequest: Bool?
}

/// `GET /conversations/prepare`
struct SocialConversationPrep: Decodable, Sendable {
    struct Recipient: Decodable, Hashable, Sendable { var id: String; var handle: String; var displayName: String; var avatarUrl: String?; var bio: String? }
    struct Context: Decodable, Hashable, Sendable { var orderId: String?; var productId: String?; var label: String }
    var kind: String
    var recipient: Recipient?
    var conversationId: String?
    var context: Context?
    var asRequest: Bool?
    var redirectHandle: String?
    var until: Date?

    var canStart: Bool { kind == "ok" || kind == "existing" }
}

/// `POST /conversations` → `{ conversationId, asRequest }`
struct SocialConversationStarted: Decodable, Sendable { var conversationId: String; var asRequest: Bool? }

// MARK: - Suche (nur Personen)

struct SocialUserSearch: Decodable, Sendable {
    struct Hit: Decodable, Hashable, Identifiable, Sendable {
        struct Meta: Decodable, Hashable, Sendable { var bio: String?; var followers: Int? }
        var id: String
        var title: String
        var subtitle: String?
        var href: String?
        var cover: String?
        var meta: Meta?

        var handle: String {
            if let s = subtitle, s.hasPrefix("@") { return String(s.dropFirst()) }
            return href?.split(separator: "/").last.map(String.init) ?? ""
        }
    }
    struct Results: Decodable, Sendable { var user: [Hit]? }
    var results: Results?
}

// MARK: - Interne Ereignisse

extension Notification.Name {
    /// Ein Beitrag wurde erstellt, bearbeitet oder gelöscht (`object`: Beitrags-ID oder `PostItem`).
    static let socialPostsChanged = Notification.Name("werkuno.social.postsChanged")
}

// MARK: - Hilfen

enum SocialFmt {
    static func iso(_ d: Date) -> String { JSON.isoFormatter.string(from: d) }

    static func time(_ d: Date?) -> String {
        guard let d else { return "" }
        return d.formatted(Date.FormatStyle(date: .omitted, time: .shortened).locale(Fmt.locale))
    }

    static func dayLabel(_ d: Date) -> String {
        let cal = Calendar.current
        if cal.isDateInToday(d) { return "Heute" }
        if cal.isDateInYesterday(d) { return "Gestern" }
        let sameYear = cal.component(.year, from: d) == cal.component(.year, from: Date())
        var style = Date.FormatStyle.dateTime.weekday(.wide).day().month(.wide).locale(Fmt.locale)
        if !sameYear { style = style.year() }
        return d.formatted(style)
    }

    /// Lange Datumszeile für den Feed-Kopf („Donnerstag, 5. November“)
    static func longDay(_ d: Date = Date()) -> String {
        d.formatted(Date.FormatStyle.dateTime.weekday(.wide).day().month(.wide).locale(Fmt.locale))
    }

    static func greeting(_ d: Date = Date()) -> String {
        switch Calendar.current.component(.hour, from: d) {
        case 5..<11: "Guten Morgen"
        case 11..<17: "Grüezi"
        case 17..<22: "Guten Abend"
        default: "Gute Nacht"
        }
    }
}
