import SwiftUI

// Gemeinsame Bausteine des Bereichs „Ich“. Alle mit Präfix `Me`, damit es keine Kollisionen gibt.

enum MeErr {
    static func text(_ error: Error) -> String { (error as? APIError)?.message ?? error.localizedDescription }
}

/// Lade-/Fehler-/Inhaltszustand in einem.
struct MePhase<T, Content: View>: View {
    var value: T?
    var error: String?
    var retry: () async -> Void
    @ViewBuilder var content: (T) -> Content

    var body: some View {
        if let value { content(value) }
        else if let error { ErrorStateView(message: error, retry: retry) }
        else { LoadingView() }
    }
}

/// Gruppe von Zeilen auf einer Karte – Haarlinien zwischen den Zeilen.
struct MeGroup<Content: View>: View {
    var title: String? = nil
    var footer: String? = nil
    var inset: CGFloat = 58
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let title { SpecLabel(title).padding(.horizontal, 6).accessibilityAddTraits(.isHeader) }
            VStack(spacing: 0) {
                Group(subviews: content) { subs in
                    ForEach(subs) { s in
                        s
                        if s.id != subs.last?.id {
                            Rectangle().fill(Color.line).frame(height: 0.75).padding(.leading, inset)
                        }
                    }
                }
            }
            .cardSurface()
            if let footer { Text(footer).font(.caption).foregroundStyle(Color.muted).padding(.horizontal, 6) }
        }
    }
}

/// Navigationszeile mit Symbol, Titel, Untertitel, Zähler
struct MeNavRow: View {
    var symbol: String
    var title: String
    var subtitle: String? = nil
    var badge: Int = 0
    var tint: Color = .ink
    var trailing: String? = nil
    var external = false
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Image(systemName: symbol)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(tint)
                    .frame(width: 30, height: 30)
                    .background(tint.opacity(0.09), in: .rect(cornerRadius: 9, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.body).foregroundStyle(tint == .danger ? Color.danger : Color.ink)
                    if let subtitle { Text(subtitle).font(.caption).foregroundStyle(Color.muted).lineLimit(2) }
                }
                Spacer(minLength: 8)
                if badge > 0 {
                    Text(badge > 99 ? "99+" : "\(badge)")
                        .font(.caption.weight(.bold)).monospacedDigit()
                        .foregroundStyle(Color.paper)
                        .padding(.horizontal, 7).padding(.vertical, 2)
                        .background(Color.clay, in: Capsule())
                        .accessibilityLabel("\(badge) neu")
                }
                if let trailing { Text(trailing).font(.subheadline).foregroundStyle(Color.muted) }
                Image(systemName: external ? "arrow.up.right" : "chevron.right")
                    .font(.caption.weight(.semibold)).foregroundStyle(Color.lineStrong)
            }
            .padding(.horizontal, 14).padding(.vertical, 11)
            .frame(minHeight: 52)
            .contentShape(.rect)
        }
        .buttonStyle(.pressable)
    }
}

/// Veränderung zur Vorperiode (ehrlich: „neu“ statt unendlich Prozent)
struct MeDelta: View {
    var cur: Int
    var prev: Int
    var body: some View {
        let (text, color, symbol) = info
        Label(text, systemImage: symbol)
            .labelStyle(.compact)
            .font(.caption.weight(.semibold)).monospacedDigit()
            .foregroundStyle(color)
            .accessibilityLabel("Vorperiode: \(Fmt.number(prev))")
    }
    private var info: (String, Color, String) {
        if cur == prev { return ("±0", .muted, "equal") }
        if prev == 0 { return ("neu", .moss, "arrow.up.right") }
        let pct = Int((Double(cur - prev) / Double(prev) * 100).rounded())
        return pct >= 0 ? ("+\(pct) %", .moss, "arrow.up.right") : ("\(pct) %", .clay, "arrow.down.right")
    }
}

/// Kennzahl-Kachel mit Vorperiode
struct MeKPI: View {
    var label: String
    var value: String
    var cur: Int? = nil
    var prev: Int? = nil
    var caption: String? = nil
    var symbol: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                if let symbol { Image(systemName: symbol).font(.caption).foregroundStyle(Color.moss) }
                SpecLabel(label)
            }
            Text(value)
                .font(.system(.title2, design: .rounded).weight(.semibold)).monospacedDigit()
                .foregroundStyle(Color.ink)
                .contentTransition(.numericText())
            HStack(spacing: 6) {
                if let cur, let prev {
                    MeDelta(cur: cur, prev: prev)
                    Text("vs. \(Fmt.number(prev))").font(.caption).foregroundStyle(Color.muted)
                }
                if let caption { Text(caption).font(.caption).foregroundStyle(Color.muted).lineLimit(2) }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .cardSurface(radius: Radius.inner + 4)
        .accessibilityElement(children: .combine)
    }
}

