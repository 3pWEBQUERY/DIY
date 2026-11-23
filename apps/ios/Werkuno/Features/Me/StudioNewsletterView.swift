import SwiftUI

// MARK: - Modelle (GET /studio/newsletters …)

struct NewsletterQuota: Decodable, Hashable {
    var limit: Int
    var used: Int
    var left: Int
}

struct StudioNewsletterList: Decodable {
    var pro: Bool
    var recipients: Int
    var quota: NewsletterQuota
    var items: [StudioNewsletterItem]
}

struct StudioNewsletterItem: Decodable, Identifiable, Hashable {
    var id: String
    var subject: String
    var status: String // DRAFT | SCHEDULED | SENDING | SENT
    var scheduledAt: Date?
    var sentAt: Date?
    var createdAt: Date?
    var recipientCount: Int
    var openCount: Int
    var clickCount: Int

    var isSent: Bool { status == "SENT" || status == "SENDING" }

    var statusLabel: (label: String, tint: Color) {
        switch status {
        case "SCHEDULED": ("Geplant", .warn)
        case "SENDING": ("Wird verschickt", .warn)
        case "SENT": ("Verschickt", .moss)
        default: ("Entwurf", .muted)
        }
    }
}

struct StudioNewsletterDetail: Decodable {
    var id: String
    var subject: String
    var body: String
    var status: String
    var scheduledAt: Date?
    var sentAt: Date?
    var recipientCount: Int
    var openCount: Int
    var clickCount: Int
}

struct NewsletterCardOptions: Decodable {
    struct Card: Decodable, Identifiable, Hashable { var id: String; var title: String; var coverUrl: String? }
    struct Groups: Decodable { var projekt: [Card]; var anleitung: [Card]; var produkt: [Card] }
    var options: Groups
    var recipients: Int
    var quota: NewsletterQuota
}

/// Öffnungs- bzw. Klickrate in Prozent, wie `rate()` im Web
enum NewsletterMath {
    static func rate(_ count: Int, _ recipients: Int) -> Int? {
        recipients > 0 ? Int((Double(min(count, recipients)) / Double(recipients) * 100).rounded()) : nil
    }
    static func rateText(_ count: Int, _ recipients: Int) -> String {
        rate(count, recipients).map { "\($0) %" } ?? "–"
    }
}

/// Karten im Text als Platzhalter `[[projekt:ID]]` (wie `extractCardRefs`/`stripCardRefs` im Web)
struct NewsletterCardRef: Hashable, Identifiable {
    var kind: String // projekt | anleitung | produkt
    var cardId: String
    var id: String { "\(kind):\(cardId)" }
    var token: String { "[[\(kind):\(cardId)]]" }

