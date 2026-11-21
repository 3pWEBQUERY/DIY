import SwiftUI

// Modelle und API der Stories (Foto, Video oder Text – 24 Stunden im Story-Kreis).
// Abgeleitet aus apps/web/src/server/stories/service.ts, highlights.ts und den Mobile-Routen
// in apps/web/src/server/mobile/routes/stories.ts. Palette und Zeiten spiegeln
// packages/shared/src/stories.ts.

// MARK: - Regeln (wie packages/shared/src/stories.ts)

enum StoryRules {
    static let videoMaxSeconds: Double = 60
    static let textMax = 500
    static let captionMax = 300
    static let highlightTitleMax = 30
}

/// Hintergründe für Text-Stories – fest (nicht hell/dunkel umschaltend), damit eine Story für alle gleich aussieht.
enum StoryBackground: String, CaseIterable, Identifiable, Codable, Sendable {
    case coral, ink, paper, rose, ochre, sage, slate, plum
    var id: String { rawValue }

    var label: String {
        switch self {
        case .coral: "Koralle"
        case .ink: "Tinte"
        case .paper: "Papier"
        case .rose: "Rosé"
        case .ochre: "Ocker"
        case .sage: "Salbei"
        case .slate: "Schiefer"
        case .plum: "Pflaume"
        }
    }

    var background: Color {
        switch self {
        case .coral: Color(hex: 0xB64B3A)
        case .ink: Color(hex: 0x262427)
        case .paper: Color(hex: 0xF3EFEB)
        case .rose: Color(hex: 0xF6E5E0)
        case .ochre: Color(hex: 0xC29A3E)
        case .sage: Color(hex: 0x4F7A55)
        case .slate: Color(hex: 0x4F6475)
        case .plum: Color(hex: 0x6E4E64)
        }
    }

    var foreground: Color {
        switch self {
        case .coral, .sage, .slate, .plum: .white
        case .ink: Color(hex: 0xFAF8F5)
        case .paper, .ochre: Color(hex: 0x262427)
        case .rose: Color(hex: 0x973B2C)
        }
    }

    static func from(_ raw: String?) -> StoryBackground { raw.flatMap(StoryBackground.init(rawValue:)) ?? .coral }
}

extension Color {
    /// Feste Farbe aus Hex (für Story-Inhalte, die in beiden Modi gleich aussehen)
    init(hex: UInt32) { self.init(uiColor: UIColor(hex: hex)) }

    /// `#RRGGBB` (z. B. dominante Bildfarbe vom Server)
    init?(hexString: String?) {
        guard let s = hexString?.trimmingCharacters(in: CharacterSet(charactersIn: "#")), s.count == 6, let v = UInt32(s, radix: 16) else { return nil }
        self.init(hex: v)
    }
}

enum StoryAudience: String, CaseIterable, Identifiable, Sendable {
    case `public` = "PUBLIC"
    case followers = "FOLLOWERS"
    var id: String { rawValue }
    var label: String { self == .public ? "Alle" : "Nur Follower" }
    var symbol: String { self == .public ? "globe.europe.africa" : "person.2" }
}

// MARK: - Personen & Story-Kreis

struct StoryAuthor: Codable, Hashable, Identifiable, Sendable {
    var id: String
    var handle: String
    var displayName: String
    var avatarUrl: String?
}

/// `GET /stories/tray`
struct StoryTray: Decodable, Sendable {
    struct Own: Decodable, Hashable, Sendable {
        var author: StoryAuthor
        var count: Int
        var processing: Int?
        var latestAt: Date?
        var coverThumb: String?
    }
    struct Entry: Decodable, Hashable, Identifiable, Sendable {
        var author: StoryAuthor
        var count: Int
        var unseen: Int
        var latestAt: Date?
        var coverThumb: String?
        var id: String { author.id }
    }
    var enabled: Bool
    var own: Own?
    var items: [Entry]

    static let empty = StoryTray(enabled: false, own: nil, items: [])
}

// MARK: - Story

struct StoryItem: Decodable, Hashable, Identifiable, Sendable {
    struct Media: Decodable, Hashable, Sendable {
        var kind: String
        var state: String
        var image: String?
        var video: String?
        var poster: String?
        var thumb: String?
        var width: Int?
        var height: Int?
        var durationMs: Int?
        var dominant: String?
        var error: String?

        var isVideo: Bool { kind == "VIDEO" }
        var isReady: Bool { state == "READY" }
        /// Fast hochformatige Bilder füllen die Bühne, andere stehen vollständig auf ihrer Grundfarbe
        var fills: Bool {
            guard let w = width, let h = height, h > 0 else { return true }
            let r = Double(w) / Double(h)
            return r > 0.5 && r < 0.66
        }
    }
    struct ProjectLink: Decodable, Hashable, Sendable {
        var id: String
        var slug: String
        var title: String
        var coverUrl: String?
        var handle: String
    }
    struct ViewerState: Decodable, Hashable, Sendable {
        var own: Bool
        var seen: Bool
        var liked: Bool
    }
    struct Stats: Decodable, Hashable, Sendable { var views: Int; var likes: Int }

