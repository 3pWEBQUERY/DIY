import Foundation

// Modelle des Bereichs „Projekte & Anleitungen“ – abgeleitet aus
// fixtures/project_page*.json, project_edit.json, tutorial_page.json, tutorial_edit.json
// sowie werkraum-web/apps/web/src/server/{projects,tutorials}/service.ts.

// MARK: - Projektseite  GET /projects/by/:handle/:slug

/// `{ kind: "ok", project }` bzw. `{ kind: "redirect", to }`
struct ProjectPageEnvelope: Decodable, Sendable {
    var kind: String
    var to: String?
    var project: ProjectPage?
}

struct ProjectPage: Decodable, Hashable, Sendable {
    struct Contributor: Decodable, Hashable, Sendable {
        var handle: String
        var displayName: String
        var avatarUrl: String?
        var role: String?
    }

    struct Line: Decodable, Hashable, Identifiable, Sendable {
        var id: String
        var name: String
        var quantity: String?
        var note: String?
        var materialId: String?
        var materialSlug: String?
        var unit: String?
        var safetyInfo: String?
    }

    struct LinkedTutorial: Decodable, Hashable, Identifiable, Sendable {
        var id: String
        var slug: String
        var title: String
        var summary: String?
        var state: String?
        var difficulty: Int?
        var minutes: Int?
        var coverUrl: String?
        var category: String?
        var version: Int?
        var steps: Int?
        var publishedAt: Date?
    }

    struct LinkedProduct: Decodable, Hashable, Identifiable, Sendable {
        var id: String
        var title: String
        var kind: String?
        var priceMinor: Int?
        var currency: String?
        var coverUrl: String?
        var soldOut: Bool?
        var href: String?
        var shopName: String?
    }

    struct LinkedArticle: Decodable, Hashable, Identifiable, Sendable {
        var id: String
        var title: String
        var dek: String?
        var coverUrl: String?
        var readingMinutes: Int?
        var href: String?
        var authorName: String?
    }

    struct LinkedPost: Decodable, Hashable, Identifiable, Sendable {
        var id: String
        var excerpt: String?
        var kind: String?
        var publishedAt: Date?
    }

    struct RemixOrigin: Decodable, Hashable, Sendable {
        var id: String
        var title: String
        var href: String?
        var ownerName: String?
        var coverUrl: String?
        var category: String?
        var deviations: String?
    }

    struct Viewer: Decodable, Hashable, Sendable {
        var liked: Bool?
        var saved: Bool?
        var followingProject: Bool?
        var followingOwner: Bool?
        var isOwner: Bool?
    }

    var id: String
    var slug: String
    var href: String?
    var title: String
    var description: String?
    var category: String
    var tags: [String]?
    var coverUrl: String?
    var gallery: [MediaItem]?
    var difficulty: Int?
    var estimatedMinutes: Int?
    var actualMinutes: Int?
    var journalMinutes: Int?
    var budgetMinor: Int?
    var currency: String?
    var status: String
    var visibility: String?
    var state: String?
    var publishedAt: Date?
    var createdAt: Date?
    var updatedAt: Date?
    var completedAt: Date?
    var counts: Counts?
    var owner: UserMini
    var contributors: [Contributor]?
    var materials: [Line]?
    var tools: [Line]?
    var journal: [ProjectJournalEntry]
    var tutorials: [LinkedTutorial]?
    var products: [LinkedProduct]?
    var articles: [LinkedArticle]?
    var posts: [LinkedPost]?
    var remixOf: RemixOrigin?
    var remixOfUnavailable: Bool?
    var remixNote: String?
    var remixes: [ProjectRemix]?
    var comments: [CommentItem]?
    var viewer: Viewer?

    var isOwner: Bool { viewer?.isOwner ?? false }
    var galleryItems: [MediaItem] { gallery ?? [] }
}

struct ProjectJournalEntry: Decodable, Hashable, Identifiable, Sendable {
    struct Media: Decodable, Hashable, Sendable {
        var mediaId: String
        var url: String?
        var alt: String?
        var asItem: MediaItem { MediaItem(id: mediaId, alt: alt, url: url) }
    }
    struct Author: Decodable, Hashable, Sendable {
        var id: String
        var handle: String?
        var displayName: String?
        var avatarUrl: String?
    }