    static let maxCards = 3
    private static let pattern = try? NSRegularExpression(pattern: #"\[\[(projekt|anleitung|produkt):([A-Za-z0-9_-]{6,40})\]\]"#)

    static func extract(_ body: String) -> [NewsletterCardRef] {
        guard let re = pattern else { return [] }
        let ns = body as NSString
        var out: [NewsletterCardRef] = []
        for m in re.matches(in: body, range: NSRange(location: 0, length: ns.length)) {
            let ref = NewsletterCardRef(kind: ns.substring(with: m.range(at: 1)), cardId: ns.substring(with: m.range(at: 2)))
            if !out.contains(ref) { out.append(ref) }
        }
        return Array(out.prefix(maxCards))
    }

    static func strip(_ body: String) -> String {
        guard let re = pattern else { return body }
        let ns = body as NSString
        let plain = re.stringByReplacingMatches(in: body, range: NSRange(location: 0, length: ns.length), withTemplate: "")
        return plain.replacingOccurrences(of: "\n\n\n", with: "\n\n").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func compose(_ text: String, _ cards: [NewsletterCardRef]) -> String {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cards.isEmpty else { return t }
        return t + "\n\n" + cards.map(\.token).joined(separator: "\n")
    }
}

// MARK: - Liste

/// Werkuno Studio → Newsletter (Creator Pro): Newsletter an Follower:innen schreiben, planen und
/// verschicken; verschickte mit Öffnungen und Klicks (wie /studio/newsletter im Web).
struct StudioNewsletterView: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router

    @State private var data: StudioNewsletterList?
    @State private var error: String?
    @State private var editing: NewsletterEditTarget?
    @State private var showing: StudioNewsletterItem?
    @State private var confirmDelete: StudioNewsletterItem?

    var body: some View {
        content
            .background(Color.paper)
            .navigationTitle("Newsletter")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if data?.pro == true {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { editing = .new } label: { Image(systemName: "square.and.pencil") }
                            .accessibilityLabel("Neuer Newsletter")
                    }
                }
            }
            .task { await load() }
            .refreshable { await load() }
            .sheet(item: $editing, onDismiss: { Task { await load() } }) { target in
                StudioNewsletterEditor(newsletterId: target.newsletterId)
            }
            .sheet(item: $showing) { n in StudioNewsletterStatsSheet(item: n) }
            .confirmationDialog(
                "Newsletter löschen?",
                isPresented: Binding(get: { confirmDelete != nil }, set: { if !$0 { confirmDelete = nil } }),
                titleVisibility: .visible,
                presenting: confirmDelete
            ) { n in
                Button("„\(n.subject)“ löschen", role: .destructive) { Task { await delete(n) } }
            } message: { n in
                Text(n.status == "SCHEDULED" ? "Der geplante Versand wird abgesagt." : "Der Entwurf wird endgültig gelöscht.")
            }
    }

    @ViewBuilder private var content: some View {
        if data == nil && error == nil {
            LoadingView()
        } else if let error, data == nil {
            ErrorStateView(message: error) { await load() }
        } else if let data {
            list(data)
        }
    }

    private var header: some View {
        PageTitle(kicker: "Werkuno Studio", title: "Newsletter", subtitle: "Schreib deinen Follower:innen direkt ins Postfach.")
    }

    private var proNotice: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Newsletter gehören zu Creator Pro: Neue Projekte, Anleitungen oder Drops direkt per E-Mail an deine Follower:innen – sofort oder geplant, mit Öffnungen und Klicks.")
                .font(.wr(.subheadline)).foregroundStyle(Color.ink2).fixedSize(horizontal: false, vertical: true)
            Button("Creator Pro ansehen") { router.open(.creatorPro) }
                .buttonStyle(.glassProminent).tint(.moss)
        }
    }

    private func summary(_ d: StudioNewsletterList) -> some View {
        HStack(spacing: 0) {
            StatCell(value: Fmt.number(d.recipients), label: "Empfänger:innen")
            StatCell(value: "\(d.quota.left) / \(d.quota.limit)", label: "frei in 30 Tagen")
        }
    }

    private func list(_ d: StudioNewsletterList) -> some View {
        List {
            Section {
                header.listRowInsets(EdgeInsets()).listRowBackground(Color.clear).listRowSeparator(.hidden)
                if d.pro {
                    summary(d).listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 8, trailing: 0)).listRowBackground(Color.clear).listRowSeparator(.hidden)
                } else {
                    proNotice.listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 12, trailing: 0)).listRowBackground(Color.clear).listRowSeparator(.hidden)
                }
                Text("Den Newsletter bekommen Follower:innen mit bestätigter E-Mail-Adresse, die ihn nicht abbestellt haben. Jede Mail enthält einen Abmeldelink.")
                    .font(.wr(.footnote)).foregroundStyle(Color.muted)
                    .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 8, trailing: 0))
                    .listRowBackground(Color.clear).listRowSeparator(.hidden)
            }
            if d.items.isEmpty {
                Section {
                    EmptyStateView(symbol: "envelope", title: "Noch keine Newsletter", message: "Erzähl deinen Follower:innen, woran du gerade arbeitest – mit bis zu drei Projekten, Anleitungen oder Produkten als Karten.", actionTitle: d.pro ? "Ersten Newsletter schreiben" : nil) { editing = .new }
                        .listRowInsets(EdgeInsets()).listRowBackground(Color.clear).listRowSeparator(.hidden)
                }
            } else {
                Section {
                    ForEach(d.items) { n in row(n, pro: d.pro) }
                } header: {
                    SpecLabel(Fmt.plural(d.items.count, "Newsletter", "Newsletter"))
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .contentMargins(.horizontal, Space.gutter, for: .scrollContent)
    }

    private func row(_ n: StudioNewsletterItem, pro: Bool) -> some View {
        StudioNewsletterRow(item: n)
            .contentShape(.rect)
            .onTapGesture {
                if n.isSent { showing = n } else if pro { editing = .edit(n.id) }
            }
            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                if !n.isSent {
                    Button("Löschen", systemImage: "trash", role: .destructive) { confirmDelete = n }
                }
            }
            .listRowBackground(Color.paper)
            .listRowInsets(EdgeInsets(top: 10, leading: 0, bottom: 10, trailing: 0))
    }

    private func load() async {
        do {
            let d: StudioNewsletterList = try await APIClient.shared.get("/studio/newsletters")
            withAnimation(.smooth) { data = d }
            error = nil
        } catch is CancellationError {
        } catch {
            self.error = (error as? APIError)?.message ?? error.localizedDescription
        }
    }

    private func delete(_ n: StudioNewsletterItem) async {
        await app.run(n.status == "SCHEDULED" ? "Versand abgesagt und gelöscht." : "Entwurf gelöscht.") {
            _ = try await APIClient.shared.delete("/studio/newsletters/\(n.id)") as JSONValue
        }
        await load()
    }
}

