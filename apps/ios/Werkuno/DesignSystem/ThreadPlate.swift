import SwiftUI

// MARK: - Faden-Formen (2D)
//
// Jede Kategorie hat eine Glyphe, gezeichnet aus *einem einzigen, durchgehenden Faden* –
// das visuelle Leitmotiv der App (der „Projektfaden“). Punkte liegen im Bereich −1…1.
// Die 3D-Varianten derselben Idee leben in ThreeD/web/scenes.js.

enum ThreadShape {
    static func points(glyph: String?, seed: UInt64, count: Int = 420) -> [CGPoint] {
        var rng = SeededRandom(seed: seed)
        let n = count
        func pts(_ f: (Double) -> CGPoint) -> [CGPoint] { (0..<n).map { f(Double($0) / Double(n - 1)) } }
        switch glyph {
        case "loop": // Garnknäuel: Wicklung um wandernde Achse, orthografisch projiziert
            let tilt = 0.4 + rng.next() * 0.3
            return pts { t in
                let a = t * .pi * 2 * 14
                let ph = t * .pi * 2 * 1.7
                let th = 1.2 + 0.6 * sin(t * .pi * 2 * 2.3)
                let ax = (cos(ph) * sin(th), cos(th), sin(ph) * sin(th))
                var v = (ax.2, 0.0, -ax.0)
                let vl = max(0.0001, hypot(v.0, v.2)); v = (v.0 / vl, 0, v.2 / vl)
                let w = (ax.1 * v.2 - ax.2 * v.1, ax.2 * v.0 - ax.0 * v.2, ax.0 * v.1 - ax.1 * v.0)
                let x = cos(a) * v.0 + sin(a) * w.0
                let y = cos(a) * v.1 + sin(a) * w.1
                let z = cos(a) * v.2 + sin(a) * w.2
                return CGPoint(x: x * 0.82, y: (y * cos(tilt) - z * sin(tilt)) * 0.82)
            }
        case "stitch": // Laufstich: Trochoide mit Schlaufen
            let loops = 5.0 + Double(Int(rng.next() * 3))
            return pts { t in
                let u = t * .pi * 2 * loops
                return CGPoint(x: -0.95 + t * 1.9 - 0.09 * sin(u), y: 0.28 * cos(u) + 0.18 * sin(t * .pi * 2))
            }
        case "grain": // Holzmaserung: verformte Spirale
            let k = 2 + rng.next() * 2
            return pts { t in
                let a = t * .pi * 2 * 7
                let r = 0.12 + t * 0.85
                let wob = 1 + 0.12 * sin(a * k) + 0.06 * sin(a * 0.5)
                return CGPoint(x: cos(a) * r * wob * 1.05, y: sin(a) * r * wob * 0.62)
            }
        case "chair": // Hocker: Sitzfläche + Beine als ein Pfad
            return polyline([(-0.7, -0.15), (0.7, -0.15), (0.75, -0.3), (-0.75, -0.3), (-0.7, -0.15), (-0.55, -0.3), (-0.62, 0.85), (-0.5, 0.85), (-0.38, -0.3), (0.38, -0.3), (0.5, 0.85), (0.62, 0.85), (0.55, -0.3), (0.0, -0.3), (0.0, 0.2), (-0.56, 0.32), (0.56, 0.32)], n: n)
        case "frame": // Rahmen: Rechteckspirale
            var p: [(Double, Double)] = []
            var s = 0.92
            while s > 0.1 { p += [(-s, -s * 0.78), (s, -s * 0.78), (s, s * 0.78), (-s + 0.11, s * 0.78)]; s -= 0.12 }
            return polyline(p, n: n)
        case "fold": // Papier: Leporello-Falz
            var p: [(Double, Double)] = []
            for i in 0...7 { let x = -0.85 + Double(i) * 0.243; p.append((x, i % 2 == 0 ? -0.55 : -0.35)); p.append((x, i % 2 == 0 ? 0.55 : 0.75)) }
            return polyline(p, n: n)
        case "ring": // Schmuck: Kleeblattknoten (2,3)
            return pts { t in
                let u = t * .pi * 2
                let r = 0.5 + 0.28 * cos(3 * u)
                return CGPoint(x: r * cos(2 * u), y: r * sin(2 * u))
            }
        case "vessel": // Keramik: Wulsttechnik – Schicht um Schicht
            return pts { t in
                let a = t * .pi * 2 * 11
                let y = 0.85 - t * 1.7
                let prof = 0.38 + 0.42 * sin(.pi * (0.15 + t * 0.85)) - 0.1 * sin(.pi * t * 2.5)
                return CGPoint(x: cos(a) * prof, y: y + sin(a) * 0.05)
            }
        case "brush": // Malen: Rosenkurve
            let k = [3.0, 5.0, 4.0][Int(seed % 3)]
            return pts { t in
                let th = t * .pi * 2 * (k.truncatingRemainder(dividingBy: 2) == 0 ? 2 : 1)
                let r = 0.85 * cos(k * th)
                return CGPoint(x: r * cos(th), y: r * sin(th))
            }
        case "layers": // 3D-Druck: Schichten mit Füllmuster
            var p: [(Double, Double)] = []
            for i in 0..<9 { let y = 0.75 - Double(i) * 0.18; let w = 0.85 - Double(i) * 0.07; p.append(i % 2 == 0 ? (-w, y) : (w, y)); p.append(i % 2 == 0 ? (w, y) : (-w, y)) }
            return polyline(p, n: n)
        case "circuit": // Elektronik: Leiterbahn
            var p: [(Double, Double)] = [(-0.85, 0.6)]
            var x = -0.85, y = 0.6
            for i in 0..<12 {
                if i % 2 == 0 { x = min(0.85, x + 0.2 + rng.next() * 0.35) } else { y = max(-0.7, min(0.7, y + (rng.next() > 0.5 ? 0.35 : -0.35))) }
                p.append((x, y))
            }
            return polyline(p, n: n)
        case "leaf": // Blatt mit Mittelrippe
            var p: [CGPoint] = (0..<(n * 3 / 4)).map { i in
                let t = Double(i) / Double(n * 3 / 4 - 1) * .pi * 2
                return CGPoint(x: 0.55 * sin(t) * (1 - 0.3 * cos(t)), y: -0.85 * cos(t))
            }
            p += (0..<(n / 4)).map { i in let t = Double(i) / Double(n / 4 - 1); return CGPoint(x: 0.04 * sin(t * 12), y: -0.85 + t * 1.75) }
            return p
        case "star": // Fest: Stern
            return pts { t in
                let th = t * .pi * 2 * 2
                let r = 0.5 + 0.38 * cos(5 * th / 2)
                return CGPoint(x: r * sin(th), y: -r * cos(th))
            }
        case "kite": // Familie: Drachen mit Schwanz
            var p: [CGPoint] = polyline([(0, -0.85), (0.45, -0.2), (0, 0.35), (-0.45, -0.2), (0, -0.85), (0, 0.35)], n: n / 2)
            p += (0..<(n / 2)).map { i in let t = Double(i) / Double(n / 2 - 1); return CGPoint(x: 0.12 * sin(t * .pi * 5), y: 0.35 + t * 0.55) }
            return p
        default: // Funke: Lissajous
            let a = 3.0, b = 2.0 + Double(seed % 2)
            return pts { t in CGPoint(x: 0.85 * sin(a * t * .pi * 2 + .pi / 2), y: 0.75 * sin(b * t * .pi * 2)) }
        }
    }

