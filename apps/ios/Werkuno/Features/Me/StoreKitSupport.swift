import Foundation
import StoreKit
import UIKit

// MARK: - Gemeinsame StoreKit-Hilfen (Creator Pro und digitale Produkte)
// - Kauf immer im aktiven Fenster bestätigen (`purchase(confirmIn:)`): Seit iOS 18.2 verlangt StoreKit
//   den Kontext für das Kaufblatt; ohne ihn kann der Kauf auf dem iPad (auch im iPhone-Modus) scheitern.
// - Fehler verständlich übersetzen und mit Code an den Server melden (Admin › Fehler), damit ein
//   Problem im App-Review oder bei Kund:innen nachvollziehbar ist.

enum StoreKitUI {
    /// Aktive Fensterszene für das Kaufblatt (iPad mit mehreren Fenstern: die im Vordergrund)
    @MainActor
    static func activeScene() -> UIWindowScene? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        return scenes.first { $0.activationState == .foregroundActive }
            ?? scenes.first { $0.activationState == .foregroundInactive }
            ?? scenes.first
    }
}

extension Product {
    /// Kauf mit Kaufblatt im aktiven Fenster
    @MainActor
    func purchaseInActiveScene(options: Set<Product.PurchaseOption>) async throws -> Product.PurchaseResult {
        if let scene = StoreKitUI.activeScene() {
            return try await purchase(confirmIn: scene, options: options)
        }
        return try await purchase(options: options)
    }
}

/// Verständliche Meldung zu einem Fehler aus StoreKit; `nil` = Abbruch durch die Person (keine Meldung).
enum StorePurchaseError: LocalizedError {
    case store(String)

    var errorDescription: String? {
        switch self { case .store(let text): text }
    }

    /// Übersetzt StoreKit-Fehler; andere Fehler (z. B. vom Werkuno-Server) bleiben unverändert.
    static func wrap(_ error: Error) -> Error? {
        if let e = error as? StoreKitError {
            switch e {
            case .userCancelled:
                return nil
            case .networkError:
                return Self.store("Keine Verbindung zum App Store. Prüfe deine Internetverbindung und versuche es erneut.")
            case .notAvailableInStorefront:
                return Self.store("Dieser Kauf ist im App Store deines Landes nicht verfügbar.")
            case .notEntitled:
                return Self.store("Der App Store hat den Kauf nicht freigegeben. Bitte melde dich in den Einstellungen mit deinem Apple-Account an und versuche es erneut.")
            case .systemError(let underlying):
                return Self.store("Der App Store hat den Kauf abgebrochen (\((underlying as NSError).domain) \((underlying as NSError).code)). Bitte versuche es in einem Moment erneut.")
            case .unsupported:
                return Self.store("Käufe werden auf diesem Gerät nicht unterstützt.")
            case .unknown:
                return Self.store("Der App Store hat den Kauf abgebrochen. Bitte versuche es in einem Moment erneut.")
            @unknown default:
                return Self.store("Der App Store hat den Kauf abgebrochen. Bitte versuche es in einem Moment erneut.")
            }
        }
        if let e = error as? Product.PurchaseError {
            switch e {
            case .purchaseNotAllowed:
                return Self.store("Käufe sind auf diesem Gerät eingeschränkt (z. B. Bildschirmzeit). Bitte erlaube In-App-Käufe in den Einstellungen.")
            case .productUnavailable:
                return Self.store("Dieses Angebot ist im App Store gerade nicht verfügbar. Bitte versuche es später erneut.")
            case .ineligibleForOffer, .invalidOfferIdentifier, .invalidOfferPrice, .invalidOfferSignature, .missingOfferParameters:
                return Self.store("Das Angebot konnte nicht angewendet werden. Bitte versuche es ohne Angebot erneut.")
            case .invalidQuantity:
                return Self.store("Ungültige Menge für diesen Kauf.")
            @unknown default:
                return Self.store("Der App Store hat den Kauf abgebrochen. Bitte versuche es in einem Moment erneut.")
            }
        }
        return error
    }
}

enum StoreDiagnostics {
    /// Fehler rund um Käufe an den Server melden (ohne Belege oder persönliche Daten).
    static func report(_ context: String, error: Error?, productIds: [String] = [], extra: [String: String] = [:]) {
        Task.detached(priority: .utility) {
            let storefront = await Storefront.current?.countryCode ?? "?"
            var parts = ["\(context)", "storefront=\(storefront)"]
            if !productIds.isEmpty { parts.append("products=\(productIds.joined(separator: ","))") }
            for (k, v) in extra.sorted(by: { $0.key < $1.key }) { parts.append("\(k)=\(v)") }
            if let error {
                let ns = error as NSError
                parts.append("error=\(String(describing: error))")
                parts.append("domain=\(ns.domain) code=\(ns.code)")
            }
            let device = await MainActor.run { "\(UIDevice.current.model) iOS \(UIDevice.current.systemVersion)" }
            let body: [String: String] = [
                "name": "StoreKit",
                "message": String(parts.joined(separator: " · ").prefix(900)),
                "stack": "device=\(device) app=\(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "?") (\(Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "?"))",
                "path": "ios/storekit",
                "kind": "storekit",
            ]
            _ = try? await APIClient.shared.send("POST", "/errors", body: body, root: "/api/v1") as JSONValue
        }
    }
}
