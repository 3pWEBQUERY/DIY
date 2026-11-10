import Foundation

// Modelle des Marktplatzes (PRD §13). Abgeleitet aus fixtures/market_*.json, cart_full.json,
// checkout*.json, order*.json, studio_*.json und den Services in server/commerce/*.
// Geld immer als Rappen-Int (`…Minor`).

// MARK: - Gemeinsam

struct MarketPayments: Decodable, Hashable, Sendable {
    var mode: String
    var feeBps: Int
}

struct MarketProfileMini: Decodable, Hashable, Sendable {
    var handle: String?
    var displayName: String?
    var avatarUrl: String?
    var bio: String?
    var region: String?
    var followerCount: Int?
}

struct MarketOwner: Decodable, Hashable, Sendable {
    var id: String?
    var status: String?
    var createdAt: Date?
    var profile: MarketProfileMini?
    var handle: String? { profile?.handle }
    var displayName: String { profile?.displayName ?? profile?.handle ?? "Unbekannt" }
}

struct MarketVerification: Decodable, Hashable, Sendable {
    var state: String?
    var legalName: String?
    var businessName: String?
    var vatId: String?
    var addressLine: String?
    var postalCode: String?
    var city: String?
    var country: String?
    var notes: String?
}

struct MarketAddress: Codable, Hashable, Sendable {
    var name: String?
    var line1: String?
    var line2: String?
    var postalCode: String?
    var city: String?
    var country: String?

    var lines: [String] {
        [name, line1, line2, [postalCode, city].compactMap { $0?.nilIfEmpty }.joined(separator: " "), country.map { L.country($0) }]
            .compactMap { $0?.nilIfEmpty }
    }
}

// MARK: - Startseite & Listen

struct MarketHome: Decodable, Sendable {
    var products: [ProductCard]
    var nextCursor: String?
    var shops: [ShopCard]
    var categories: [Category]?
    var payments: MarketPayments?
}

// MARK: - Produktseite

struct MarketProductShop: Decodable, Hashable, Sendable {
    var id: String
    var ownerId: String?
    var slug: String
    var name: String
    var tagline: String?
    var description: String?
    var status: String?
    var sellerType: String?
    var country: String?
    var shippingPolicy: String?
    var returnPolicy: String?
    var processingDays: Int?
    var ratingAvg: Double?
    var ratingCount: Int?
    var salesCount: Int?
    var verification: MarketVerification?
    var owner: MarketOwner?
}

struct MarketStock: Decodable, Hashable, Sendable {
    var onHand: Int
    var reserved: Int
    var variantId: String?
    var available: Int { max(0, onHand - reserved) }
}

struct MarketVariant: Decodable, Hashable, Identifiable, Sendable {
    var id: String
    var name: String
    var priceDeltaMinor: Int
    var position: Int?
    var inventory: MarketStock?
}

struct MarketVariantStock: Decodable, Hashable, Identifiable, Sendable {
    var id: String
    var name: String
    var priceDeltaMinor: Int
    var available: Int
}

struct MarketProductMedia: Decodable, Hashable, Sendable {
    struct M: Decodable, Hashable, Sendable {
        var id: String
        var variants: MediaVariants?
        var width: Int?
        var height: Int?
        var kind: String?
        var state: String?
    }
    var mediaId: String?
    var alt: String?
    var position: Int?
    var media: M?

    var item: MediaItem? {
        guard let id = media?.id ?? mediaId else { return nil }
        return MediaItem(id: id, alt: alt, kind: media?.kind, variants: media?.variants, width: media?.width, height: media?.height)
    }
}

struct MarketLinkedProject: Decodable, Hashable, Sendable {
    var id: String
    var slug: String
    var title: String
    var status: String?
    var coverUrl: String?
    var category: String?
    var ownerHandle: String?
}

struct MarketLinkedTutorial: Decodable, Hashable, Sendable {
    var id: String
    var slug: String
    var title: String
    var difficulty: Int?
    var minutes: Int?
    var coverUrl: String?
    var category: String?
}

struct MarketReview: Decodable, Hashable, Identifiable, Sendable {
    struct ItemRef: Decodable, Hashable, Sendable { var variantName: String? }
    struct ProductRef: Decodable, Hashable, Sendable { var title: String?; var slug: String? }
    var id: String
    var productRating: Int
    var sellerRating: Int?
    var body: String?
    var sellerReply: String?
    var createdAt: Date?
    var orderItem: ItemRef?
    var product: ProductRef?
    var author: MarketOwner?
}

