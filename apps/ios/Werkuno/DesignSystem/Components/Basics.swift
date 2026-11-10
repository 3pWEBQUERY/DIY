import SwiftUI

// MARK: - Avatar

struct AvatarView: View {
    var url: String?
    var name: String
    var size: CGFloat = 36
    var category: String? = nil

    var body: some View {
        RemoteImage(path: url) {
            ZStack {
                Circle().fill(CategoryPalette.color(for: category ?? seedCategory).opacity(0.16))
                Text(name.initials)
                    .font(.wr(size: size * 0.38, weight: .semibold))
                    .foregroundStyle(CategoryPalette.color(for: category ?? seedCategory))
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(Circle().strokeBorder(Color.line, lineWidth: 0.5))
        .accessibilityLabel(name)
    }

    private var seedCategory: String {
        let all = ["haekeln-stricken", "naehen-textil", "holz", "keramik", "malen-zeichnen", "garten-pflanzen", "wohnen-deko", "schmuck-accessoires"]
        return all[Int(name.stableHash % UInt64(all.count))]
    }
}

// MARK: - Datenblatt-Bausteine

struct SpecLabel: View {
    var text: String
    var color: Color = .muted
    init(_ text: String, color: Color = .muted) { self.text = text; self.color = color }
    var body: some View { Text(text).specStyle(color) }
}

/// Abschnittstitel mit laufender Nummer („01 · Materialien“)
struct SectionHeader<Trailing: View>: View {
    var number: String?
    var title: String
    var subtitle: String?
    @ViewBuilder var trailing: () -> Trailing

    init(_ title: String, number: String? = nil, subtitle: String? = nil, @ViewBuilder trailing: @escaping () -> Trailing = { EmptyView() }) {
        self.title = title; self.number = number; self.subtitle = subtitle; self.trailing = trailing
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            if let number { Text(number).font(.specLarge).foregroundStyle(Color.moss) }
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.titleSerif).foregroundStyle(Color.ink)
                if let subtitle { Text(subtitle).font(.wr(.footnote)).foregroundStyle(Color.muted) }
            }
            Spacer(minLength: 8)
            trailing()
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

/// Kennzahl im Datenblatt-Stil
struct StatCell: View {
    var value: String
    var label: String
    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(value).font(.wr(.title3, .semibold)).monospacedDigit().foregroundStyle(Color.ink).contentTransition(.numericText())
            SpecLabel(label)
        }
        .accessibilityElement(children: .combine)
    }
}

/// Zeile „Label ····· Wert“
struct SpecRow: View {
    var label: String
    var value: String
    var symbol: String? = nil
    var body: some View {
        HStack(spacing: 10) {
            if let symbol { Image(systemName: symbol).font(.wr(.footnote)).foregroundStyle(Color.muted).frame(width: 18) }
            Text(label).font(.wr(.subheadline)).foregroundStyle(Color.muted)
            Spacer(minLength: 12)
            Text(value).font(.wr(.subheadline, .medium)).foregroundStyle(Color.ink).multilineTextAlignment(.trailing)
        }
        .padding(.vertical, 10)
        .hairline()
    }
}

// MARK: - Schwierigkeit & Status

struct DifficultyMeter: View {
    var level: Int
    var showLabel = true
    var body: some View {
        HStack(spacing: 6) {
            HStack(spacing: 2.5) {
                ForEach(1...5, id: \.self) { i in
                    Capsule().fill(i <= level ? Color.ink : Color.lineStrong).frame(width: 9, height: 3.5)
                }
            }
            if showLabel { Text(L.difficulty[level] ?? "").font(.wr(.caption)).foregroundStyle(Color.muted) }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Schwierigkeit: \(L.difficulty[level] ?? "\(level)") (\(level) von 5)")
    }
}

struct StatusBadge: View {
    var status: String
    var body: some View {
        let (fg, bg) = colors
        HStack(spacing: 5) {
            Circle().fill(fg).frame(width: 6, height: 6)
            Text(L.projectStatus(status)).font(.wr(.caption, .semibold)).foregroundStyle(fg)
        }
        .padding(.horizontal, 9).padding(.vertical, 4)
        // Deckende Kartenfläche darunter: auch auf Fotos immer lesbar
        .background(bg, in: Capsule())
        .background(Color.card, in: Capsule())
    }
    private var colors: (Color, Color) {
        switch status {
        case "COMPLETED": (.moss, .mossSoft)
        case "IN_PROGRESS": (.clay, .claySoft)
        case "PAUSED": (.warn, Color.warn.opacity(0.12))
        case "ARCHIVED": (.muted, .sunken)
        default: (.slate, Color.slate.opacity(0.12))
        }
    }
}

struct Pill: View {
    var text: String
    var symbol: String? = nil
    var tint: Color = .ink
    var filled = false
    var body: some View {
        HStack(spacing: 4) {
            if let symbol { Image(systemName: symbol).font(.wr(.caption2, .semibold)) }
            Text(text).font(.wr(.caption, .semibold))
        }
        .foregroundStyle(filled ? Color.paper : tint)
        .padding(.horizontal, 9).padding(.vertical, 4)
        .background(filled ? tint : tint.opacity(0.1), in: Capsule())
    }
}

// MARK: - Auswahl-Chips (mit Liquid Glass)

struct ChipBar<T: Hashable>: View {
    var items: [(value: T, label: String)]
    @Binding var selection: T
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            GlassEffectContainer(spacing: 6) {
                HStack(spacing: 6) {
                    ForEach(items, id: \.value) { item in
                        let on = item.value == selection
                        Button {
                            Haptics.selection()
                            withAnimation(.snappy) { selection = item.value }
                        } label: {
                            Text(item.label)
                                .font(.wr(.subheadline).weight(on ? .semibold : .regular))
                                .foregroundStyle(on ? Color.paper : Color.ink)
                                .padding(.horizontal, 14).padding(.vertical, 8)
                        }
                        .buttonStyle(.plain)
                        .glassEffect(on ? .regular.tint(Color.action).interactive() : .regular.interactive(), in: Capsule())
                        .accessibilityAddTraits(on ? .isSelected : [])
                    }
                }
                .padding(.horizontal, Space.gutter)
                .padding(.vertical, 4)
            }
        }
    }
}

