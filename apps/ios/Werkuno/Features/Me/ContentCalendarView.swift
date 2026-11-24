import SwiftUI

// MARK: - Inhaltskalender (wie /studio/kalender im Web, Creator Pro)

/// GET /studio/calendar?view=month&month=YYYY-MM bzw. ?view=week&week=YYYY-Www
struct ContentCalendarResponse: Decodable, Sendable {
    struct Item: Decodable, Identifiable, Sendable, Hashable {
        var id: String
        var kind: String
        var title: String
        var at: String
        var scheduled: Bool?
        var href: String
    }
    struct Day: Decodable, Identifiable, Sendable {
        var day: String
        var inMonth: Bool
        var today: Bool
        var items: [Item]
        var id: String { day }
        var number: Int { Int(day.suffix(2)) ?? 0 }
    }
    var view: String
    var title: String
    var month: String
    var week: String
    var prev: String
    var next: String
    var today: String
    var todayWeek: String
    var days: [Day]
    var upcoming: [Item]?
}

enum ContentCalendarKind {
    static func label(_ kind: String) -> String {
        switch kind {
        case "POST": "Beitrag"
        case "ARTICLE": "Artikel"
        case "PROJECT": "Projekt"
        case "TUTORIAL": "Anleitung"
        case "NEWSLETTER": "Newsletter"
        default: "Inhalt"
        }
    }

    /// Farben wie im Web (Beitrag ink, Artikel muted, Projekt clay, Newsletter warn); Anleitung in slate,
    /// weil moss und clay in der App dieselbe Farbe sind.
    static func color(_ kind: String) -> Color {
        switch kind {
        case "POST": .ink
        case "ARTICLE": .muted
        case "PROJECT": .clay
        case "TUTORIAL": .slate
        case "NEWSLETTER": .warn
        default: .muted
        }
    }

    static let order = ["POST", "ARTICLE", "PROJECT", "TUTORIAL", "NEWSLETTER"]

    static let zurich = TimeZone(identifier: "Europe/Zurich") ?? .current

    static func time(_ iso: String) -> String {
        guard let d = PublishScheduleSection.parse(iso) else { return "" }
        var style = Date.FormatStyle(date: .omitted, time: .shortened)
        style.timeZone = zurich
        return d.formatted(style)
    }

    static func dayTitle(_ key: String) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "de_CH")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        guard let d = f.date(from: key) else { return key }
        f.dateFormat = "EEEE, d. MMMM"
        return f.string(from: d)
    }
}

struct ContentCalendarView: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @State private var data: ContentCalendarResponse?
    @State private var error: String?
    @State private var week = false
    @State private var monthKey: String?
    @State private var weekKey: String?
    @State private var selected: String?

    private var loadKey: String { "\(week)|\(monthKey ?? "")|\(weekKey ?? "")" }

    var body: some View {
        MePhase(value: data, error: error, retry: load) { d in
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    ContentCalendarHeader(data: d, week: weekBinding, onPrev: { go(d.prev) }, onNext: { go(d.next) }, onToday: { goToday(d) })
                    if week {
                        ContentCalendarWeek(days: d.days, open: open)
                    } else {
                        ContentCalendarMonth(days: d.days, selected: $selected)
                        ContentCalendarDayList(day: d.days.first { $0.day == (selected ?? d.today) }, open: open)
                    }
                    ContentCalendarLegend()
                    ContentCalendarUpcoming(items: d.upcoming ?? [], open: open)
                }
                .padding(.horizontal, Space.gutter)
                .padding(.vertical, 16)
            }
        }
        .background(Color.paper)
        .task(id: loadKey) { await load() }
        .refreshable { await load() }
    }

    private var weekBinding: Binding<Bool> {
        Binding(get: { week }, set: { new in
            guard new != week else { return }
            // Beim Wechsel die Woche bzw. den Monat beibehalten, der gerade sichtbar ist
            if new {
                weekKey = selectedWeekKey()
            } else {
                monthKey = data?.month
            }
            week = new
        })
    }

    /// Woche des gewählten Tages, sonst die erste Woche des Monats bzw. die aktuelle Woche
    private func selectedWeekKey() -> String? {
        guard let d = data else { return nil }
        if d.month == String(d.today.prefix(7)) && selected == nil { return d.todayWeek }
        guard let day = selected ?? d.days.first(where: { $0.inMonth })?.day else { return nil }
        return ContentCalendarView.isoWeek(day)
    }

    private func go(_ key: String) {
        selected = nil
        if week { weekKey = key } else { monthKey = key }
    }

    private func goToday(_ d: ContentCalendarResponse) {
        selected = d.today
        if week { weekKey = d.todayWeek } else { monthKey = String(d.today.prefix(7)) }
    }

    private func open(_ it: ContentCalendarResponse.Item) {
        if let r = Route.from(href: it.href) { router.open(r) } else { router.open(.web(path: it.href)) }
    }

    private func load() async {
        do {
            let q: [String: String?] = week ? ["view": "week", "week": weekKey] : ["view": "month", "month": monthKey]
            data = try await APIClient.shared.get("/studio/calendar", query: q)
            error = nil
        } catch is CancellationError {
        } catch {
            if data == nil { self.error = MeErr.text(error) } else { app.show(error: error) }
        }
    }

    /// ISO-Woche („2026-W48“) eines Tagesschlüssels, wie isoWeekKey im Web
    static func isoWeek(_ day: String) -> String? {
        var cal = Calendar(identifier: .iso8601)
        cal.timeZone = TimeZone(identifier: "UTC") ?? .current
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = cal.timeZone
        f.dateFormat = "yyyy-MM-dd"
        guard let d = f.date(from: day) else { return nil }
        let c = cal.dateComponents([.yearForWeekOfYear, .weekOfYear], from: d)
        guard let y = c.yearForWeekOfYear, let w = c.weekOfYear else { return nil }
        return String(format: "%04d-W%02d", y, w)
    }
}

