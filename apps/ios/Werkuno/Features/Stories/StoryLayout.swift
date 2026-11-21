import SwiftUI

// Gestaltung einer Story (Story-Editor): frei platzierte Ebenen über Foto, Video oder Text-Fläche.
// Gegenstück zu packages/shared/src/story-layout.ts und apps/web/src/components/stories/story-layout.tsx.
//
// Koordinaten relativ zur 9:16-Bühne: `x` 0–1 der Breite, `y` 0–1 der Höhe (Mittelpunkt des Elements).
// Grössen (Schrift, Strichstärke) beziehen sich auf die Bühnenbreite – so sieht eine Story in Editor,
// Betrachter und Miniatur gleich aus wie im Web.

enum StoryLayoutRules {
    static let version = 1
    static let elementsMax = 20
    static let elementTextMax = 120
    static let strokesMax = 60
    static let pointsMax = 4000
    static let scaleMin = 0.3
    static let scaleMax = 4.0
    static let strokeWidthMin = 0.004
    static let strokeWidthMax = 0.08
    /// Höhe der Bühne in Breiten-Einheiten (9:16)
    static let stageRatio = 16.0 / 9.0

    /// Grundgrössen in Bühnenbreiten (vor der Skalierung des Elements), wie `ELEMENT_SIZE` im Web (cqw / 100)
    static let textSize = 0.06
    static let emojiSize = 0.13
    static let stickerSize = 0.046
    static let timeSize = 0.10
    static let dateSize = 0.046

    /// Kuratierte Sticker-Emojis (wie STORY_EMOJIS)
    static let emojis: [String] = [
        "🧶", "🪡", "🧵", "✂️", "🪚", "🔨", "🪛", "🔧", "🪵", "🧰",
        "🎨", "🖌️", "🖍️", "📐", "📏", "📌", "💡", "🪴", "🌿", "🌱",
        "🌸", "🌻", "🍂", "🏡", "☕", "🍪", "❤️", "🧡", "💛", "💚",
        "💙", "💜", "🤍", "✨", "⭐", "🔥", "👍", "👏", "🙌", "🎉",
        "✅", "😊", "😍", "🤩", "😅", "🤔",
    ]
}

/// Farben für Text, Sticker und Striche; `fg` = Schrift auf dieser Farbe als Fläche (Kontrast ≥ 4,5:1)
enum StoryPalette: String, CaseIterable, Identifiable, Sendable {
    case white, ink, coral, rose, sun, ochre, sage, slate, plum
    var id: String { rawValue }

    var label: String {
        switch self {
        case .white: "Weiss"
        case .ink: "Tinte"
        case .coral: "Koralle"
        case .rose: "Rosé"
        case .sun: "Sonne"
        case .ochre: "Ocker"
        case .sage: "Salbei"
        case .slate: "Schiefer"
        case .plum: "Pflaume"
        }
    }
    var color: Color {
        switch self {
        case .white: Color(hex: 0xFFFFFF)
        case .ink: Color(hex: 0x262427)
        case .coral: Color(hex: 0xB64B3A)
        case .rose: Color(hex: 0xF6E5E0)
        case .sun: Color(hex: 0xF2C230)
        case .ochre: Color(hex: 0xC29A3E)
        case .sage: Color(hex: 0x4F7A55)
        case .slate: Color(hex: 0x4F6475)
        case .plum: Color(hex: 0x6E4E64)
        }
    }
    var onColor: Color {
        switch self {
        case .white, .sun, .ochre: Color(hex: 0x262427)
        case .rose: Color(hex: 0x7A2E22)
        default: Color(hex: 0xFFFFFF)
        }
    }
    static func from(_ raw: String?) -> StoryPalette { raw.flatMap(StoryPalette.init(rawValue:)) ?? .white }
}

enum StoryTextStyle: String, CaseIterable, Identifiable, Sendable {
    case normal, bold, caps, pill
    var id: String { rawValue }
    var label: String {
        switch self {
        case .normal: "Normal"
        case .bold: "Fett"
        case .caps: "Versalien"
        case .pill: "Fläche"
        }
    }
    var weight: Font.Weight {
        switch self {
        case .normal: .medium
        case .caps: .heavy
        default: .bold
        }
    }
}