/// Liquid-Glass-Umschalter (z. B. Profil-Tabs). Heftet als Section-Header oben an.
struct MeTabSwitcher<T: Hashable>: View {
    var items: [(value: T, label: String, count: Int?)]
    @Binding var selection: T
    @Namespace private var ns

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 2) {
                ForEach(items, id: \.value) { item in
                    let on = item.value == selection
                    Button {
                        Haptics.selection()
                        withAnimation(.snappy(duration: 0.3)) { selection = item.value }
                    } label: {
                        HStack(spacing: 5) {
                            Text(item.label).font(.subheadline.weight(on ? .semibold : .regular))
                            if let c = item.count, c > 0 {
                                Text(Fmt.number(c)).font(.caption.weight(.medium)).monospacedDigit().opacity(0.7)
                            }
                        }
                        .foregroundStyle(on ? Color.paper : Color.ink)
                        .padding(.horizontal, 14).padding(.vertical, 9)
                        .background {
                            if on { Capsule().fill(Color.ink).matchedGeometryEffect(id: "tab", in: ns) }
                        }
                        .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(on ? [.isSelected, .isButton] : .isButton)
                }
            }
            .padding(4)
            .glassEffect(.regular.interactive(), in: Capsule())
            .padding(.horizontal, Space.gutter)
            .padding(.vertical, 6)
        }
        .scrollClipDisabled()
    }
}

/// Kleine Statuskapsel mit Ton
struct MeStatePill: View {
    var text: String
    var tone: Tone = .neutral
    enum Tone { case neutral, moss, clay, warn, danger, slate }
    var body: some View {
        let c: Color = switch tone {
        case .neutral: .muted
        case .moss: .moss
        case .clay: .clay
        case .warn: .warn
        case .danger: .danger
        case .slate: .slate
        }
        Text(text)
            .font(.caption2.weight(.semibold))
            .foregroundStyle(c)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(c.opacity(0.12), in: Capsule())
    }
}

/// Zähler in einer Zeile: „Symbol Zahl“
struct MeCountLabel: View {
    var symbol: String
    var value: Int?
    var label: String
    var body: some View {
        Label(Fmt.number(value), systemImage: symbol)
            .labelStyle(.compact)
            .font(.caption).monospacedDigit()
            .foregroundStyle(Color.muted)
            .accessibilityLabel("\(value ?? 0) \(label)")
    }
}

/// Zeichenzähler unter Textfeldern
struct MeCharCounter: View {
    var count: Int
    var min: Int? = nil
    var max: Int
    var body: some View {
        let tooShort = (min ?? 0) > count
        HStack {
            if let min, tooShort { Text("Noch mindestens \(min - count) Zeichen").font(.caption).foregroundStyle(Color.muted) }
            Spacer()
            Text("\(count)/\(max)").font(.caption).monospacedDigit().foregroundStyle(count > max ? Color.danger : Color.muted)
        }
    }
}

/// Kategorie-Chips mit Mehrfachauswahl
struct MeCategoryPicker: View {
    var categories: [Category]
    @Binding var selection: [String]
    var max: Int = 15
    var exclude: [String] = []

    var body: some View {
        FlowLayout(spacing: 6, lineSpacing: 8) {
            ForEach(categories.filter { !exclude.contains($0.slug) }) { c in
                let on = selection.contains(c.slug)
                Button {
                    Haptics.selection()
                    withAnimation(.snappy) {
                        if on { selection.removeAll { $0 == c.slug } }
                        else if selection.count < max { selection.append(c.slug) }
                    }
                } label: {
                    HStack(spacing: 5) {
                        Image(systemName: on ? "checkmark" : CategoryPalette.symbol(for: c.glyph)).font(.caption2.weight(.bold))
                        Text(c.short.isEmpty ? c.name : c.short).font(.subheadline)
                    }
                    .foregroundStyle(on ? Color.paper : Color.ink)
                    .padding(.horizontal, 11).padding(.vertical, 7)
                    .background(on ? CategoryPalette.color(for: c.slug) : Color.sunken, in: Capsule())
                    .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(c.name)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
    }
}

extension View {
    /// Werkbuch-Veredelung für `Form`/`List`
    func meFormStyle() -> some View {
        scrollContentBackground(.hidden)
            .background(Color.paper)
            .listRowSeparatorTint(Color.line)
    }

    /// Umgebung für eigene Sheets weiterreichen
    func meSheetEnvironment(_ app: AppState, _ router: Router) -> some View {
        environment(app).environment(router).toastOverlay()
    }
}

extension Optional where Wrapped == String {
    var meOrEmpty: String { self ?? "" }
}

/// Teilbare Web-Adresse
enum MeLinks {
    static func profile(_ handle: String) -> URL { AppConfig.webURL("/u/\(handle)") }
    static func collection(_ id: String) -> URL { AppConfig.webURL("/sammlungen/\(id)") }
    static func list(_ token: String) -> URL { AppConfig.webURL("/liste/\(token)") }
}
