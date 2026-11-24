import SwiftUI

// MARK: - Zuschnittrechner (wie /werkzeuge/zuschnitt im Web)
//
// Die Berechnung läuft auf dem Server (POST /tools/cutting-plan → lib/zuschnitt), damit App und Web
// exakt gleich packen. Die Liste bleibt auf dem Gerät gespeichert; Teilen erzeugt denselben Link wie im Web.

struct CuttingPart: Codable, Identifiable, Hashable, Sendable {
    var id = UUID().uuidString
    var name = ""
    /// Länge = Richtung der Maserung bzw. der Plattenlänge (mm)
    var length: Double = 0
    var width: Double = 0
    var qty = 1
    /// Wie viele Längs- bzw. Breitkanten Kantenband bekommen (0–2)
    var edgesL = 0
    var edgesW = 0
    /// Darf gedreht werden (keine Maserung)
    var rotate = false

    var isValid: Bool { length > 0 && width > 0 && qty > 0 }

    init(name: String = "", length: Double = 0, width: Double = 0, qty: Int = 1, edgesL: Int = 0, edgesW: Int = 0, rotate: Bool = false) {
        self.name = name; self.length = length; self.width = width; self.qty = qty
        self.edgesL = edgesL; self.edgesW = edgesW; self.rotate = rotate
    }

    enum CodingKeys: String, CodingKey { case id, name, length, width, qty, edgesL, edgesW, rotate }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = UUID().uuidString
        name = (try? c.decode(String.self, forKey: .name)) ?? ""
        length = (try? c.decode(Double.self, forKey: .length)) ?? 0
        width = (try? c.decode(Double.self, forKey: .width)) ?? 0
        qty = Int(((try? c.decode(Double.self, forKey: .qty)) ?? 1).rounded())
        edgesL = Int(((try? c.decode(Double.self, forKey: .edgesL)) ?? 0).rounded())
        edgesW = Int(((try? c.decode(Double.self, forKey: .edgesW)) ?? 0).rounded())
        rotate = (try? c.decode(Bool.self, forKey: .rotate)) ?? false
    }

    /// Ohne `id`: der Server vergibt eigene (p0, p1 …) in Reihenfolge der Liste
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(name.trimmingCharacters(in: .whitespaces).isEmpty ? "Teil" : String(name.prefix(60)), forKey: .name)
        try c.encode(length, forKey: .length)
        try c.encode(width, forKey: .width)
        try c.encode(qty, forKey: .qty)
        try c.encode(edgesL, forKey: .edgesL)
        try c.encode(edgesW, forKey: .edgesW)
        try c.encode(rotate, forKey: .rotate)
    }
}

struct CuttingSettings: Codable, Hashable, Sendable {
    var boardLength: Double = 2800
    var boardWidth: Double = 2070
    var thickness: Double = 19
    var kerf: Double = 4
    var trim: Double = 10
    /// Preis pro ganze Platte (0 = unbekannt)
    var boardPrice: Double = 0
    /// Preis Kantenband pro Laufmeter (0 = unbekannt)
    var edgePrice: Double = 0
    /// Zuschlag Kantenband in Prozent
    var edgeReserve: Double = 10
}

/// Gespeicherter Zustand (Gerät), analog zu `wr-zuschnitt` im Browser
private struct CuttingState: Codable {
    var parts: [CuttingPartStore]
    var settings: CuttingSettings
    var currency: String
}

/// Für die lokale Ablage inklusive `id` (CuttingPart lässt `id` beim Senden weg)
private struct CuttingPartStore: Codable {
    var id: String
    var name: String
    var length: Double
    var width: Double
    var qty: Int
    var edgesL: Int
    var edgesW: Int
    var rotate: Bool

    init(_ p: CuttingPart) {
        id = p.id; name = p.name; length = p.length; width = p.width; qty = p.qty; edgesL = p.edgesL; edgesW = p.edgesW; rotate = p.rotate
    }

    var part: CuttingPart {
        var p = CuttingPart(name: name, length: length, width: width, qty: qty, edgesL: edgesL, edgesW: edgesW, rotate: rotate)
        p.id = id
        return p
    }
}