enum StoryTextAlign: String, CaseIterable, Identifiable, Sendable {
    case left, center, right
    var id: String { rawValue }
    var label: String { self == .left ? "Linksbündig" : self == .center ? "Zentriert" : "Rechtsbündig" }
    var symbol: String { self == .left ? "text.alignleft" : self == .center ? "text.aligncenter" : "text.alignright" }
    var textAlignment: TextAlignment { self == .left ? .leading : self == .center ? .center : .trailing }
    var frameAlignment: Alignment { self == .left ? .leading : self == .center ? .center : .trailing }
}

/// Filter (nicht destruktiv), Intensität 0–100 – Annäherung an die CSS-Filter des Webs
enum StoryFilterKind: String, CaseIterable, Identifiable, Sendable {
    case original, warm, cool, mono, contrast, faded, sepia, vivid
    var id: String { rawValue }
    var label: String {
        switch self {
        case .original: "Original"
        case .warm: "Warm"
        case .cool: "Kühl"
        case .mono: "Schwarzweiss"
        case .contrast: "Kontrast"
        case .faded: "Verblasst"
        case .sepia: "Sepia"
        case .vivid: "Lebendig"
        }
    }

    /// [Funktion, Neutralwert, Zielwert] wie STORY_FILTERS
    var steps: [(String, Double, Double)] {
        switch self {
        case .original: []
        case .warm: [("sepia", 0, 0.3), ("saturate", 1, 1.25), ("hue", 0, -8)]
        case .cool: [("hue", 0, 12), ("saturate", 1, 1.1), ("brightness", 1, 1.03)]
        case .mono: [("grayscale", 0, 1), ("contrast", 1, 1.1)]
        case .contrast: [("contrast", 1, 1.35), ("saturate", 1, 1.1)]
        case .faded: [("contrast", 1, 0.8), ("brightness", 1, 1.1), ("saturate", 1, 0.7)]
        case .sepia: [("sepia", 0, 0.85), ("contrast", 1, 1.05)]
        case .vivid: [("saturate", 1, 1.6), ("contrast", 1, 1.1)]
        }
    }
}

struct StoryStroke: Hashable, Sendable {
    var marker: Bool
    var color: StoryPalette
    /// Strichstärke in Bühnenbreiten
    var width: Double
    /// x0, y0, x1, y1 … (0–1)
    var points: [Double]
}

/// Eine Ebene der Story
struct StoryElement: Identifiable, Hashable, Sendable {
    enum Kind: String, Sendable { case text, emoji, mention, projectLink, time, drawing }

    var id: String
    var kind: Kind
    var x: Double = 0.5
    var y: Double = 0.5
    var scale: Double = 1
    var rotation: Double = 0
    var z: Int = 0
    var text = ""
    var color: StoryPalette = .white
    var style: StoryTextStyle = .bold
    var align: StoryTextAlign = .center
    /// Hintergrund hinter Text: nil, "shade" oder eine Palettenfarbe
    var bg: String?
    var emoji = ""
    var handle = ""
    var projectId = ""
    /// Vom Server aufgelöst (nur Anzeige)
    var projectTitle: String?
    var projectHref: String?
    /// "time" | "date"
    var variant = "time"
    var strokes: [StoryStroke] = []

    /// Kennung wie im Web (`^[a-z0-9]{1,12}$`)
    static func newId() -> String {
        let chars = Array("abcdefghijklmnopqrstuvwxyz0123456789")
        return String((0..<10).map { _ in chars.randomElement()! })
    }

    /// Kurzbeschreibung für Ebenen-Liste und VoiceOver
    var summary: String {
        switch kind {
        case .text: "Text: \(text)"
        case .emoji: "Sticker \(emoji)"
        case .mention: "Erwähnung @\(handle)"
        case .projectLink: "Projekt: \(projectTitle ?? "Projekt")"
        case .time: variant == "time" ? "Uhrzeit \(text)" : "Datum \(text)"
        case .drawing: "Zeichnung (\(strokes.count) \(strokes.count == 1 ? "Strich" : "Striche"))"
        }
    }
}

/// Textstil des Haupttexts einer Text-Story
struct StoryTextLook: Hashable, Sendable {
    var style: StoryTextStyle = .bold
    var align: StoryTextAlign = .center
    var scale: Double = 1
    var isDefault: Bool { style == .bold && align == .center && scale == 1 }
}

