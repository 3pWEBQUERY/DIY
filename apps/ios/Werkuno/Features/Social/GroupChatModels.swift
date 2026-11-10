import Foundation

// Gruppenchats (bis 25 Personen) – abgeleitet aus `GET /conversations/:id` (Feld `group`),
// `GET /conversations/groups/candidates` und `server/messaging/groups.ts`.

enum SocialGroupLimits {
    /// Höchstens 25 Personen inkl. Ersteller:in (`GROUP_MAX_MEMBERS`)
    static let maxMembers = 25
    static let titleMax = 60
}

/// `thread.group`
struct SocialGroup: Decodable, Hashable, Sendable {
    var title: String
    var isAdmin: Bool
    var members: [SocialGroupMember]

    var activeMembers: [SocialGroupMember] { members.filter { !$0.isPending } }
    var others: [SocialGroupMember] { members.filter { !$0.isMe } }

    /// Admins zuerst, dann aktive vor eingeladenen, dann alphabetisch
    var sortedMembers: [SocialGroupMember] {
        members.sorted {
            if $0.isAdmin != $1.isAdmin { return $0.isAdmin }
            if $0.isPending != $1.isPending { return !$0.isPending }
            return $0.displayName.localizedCompare($1.displayName) == .orderedAscending
        }
    }
}

struct SocialGroupMember: Decodable, Hashable, Identifiable, Sendable {
    var id: String
    var handle: String
    var displayName: String
    var avatarUrl: String?
    var role: String?
    var pending: Bool?
    var me: Bool?

    var isAdmin: Bool { role == "ADMIN" }
    var isPending: Bool { pending == true }
    var isMe: Bool { me == true }
    var firstName: String { displayName.split(separator: " ").first.map(String.init) ?? displayName }
}

/// `GET /conversations/groups/candidates` – Personen, denen ich folge
struct SocialGroupCandidate: Decodable, Hashable, Identifiable, Sendable {
    var id: String
    var handle: String
    var displayName: String
    var avatarUrl: String?
}

/// `POST /conversations/groups` → `{ conversationId, invited }`
struct SocialGroupCreated: Decodable, Sendable {
    var conversationId: String
    var invited: [String]?
}

/// `POST /conversations/:id/members` → `{ added, invited }`
struct SocialGroupMembersAdded: Decodable, Sendable {
    var added: [String]?
    var invited: [String]?
}

/// `POST /conversations/:id/leave` → `{ left, dissolved }`
struct SocialGroupLeft: Decodable, Sendable {
    var left: Bool?
    var dissolved: Bool?
}

enum SocialGroupText {
    /// „Lena, Mattia und Clara“
    static func list(_ names: [String]) -> String {
        guard names.count > 1 else { return names.joined() }
        return names.dropLast().joined(separator: ", ") + " und " + (names.last ?? "")
    }

    /// Rückmeldung nach dem Hinzufügen/Erstellen
    static func addedMessage(added: [String], invited: [String]) -> String {
        var parts: [String] = []
        if !added.isEmpty { parts.append("\(list(added)) hinzugefügt.") }
        if !invited.isEmpty { parts.append("\(list(invited)) \(invited.count > 1 ? "erhalten" : "erhält") eine Einladung, weil sie dir nicht folgen.") }
        return parts.isEmpty ? "Gespeichert." : parts.joined(separator: " ")
    }
}