struct CuttingPlanResponse: Decodable, Sendable {
    struct Placed: Decodable, Sendable {
        var partId: String
        var name: String
        var x: Double
        var y: Double
        var l: Double
        var w: Double
        var rotated: Bool
    }
    struct Sheet: Decodable, Sendable {
        var placed: [Placed]
        var usedArea: Double
    }
    struct TooLarge: Decodable, Sendable {
        var name: String
        var length: Double
        var width: Double
    }
    struct Cost: Decodable, Sendable {
        var boards: Double
        var edges: Double
        var total: Double
    }
    struct Result: Decodable, Sendable {
        var sheets: [Sheet]
        var tooLarge: [TooLarge]
        var partCount: Int
        var partArea: Double
        var boardArea: Double
        var waste: Double
        var edgeMeters: Double
        var edgeMetersWithReserve: Double
        var cuts: Int
        var cost: Cost
    }
    var settings: CuttingSettings
    var result: Result
    var csv: String
    var shareUrl: String
}

private struct CuttingPlanRequest: Encodable {
    var parts: [CuttingPart]
    var settings: CuttingSettings
}

private struct CuttingParsed: Decodable {
    var parts: [CuttingPart]
    var settings: CuttingSettings?
}

/// Gängige Plattenformate (mm); „Eigene Masse“ über die Felder
enum CuttingBoardPreset: CaseIterable, Identifiable {
    case large, medium, small, half
    var id: Self { self }
    var size: (Double, Double) {
        switch self {
        case .large: (2800, 2070)
        case .medium: (2500, 1250)
        case .small: (2440, 1220)
        case .half: (1250, 625)
        }
    }
    var label: String {
        switch self {
        case .large: "Grossformat 2800 × 2070"
        case .medium: "Spanplatte 2500 × 1250"
        case .small: "Sperrholz 2440 × 1220"
        case .half: "Zuschnitt 1250 × 625"
        }
    }
}

enum CuttingFormat {
    static func money(_ v: Double, _ currency: String) -> String {
        let s = v.formatted(.number.precision(.fractionLength(2)).locale(Locale(identifier: currency == "EUR" ? "de_DE" : "de_CH")))
        return currency == "EUR" ? "\(s) €" : "CHF \(s)"
    }

    static func num(_ v: Double, _ digits: Int = 1) -> String {
        v.formatted(.number.precision(.fractionLength(digits)).locale(Locale(identifier: "de_CH")))
    }

    static func mm(_ v: Double) -> String { num(v, 0) }

    /// Ruhige Pastelltöne je Teil wie im Web
    static let palette: [Color] = [0xE7D3B6, 0xD8E2D3, 0xE9D5D0, 0xD6DDE6, 0xEFE1B8, 0xE3D6E1, 0xD9E6E6, 0xEADCC9].map { hex in
        Color(red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255)
    }
}

struct CuttingCalculatorView: View {
    /// Code aus einem geteilten Link (`/werkzeuge/zuschnitt#d=…`)
    var code: String?

    @Environment(AppState.self) private var app
    @AppStorage("tools.cutting.state") private var stored: Data = Data()
    @State private var parts: [CuttingPart] = [CuttingPart()]
    @State private var settings = CuttingSettings()
    @State private var currency = "CHF"
    @State private var plan: CuttingPlanResponse?
    @State private var planError: String?
    @State private var loading = false
    @State private var pasting = false
    @State private var csvURL: URL?
    @State private var restored = false