struct StoryLayoutData: Hashable, Sendable, Decodable {
    var filter: StoryFilterKind = .original
    var intensity: Double = 100
    var textLook = StoryTextLook()
    var elements: [StoryElement] = []

    init() {}

    init(from decoder: Decoder) throws {
        let v = try decoder.singleValueContainer().decode(JSONValue.self)
        self = StoryLayoutData(json: v)
    }

    /// Gespeichertes Layout lesen; Unbekanntes wird übersprungen (statt eines Fehlers)
    init(json v: JSONValue) {
        if let m = v["media"] {
            filter = StoryFilterKind(rawValue: m["filter"]?.string ?? "") ?? .original
            intensity = min(100, max(0, m["intensity"]?.number ?? 100))
        }
        if let t = v["text"] {
            textLook = StoryTextLook(
                style: StoryTextStyle(rawValue: t["style"]?.string ?? "") ?? .bold,
                align: StoryTextAlign(rawValue: t["align"]?.string ?? "") ?? .center,
                scale: min(2, max(0.5, t["scale"]?.number ?? 1))
            )
        }
        elements = (v["elements"]?.array ?? []).compactMap(Self.element)
    }

    private static func element(_ e: JSONValue) -> StoryElement? {
        guard let id = e["id"]?.string, let kind = StoryElement.Kind(rawValue: e["type"]?.string ?? "") else { return nil }
        var el = StoryElement(id: id, kind: kind)
        el.x = e["x"]?.number ?? 0.5
        el.y = e["y"]?.number ?? 0.5
        el.scale = e["scale"]?.number ?? 1
        el.rotation = e["rotation"]?.number ?? 0
        el.z = e["z"]?.int ?? 0
        el.color = StoryPalette.from(e["color"]?.string)
        switch kind {
        case .text:
            el.text = e["text"]?.string ?? ""
            el.style = StoryTextStyle(rawValue: e["style"]?.string ?? "") ?? .bold
            el.align = StoryTextAlign(rawValue: e["align"]?.string ?? "") ?? .center
            el.bg = e["bg"]?.string
        case .emoji:
            el.emoji = e["emoji"]?.string ?? ""
        case .mention:
            el.handle = e["handle"]?.string ?? ""
        case .projectLink:
            el.projectId = e["projectId"]?.string ?? ""
            el.projectTitle = e["project"]?["title"]?.string
            el.projectHref = e["project"]?["href"]?.string
        case .time:
            el.text = e["text"]?.string ?? ""
            el.variant = e["variant"]?.string == "date" ? "date" : "time"
        case .drawing:
            el.strokes = (e["strokes"]?.array ?? []).compactMap { s in
                guard let pts = s["points"]?.array?.compactMap(\.number), pts.count >= 2 else { return nil }
                return StoryStroke(marker: s["tool"]?.string == "marker", color: StoryPalette.from(s["color"]?.string), width: s["width"]?.number ?? 0.012, points: pts)
            }
        }
        return el
    }

    /// Gibt es etwas zu speichern?
    func isEmpty(text: Bool) -> Bool {
        let hasFilter = !text && filter != .original && intensity > 0
        let hasLook = text && !textLook.isDefault
        return elements.isEmpty && !hasFilter && !hasLook
    }

    private static func r4(_ v: Double) -> JSONValue { .number((v * 10_000).rounded() / 10_000) }

    /// Für `POST /stories` – nur die Felder, die das Schema der Art erlaubt (streng geprüft)
    func json(text: Bool) -> JSONValue {
        var out: [String: JSONValue] = ["version": .number(Double(StoryLayoutRules.version))]
        if !text, filter != .original {
            out["media"] = .object(["filter": .string(filter.rawValue), "intensity": .number(intensity.rounded())])
        }
        if text, !textLook.isDefault {
            out["text"] = .object(["style": .string(textLook.style.rawValue), "align": .string(textLook.align.rawValue), "scale": Self.r4(textLook.scale)])
        }
        out["elements"] = .array(elements.enumerated().map { i, e in elementJSON(e, z: i) })
        return .object(out)
    }