struct MarketProductPage: Decodable, Sendable {
    struct Viewer: Decodable, Hashable, Sendable { var saved: Bool?; var entitlementId: String? }
    var id: String
    var shopId: String?
    var slug: String
    var title: String
    var description: String?
    var kind: String
    var category: String?
    var priceMinor: Int
    var currency: String?
    var status: String
    var materials: String?
    var dimensions: String?
    var productionDays: Int?
    var shippingMinor: Int?
    var shipsFrom: String?
    var safetyInfo: String?
    var returnPolicy: String?
    var coverUrl: String?
    var ratingAvg: Double?
    var ratingCount: Int?
    var saveCount: Int?
    var viewCount: Int?
    var publishedAt: Date?
    var shop: MarketProductShop
    var variants: [MarketVariant]?
    var media: [MarketProductMedia]?
    var project: MarketLinkedProject?
    var tutorial: MarketLinkedTutorial?
    var isOwner: Bool?
    var purchasable: Bool?
    /// null = unbegrenzt (digital)
    var available: Int?
    var variantStock: [MarketVariantStock]?
    var viewer: Viewer?
    var reviews: [MarketReview]?
    var moreFromShop: [ProductCard]?
    var payments: MarketPayments?
    /// Digitale Produkte: Apple-Produkt-ID der Preisstufe (nil = in der App nicht kaufbar).
    /// `priceMinor` ist bei digitalen Produkten bereits der App-Preis.
    var appStoreProductId: String?

    var isDigital: Bool { kind == "DIGITAL" }
    var href: String { "/markt/\(shop.slug)/\(slug)" }
    var mediaItems: [MediaItem] { (media ?? []).compactMap(\.item) }
}

// MARK: - Shopseite

struct MarketShopPage: Decodable, Sendable {
    struct Count: Decodable, Hashable, Sendable { var products: Int? }
    var id: String
    var ownerId: String?
    var slug: String
    var name: String
    var tagline: String?
    var description: String?
    var status: String?
    var sellerType: String?
    var country: String?
    var shippingPolicy: String?
    var returnPolicy: String?
    var processingDays: Int?
    var ratingAvg: Double?
    var ratingCount: Int?
    var salesCount: Int?
    var createdAt: Date?
    var verification: MarketVerification?
    var owner: MarketOwner?
    var count: Count?
    var isOwner: Bool?
    var reviews: [MarketReview]?

    enum CodingKeys: String, CodingKey {
        case id, ownerId, slug, name, tagline, description, status, sellerType, country, shippingPolicy, returnPolicy, processingDays, ratingAvg, ratingCount, salesCount, createdAt, verification, owner, isOwner, reviews
        case count = "_count"
    }
}

/// Teilantwort von `GET /users/:handle` (nur Produkte)
struct MarketUserProducts: Decodable, Sendable {
    var products: [ProductCard]?
}

// MARK: - Warenkorb

struct MarketFees: Decodable, Hashable, Sendable {
    var subtotal: Int
    var shipping: Int
    var total: Int
    var platformFee: Int?
    var sellerNet: Int?
}

struct MarketCartLine: Decodable, Hashable, Identifiable, Sendable {
    var id: String
    var productId: String
    var variantId: String?
    var title: String
    var variantName: String?
    var href: String?
    var kind: String?
    var category: String?
    var cover: Cover?
    var unitMinor: Int
    var quantity: Int
    var lineMinor: Int
    var shippingMinor: Int?
    var isDigital: Bool
    var available: Int?
    var problem: String?
}

struct MarketCartGroup: Decodable, Hashable, Identifiable, Sendable {
    struct Shop: Decodable, Hashable, Sendable { var id: String; var slug: String; var name: String; var processingDays: Int?; var country: String? }
    var shop: Shop
    var lines: [MarketCartLine]
    var fees: MarketFees
    var purchasable: Bool
    var id: String { shop.id }
}

struct MarketPendingOrder: Decodable, Hashable, Identifiable, Sendable {
    struct ShopName: Decodable, Hashable, Sendable { var name: String? }
    struct Item: Decodable, Hashable, Sendable { var title: String; var quantity: Int }
    var id: String
    var number: String
    var totalMinor: Int
    var currency: String?
    var reservationExpiresAt: Date?
    var shop: ShopName?
    var items: [Item]?
}