    var id: String
    var kind: String
    var text: String
    var background: String?
    var alt: String?
    var visibility: String
    var state: String?
    var createdAt: Date
    var expiresAt: Date
    var expired: Bool
    var durationSec: Double
    var media: Media?
    var project: ProjectLink?
    var viewer: ViewerState
    var stats: Stats?
    /// Nur im Archiv
    var highlightIds: [String]?
    /// Gestaltung (Story-Editor): Ebenen, Filter, Textstil
    var layout: StoryLayoutData?

    var isText: Bool { kind == "TEXT" }
    var isVideo: Bool { media?.isVideo == true }
    var isFollowersOnly: Bool { visibility == "FOLLOWERS" }
    var isHidden: Bool { state == "HIDDEN" }
    var thumbURL: String? { media?.thumb ?? media?.poster ?? media?.image }
}

/// Personen-Stories bzw. ein Highlight im Betrachter (`mode`: stories | highlight)
struct StoryGroup: Decodable, Hashable, Identifiable, Sendable {
    var key: String
    var mode: String
    var title: String?
    var author: StoryAuthor
    var items: [StoryItem]
    var startIndex: Int
    var id: String { key }
    var isHighlight: Bool { mode == "highlight" }
}

/// `GET /stories/viewer/:handle`
struct StoryViewerStart: Decodable, Sendable {
    var sequence: [String]
    var group: StoryGroup
}

/// `GET /stories/:id/viewers`
struct StoryViewers: Decodable, Sendable {
    struct Viewer: Decodable, Hashable, Identifiable, Sendable {
        var id: String
        var handle: String
        var displayName: String
        var avatarUrl: String?
        var viewedAt: Date
        var liked: Bool
        var following: Bool?
    }
    var views: Int
    var likes: Int
    var viewers: [Viewer]
}

// MARK: - Highlights

struct StoryCover: Decodable, Hashable, Sendable {
    var thumb: String?
    var background: String?
    var text: String?
}

/// Highlight auf einem Profil
struct StoryHighlightSummary: Decodable, Hashable, Identifiable, Sendable {
    var id: String
    var title: String
    var count: Int
    var cover: StoryCover
}

/// Eigenes Highlight (Auswahl „Zu Highlight hinzufügen“)
struct StoryOwnHighlight: Decodable, Hashable, Identifiable, Sendable {
    var id: String
    var title: String
    var count: Int
    var contains: Bool
    var storyIds: [String]
    var coverStoryId: String?
    var cover: StoryCover
}

/// Zusatzfelder in `GET /users/:handle` (Ring am Profilbild, Highlights, Stories ausgeblendet)
struct StoryProfileExtras: Decodable, Sendable {
    struct Ring: Decodable, Hashable, Sendable { var active: Bool; var unseen: Bool }
    struct ViewerFlags: Decodable, Hashable, Sendable { var storiesMuted: Bool? }
    var stories: Ring? = nil
    var highlights: [StoryHighlightSummary]? = nil
    var viewer: ViewerFlags? = nil
}

/// Story-Bezug einer Nachricht (Antwort auf eine Story)
struct StoryRef: Codable, Hashable, Sendable {
    var id: String
    var available: Bool
    var ownerHandle: String?
    var kind: String
    var thumb: String?
    var background: String?
    var text: String?
}

// MARK: - API

enum StoryAPI {
    struct Created: Decodable { var id: String }
    struct ReplyResult: Decodable { var conversationId: String; var asRequest: Bool? }
    struct HighlightResult: Decodable { var highlightId: String }
    struct Removed: Decodable { var deleted: Bool? }

    static func tray() async throws -> StoryTray { try await APIClient.shared.get("/stories/tray") }

    static func start(handle: String, focus: String? = nil) async throws -> StoryViewerStart {
        try await APIClient.shared.get("/stories/viewer/\(handle.lowercased())", query: ["story": focus])
    }

    static func group(handle: String) async throws -> StoryGroup { try await APIClient.shared.get("/stories/u/\(handle.lowercased())") }
    static func highlight(_ id: String) async throws -> StoryGroup { try await APIClient.shared.get("/highlights/\(id)") }

    static func createMedia(mediaId: String, alt: String, caption: String, audience: StoryAudience, projectId: String?, layout: StoryLayoutData? = nil) async throws -> Created {
        var body: [String: JSONValue] = [
            "kind": .string("MEDIA"),
            "media": .object(["id": .string(mediaId), "alt": .string(alt)]),
            "text": .string(caption),
            "visibility": .string(audience.rawValue),
            "projectId": .from(projectId),
        ]
        if let layout, !layout.isEmpty(text: false) { body["layout"] = layout.json(text: false) }
        return try await APIClient.shared.post("/stories", body.filter { $0.value != .null })
    }

