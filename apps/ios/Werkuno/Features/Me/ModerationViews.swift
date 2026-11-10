import SwiftUI

// MARK: - Einspruch (§24.1 Nr. 8)

struct AppealView: View {
    var caseId: String
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @State private var ctx: MeAppealContext?
    @State private var loaded = false
    @State private var error: String?
    @State private var statement = ""

    var body: some View {
        Group {
            if let error { ErrorStateView(message: error) { await load() } }
            else if !loaded { LoadingView() }
            else if let ctx { content(ctx) }
            else {
                EmptyStateView(symbol: "doc.questionmark", title: "Fall nicht gefunden", message: "Diesen Moderationsfall gibt es nicht oder er betrifft nicht dein Konto.")
            }
        }
        .background(Color.paper)
        .navigationTitle("Einspruch")
        .navigationBarTitleDisplayMode(.inline)
        .task { if !loaded { await load() } }
        .refreshable { await load() }
    }

    private func load() async {
        do {
            let c: MeAppealContext? = try await APIClient.shared.get("/appeals/\(caseId)")
            ctx = c; loaded = true; error = nil
        } catch { self.error = MeErr.text(error) }
    }

    private func content(_ c: MeAppealContext) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                PageTitle(kicker: "Fall Nº \(c.number) · \(MeLabels.caseStatus(c.status))", title: "Moderationsentscheidung", subtitle: c.title.map { "Betrifft: \($0)" })
                VStack(spacing: 0) {
                    if let t = c.targetType { SpecRow(label: "Inhalt", value: MeLabels.targetType(t), symbol: "doc") }
                    if let r = c.reasonLabel { SpecRow(label: "Gemeldet wegen", value: r, symbol: "flag") }
                    if let d = c.decision {
                        SpecRow(label: "Massnahme", value: MeLabels.action(d.action), symbol: "checkmark.shield")
                        if let u = d.until { SpecRow(label: "Gilt bis", value: Fmt.dateTime(u), symbol: "clock") }
                        if let at = d.createdAt { SpecRow(label: "Entschieden am", value: Fmt.dateTime(at), symbol: "calendar") }
                    }
                    if let dl = c.deadline { SpecRow(label: "Einspruch möglich bis", value: Fmt.dateTime(dl), symbol: "hourglass") }
                }
                .padding(.horizontal, 14)
                .cardSurface()

                if let note = c.decision?.publicNote?.nilIfEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        SpecLabel("Begründung des Moderationsteams")
                        Text(note).font(.wr(.body)).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .sunkenSurface()
                }

                if let a = c.appeal {
                    VStack(alignment: .leading, spacing: 10) {
                        SectionHeader("Dein Einspruch", subtitle: a.createdAt.map { "eingereicht \(Fmt.dateTime($0))" })
                        MeStatePill(text: MeLabels.appealStatus(a.status), tone: a.status == "OVERTURNED" ? .moss : a.status == "UPHELD" ? .clay : .slate)
                        if let s = a.statement { Text(s).font(.wr(.subheadline)).foregroundStyle(Color.ink2).fixedSize(horizontal: false, vertical: true) }
                        if let d = a.decision?.nilIfEmpty {
                            NoticeView(tone: a.status == "OVERTURNED" ? .success : .info, title: a.status == "OVERTURNED" ? "Massnahme aufgehoben" : "Entscheidung bestätigt", message: d)
                        } else if a.status == "OPEN" {
                            NoticeView(tone: .info, message: "Eine andere Person aus dem Team prüft deinen Einspruch. Du wirst benachrichtigt, sobald entschieden ist.")
                        }
                    }
                } else if c.canAppeal {
                    VStack(alignment: .leading, spacing: 10) {
                        SectionHeader("Einspruch erheben", subtitle: "Erkläre sachlich, warum die Entscheidung aus deiner Sicht falsch ist.")
                        TextField("Deine Begründung", text: $statement, axis: .vertical)
                            .lineLimit(6...16)
                            .padding(12)
                            .background(Color.card, in: .rect(cornerRadius: Radius.inner, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: Radius.inner, style: .continuous).strokeBorder(Color.line))
                        MeCharCounter(count: statement.trimmed.count, min: 30, max: 3000)
                        AsyncButton {
                            do {
                                let r: OK = try await APIClient.shared.post("/appeals/\(caseId)", ["statement": JSONValue.string(statement.trimmed)])
                                app.show(r.message ?? "Dein Einspruch ist eingegangen.")
                                statement = ""
                                await load()
                            } catch { app.show(error: error) }
                        } label: { Text("Einspruch senden") }
                        .primaryButton()
                        .disabled(statement.trimmed.count < 30 || statement.count > 3000)
                        Text("Ein Einspruch pro Fall. Er wird von einer anderen Person geprüft als der, die entschieden hat.").font(.wr(.caption)).foregroundStyle(Color.muted)
                    }
                } else {
                    NoticeView(tone: .info, message: c.deadline.map { $0 < Date() ? "Die Einspruchsfrist von 14 Tagen ist abgelaufen." : "Gegen diesen Fall ist derzeit kein Einspruch möglich." } ?? "Gegen diesen Fall ist kein Einspruch möglich.")
                }

                Button { router.open(.web(path: "/richtlinien/community")) } label: { Label("Community-Richtlinien lesen", systemImage: "book") }
                    .buttonStyle(.glass)
            }
            .padding(.horizontal, Space.gutter)
            .padding(.bottom, 40)
        }
    }
}

// MARK: - Moderation (§24)

private enum MeModTab: String, Hashable { case overview, queue, appeals, reports, users, content }

struct ModerationView: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @State private var tab: MeModTab = .queue
    @State private var dashboard: MeAdminDashboard?

    var body: some View {
        Group {
            if app.me?.isModerator != true {
                EmptyStateView(symbol: "lock.shield", title: "Nur für das Moderationsteam", message: "Dieser Bereich ist Moderator:innen und der Administration vorbehalten.")
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0, pinnedViews: [.sectionHeaders]) {
                        PageTitle(kicker: "Team", title: "Moderation", subtitle: "Fälle nach Risiko und Alter. Jede Entscheidung wird begründet und protokolliert.")
                            .padding(.horizontal, Space.gutter)
                            .padding(.bottom, 8)
                        Section {
                            Group {
                                switch tab {
                                case .overview: MeModOverview(data: dashboard) { await loadDashboard() }
                                case .queue: MeModQueueList()
                                case .appeals: MeModAppealsList()
                                case .reports: MeModReportsList()
                                case .users: MeAdminUsersList()
                                case .content: MeAdminContentList()
                                }
                            }
                            .padding(.horizontal, Space.gutter)
                            .padding(.top, 12)
                            .padding(.bottom, 40)
                        } header: {
                            MeTabSwitcher(items: [
                                (MeModTab.queue, "Fälle", dashboard?.counts?.cases),
                                (.appeals, "Einsprüche", dashboard?.counts?.appeals),
                                (.reports, "Meldungen", nil),
                                (.users, "Nutzer:innen", nil),
                                (.content, "Inhalte", nil),
                                (.overview, "Kennzahlen", nil),
                            ], selection: $tab)
                        }
                    }
                }
            }
        }
        .background(Color.paper)
        .navigationTitle("Moderation")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { router.open(.web(path: "/admin")) } label: { Image(systemName: "safari") }
                    .accessibilityLabel("Web-Admin öffnen")
            }
        }
        .task { await loadDashboard() }
    }

    private func loadDashboard() async {
        if let d: MeAdminDashboard = try? await APIClient.shared.get("/admin/dashboard") { dashboard = d }
    }
}

