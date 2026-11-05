import SwiftUI
import UIKit

// MARK: - Farbwelt „Werkbuch“ (PRD §28.2) – hell & dunkel
//
// Papier, Tinte, Moos und Terrakotta bleiben die Markenfarben. Liquid Glass liegt als
// Navigations- und Aktionsschicht darüber; Inhalte bleiben ruhig und redaktionell.

extension Color {
    static func dynamic(light: UInt32, dark: UInt32) -> Color {
        Color(UIColor { tc in
            UIColor(hex: tc.userInterfaceStyle == .dark ? dark : light)
        })
    }

    /// Hintergrund (Papier)
    static let paper = Color.dynamic(light: 0xFAF9F6, dark: 0x131412)
    /// Karten und Panels
    static let card = Color.dynamic(light: 0xFFFFFF, dark: 0x1C1E1B)
    /// Abgesetzte Flächen
    static let sunken = Color.dynamic(light: 0xF2F0EA, dark: 0x22241F)
    /// Primärtext (Tinte)
    static let ink = Color.dynamic(light: 0x252822, dark: 0xECEBE5)
    static let ink2 = Color.dynamic(light: 0x3B3E37, dark: 0xD2D1CA)
    /// Sekundärtext
    static let muted = Color.dynamic(light: 0x73766E, dark: 0x9A9C94)
    /// Primärakzent (Moos)
    static let moss = Color.dynamic(light: 0x3D604C, dark: 0x86B08E)
    static let mossInk = Color.dynamic(light: 0x2C4738, dark: 0xB4D3B9)
    static let mossSoft = Color.dynamic(light: 0xE5ECE5, dark: 0x233127)
    /// Warmer Kontrast (Terrakotta)
    static let clay = Color.dynamic(light: 0xB46C4D, dark: 0xD9906F)
    static let clayInk = Color.dynamic(light: 0x8A4F36, dark: 0xF0B79C)
    static let claySoft = Color.dynamic(light: 0xF4E6DE, dark: 0x3A2920)
    /// Linien
    static let line = Color.dynamic(light: 0xE3E4DE, dark: 0x30332D)
    static let lineStrong = Color.dynamic(light: 0xC9CBC2, dark: 0x464A42)
    static let danger = Color.dynamic(light: 0xA8402F, dark: 0xE57A66)
    static let warn = Color.dynamic(light: 0x9A6B12, dark: 0xE0B357)
    static let ochre = Color.dynamic(light: 0xC29A3E, dark: 0xD8B862)
    static let slate = Color.dynamic(light: 0x4F6475, dark: 0x93A9BB)
    static let plum = Color.dynamic(light: 0x6E4E64, dark: 0xBE9AB3)
}

extension UIColor {
    convenience init(hex: UInt32, alpha: CGFloat = 1) {
        self.init(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255, blue: CGFloat(hex & 0xFF) / 255, alpha: alpha)
    }

    var hexString: String {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        getRed(&r, green: &g, blue: &b, alpha: &a)
        return String(format: "#%02X%02X%02X", Int(r * 255), Int(g * 255), Int(b * 255))
    }
}

// MARK: - Typografie (PRD §28.3): New York für redaktionelle Titel, SF für UI, SF Mono für Datenblätter

extension Font {
    /// Grosser redaktioneller Titel (Serif)
    static func display(_ size: CGFloat = 34, weight: Font.Weight = .semibold) -> Font {
        .system(size: size, weight: weight, design: .serif)
    }
    static let headlineSerif = Font.system(.title2, design: .serif).weight(.semibold)
    static let titleSerif = Font.system(.title3, design: .serif).weight(.semibold)
    /// Datenblatt-Label: Mono, klein, Versalien (per .specStyle())
    static let spec = Font.system(size: 11, weight: .medium, design: .monospaced)
    static let specLarge = Font.system(size: 13, weight: .medium, design: .monospaced)
    static let num = Font.system(.body, design: .rounded).monospacedDigit()
}