    private func elementJSON(_ e: StoryElement, z: Int) -> JSONValue {
        var o: [String: JSONValue] = [
            "id": .string(e.id),
            "type": .string(e.kind.rawValue),
            "x": Self.r4(min(1, max(0, e.x))),
            "y": Self.r4(min(1, max(0, e.y))),
            "scale": Self.r4(min(StoryLayoutRules.scaleMax, max(StoryLayoutRules.scaleMin, e.scale))),
            "rotation": Self.r4(Self.normalized(e.rotation)),
            "z": .number(Double(z)),
        ]
        switch e.kind {
        case .text:
            o["text"] = .string(String(e.text.trimmed.prefix(StoryLayoutRules.elementTextMax)))
            o["color"] = .string(e.color.rawValue)
            o["style"] = .string(e.style.rawValue)
            o["align"] = .string(e.align.rawValue)
            if let bg = e.bg { o["bg"] = .string(bg) }
        case .emoji:
            o["emoji"] = .string(e.emoji)
        case .mention:
            o["handle"] = .string(e.handle.lowercased())
            o["color"] = .string(e.color.rawValue)
        case .projectLink:
            o["projectId"] = .string(e.projectId)
            o["color"] = .string(e.color.rawValue)
        case .time:
            o["text"] = .string(String(e.text.prefix(40)))
            o["variant"] = .string(e.variant)
            o["color"] = .string(e.color.rawValue)
        case .drawing:
            o["strokes"] = .array(e.strokes.map(Self.strokeJSON))
        }
        return .object(o)
    }

    private static func strokeJSON(_ s: StoryStroke) -> JSONValue {
        let width = min(StoryLayoutRules.strokeWidthMax, max(StoryLayoutRules.strokeWidthMin, s.width))
        let points: [JSONValue] = s.points.map { v in JSONValue.number((min(1, max(0, v)) * 1000).rounded() / 1000) }
        var o: [String: JSONValue] = [:]
        o["tool"] = .string(s.marker ? "marker" : "pen")
        o["color"] = .string(s.color.rawValue)
        o["width"] = r4(width)
        o["points"] = .array(points)
        return .object(o)
    }

    /// Drehung auf −180…180 Grad
    static func normalized(_ deg: Double) -> Double {
        var d = deg.truncatingRemainder(dividingBy: 360)
        if d > 180 { d -= 360 }
        if d < -180 { d += 360 }
        return d
    }

    var strokeCount: Int { elements.reduce(0) { $0 + $1.strokes.count } }
    var pointCount: Int { elements.reduce(0) { n, e in n + e.strokes.reduce(0) { $0 + $1.points.count / 2 } } }
}

// MARK: - Filter

/// Filter als SwiftUI-Modifikatoren (gleiche Reihenfolge und Intensität wie die CSS-Filter des Webs)
struct StoryFilterModifier: ViewModifier {
    var filter: StoryFilterKind
    var intensity: Double

    func body(content: Content) -> some View {
        let v = values
        content
            .grayscale(v.grayscale)
            .colorMultiply(v.sepiaTint)
            .saturation(v.saturation)
            .contrast(v.contrast)
            .brightness(v.brightness)
            .hueRotation(.degrees(v.hue))
    }

    private struct Values {
        var grayscale = 0.0, sepia = 0.0, saturation = 1.0, contrast = 1.0, brightness = 0.0, hue = 0.0
        var sepiaTint: Color {
            // Sepia: Graustufen und warmer Ton, je nach Stärke
            Color(red: 1 - 0.06 * sepia, green: 1 - 0.16 * sepia, blue: 1 - 0.34 * sepia)
        }
    }

    private var values: Values {
        var v = Values()
        let t = min(100, max(0, intensity)) / 100
        guard t > 0 else { return v }
        for (fn, from, to) in filter.steps {
            let x = from + (to - from) * t
            switch fn {
            case "grayscale": v.grayscale = x
            case "sepia": v.sepia = x; v.grayscale = max(v.grayscale, x * 0.75)
            case "saturate": v.saturation = x
            case "contrast": v.contrast = x
            case "brightness": v.brightness = (x - 1) * 0.6
            case "hue": v.hue = x
            default: break
            }
        }
        return v
    }
}

extension View {
    /// Story-Filter anwenden (nichts bei „Original“ oder Intensität 0)
    @ViewBuilder func storyFilter(_ layout: StoryLayoutData?) -> some View {
        if let l = layout, l.filter != .original, l.intensity > 0 {
            modifier(StoryFilterModifier(filter: l.filter, intensity: l.intensity))
        } else {
            self
        }
    }
}

// MARK: - Darstellung