private struct MeModOverview: View {
    var data: MeAdminDashboard?
    var reload: () async -> Void
    @Environment(Router.self) private var router

    var body: some View {
        if let d = data {
            VStack(alignment: .leading, spacing: 20) {
                grid("Moderation", [
                    ("Offene Fälle", Fmt.number(d.kpis.moderation?.openCases)),
                    ("Offene Einsprüche", Fmt.number(d.kpis.moderation?.appealsOpen)),
                    ("Erledigt (30 T.)", Fmt.number(d.kpis.moderation?.resolved30)),
                    ("Median Bearbeitung", d.kpis.moderation?.medianHandlingSeconds.map(duration) ?? "–"),
                ])
                grid("Aktivität", [
                    ("Aktiv 7 Tage", Fmt.number(d.kpis.activity?.wau)),
                    ("Aktiv 30 Tage", Fmt.number(d.kpis.activity?.mau)),
                    ("Konten", Fmt.number(d.kpis.activity?.users)),
                    ("Neu (7 T.)", Fmt.number(d.kpis.activity?.newUsers7)),
                ])
                grid("Projekte & Community", [
                    ("Veröffentlicht", Fmt.number(d.kpis.projects?.published)),
                    ("Neu (7 T.)", Fmt.number(d.kpis.projects?.new7)),
                    ("Mit Materialliste", pct(d.kpis.projects?.shareWithMaterials)),
                    ("Beiträge (7 T.)", Fmt.number(d.kpis.community?.posts7)),
                ])
                grid("Marktplatz", [
                    ("Aktive Shops", Fmt.number(d.kpis.market?.activeSellers)),
                    ("Wartende Shops", Fmt.number(d.kpis.market?.pendingSellers)),
                    ("Bestellungen (30 T.)", Fmt.number(d.kpis.market?.orders30)),
                    ("Erstattungsquote", pct(d.kpis.market?.refundRate)),
                ])
                if let m = d.kpis.money {
                    grid("Umsatz (nur Admin)", [
                        ("GMV 30 T.", Fmt.money(m.gmv30)), ("Vorperiode", Fmt.money(m.gmvPrev30)),
                        ("Provision 30 T.", Fmt.money(m.commission30)), ("Warenkorb Ø", Fmt.money(m.aov)),
                    ])
                }
                if let c = d.counts {
                    NoticeView(tone: .info, title: "Offene Arbeit", message: "\(c.cases ?? 0) Fälle · \(c.appeals ?? 0) Einsprüche · \(c.shops ?? 0) Shop-Prüfungen · \(c.tickets ?? 0) Support-Anfragen · \(c.disputes ?? 0) Zahlungsstreitigkeiten")
                }
                NoticeView(tone: .info, title: "Im Web-Admin", message: "System, Audit-Protokoll, Kategorien, Redaktion, Shop-Prüfungen und Support bleiben im Web-Admin.")
                Button { router.open(.web(path: "/admin")) } label: { Label("Web-Admin öffnen", systemImage: "safari") }
                    .buttonStyle(.glass)
            }
        } else {
            LoadingView().task { await reload() }
        }
    }

    private func pct(_ v: Double?) -> String { v.map { "\(Int(($0 * 100).rounded())) %" } ?? "–" }
    private func duration(_ s: Double) -> String {
        if s < 3600 { return "\(Int(s / 60)) Min." }
        if s < 86400 { return String(format: "%.1f Std.", s / 3600) }
        return String(format: "%.1f Tage", s / 86400)
    }

    private func grid(_ title: String, _ items: [(String, String)]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SpecLabel(title)
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                ForEach(items, id: \.0) { MeKPI(label: $0.0, value: $0.1) }
            }
        }
    }
}

// MARK: Warteschlange

private struct MeModQueueList: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @State private var status = "ACTIVE"
    @State private var assignee = ""
    @State private var targetType = ""
    @State private var query = ""
    @State private var submittedQuery = ""
    @State private var rows: [MeModCase]?
    @State private var byStatus: [String: Int] = [:]
    @State private var page = 1
    @State private var pages = 1
    @State private var total = 0
    @State private var error: String?

    private static let statuses = ["ACTIVE", "OPEN", "IN_REVIEW", "APPEALED", "RESOLVED", "CLOSED", "ALL"]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(Self.statuses, id: \.self) { s in
                        let on = s == status
                        Button { withAnimation(.snappy) { status = s } } label: {
                            HStack(spacing: 4) {
                                Text(label(s))
                                if let n = count(s), n > 0 { Text("\(n)").monospacedDigit().opacity(0.7) }
                            }
                            .font(.wr(.footnote).weight(on ? .semibold : .regular))
                            .foregroundStyle(on ? Color.paper : Color.ink)
                            .padding(.horizontal, 12).padding(.vertical, 7)
                            .background(on ? Color.action : Color.sunken, in: Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .scrollClipDisabled()
            HStack(spacing: 8) {
                HStack {
                    Image(systemName: "magnifyingglass").foregroundStyle(Color.muted)
                    TextField("Nº, @handle oder Ziel-ID", text: $query)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                        .submitLabel(.search)
                        .onSubmit { submittedQuery = query.trimmed }
                    if !query.isEmpty { Button { query = ""; submittedQuery = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(Color.muted) }.accessibilityLabel("Suche leeren") }
                }
                .padding(.horizontal, 12).padding(.vertical, 9)
                .background(Color.sunken, in: Capsule())
                Menu {
                    Picker("Zuständig", selection: $assignee) {
                        Text("Alle").tag("")
                        Text("Mir zugewiesen").tag("me")
                        Text("Nicht zugewiesen").tag("none")
                    }
                    Picker("Inhalt", selection: $targetType) {
                        Text("Alle Inhalte").tag("")
                        ForEach(["POST", "COMMENT", "PROJECT", "TUTORIAL", "PRODUCT", "ARTICLE", "COMMUNITY", "MESSAGE", "USER", "REVIEW"], id: \.self) { Text(MeLabels.targetType($0)).tag($0) }
                    }
                } label: {
                    Image(systemName: assignee.isEmpty && targetType.isEmpty ? "line.3.horizontal.decrease.circle" : "line.3.horizontal.decrease.circle.fill")
                        .font(.wr(.title3)).frame(width: 44, height: 44)
                }
                .accessibilityLabel("Filter")
            }
            MePhase(value: rows, error: error, retry: { await load(reset: true) }) { rows in
                if rows.isEmpty {
                    EmptyStateView(symbol: "checkmark.shield", title: "Keine Fälle", message: "In dieser Ansicht ist nichts offen.")
                } else {
                    LazyVStack(spacing: 10) {
                        Text("\(Fmt.plural(total, "Fall", "Fälle")) · sortiert nach Risiko, dann Alter").font(.wr(.caption)).foregroundStyle(Color.muted)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        ForEach(rows) { c in MeCaseRow(c: c) { router.open(.moderationCase(id: c.id)) } }
                        LoadMoreTrigger(hasMore: page < pages) { await load(reset: false) }
                    }
                }
            }
        }
        .task(id: "\(status)|\(assignee)|\(targetType)|\(submittedQuery)") { await load(reset: true) }
    }

    private func label(_ s: String) -> String { s == "ACTIVE" ? "Aktiv" : s == "ALL" ? "Alle" : MeLabels.caseStatus(s) }
    private func count(_ s: String) -> Int? {
        if s == "ACTIVE" { return (byStatus["OPEN"] ?? 0) + (byStatus["IN_REVIEW"] ?? 0) + (byStatus["APPEALED"] ?? 0) }
        if s == "ALL" { return nil }
        return byStatus[s]
    }

    private func load(reset: Bool) async {
        let next = reset ? 1 : page + 1
        do {
            let q: MeModQueue = try await APIClient.shared.get("/admin/queue", query: ["status": status, "assignee": assignee.nilIfEmpty, "targetType": targetType.nilIfEmpty, "q": submittedQuery.nilIfEmpty, "page": String(next)])
            rows = reset ? q.rows : (rows ?? []) + q.rows
            byStatus = q.byStatus ?? [:]
            page = q.page; pages = q.pages; total = q.total
            error = nil
        } catch { if rows == nil || reset { self.error = MeErr.text(error); rows = nil } else { pages = page; app.show(error: error) } }
    }
}