extension View {
    /// Mono-Versalien für Metadaten („Datenblatt“-Look)
    func specStyle(_ color: Color = .muted) -> some View {
        font(.spec).textCase(.uppercase).tracking(0.8).foregroundStyle(color)
    }

    /// Ruhige Inhaltskarte: Karte, Haarlinie, kontinuierliche Rundung
    func cardSurface(radius: CGFloat = Radius.card, padding: CGFloat? = nil) -> some View {
        self
            .padding(padding ?? 0)
            .background(Color.card, in: .rect(cornerRadius: radius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).strokeBorder(Color.line, lineWidth: 0.75))
    }

    /// Abgesetzte Fläche ohne Rahmen
    func sunkenSurface(radius: CGFloat = Radius.inner) -> some View {
        background(Color.sunken, in: .rect(cornerRadius: radius, style: .continuous))
    }

    func hairline(_ edge: Edge = .bottom) -> some View {
        overlay(alignment: edge == .bottom ? .bottom : .top) { Rectangle().fill(Color.line).frame(height: 0.75) }
    }
}

enum Radius {
    static let card: CGFloat = 22
    static let inner: CGFloat = 14
    static let small: CGFloat = 10
    static let chip: CGFloat = 100
}

enum Space {
    static let xs: CGFloat = 4
    static let s: CGFloat = 8
    static let m: CGFloat = 12
    static let l: CGFloat = 16
    static let xl: CGFloat = 24
    static let xxl: CGFloat = 36
    /// Seitlicher Rand
    static let gutter: CGFloat = 20
}

// MARK: - Liquid Glass Varianten

extension View {
    /// Schwebende Glasfläche (Navigation/Aktionen) – iOS 26 Liquid Glass
    func floatingGlass(_ shape: some Shape = Capsule(), tint: Color? = nil, interactive: Bool = true) -> some View {
        let g: Glass = tint.map { Glass.regular.tint($0.opacity(0.55)) } ?? .regular
        return glassEffect(interactive ? g.interactive() : g, in: shape)
    }
}

// MARK: - Kategorie-Farben (für generative Tafeln, Avatare, Akzente)

enum CategoryPalette {
    static func color(for slug: String?) -> Color {
        switch slug {
        case "haekeln-stricken": .clay
        case "naehen-textil": .plum
        case "holz": Color.dynamic(light: 0x7A5A3A, dark: 0xC59D72)
        case "moebel-upcycling": .ochre
        case "wohnen-deko": .slate
        case "papier-basteln": Color.dynamic(light: 0x8C7A5B, dark: 0xCDB88F)
        case "schmuck-accessoires": Color.dynamic(light: 0x9B7B2F, dark: 0xE2C46F)
        case "keramik": Color.dynamic(light: 0xA45E45, dark: 0xE09C82)
        case "malen-zeichnen": Color.dynamic(light: 0x3F5E8C, dark: 0x8FB1E0)
        case "3d-druck": Color.dynamic(light: 0x4B6B73, dark: 0x8EB9C2)
        case "elektronik-maker": Color.dynamic(light: 0x2F6A5A, dark: 0x78C2AC)
        case "garten-pflanzen": .moss
        case "festlich": Color.dynamic(light: 0x9C3D3D, dark: 0xE08585)
        case "kinder-familie": Color.dynamic(light: 0xB88A2E, dark: 0xE9C26E)
        default: .muted
        }
    }

    static func soft(for slug: String?) -> Color { color(for: slug).opacity(0.14) }

    static func symbol(for glyph: String?) -> String {
        switch glyph {
        case "loop": "circle.dotted.circle"
        case "stitch": "scissors"
        case "grain": "tree"
        case "chair": "chair.lounge"
        case "frame": "photo.artframe"
        case "fold": "paperplane"
        case "ring": "circle.circle"
        case "vessel": "cup.and.saucer"
        case "brush": "paintbrush.pointed"
        case "layers": "square.3.layers.3d"
        case "circuit": "cpu"
        case "leaf": "leaf"
        case "star": "star"
        case "kite": "wind"
        default: "sparkles"
        }
    }
}
