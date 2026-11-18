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
        case cancelled
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
        let intent: MarketIAPIntent = try await APIClient.shared.post("/iap/intent", ["productId": JSONValue.string(productId)])
        guard let token = UUID(uuidString: intent.appAccountToken), let product = await product(intent.appleProductId) else {
            throw DigitalStoreError.unavailable
        }
        let result = try await product.purchase(options: [.appAccountToken(token)])
        switch result {
        case .success(let verification):
            return .purchased(try await deliver(verification))
        case .pending:
            return .pending
        case .userCancelled:
            return .cancelled
        @unknown default:
            return .cancelled
        }
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