    private var valid: [CuttingPart] { parts.filter(\.isValid) }
    private var requestKey: Int { CuttingPlanKey(parts: valid, settings: settings).hashValue }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                PageTitle(kicker: "Werkzeuge", title: "Zuschnittrechner", subtitle: "Teile eingeben – Werkuno rechnet Platten, Schnittplan, Verschnitt, Kantenband und Kosten. Deine Liste bleibt auf diesem Gerät gespeichert.")
                CuttingBoardSection(settings: $settings, currency: $currency)
                CuttingPartsSection(parts: $parts, settings: settings, onPaste: { pasting = true }, onExample: loadExample)
                CuttingResultSection(plan: plan, error: planError, loading: loading, hasParts: !valid.isEmpty, currency: currency, settings: settings, colors: colors, csvURL: csvURL)
            }
            .padding(.horizontal, Space.gutter)
            .padding(.bottom, 40)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Color.paper)
        .navigationTitle("Zuschnitt")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { toolbar }
        .sheet(isPresented: $pasting) {
            CuttingPasteSheet { added in
                parts = parts.filter { $0.isValid || !$0.name.isEmpty } + added
                app.show("\(Fmt.plural(added.count, "Teil", "Teile")) übernommen.")
            }
        }
        .task { await restore() }
        .task(id: requestKey) { await recalc() }
        .onChange(of: parts) { _, _ in save() }
        .onChange(of: settings) { _, _ in save() }
        .onChange(of: currency) { _, _ in save() }
    }

    @ToolbarContentBuilder private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            if let plan, let url = URL(string: plan.shareUrl) {
                ShareLink(item: url, message: Text("Zuschnittplan auf Werkuno")) {
                    Image(systemName: "square.and.arrow.up")
                }
                .accessibilityLabel("Link teilen")
            }
        }
    }

    /// Farbe je Teil: Index in der gültigen Liste = Server-ID „p<index>“
    private var colors: [String: Color] {
        var out: [String: Color] = [:]
        for i in valid.indices { out["p\(i)"] = CuttingFormat.palette[i % CuttingFormat.palette.count] }
        return out
    }

    private func loadExample() {
        parts = [
            CuttingPart(name: "Seite", length: 720, width: 560, qty: 2, edgesL: 1),
            CuttingPart(name: "Boden / Deckel", length: 762, width: 560, qty: 2, edgesL: 1),
            CuttingPart(name: "Fachboden", length: 760, width: 520, qty: 2, edgesL: 1),
            CuttingPart(name: "Tür", length: 717, width: 397, qty: 2, edgesL: 2, edgesW: 2),
            CuttingPart(name: "Sockelblende", length: 800, width: 80, qty: 1, edgesL: 1, rotate: true),
        ]
    }

    private func restore() async {
        guard !restored else { return }
        defer { restored = true }
        if let code, !code.isEmpty {
            do {
                let r: CuttingParsed = try await APIClient.shared.get("/tools/cutting-plan/decode", query: ["code": code])
                parts = r.parts.isEmpty ? [CuttingPart()] : r.parts
                if let s = r.settings { settings = s }
                return
            } catch {
                app.show(error: error)
            }
        }
        if let s = try? JSONDecoder().decode(CuttingState.self, from: stored) {
            let ps = s.parts.map(\.part)
            parts = ps.isEmpty ? [CuttingPart()] : ps
            settings = s.settings
            currency = s.currency
        }
    }

    private func save() {
        guard restored else { return }
        let state = CuttingState(parts: parts.map(CuttingPartStore.init), settings: settings, currency: currency)
        if let d = try? JSONEncoder().encode(state) { stored = d }
    }

    private func recalc() async {
        guard restored || code == nil else { return }
        let ps = valid
        guard !ps.isEmpty else { plan = nil; planError = nil; csvURL = nil; return }
        // Kurz warten, damit nicht jeder Tastendruck rechnet
        try? await Task.sleep(for: .milliseconds(350))
        guard !Task.isCancelled else { return }
        loading = true
        defer { loading = false }
        do {
            let r: CuttingPlanResponse = try await APIClient.shared.post("/tools/cutting-plan", CuttingPlanRequest(parts: ps, settings: settings))
            guard !Task.isCancelled else { return }
            plan = r
            planError = nil
            csvURL = writeCsv(r.csv)
        } catch is CancellationError {
        } catch {
            planError = (error as? APIError)?.message ?? error.localizedDescription
        }
    }

    /// CSV wie im Web (Semikolon, UTF-8 mit BOM) als Datei zum Teilen
    private func writeCsv(_ csv: String) -> URL? {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("zuschnittliste.csv")
        do {
            try Data(("\u{FEFF}" + csv).utf8).write(to: url, options: .atomic)
            return url
        } catch {
            return nil
        }
    }
}

private struct CuttingPlanKey: Hashable {
    var parts: [CuttingPart]
    var settings: CuttingSettings
}

// MARK: - Eingabefelder