struct MarketCart: Decodable, Sendable {
    var groups: [MarketCartGroup]
    var totals: MarketFees
    var feeBps: Int
    var count: Int
    var hasProblems: Bool
    var mode: String
    var pendingOrders: [MarketPendingOrder]?
}

struct MarketCartAddResult: Decodable, Sendable { var quantity: Int?; var capped: Bool?; var count: Int? }

// MARK: - Kasse

struct MarketCheckoutPage: Decodable, Sendable {
    var cart: MarketCart
    var address: MarketAddress?
    var digitalOnly: Bool?
}

struct MarketCheckoutStarted: Decodable, Sendable {
    var url: String
    var orderIds: [String]
    var mode: String
}

struct MarketURLResult: Decodable, Sendable { var url: String }
struct MarketMessage: Decodable, Sendable { var message: String?; var ok: Bool?; var status: String? }

// MARK: - Bestellungen

struct MarketOrderItemSummary: Decodable, Hashable, Sendable {
    struct P: Decodable, Hashable, Sendable { var coverUrl: String?; var category: String? }
    var id: String?
    var title: String
    var variantName: String?
    var quantity: Int
    var isDigital: Bool?
    var product: P?
}

struct MarketStatusOnly: Decodable, Hashable, Sendable { var status: String }
struct MarketShipmentSummary: Decodable, Hashable, Sendable { var carrier: String?; var trackingNo: String? }

/// Listenzeile (Käufer `/orders` und Verkäufer `/studio/orders`)
struct MarketOrderSummary: Decodable, Hashable, Identifiable, Sendable {
    struct ShopRef: Decodable, Hashable, Sendable { var name: String?; var slug: String? }
    struct BuyerRef: Decodable, Hashable, Sendable { var profile: MarketProfileMini? }
    var id: String
    var number: String
    var status: String
    var currency: String?
    var subtotalMinor: Int?
    var shippingMinor: Int?
    var totalMinor: Int
    var platformFeeMinor: Int?
    var createdAt: Date?
    var paidAt: Date?
    var reservationExpiresAt: Date?
    var shop: ShopRef?
    var buyer: BuyerRef?
    var items: [MarketOrderItemSummary]?
    var payments: [MarketStatusOnly]?
    var shipments: [MarketShipmentSummary]?
}

struct MarketOrderItem: Decodable, Hashable, Identifiable, Sendable {
    struct P: Decodable, Hashable, Sendable {
        struct S: Decodable, Hashable, Sendable { var slug: String? }
        var id: String?
        var slug: String?
        var coverUrl: String?
        var category: String?
        var kind: String?
        var shop: S?
    }
    struct Review: Decodable, Hashable, Sendable {
        var id: String
        var productRating: Int
        var sellerRating: Int?
        var body: String?
        var createdAt: Date?
        var sellerReply: String?
    }
    var id: String
    var productId: String?
    var variantId: String?
    var title: String
    var variantName: String?
    var unitMinor: Int
    var quantity: Int
    var isDigital: Bool
    var product: P?
    var review: Review?
}

struct MarketPayment: Decodable, Hashable, Identifiable, Sendable {
    var id: String
    var provider: String?
    var status: String
    var amountMinor: Int
    var currency: String?
    var applicationFeeMinor: Int?
    var failureReason: String?
    var createdAt: Date?
}

struct MarketRefund: Decodable, Hashable, Identifiable, Sendable {
    var id: String
    var amountMinor: Int
    var reason: String?
    var status: String
    var createdAt: Date?
}

struct MarketShipment: Decodable, Hashable, Identifiable, Sendable {
    var id: String
    var carrier: String?
    var trackingNo: String?
    var trackingUrl: String?
    var shippedAt: Date?
    var deliveredAt: Date?
}

struct MarketOrderEvent: Decodable, Hashable, Identifiable, Sendable {
    var id: String
    var actorId: String?
    var from: String?
    var to: String
    var note: String?
    var createdAt: Date?
}

struct MarketEntitlement: Decodable, Hashable, Identifiable, Sendable {
    var id: String
    var orderItemId: String?
    var downloadCount: Int?
    var downloadLimit: Int?
    var revokedAt: Date?
    var licenseText: String?
}

struct MarketOrderShop: Decodable, Hashable, Sendable {
    var id: String
    var slug: String
    var name: String
    var ownerId: String?
    var sellerType: String?
    var returnPolicy: String?
    var shippingPolicy: String?
    var processingDays: Int?
    var verification: MarketVerification?
    var owner: MarketOwner?
}