enum NewsletterEditTarget: Identifiable {
    case new
    case edit(String)
    var id: String {
        switch self {
        case .new: "new"
        case .edit(let id): id
        }
    }
    var newsletterId: String? {
        if case .edit(let id) = self { return id }
        return nil
    }
}

// MARK: - Zeile

struct StudioNewsletterRow: View {
    var item: StudioNewsletterItem

    private var when: String {
        switch item.status {
        case "SCHEDULED": "Versand \(Fmt.dateTime(item.scheduledAt))"
        case "SENT", "SENDING": "Verschickt \(Fmt.dateTime(item.sentAt ?? item.scheduledAt))"
        default: "Erstellt \(Fmt.date(item.createdAt))"
        }
    }

    var body: some View {
        let st = item.statusLabel
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text(item.subject).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink).lineLimit(2)
                Spacer(minLength: 8)
                MarketStatusPill(label: st.label, tint: st.tint)
            }
            Text(when).font(.wr(.footnote)).foregroundStyle(Color.muted)
            if item.isSent { stats }
        }
        .accessibilityElement(children: .combine)
        .accessibilityHint(item.isSent ? "Tippen für die Zahlen" : "Tippen zum Bearbeiten")
    }

    private var stats: some View {
        HStack(spacing: 6) {
            Text(Fmt.plural(item.recipientCount, "Empfänger:in", "Empfänger:innen"))
            Text("·")
            Text("geöffnet \(NewsletterMath.rateText(item.openCount, item.recipientCount))")
            Text("·")
            Text("geklickt \(NewsletterMath.rateText(item.clickCount, item.recipientCount))")
        }
        .font(.wr(.caption)).monospacedDigit().foregroundStyle(Color.ink2)
    }
}

// MARK: - Verschickt: Zahlen

struct StudioNewsletterStatsSheet: View {
    var item: StudioNewsletterItem