private extension View {
    func cuttingInput() -> some View {
        self
            .padding(.horizontal, 10).padding(.vertical, 9)
            .background(Color.sunken, in: .rect(cornerRadius: Radius.small, style: .continuous))
    }
}

private struct CuttingNumberField: View {
    var label: String
    @Binding var value: Double
    var suffix: String
    var range: ClosedRange<Double>

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.wr(.caption, .semibold)).foregroundStyle(Color.ink2)
            HStack(spacing: 6) {
                TextField("0", value: clamped, format: .number)
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .monospacedDigit()
                    .accessibilityLabel("\(label) in \(suffix)")
                Text(suffix).font(.wr(.caption)).foregroundStyle(Color.muted).accessibilityHidden(true)
            }
            .cuttingInput()
        }
    }

    private var clamped: Binding<Double> {
        Binding(get: { value }, set: { value = min(range.upperBound, max(range.lowerBound, $0)) })
    }
}

// MARK: - Platte

private struct CuttingBoardSection: View {
    @Binding var settings: CuttingSettings
    @Binding var currency: String

    private let columns = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader("Platte", number: "01", subtitle: "Länge = Laufrichtung des Dekors") {
                presetMenu
            }
            LazyVGrid(columns: columns, spacing: 12) {
                CuttingNumberField(label: "Länge", value: $settings.boardLength, suffix: "mm", range: 0...10000)
                CuttingNumberField(label: "Breite", value: $settings.boardWidth, suffix: "mm", range: 0...10000)
                CuttingNumberField(label: "Stärke", value: $settings.thickness, suffix: "mm", range: 0...200)
                CuttingNumberField(label: "Schnittfuge", value: $settings.kerf, suffix: "mm", range: 0...20)
                CuttingNumberField(label: "Randbeschnitt", value: $settings.trim, suffix: "mm", range: 0...100)
                CuttingNumberField(label: "Preis je Platte", value: $settings.boardPrice, suffix: currency == "EUR" ? "€" : "CHF", range: 0...100000)
                CuttingNumberField(label: "Kantenband je m", value: $settings.edgePrice, suffix: currency == "EUR" ? "€" : "CHF", range: 0...1000)
                CuttingNumberField(label: "Zuschlag Kante", value: $settings.edgeReserve, suffix: "%", range: 0...100)
            }
            Picker("Währung", selection: $currency) {
                Text("CHF").tag("CHF")
                Text("EUR").tag("EUR")
            }
            .pickerStyle(.segmented)
            .frame(maxWidth: 200)
        }
    }

    private var presetMenu: some View {
        Menu {
            ForEach(CuttingBoardPreset.allCases) { p in
                Button(p.label) {
                    settings.boardLength = p.size.0
                    settings.boardWidth = p.size.1
                }
            }
        } label: {
            Label("Format", systemImage: "rectangle.dashed")
                .font(.wr(.subheadline, .semibold))
                .foregroundStyle(Color.moss)
        }
    }
}

// MARK: - Teile

private struct CuttingPartsSection: View {
    @Binding var parts: [CuttingPart]
    var settings: CuttingSettings
    var onPaste: () -> Void
    var onExample: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader("Teile", number: "02", subtitle: "Kanten: wie viele Längs- bzw. Breitkanten Kantenband bekommen. „Drehbar“ nur ohne Maserung.")
            HStack(spacing: 14) {
                Button(action: onPaste) { Label("Liste einfügen", systemImage: "doc.on.clipboard") }
                Button("Beispiel", action: onExample)
                Spacer(minLength: 0)
            }
            .font(.wr(.subheadline, .semibold))
            .foregroundStyle(Color.moss)
            VStack(spacing: 10) {
                ForEach($parts) { $p in
                    CuttingPartRow(part: $p, number: (parts.firstIndex { $0.id == p.id } ?? 0) + 1, tooLarge: tooLarge(p), onDelete: { delete(p.id) })
                }
            }
            Button {
                parts.append(CuttingPart())
            } label: {
                Label("Teil hinzufügen", systemImage: "plus")
            }
            .primaryButton()
        }
    }

    private func delete(_ id: String) {
        parts.removeAll { $0.id == id }
        if parts.isEmpty { parts = [CuttingPart()] }
    }

    /// Gleiche Prüfung wie im Web: passt das Teil (ggf. gedreht) auf die nutzbare Fläche?
    private func tooLarge(_ p: CuttingPart) -> Bool {
        guard p.length > 0, p.width > 0 else { return false }
        let l = settings.boardLength - 2 * settings.trim
        let w = settings.boardWidth - 2 * settings.trim
        let fits = (p.length <= l && p.width <= w) || (p.rotate && p.width <= l && p.length <= w)
        return !fits
    }
}