private struct MeCaseRow: View {
    var c: MeModCase
    var action: () -> Void
    var body: some View {
        let risk = MeLabels.risk(c.riskScore)
        Button(action: action) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    Text("Nº \(c.number)").font(.specLarge).foregroundStyle(Color.moss)
                    MeStatePill(text: MeLabels.caseStatus(c.status), tone: c.status == "OPEN" ? .clay : c.status == "IN_REVIEW" ? .slate : c.status == "APPEALED" ? .warn : .neutral)
                    MeStatePill(text: "\(risk.label) · \(c.riskScore ?? 0)", tone: risk.tone == .danger ? .danger : risk.tone == .warn ? .warn : .neutral)
                    Spacer()
                    Text(Fmt.relative(c.createdAt)).font(.wr(.caption)).foregroundStyle(Color.muted)
                }
                Text(c.title ?? MeLabels.targetType(c.targetType)).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink).lineLimit(2).multilineTextAlignment(.leading)
                HStack(spacing: 6) {
                    Text([MeLabels.targetType(c.targetType), MeLabels.reason(c.primaryReason), Fmt.plural(c._count?.reports ?? c.reportCount ?? 1, "Meldung", "Meldungen")].joined(separator: " · "))
                    Spacer(minLength: 0)
                }
                .font(.wr(.caption)).foregroundStyle(Color.muted)
                HStack(spacing: 10) {
                    if let h = c.subjectUser?.handle { Label("@\(h)", systemImage: "person").labelStyle(.compact) }
                    if let a = c.assignee?.handle { Label("bei @\(a)", systemImage: "person.badge.shield.checkmark").labelStyle(.compact) }
                    else { Label("nicht zugewiesen", systemImage: "tray").labelStyle(.compact) }
                    if (c._count?.appeals ?? 0) > 0 { Label("Einspruch", systemImage: "arrow.uturn.backward").labelStyle(.compact).foregroundStyle(Color.warn) }
                }
                .font(.wr(.caption)).foregroundStyle(Color.ink2)
            }
            .padding(14)
            .cardSurface()
            .overlay(alignment: .leading) {
                if risk.tone != .info { Capsule().fill(risk.tone == .danger ? Color.danger : Color.warn).frame(width: 3).padding(.vertical, 14) }
            }
        }
        .buttonStyle(.pressable)
    }
}

// MARK: Einsprüche

private struct MeModAppealsList: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @State private var status = "OPEN"
    @State private var rows: [MeModAppeal]?
    @State private var error: String?
    @State private var deciding: MeModAppeal?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Picker("Status", selection: $status) {
                Text("Offen").tag("OPEN"); Text("Bestätigt").tag("UPHELD"); Text("Aufgehoben").tag("OVERTURNED"); Text("Alle").tag("ALL")
            }
            .pickerStyle(.segmented)
            MePhase(value: rows, error: error, retry: load) { rows in
                if rows.isEmpty {
                    EmptyStateView(symbol: "arrow.uturn.backward.circle", title: "Keine Einsprüche", message: "In dieser Ansicht gibt es nichts zu prüfen.")
                } else {
                    LazyVStack(spacing: 10) { ForEach(rows) { card($0) } }
                }
            }
        }
        .task(id: status) { await load() }
        .sheet(item: $deciding) { a in
            MeAppealDecisionSheet(appeal: a) { await load() }.meSheetEnvironment(app, router)
        }
    }

    private func load() async {
        do { rows = try await APIClient.shared.get("/admin/appeals", query: ["status": status]); error = nil }
        catch { self.error = MeErr.text(error) }
    }

    private func card(_ a: MeModAppeal) -> some View {
        let original = a.case?.actions?.first
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                if let n = a.case?.number { Text("Nº \(n)").font(.specLarge).foregroundStyle(Color.moss) }
                MeStatePill(text: MeLabels.appealStatus(a.status), tone: a.status == "OPEN" ? .warn : a.status == "OVERTURNED" ? .moss : .neutral)
                Spacer()
                Text(Fmt.relative(a.createdAt)).font(.wr(.caption)).foregroundStyle(Color.muted)
            }
            if let t = a.case?.title { Text(t).font(.wr(.subheadline, .semibold)).lineLimit(2) }
            Text([a.user?.handle.map { "@\($0)" }, MeLabels.targetType(a.case?.targetType), original.map { "Massnahme: \(MeLabels.action($0.action))" }].compactMap { $0?.nilIfEmpty }.joined(separator: " · "))
                .font(.wr(.caption)).foregroundStyle(Color.muted)
            Text(a.statement).font(.wr(.subheadline)).foregroundStyle(Color.ink2).lineLimit(6).padding(10).frame(maxWidth: .infinity, alignment: .leading).sunkenSurface()
            if let d = a.decision?.nilIfEmpty { Text("Entscheid: \(d)").font(.wr(.caption)).foregroundStyle(Color.ink2) }
            HStack {
                if let cid = a.case?.id ?? a.caseId {
                    Button("Fall ansehen") { router.open(.moderationCase(id: cid)) }.buttonStyle(.glass).font(.wr(.footnote, .semibold))
                }
                Spacer()
                if a.status == "OPEN" {
                    Button("Entscheiden") { deciding = a }.buttonStyle(.glassProminent).tint(.moss).font(.wr(.footnote, .semibold))
                }
            }
        }
        .padding(14)
        .cardSurface()
    }
}