struct MarketOrderBuyer: Decodable, Hashable, Sendable {
    var id: String?
    var profile: MarketProfileMini?
    var displayName: String { profile?.displayName ?? profile?.handle ?? "Käufer:in" }
}

struct MarketOrderDetail: Decodable, Hashable, Identifiable, Sendable {
    var id: String
    var number: String
    var buyerId: String?
    var shopId: String?
    var status: String
    var currency: String?
    var subtotalMinor: Int
    var shippingMinor: Int
    var totalMinor: Int
    var platformFeeMinor: Int?
    var feeBps: Int?
    var shippingAddress: MarketAddress?
    var buyerNote: String?
    var reservationExpiresAt: Date?
    var paidAt: Date?
    var shippedAt: Date?
    var completedAt: Date?
    var cancelledAt: Date?
    var createdAt: Date?
    var items: [MarketOrderItem]
    var payments: [MarketPayment]?
    var refunds: [MarketRefund]?
    var shipments: [MarketShipment]?
    var events: [MarketOrderEvent]?
    var shop: MarketOrderShop
    var buyer: MarketOrderBuyer?
    var entitlements: [MarketEntitlement]?

    var latestPayment: MarketPayment? { payments?.first }
    var isPaid: Bool { ["SUCCEEDED", "PARTIALLY_REFUNDED"].contains(latestPayment?.status ?? "") }
    /// Spiegel von `canReview` (server/commerce/rules.ts)
    var canReview: Bool { isPaid && (status == "SHIPPED" || status == "COMPLETED") }
    var refundedOrPending: Int { (refunds ?? []).filter { $0.status != "FAILED" }.reduce(0) { $0 + $1.amountMinor } }
    var refundable: Int { max(0, (latestPayment?.amountMinor ?? totalMinor) - refundedOrPending) }
    var isDigitalOnly: Bool { !items.isEmpty && items.allSatisfy(\.isDigital) }
}

struct MarketBuyerOrderEnvelope: Decodable, Sendable {
    var order: MarketOrderDetail
    var canPay: Bool
}

struct MarketReceipt: Decodable, Sendable {
    var order: MarketOrderDetail
    var role: String?
}

// MARK: - Studio: Shop

struct MarketMyShop: Decodable, Hashable, Sendable {
    var id: String
    var slug: String
    var name: String
    var tagline: String?
    var description: String?
    var status: String
    var sellerType: String?
    var country: String?
    var currency: String?
    var shippingPolicy: String?
    var returnPolicy: String?
    var processingDays: Int?
    var stripeAccountId: String?
    var payoutsEnabled: Bool?
    var chargesEnabled: Bool?
    var ratingAvg: Double?
    var ratingCount: Int?
    var salesCount: Int?
    var createdAt: Date?
    var verification: MarketVerification?
}

struct MarketStudioShop: Decodable, Sendable {
    var shop: MarketMyShop?
    var feeBps: Int
    var payments: String
    var emailVerified: Bool?
}

struct MarketSlugCheck: Decodable, Sendable { var ok: Bool; var message: String? }

// MARK: - Studio: Produkte

struct MarketStudioProduct: Decodable, Hashable, Identifiable, Sendable {
    struct M: Decodable, Hashable, Sendable {
        struct Inner: Decodable, Hashable, Sendable { var variants: MediaVariants? }
        var alt: String?
        var media: Inner?
    }
    struct Count: Decodable, Hashable, Sendable { var orderItems: Int?; var variants: Int? }
    struct Sold: Decodable, Hashable, Sendable { var quantity: Int }
    var id: String
    var slug: String
    var title: String
    var priceMinor: Int
    var currency: String?
    var kind: String?
    var category: String?
    var status: String
    var coverUrl: String?
    var ratingAvg: Double?
    var ratingCount: Int?
    var publishedAt: Date?
    var updatedAt: Date?
    var viewCount: Int?
    var saveCount: Int?
    var shop: ProductCard.ShopMini?
    var media: [M]?
    var inventory: [MarketStock]?
    var orderItems: [Sold]?
    var count: Count?

    enum CodingKeys: String, CodingKey {
        case id, slug, title, priceMinor, currency, kind, category, status, coverUrl, ratingAvg, ratingCount, publishedAt, updatedAt, viewCount, saveCount, shop, media, inventory, orderItems
        case count = "_count"
    }

