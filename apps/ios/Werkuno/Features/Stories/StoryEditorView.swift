import SwiftUI

/// Story-Editor (Vollbild): Text, Sticker (Emoji, @Erwähnung, Projekt, Uhrzeit, Datum), Zeichnen,
/// Filter, Zuschneiden (Fotos), Textstil (Text-Stories) und Ebenen – gleiche Gestaltung wie im Web
/// (`components/stories/editor`). Ebenen verschieben, mit zwei Fingern skalieren und drehen,
/// zum Löschen auf den Papierkorb ziehen. Rückgängig/Wiederholen für jede Änderung.
struct StoryEditorView: View {
    enum Base {
        case image(UIImage)
        case video(poster: UIImage?)
        case text(String, StoryBackground)
    }

    var base: Base
    @Binding var layout: StoryLayoutData
    var projects: [IdTitle]
    /// Fotos: neuer Ausschnitt (wird neu hochgeladen)
    var onCrop: ((UIImage) -> Void)?

    @Environment(\.dismiss) private var dismiss
    @State private var work = StoryLayoutData()
    @State private var history: [StoryLayoutData] = []
    @State private var future: [StoryLayoutData] = []
    @State private var live: LiveTransform?
    @State private var overTrash = false
    @State private var tool: Tool?
    @State private var textDraft: TextDraft?
    @State private var drawing = false
    @State private var pen = PenSettings()
    @State private var currentStroke: [CGPoint] = []
    @State private var notice: String?
    @State private var loaded = false
    @FocusState private var textFocused: Bool

    private static let space = "story-stage"

    private enum Tool: String, Identifiable {
        case stickers, filter, layers, textLook, crop
        var id: String { rawValue }
    }

    private struct LiveTransform {
        var id: String
        var dx: CGFloat = 0
        var dy: CGFloat = 0
        var scale: CGFloat = 1
        var rotation: Double = 0
        var neutral: Bool { dx == 0 && dy == 0 && scale == 1 && rotation == 0 }
    }

    private struct TextDraft {
        var id: String?
        var text = ""
        var color: StoryPalette = .white
        var style: StoryTextStyle = .bold
        var align: StoryTextAlign = .center
        var shade = false
    }

    private struct PenSettings {
        var marker = false
        var color: StoryPalette = .white
        var width = 0.012
    }

    private var isText: Bool { if case .text = base { true } else { false } }
    private var isPhoto: Bool { if case .image = base { true } else { false } }

