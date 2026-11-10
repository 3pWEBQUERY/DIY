import SwiftUI

// MARK: - „Habe ich schon“-Schalter

/// Toggle-Kapsel für ein Material der Datenbank (`PUT /materials/:id/stock`). Aktiv in Moos.
struct MaterialStockToggle: View {
    var materialId: String
    var name: String
    @Binding var have: Bool
    var compact = false
    /// Nach erfolgreichem Umschalten (neuer Zustand)
    var onChange: ((Bool) -> Void)? = nil

    @Environment(AppState.self) private var app
    @State private var busy = false

    var body: some View {
        Button { Task { await toggle() } } label: {
            HStack(spacing: compact ? 4 : 6) {
                Image(systemName: have ? "checkmark" : "plus")
                    .font(.wr(size: compact ? 10 : 13, weight: .bold))
                Text(have ? "Habe ich" : (compact ? "Habe ich" : "Habe ich schon"))
                    .font(.wr(size: compact ? 12 : 15, weight: .semibold, relativeTo: compact ? .caption : .subheadline))
            }
            .foregroundStyle(have ? Color.paper : Color.ink2)
            .padding(.horizontal, compact ? 10 : 16)
            .frame(minHeight: compact ? 30 : 44)
            .background(have ? Color.moss : Color.card, in: Capsule())
            .overlay { Capsule().strokeBorder(have ? Color.moss : Color.lineStrong, lineWidth: 1) }
            .contentShape(Capsule())
            .opacity(busy ? 0.6 : 1)
        }
        .buttonStyle(.pressable)
        .disabled(busy)
        .frame(minHeight: 44)
        .animation(.snappy, value: have)
        .accessibilityLabel(have ? "\(name) ist in deinem Bestand" : "\(name) zu deinem Bestand hinzufügen")
        .accessibilityAddTraits(have ? .isSelected : [])
        .sensoryFeedback(.selection, trigger: have)
    }

    private func toggle() async {
        guard app.isSignedIn else {
            app.show("Melde dich an, um deinen Materialbestand zu führen.", style: .info)
            return
        }
        let next = !have
        have = next
        busy = true
        defer { busy = false }
        do {
            let r: MaterialStockToggleResult = try await APIClient.shared.put("/materials/\(materialId)/stock", ["have": JSONValue.bool(next)])
            have = r.have
            if !compact { app.show(r.have ? "«\(name)» ist in deinem Bestand." : "«\(name)» aus dem Bestand entfernt.") }
            onChange?(r.have)
        } catch {
            have = !next
            app.show(error: error)
        }
    }
}

// MARK: - Formatierung

enum MaterialFmt {
    /// „Stand 9.11.2026“ (Schweizer Kurzformat)
    static func stand(_ d: Date?) -> String {
        guard let d else { return "Stand unbekannt" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "de_CH")
        f.timeZone = TimeZone(identifier: "Europe/Zurich")
        f.dateFormat = "d.M.yyyy"
        return "Stand \(f.string(from: d))"
    }

    static func propertyValue(_ v: JSONValue) -> String {
        switch v {
        case .null: ""
        case .bool(let b): b ? "Ja" : "Nein"
        case .number(let n): n.formatted(.number.locale(Locale(identifier: "de_CH")).precision(.fractionLength(0...3)))
        case .string(let s): s
        case .array(let a): a.map(propertyValue).filter { !$0.isEmpty }.joined(separator: ", ")
        case .object(let o): o.sorted { $0.key < $1.key }.map { "\($0.key): \(propertyValue($0.value))" }.joined(separator: ", ")
        }
    }

    static func propertyLabel(_ k: String) -> String {
        let map = ["weight": "Gewicht", "thickness": "Stärke", "needleSize": "Nadelstärke", "hardness": "Härte", "density": "Dichte", "temperature": "Temperatur", "color": "Farbe", "fiber": "Faser", "length": "Länge", "width": "Breite", "material": "Material", "finish": "Oberfläche", "voltage": "Spannung"]
        if let m = map[k] { return m }
        var out = ""
        for ch in k { if ch.isUppercase && !out.isEmpty { out += " " }; out.append(ch) }
        return out.prefix(1).uppercased() + out.dropFirst().lowercased()
    }
}