/// Fliesslayout für Tags/Chips
struct FlowLayout: Layout {
    var spacing: CGFloat = 6
    var lineSpacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxW = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowH: CGFloat = 0, widest: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x + s.width > maxW, x > 0 { x = 0; y += rowH + lineSpacing; rowH = 0 }
            x += s.width + spacing; rowH = max(rowH, s.height); widest = max(widest, x - spacing)
        }
        return CGSize(width: proposal.width ?? widest, height: y + rowH)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowH: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x + s.width > bounds.maxX, x > bounds.minX { x = bounds.minX; y += rowH + lineSpacing; rowH = 0 }
            v.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(s))
            x += s.width + spacing; rowH = max(rowH, s.height)
        }
    }
}

struct TagList: View {
    var tags: [String]
    var body: some View {
        FlowLayout {
            ForEach(tags, id: \.self) { t in
                Text("#\(t)").font(.wr(.footnote)).foregroundStyle(Color.ink2)
                    .padding(.horizontal, 9).padding(.vertical, 4)
                    .background(Color.sunken, in: Capsule())
            }
        }
    }
}

// MARK: - Zustände

/// Kleiner Knäuel statt Spinner: ein Faden, der sich wickelt.
struct YarnSpinner: View {
    var size: CGFloat = 28
    var color: Color = .moss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        TimelineView(.animation(paused: reduceMotion)) { tl in
            let t = tl.date.timeIntervalSinceReferenceDate
            Canvas { ctx, sz in
                let c = CGPoint(x: sz.width / 2, y: sz.height / 2)
                let r = min(sz.width, sz.height) * 0.42
                var p = Path()
                let turns = 4
                for i in 0...160 {
                    let u = Double(i) / 160
                    let a = u * .pi * 2 * Double(turns) + t * 2.2
                    let tilt = sin(u * .pi * 2 + t) * 0.9
                    let x = cos(a) * r
                    let y = sin(a) * r * cos(tilt + u * 3)
                    if i == 0 { p.move(to: CGPoint(x: c.x + x, y: c.y + y)) } else { p.addLine(to: CGPoint(x: c.x + x, y: c.y + y)) }
                }
                let head = (t * 0.35).truncatingRemainder(dividingBy: 1)
                ctx.stroke(p.trimmedPath(from: 0, to: 0.25 + 0.75 * head), with: .color(color), style: StrokeStyle(lineWidth: 1.6, lineCap: .round))
            }
        }
        .frame(width: size, height: size)
        .accessibilityLabel("Lädt")
    }
}

struct LoadingView: View {
    var text: String? = nil
    var body: some View {
        VStack(spacing: 12) {
            YarnSpinner(size: 36)
            if let text { Text(text).font(.wr(.footnote)).foregroundStyle(Color.muted) }
        }
        .frame(maxWidth: .infinity, minHeight: 220)
    }
}

struct EmptyStateView: View {
    var symbol: String = "sparkles"
    var title: String
    var message: String? = nil
    var actionTitle: String? = nil
    var action: (() -> Void)? = nil

    var body: some View {
        VStack(spacing: 12) {
            ZStack {
                Circle().fill(Color.mossSoft).frame(width: 64, height: 64)
                Image(systemName: symbol).font(.wr(.title2)).foregroundStyle(Color.moss)
            }
            Text(title).font(.titleSerif).foregroundStyle(Color.ink).multilineTextAlignment(.center)
            if let message { Text(message).font(.wr(.subheadline)).foregroundStyle(Color.muted).multilineTextAlignment(.center) }
            if let actionTitle, let action {
                Button(actionTitle, action: action).buttonStyle(.glassProminent).tint(.moss).padding(.top, 4)
            }
        }
        .padding(32)
        .frame(maxWidth: .infinity)
    }
}