    var body: some View {
        GeometryReader { geo in
            let stage = Self.fit(CGSize(width: geo.size.width, height: geo.size.height - 150))
            VStack(spacing: 0) {
                topBar
                Spacer(minLength: 0)
                stageView(stage)
                    .frame(width: stage.width, height: stage.height)
                    .clipShape(.rect(cornerRadius: 16, style: .continuous))
                Spacer(minLength: 0)
                bottomBar
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .overlay { if textDraft != nil { textEditor(stage) } }
        }
        .background(Color.black.ignoresSafeArea())
        .preferredColorScheme(.dark)
        .onAppear {
            guard !loaded else { return }
            loaded = true
            var l = layout
            l.elements.sort { $0.z < $1.z }
            for i in l.elements.indices { l.elements[i].z = i }
            work = l
        }
        .sheet(item: $tool) { t in
            switch t {
            case .stickers:
                StoryStickerSheet(projects: projects) { e in add(e) }
                    .presentationDetents([.medium, .large])
            case .filter:
                filterSheet.presentationDetents([.height(250)])
            case .layers:
                layersSheet.presentationDetents([.medium, .large])
            case .textLook:
                textLookSheet.presentationDetents([.height(300)])
            case .crop:
                if case .image(let img) = base {
                    StoryCropView(image: img) { cropped in
                        onCrop?(cropped)
                        tool = nil
                    }
                }
            }
        }
    }

    // MARK: Leisten

    private var topBar: some View {
        HStack(spacing: 18) {
            Button("Abbrechen") { dismiss() }
            Spacer()
            Button { undo() } label: { Image(systemName: "arrow.uturn.backward") }
                .disabled(history.isEmpty)
                .accessibilityLabel("Rückgängig")
            Button { redo() } label: { Image(systemName: "arrow.uturn.forward") }
                .disabled(future.isEmpty)
                .accessibilityLabel("Wiederholen")
            Spacer()
            Button {
                layout = work
                dismiss()
            } label: { Text("Fertig").fontWeight(.semibold) }
        }
        .font(.wr(.body))
        .foregroundStyle(.white)
        .padding(.horizontal, 18)
        .frame(height: 52)
    }

    @ViewBuilder private var bottomBar: some View {
        if drawing {
            drawControls
        } else {
            VStack(spacing: 6) {
                if let notice {
                    Text(notice).font(.wr(.caption)).foregroundStyle(.white.opacity(0.85))
                }
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        toolButton("Text", "textformat") { textDraft = TextDraft(); textFocused = true }
                        toolButton("Sticker", "face.smiling") { tool = .stickers }
                        toolButton("Zeichnen", "scribble") { drawing = true }
                        if isText {
                            toolButton("Textstil", "textformat.size") { tool = .textLook }
                        } else {
                            toolButton("Filter", "camera.filters") { tool = .filter }
                        }
                        if isPhoto, onCrop != nil {
                            toolButton("Zuschneiden", "crop") { tool = .crop }
                        }
                        toolButton("Ebenen", "square.3.layers.3d") { tool = .layers }
                    }
                    .padding(.horizontal, 14)
                }
            }
            .frame(height: 98)
        }
    }

    private func toolButton(_ label: String, _ symbol: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: symbol).font(.system(size: 20, weight: .medium))
                    .frame(width: 48, height: 48)
                    .background(.white.opacity(0.12), in: Circle())
                Text(label).font(.wr(.caption2, .semibold))
            }
            .foregroundStyle(.white)
            .frame(width: 72)
        }
        .buttonStyle(.plain)
    }

    // MARK: Bühne

    @ViewBuilder private func stageView(_ stage: CGSize) -> some View {
        ZStack {
            baseView(stage)
            ForEach(work.elements) { e in
                if e.kind == .drawing {
                    StoryDrawingView(element: e, stage: stage).allowsHitTesting(false)
                } else {
                    editable(e, stage)
                }
            }
            if drawing { drawLayer(stage) }
            if live != nil && !drawing { trash(stage) }
        }
        .coordinateSpace(.named(Self.space))
    }

    @ViewBuilder private func baseView(_ stage: CGSize) -> some View {
        switch base {
        case .image(let img):
            ZStack {
                Color(hex: 0x151312)
                Image(uiImage: img)
                    .resizable()
                    .aspectRatio(contentMode: Self.fills(img.size) ? .fill : .fit)
                    .frame(width: stage.width, height: stage.height)
                    .clipped()
                    .modifier(StoryFilterModifier(filter: work.filter, intensity: work.intensity))
            }
        case .video(let poster):
            ZStack {
                Color(hex: 0x151312)
                if let poster {
                    Image(uiImage: poster)
                        .resizable()
                        .aspectRatio(contentMode: Self.fills(poster.size) ? .fill : .fit)
                        .frame(width: stage.width, height: stage.height)
                        .clipped()
                        .modifier(StoryFilterModifier(filter: work.filter, intensity: work.intensity))
                }
                Image(systemName: "play.fill")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 34, height: 34)
                    .background(.black.opacity(0.5), in: Circle())
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                    .padding(12)
            }
        case .text(let text, let bg):
            StoryTextStage(text: text, bg: bg, look: work.textLook, width: stage.width, placeholder: "Dein Text")
        }
    }

    /// Verschiebbare, skalier- und drehbare Ebene
    private func editable(_ e: StoryElement, _ stage: CGSize) -> some View {
        let l = live?.id == e.id ? live! : LiveTransform(id: e.id)
        let dragging = live?.id == e.id
        return StoryElementBody(element: e, width: stage.width)
            .scaleEffect(e.scale * l.scale)
            .rotationEffect(.degrees(e.rotation + l.rotation))
            .opacity(dragging && overTrash ? 0.45 : 1)
            .contentShape(.rect)
            .gesture(elementGesture(e, stage))
            .onTapGesture { tapped(e) }
            .position(x: e.x * stage.width + l.dx, y: e.y * stage.height + l.dy)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(e.summary)
            .accessibilityAction(named: "Löschen") { remove(e.id) }
    }

    private func elementGesture(_ e: StoryElement, _ stage: CGSize) -> some Gesture {
        let drag = DragGesture(minimumDistance: 2, coordinateSpace: .named(Self.space))
            .onChanged { v in
                begin(e.id)
                live?.dx = v.translation.width
                live?.dy = v.translation.height
                let hit = Self.isOverTrash(v.location, stage)
                if hit != overTrash {
                    overTrash = hit
                    if hit { Haptics.selection() }
                }
            }
            .onEnded { _ in endDrag(e.id, stage) }
        let pinch = MagnifyGesture()
            .onChanged { v in
                begin(e.id)
                live?.scale = v.magnification
            }
            .onEnded { _ in endPinch(e.id) }
        let rotate = RotateGesture()
            .onChanged { v in
                begin(e.id)
                live?.rotation = v.rotation.degrees
            }
            .onEnded { _ in endRotate(e.id) }
        return drag.simultaneously(with: pinch.simultaneously(with: rotate))
    }

    private func trash(_ stage: CGSize) -> some View {
        Image(systemName: "trash")
            .font(.system(size: 18, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: 52, height: 52)
            .background(overTrash ? Color(hex: 0xB64B3A) : .black.opacity(0.45), in: Circle())
            .scaleEffect(overTrash ? 1.15 : 1)
            .position(x: stage.width / 2, y: stage.height - 46)
            .allowsHitTesting(false)
            .animation(.snappy(duration: 0.15), value: overTrash)
    }

    static func isOverTrash(_ p: CGPoint, _ stage: CGSize) -> Bool {
        abs(p.x - stage.width / 2) < 50 && p.y > stage.height - 96
    }

    // MARK: Gesten übernehmen

    private func begin(_ id: String) {
        guard live?.id != id else { return }
        snapshot()
        live = LiveTransform(id: id)
    }

    private func update(_ id: String, _ change: (inout StoryElement) -> Void) {
        guard let i = work.elements.firstIndex(where: { $0.id == id }) else { return }
        change(&work.elements[i])
    }

    private func settle() {
        if live?.neutral == true { live = nil }
    }

    private func endDrag(_ id: String, _ stage: CGSize) {
        guard let l = live, l.id == id else { return }
        if overTrash {
            overTrash = false
            live = nil
            work.elements.removeAll { $0.id == id }
            renumber()
            Haptics.success()
            return
        }
        update(id) { e in
            e.x = min(1, max(0, e.x + Double(l.dx / stage.width)))
            e.y = min(1, max(0, e.y + Double(l.dy / stage.height)))
        }
        live?.dx = 0
        live?.dy = 0
        settle()
    }

    private func endPinch(_ id: String) {
        guard let l = live, l.id == id else { return }
        update(id) { e in e.scale = min(StoryLayoutRules.scaleMax, max(StoryLayoutRules.scaleMin, e.scale * Double(l.scale))) }
        live?.scale = 1
        settle()
    }

    private func endRotate(_ id: String) {
        guard let l = live, l.id == id else { return }
        update(id) { e in e.rotation = StoryLayoutData.normalized(e.rotation + l.rotation) }
        live?.rotation = 0
        settle()
    }

    private func tapped(_ e: StoryElement) {
        switch e.kind {
        case .text:
            textDraft = TextDraft(id: e.id, text: e.text, color: e.color, style: e.style, align: e.align, shade: e.bg == "shade")
            textFocused = true
        case .mention, .projectLink, .time:
            // Antippen wechselt die Farbe des Stickers
            snapshot()
            update(e.id) { el in
                let all = StoryPalette.allCases
                let i = all.firstIndex(of: el.color) ?? 0
                el.color = all[(i + 1) % all.count]
            }
            Haptics.selection()
        default:
            break
        }
    }

    // MARK: Verlauf

    private func snapshot() {
        history.append(work)
        if history.count > 60 { history.removeFirst() }
        future.removeAll()
    }

    private func undo() {
        guard let prev = history.popLast() else { return }
        future.append(work)
        work = prev
        live = nil
    }

    private func redo() {
        guard let next = future.popLast() else { return }
        history.append(work)
        work = next
        live = nil
    }

    private func renumber() {
        for i in work.elements.indices { work.elements[i].z = i }
    }

    private func add(_ e: StoryElement) {
        guard work.elements.count < StoryLayoutRules.elementsMax else {
            flash("Höchstens \(StoryLayoutRules.elementsMax) Ebenen pro Story.")
            return
        }
        if e.kind == .mention, work.elements.contains(where: { $0.kind == .mention && $0.handle == e.handle }) {
            flash("@\(e.handle) ist schon erwähnt.")
            return
        }
        snapshot()
        var n = e
        n.z = work.elements.count
        work.elements.append(n)
        tool = nil
        Haptics.tap()
    }

    private func remove(_ id: String) {
        snapshot()
        work.elements.removeAll { $0.id == id }
        renumber()
    }

    private func flash(_ text: String) {
        notice = text
        Haptics.warning()
        Task {
            try? await Task.sleep(for: .seconds(2.5))
            if notice == text { notice = nil }
        }
    }

    // MARK: Text

    private func textEditor(_ stage: CGSize) -> some View {
        let d = textDraft ?? TextDraft()
        let size = stage.width * StoryLayoutRules.textSize * 1.25
        let fg: Color = d.style == .pill ? d.color.onColor : d.color.color
        return ZStack {
            Color.black.opacity(0.7).ignoresSafeArea()
                .onTapGesture { commitText() }
            VStack(spacing: 14) {
                HStack(spacing: 10) {
                    pillButton(d.style.label) { cycleStyle() }
                    pillButton(nil, symbol: d.align.symbol) { cycleAlign() }
                    if d.style != .pill {
                        pillButton("Hintergrund", active: d.shade) { textDraft?.shade.toggle() }
                    }
                    Spacer()
                    Button("Fertig") { commitText() }
                        .font(.wr(.body, .semibold))
                        .foregroundStyle(.white)
                }
                .padding(.horizontal, 18)
                .padding(.top, 8)
                Spacer(minLength: 0)
                TextField("", text: textBinding, prompt: Text("Text eingeben").foregroundStyle(.white.opacity(0.5)), axis: .vertical)
                    .focused($textFocused)
                    .font(storyFont(size, d.style.weight))
                    .textCase(d.style == .caps ? .uppercase : nil)
                    .multilineTextAlignment(d.align.textAlignment)
                    .foregroundStyle(fg)
                    .tint(.white)
                    .padding(.horizontal, d.style == .pill || d.shade ? 12 : 0)
                    .padding(.vertical, d.style == .pill || d.shade ? 6 : 0)
                    .background(textBackground(d), in: .rect(cornerRadius: 10, style: .continuous))
                    .padding(.horizontal, 28)
                    .accessibilityLabel("Text der Ebene")
                Spacer(minLength: 0)
                paletteRow(selected: d.color) { c in textDraft?.color = c }
                    .padding(.bottom, 10)
            }
        }
    }

    private func textBackground(_ d: TextDraft) -> Color {
        if d.style == .pill { return d.color.color }
        return d.shade ? Color.black.opacity(0.55) : .clear
    }

    private var textBinding: Binding<String> {
        Binding(
            get: { textDraft?.text ?? "" },
            set: { v in textDraft?.text = String(v.prefix(StoryLayoutRules.elementTextMax)) }
        )
    }

    private func cycleStyle() {
        guard let d = textDraft else { return }
        let all = StoryTextStyle.allCases
        textDraft?.style = all[((all.firstIndex(of: d.style) ?? 0) + 1) % all.count]
    }

    private func cycleAlign() {
        guard let d = textDraft else { return }
        let all = StoryTextAlign.allCases
        textDraft?.align = all[((all.firstIndex(of: d.align) ?? 0) + 1) % all.count]
    }

    private func commitText() {
        guard let d = textDraft else { return }
        textDraft = nil
        textFocused = false
        let text = d.text.trimmed
        if let id = d.id {
            if text.isEmpty {
                remove(id)
                return
            }
            snapshot()
            update(id) { e in
                e.text = text
                e.color = d.color
                e.style = d.style
                e.align = d.align
                e.bg = d.style != .pill && d.shade ? "shade" : nil
            }
        } else if !text.isEmpty {
            var e = StoryElement(id: StoryElement.newId(), kind: .text)
            e.y = 0.42
            e.text = text
            e.color = d.color
            e.style = d.style
            e.align = d.align
            e.bg = d.style != .pill && d.shade ? "shade" : nil
            add(e)
        }
    }

    private func pillButton(_ label: String?, symbol: String? = nil, active: Bool = false, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 4) {
                if let symbol { Image(systemName: symbol) }
                if let label { Text(label) }
            }
            .font(.wr(.subheadline, .semibold))
            .foregroundStyle(active ? Color(hex: 0x262427) : .white)
            .padding(.horizontal, 12)
            .frame(height: 34)
            .background(active ? Color.white : Color.white.opacity(0.15), in: Capsule())
        }
        .buttonStyle(.plain)
    }

    private func paletteRow(selected: StoryPalette, _ pick: @escaping (StoryPalette) -> Void) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(StoryPalette.allCases) { c in
                    Button { pick(c); Haptics.selection() } label: {
                        Circle().fill(c.color)
                            .frame(width: 28, height: 28)
                            .overlay(Circle().strokeBorder(.white.opacity(0.6), lineWidth: 1))
                            .padding(3)
                            .overlay(Circle().strokeBorder(selected == c ? Color.white : .clear, lineWidth: 2))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(c.label)
                    .accessibilityAddTraits(selected == c ? .isSelected : [])
                }
            }
            .padding(.horizontal, 18)
        }
    }

    // MARK: Zeichnen

    private func drawLayer(_ stage: CGSize) -> some View {
        ZStack {
            if currentStroke.count > 1 {
                Path { p in p.addLines(currentStroke) }
                    .stroke(pen.color.color.opacity(pen.marker ? 0.55 : 1), style: StrokeStyle(lineWidth: pen.width * stage.width, lineCap: pen.marker ? .square : .round, lineJoin: .round))
            }
            Color.clear
                .contentShape(.rect)
                .gesture(
                    DragGesture(minimumDistance: 0, coordinateSpace: .local)
                        .onChanged { v in currentStroke.append(v.location) }
                        .onEnded { _ in finishStroke(stage) }
                )
        }
        .frame(width: stage.width, height: stage.height)
        .accessibilityLabel("Zeichenfläche")
    }

    private func finishStroke(_ stage: CGSize) {
        let pts = currentStroke
        currentStroke = []
        guard !pts.isEmpty, stage.width > 0, stage.height > 0 else { return }
        if work.strokeCount >= StoryLayoutRules.strokesMax {
            flash("Höchstens \(StoryLayoutRules.strokesMax) Striche pro Story.")
            return
        }
        let budget = StoryLayoutRules.pointsMax - work.pointCount
        let flat = Self.simplify(pts, stage: stage, budget: budget)
        guard flat.count >= 2 else {
            flash("Die Zeichnung ist zu detailliert.")
            return
        }
        snapshot()
        let stroke = StoryStroke(marker: pen.marker, color: pen.color, width: pen.width, points: flat)
        // Unverschobene Zeichnung weiterführen, sonst eine neue Ebene
        if let i = work.elements.lastIndex(where: { $0.kind == .drawing && $0.x == 0.5 && $0.y == 0.5 && $0.scale == 1 && $0.rotation == 0 }) {
            work.elements[i].strokes.append(stroke)
        } else if work.elements.count < StoryLayoutRules.elementsMax {
            var e = StoryElement(id: StoryElement.newId(), kind: .drawing)
            e.strokes = [stroke]
            e.z = work.elements.count
            work.elements.append(e)
        } else {
            history.removeLast()
            flash("Höchstens \(StoryLayoutRules.elementsMax) Ebenen pro Story.")
        }
    }

    /// Punkte relativ zur Bühne, ohne dicht aufeinanderfolgende (Abstand in Bühnenbreiten), höchstens `budget`
    static func simplify(_ pts: [CGPoint], stage: CGSize, budget: Int) -> [Double] {
        var out: [Double] = []
        var last: (Double, Double)?
        for p in pts {
            let x = min(1, max(0, Double(p.x / stage.width)))
            let y = min(1, max(0, Double(p.y / stage.height)))
            if let l = last, hypot(x - l.0, (y - l.1) * StoryLayoutRules.stageRatio) < 0.004 { continue }
            out.append((x * 1000).rounded() / 1000)
            out.append((y * 1000).rounded() / 1000)
            last = (x, y)
            if out.count / 2 >= budget { break }
        }
        if let p = pts.last, out.count >= 2 {
            let x = (min(1, max(0, Double(p.x / stage.width))) * 1000).rounded() / 1000
            let y = (min(1, max(0, Double(p.y / stage.height))) * 1000).rounded() / 1000
            if out[out.count - 2] != x || out[out.count - 1] != y, out.count / 2 < budget {
                out.append(x)
                out.append(y)
            }
        }
        return out
    }

    private var drawControls: some View {
        VStack(spacing: 10) {
            HStack(spacing: 10) {
                pillButton("Stift", active: !pen.marker) {
                    pen.marker = false
                    pen.width = 0.012
                }
                pillButton("Marker", active: pen.marker) {
                    pen.marker = true
                    pen.width = 0.04
                }
                Slider(value: $pen.width, in: StoryLayoutRules.strokeWidthMin...StoryLayoutRules.strokeWidthMax)
                    .tint(.white)
                    .accessibilityLabel("Strichstärke")
                Button("Fertig") { drawing = false }
                    .font(.wr(.body, .semibold))
                    .foregroundStyle(.white)
            }
            .padding(.horizontal, 18)
            paletteRow(selected: pen.color) { c in pen.color = c }
        }
        .frame(height: 98)
    }

    // MARK: Filter, Textstil, Ebenen

    private var filterSheet: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Filter").font(.wr(.headline))
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(StoryFilterKind.allCases) { f in
                        Button {
                            if work.filter != f {
                                snapshot()
                                work.filter = f
                                if work.intensity == 0 { work.intensity = 100 }
                            }
                        } label: {
                            Text(f.label)
                                .font(.wr(.subheadline, .semibold))
                                .padding(.horizontal, 14)
                                .frame(height: 36)
                                .background(work.filter == f ? Color.ink : Color.card, in: Capsule())
                                .foregroundStyle(work.filter == f ? Color.paper : Color.ink)
                                .overlay(Capsule().strokeBorder(Color.line))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            if work.filter != .original {
                HStack {
                    Text("Stärke").font(.wr(.subheadline))
                    Slider(value: $work.intensity, in: 0...100, step: 1) { editing in if editing { snapshot() } }
                        .tint(Color.moss)
                    Text("\(Int(work.intensity))").font(.wr(.caption)).monospacedDigit().frame(width: 30)
                }
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Color.paper)
    }

    private var textLookSheet: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Textstil").font(.wr(.headline))
            Picker("Stil", selection: lookBinding(\.style)) {
                ForEach(StoryTextStyle.allCases) { Text($0.label).tag($0) }
            }
            .pickerStyle(.segmented)
            Picker("Ausrichtung", selection: lookBinding(\.align)) {
                ForEach(StoryTextAlign.allCases) { a in Image(systemName: a.symbol).tag(a).accessibilityLabel(a.label) }
            }
            .pickerStyle(.segmented)
            HStack {
                Text("Grösse").font(.wr(.subheadline))
                Slider(value: lookBinding(\.scale), in: 0.5...2)
                    .tint(Color.moss)
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Color.paper)
    }

    private func lookBinding<V: Equatable>(_ key: WritableKeyPath<StoryTextLook, V>) -> Binding<V> {
        Binding(
            get: { work.textLook[keyPath: key] },
            set: { v in
                guard work.textLook[keyPath: key] != v else { return }
                snapshot()
                work.textLook[keyPath: key] = v
            }
        )
    }

    private var layersSheet: some View {
        NavigationStack {
            List {
                if work.elements.isEmpty {
                    Text("Noch keine Ebenen. Füge Text, Sticker oder eine Zeichnung hinzu.")
                        .font(.wr(.subheadline))
                        .foregroundStyle(Color.muted)
                }
                ForEach(work.elements.reversed()) { e in
                    HStack {
                        Text(e.summary).font(.wr(.subheadline)).lineLimit(1)
                        Spacer()
                        Button { move(e.id, by: 1) } label: { Image(systemName: "arrow.up") }
                            .disabled(work.elements.last?.id == e.id)
                            .accessibilityLabel("Nach vorne")
                        Button { move(e.id, by: -1) } label: { Image(systemName: "arrow.down") }
                            .disabled(work.elements.first?.id == e.id)
                            .accessibilityLabel("Nach hinten")
                    }
                    .buttonStyle(.borderless)
                    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                        Button("Löschen", role: .destructive) { remove(e.id) }
                    }
                }
            }
            .navigationTitle("Ebenen")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private func move(_ id: String, by delta: Int) {
        guard let i = work.elements.firstIndex(where: { $0.id == id }) else { return }
        let j = i + delta
        guard work.elements.indices.contains(j) else { return }
        snapshot()
        work.elements.swapAt(i, j)
        renumber()
    }

    // MARK: Hilfen

    /// Grösste 9:16-Bühne in der Fläche
    static func fit(_ area: CGSize) -> CGSize {
        let w = max(1, min(area.width - 24, area.height * 9 / 16))
        return CGSize(width: w, height: w * 16 / 9)
    }

    /// Fast hochformatige Bilder füllen die Bühne (wie im Betrachter)
    static func fills(_ size: CGSize) -> Bool {
        guard size.height > 0 else { return true }
        let r = size.width / size.height
        return r > 0.5 && r < 0.66
    }
}