    var id: String
    var body: String
    var milestone: String?
    var problem: String?
    var solution: String?
    var minutes: Int?
    var media: [Media]?
    var happenedAt: Date?
    var postId: String?
    var author: Author?
    var canDelete: Bool?

    /// Knotenart für die 3D-Szene `journal`
    var nodeKind: String {
        if milestone?.nilIfEmpty != nil { return "milestone" }
        if problem?.nilIfEmpty != nil { return "problem" }
        return "entry"
    }
}

/// Nachbau = Projektkarte + Abweichungen
struct ProjectRemix: Decodable, Hashable, Identifiable, Sendable {
    var card: ProjectCard
    var deviations: String?
    var remixedAt: Date?
    var id: String { card.id }

    private enum K: String, CodingKey { case deviations, remixedAt }
    init(from decoder: Decoder) throws {
        card = try ProjectCard(from: decoder)
        let c = try decoder.container(keyedBy: K.self)
        deviations = try c.decodeIfPresent(String.self, forKey: .deviations)
        remixedAt = try c.decodeIfPresent(Date.self, forKey: .remixedAt)
    }
}

// MARK: - Projekt-Editor

/// Material-/Werkzeugzeile (Schema `materialLineSchema`)
struct ProjectsLineValue: Codable, Hashable, Sendable {
    var name: String
    var quantity: String?
    var note: String?
    var materialId: String?
}

/// GET /projects/by/:handle/:slug/edit
struct ProjectEditData: Decodable, Sendable {
    struct Values: Decodable, Sendable {
        struct Media: Decodable, Sendable { var id: String; var alt: String?; var preview: String?; var kind: String? }
        var title: String
        var description: String?
        var category: String
        var tags: [String]?
        var status: String?
        var visibility: String?
        var difficulty: Int?
        var estimatedMinutes: Int?
        var actualMinutes: Int?
        var budgetMinor: Int?
        var coverMediaId: String?
        var media: [Media]?
        var materials: [ProjectsLineValue]?
        var tools: [ProjectsLineValue]?
        var remixNote: String?
    }
    struct RemixRef: Decodable, Sendable { var id: String; var title: String; var href: String?; var ownerName: String? }
    var id: String?
    var slug: String?
    var href: String?
    var values: Values?
    var remixOf: RemixRef?
}

/// GET /projects/remix-source/:id
struct ProjectRemixSource: Decodable, Sendable {
    var id: String
    var title: String
    var category: String
    var difficulty: Int?
    var coverUrl: String?
    var href: String?
    var ownerName: String?
    var materials: [ProjectsLineValue]?
    var tools: [ProjectsLineValue]?
}

/// POST /projects, PUT /projects/:id
struct ProjectSaveResult: Decodable, Sendable { var id: String; var slug: String; var href: String? }

/// GET /materials?q=
struct ProjectsMaterialHit: Decodable, Hashable, Identifiable, Sendable {
    var id: String
    var name: String
    var unit: String?
    var type: String?
    var brand: String?
    var category: String?
}

// MARK: - Anleitung  GET /tutorials/by-slug/:slug

struct TutorialPage: Decodable, Hashable, Sendable {
    struct Version: Decodable, Hashable, Sendable {
        var number: Int
        var changeNote: String?
        var isMajor: Bool?
        var publishedAt: Date?
    }
    struct VersionRow: Decodable, Hashable, Identifiable, Sendable {
        var version: Int
        var changeNote: String?
        var isMajor: Bool?
        var publishedAt: Date?
        var id: Int { version }
    }
    struct ProjectRef: Decodable, Hashable, Sendable {
        var id: String
        var title: String
        var status: String?
        var coverUrl: String?
        var category: String?
        var href: String?
        var ownerName: String?
    }
    struct Viewer: Decodable, Hashable, Sendable {
        var isOwner: Bool?
        var signedIn: Bool?
        var liked: Bool?
        var saved: Bool?
        var followingAuthor: Bool?
        var completedKeys: [String]?
        var completedAt: Date?
        var versionSeen: Int?
        var hasProgress: Bool?
    }

