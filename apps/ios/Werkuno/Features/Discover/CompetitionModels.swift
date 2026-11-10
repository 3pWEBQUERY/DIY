import Foundation

// Wettbewerbe in Communities – abgeleitet aus `GET /competitions`, `GET /competitions/:id`,
// `GET /competitions/:id/project-options` und `server/communities/competitions.ts`.

enum CompetitionPhase: String, Decodable, Sendable {
    case upcoming, open, voting, jury, ended

    var label: String {
        switch self {
        case .upcoming: "Startet bald"
        case .open: "Einreichung läuft"
        case .voting: "Abstimmung läuft"
        case .jury: "Jury entscheidet"
        case .ended: "Beendet"
        }
    }

    var symbol: String {
        switch self {
        case .upcoming: "calendar"
        case .open: "tray.and.arrow.down"
        case .voting: "hand.raised"
        case .jury: "person.3"
        case .ended: "trophy"
        }
    }

    var isRunning: Bool { self == .open || self == .voting || self == .jury }

    /// Wie `competitionPhase()` im Web
    static func compute(startsAt: Date?, endsAt: Date?, votingEndsAt: Date?, resultsAt: Date?, judging: String?, now: Date = Date()) -> CompetitionPhase {
        if let r = resultsAt, r <= now { return .ended }
        if let s = startsAt, now < s { return .upcoming }
        if let e = endsAt, now < e { return .open }
        if judging == "VOTES" || judging == nil {
            if let v = votingEndsAt, now < v { return .voting }
            return .ended
        }
        return .jury
    }
}

enum CompetitionRules {
    /// `CHALLENGE_VOTES_PER_PERSON`
    static let votesPerPerson = 3
    static let noteMax = 500
}

/// Eintrag der Übersicht `GET /competitions`
struct CompetitionSummary: Decodable, Hashable, Identifiable, Sendable {
    struct Community: Decodable, Hashable, Sendable { var slug: String; var name: String; var coverUrl: String? }
    var id: String
    var communityId: String?
    var title: String
    var description: String?
    var rules: String?
    var prize: String?
    var judging: String?
    var startsAt: Date?
    var endsAt: Date?
    var votingEndsAt: Date?
    var resultsAt: Date?
    var entryCount: Int?
    var community: Community
    var phase: CompetitionPhase?
    var member: Bool?

    var currentPhase: CompetitionPhase { phase ?? .compute(startsAt: startsAt, endsAt: endsAt, votingEndsAt: votingEndsAt, resultsAt: resultsAt, judging: judging) }
}

/// `GET /competitions/:id`
struct CompetitionDetail: Decodable, Sendable {
    struct Community: Decodable, Hashable, Sendable { var id: String; var slug: String; var name: String }
    struct Viewer: Decodable, Sendable {
        struct MyEntry: Decodable, Hashable, Sendable { var id: String; var projectId: String; var note: String? }
        var isMember: Bool
        var isMod: Bool
        var myEntry: MyEntry?
        var myVotes: [String]
        var votesLeft: Int?
    }
    var id: String
    var title: String
    var description: String?
    var rules: String?
    var prize: String?
    var judging: String
    var startsAt: Date
    var endsAt: Date
    var votingEndsAt: Date?
    var resultsAt: Date?
    var phase: CompetitionPhase
    var community: Community
    var entries: [CompetitionEntry]
    var viewer: Viewer

    var isVotes: Bool { judging == "VOTES" }
    var winners: [CompetitionEntry] {
        guard phase == .ended else { return [] }
        return entries.filter { $0.place != nil }.sorted { ($0.place ?? 9) < ($1.place ?? 9) }
    }
}

struct CompetitionEntry: Decodable, Hashable, Identifiable, Sendable {
    var id: String
    var userId: String
    var note: String?
    var place: Int?
    var votes: Int?
    var project: ProjectCard?
    var mine: Bool?

    var isMine: Bool { mine == true }
}

/// `GET /competitions/:id/project-options`
struct CompetitionProjectOption: Decodable, Hashable, Identifiable, Sendable {
    var id: String
    var title: String
    var coverUrl: String?
}

/// `POST /competitions/:id/entry` → `{ replaced }`
struct CompetitionEntrySubmitted: Decodable, Sendable { var replaced: Bool? }

/// `POST /competition-entries/:id/vote` → `{ voted, votesLeft }`
struct CompetitionVoteResult: Decodable, Sendable { var voted: Bool?; var votesLeft: Int? }

enum CompetitionFmt {
    static func day(_ d: Date?) -> String {
        guard let d else { return "" }
        return d.formatted(Date.FormatStyle.dateTime.day().month(.wide).locale(Fmt.locale))
    }

    static func daysUntil(_ d: Date?) -> Int {
        guard let d else { return 0 }
        return max(0, Int(ceil(d.timeIntervalSinceNow / 86400)))
    }

    /// Fristzeile wie im Web („Einreichung bis 2. Dezember · noch 23 Tage“)
    static func deadline(phase: CompetitionPhase, startsAt: Date?, endsAt: Date?, votingEndsAt: Date?, resultsAt: Date?) -> String {
        switch phase {
        case .upcoming: return "Start am \(day(startsAt))"
        case .open: return "Einreichung bis \(day(endsAt)) · noch \(Fmt.plural(daysUntil(endsAt), "Tag", "Tage"))"
        case .voting:
            if let v = votingEndsAt { return "Abstimmung bis \(day(v)) · noch \(Fmt.plural(daysUntil(v), "Tag", "Tage"))" }
            return "Abstimmung läuft"
        case .jury: return "Die Jury wählt die Gewinner:innen"
        case .ended: return resultsAt.map { "Ergebnis vom \(day($0))" } ?? "Beendet"
        }
    }

    /// Kurzstatus für Banner auf der Community-Seite
    static func bannerStatus(phase: CompetitionPhase, startsAt: Date?, endsAt: Date?, votingEndsAt: Date?) -> String {
        switch phase {
        case .upcoming: "Wettbewerb ab \(day(startsAt))"
        case .open: "Wettbewerb · Einreichung noch \(Fmt.plural(daysUntil(endsAt), "Tag", "Tage"))"
        case .voting: "Wettbewerb · Abstimmung noch \(Fmt.plural(daysUntil(votingEndsAt), "Tag", "Tage"))"
        case .jury: "Wettbewerb · Die Jury entscheidet"
        case .ended: "Wettbewerb · Ergebnis ist da"
        }
    }

    static func cta(_ phase: CompetitionPhase) -> String {
        switch phase {
        case .open: "Mitmachen"
        case .voting: "Abstimmen"
        case .ended: "Ergebnis ansehen"
        default: "Ansehen"
        }
    }
}