// MARK: - Sticker

/// Sticker wählen: Emoji, @Erwähnung, eigenes Projekt, Uhrzeit, Datum
struct StoryStickerSheet: View {
    var projects: [IdTitle]
    var onPick: (StoryElement) -> Void

    @State private var mode: Mode = .stickers
    @State private var query = ""
    @State private var people: [StoryAPI.MentionSuggestion] = []
    @State private var searching = false

    private enum Mode { case stickers, mention, project }
    private let columns = Array(repeating: GridItem(.flexible(), spacing: 6), count: 6)

    var body: some View {
        NavigationStack {
            Group {
                switch mode {
                case .stickers: stickers
                case .mention: mention
                case .project: projectList
                }
            }
            .navigationTitle(mode == .mention ? "Person erwähnen" : mode == .project ? "Projekt verlinken" : "Sticker")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if mode != .stickers {
                    ToolbarItem(placement: .cancellationAction) { Button("Zurück") { mode = .stickers } }
                }
            }
        }
    }

    private var stickers: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        chip("@Erwähnung", "at") { mode = .mention }
                        if !projects.isEmpty { chip("Projekt", "arrow.up.right") { mode = .project } }
                        chip(Self.label(.time), "clock") { onPick(Self.time("time")) }
                        chip(Self.label(.date), "calendar") { onPick(Self.time("date")) }
                    }
                }
                LazyVGrid(columns: columns, spacing: 6) {
                    ForEach(StoryLayoutRules.emojis, id: \.self) { emoji in
                        Button {
                            var e = StoryElement(id: StoryElement.newId(), kind: .emoji)
                            e.emoji = emoji
                            onPick(e)
                        } label: {
                            Text(emoji).font(.system(size: 34)).frame(maxWidth: .infinity, minHeight: 52)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Sticker \(emoji)")
                    }
                }
            }
            .padding(16)
        }
        .background(Color.paper)
    }

    private var mention: some View {
        List {
            Section {
                TextField("Name oder @Benutzername", text: $query)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }
            if searching && people.isEmpty {
                ProgressView().frame(maxWidth: .infinity)
            }
            ForEach(people) { p in
                Button {
                    var e = StoryElement(id: StoryElement.newId(), kind: .mention)
                    e.handle = p.handle
                    e.y = 0.6
                    onPick(e)
                } label: {
                    HStack(spacing: 12) {
                        AvatarView(url: p.avatarUrl, name: p.displayName, size: 36)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(p.displayName).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink)
                            Text("@\(p.handle)").font(.wr(.caption)).foregroundStyle(Color.muted)
                        }
                    }
                }
            }
            if !searching, people.isEmpty, !query.trimmed.isEmpty {
                Text("Niemand gefunden.").font(.wr(.subheadline)).foregroundStyle(Color.muted)
            }
        }
        .task(id: query) { await search() }
    }

    private var projectList: some View {
        List(projects) { p in
            Button {
                var e = StoryElement(id: StoryElement.newId(), kind: .projectLink)
                e.projectId = p.id
                e.projectTitle = p.title
                e.color = .coral
                e.y = 0.66
                onPick(e)
            } label: {
                Label(p.title, systemImage: "arrow.up.right").foregroundStyle(Color.ink)
            }
        }
    }

    private func search() async {
        let q = query.trimmed
        guard !q.isEmpty else {
            people = []
            return
        }
        try? await Task.sleep(for: .milliseconds(250))
        guard !Task.isCancelled else { return }
        searching = true
        defer { searching = false }
        people = (try? await StoryAPI.mentionSuggestions(q)) ?? []
    }

    private func chip(_ label: String, _ symbol: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(label, systemImage: symbol)
                .font(.wr(.subheadline, .semibold))
                .foregroundStyle(Color.ink)
                .padding(.horizontal, 14)
                .frame(height: 40)
                .background(Color.card, in: .rect(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Color.line))
        }
        .buttonStyle(.plain)
    }

    private enum Clock { case time, date }

    private static func label(_ c: Clock) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "de_CH")
        f.timeZone = TimeZone(identifier: "Europe/Zurich")
        f.dateFormat = c == .time ? "HH:mm" : "EEEE, d. MMMM"
        return f.string(from: .now)
    }

    private static func time(_ variant: String) -> StoryElement {
        var e = StoryElement(id: StoryElement.newId(), kind: .time)
        e.variant = variant
        e.text = label(variant == "time" ? .time : .date)
        e.y = 0.3
        return e
    }
}

