import Foundation
import StoreKit

// MARK: - Digitale Produkte: Kauf über Apple (In-App-Kauf, App Review Guideline 3.1.1)
//
// Ablauf:
// 1. Server legt eine Kaufabsicht an (`POST /iap/intent`) und nennt die Apple-Produkt-ID der
//    Preisstufe sowie ein appAccountToken (UUID), das den Kauf mit Konto und Produkt verknüpft.
// 2. StoreKit-Kauf mit diesem Token.
// 3. Die signierte Transaktion (JWS) geht an den Server (`POST /iap/transactions`), der sie bei Apple
//    prüft und Bestellung + Download verbucht. Erst danach wird die Transaktion abgeschlossen (finish),
//    sonst liefert StoreKit sie beim nächsten Start erneut – so geht kein bezahlter Kauf verloren.

struct MarketIAPIntent: Decodable, Sendable {
    var appAccountToken: String
    var appleProductId: String
    var priceMinor: Int
    var currency: String?
}

struct MarketIAPResult: Decodable, Sendable {
    var orderId: String?
    var entitlementId: String?
}

enum DigitalStoreError: LocalizedError {
    case unavailable
    case unverified

    var errorDescription: String? {
        switch self {
        case .unavailable: "Dieses Produkt ist im App Store gerade nicht verfügbar. Bitte versuche es später erneut."
        case .unverified: "Apple konnte den Kauf nicht bestätigen. Es wurde nichts verbucht."
        }
    }
}

/// Hinweis zur Abrechnung in der App – bewusst ohne Preisvergleich mit anderen Kanälen
/// (App Review Guideline 3.1.1/3.1.3: kein Hinweis, der vom In-App-Kauf wegführt)
enum DigitalStoreNotice {
    static let text = "Käufe in der App werden über Apple abgerechnet."
}

@MainActor
final class DigitalStore {
    static let shared = DigitalStore()

    enum Outcome {
        case purchased(MarketIAPResult)
        /// Wartet auf Zustimmung (z. B. „Kaufanfrage“ der Familienfreigabe)
        case pending
        /// Bei Apple bezahlt, aber noch nicht beim Server verbucht (z. B. Netzfehler). Die Transaktion
        /// bleibt offen und wird automatisch nachgereicht – kein zweiter Kauf.
        case deliveryPending
        case cancelled
    }

    /// Offener Zustand eines Werkuno-Produkts auf diesem Gerät
    enum PendingState: Equatable {
        /// Kaufanfrage (Familienfreigabe) wartet auf Zustimmung
        case awaitingApproval
        /// Bezahlt, Verbuchung steht noch aus
        case awaitingDelivery
    }

    private var products: [String: Product] = [:]
    private var updates: Task<Void, Never>?

    /// Beim App-Start: Käufe, die ausserhalb des Kaufdialogs abgeschlossen wurden (Familienfreigabe,
    /// Abbruch vor der Verbuchung, App beendet) nachträglich verbuchen.
    func startListening() {
        guard updates == nil else { return }
        updates = Task { [weak self] in
            for await unfinished in Transaction.unfinished { await self?.deliverQuietly(unfinished) }
            for await update in Transaction.updates { await self?.deliverQuietly(update) }
        }
    }

    private var retrying = false

    /// Offene Käufe erneut verbuchen – z. B. wenn die App wieder aktiv wird, nach der Anmeldung oder nach
    /// einem Netzfehler im Kaufdialog. `Transaction.unfinished` liefert jeden noch nicht abgeschlossenen Kauf;
    /// `startListening` liest es nur einmal pro App-Start.
    func retryUnfinished() async {
        guard !retrying, APIClient.shared.isSignedIn else { return }
        retrying = true
        defer { retrying = false }
        for await unfinished in Transaction.unfinished { await deliverQuietly(unfinished) }
    }

    /// StoreKit-Produkt (mit lokalisiertem Preis) laden
    func product(_ appleProductId: String) async -> Product? {
        if let p = products[appleProductId] { return p }
        guard let p = try? await Product.products(for: [appleProductId]).first else { return nil }
        products[appleProductId] = p
        return p
    }

    /// Preis so, wie Apple ihn abrechnet (Währung der App-Store-Region)
    func displayPrice(_ appleProductId: String?) async -> String? {
        guard let id = appleProductId else { return nil }
        return await product(id)?.displayPrice
    }

    func buy(productId: String) async throws -> Outcome {
        // Zuerst offene Käufe nachreichen; liegt für dieses Produkt noch ein bezahlter, nicht verbuchter
        // Kauf vor, keinen zweiten starten (sonst wird doppelt abgebucht).
        await retryUnfinished()
        if await hasUnfinished(productId: productId) { return .deliveryPending }
        if isAwaitingApproval(productId) { return .pending }

        let intent: MarketIAPIntent = try await APIClient.shared.post("/iap/intent", ["productId": JSONValue.string(productId)])
        guard let token = UUID(uuidString: intent.appAccountToken), let product = await product(intent.appleProductId) else {
            throw DigitalStoreError.unavailable
        }
        // Token → Produkt merken, damit offene Transaktionen (gleiche Apple-Preisstufe für viele
        // Produkte) dem richtigen Werkuno-Produkt zugeordnet werden können
        remember(token: token, productId: productId)
        let result: Product.PurchaseResult
        do {
            result = try await product.purchase(options: [.appAccountToken(token)])
        } catch {
            forget(token: token)
            throw error
        }
        switch result {
        case .success(let verification):
            do {
                return .purchased(try await deliver(verification))
            } catch {
                // Apple hat bereits kassiert: Transaktion bleibt offen und wird später verbucht
                #if DEBUG
                print("Kauf bezahlt, Verbuchung ausstehend: \(error.localizedDescription)")
                #endif
                return .deliveryPending
            }
        case .pending:
            markAwaitingApproval(productId)
            return .pending
        case .userCancelled:
            forget(token: token)
            return .cancelled
        @unknown default:
            forget(token: token)
            return .cancelled
        }
    }