private struct MeAppealDecisionSheet: View {
    var appeal: MeModAppeal
    var onDone: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var app
    @State private var decision = "UPHELD"
    @State private var note = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(appeal.statement).font(.wr(.subheadline))
                } header: { Text("Begründung von \(appeal.user?.handle.map { "@\($0)" } ?? "der Person")") }
                if let o = appeal.case?.actions?.first {
                    Section("Ursprüngliche Entscheidung") {
                        LabeledContent("Massnahme", value: MeLabels.action(o.action))
                        if let r = o.reason?.nilIfEmpty { Text(r).font(.wr(.caption)).foregroundStyle(Color.muted) }
                        if let h = o.moderator?.handle { LabeledContent("Von", value: "@\(h)") }
                    }
                }
                Section {
                    Picker("Entscheid", selection: $decision) {
                        Text("Bestätigen").tag("UPHELD")
                        Text("Aufheben").tag("OVERTURNED")
                    }
                    .pickerStyle(.segmented)
                    TextField("Begründung an die Person (mind. 10 Zeichen)", text: $note, axis: .vertical).lineLimit(3...8)
                    MeCharCounter(count: note.trimmed.count, min: 10, max: 2000)
                } header: { Text("Dein Entscheid") } footer: {
                    Text(decision == "OVERTURNED" ? "Die Massnahme wird exakt zurückgenommen. Die Person wird benachrichtigt." : "Die Massnahme bleibt bestehen. Die Person wird benachrichtigt.")
                }
            }
            .meFormStyle()
            .navigationTitle("Einspruch entscheiden")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    AsyncButton("Senden") {
                        if await app.run(decision == "OVERTURNED" ? "Einspruch stattgegeben." : "Entscheidung bestätigt.", {
                            _ = try await APIClient.shared.post("/admin/appeals/\(appeal.id)/decide", ["decision": JSONValue.string(decision), "note": .string(note.trimmed)]) as JSONValue
                        }) { await onDone(); dismiss() }
                    }
                    .disabled(note.trimmed.count < 10)
                }
            }
        }
    }
}

// MARK: Meldungen

private struct MeModReportsList: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @State private var reason = ""
    @State private var rows: [MeModReport]?
    @State private var byReason: [String: Int] = [:]
    @State private var page = 1
    @State private var pages = 1
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    chip("", "Alle", nil)
                    ForEach(L.reportReasons, id: \.key) { r in chip(r.key, r.label, byReason[r.key]) }
                }
            }
            .scrollClipDisabled()
            Text("Zähler: letzte 30 Tage").font(.wr(.caption)).foregroundStyle(Color.muted)
            MePhase(value: rows, error: error, retry: { await load(reset: true) }) { rows in
                if rows.isEmpty {
                    EmptyStateView(symbol: "flag", title: "Keine Meldungen")
                } else {
                    LazyVStack(spacing: 0) {
                        ForEach(rows) { r in
                            Button { if let id = r.case?.id ?? r.caseId { router.open(.moderationCase(id: id)) } } label: {
                                VStack(alignment: .leading, spacing: 5) {
                                    HStack {
                                        Text(MeLabels.reason(r.reason)).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink)
                                        Spacer()
                                        Text(Fmt.relative(r.createdAt)).font(.wr(.caption)).foregroundStyle(Color.muted)
                                    }
                                    Text([MeLabels.targetType(r.targetType), r.reporter?.handle.map { "von @\($0)" }, r.case.map { "Fall Nº \($0.number ?? 0) · \(MeLabels.caseStatus($0.status ?? ""))" }].compactMap { $0?.nilIfEmpty }.joined(separator: " · "))
                                        .font(.wr(.caption)).foregroundStyle(Color.muted)
                                    if let d = r.details?.nilIfEmpty { Text(d).font(.wr(.caption)).foregroundStyle(Color.ink2).lineLimit(3) }
                                }
                                .padding(14)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .contentShape(.rect)
                            }
                            .buttonStyle(.plain)
                            .hairline()
                        }
                        LoadMoreTrigger(hasMore: page < pages) { await load(reset: false) }
                    }
                    .cardSurface()
                }
            }
        }
        .task(id: reason) { await load(reset: true) }
    }

    private func chip(_ key: String, _ label: String, _ n: Int?) -> some View {
        let on = key == reason
        return Button { withAnimation(.snappy) { reason = key } } label: {
            HStack(spacing: 4) {
                Text(label)
                if let n, n > 0 { Text("\(n)").monospacedDigit().opacity(0.7) }
            }
            .font(.wr(.footnote).weight(on ? .semibold : .regular))
            .foregroundStyle(on ? Color.paper : Color.ink)
            .padding(.horizontal, 12).padding(.vertical, 7)
            .background(on ? Color.action : Color.sunken, in: Capsule())
        }
        .buttonStyle(.plain)
    }

    private func load(reset: Bool) async {
        let next = reset ? 1 : page + 1
        do {
            let r: MeModReports = try await APIClient.shared.get("/admin/reports", query: ["reason": reason.nilIfEmpty, "page": String(next)])
            rows = reset ? r.rows : (rows ?? []) + r.rows
            byReason = r.byReason ?? [:]
            page = r.page; pages = r.pages
            error = nil
        } catch { if reset { self.error = MeErr.text(error); rows = nil } else { pages = page; app.show(error: error) } }
    }
}

// MARK: Nutzer:innen