// MARK: - Zuschneiden

/// Ausschnitt im Story-Format 9:16 wählen (verschieben, mit zwei Fingern zoomen). Hochgeladen wird nur
/// der Ausschnitt – die weggeschnittenen Bildteile verlassen das Gerät nicht.
struct StoryCropView: View {
    var image: UIImage
    var onDone: (UIImage) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var zoom: CGFloat = 1
    @State private var offset: CGSize = .zero
    @GestureState private var pinch: CGFloat = 1
    @GestureState private var pan: CGSize = .zero

    var body: some View {
        GeometryReader { geo in
            let view = StoryEditorView.fit(CGSize(width: geo.size.width, height: geo.size.height - 120))
            VStack(spacing: 18) {
                HStack {
                    Button("Abbrechen") { dismiss() }
                    Spacer()
                    Text("Zuschneiden").font(.wr(.headline))
                    Spacer()
                    Button("Übernehmen") { apply(view) }.fontWeight(.semibold)
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 18)
                .padding(.top, 12)
                Spacer(minLength: 0)
                cropStage(view)
                Spacer(minLength: 0)
                Text("Verschieben und mit zwei Fingern zoomen").font(.wr(.caption)).foregroundStyle(.white.opacity(0.7))
                    .padding(.bottom, 16)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(Color.black.ignoresSafeArea())
        .preferredColorScheme(.dark)
    }

    private func baseScale(_ view: CGSize) -> CGFloat {
        let s = image.size
        guard s.width > 0, s.height > 0 else { return 1 }
        return max(view.width / s.width, view.height / s.height)
    }

    private func clamp(_ o: CGSize, scale: CGFloat, view: CGSize) -> CGSize {
        let w = image.size.width * scale
        let h = image.size.height * scale
        let mx = max(0, (w - view.width) / 2)
        let my = max(0, (h - view.height) / 2)
        return CGSize(width: min(mx, max(-mx, o.width)), height: min(my, max(-my, o.height)))
    }

    private func cropStage(_ view: CGSize) -> some View {
        let z = min(5, max(1, zoom * pinch))
        let scale = baseScale(view) * z
        let o = clamp(CGSize(width: offset.width + pan.width, height: offset.height + pan.height), scale: scale, view: view)
        return Image(uiImage: image)
            .resizable()
            .frame(width: image.size.width * scale, height: image.size.height * scale)
            .offset(o)
            .frame(width: view.width, height: view.height)
            .clipped()
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(.white.opacity(0.7), lineWidth: 1))
            .clipShape(.rect(cornerRadius: 16, style: .continuous))
            .contentShape(.rect)
            .gesture(
                DragGesture()
                    .updating($pan) { v, s, _ in s = v.translation }
                    .onEnded { v in
                        offset = clamp(CGSize(width: offset.width + v.translation.width, height: offset.height + v.translation.height), scale: scale, view: view)
                    }
                    .simultaneously(with:
                        MagnifyGesture()
                            .updating($pinch) { v, s, _ in s = v.magnification }
                            .onEnded { v in
                                zoom = min(5, max(1, zoom * v.magnification))
                                offset = clamp(offset, scale: baseScale(view) * zoom, view: view)
                            }
                    )
            )
            .accessibilityLabel("Bildausschnitt")
    }

    /// Sichtbaren Ausschnitt rendern (höchstens 1080 × 1920, ohne Metadaten)
    private func apply(_ view: CGSize) {
        let scale = baseScale(view) * zoom
        let o = clamp(offset, scale: scale, view: view)
        let shown = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        // Bild-Ursprung relativ zur Bühne, dann in Bildpunkte umrechnen
        let originX = view.width / 2 + o.width - shown.width / 2
        let originY = view.height / 2 + o.height - shown.height / 2
        let crop = CGRect(x: -originX / scale, y: -originY / scale, width: view.width / scale, height: view.height / scale)
        let outW = min(1080, max(1, crop.width))
        let out = CGSize(width: outW.rounded(), height: (outW * 16 / 9).rounded())
        let k = out.width / crop.width
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let rendered = UIGraphicsImageRenderer(size: out, format: format).image { _ in
            image.draw(in: CGRect(x: -crop.minX * k, y: -crop.minY * k, width: image.size.width * k, height: image.size.height * k))
        }
        Haptics.success()
        onDone(rendered)
        dismiss()
    }
}
