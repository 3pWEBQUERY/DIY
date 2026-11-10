import Foundation

// Modelle für Materialseite, Preisvergleich und eigenen Bestand.
// Quelle: apps/web/src/server/mobile/routes/content.ts, server/materials/{service,offers,stock}.ts

// MARK: - Materialseite  GET /materials/:slug

struct MaterialPageResponse: Decodable, Sendable {
    var material: MaterialDetail
    var offers: [MaterialOffer]
    var projects: [ProjectCard]?
}

struct MaterialDetail: Decodable, Hashable, Identifiable, Sendable {
    struct Cat: Decodable, Hashable, Sendable { var slug: String; var name: String }
    struct Stock: Decodable, Hashable, Sendable { var id: String; var quantity: String?; var note: String? }
    struct Related: Decodable, Hashable, Identifiable, Sendable {
        var slug: String
        var name: String
        var type: String?
        var id: String { slug }
    }

    var id: String
    var slug: String
    var name: String
    var type: String?
    var unit: String?
    var brand: String?
    var productRef: String?
    var notes: String?
    var safetyInfo: String?
    var properties: [String: JSONValue]?
    var category: Cat?
    var usedIn: Int?
    var stock: Stock?
    var related: [Related]?
}

/// Bezugsquelle – bereits sortiert (günstigster Preis je Einheit zuerst). `href` = `/go/:id`.
struct MaterialOffer: Decodable, Hashable, Identifiable, Sendable {
    struct PerUnit: Decodable, Hashable, Sendable { var minor: Int; var label: String }
    var id: String
    var retailer: String
    var title: String?
    var priceMinor: Int
    var currency: String?
    var packLabel: String?
    var isAffiliate: Bool
    var checkedAt: Date?
    var stale: Bool?
    var perUnit: PerUnit?
    var href: String
}

/// PUT /materials/:id/stock → `{ have, id }`
struct MaterialStockToggleResult: Decodable, Sendable { var have: Bool; var id: String? }

// MARK: - Eigener Bestand  GET /me/material-stock

struct MaterialStockEntry: Decodable, Hashable, Identifiable, Sendable {
    struct Cat: Decodable, Hashable, Sendable { var slug: String; var name: String }
    var id: String
    var materialId: String?
    var name: String
    var quantity: String?
    var note: String?
    var updatedAt: Date?
    var slug: String?
    var unit: String?
    var type: String?
    var category: Cat?

    static let ownGroup = "Eigene Einträge"
    var groupName: String { category?.name ?? Self.ownGroup }
}

struct MaterialCreated: Decodable, Sendable { var id: String }

/// Abgleich einer Materialliste mit dem Bestand (über `materialId` bzw. freien Namen ohne Gross-/Kleinschreibung).
struct MaterialStockIndex: Hashable, Sendable {
    var ids: Set<String> = []
    var names: Set<String> = []

    init(_ entries: [MaterialStockEntry] = []) {
        for e in entries {
            if let m = e.materialId { ids.insert(m) } else { names.insert(Self.key(e.name)) }
        }
    }

    static func key(_ name: String) -> String { name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }

    func has(materialId: String?, name: String) -> Bool {
        if let materialId { return ids.contains(materialId) }
        return names.contains(Self.key(name))
    }
}