    // MARK: Offene Käufe pro Produkt (auf dem Gerät gespeichert)

    private static let tokensKey = "werkuno.iap.tokens"
    private static let approvalKey = "werkuno.iap.awaitingApproval"
    /// Kaufanfragen der Familienfreigabe verfallen nach 24 Stunden
    private static let approvalLifetime: TimeInterval = 24 * 60 * 60

    private var tokenMap: [String: String] {
        get { UserDefaults.standard.dictionary(forKey: Self.tokensKey) as? [String: String] ?? [:] }
        set { UserDefaults.standard.set(newValue, forKey: Self.tokensKey) }
    }

    private var approvalMap: [String: Double] {
        get { UserDefaults.standard.dictionary(forKey: Self.approvalKey) as? [String: Double] ?? [:] }
        set { UserDefaults.standard.set(newValue, forKey: Self.approvalKey) }
    }

    private func remember(token: UUID, productId: String) {
        tokenMap[token.uuidString.lowercased()] = productId
    }

    private func forget(token: UUID) {
        tokenMap[token.uuidString.lowercased()] = nil
    }

    private func markAwaitingApproval(_ productId: String) {
        approvalMap[productId] = Date().timeIntervalSince1970
    }

    private func isAwaitingApproval(_ productId: String) -> Bool {
        guard let at = approvalMap[productId] else { return false }
        if Date().timeIntervalSince1970 - at > Self.approvalLifetime {
            approvalMap[productId] = nil
            return false
        }
        return true
    }

    /// Werkuno-Produkt, zu dem eine Transaktion gehört (über das gemerkte appAccountToken)
    private func productId(for transaction: Transaction) -> String? {
        guard let token = transaction.appAccountToken else { return nil }
        return tokenMap[token.uuidString.lowercased()]
    }

    /// Gibt es für dieses Produkt einen bezahlten, noch nicht abgeschlossenen Kauf?
    private func hasUnfinished(productId: String) async -> Bool {
        for await unfinished in Transaction.unfinished {
            let t = unfinished.unsafePayloadValue
            guard t.productType == .consumable, t.revocationDate == nil else { continue }
            if self.productId(for: t) == productId { return true }
        }
        return false
    }

    /// Offener Zustand für die Produktseite: bezahlt, aber nicht verbucht – oder Kaufanfrage offen
    func pendingState(for productId: String) async -> PendingState? {
        if await hasUnfinished(productId: productId) { return .awaitingDelivery }
        if isAwaitingApproval(productId) { return .awaitingApproval }
        return nil
    }

    /// Produkt ist gekauft (Download vorhanden): gespeicherte offene Zustände verwerfen
    func clearPending(productId: String) {
        approvalMap[productId] = nil
    }

    /// Transaktion beim Server verbuchen und danach abschliessen.
    @discardableResult
    private func deliver(_ verification: VerificationResult<Transaction>) async throws -> MarketIAPResult {
        let transaction = verification.unsafePayloadValue
        // Lokal nicht bestätigt (z. B. vorübergehend) → nicht abschliessen: bleibt offen und wird später
        // erneut geprüft. Abschliessen würde einen bezahlten Kauf endgültig verwerfen.
        if case .unverified = verification {
            throw DigitalStoreError.unverified
        }
        let r: MarketIAPResult = try await APIClient.shared.post("/iap/transactions", ["signedTransaction": JSONValue.string(verification.jwsRepresentation)])
        await transaction.finish()
        if let token = transaction.appAccountToken {
            if let id = productId(for: transaction) { approvalMap[id] = nil }
            forget(token: token)
        }
        return r
    }

    private func deliverQuietly(_ verification: VerificationResult<Transaction>) async {
        let transaction = verification.unsafePayloadValue
        // Creator-Pro-Abo (Kauf ausserhalb des Dialogs, Verlängerung): an den Abo-Speicher weitergeben
        if transaction.productType == .autoRenewable, ProStore.productIds.contains(transaction.productID) {
            await ProStore.shared.deliverQuietly(verification)
            return
        }
        // Sonst nur Werkuno-Verbrauchsartikel; widerrufene Käufe abschliessen, ohne zu verbuchen
        guard transaction.productType == .consumable else { return }
        if transaction.revocationDate != nil {
            await transaction.finish()
            if let token = transaction.appAccountToken { forget(token: token) }
            return
        }
        // Nicht angemeldet oder anderes Werkuno-Konto (403): offen lassen – wird verbucht, sobald
        // das passende Konto angemeldet ist.
        guard APIClient.shared.isSignedIn else { return }
        do {
            try await deliver(verification)
            NotificationCenter.default.post(name: Self.purchasedNotification, object: nil)
        } catch {
            #if DEBUG
            print("Kauf konnte noch nicht verbucht werden: \(error.localizedDescription)")
            #endif
        }
    }

    static let purchasedNotification = Notification.Name("werkuno.digital.purchased")
}
