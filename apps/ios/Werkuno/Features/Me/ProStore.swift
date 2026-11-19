import Foundation
import StoreKit

// MARK: - Creator Pro im App Store (Auto-Renewable Subscription)
// App-Store-Regel 3.1.1: Digitale Abos werden in der App über Apple verkauft. Der Server ordnet das Abo
// über `appAccountToken` (vom Server, fest je Werkuno-Konto) zu und prüft jeden Beleg selbst; die App
// meldet Kauf, Wiederherstellen und beim Start den aktuellen Stand. Verlängerungen, Kündigungen und
// Erstattungen erfährt der Server zusätzlich direkt von Apple (Server-Benachrichtigungen V2).

struct ProAppleOffer: Decodable, Sendable, Equatable {
    var productIds: [String]
    var appAccountToken: String
}

enum ProStoreError: LocalizedError {
    case unavailable
    case unverified
    case nothingToRestore

    var errorDescription: String? {
        switch self {
        case .unavailable: "Creator Pro ist im App Store gerade nicht verfügbar. Bitte versuche es später erneut."
        case .unverified: "Apple konnte den Kauf nicht bestätigen. Es wurde nichts verbucht."
        case .nothingToRestore: "Für deinen Apple-Account wurde kein aktives Creator-Pro-Abo gefunden."
        }
    }
}

@MainActor
final class ProStore {
    static let shared = ProStore()

    /// Bekannte Produkt-IDs (gleich wie auf dem Server, `PRO_APPLE_PRODUCTS`)
    static let productIds: Set<String> = ["ch.werkuno.app.pro.monthly", "ch.werkuno.app.pro.yearly"]

    enum Outcome { case purchased, pending, cancelled }

    private var cache: [String: Product] = [:]

    /// Abo-Produkte mit lokalisiertem Preis, Monat vor Jahr. Ein zweiter Versuch fängt kurze
    /// Aussetzer des App Stores ab; fehlen Produkte, geht eine Meldung an den Server.
    func products(_ ids: [String]) async -> [Product] {
        var lastError: Error?
        for attempt in 0..<2 {
            let missing = ids.filter { cache[$0] == nil }
            if missing.isEmpty { break }
            if attempt > 0 { try? await Task.sleep(for: .milliseconds(800)) }
            do {
                for p in try await Product.products(for: missing) { cache[p.id] = p }
                lastError = nil
            } catch {
                lastError = error
            }
        }
        let missing = ids.filter { cache[$0] == nil }
        if !missing.isEmpty {
            StoreDiagnostics.report("pro.products_missing", error: lastError, productIds: missing)
        }
        return ids.compactMap { cache[$0] }.sorted { ($0.subscription?.subscriptionPeriod.unit == .year ? 1 : 0) < ($1.subscription?.subscriptionPeriod.unit == .year ? 1 : 0) }
    }

    func purchase(_ product: Product, offer: ProAppleOffer) async throws -> Outcome {
        guard let token = UUID(uuidString: offer.appAccountToken) else {
            StoreDiagnostics.report("pro.invalid_token", error: nil, productIds: [product.id])
            throw ProStoreError.unavailable
        }
        let result: Product.PurchaseResult
        do {
            result = try await product.purchaseInActiveScene(options: [.appAccountToken(token)])
        } catch {
            guard let mapped = StorePurchaseError.wrap(error) else {
                StoreDiagnostics.reportInTesting("pro.purchase_cancelled_error", error: error, productIds: [product.id])
                return .cancelled
            }
            StoreDiagnostics.report("pro.purchase_failed", error: error, productIds: [product.id])
            throw mapped
        }
        switch result {
        case .success(let verification):
            do {
                try await deliver(verification)
            } catch {
                // Apple hat abgebucht, der Server hat (noch) nicht verbucht: Transaktion bleibt offen und
                // wird beim nächsten Start bzw. über `Transaction.updates` erneut gemeldet.
                StoreDiagnostics.report("pro.deliver_failed", error: error, productIds: [product.id])
                throw error
            }
            return .purchased
        case .pending:
            StoreDiagnostics.reportInTesting("pro.purchase_pending", error: nil, productIds: [product.id])
            return .pending
        case .userCancelled:
            StoreDiagnostics.reportInTesting("pro.purchase_cancelled", error: nil, productIds: [product.id])
            return .cancelled
        @unknown default:
            StoreDiagnostics.reportInTesting("pro.purchase_unknown_result", error: nil, productIds: [product.id])
            return .cancelled
        }
    }

    /// „Käufe wiederherstellen“: mit Apple abgleichen und das aktive Abo an den Server melden.
    func restore() async throws {
        do {
            try await AppStore.sync()
        } catch {
            guard let mapped = StorePurchaseError.wrap(error) else { return }
            StoreDiagnostics.report("pro.restore_failed", error: error)
            throw mapped
        }
        let delivered = try await syncEntitlements(quiet: false)
        if !delivered { throw ProStoreError.nothingToRestore }
    }

    /// Aktuellen Abo-Stand melden (beim Start, nach Anmeldung). Liefert, ob ein Pro-Abo gefunden wurde.
    @discardableResult
    func syncEntitlements(quiet: Bool = true) async throws -> Bool {
        guard APIClient.shared.isSignedIn else { return false }
        var found = false
        for await entitlement in Transaction.currentEntitlements {
            guard Self.productIds.contains(entitlement.unsafePayloadValue.productID) else { continue }
            found = true
            do {
                try await deliver(entitlement)
            } catch {
                // Im Hintergrund still: z. B. Abo eines anderen Werkuno-Kontos auf diesem Apple-Account
                if !quiet { throw error }
            }
        }
        return found
    }

    /// Transaktion aus `Transaction.updates`/`unfinished` (Verlängerung, Kauf ausserhalb des Dialogs)
    func deliverQuietly(_ verification: VerificationResult<Transaction>) async {
        guard APIClient.shared.isSignedIn else { return }
        do {
            try await deliver(verification)
            NotificationCenter.default.post(name: Self.changedNotification, object: nil)
        } catch {
            #if DEBUG
            print("Pro-Abo konnte noch nicht gemeldet werden: \(error.localizedDescription)")
            #endif
        }
    }

    /// Beim Server verbuchen und erst danach abschliessen – ein nicht bestätigter Kauf bleibt offen.
    private func deliver(_ verification: VerificationResult<Transaction>) async throws {
        if case .unverified(_, let reason) = verification {
            StoreDiagnostics.report("pro.unverified", error: reason)
            throw ProStoreError.unverified
        }
        let transaction = verification.unsafePayloadValue
        var body: [String: JSONValue] = ["signedTransaction": .string(verification.jwsRepresentation)]
        if let status = await transaction.subscriptionStatus {
            body["signedRenewalInfo"] = .string(status.renewalInfo.jwsRepresentation)
        }
        let _: JSONValue = try await APIClient.shared.post("/studio/pro/apple", body)
        await transaction.finish()
    }

    static let changedNotification = Notification.Name("werkuno.pro.changed")
}

extension Product {
    /// „pro Monat“ / „pro Jahr“
    var proPeriodLabel: String {
        switch subscription?.subscriptionPeriod.unit {
        case .year: "pro Jahr"
        case .month: subscription?.subscriptionPeriod.value == 1 ? "pro Monat" : "alle \(subscription?.subscriptionPeriod.value ?? 1) Monate"
        case .week: "pro Woche"
        default: ""
        }
    }

    var isYearly: Bool { subscription?.subscriptionPeriod.unit == .year }
}