    /// Gleichmässig abgetastete Polylinie
    static func polyline(_ p: [(Double, Double)], n: Int) -> [CGPoint] {
        guard p.count > 1 else { return p.map { CGPoint(x: $0.0, y: $0.1) } }
        var lens: [Double] = [0]
        for i in 1..<p.count { lens.append(lens[i - 1] + hypot(p[i].0 - p[i - 1].0, p[i].1 - p[i - 1].1)) }
        let total = lens.last!
        var out: [CGPoint] = []
        var j = 1
        for i in 0..<n {
            let d = total * Double(i) / Double(n - 1)
            while j < p.count - 1 && lens[j] < d { j += 1 }
            let seg = max(0.0001, lens[j] - lens[j - 1])
            let t = min(1, max(0, (d - lens[j - 1]) / seg))
            out.append(CGPoint(x: p[j - 1].0 + (p[j].0 - p[j - 1].0) * t, y: p[j - 1].1 + (p[j].1 - p[j - 1].1) * t))
        }
        return out
    }
}

struct SeededRandom {
    var state: UInt64
    init(seed: UInt64) { state = seed == 0 ? 0x9E3779B97F4A7C15 : seed }
    mutating func next() -> Double {
        state ^= state << 13; state ^= state >> 7; state ^= state << 17
        return Double(state % 10_000) / 10_000
    }
}