/// Schrift auf der Bühne: feste Grösse relativ zur Bühnenbreite (ohne Dynamic Type – die Story sieht für alle gleich aus)
func storyFont(_ size: CGFloat, _ weight: Font.Weight) -> Font {
    .custom(Manrope.name(weight), fixedSize: max(1, size))
}

/// Alle Ebenen einer Story über der Bühne (`size` = Bühne 9:16), nach `z` geordnet.
/// `onOpen`: Erwähnungen und Projekt-Sticker sind antippbar (Betrachter), sonst nur Darstellung.
struct StoryOverlayView: View {
    var layout: StoryLayoutData
    var size: CGSize
    var onOpen: ((String) -> Void)? = nil

    var body: some View {
        ZStack {
            ForEach(layout.elements.sorted { $0.z < $1.z }) { e in
                StoryElementView(element: e, stage: size, onOpen: onOpen)
            }
        }
        .frame(width: size.width, height: size.height)
        .clipped()
    }
}

/// Eine Ebene an ihrer Position (Mittelpunkt), gedreht und skaliert um ihre Mitte
struct StoryElementView: View {
    var element: StoryElement
    var stage: CGSize
    var onOpen: ((String) -> Void)? = nil

    var body: some View {
        if element.kind == .drawing {
            StoryDrawingView(element: element, stage: stage)
                .allowsHitTesting(false)
        } else {
            StoryElementBody(element: element, width: stage.width, onOpen: onOpen)
                .scaleEffect(element.scale)
                .rotationEffect(.degrees(element.rotation))
                .position(x: element.x * stage.width, y: element.y * stage.height)
        }
    }
}

/// Inhalt einer Ebene ohne Platzierung (auch für Ebenen-Liste und Ziehen im Editor)
struct StoryElementBody: View {
    var element: StoryElement
    var width: CGFloat
    var onOpen: ((String) -> Void)? = nil

    var body: some View {
        switch element.kind {
        case .text: textBody
        case .emoji:
            Text(element.emoji)
                .font(.system(size: width * StoryLayoutRules.emojiSize))
                .fixedSize()
                .allowsHitTesting(false)
                .accessibilityLabel("Sticker \(element.emoji)")
        case .time: timeBody
        case .mention: link(href: "/u/\(element.handle)", label: "Profil von @\(element.handle)") { sticker(Text("@\(element.handle)")) }
        case .projectLink:
            let title = element.projectTitle ?? "Projekt"
            let short = title.count > 40 ? String(title.prefix(39)) + "…" : title
            link(href: element.projectHref, label: "Projekt: \(title)") {
                sticker(Text("\(Image(systemName: "arrow.up.right")) \(short)"))
            }
        case .drawing: EmptyView()
        }
    }

    private var textBody: some View {
        let c = element.color
        // Eigene Fläche (abgedunkelt oder Palettenfarbe) mit frei gewählter Schrift; Stil „Fläche“ ohne `bg`:
        // Fläche in der Farbe, Schrift aus dem Farbpaar
        var bgColor: Color? = nil
        var fg: Color = c.color
        if element.bg == "shade" {
            bgColor = Color.black.opacity(0.55)
        } else if let raw = element.bg {
            bgColor = StoryPalette.from(raw).color
        } else if element.style == .pill {
            bgColor = c.color
            fg = c.onColor
        }
        let size = width * StoryLayoutRules.textSize
        let caps = element.style == .caps
        return Text(caps ? element.text.uppercased() : element.text)
            .font(storyFont(size, element.style.weight))
            .tracking(caps ? size * 0.06 : element.style == .normal ? 0 : -size * 0.02)
            .lineSpacing(bgColor == nil ? size * 0.05 : size * 0.2)
            .multilineTextAlignment(element.align.textAlignment)
            .foregroundStyle(fg)
            .padding(.horizontal, bgColor == nil ? 0 : size * 0.38)
            .padding(.vertical, bgColor == nil ? 0 : size * 0.12)
            .background(bgColor ?? .clear, in: .rect(cornerRadius: size * 0.28, style: .continuous))
            .frame(maxWidth: width * 0.82)
            .fixedSize(horizontal: false, vertical: true)
            .allowsHitTesting(false)
    }