private struct CuttingPartRow: View {
    @Binding var part: CuttingPart
    var number: Int
    var tooLarge: Bool
    var onDelete: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Text("\(number)").font(.specLarge).foregroundStyle(Color.muted).frame(minWidth: 22, alignment: .leading)
                TextField("Bezeichnung", text: $part.name)
                    .cuttingInput()
                    .accessibilityLabel("Bezeichnung Teil \(number)")
                Button(action: onDelete) {
                    Image(systemName: "trash").foregroundStyle(Color.muted).frame(width: 36, height: 36)
                }
                .accessibilityLabel("Teil \(number) entfernen")
            }
            measures
            options
            if tooLarge {
                Label("Passt auf keine Platte", systemImage: "exclamationmark.triangle")
                    .font(.wr(.caption, .semibold))
                    .foregroundStyle(Color.warn)
            }
        }
        .padding(12)
        .cardSurface()
    }

    private var measures: some View {
        HStack(spacing: 8) {
            CuttingNumberField(label: "Länge", value: $part.length, suffix: "mm", range: 0...10000)
            CuttingNumberField(label: "Breite", value: $part.width, suffix: "mm", range: 0...10000)
            CuttingNumberField(label: "Stück", value: qty, suffix: "×", range: 0...999)
        }
    }

    private var options: some View {
        HStack(spacing: 10) {
            edgeStepper("Kanten L", value: $part.edgesL)
            edgeStepper("Kanten B", value: $part.edgesW)
            Spacer(minLength: 0)
            Toggle(isOn: $part.rotate) {
                Label("Drehbar", systemImage: "rotate.right").font(.wr(.caption, .semibold))
            }
            .toggleStyle(.button)
            .tint(.moss)
            .accessibilityLabel("Teil \(number) darf gedreht werden")
        }
    }

    private var qty: Binding<Double> {
        Binding(get: { Double(part.qty) }, set: { part.qty = Int($0.rounded()) })
    }

    /// 0, 1 oder 2 Kanten; Tippen schaltet weiter
    private func edgeStepper(_ label: String, value: Binding<Int>) -> some View {
        Button {
            value.wrappedValue = (value.wrappedValue + 1) % 3
        } label: {
            Text("\(label): \(value.wrappedValue)")
                .font(.wr(.caption, .semibold))
                .monospacedDigit()
                .foregroundStyle(value.wrappedValue > 0 ? Color.ink : Color.muted)
                .padding(.horizontal, 10).padding(.vertical, 7)
                .overlay(Capsule().stroke(Color.lineStrong, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label == "Kanten L" ? "Längskanten Teil \(number)" : "Breitkanten Teil \(number)")
        .accessibilityValue("\(value.wrappedValue)")
        .accessibilityHint("Tippen wechselt zwischen 0, 1 und 2")
    }
}

// MARK: - Ergebnis

private struct CuttingResultSection: View {
    var plan: CuttingPlanResponse?
    var error: String?
    var loading: Bool
    var hasParts: Bool
    var currency: String
    var settings: CuttingSettings
    var colors: [String: Color]
    var csvURL: URL?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHeader("Ergebnis", number: "03", subtitle: loading ? "Wird berechnet …" : nil)
            if !hasParts {
                Text("Gib mindestens ein Teil mit Länge und Breite ein.").font(.wr(.subheadline)).foregroundStyle(Color.muted)
            } else if let error {
                Label(error, systemImage: "exclamationmark.triangle").font(.wr(.subheadline)).foregroundStyle(Color.danger)
            }
            if let plan, hasParts {
                CuttingFigures(result: plan.result, settings: settings, currency: currency)
                if !plan.result.tooLarge.isEmpty { tooLargeNote(plan.result.tooLarge) }
                actions(plan)
                ForEach(Array(plan.result.sheets.enumerated()), id: \.offset) { i, sheet in
                    CuttingSheetPlan(sheet: sheet, number: i + 1, total: plan.result.sheets.count, settings: plan.settings, colors: colors)
                }
            }
        }
    }

    private func tooLargeNote(_ list: [CuttingPlanResponse.TooLarge]) -> some View {
        let names = list.map { "\($0.name.isEmpty ? "Teil" : $0.name) (\(CuttingFormat.mm($0.length)) × \(CuttingFormat.mm($0.width)))" }.joined(separator: ", ")
        return Label("Passt auf keine Platte: \(names). Grösseres Format wählen oder das Teil teilen.", systemImage: "exclamationmark.triangle")
            .font(.wr(.subheadline))
            .foregroundStyle(Color.warn)
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(RoundedRectangle(cornerRadius: Radius.inner).stroke(Color.warn, lineWidth: 1))
    }

    private func actions(_ plan: CuttingPlanResponse) -> some View {
        HStack(spacing: 16) {
            if let url = URL(string: plan.shareUrl) {
                ShareLink(item: url, message: Text("Zuschnittplan auf Werkuno")) {
                    Label("Link teilen", systemImage: "link")
                }
            }
            if let csvURL {
                ShareLink(item: csvURL) {
                    Label("CSV", systemImage: "arrow.down.doc")
                }
            }
            Spacer(minLength: 0)
        }
        .font(.wr(.subheadline, .semibold))
        .foregroundStyle(Color.moss)
    }
}