private struct MeAdminUsersList: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @State private var query = ""
    @State private var submitted = ""
    @State private var status = ""
    @State private var role = ""
    @State private var rows: [MeAdminUserRow]?
    @State private var total = 0
    @State private var page = 1
    @State private var pages = 1
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                HStack {
                    Image(systemName: "magnifyingglass").foregroundStyle(Color.muted)
                    TextField("@handle, Name, exakte E-Mail oder ID", text: $query)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                        .submitLabel(.search)
                        .onSubmit { submitted = query.trimmed }
                }
                .padding(.horizontal, 12).padding(.vertical, 9)
                .background(Color.sunken, in: Capsule())
                Menu {
                    Picker("Status", selection: $status) {
                        Text("Alle Status").tag("")
                        ForEach(["ACTIVE", "SUSPENDED", "BANNED", "DELETED"], id: \.self) { Text(MeLabels.accountStatus($0)).tag($0) }
                    }
                    Picker("Rolle", selection: $role) {
                        Text("Alle Rollen").tag("")
                        ForEach(["MEMBER", "PLATFORM_MODERATOR", "ADMIN", "SUPERADMIN"], id: \.self) { Text(L.roles[$0] ?? $0).tag($0) }
                    }
                } label: {
                    Image(systemName: status.isEmpty && role.isEmpty ? "line.3.horizontal.decrease.circle" : "line.3.horizontal.decrease.circle.fill")
                        .font(.wr(.title3)).frame(width: 44, height: 44)
                }
                .accessibilityLabel("Filter")
            }
            Text("E-Mail-Suche nur als exakter Treffer – keine Teilstring-Suche.").font(.wr(.caption)).foregroundStyle(Color.muted)
            MePhase(value: rows, error: error, retry: { await load(reset: true) }) { rows in
                if rows.isEmpty {
                    EmptyStateView(symbol: "person.crop.circle.badge.questionmark", title: "Niemand gefunden")
                } else {
                    LazyVStack(spacing: 0) {
                        ForEach(rows) { u in
                            Button { router.open(.adminUser(id: u.id)) } label: {
                                HStack(spacing: 12) {
                                    AvatarView(url: u.profile?.avatarUrl, name: u.profile?.displayName ?? u.email ?? "?", size: 40)
                                    VStack(alignment: .leading, spacing: 2) {
                                        HStack(spacing: 6) {
                                            Text(u.profile?.displayName ?? "Ohne Profil").font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink)
                                            if u.role != "MEMBER" { MeStatePill(text: L.roles[u.role] ?? u.role, tone: .slate) }
                                            if u.status != "ACTIVE" { MeStatePill(text: MeLabels.accountStatus(u.status), tone: .danger) }
                                        }
                                        Text([u.profile?.handle.map { "@\($0)" }, u.email, (u._count?.moderationSubject ?? 0) > 0 ? "\(u._count?.moderationSubject ?? 0) Fälle" : nil].compactMap { $0 }.joined(separator: " · "))
                                            .font(.wr(.caption)).foregroundStyle(Color.muted).lineLimit(1)
                                    }
                                    Spacer(minLength: 0)
                                    Image(systemName: "chevron.right").font(.wr(.caption)).foregroundStyle(Color.lineStrong)
                                }
                                .padding(12)
                                .contentShape(.rect)
                            }
                            .buttonStyle(.plain)
                            .hairline()
                        }
                        LoadMoreTrigger(hasMore: page < pages) { await load(reset: false) }
                    }
                    .cardSurface()
                    Text(Fmt.plural(total, "Konto", "Konten")).font(.wr(.caption)).foregroundStyle(Color.muted)
                }
            }
        }
        .task(id: "\(submitted)|\(status)|\(role)") { await load(reset: true) }
    }

    private func load(reset: Bool) async {
        let next = reset ? 1 : page + 1
        do {
            let r: MeAdminUsers = try await APIClient.shared.get("/admin/users", query: ["q": submitted.nilIfEmpty, "status": status.nilIfEmpty, "role": role.nilIfEmpty, "page": String(next)])
            rows = reset ? r.rows : (rows ?? []) + r.rows
            total = r.total; page = r.page; pages = r.pages
            error = nil
        } catch { if reset { self.error = MeErr.text(error); rows = nil } else { pages = page; app.show(error: error) } }
    }
}

// MARK: - Falldetail

struct ModerationCaseView: View {
    var id: String
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @State private var data: MeModCaseDetail?
    @State private var error: String?
    @State private var action = "NONE"
    @State private var reason = ""
    @State private var publicNote = ""
    @State private var days = 7
    @State private var confirmDecide = false

    var body: some View {
        MePhase(value: data, error: error, retry: load) { d in content(d) }
            .background(Color.paper)
            .navigationTitle(data.map { "Fall Nº \($0.case.number)" } ?? "Fall")
            .navigationBarTitleDisplayMode(.inline)
            .task { if data == nil { await load() } }
            .refreshable { await load() }
            .confirmationDialog("Entscheidung treffen?", isPresented: $confirmDecide, titleVisibility: .visible) {
                Button(MeLabels.action(action), role: action == "NONE" ? nil : .destructive) { Task { await decide() } }
            } message: { Text("Die Entscheidung wird protokolliert. Betroffene und Meldende werden benachrichtigt.") }
    }

    private func load() async {
        do {
            let d: MeModCaseDetail = try await APIClient.shared.get("/admin/cases/\(id)")
            data = d
            let allowed = MeLabels.allowedActions(targetType: d.case.targetType, hasSubject: d.case.subjectUserId != nil)
            if !allowed.contains(action) { action = allowed.first ?? "NONE" }
            error = nil
        } catch { if data == nil { self.error = MeErr.text(error) } else { app.show(error: error) } }
    }

    private func content(_ d: MeModCaseDetail) -> some View {
        let c = d.case
        let risk = MeLabels.risk(c.riskScore)
        let open = c.status == "OPEN" || c.status == "IN_REVIEW"
        let mine = c.assigneeId == app.me?.id
        return ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                VStack(alignment: .leading, spacing: 10) {
                    PageTitle(kicker: "\(MeLabels.targetType(c.targetType)) · \(MeLabels.reason(c.primaryReason))", title: "Fall Nº \(c.number)", subtitle: "Eröffnet \(Fmt.dateTime(c.createdAt))")
                    HStack(spacing: 6) {
                        MeStatePill(text: MeLabels.caseStatus(c.status), tone: open ? .clay : .neutral)
                        MeStatePill(text: "\(risk.label) · \(c.riskScore ?? 0)", tone: risk.tone == .danger ? .danger : risk.tone == .warn ? .warn : .neutral)
                        MeStatePill(text: Fmt.plural(c.reports?.count ?? c.reportCount ?? 0, "Meldung", "Meldungen"), tone: .slate)
                    }
                    HStack(spacing: 8) {
                        Label(c.assignee?.handle.map { "Zugewiesen an @\($0)" } ?? "Nicht zugewiesen", systemImage: "person.badge.shield.checkmark")
                            .font(.wr(.footnote)).foregroundStyle(Color.ink2)
                        Spacer()
                        if open {
                            AsyncButton {
                                if await app.run(mine ? "Fall freigegeben." : "Fall übernommen.", {
                                    _ = try await APIClient.shared.post("/admin/cases/\(id)/assign", ["assign": JSONValue.bool(!mine)]) as JSONValue
                                }) { await load() }
                            } label: { Text(mine ? "Freigeben" : "Übernehmen").font(.wr(.footnote, .semibold)) }
                            .glassToggleStyle(prominent: !mine)
                            .tint(.moss)
                        }
                    }
                }

                if let p = d.preview { preview(p) }
                if let s = c.subjectUser { subject(s) }
                reports(c, stats: d.reporterStats ?? [:])
                if !(c.actions ?? []).isEmpty || !(c.appeals ?? []).isEmpty { timeline(c) }
                if let h = d.history, !h.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        SectionHeader("Frühere Fälle dieser Person", number: "05")
                        ForEach(h) { old in
                            Button { router.open(.moderationCase(id: old.id)) } label: {
                                HStack {
                                    Text("Nº \(old.number)").font(.specLarge).foregroundStyle(Color.moss)
                                    Text("\(MeLabels.targetType(old.targetType)) · \(MeLabels.reason(old.primaryReason))").font(.wr(.subheadline)).foregroundStyle(Color.ink)
                                    Spacer()
                                    Text(old.actions?.first.map { MeLabels.action($0.action) } ?? MeLabels.caseStatus(old.status)).font(.wr(.caption)).foregroundStyle(Color.muted)
                                }
                                .padding(.vertical, 8)
                                .hairline()
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                if open { decisionForm(c) }
            }
            .padding(.horizontal, Space.gutter)
            .padding(.bottom, 40)
        }
    }