    var id: String
    var slug: String
    var href: String?
    var title: String
    var summary: String?
    var category: String
    var difficulty: Int?
    var minutes: Int?
    var coverUrl: String?
    var state: String?
    var safetyKinds: [String]?
    var counts: Counts?
    var publishedAt: Date?
    var updatedAt: Date?
    var preview: Bool?
    var version: Version?
    var versions: [VersionRow]?
    var materials: [ProjectsLineValue]?
    var tools: [ProjectsLineValue]?
    var steps: [TutorialPageStep]
    var author: UserMini
    var project: ProjectRef?
    var products: [ProjectPage.LinkedProduct]?
    var comments: [CommentItem]?
    var viewer: Viewer?

    var isOwner: Bool { viewer?.isOwner ?? false }
    var totalStepMinutes: Int { steps.reduce(0) { $0 + ($1.minutes ?? 0) } }
}

struct TutorialPageStep: Decodable, Hashable, Identifiable, Sendable {
    struct Media: Decodable, Hashable, Sendable {
        var mediaId: String
        var url: String?
        var alt: String?
        var asItem: MediaItem { MediaItem(id: mediaId, alt: alt, url: url) }
    }
    var id: String
    var stableKey: String
    var position: Int
    var title: String
    var body: String?
    var minutes: Int?
    var tip: String?
    var safety: String?
    var safetyKinds: [String]?
    var media: [Media]?
    var materials: [String]?
    var tools: [String]?
}

/// POST /tutorials/:id/steps/:key
struct TutorialProgressResult: Decodable, Sendable { var completedKeys: [String]; var total: Int? }

// MARK: - Anleitungs-Editor

struct TutorialEditValues: Decodable, Sendable {
    struct MediaRefValue: Decodable, Sendable { var id: String; var alt: String?; var preview: String? }
    struct Step: Decodable, Sendable {
        var stableKey: String?
        var title: String
        var body: String?
        var minutes: Int?
        var tip: String?
        var safety: String?
        var safetyKinds: [String]?
        var media: [MediaRefValue]?
        var materials: [String]?
        var tools: [String]?
    }
    var title: String
    var summary: String?
    var category: String
    var difficulty: Int?
    var minutes: Int?
    var projectId: String?
    var language: String?
    var cover: MediaRefValue?
    var materials: [ProjectsLineValue]?
    var tools: [ProjectsLineValue]?
    var steps: [Step]?
}

/// GET /tutorials/:id/edit
struct TutorialEditData: Decodable, Sendable {
    var id: String?
    var slug: String?
    var state: String?
    var currentVersion: Int?
    var values: TutorialEditValues?
    var projectOptions: [IdTitle]?
}

/// POST /tutorials, PUT /tutorials/:id
struct TutorialSaveResult: Decodable, Sendable { var id: String; var slug: String; var version: Int?; var href: String? }

// MARK: - Hilfen

enum ProjectsSorts {
    static let projects: [(key: String, label: String)] = [("new", "Neu"), ("popular", "Beliebt"), ("completed", "Abgeschlossen"), ("updated", "Zuletzt aktiv")]
    static let tutorials: [(key: String, label: String)] = [("new", "Neu"), ("popular", "Beliebt"), ("updated", "Aktualisiert")]

    /// Web-Parameter („beliebt“) oder API-Wert („popular“) → API-Wert
    static func normalize(_ s: String?) -> String {
        switch s?.lowercased() {
        case "popular", "beliebt": "popular"
        case "completed", "abgeschlossen": "completed"
        case "updated", "aktualisiert", "aktiv": "updated"
        default: "new"
        }
    }
}

extension Array where Element == ProjectsLineValue {
    var json: JSONValue {
        .array(map { l in
            var o: [String: JSONValue] = ["name": .string(l.name.trimmed), "quantity": .string((l.quantity ?? "").trimmed), "note": .string((l.note ?? "").trimmed)]
            if let m = l.materialId?.nilIfEmpty { o["materialId"] = .string(m) }
            return .object(o)
        })
    }
}
