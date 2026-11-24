import SwiftUI
import Charts

// MARK: - Statistiken (wie /studio/statistiken im Web)

/// Antwort von `GET /studio/stats?range=wochen|jahr`: Zahlen je Inhalt, Aufrufe je Woche (`trends`),
/// Summe je Woche (`totals`). 12 Monate und CSV-Export nur mit Creator Pro.
struct StudioStatsPayload: Decodable, Sendable {
    var projects: [MeStatRow]?
    var tutorials: [MeStatRow]?
    var articles: [MeStatRow]?
    var posts: [MeStatRow]?
    var products: [MeStatRow]?
    var weeks: [String]?
    var trends: [String: [Int]]?
    var viewsInRange: [String: Int]?
    var totals: [Int]?
    var range: String?
    var pro: Bool?
    var canExport: Bool?
}

private struct StudioStatsExport: Decodable, Sendable {
    var filename: String
    var csv: String
}

enum StudioStatsRange: String, CaseIterable, Identifiable, Sendable {
    case wochen, jahr
    var id: String { rawValue }
    var label: String { self == .wochen ? "12 Wochen" : "12 Monate" }
}

struct StudioStatsView: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @State private var data: StudioStatsPayload?
    @State private var error: String?
    @State private var range: StudioStatsRange = .wochen
    @State private var exportURL: URL?
    @State private var exporting = false

    private var isPro: Bool { data?.pro ?? (app.me?.profile?.isCreatorPro == true) }

    var body: some View {
        MePhase(value: data, error: error, retry: load) { d in
            ScrollView {
                VStack(alignment: .leading, spacing: 26) {
                    PageTitle(kicker: "Studio", title: "Statistiken", subtitle: "Kennzahlen je Inhalt seit Veröffentlichung, Verlauf der Aufrufe im gewählten Zeitraum. Aufrufe sind Seitenaufrufe, keine eindeutigen Personen.")
                    controls
                    StudioStatsTrendCard(weeks: d.weeks ?? [], totals: d.totals ?? [], range: range)
                    StudioStatsTopChart(data: d)
                    StudioStatsSections(data: d)
                }
                .padding(.horizontal, Space.gutter)
                .padding(.bottom, 40)
            }
        }
        .background(Color.paper)
        .navigationTitle("Statistiken")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: range) { await load() }
        .refreshable { await load() }
    }

    private var rangeBinding: Binding<StudioStatsRange> {
        Binding(get: { range }, set: { new in
            // 12 Monate gehören zu Creator Pro – ohne Abo zur Pro-Seite
            if new == .jahr && !isPro {
                router.open(.creatorPro(feature: .statistik))
                return
            }
            exportURL = nil
            range = new
        })
    }

    private var controls: some View {
        VStack(alignment: .leading, spacing: 12) {
            Picker("Zeitraum", selection: rangeBinding) {
                ForEach(StudioStatsRange.allCases) { r in Text(r.label).tag(r) }
            }
            .pickerStyle(.segmented)
            if isPro {
                exportButton
            } else {
                ProUnlockButton(feature: .statistik, title: "12 Monate und CSV-Export mit Creator Pro")
            }
        }
    }

    @ViewBuilder private var exportButton: some View {
        if let url = exportURL {
            ShareLink(item: url) {
                Label("CSV teilen", systemImage: "square.and.arrow.up")
                    .font(.wr(.subheadline, .semibold))
            }
        } else {
            Button {
                Task { await export() }
            } label: {
                Label(exporting ? "Wird erstellt …" : "Als CSV exportieren", systemImage: "arrow.down.doc")
                    .font(.wr(.subheadline, .semibold))
            }
            .disabled(exporting)
        }
    }

    private func load() async {
        do {
            data = try await APIClient.shared.get("/studio/stats", query: ["range": range.rawValue])
            error = nil
        } catch {
            if data == nil { self.error = MeErr.text(error) } else { app.show(error: error) }
        }
    }

    /// CSV wie im Web (Semikolon, UTF-8 mit BOM) als Datei zum Teilen oder Sichern in „Dateien“
    private func export() async {
        exporting = true
        defer { exporting = false }
        do {
            let r: StudioStatsExport = try await APIClient.shared.get("/studio/stats/export", query: ["range": range.rawValue])
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(r.filename)
            try Data(r.csv.utf8).write(to: url, options: .atomic)
            exportURL = url
            Haptics.success()
        } catch {
            app.show(error: error)
        }
    }
}

// MARK: - Verlauf (Summe je Woche)

private struct StudioStatsPoint: Identifiable {
    var id: Int
    var date: Date
    var value: Int
}

private enum StudioStatsDates {
    static let parser: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static func points(weeks: [String], values: [Int]) -> [StudioStatsPoint] {
        var out: [StudioStatsPoint] = []
        for (i, w) in weeks.enumerated() {
            guard let d = parser.date(from: w) else { continue }
            out.append(StudioStatsPoint(id: i, date: d, value: i < values.count ? values[i] : 0))
        }
        return out
    }
}

