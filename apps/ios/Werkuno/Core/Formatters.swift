import Foundation
import UIKit

/// Formatierung nach Schweizer Konventionen (de-CH): CHF 1’234.50, 5. Nov. 2026, „vor 3 Std.“
enum Fmt {
    static let locale = Locale(identifier: "de_CH")

    static func money(_ minor: Int?, currency: String? = "CHF") -> String {
        guard let minor else { return "–" }
        let f = NumberFormatter()
        f.locale = locale
        f.numberStyle = .currency
        f.currencyCode = currency ?? "CHF"
        f.minimumFractionDigits = 2
        f.maximumFractionDigits = 2
        return f.string(from: NSNumber(value: Double(minor) / 100)) ?? "\(currency ?? "CHF") \(Double(minor) / 100)"
    }

    /// Grösster akzeptierter Betrag in Rappen (CHF 1 Mio.) – schützt vor Überlauf bei `Int(...)`
    static let maxMoneyMinor = 100_000_000

    /// Eingabe „12.50“ / „12,50“ → Rappen. `nil` bei ungültigen, nicht endlichen („inf“, „nan“)
    /// oder zu grossen Werten (sonst stürzt `Int(Double)` ab).
    static func parseMoney(_ s: String) -> Int? {
        let t = s.replacingOccurrences(of: "CHF", with: "").replacingOccurrences(of: "’", with: "").replacingOccurrences(of: "'", with: "").replacingOccurrences(of: ",", with: ".").trimmingCharacters(in: .whitespaces)
        // Nur Ziffern und ein Dezimalpunkt – `Double` akzeptiert sonst auch „inf“, „nan“, „1e300“ oder Hex
        guard !t.isEmpty, t.allSatisfy({ $0.isASCII && ($0.isNumber || $0 == ".") }), t.filter({ $0 == "." }).count <= 1 else { return nil }
        guard let d = Double(t), d.isFinite, d >= 0 else { return nil }
        let minor = (d * 100).rounded()
        guard minor.isFinite, minor <= Double(maxMoneyMinor) else { return nil }
        return Int(minor)
    }

    static func moneyInput(_ minor: Int?) -> String {
        guard let minor else { return "" }
        return String(format: "%.2f", Double(minor) / 100)
    }

    static func percent(bps: Int) -> String {
        let v = Double(bps) / 100
        return v == v.rounded() ? "\(Int(v)) %" : String(format: "%.1f %%", v)
    }

    static func number(_ n: Int?) -> String {
        guard let n else { return "0" }
        if n >= 10_000 { return String(format: "%.1fk", Double(n) / 1000).replacingOccurrences(of: ".0k", with: "k") }
        let f = NumberFormatter()
        f.locale = locale
        f.numberStyle = .decimal
        return f.string(from: NSNumber(value: n)) ?? "\(n)"
    }

    static func date(_ d: Date?, style: Date.FormatStyle.DateStyle = .abbreviated) -> String {
        guard let d else { return "" }
        return d.formatted(Date.FormatStyle(date: style, time: .omitted).locale(locale))
    }

    static func dateTime(_ d: Date?) -> String {
        guard let d else { return "" }
        return d.formatted(Date.FormatStyle(date: .abbreviated, time: .shortened).locale(locale))
    }

    static func relative(_ d: Date?) -> String {
        guard let d else { return "" }
        let s = Date().timeIntervalSince(d)
        if s < 60 { return "gerade eben" }
        if s < 3600 { return "vor \(Int(s / 60)) Min." }
        if s < 86400 { return "vor \(Int(s / 3600)) Std." }
        if s < 86400 * 7 { let n = Int(s / 86400); return n == 1 ? "gestern" : "vor \(n) Tagen" }
        return date(d)
    }

    static func minutes(_ m: Int?) -> String {
        guard let m, m > 0 else { return "–" }
        if m < 60 { return "\(m) Min." }
        let h = m / 60, r = m % 60
        if h >= 24 * 2 { return "\(h / 24) Tage" }
        return r == 0 ? "\(h) Std." : "\(h) Std. \(r) Min."
    }

    static func bytes(_ b: Int?) -> String {
        ByteCountFormatter.string(fromByteCount: Int64(b ?? 0), countStyle: .file)
    }

    static func plural(_ n: Int, _ one: String, _ many: String) -> String { "\(number(n)) \(n == 1 ? one : many)" }
}

enum Haptics {
    static func tap() { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
    static func soft() { UIImpactFeedbackGenerator(style: .soft).impactOccurred() }
    static func success() { UINotificationFeedbackGenerator().notificationOccurred(.success) }
    static func warning() { UINotificationFeedbackGenerator().notificationOccurred(.warning) }
    static func selection() { UISelectionFeedbackGenerator().selectionChanged() }
}

extension String {
    var nilIfEmpty: String? { trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : self }
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }

    /// Initialen für Avatare
    var initials: String {
        let parts = split(separator: " ").prefix(2)
        let s = parts.compactMap { $0.first }.map(String.init).joined()
        return s.isEmpty ? String(prefix(1)).uppercased() : s.uppercased()
    }

    /// Stabiler Hash (für generative Muster)
    var stableHash: UInt64 {
        var h: UInt64 = 1469598103934665603
        for b in utf8 { h = (h ^ UInt64(b)) &* 1099511628211 }
        return h
    }
}

extension Array {
    subscript(safe i: Int) -> Element? { indices.contains(i) ? self[i] : nil }
}