    private func preview(_ p: MeModPreview) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader("Gemeldeter Inhalt", number: "01") {
                if let h = p.href { Button("Öffnen") { router.open(href: h) }.font(.wr(.subheadline)) }
            }
            VStack(alignment: .leading, spacing: 10) {
                if !p.exists { NoticeView(tone: .warn, message: "Der Inhalt existiert nicht mehr.") }
                if let img = p.imageUrl { RemoteImage(path: img).frame(height: 180).frame(maxWidth: .infinity).clipShape(.rect(cornerRadius: Radius.inner)) }
                Text(p.title ?? "–").font(.wr(.headline))
                if let b = p.body?.nilIfEmpty { Text(b).font(.wr(.subheadline)).foregroundStyle(Color.ink2).textSelection(.enabled).fixedSize(horizontal: false, vertical: true) }
                if let s = p.state { SpecLabel("Zustand: \(s)") }
                if let meta = p.meta, !meta.isEmpty {
                    VStack(spacing: 0) { ForEach(meta, id: \.self) { SpecRow(label: $0.label, value: $0.value) } }
                }
            }
            .padding(14)
            .cardSurface()
        }
    }

    private func subject(_ s: MeUserRef) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader("Betroffene Person", number: "02")
            Button { if let id = s.id { router.open(.adminUser(id: id)) } } label: {
                HStack(spacing: 12) {
                    AvatarView(url: s.profile?.avatarUrl, name: s.name, size: 44)
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 6) {
                            Text(s.name).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink)
                            if let st = s.status, st != "ACTIVE" { MeStatePill(text: MeLabels.accountStatus(st), tone: .danger) }
                            if let r = s.role, r != "MEMBER" { MeStatePill(text: L.roles[r] ?? r, tone: .slate) }
                        }
                        Text([s.handle.map { "@\($0)" }, s.createdAt.map { "seit \(Fmt.date($0))" }, s.profile?.followerCount.map { "\($0) Follower" }].compactMap { $0 }.joined(separator: " · "))
                            .font(.wr(.caption)).foregroundStyle(Color.muted)
                        if let u = s.suspendedUntil { Text("Gesperrt bis \(Fmt.dateTime(u))").font(.wr(.caption)).foregroundStyle(Color.danger) }
                        if let u = s.messagingRestrictedUntil { Text("Nachrichten eingeschränkt bis \(Fmt.dateTime(u))").font(.wr(.caption)).foregroundStyle(Color.warn) }
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right").font(.wr(.caption)).foregroundStyle(Color.lineStrong)
                }
                .padding(12)
                .cardSurface()
            }
            .buttonStyle(.pressable)
        }
    }

    private func reports(_ c: MeModCase, stats: [String: Int]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader("Meldungen", number: "03")
            VStack(spacing: 0) {
                ForEach(c.reports ?? []) { r in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(MeLabels.reason(r.reason)).font(.wr(.subheadline, .semibold))
                            Spacer()
                            Text(Fmt.relative(r.createdAt)).font(.wr(.caption)).foregroundStyle(Color.muted)
                        }
                        let n = r.reporterId.flatMap { stats[$0] } ?? 0
                        Text("@\(r.reporter?.handle ?? "unbekannt")\(n > 1 ? " · \(n) Meldungen insgesamt" : "")").font(.wr(.caption)).foregroundStyle(n > 10 ? Color.warn : Color.muted)
                        if let d = r.details?.nilIfEmpty { Text(d).font(.wr(.caption)).foregroundStyle(Color.ink2) }
                    }
                    .padding(12)
                    .hairline()
                }
            }
            .cardSurface()
        }
    }

    private func timeline(_ c: MeModCase) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader("Verlauf", number: "04")
            VStack(alignment: .leading, spacing: 12) {
                ForEach(c.actions ?? [], id: \.stableId) { a in
                    VStack(alignment: .leading, spacing: 3) {
                        Text("\(MeLabels.action(a.action)) · @\(a.moderator?.handle ?? "Team")").font(.wr(.subheadline, .semibold))
                        if let r = a.reason?.nilIfEmpty { Text(r).font(.wr(.caption)).foregroundStyle(Color.ink2) }
                        if let n = a.publicNote?.nilIfEmpty { Text("An die Person: \(n)").font(.wr(.caption)).foregroundStyle(Color.muted) }
                        Text([Fmt.dateTime(a.createdAt), a.until.map { "bis \(Fmt.dateTime($0))" }].compactMap { $0?.nilIfEmpty }.joined(separator: " · ")).specStyle()
                    }
                    .padding(.leading, 12)
                    .overlay(alignment: .leading) { Capsule().fill(Color.moss).frame(width: 2) }
                }
                ForEach(c.appeals ?? []) { a in
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Einspruch · \(MeLabels.appealStatus(a.status))").font(.wr(.subheadline, .semibold))
                        if let s = a.statement { Text(s).font(.wr(.caption)).foregroundStyle(Color.ink2).lineLimit(5) }
                        if let d = a.decision?.nilIfEmpty { Text("Entscheid: \(d)").font(.wr(.caption)).foregroundStyle(Color.muted) }
                        Text(Fmt.dateTime(a.createdAt)).specStyle()
                    }
                    .padding(.leading, 12)
                    .overlay(alignment: .leading) { Capsule().fill(Color.warn).frame(width: 2) }
                }
            }
        }
    }

    private func decisionForm(_ c: MeModCase) -> some View {
        let allowed = MeLabels.allowedActions(targetType: c.targetType, hasSubject: c.subjectUserId != nil)
        let needsNote = action == "SUSPEND" || action == "BAN"
        return VStack(alignment: .leading, spacing: 12) {
            SectionHeader("Entscheidung", number: "06", subtitle: "Nur Massnahmen, die zu diesem Inhalt passen.")
            VStack(alignment: .leading, spacing: 12) {
                Picker("Massnahme", selection: $action) {
                    ForEach(allowed, id: \.self) { Text(MeLabels.action($0)).tag($0) }
                }
                .pickerStyle(.menu)
                .tint(.ink)
                if action == "SUSPEND" {
                    Stepper("Dauer: \(Fmt.plural(days, "Tag", "Tage"))", value: $days, in: 1...365)
                }
                TextField("Interne Begründung (mind. 10 Zeichen)", text: $reason, axis: .vertical).lineLimit(2...6)
                    .padding(10).sunkenSurface()
                TextField(needsNote ? "Nachricht an die Person (erforderlich)" : "Nachricht an die Person (optional)", text: $publicNote, axis: .vertical).lineLimit(2...6)
                    .padding(10).sunkenSurface()
                Text("Die Nachricht an die Person ist Teil der Begründung, die sie sieht – inklusive Einspruchsmöglichkeit innerhalb von 14 Tagen.").font(.wr(.caption)).foregroundStyle(Color.muted)
                Button { confirmDecide = true } label: { Text("Entscheidung treffen") }
                    .primaryButton()
                    .disabled(reason.trimmed.count < 10 || (needsNote && publicNote.trimmed.isEmpty))
            }
            .padding(14)
            .cardSurface()
        }
    }

    private func decide() async {
        var body: [String: JSONValue] = ["action": .string(action), "reason": .string(reason.trimmed), "publicNote": .string(publicNote.trimmed)]
        if action == "SUSPEND" { body["days"] = .number(Double(days)) }
        if await app.run("Entschieden: \(MeLabels.action(action)).", { _ = try await APIClient.shared.post("/admin/cases/\(id)/decide", body) as JSONValue }) {
            reason = ""; publicNote = ""
            await load()
        }
    }
}