    @Environment(\.dismiss) private var dismiss
    @State private var detail: StudioNewsletterDetail?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text(item.subject).font(.titleSerif).foregroundStyle(Color.ink)
                    Text("Verschickt \(Fmt.dateTime(item.sentAt ?? item.scheduledAt))").font(.wr(.footnote)).foregroundStyle(Color.muted)
                    statsGrid
                    if let d = detail {
                        Text(NewsletterCardRef.strip(d.body)).font(.wr(.body)).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
                    }
                    Text("Öffnungen zählen nur, wenn das Mailprogramm Bilder lädt – die echte Zahl liegt meist höher. Ein Klick zählt auch als Öffnung.")
                        .font(.wr(.caption)).foregroundStyle(Color.muted)
                }
                .padding(Space.gutter)
            }
            .background(Color.paper)
            .navigationTitle("Newsletter")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Fertig") { dismiss() } } }
            .task { detail = try? await APIClient.shared.get("/studio/newsletters/\(item.id)") }
        }
    }

    private var statsGrid: some View {
        HStack(spacing: 0) {
            StatCell(value: Fmt.number(item.recipientCount), label: "Empfänger:innen")
            StatCell(value: NewsletterMath.rateText(item.openCount, item.recipientCount), label: "geöffnet")
            StatCell(value: NewsletterMath.rateText(item.clickCount, item.recipientCount), label: "geklickt")
        }
    }
}

// MARK: - Schreiben, planen, senden

/// Newsletter-Editor: Betreff, Text, bis zu drei Karten; speichern, Vorschau an mich, jetzt senden oder planen.
struct StudioNewsletterEditor: View {
    var newsletterId: String?

    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss

    @State private var id: String?
    @State private var status = "DRAFT"
    @State private var scheduledAt: Date?
    @State private var subject = ""
    @State private var text = ""
    @State private var cards: [NewsletterCardRef] = []
    @State private var options: NewsletterCardOptions?
    @State private var planLater = false
    @State private var planDate = Date.now.addingTimeInterval(24 * 3600)
    @State private var fields: [String: String] = [:]
    @State private var formError: String?
    @State private var busy = false
    @State private var loaded = false
    @State private var confirmSend = false

    private static let maxDays = 60