    private var timeBody: some View {
        let isTime = element.variant == "time"
        let size = width * (isTime ? StoryLayoutRules.timeSize : StoryLayoutRules.dateSize)
        return Text(isTime ? element.text : element.text.uppercased())
            .font(storyFont(size, isTime ? .bold : .heavy).monospacedDigit())
            .tracking(isTime ? -size * 0.02 : size * 0.06)
            .foregroundStyle(element.color.color)
            .fixedSize()
            .allowsHitTesting(false)
    }

    private func sticker(_ label: Text) -> some View {
        let size = width * StoryLayoutRules.stickerSize
        return label
            .font(storyFont(size, .heavy))
            .lineLimit(1)
            .foregroundStyle(element.color.onColor)
            .padding(.horizontal, size * 0.7)
            .padding(.vertical, size * 0.45)
            .background(element.color.color, in: .rect(cornerRadius: size * 0.5, style: .continuous))
            .frame(maxWidth: width * 0.7)
            .fixedSize()
    }

    @ViewBuilder private func link<C: View>(href: String?, label: String, @ViewBuilder _ content: () -> C) -> some View {
        if let onOpen, let href {
            Button { onOpen(href) } label: { content() }
                .buttonStyle(.plain)
                .accessibilityLabel(label)
        } else {
            content().allowsHitTesting(false).accessibilityLabel(label)
        }
    }
}

/// Zeichnung über die ganze Bühne; Verschieben/Drehen/Skalieren um die Bühnenmitte (wie im Web)
struct StoryDrawingView: View {
    var element: StoryElement
    var stage: CGSize

    var body: some View {
        ZStack {
            ForEach(Array(element.strokes.enumerated()), id: \.offset) { _, s in
                Self.path(s.points, stage)
                    .stroke(s.color.color.opacity(s.marker ? 0.55 : 1), style: StrokeStyle(lineWidth: s.width * stage.width, lineCap: s.marker ? .square : .round, lineJoin: .round))
            }
        }
        .frame(width: stage.width, height: stage.height)
        .scaleEffect(element.scale)
        .rotationEffect(.degrees(element.rotation))
        .offset(x: (element.x - 0.5) * stage.width, y: (element.y - 0.5) * stage.height)
        .accessibilityHidden(true)
    }

    static func path(_ pts: [Double], _ stage: CGSize) -> Path {
        Path { p in
            guard pts.count >= 2 else { return }
            p.move(to: CGPoint(x: pts[0] * stage.width, y: pts[1] * stage.height))
            var i = 2
            if pts.count == 2 {
                // Einzelner Punkt: kurzer Strich, damit er sichtbar ist
                p.addLine(to: CGPoint(x: pts[0] * stage.width + 0.01, y: pts[1] * stage.height))
            }
            while i + 1 < pts.count {
                p.addLine(to: CGPoint(x: pts[i] * stage.width, y: pts[i + 1] * stage.height))
                i += 2
            }
        }
    }
}

/// Text einer Text-Story auf ihrer Farbfläche, mit Textstil (Stil, Ausrichtung, Grösse)
struct StoryTextStage: View {
    var text: String
    var bg: StoryBackground
    var look: StoryTextLook = StoryTextLook()
    var width: CGFloat
    var placeholder: String? = nil

    var body: some View {
        let shown = text.isEmpty ? (placeholder ?? "") : text
        let size = max(8, width * StoryFmt.textScale(shown) * look.scale)
        let pill = look.style == .pill
        let caps = look.style == .caps
        ZStack {
            bg.background
            Text(caps ? shown.uppercased() : shown)
                .font(storyFont(size, look.style.weight))
                .tracking(caps ? size * 0.06 : look.style == .normal ? 0 : -size * 0.02)
                .lineSpacing(pill ? size * 0.25 : size * 0.06)
                .multilineTextAlignment(look.align.textAlignment)
                .foregroundStyle(pill ? bg.background : bg.foreground)
                .padding(.horizontal, pill ? size * 0.38 : 0)
                .padding(.vertical, pill ? size * 0.12 : 0)
                .background(pill ? bg.foreground : .clear, in: .rect(cornerRadius: size * 0.28, style: .continuous))
                .opacity(text.isEmpty ? 0.55 : 1)
                .minimumScaleFactor(0.5)
                .frame(maxWidth: .infinity, alignment: look.align.frameAlignment)
                .padding(.horizontal, width * 0.09)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(shown)
    }
}