// MARK: - Kopf: Ansicht, vor/zurück, Heute

private struct ContentCalendarHeader: View {
    var data: ContentCalendarResponse
    @Binding var week: Bool
    var onPrev: () -> Void
    var onNext: () -> Void
    var onToday: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Picker("Ansicht", selection: $week) {
                Text("Monat").tag(false)
                Text("Woche").tag(true)
            }
            .pickerStyle(.segmented)
            HStack(spacing: 8) {
                Text(data.title)
                    .font(.titleSerif)
                    .foregroundStyle(Color.ink)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: 8)
                Button("Heute", action: onToday)
                    .font(.wr(.subheadline, .semibold))
                    .foregroundStyle(Color.moss)
                navButton("chevron.left", label: week ? "Vorherige Woche" : "Vorheriger Monat", action: onPrev)
                navButton("chevron.right", label: week ? "Nächste Woche" : "Nächster Monat", action: onNext)
            }
        }
    }

    private func navButton(_ symbol: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.wr(.subheadline, .semibold))
                .foregroundStyle(Color.ink)
                .frame(width: 36, height: 36)
                .overlay(Circle().stroke(Color.line, lineWidth: 1))
        }
        .accessibilityLabel(label)
    }
}

// MARK: - Monatsraster

private struct ContentCalendarMonth: View {
    var days: [ContentCalendarResponse.Day]
    @Binding var selected: String?

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 0), count: 7)
    private let weekdays = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]

    var body: some View {
        VStack(spacing: 0) {
            LazyVGrid(columns: columns, spacing: 0) {
                ForEach(weekdays, id: \.self) { w in
                    Text(w).specStyle(.muted).frame(maxWidth: .infinity).padding(.vertical, 8)
                }
                ForEach(days) { d in
                    ContentCalendarCell(day: d, selected: selected == d.day) { selected = d.day }
                }
            }
        }
        .cardSurface()
    }
}

private struct ContentCalendarCell: View {
    var day: ContentCalendarResponse.Day
    var selected: Bool
    var tap: () -> Void