// MARK: - Tafel (generativer Platzhalter, wenn kein Foto vorhanden ist)

/// „Tafel“ im Werkbuch-Stil: Punktraster, Kategorie-Farbe und der Faden der Kategorie.
/// Ersetzt fehlende Fotos – jedes Projekt bekommt so ein eigenes, ruhiges Motiv.
struct ThreadPlate: View {
    var seed: String
    var category: String?
    var glyph: String? = nil
    var showLabel = true
    var lineWidth: CGFloat = 1.6
    var animated = false

    @Environment(AppState.self) private var app
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var drawn: CGFloat = 1

    private var resolvedGlyph: String? { glyph ?? app.category(category)?.glyph }

    var body: some View {
        let color = CategoryPalette.color(for: category)
        let hash = seed.stableHash
        let pts = ThreadShape.points(glyph: resolvedGlyph, seed: hash)
        let rot = Angle(degrees: Double(hash % 40) - 20)
        GeometryReader { geo in
            ZStack {
                Rectangle().fill(color.opacity(0.10))
                Canvas { ctx, size in
                    // Punktraster
                    let step: CGFloat = 14
                    var dots = Path()
                    var y: CGFloat = step / 2
                    while y < size.height { var x: CGFloat = step / 2; while x < size.width { dots.addEllipse(in: CGRect(x: x - 0.6, y: y - 0.6, width: 1.2, height: 1.2)); x += step }; y += step }
                    ctx.fill(dots, with: .color(color.opacity(0.22)))
                }
                Canvas { ctx, size in
                    let s = min(size.width, size.height) * 0.36
                    let c = CGPoint(x: size.width / 2, y: size.height / 2)
                    let cr = cos(rot.radians), sr = sin(rot.radians)
                    var path = Path()
                    for (i, p) in pts.enumerated() {
                        let q = CGPoint(x: c.x + (p.x * cr - p.y * sr) * s, y: c.y + (p.x * sr + p.y * cr) * s)
                        if i == 0 { path.move(to: q) } else { path.addLine(to: q) }
                    }
                    let trimmed = path.trimmedPath(from: 0, to: drawn)
                    ctx.stroke(trimmed.offsetBy(dx: 1.2, dy: 1.6), with: .color(color.opacity(0.18)), style: StrokeStyle(lineWidth: lineWidth * 1.3, lineCap: .round, lineJoin: .round))
                    ctx.stroke(trimmed, with: .color(color), style: StrokeStyle(lineWidth: lineWidth, lineCap: .round, lineJoin: .round))
                    if let last = pts.last {
                        let q = CGPoint(x: c.x + (last.x * cr - last.y * sr) * s, y: c.y + (last.x * sr + last.y * cr) * s)
                        ctx.fill(Path(ellipseIn: CGRect(x: q.x - 2.5, y: q.y - 2.5, width: 5, height: 5)), with: .color(color))
                    }
                }
                if showLabel && geo.size.width > 120 {
                    VStack {
                        HStack {
                            Text(String(format: "Nº %03d", Int(hash % 997)))
                                .font(.wr(size: 9, weight: .medium))
                                .foregroundStyle(color.opacity(0.8))
                            Spacer()
                        }
                        Spacer()
                        HStack {
                            Spacer()
                            Text(app.categoryShort(category).uppercased())
                                .font(.wr(size: 9, weight: .semibold))
                                .tracking(1)
                                .foregroundStyle(color.opacity(0.8))
                        }
                    }
                    .padding(10)
                }
            }
        }
        .accessibilityHidden(true)
        .onAppear {
            guard animated, !reduceMotion else { return }
            drawn = 0
            withAnimation(.easeInOut(duration: 1.6)) { drawn = 1 }
        }
    }
}

/// Bild oder Tafel – die Standard-Darstellung jeder Titelfläche.
struct CoverView: View {
    var url: String?
    var seed: String
    var category: String?
    var showLabel = true
    var animated = false

    var body: some View {
        RemoteImage(path: url) {
            ThreadPlate(seed: seed, category: category, showLabel: showLabel, animated: animated)
        }
        .clipped()
    }
}