private struct StudioStatsTrendCard: View {
    var weeks: [String]
    var totals: [Int]
    var range: StudioStatsRange

    private var points: [StudioStatsPoint] { StudioStatsDates.points(weeks: weeks, values: totals) }
    private var sum: Int { totals.reduce(0, +) }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SpecLabel("Aufrufe pro Woche · \(range.label)")
            Text("\(Fmt.number(sum)) Aufrufe im Zeitraum")
                .font(.wr(.title3, .semibold))
                .foregroundStyle(Color.ink)
                .monospacedDigit()
            chart
                .frame(height: 150)
                .accessibilityLabel("Aufrufe pro Woche, insgesamt \(sum)")
        }
        .padding(16)
        .cardSurface()
    }

    private var chart: some View {
        Chart(points) { p in
            AreaMark(x: .value("Woche", p.date), y: .value("Aufrufe", p.value))
                .foregroundStyle(Color.moss.opacity(0.14))
                .interpolationMethod(.monotone)
            LineMark(x: .value("Woche", p.date), y: .value("Aufrufe", p.value))
                .foregroundStyle(Color.moss)
                .interpolationMethod(.monotone)
        }
        .chartXAxis {
            AxisMarks(values: .automatic(desiredCount: 4)) { _ in
                AxisValueLabel(format: .dateTime.day().month(.abbreviated)).font(.wr(.caption2))
            }
        }
        .chartYAxis {
            AxisMarks(position: .leading, values: .automatic(desiredCount: 3)) { _ in
                AxisGridLine()
                AxisValueLabel().font(.wr(.caption2))
            }
        }
    }
}

// MARK: - Meistgesehen

private struct StudioStatsTopChart: View {
    var data: StudioStatsPayload

    private struct Bar: Identifiable {
        var id: String
        var title: String
        var kind: String
        var value: Int
    }

    private var bars: [Bar] {
        var all: [Bar] = []
        all += (data.projects ?? []).map { Bar(id: $0.id, title: $0.label, kind: "Projekt", value: $0.viewCount ?? 0) }
        all += (data.tutorials ?? []).map { Bar(id: $0.id, title: $0.label, kind: "Anleitung", value: $0.viewCount ?? 0) }
        all += (data.articles ?? []).map { Bar(id: $0.id, title: $0.label, kind: "Artikel", value: $0.viewCount ?? 0) }
        all += (data.products ?? []).map { Bar(id: $0.id, title: $0.label, kind: "Produkt", value: $0.viewCount ?? 0) }
        return Array(all.filter { $0.value > 0 }.sorted { $0.value > $1.value }.prefix(8))
    }

    var body: some View {
        let top = bars
        if !top.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                SpecLabel("Meistgesehen")
                Chart(top) { b in
                    BarMark(x: .value("Aufrufe", b.value), y: .value("Inhalt", b.title))
                        .foregroundStyle(by: .value("Art", b.kind))
                        .annotation(position: .trailing, alignment: .leading) {
                            Text(Fmt.number(b.value)).font(.wr(.caption2)).monospacedDigit().foregroundStyle(Color.muted)
                        }
                        .clipShape(.rect(cornerRadius: 4))
                }
                .chartForegroundStyleScale(["Projekt": Color.moss, "Anleitung": Color.slate, "Artikel": Color.clay, "Produkt": Color.ochre])
                .chartXAxis(.hidden)
                .chartYAxis {
                    AxisMarks { _ in AxisValueLabel(horizontalSpacing: 6).font(.wr(.caption)) }
                }
                .chartLegend(position: .bottom, alignment: .leading)
                .frame(height: CGFloat(top.count) * 34 + 40)
            }
            .padding(16)
            .cardSurface()
        }
    }
}

// MARK: - Tabellen je Inhalt

private struct StudioStatsColumn {
    var symbol: String
    var label: String
    var key: KeyPath<MeStatRow, Int?>
}

private struct StudioStatsSections: View {
    var data: StudioStatsPayload