struct ErrorStateView: View {
    var message: String
    var retry: (() async -> Void)?
    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "wifi.exclamationmark").font(.wr(.title)).foregroundStyle(Color.clay)
            Text("Das hat nicht geklappt").font(.titleSerif)
            Text(message).font(.wr(.subheadline)).foregroundStyle(Color.muted).multilineTextAlignment(.center)
            if let retry {
                Button("Erneut versuchen") { Task { await retry() } }.buttonStyle(.glass)
            }
        }
        .padding(32)
        .frame(maxWidth: .infinity, minHeight: 260)
    }
}

/// Hinweisbox (info / warn / danger / success)
struct NoticeView: View {
    enum Tone { case info, warn, danger, success }
    var tone: Tone = .info
    var title: String? = nil
    var message: String
    var body: some View {
        let c: Color = switch tone { case .info: .slate; case .warn: .warn; case .danger: .danger; case .success: .moss }
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: tone == .danger ? "exclamationmark.octagon.fill" : tone == .warn ? "exclamationmark.triangle.fill" : tone == .success ? "checkmark.seal.fill" : "info.circle.fill")
                .foregroundStyle(c)
            VStack(alignment: .leading, spacing: 3) {
                if let title { Text(title).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink) }
                Text(message).font(.wr(.footnote)).foregroundStyle(Color.ink2)
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .background(c.opacity(0.1), in: .rect(cornerRadius: Radius.inner, style: .continuous))
        .overlay(alignment: .leading) { Rectangle().fill(c).frame(width: 2.5).clipShape(.rect(cornerRadius: 2)) }
    }
}

// MARK: - Buttons

/// Button mit Ladezustand für asynchrone Aktionen
struct AsyncButton<Label: View>: View {
    var role: ButtonRole? = nil
    var action: () async -> Void
    @ViewBuilder var label: () -> Label
    @State private var running = false

    var body: some View {
        Button(role: role) {
            guard !running else { return }
            running = true
            Task {
                await action()
                running = false
            }
        } label: {
            ZStack {
                label().opacity(running ? 0 : 1)
                if running { ProgressView().controlSize(.small) }
            }
        }
        .disabled(running)
    }
}

extension AsyncButton where Label == Text {
    init(_ title: String, role: ButtonRole? = nil, action: @escaping () async -> Void) {
        self.role = role; self.action = action; self.label = { Text(title) }
    }
}

/// Breiter Primärbutton (Liquid Glass, Moos)
struct PrimaryButtonStyleModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .font(.wr(.body, .semibold))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 4)
            .buttonStyle(.glassProminent)
            .tint(.moss)
            .controlSize(.large)
    }
}

extension View {
    func primaryButton() -> some View { modifier(PrimaryButtonStyleModifier()) }
}

// MARK: - Toast

struct ToastOverlay: ViewModifier {
    @Environment(AppState.self) private var app
    func body(content: Content) -> some View {
        content.overlay(alignment: .top) {
            if let t = app.toast {
                HStack(spacing: 10) {
                    Image(systemName: icon(t.style)).foregroundStyle(color(t.style))
                    Text(t.message).font(.wr(.subheadline, .medium)).foregroundStyle(Color.ink).multilineTextAlignment(.leading)
                }
                .padding(.horizontal, 16).padding(.vertical, 12)
                .glassEffect(.regular, in: Capsule())
                .padding(.horizontal, 24)
                .padding(.top, 6)
                .transition(.move(edge: .top).combined(with: .opacity))
                .id(t.id)
                .onTapGesture { withAnimation { app.toast = nil } }
                .task(id: t.id) {
                    if t.style == .error { Haptics.warning() } else { Haptics.success() }
                    try? await Task.sleep(for: .seconds(t.style == .error ? 4.5 : 2.6))
                    withAnimation(.easeOut) { if app.toast?.id == t.id { app.toast = nil } }
                }
                .accessibilityAddTraits(.updatesFrequently)
            }
        }
    }
    private func icon(_ s: Toast.Style) -> String { switch s { case .success: "checkmark.circle.fill"; case .error: "xmark.octagon.fill"; case .warning: "exclamationmark.triangle.fill"; case .info: "info.circle.fill" } }
    private func color(_ s: Toast.Style) -> Color { switch s { case .success: .moss; case .error: .danger; case .warning: .warn; case .info: .slate } }
}

extension View {
    func toastOverlay() -> some View { modifier(ToastOverlay()) }
}

// MARK: - Seitenkopf (redaktionell)

struct PageTitle: View {
    var kicker: String?
    var title: String
    var subtitle: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let kicker { SpecLabel(kicker, color: .moss) }
            Text(title).font(.display(32)).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
            if let subtitle { Text(subtitle).font(.wr(.subheadline)).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

/// Lädt weitere Seiten, wenn sichtbar.
struct LoadMoreTrigger: View {
    var hasMore: Bool
    var load: () async -> Void
    var body: some View {
        if hasMore {
            YarnSpinner(size: 22).frame(maxWidth: .infinity).padding(.vertical, 20)
                .task { await load() }
        }
    }
}