    var imageURL: String? { media?.first?.media?.variants?.small ?? coverUrl }
    var stockOnHand: Int { (inventory ?? []).reduce(0) { $0 + $1.onHand } }
    var stockAvailable: Int { (inventory ?? []).reduce(0) { $0 + $1.available } }
    var sold: Int { (orderItems ?? []).reduce(0) { $0 + $1.quantity } }
}

struct MarketStudioProducts: Decodable, Sendable {
    var shop: MarketMyShop?
    var products: [MarketStudioProduct]
}

struct MarketEditorProduct: Decodable, Sendable {
    struct M: Decodable, Sendable {
        struct Inner: Decodable, Sendable { var id: String; var variants: MediaVariants? }
        var mediaId: String
        var alt: String?
        var media: Inner?
    }
    var id: String
    var title: String
    var description: String?
    var kind: String
    var category: String
    var priceMinor: Int
    var currency: String?
    var materials: String?
    var dimensions: String?
    var productionDays: Int?
    var shippingMinor: Int?
    var shipsFrom: String?
    var safetyInfo: String?
    var returnPolicy: String?
    var projectId: String?
    var tutorialId: String?
    var status: String
    var digitalKey: String?
    var variants: [MarketVariant]?
    var inventory: [MarketStock]?
    var media: [M]?
}

struct MarketEditorContext: Decodable, Sendable {
    struct ShopRef: Decodable, Sendable { var id: String; var slug: String; var status: String; var name: String }
    struct Links: Decodable, Sendable { var projects: [IdTitle]; var tutorials: [IdTitle] }
    var shop: ShopRef
    var links: Links
    var feeBps: Int
    var digitalEnabled: Bool?
    var categories: [Category]
    var product: MarketEditorProduct?
}

struct MarketUpsertResult: Decodable, Sendable {
    var id: String
    var slug: String?
    var shopSlug: String?
    var status: String?
    var announced: Bool?
}

// MARK: - Studio: Bestellungen

struct MarketSellerOrders: Decodable, Sendable {
    struct Tab: Decodable, Hashable, Sendable { var key: String; var status: String; var label: String }
    var tab: Tab?
    var items: [MarketOrderSummary]
    var nextCursor: String?
    var counts: [String: Int]?
}

/// Spiegel von `SELLER_ORDER_TABS` (server/commerce/rules.ts)
enum MarketSellerTabs {
    static let all: [(key: String, status: String, label: String)] = [
        ("neu", "NEW", "Neu"), ("in-bearbeitung", "IN_PROGRESS", "In Bearbeitung"), ("versandbereit", "READY_TO_SHIP", "Versandbereit"),
        ("versendet", "SHIPPED", "Versendet"), ("abgeschlossen", "COMPLETED", "Abgeschlossen"), ("storniert", "CANCELLED", "Storniert"),
        ("erstattet", "REFUNDED", "Erstattet"), ("problemfaelle", "PROBLEM", "Problemfälle"),
    ]
}

// MARK: - Studio: Einnahmen

struct MarketRevenue: Decodable, Sendable {
    struct Row: Decodable, Hashable, Identifiable, Sendable {
        var id: String
        var number: String
        var paidAt: Date?
        var status: String
        var currency: String?
        var subtotalMinor: Int?
        var shippingMinor: Int?
        var totalMinor: Int
        var platformFeeMinor: Int?
        var feeBps: Int?
        var refunded: Int
        var fee: Int
        var net: Int
    }
    struct Payout: Decodable, Hashable, Identifiable, Sendable {
        var id: String
        var amountMinor: Int
        var currency: String?
        var status: String
        var arrivalAt: Date?
        var createdAt: Date?
    }
    var range: String
    var currency: String?
    var gross: Int
    var refunds: Int
    var fees: Int
    var net: Int
    var orderCount: Int
    var pendingRefunds: Int?
    var paidOut: Int?
    var payouts: [Payout]?
    var rows: [Row]
    var payoutsEnabled: Bool?
    var connected: Bool?
    var feeBps: Int?
    var payments: String?
}

// MARK: - Hilfen

enum MarketFee {
    /// Spiegel von `computeFees`: Provision nur auf den Warenwert.
    static func platformFee(subtotal: Int, bps: Int) -> Int { Int((Double(subtotal) * Double(bps) / 10_000).rounded()) }
}

extension APIError {
    var marketIsConflict: Bool { status == 409 || code == "CONFLICT" }
}