    var body: some View {
        Button(action: tap) {
            VStack(spacing: 4) {
                number
                dots
            }
            .frame(maxWidth: .infinity, minHeight: 52, alignment: .top)
            .padding(.vertical, 4)
            .background(day.inMonth ? Color.clear : Color.sunken.opacity(0.6))
            .overlay(Rectangle().stroke(selected ? Color.ink : Color.clear, lineWidth: 1.5))
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(a11y)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private var number: some View {
        Text("\(day.number)")
            .font(.wr(.footnote, .semibold))
            .monospacedDigit()
            .foregroundStyle(day.today ? Color.paper : (day.inMonth ? Color.ink : Color.muted))
            .frame(width: 26, height: 26)
            .background(Circle().fill(day.today ? Color.ink : Color.clear))
    }

    private var dots: some View {
        HStack(spacing: 3) {
            ForEach(Array(day.items.prefix(4).enumerated()), id: \.offset) { _, it in
                dot(it)
            }
            if day.items.count > 4 {
                Text("+").font(.wr(.caption2)).foregroundStyle(Color.muted)
            }
        }
        .frame(height: 8)
    }

    /// Geplante Einträge als Ring, Erschienenes als gefüllter Punkt (wie gestrichelt/voll im Web)
    @ViewBuilder private func dot(_ it: ContentCalendarResponse.Item) -> some View {
        if it.scheduled == true {
            Circle().stroke(ContentCalendarKind.color(it.kind), lineWidth: 1.5).frame(width: 6, height: 6)
        } else {
            Circle().fill(ContentCalendarKind.color(it.kind)).frame(width: 6, height: 6)
        }
    }

    private var a11y: String {
        let title = ContentCalendarKind.dayTitle(day.day)
        return day.items.isEmpty ? title : "\(title), \(Fmt.plural(day.items.count, "Eintrag", "Einträge"))"
    }
}

// MARK: - Liste eines Tages

private struct ContentCalendarDayList: View {
    var day: ContentCalendarResponse.Day?
    var open: (ContentCalendarResponse.Item) -> Void

    var body: some View {
        if let day {
            VStack(alignment: .leading, spacing: 8) {
                SpecLabel(ContentCalendarKind.dayTitle(day.day))
                if day.items.isEmpty {
                    Text("An diesem Tag ist nichts geplant oder erschienen.")
                        .font(.wr(.subheadline))
                        .foregroundStyle(Color.muted)
                } else {
                    ContentCalendarItems(items: day.items, open: open)
                }
            }
        }
    }
}

private struct ContentCalendarItems: View {
    var items: [ContentCalendarResponse.Item]
    var open: (ContentCalendarResponse.Item) -> Void

    var body: some View {
        VStack(spacing: 0) {
            ForEach(items) { it in
                ContentCalendarRow(item: it) { open(it) }
                    .hairline()
            }
        }
        .cardSurface()
    }
}

private struct ContentCalendarRow: View {
    var item: ContentCalendarResponse.Item
    var showDate = false
    var tap: () -> Void

    var body: some View {
        Button(action: tap) {
            HStack(spacing: 12) {
                RoundedRectangle(cornerRadius: 2)
                    .fill(ContentCalendarKind.color(item.kind))
                    .frame(width: 4, height: 34)
                VStack(alignment: .leading, spacing: 3) {
                    Text(item.title).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink).a11yLineLimit(2)
                    Text(subtitle).font(.wr(.caption)).foregroundStyle(Color.muted)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.wr(.caption)).foregroundStyle(Color.muted)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
    }

    private var subtitle: String {
        var parts = [ContentCalendarKind.label(item.kind)]
        if showDate, let d = PublishScheduleSection.parse(item.at) {
            var style = Date.FormatStyle(date: .abbreviated, time: .shortened)
            style.timeZone = ContentCalendarKind.zurich
            parts.append(d.formatted(style))
        } else {
            parts.append(ContentCalendarKind.time(item.at))
        }
        parts.append(item.scheduled == true ? "geplant" : "erschienen")
        return parts.joined(separator: " · ")
    }
}

// MARK: - Wochenansicht: 7 Tagesabschnitte, nach Uhrzeit

private struct ContentCalendarWeek: View {
    var days: [ContentCalendarResponse.Day]
    var open: (ContentCalendarResponse.Item) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            ForEach(days) { d in
                ContentCalendarWeekDay(day: d, open: open)
            }
        }
    }
}

private struct ContentCalendarWeekDay: View {
    var day: ContentCalendarResponse.Day
    var open: (ContentCalendarResponse.Item) -> Void

    private var sorted: [ContentCalendarResponse.Item] { day.items.sorted { $0.at < $1.at } }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                SpecLabel(ContentCalendarKind.dayTitle(day.day), color: day.today ? .moss : .muted)
                if day.today { Text("Heute").font(.wr(.caption, .semibold)).foregroundStyle(Color.moss) }
            }
            .accessibilityAddTraits(.isHeader)
            if day.items.isEmpty {
                Text("Nichts geplant").font(.wr(.footnote)).foregroundStyle(Color.muted)
            } else {
                ContentCalendarItems(items: sorted, open: open)
            }
        }
    }
}

// MARK: - Legende und Nächste geplante

private struct ContentCalendarLegend: View {
    var body: some View {
        ViewThatFits {
            HStack(spacing: 14) { entries }
            VStack(alignment: .leading, spacing: 6) { entries }
        }
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private var entries: some View {
        ForEach(ContentCalendarKind.order, id: \.self) { k in
            HStack(spacing: 5) {
                Circle().fill(ContentCalendarKind.color(k)).frame(width: 7, height: 7)
                Text(ContentCalendarKind.label(k)).font(.wr(.caption)).foregroundStyle(Color.muted)
            }
        }
        HStack(spacing: 5) {
            Circle().stroke(Color.muted, lineWidth: 1.5).frame(width: 7, height: 7)
            Text("geplant").font(.wr(.caption)).foregroundStyle(Color.muted)
        }
    }
}

private struct ContentCalendarUpcoming: View {
    var items: [ContentCalendarResponse.Item]
    var open: (ContentCalendarResponse.Item) -> Void

    var body: some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                SectionHeader("Als Nächstes geplant", subtitle: Fmt.plural(items.count, "Eintrag", "Einträge"))
                VStack(spacing: 0) {
                    ForEach(items.prefix(10)) { it in
                        ContentCalendarRow(item: it, showDate: true) { open(it) }
                            .hairline()
                    }
                }
                .cardSurface()
            }
        }
    }
}