// MARK: - Nutzer:in (Administration)

struct AdminUserView: View {
    var id: String
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @State private var data: MeAdminUserDetail?
    @State private var error: String?
    @State private var sheet: MeAdminSheet?
    @State private var confirmRevoke = false
    @State private var showEmailChange = false

    var body: some View {
        MePhase(value: data, error: error, retry: load) { d in content(d) }
            .background(Color.paper)
            .navigationTitle(data?.user.profile?.displayName ?? "Konto")
            .navigationBarTitleDisplayMode(.inline)
            .task { if data == nil { await load() } }
            .refreshable { await load() }
            .sheet(item: $sheet) { s in
                MeAdminActionSheet(kind: s, userId: id, currentRole: data?.user.role ?? "MEMBER") { await load() }.meSheetEnvironment(app, router)
            }
            .sheet(isPresented: $showEmailChange) {
                MeAdminEmailSheet(userId: id, current: data?.user.email ?? "", canMarkVerified: app.me?.role == "SUPERADMIN") { await load() }
                    .meSheetEnvironment(app, router)
            }
            .confirmationDialog("Alle Sitzungen widerrufen?", isPresented: $confirmRevoke, titleVisibility: .visible) {
                Button("Widerrufen", role: .destructive) {
                    Task { if await app.run("Sitzungen widerrufen.", { _ = try await APIClient.shared.post("/admin/users/\(id)/revoke-sessions") as JSONValue }) { await load() } }
                }
            } message: { Text("Die Person wird auf allen Geräten abgemeldet.") }
    }

    private func load() async {
        do { data = try await APIClient.shared.get("/admin/users/\(id)"); error = nil }
        catch { if data == nil { self.error = MeErr.text(error) } else { app.show(error: error) } }
    }

    private func content(_ d: MeAdminUserDetail) -> some View {
        let u = d.user
        let isSelf = u.id == app.me?.id
        return ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                HStack(spacing: 14) {
                    AvatarView(url: u.profile?.avatarUrl, name: u.profile?.displayName ?? u.email ?? "?", size: 64, category: u.profile?.categories?.first)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(u.profile?.displayName ?? "Ohne Profil").font(.display(24))
                        if let h = u.profile?.handle {
                            Button("@\(h)") { router.open(.profile(handle: h)) }.font(.wr(.subheadline)).foregroundStyle(Color.moss)
                        }
                        HStack(spacing: 6) {
                            MeStatePill(text: MeLabels.accountStatus(u.status), tone: u.status == "ACTIVE" ? .moss : .danger)
                            MeStatePill(text: L.roles[u.role] ?? u.role, tone: .slate)
                        }
                    }
                }
                VStack(spacing: 0) {
                    if let e = u.email { SpecRow(label: "E-Mail", value: e, symbol: "envelope") }
                    SpecRow(label: "E-Mail bestätigt", value: u.emailVerifiedAt.map { Fmt.date($0) } ?? "Nein", symbol: "checkmark.seal")
                    if let c = u.createdAt { SpecRow(label: "Registriert", value: Fmt.date(c), symbol: "calendar") }
                    SpecRow(label: "Zuletzt gesehen", value: u.lastSeenAt.map { Fmt.relative($0) } ?? "–", symbol: "clock")
                    if let s = u.suspendedUntil { SpecRow(label: "Gesperrt bis", value: Fmt.dateTime(s), symbol: "lock") }
                    if let m = u.messagingRestrictedUntil { SpecRow(label: "Nachrichten eingeschränkt bis", value: Fmt.dateTime(m), symbol: "bubble.left.and.exclamationmark.bubble.right") }
                    if let s = u.shop { SpecRow(label: "Shop", value: "\(s.name ?? "") · \(L.shopStatus[s.status ?? ""] ?? s.status ?? "")", symbol: "storefront") }
                    if let r = u.profile?.region { SpecRow(label: "Region", value: [r, u.profile?.country.map { L.country($0) }].compactMap { $0 }.joined(separator: ", "), symbol: "mappin") }
                }
                .padding(.horizontal, 14)
                .cardSurface()