private struct CuttingFigures: View {
    var result: CuttingPlanResponse.Result
    var settings: CuttingSettings
    var currency: String

    private let columns = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            LazyVGrid(columns: columns, alignment: .leading, spacing: 12) {
                figure("Platten", "\(result.sheets.count)", "\(CuttingFormat.mm(settings.boardLength)) × \(CuttingFormat.mm(settings.boardWidth)) × \(CuttingFormat.mm(settings.thickness))")
                figure("Verschnitt", "\(CuttingFormat.num(result.waste * 100, 0)) %", "\(CuttingFormat.num(result.partArea, 2)) von \(CuttingFormat.num(result.boardArea, 2)) m²")
                figure("Kantenband", "\(CuttingFormat.num(result.edgeMetersWithReserve)) m", "\(CuttingFormat.num(result.edgeMeters)) m + \(CuttingFormat.num(settings.edgeReserve, 0)) %")
                figure("Schnitte", "ca. \(result.cuts)", Fmt.plural(result.partCount, "Teil", "Teile"))
            }
            if result.cost.total > 0 { cost }
        }
    }

    private func figure(_ label: String, _ value: String, _ note: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            SpecLabel(label)
            Text(value).font(.wr(.title3, .semibold)).foregroundStyle(Color.ink).monospacedDigit()
            Text(note).font(.wr(.caption)).foregroundStyle(Color.muted).monospacedDigit()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .cardSurface()
        .accessibilityElement(children: .combine)
    }

    private var cost: some View {
        VStack(alignment: .leading, spacing: 6) {
            SpecLabel("Kosten (Schätzung)")
            costRow("Platten", result.cost.boards)
            costRow("Kantenband", result.cost.edges)
            Divider()
            costRow("Total", result.cost.total).font(.wr(.subheadline, .semibold))
        }
        .padding(14)
        .cardSurface()
    }

    private func costRow(_ label: String, _ v: Double) -> some View {
        HStack {
            Text(label).foregroundStyle(Color.ink)
            Spacer()
            Text(CuttingFormat.money(v, currency)).monospacedDigit().foregroundStyle(Color.ink)
        }
        .font(.wr(.subheadline))
    }
}

/// Schnittplan einer Platte, massstäblich (Länge waagrecht)
private struct CuttingSheetPlan: View {
    var sheet: CuttingPlanResponse.Sheet
    var number: Int
    var total: Int
    var settings: CuttingSettings
    var colors: [String: Color]