    var body: some View {
        NavigationStack {
            Group {
                if loaded { form } else { LoadingView() }
            }
            .navigationTitle(newsletterId == nil ? "Neuer Newsletter" : "Newsletter bearbeiten")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Schliessen") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button { Task { await saveDraft(close: true) } } label: {
                        if busy { ProgressView() } else { Text("Speichern").fontWeight(.semibold) }
                    }
                    .disabled(busy || !loaded)
                }
            }
            .task { await load() }
            .confirmationDialog(confirmTitle, isPresented: $confirmSend, titleVisibility: .visible) {
                Button(planLater ? "Planen" : "Jetzt senden") { Task { await send() } }
            } message: {
                Text(confirmMessage)
            }
        }
        .interactiveDismissDisabled(busy)
    }

    private var recipients: Int { options?.recipients ?? 0 }

    private var confirmTitle: String {
        planLater ? "Versand planen?" : "An \(Fmt.plural(recipients, "Person", "Personen")) senden?"
    }

    private var confirmMessage: String {
        let base = planLater
            ? "Der Newsletter geht am \(Fmt.dateTime(planDate)) an alle Follower:innen, die ihn dann empfangen können (heute \(Fmt.number(recipients)))."
            : "Der Newsletter geht innerhalb einer Minute an \(Fmt.plural(recipients, "Person", "Personen")). Danach lässt er sich nicht mehr ändern."
        guard let q = options?.quota, status != "SCHEDULED" else { return base }
        return base + " Damit bleiben dir \(max(0, q.left - 1)) von \(q.limit) Newslettern in 30 Tagen."
    }

    private var form: some View {
        Form {
            if let formError {
                Section { NoticeView(tone: .danger, message: formError).listRowInsets(EdgeInsets()).listRowBackground(Color.clear) }
            }
            if status == "SCHEDULED", let at = scheduledAt { scheduledSection(at) }
            textSection
            cardsSection
            sendSection
        }
        .scrollContentBackground(.hidden)
        .background(Color.paper)
    }

    private func scheduledSection(_ at: Date) -> some View {
        Section {
            Label("Geplant für \(Fmt.dateTime(at))", systemImage: "calendar.badge.clock").foregroundStyle(Color.ink)
            Button("Planung aufheben", systemImage: "xmark.circle") { Task { await unschedule() } }
                .disabled(busy)
        } footer: {
            Group { Text("Änderungen am Text gelten auch für den geplanten Versand, sobald du speicherst.") }.font(.wr(.footnote))
        }
    }

    private var textSection: some View {
        Section {
            TextField("Betreff", text: $subject)
            MarketFieldError(text: fields["subject"])
            TextField("Was gibt es Neues aus deiner Werkstatt?", text: $text, axis: .vertical)
                .lineLimit(8...20)
            MarketFieldError(text: fields["body"])
        } header: { Group { Text("Inhalt") }.font(.wr(.footnote, .semibold)) } footer: {
            Group { Text("Mindestens 20 Zeichen. Zahlungslinks sind nicht erlaubt – verkaufe über deinen Shop.") }.font(.wr(.footnote))
        }
    }

    private var cardsSection: some View {
        Section {
            ForEach(cards) { c in
                HStack {
                    Image(systemName: symbol(c.kind)).foregroundStyle(Color.moss).frame(width: 22)
                    Text(cardTitle(c)).font(.wr(.subheadline)).lineLimit(1)
                }
            }
            .onDelete { cards.remove(atOffsets: $0) }
            if cards.count < NewsletterCardRef.maxCards, let o = options { addCardMenu(o) }
        } header: { Group { Text("Karten") }.font(.wr(.footnote, .semibold)) } footer: {
            Group { Text("Bis zu drei eigene Projekte, Anleitungen oder Produkte erscheinen als Karten unter dem Text.") }.font(.wr(.footnote))
        }
    }

    private func addCardMenu(_ o: NewsletterCardOptions) -> some View {
        Menu {
            cardGroup("Projekte", kind: "projekt", items: o.options.projekt)
            cardGroup("Anleitungen", kind: "anleitung", items: o.options.anleitung)
            cardGroup("Produkte", kind: "produkt", items: o.options.produkt)
        } label: {
            Label("Karte hinzufügen", systemImage: "plus.circle")
        }
    }

    @ViewBuilder private func cardGroup(_ title: String, kind: String, items: [NewsletterCardOptions.Card]) -> some View {
        let free = items.filter { item in !cards.contains { $0.kind == kind && $0.cardId == item.id } }
        if !free.isEmpty {
            Section(title) {
                ForEach(free) { item in
                    Button(item.title) { cards.append(NewsletterCardRef(kind: kind, cardId: item.id)) }
                }
            }
        }
    }

    private var sendSection: some View {
        Section {
            Toggle("Später senden", isOn: $planLater.animation())
            if planLater {
                DatePicker("Zeitpunkt", selection: $planDate, in: Date.now.addingTimeInterval(300)...Date.now.addingTimeInterval(Double(Self.maxDays) * 86_400))
            }
            MarketFieldError(text: fields["at"])
            Button(planLater ? "Versand planen" : "Jetzt senden", systemImage: planLater ? "calendar.badge.clock" : "paperplane") {
                Task { await prepareSend() }
            }
            .disabled(busy)
            Button("Vorschau an mich senden", systemImage: "envelope.open") { Task { await preview() } }
                .disabled(busy)
        } header: { Group { Text("Versand") }.font(.wr(.footnote, .semibold)) } footer: {
            Group { Text(quotaText) }.font(.wr(.footnote))
        }
    }

    private var quotaText: String {
        guard let o = options else { return "" }
        return "\(Fmt.plural(o.recipients, "Person kann", "Personen können")) den Newsletter heute empfangen. Noch \(o.quota.left) von \(o.quota.limit) Newslettern in 30 Tagen frei."
    }

    private func symbol(_ kind: String) -> String {
        switch kind {
        case "anleitung": "list.number"
        case "produkt": "tag"
        default: "hammer"
        }
    }

    private func cardTitle(_ c: NewsletterCardRef) -> String {
        guard let o = options?.options else { return c.kind.capitalized }
        let list = c.kind == "anleitung" ? o.anleitung : c.kind == "produkt" ? o.produkt : o.projekt
        return list.first { $0.id == c.cardId }?.title ?? "Nicht mehr verfügbar"
    }

    // MARK: Logik

    private var payload: [String: JSONValue] {
        ["subject": .string(subject.trimmed), "body": .string(NewsletterCardRef.compose(text, cards))]
    }

    private func load() async {
        guard !loaded else { return }
        options = try? await APIClient.shared.get("/studio/newsletters/options")
        if let nid = newsletterId {
            do {
                let d: StudioNewsletterDetail = try await APIClient.shared.get("/studio/newsletters/\(nid)")
                id = d.id
                status = d.status
                scheduledAt = d.scheduledAt
                subject = d.subject
                text = NewsletterCardRef.strip(d.body)
                cards = NewsletterCardRef.extract(d.body)
                if let at = d.scheduledAt { planDate = max(at, Date.now.addingTimeInterval(300)) }
            } catch {
                formError = (error as? APIError)?.message ?? error.localizedDescription
            }
        }
        loaded = true
    }

    private func handle(_ error: Error) {
        if let err = error as? APIError {
            fields = err.fields ?? [:]
            formError = (err.fields?.isEmpty ?? true) ? err.message : nil
        } else {
            formError = error.localizedDescription
        }
        Haptics.warning()
    }

    /// Speichert den Entwurf; gibt die ID zurück (nil bei Fehler)
    @discardableResult
    private func saveDraft(close: Bool) async -> String? {
        formError = nil
        fields = [:]
        busy = true
        defer { busy = false }
        do {
            if let id {
                _ = try await APIClient.shared.put("/studio/newsletters/\(id)", payload) as JSONValue
            } else {
                let r: [String: JSONValue] = try await APIClient.shared.post("/studio/newsletters", payload)
                if case .string(let newId)? = r["id"] { id = newId }
            }
            if close {
                Haptics.success()
                app.show("Newsletter gespeichert.")
                dismiss()
            }
            return id
        } catch {
            handle(error)
            return nil
        }
    }

    private func prepareSend() async {
        guard await saveDraft(close: false) != nil else { return }
        confirmSend = true
    }

    private func send() async {
        guard let id else { return }
        formError = nil
        busy = true
        defer { busy = false }
        do {
            let body: [String: JSONValue] = planLater ? ["at": .string(JSON.isoFormatter.string(from: planDate))] : [:]
            _ = try await APIClient.shared.post("/studio/newsletters/\(id)/schedule", body) as JSONValue
            Haptics.success()
            app.show(planLater ? "Versand geplant für \(Fmt.dateTime(planDate))." : "Der Newsletter wird jetzt verschickt.")
            dismiss()
        } catch {
            handle(error)
        }
    }

    private func unschedule() async {
        guard let id else { return }
        busy = true
        defer { busy = false }
        do {
            _ = try await APIClient.shared.post("/studio/newsletters/\(id)/unschedule") as JSONValue
            status = "DRAFT"
            scheduledAt = nil
            app.show("Planung aufgehoben – der Newsletter ist wieder ein Entwurf.")
        } catch {
            handle(error)
        }
    }

    private func preview() async {
        formError = nil
        fields = [:]
        busy = true
        defer { busy = false }
        do {
            let r: [String: JSONValue] = try await APIClient.shared.post("/studio/newsletters/preview", payload)
            if case .string(let to)? = r["to"] { app.show("Vorschau an \(to) geschickt.") } else { app.show("Vorschau verschickt.") }
        } catch {
            handle(error)
        }
    }
}