                if let c = d.counts {
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 14) {
                        StatCell(value: Fmt.number(c.posts), label: "Beiträge")
                        StatCell(value: Fmt.number(c.projects), label: "Projekte")
                        StatCell(value: Fmt.number(c.tutorials), label: "Anleit.")
                        StatCell(value: Fmt.number(c.articles), label: "Artikel")
                        StatCell(value: Fmt.number(c.comments), label: "Komm.")
                        StatCell(value: Fmt.number(c.products), label: "Produkte")
                        StatCell(value: Fmt.number(c.sessions), label: "Sitzungen")
                        StatCell(value: Fmt.number(c.reportsFiled), label: "Gemeldet")
                    }
                    .padding(14)
                    .sunkenSurface()
                }

                if !isSelf {
                    VStack(alignment: .leading, spacing: 10) {
                        SectionHeader("Massnahmen")
                        MeGroup {
                            if u.status == "SUSPENDED" || u.status == "BANNED" {
                                MeNavRow(symbol: "lock.open", title: "Sperre aufheben", subtitle: u.status == "BANNED" ? "Nur Administration" : nil, tint: .moss) { sheet = .unsuspend }
                            } else if u.status != "DELETED" {
                                MeNavRow(symbol: "lock", title: "Konto sperren", subtitle: "Befristet oder unbefristet, mit Begründung", tint: .danger) { sheet = .suspend }
                            }
                            if app.me?.isAdmin == true {
                                MeNavRow(symbol: "person.badge.key", title: "Rolle ändern", subtitle: L.roles[u.role] ?? u.role) { sheet = .role }
                                // Wie im Web: nur Administration, nie das eigene Konto, gleiche oder höhere Rolle nur Superadministration
                                if u.status != "DELETED", app.me?.role == "SUPERADMIN" || MeRoleRank.rank(u.role) < MeRoleRank.rank(app.me?.role) {
                                    MeNavRow(symbol: "at", title: "E-Mail-Adresse ändern", subtitle: "Support-Fall, mit Begründung") { showEmailChange = true }
                                }
                                if u.emailVerifiedAt == nil {
                                    MeNavRow(symbol: "checkmark.seal", title: "E-Mail manuell bestätigen") {
                                        Task { if await app.run("E-Mail bestätigt.", { _ = try await APIClient.shared.post("/admin/users/\(id)/verify-email") as JSONValue }) { await load() } }
                                    }
                                }
                            }
                            MeNavRow(symbol: "rectangle.portrait.and.arrow.forward", title: "Alle Sitzungen widerrufen", subtitle: d.counts?.sessions.map { "\($0) aktiv" }, tint: .clay) { confirmRevoke = true }
                        }
                    }
                }

                if let h = d.history, !h.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        SectionHeader("Moderationsverlauf", subtitle: Fmt.plural(h.count, "Fall", "Fälle"))
                        LazyVStack(spacing: 10) { ForEach(h) { c in MeCaseRow(c: c) { router.open(.moderationCase(id: c.id)) } } }
                    }
                }

                if let audit = d.recentAudit, !audit.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        SectionHeader("Audit (letzte Einträge)")
                        VStack(alignment: .leading, spacing: 0) {
                            ForEach(Array(audit.enumerated()), id: \.offset) { _, a in
                                HStack {
                                    Text(a.action).font(.wr(.caption))
                                    Spacer()
                                    Text([a.actor?.handle.map { "@\($0)" }, Fmt.relative(a.createdAt)].compactMap { $0 }.joined(separator: " · ")).font(.wr(.caption)).foregroundStyle(Color.muted)
                                }
                                .padding(.vertical, 8)
                                .hairline()
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, Space.gutter)
            .padding(.bottom, 40)
        }
    }
}

private enum MeAdminSheet: String, Identifiable { case suspend, unsuspend, role; var id: String { rawValue } }

private struct MeAdminActionSheet: View {
    var kind: MeAdminSheet
    var userId: String
    var currentRole: String
    var onDone: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var app
    @State private var days: Int? = 7
    @State private var reason = ""
    @State private var publicNote = ""
    @State private var role = "MEMBER"

    var body: some View {
        NavigationStack {
            Form {
                switch kind {
                case .suspend:
                    Section("Dauer") {
                        Picker("Dauer", selection: $days) {
                            ForEach([1, 3, 7, 14, 30, 90, 365], id: \.self) { Text(Fmt.plural($0, "Tag", "Tage")).tag(Int?.some($0)) }
                            Text("Unbefristet").tag(Int?.none)
                        }
                    }
                    Section {
                        TextField("Interne Begründung (mind. 10 Zeichen)", text: $reason, axis: .vertical).lineLimit(2...6)
                        TextField("Nachricht an die Person (mind. 10 Zeichen)", text: $publicNote, axis: .vertical).lineLimit(2...6)
                    } header: { Text("Begründung") } footer: { Text("Alle Sitzungen der Person werden beendet. Die Nachricht sieht die Person beim nächsten Anmelden.") }
                case .unsuspend:
                    Section {
                        TextField("Begründung (mind. 5 Zeichen)", text: $reason, axis: .vertical).lineLimit(2...6)
                    } header: { Text("Sperre aufheben") } footer: { Text("Dauerhafte Sperren hebt nur die Administration auf.") }
                case .role:
                    Section {
                        Picker("Rolle", selection: $role) {
                            ForEach(["MEMBER", "PLATFORM_MODERATOR", "ADMIN", "SUPERADMIN"], id: \.self) { Text(L.roles[$0] ?? $0).tag($0) }
                        }
                        .pickerStyle(.inline)
                        .labelsHidden()
                    } header: { Text("Neue Rolle") } footer: { Text("Admin-Rollen vergibt nur die Superadministration. Die eigene Rolle kann nicht geändert werden.") }
                    Section { TextField("Begründung (mind. 5 Zeichen)", text: $reason, axis: .vertical).lineLimit(2...6) }
                }
            }
            .meFormStyle()
            .navigationTitle(kind == .suspend ? "Konto sperren" : kind == .unsuspend ? "Sperre aufheben" : "Rolle ändern")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    AsyncButton(kind == .suspend ? "Sperren" : "Sichern") { await submit() }.disabled(!valid)
                }
            }
            .onAppear { role = currentRole }
        }
    }

    private var valid: Bool {
        switch kind {
        case .suspend: reason.trimmed.count >= 10 && publicNote.trimmed.count >= 10
        case .unsuspend: reason.trimmed.count >= 5
        case .role: reason.trimmed.count >= 5 && role != currentRole
        }
    }

    private func submit() async {
        let ok: Bool
        switch kind {
        case .suspend:
            ok = await app.run("Konto gesperrt.") {
                _ = try await APIClient.shared.post("/admin/users/\(userId)/suspend", ["days": .from(days), "reason": JSONValue.string(reason.trimmed), "publicNote": .string(publicNote.trimmed)]) as JSONValue
            }
        case .unsuspend:
            ok = await app.run("Sperre aufgehoben.") {
                _ = try await APIClient.shared.post("/admin/users/\(userId)/unsuspend", ["reason": JSONValue.string(reason.trimmed)]) as JSONValue
            }
        case .role:
            ok = await app.run("Rolle geändert.") {
                _ = try await APIClient.shared.post("/admin/users/\(userId)/role", ["role": JSONValue.string(role), "reason": .string(reason.trimmed)]) as JSONValue
            }
        }
        if ok { await onDone(); dismiss() }
    }
}