    static func createText(_ text: String, background: StoryBackground, audience: StoryAudience, projectId: String?, layout: StoryLayoutData? = nil) async throws -> Created {
        var body: [String: JSONValue] = [
            "kind": .string("TEXT"),
            "text": .string(text),
            "background": .string(background.rawValue),
            "visibility": .string(audience.rawValue),
            "projectId": .from(projectId),
        ]
        if let layout, !layout.isEmpty(text: true) { body["layout"] = layout.json(text: true) }
        return try await APIClient.shared.post("/stories", body.filter { $0.value != .null })
    }

    struct MentionSuggestion: Decodable, Hashable, Identifiable, Sendable {
        var handle: String
        var displayName: String
        var avatarUrl: String?
        var id: String { handle }
    }
    struct MentionSuggestions: Decodable { var items: [MentionSuggestion] }
    /// Story-Editor: Personen für den @Erwähnung-Sticker
    static func mentionSuggestions(_ q: String) async throws -> [MentionSuggestion] {
        let r: MentionSuggestions = try await APIClient.shared.get("/stories/mention-suggest", query: ["q": q])
        return r.items
    }

    static func seen(_ id: String) async { _ = try? await APIClient.shared.action("POST", "/stories/\(id)/seen") }
    static func like(_ id: String, _ liked: Bool) async throws { try await APIClient.shared.action("POST", "/stories/\(id)/like", ["liked": .bool(liked)]) }
    static func reply(_ id: String, _ body: String) async throws -> ReplyResult { try await APIClient.shared.post("/stories/\(id)/reply", ["body": body]) }
    static func viewers(_ id: String) async throws -> StoryViewers { try await APIClient.shared.get("/stories/\(id)/viewers") }
    static func delete(_ id: String) async throws { try await APIClient.shared.action("DELETE", "/stories/\(id)") }
    static func archive(cursor: String?) async throws -> Page<StoryItem> { try await APIClient.shared.get("/stories/archive", query: ["cursor": cursor]) }
    static func muteStories(of userId: String, _ muted: Bool) async throws { try await APIClient.shared.action("POST", "/users/\(userId)/story-mute", ["muted": .bool(muted)]) }

    static func myHighlights(storyId: String? = nil) async throws -> [StoryOwnHighlight] { try await APIClient.shared.get("/highlights/mine", query: ["storyId": storyId]) }
    static func addToHighlight(storyId: String, highlightId: String? = nil, title: String? = nil) async throws -> HighlightResult {
        try await APIClient.shared.post("/highlights/add", ["storyId": JSONValue.string(storyId), "highlightId": .from(highlightId), "title": .from(title)].filter { $0.value != .null })
    }
    static func removeFromHighlight(_ highlightId: String, storyId: String) async throws -> Removed { try await APIClient.shared.delete("/highlights/\(highlightId)/stories/\(storyId)") }
    static func createHighlight(title: String, storyIds: [String]) async throws -> Created {
        try await APIClient.shared.post("/highlights", ["title": JSONValue.string(title), "storyIds": .from(storyIds)])
    }
    static func updateHighlight(_ id: String, title: String? = nil, storyIds: [String]? = nil, coverStoryId: String?? = nil) async throws {
        var body: [String: JSONValue] = [:]
        if let title { body["title"] = .string(title) }
        if let storyIds { body["storyIds"] = .from(storyIds) }
        if let coverStoryId { body["coverStoryId"] = .from(coverStoryId) }
        try await APIClient.shared.action("PATCH", "/highlights/\(id)", body)
    }
    static func deleteHighlight(_ id: String) async throws { try await APIClient.shared.action("DELETE", "/highlights/\(id)") }
}

extension Notification.Name {
    /// Stories haben sich geändert (neue Story, gesehen, gelöscht) → Story-Kreis und Profilring neu laden
    static let storiesChanged = Notification.Name("werkuno.storiesChanged")
}

// MARK: - Darstellung

enum StoryFmt {
    /// „jetzt“, „12 Min.“, „3 Std.“ – Story-Alter knapp
    static func age(_ date: Date, now: Date = .now) -> String {
        let s = max(0, now.timeIntervalSince(date))
        if s < 60 { return "jetzt" }
        if s < 3600 { return "\(Int(s / 60)) Min." }
        if s < 86_400 { return "\(Int(s / 3600)) Std." }
        return date.formatted(.dateTime.day().month(.abbreviated).locale(Locale(identifier: "de-CH")))
    }

    static func remaining(_ until: Date, now: Date = .now) -> String {
        let h = until.timeIntervalSince(now) / 3600
        return h >= 1 ? "noch \(Int(h)) Std." : "noch \(max(1, Int((h * 60).rounded()))) Min."
    }

    /// Schriftgrösse einer Text-Story relativ zur Bühnenbreite (wie im Web, cqw)
    static func textScale(_ text: String) -> CGFloat {
        switch text.count {
        case ...40: 0.086
        case ...110: 0.068
        case ...220: 0.054
        case ...360: 0.046
        default: 0.041
        }
    }
}