    private var used: Double {
        let area = settings.boardLength * settings.boardWidth
        return area > 0 ? sheet.usedArea / area * 100 : 0
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text("Platte \(number) von \(total)").font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink)
                Spacer()
                Text("\(Fmt.plural(sheet.placed.count, "Teil", "Teile")) · \(CuttingFormat.num(used, 0)) % genutzt")
                    .font(.wr(.caption)).foregroundStyle(Color.muted).monospacedDigit()
            }
            canvas
                .aspectRatio(max(0.1, settings.boardLength / max(1, settings.boardWidth)), contentMode: .fit)
                .overlay(Rectangle().stroke(Color.lineStrong, lineWidth: 1))
                .accessibilityElement()
                .accessibilityLabel("Schnittplan Platte \(number): \(sheet.placed.map(\.name).joined(separator: ", "))")
        }
    }

    private var canvas: some View {
        Canvas { ctx, size in
            let scale = size.width / max(1, settings.boardLength)
            ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .color(Color.sunken))
            let usable = CGRect(x: settings.trim * scale, y: settings.trim * scale, width: (settings.boardLength - 2 * settings.trim) * scale, height: (settings.boardWidth - 2 * settings.trim) * scale)
            ctx.fill(Path(usable), with: .color(Color.card))
            for p in sheet.placed {
                draw(p, scale: scale, in: &ctx)
            }
        }
    }

    private func draw(_ p: CuttingPlanResponse.Placed, scale: Double, in ctx: inout GraphicsContext) {
        let rect = CGRect(x: p.x * scale, y: p.y * scale, width: p.l * scale, height: p.w * scale)
        ctx.fill(Path(rect), with: .color(colors[p.partId] ?? CuttingFormat.palette[0]))
        ctx.stroke(Path(rect), with: .color(Color(red: 0.15, green: 0.14, blue: 0.15)), lineWidth: 0.75)
        guard rect.width > 46, rect.height > 22 else { return }
        let name = p.name.count > 22 ? String(p.name.prefix(21)) + "…" : p.name
        let dims = "\(CuttingFormat.mm(p.l)) × \(CuttingFormat.mm(p.w))\(p.rotated ? " ↻" : "")"
        let label = Text("\(name)\n\(dims)").font(.system(size: 9, weight: .semibold)).foregroundStyle(Color(red: 0.15, green: 0.14, blue: 0.15))
        ctx.draw(label, in: rect.insetBy(dx: 3, dy: 2))
    }
}

// MARK: - Liste einfügen

private struct CuttingPasteSheet: View {
    var onAdd: ([CuttingPart]) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var app
    @State private var text = ""
    @State private var busy = false

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 10) {
                Text("Eine Zeile pro Teil: Bezeichnung; Länge; Breite; Stück – getrennt mit Tab, Semikolon oder Komma.")
                    .font(.wr(.footnote)).foregroundStyle(Color.muted)
                TextEditor(text: $text)
                    .font(.system(.footnote, design: .monospaced))
                    .scrollContentBackground(.hidden)
                    .padding(8)
                    .background(Color.sunken, in: .rect(cornerRadius: Radius.inner, style: .continuous))
                    .overlay(alignment: .topLeading) { placeholder }
                    .accessibilityLabel("Teileliste")
            }
            .padding(Space.gutter)
            .background(Color.paper)
            .navigationTitle("Liste einfügen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Übernehmen") { Task { await apply() } }
                        .disabled(busy || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    @ViewBuilder private var placeholder: some View {
        if text.isEmpty {
            Text("Seite; 720; 560; 2\nBoden; 762; 560; 2")
                .font(.system(.footnote, design: .monospaced))
                .foregroundStyle(Color.muted)
                .padding(.horizontal, 13).padding(.vertical, 16)
                .allowsHitTesting(false)
        }
    }

    /// Erkennung auf dem Server (gleich wie im Web)
    private func apply() async {
        busy = true
        defer { busy = false }
        do {
            let r: CuttingParsed = try await APIClient.shared.post("/tools/cutting-plan/parse", ["text": text])
            guard !r.parts.isEmpty else {
                app.show("Keine Teile erkannt. Bitte Länge und Breite als Zahlen angeben.", style: .error)
                return
            }
            onAdd(r.parts)
            dismiss()
        } catch {
            app.show(error: error)
        }
    }
}
