import Foundation

/// Land und Währung der Mitglieder (Gegenstück zu `packages/shared/src/currency.ts`):
/// Schweiz und Liechtenstein sehen und bezahlen in Franken, Deutschland und Österreich in Euro.
/// Shops verkaufen in ihrer eigenen Währung; der Server rechnet Preise für Käufer:innen der anderen
/// Währung zum EZB-Tageskurs um (gerundet auf 10 Rappen/Cent) und liefert sie samt `currency` aus.
enum MemberCountry: String, CaseIterable, Identifiable, Sendable {
    case CH, LI, DE, AT

    var id: String { rawValue }

    var label: String {
        switch self {
        case .CH: "Schweiz"
        case .LI: "Liechtenstein"
        case .DE: "Deutschland"
        case .AT: "Österreich"
        }
    }

    var flag: String {
        switch self {
        case .CH: "🇨🇭"
        case .LI: "🇱🇮"
        case .DE: "🇩🇪"
        case .AT: "🇦🇹"
        }
    }

    var currency: String { Currency.forCountry(rawValue) }

    init?(code: String?) {
        guard let code, let c = MemberCountry(rawValue: code) else { return nil }
        self = c
    }
}

enum Currency {
    /// Währung, in der ein Mitglied aus diesem Land Preise sieht und bezahlt
    static func forCountry(_ country: String?) -> String {
        country == "DE" || country == "AT" ? "EUR" : "CHF"
    }

    /// „Euro“ bzw. „Franken“ für Fliesstext
    static func name(_ currency: String?) -> String {
        currency == "EUR" ? "Euro" : "Franken"
    }

    /// Kleinste Einheit für Fliesstext: „Cent“ bzw. „Rappen“
    static func minorName(_ currency: String?) -> String {
        currency == "EUR" ? "Cent" : "Rappen"
    }

    /// Kurz für Beschriftungen: „€“ bzw. „CHF“
    static func symbol(_ currency: String?) -> String {
        currency == "EUR" ? "€" : "CHF"
    }

    /// Kurs als Zeile: „1 EUR = 0.9400 CHF“ (EUR als Basis, wie die EZB ihn veröffentlicht)
    static func rateLine(_ eurChf: Double) -> String {
        "1 EUR = \(String(format: "%.4f", eurChf)) CHF"
    }

    /// EZB-Datum „2026-11-20“ → „20. November“
    static func fxDay(_ iso: String?) -> String? {
        guard let iso, iso.count >= 10 else { return nil }
        let p = DateFormatter()
        p.locale = Locale(identifier: "en_US_POSIX")
        p.timeZone = TimeZone(identifier: "Europe/Zurich")
        p.dateFormat = "yyyy-MM-dd"
        guard let d = p.date(from: String(iso.prefix(10))) else { return nil }
        let f = DateFormatter()
        f.locale = Fmt.locale
        f.timeZone = TimeZone(identifier: "Europe/Zurich")
        f.dateFormat = "d. MMMM"
        return f.string(from: d)
    }
}