    var body: some View {
        VStack(alignment: .leading, spacing: 26) {
            StudioStatsTable(title: "Projekte", number: "01", rows: data.projects ?? [], data: data, showTrend: true, columns: [
                .init(symbol: "eye", label: "Aufrufe", key: \.viewCount),
                .init(symbol: "heart", label: "Gefällt-mir", key: \.likeCount),
                .init(symbol: "bookmark", label: "gemerkt", key: \.saveCount),
                .init(symbol: "bubble.left", label: "Kommentare", key: \.commentCount),
                .init(symbol: "arrow.triangle.branch", label: "Nachbauten", key: \.remixCount),
            ])
            StudioStatsTable(title: "Anleitungen", number: "02", rows: data.tutorials ?? [], data: data, showTrend: true, columns: [
                .init(symbol: "eye", label: "Aufrufe", key: \.viewCount),
                .init(symbol: "checkmark.seal", label: "abgeschlossen", key: \.completionCount),
                .init(symbol: "bookmark", label: "gemerkt", key: \.saveCount),
                .init(symbol: "heart", label: "Gefällt-mir", key: \.likeCount),
            ])
            StudioStatsTable(title: "Artikel", number: "03", rows: data.articles ?? [], data: data, showTrend: true, columns: [
                .init(symbol: "eye", label: "Aufrufe", key: \.viewCount),
                .init(symbol: "heart", label: "Gefällt-mir", key: \.likeCount),
            ])
            StudioStatsTable(title: "Beiträge", number: "04", rows: data.posts ?? [], data: data, showTrend: false, columns: [
                .init(symbol: "heart", label: "Gefällt-mir", key: \.likeCount),
                .init(symbol: "bubble.left", label: "Kommentare", key: \.commentCount),
                .init(symbol: "bookmark", label: "gemerkt", key: \.saveCount),
                .init(symbol: "arrow.2.squarepath", label: "geteilt", key: \.repostCount),
            ])
            if !(data.products ?? []).isEmpty {
                StudioStatsTable(title: "Produkte", number: "05", rows: data.products ?? [], data: data, showTrend: true, columns: [
                    .init(symbol: "eye", label: "Aufrufe", key: \.viewCount),
                    .init(symbol: "bookmark", label: "gemerkt", key: \.saveCount),
                    .init(symbol: "star", label: "Bewertungen", key: \.ratingCount),
                    .init(symbol: "shippingbox", label: "verkauft", key: \.statsOrderItemCount),
                ])
            }
        }
    }
}

private struct StudioStatsTable: View {
    var title: String
    var number: String
    var rows: [MeStatRow]
    var data: StudioStatsPayload
    var showTrend: Bool
    var columns: [StudioStatsColumn]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(title, number: number, subtitle: rows.isEmpty ? "Noch nichts veröffentlicht" : Fmt.plural(rows.count, "Eintrag", "Einträge"))
            if !rows.isEmpty {
                let maxFirst = max(1, rows.map { $0[keyPath: columns[0].key] ?? 0 }.max() ?? 1)
                VStack(spacing: 0) {
                    ForEach(rows) { r in
                        StudioStatsRowView(row: r, columns: columns, trend: showTrend ? data.trends?[r.id] : nil, weeks: data.weeks ?? [], inRange: data.viewsInRange?[r.id], maxFirst: maxFirst)
                            .padding(14)
                            .hairline()
                    }
                }
                .cardSurface()
            }
        }
    }
}

private struct StudioStatsRowView: View {
    var row: MeStatRow
    var columns: [StudioStatsColumn]
    var trend: [Int]?
    var weeks: [String]
    var inRange: Int?
    var maxFirst: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(row.label).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink).a11yLineLimit(2)
                Spacer(minLength: 8)
                if let p = row.publishedAt { Text(Fmt.date(p)).font(.wr(.caption)).foregroundStyle(Color.muted) }
            }
            if let trend, !trend.isEmpty {
                HStack(alignment: .center, spacing: 10) {
                    StudioStatsSparkline(points: StudioStatsDates.points(weeks: weeks, values: trend))
                        .frame(height: 26)
                    Text("\(Fmt.number(inRange ?? trend.reduce(0, +))) im Zeitraum")
                        .font(.wr(.caption))
                        .foregroundStyle(Color.muted)
                        .monospacedDigit()
                        .fixedSize()
                }
            } else {
                bar
            }
            HStack(spacing: 14) {
                ForEach(columns, id: \.label) { c in MeCountLabel(symbol: c.symbol, value: row[keyPath: c.key], label: c.label) }
                Spacer(minLength: 0)
            }
        }
    }
}

private extension StudioStatsRowView {
    /// Balken relativ zum besten Inhalt (für Beiträge ohne Aufrufzahlen)
    var bar: some View {
        GeometryReader { geo in
            let v = CGFloat(row[keyPath: columns[0].key] ?? 0) / CGFloat(maxFirst)
            Capsule().fill(Color.sunken)
                .overlay(alignment: .leading) { Capsule().fill(Color.moss).frame(width: max(3, geo.size.width * v)) }
        }
        .frame(height: 4)
        .accessibilityHidden(true)
    }
}

/// Kleine Verlaufslinie (Aufrufe pro Woche) ohne Achsen
private struct StudioStatsSparkline: View {
    var points: [StudioStatsPoint]

    var body: some View {
        Chart(points) { p in
            LineMark(x: .value("Woche", p.date), y: .value("Aufrufe", p.value))
                .foregroundStyle(Color.moss)
                .interpolationMethod(.monotone)
        }
        .chartXAxis(.hidden)
        .chartYAxis(.hidden)
        .chartLegend(.hidden)
        .accessibilityLabel("Verlauf der Aufrufe")
    }
}

private extension MeStatRow {
    var statsOrderItemCount: Int? { _count?.orderItems }
}
