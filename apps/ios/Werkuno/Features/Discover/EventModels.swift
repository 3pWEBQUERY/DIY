import Foundation

// Community-Events (Treffen, Workshops, Tauschbörsen) – abgeleitet aus `GET /events`,
// `GET /events/:id`, `GET /communities/:id/events` und `server/communities/events.ts`.

enum EventKind: String, CaseIterable, Identifiable, Sendable {
    case meetup = "MEETUP", workshop = "WORKSHOP", swap = "SWAP", other = "OTHER"
    var id: String { rawValue }
    var label: String {
        switch self {
        case .meetup: "Treffen"
        case .workshop: "Workshop"
        case .swap: "Tauschbörse"
        case .other: "Sonstiges"
        }
    }
    static func label(_ raw: String?) -> String { EventKind(rawValue: raw ?? "")?.label ?? (raw ?? "") }
}

enum EventMode: String, CaseIterable, Identifiable, Sendable {
    case inPerson = "IN_PERSON", online = "ONLINE"
    var id: String { rawValue }
    var label: String { self == .online ? "Online" : "Vor Ort" }
}

/// Teilnahme-Status (`myStatus`)
enum EventAttendance: String, Sendable {
    case going = "GOING", interested = "INTERESTED"
}

/// Event-Karte (Listen)
struct CommunityEventCard: Decodable, Hashable, Identifiable, Sendable {
    struct Community: Decodable, Hashable, Sendable { var slug: String; var name: String; var coverUrl: String? }
    var id: String
    var title: String
    var kind: String
    var mode: String
    var startsAt: Date
    var endsAt: Date
    var locationName: String?
    var cancelled: Bool?
    var past: Bool?
    var goingCount: Int
    var interestedCount: Int?
    var capacity: Int?
    var full: Bool?
    var myStatus: String?
    var community: Community
    var href: String?

    var isOnline: Bool { mode == EventMode.online.rawValue }
    var isCancelled: Bool { cancelled == true }
    var isPast: Bool { past == true }
}

/// `GET /events`
struct CommunityEventsOverview: Decodable, Sendable {
    var mine: [CommunityEventCard]
    var communities: [CommunityEventCard]
    var open: [CommunityEventCard]
}

/// `GET /events/:id`
struct CommunityEventDetail: Decodable, Sendable {
    struct Person: Decodable, Hashable, Identifiable, Sendable {
        var id: String
        var handle: String?
        var displayName: String?
        var avatarUrl: String?
        var name: String { displayName?.nilIfEmpty ?? handle ?? "Unbekannt" }
    }
    var id: String
    var title: String
    var kind: String
    var mode: String
    var startsAt: Date
    var endsAt: Date
    var locationName: String?
    var cancelled: Bool?
    var past: Bool?
    var goingCount: Int
    var interestedCount: Int?
    var capacity: Int?
    var full: Bool?
    var myStatus: String?
    var community: CommunityEventCard.Community
    var href: String?
    var description: String?
    var address: String?
    var costNote: String?
    var cancelReason: String?
    var onlineUrl: String?
    var onlineUrlHidden: Bool?
    var organizer: Person
    var communityId: String
    var attendees: [Person]
    var canEdit: Bool
    var canAttend: Bool
    var isMember: Bool?

    var isOnline: Bool { mode == EventMode.online.rawValue }
    var isCancelled: Bool { cancelled == true }
    var isPast: Bool { past == true }
    var status: EventAttendance? { EventAttendance(rawValue: myStatus ?? "") }
    var spotsLeft: Int? { capacity.map { max(0, $0 - goingCount) } }
}

/// `POST /communities/:id/events`, `PATCH /events/:id` → `{ id }`
struct CommunityEventSaved: Decodable, Sendable { var id: String }

enum EventFmt {
    static func dayNumber(_ d: Date) -> String { d.formatted(Date.FormatStyle().day().locale(Fmt.locale)) }
    static func monthShort(_ d: Date) -> String { d.formatted(Date.FormatStyle().month(.abbreviated).locale(Fmt.locale)).replacingOccurrences(of: ".", with: "") }
    static func time(_ d: Date) -> String { d.formatted(Date.FormatStyle(date: .omitted, time: .shortened).locale(Fmt.locale)) }
    /// „Donnerstag, 20. November 2026“
    static func longDate(_ d: Date) -> String { d.formatted(Date.FormatStyle().weekday(.wide).day().month(.wide).year().locale(Fmt.locale)) }
    /// „Do., 20. November“
    static func shortDate(_ d: Date) -> String { d.formatted(Date.FormatStyle().weekday(.abbreviated).day().month(.wide).locale(Fmt.locale)) }

    static func sameDay(_ a: Date, _ b: Date) -> Bool { Calendar.current.isDate(a, inSameDayAs: b) }

    /// Kartenzeile: „Do., 20. November, 18:00–20:00“
    static func cardLine(_ start: Date, _ end: Date) -> String {
        "\(shortDate(start)), \(time(start))" + (sameDay(start, end) ? "–\(time(end))" : "")
    }

    /// Zeitspanne im Detail: „18:00 – 20:00 Uhr“ bzw. mit Enddatum
    static func span(_ start: Date, _ end: Date) -> String {
        sameDay(start, end) ? "\(time(start)) – \(time(end)) Uhr" : "\(time(start)) – \(longDate(end)), \(time(end)) Uhr"
    }
}
