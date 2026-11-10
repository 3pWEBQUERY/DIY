import SwiftUI

// MARK: - Übersicht (`/wettbewerbe`)

struct CompetitionListView: View {
    var communitySlug: String? = nil

    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router

    @State private var items: [CompetitionSummary] = []
    @State private var loaded = false
    @State private var error: String?

    private var filtered: [CompetitionSummary] { items.filter { communitySlug == nil || $0.community.slug == communitySlug } }
    private var running: [CompetitionSummary] { filtered.filter { $0.currentPhase.isRunning } }
    private var upcoming: [CompetitionSummary] { filtered.filter { $0.currentPhase == .upcoming } }
    private var ended: [CompetitionSummary] {
        filtered.filter { $0.currentPhase == .ended }.sorted { ($0.resultsAt ?? .distantPast) > ($1.resultsAt ?? .distantPast) }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                PageTitle(
                    kicker: filtered.first.map { communitySlug != nil ? "Communities · \($0.community.name)" : "Communities · Wettbewerbe" } ?? "Communities · Wettbewerbe",
                    title: "Wettbewerbe",
                    subtitle: "Reiche ein eigenes Projekt ein, stimme für deine Favoriten und sieh, wer gewinnt. Mitmachen können Mitglieder der jeweiligen Community."
                )
                if !loaded {
                    LoadingView()
                } else if let error, items.isEmpty {
                    ErrorStateView(message: error) { await load() }
                } else if filtered.isEmpty {
                    EmptyStateView(symbol: "trophy", title: "Gerade keine Wettbewerbe", message: "Moderator:innen können in ihrer Community unter „Verwalten“ einen Wettbewerb anlegen.", actionTitle: "Communities entdecken") {
                        router.open(.communities)
                    }
                } else {
                    let sections: [(String, [CompetitionSummary])] = [("Läuft gerade", running), ("Demnächst", upcoming), ("Entschieden", ended)].filter { !$0.1.isEmpty }
                    ForEach(Array(sections.enumerated()), id: \.element.0) { i, sec in
                        VStack(alignment: .leading, spacing: 12) {
                            SectionHeader(sec.0, number: String(format: "%02d", i + 1))
                            ForEach(sec.1) { c in
                                CompetitionCardView(competition: c, showCommunity: communitySlug == nil)
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, Space.gutter)
            .padding(.vertical, 12)
            .padding(.bottom, 40)
        }
        .background(Color.paper)
        .navigationTitle("Wettbewerbe")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { router.open(.communities) } label: { Image(systemName: "person.3") }
                    .accessibilityLabel("Communities entdecken")
            }
        }
        .task { if !loaded { await load() } }
        .refreshable { await load() }
    }

    private func load() async {
        do {
            let r: [CompetitionSummary] = try await APIClient.shared.get("/competitions")
            withAnimation(.snappy) { items = r; error = nil; loaded = true }
        } catch is CancellationError {
        } catch {
            self.error = (error as? APIError)?.message ?? error.localizedDescription
            loaded = true
        }
    }
}

// MARK: - Karte

struct CompetitionCardView: View {
    var competition: CompetitionSummary
    var showCommunity = true
    @Environment(Router.self) private var router

    var body: some View {
        let c = competition
        let phase = c.currentPhase
        Button { router.open(.competition(id: c.id)) } label: {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    CompetitionPhasePill(phase: phase)
                    Spacer(minLength: 0)
                    if c.member == true { Pill(text: "Mitglied", symbol: "checkmark", tint: .moss) }
                }
                Text(CompetitionFmt.deadline(phase: phase, startsAt: c.startsAt, endsAt: c.endsAt, votingEndsAt: c.votingEndsAt, resultsAt: c.resultsAt))
                    .font(.wr(.caption)).foregroundStyle(Color.muted)
                Text(c.title).font(.titleSerif).foregroundStyle(Color.ink).multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                if let d = c.description?.nilIfEmpty {
                    Text(d).font(.wr(.subheadline)).foregroundStyle(Color.ink2).a11yLineLimit(2).multilineTextAlignment(.leading)
                }
                HStack(spacing: 14) {
                    Label(Fmt.plural(c.entryCount ?? 0, "Einreichung", "Einreichungen"), systemImage: "square.stack")
                    Label(c.judging == "JURY" ? "Jury" : "Abstimmung", systemImage: c.judging == "JURY" ? "person.3" : "hand.raised")
                    if let p = c.prize?.nilIfEmpty { Label(p, systemImage: "gift").a11yLineLimit(1) }
                }
                .font(.wr(.caption)).foregroundStyle(Color.ink2).labelStyle(.compact)
                if showCommunity {
                    Text(c.community.name).font(.wr(.caption, .semibold)).foregroundStyle(Color.muted)
                        .padding(.top, 2)
                        .hairline(.top)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .cardSurface()
        }
        .buttonStyle(.pressable)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Wettbewerb öffnen")
    }
}

struct CompetitionPhasePill: View {
    var phase: CompetitionPhase
    var body: some View {
        let (fg, bg): (Color, Color) = switch phase {
        case .upcoming, .ended: (.ink2, .sunken)
        case .open: (.paper, .moss)
        case .voting: (.paper, .slate)
        case .jury: (.paper, .ink)
        }
        Label(phase.label, systemImage: "trophy")
            .font(.wr(.caption, .semibold))
            .labelStyle(.compact)
            .foregroundStyle(fg)
            .padding(.horizontal, 10).padding(.vertical, 5)
            .background(bg, in: Capsule())
    }
}

struct CompetitionPlaceBadge: View {
    var place: Int
    var body: some View {
        let tint: Color = switch place { case 1: .ochre; case 2: .slate; case 3: .clay; default: .ink }
        Label("\(place). Platz", systemImage: "medal")
            .font(.wr(.caption, .bold))
            .labelStyle(.compact)
            .foregroundStyle(Color.paper)
            .padding(.horizontal, 10).padding(.vertical, 5)
            .background(tint, in: Capsule())
            .accessibilityLabel("Platz \(place)")
    }
}

// MARK: - Community-Banner

/// Hinweis auf den aktuellen Wettbewerb auf der Community-Seite.
struct CompetitionBanner: View {
    var challenge: CommunityChallenge
    @Environment(Router.self) private var router

    var body: some View {
        let ch = challenge
        let phase = ch.phase
        Button { router.open(.competition(id: ch.id)) } label: {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "trophy")
                    .font(.wr(.headline))
                    .foregroundStyle(Color.clayInk)
                    .frame(width: 40, height: 40)
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Color.clay, lineWidth: 1))
                VStack(alignment: .leading, spacing: 4) {
                    SpecLabel(CompetitionFmt.bannerStatus(phase: phase, startsAt: ch.startsAt, endsAt: ch.endsAt, votingEndsAt: ch.votingEndsAt), color: .clayInk)
                    Text(ch.title).font(.wr(.headline)).foregroundStyle(Color.ink).multilineTextAlignment(.leading)
                    if let d = ch.description?.nilIfEmpty {
                        Text(d).font(.wr(.subheadline)).foregroundStyle(Color.ink2).a11yLineLimit(2).multilineTextAlignment(.leading)
                    }
                    Text(CompetitionFmt.cta(phase))
                        .font(.wr(.subheadline, .semibold))
                        .foregroundStyle(Color.paper)
                        .padding(.horizontal, 14).padding(.vertical, 8)
                        .background(Color.action, in: Capsule())
                        .padding(.top, 6)
                }
                Spacer(minLength: 0)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.claySoft.opacity(0.6), in: .rect(cornerRadius: Radius.card, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Radius.card, style: .continuous).strokeBorder(Color.clay.opacity(0.3), lineWidth: 0.75))
        }
        .buttonStyle(.pressable)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Wettbewerb öffnen")
    }
}

// MARK: - Detail (`/c/:slug/wettbewerbe/:id`)

struct CompetitionDetailView: View {
    var id: String

    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router

    @State private var c: CompetitionDetail?
    @State private var error: String?
    @State private var votes: [String] = []
    @State private var places: [String: Int] = [:]
    @State private var voting: Set<String> = []
    @State private var showSubmit = false
    @State private var confirmWithdraw = false
    @State private var confirmPublish = false
    @State private var removeTarget: CompetitionEntry?

    var body: some View {
        Group {
            if let c {
                content(c)
            } else if let error {
                ErrorStateView(message: error) { await load() }
            } else {
                LoadingView()
            }
        }
        .background(Color.paper)
        .navigationTitle(c?.title ?? "Wettbewerb")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let c {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        ShareLink(item: AppConfig.webURL("/c/\(c.community.slug)/wettbewerbe/\(c.id)"), subject: Text("Wettbewerb: \(c.title)")) {
                            Label("Teilen", systemImage: "square.and.arrow.up")
                        }
                        Button("Zur Community", systemImage: "person.3") { router.open(.community(slug: c.community.slug)) }
                        Button("Alle Wettbewerbe", systemImage: "trophy") { router.open(.competitions()) }
                    } label: { Image(systemName: "ellipsis") }
                    .accessibilityLabel("Weitere Aktionen")
                }
            }
        }
        .task { if c == nil { await load() } }
        .refreshable { await load() }
        .sheet(isPresented: $showSubmit) {
            if let c { CompetitionEntrySheet(competition: c) { Task { await load() } } }
        }
        .confirmationDialog("Einreichung zurückziehen?", isPresented: $confirmWithdraw, titleVisibility: .visible) {
            Button("Zurückziehen", role: .destructive) { Task { await withdraw() } }
        } message: { Text("Du kannst bis zum Einreichungsschluss jederzeit erneut einreichen.") }
        .confirmationDialog("Ergebnis veröffentlichen?", isPresented: $confirmPublish, titleVisibility: .visible) {
            Button("Veröffentlichen") { Task { await publish() } }
        } message: { Text("Alle Teilnehmenden werden benachrichtigt. Das Ergebnis lässt sich danach nicht mehr ändern.") }
        .confirmationDialog("Einreichung entfernen?", isPresented: Binding(get: { removeTarget != nil }, set: { if !$0 { removeTarget = nil } }), titleVisibility: .visible) {
            Button("Entfernen", role: .destructive) {
                if let e = removeTarget { Task { await remove(e) } }
                removeTarget = nil
            }
        } message: { Text("„\(removeTarget?.project?.title ?? "Projekt")“ wird aus dem Wettbewerb entfernt; die Person wird benachrichtigt.") }
    }

    // MARK: Laden

    private func load() async {
        do {
            let d: CompetitionDetail = try await APIClient.shared.get("/competitions/\(id)")
            withAnimation(.snappy) {
                c = d
                votes = d.viewer.myVotes
                places = places.filter { p in d.entries.contains { $0.id == p.key } }
                error = nil
            }
        } catch is CancellationError {
        } catch {
            if c == nil { self.error = (error as? APIError)?.message ?? error.localizedDescription } else { app.show(error: error) }
        }
    }

    // MARK: Inhalt

    private func content(_ c: CompetitionDetail) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                header(c)
                timeline(c)
                entryPanel(c)
                if !c.winners.isEmpty { winners(c) }
                if let r = c.rules?.nilIfEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        SectionHeader("Regeln", number: "01")
                        Text(r).font(.wr(.body)).foregroundStyle(Color.ink2).fixedSize(horizontal: false, vertical: true)
                    }
                }
                entries(c)
            }
            .padding(.horizontal, Space.gutter)
            .padding(.vertical, 12)
            .padding(.bottom, 40)
        }
    }

    private func header(_ c: CompetitionDetail) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Button { router.open(.community(slug: c.community.slug)) } label: {
                SpecLabel("Wettbewerb · \(c.community.name)", color: .moss)
            }
            .buttonStyle(.plain)
            HStack(spacing: 8) {
                CompetitionPhasePill(phase: c.phase)
                Text(CompetitionFmt.deadline(phase: c.phase, startsAt: c.startsAt, endsAt: c.endsAt, votingEndsAt: c.votingEndsAt, resultsAt: c.resultsAt))
                    .font(.wr(.caption)).foregroundStyle(Color.muted)
            }
            Text(c.title).font(.display(30)).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
            if let d = c.description?.nilIfEmpty {
                Text(d).font(.wr(.body)).foregroundStyle(Color.ink2).fixedSize(horizontal: false, vertical: true)
            }
            VStack(alignment: .leading, spacing: 6) {
                Label(Fmt.plural(c.entries.count, "Einreichung", "Einreichungen"), systemImage: "square.stack")
                Label(c.isVotes ? "Die Community stimmt ab" : "Die Jury entscheidet", systemImage: c.isVotes ? "hand.raised" : "person.3")
                if let p = c.prize?.nilIfEmpty {
                    Label { Text(p).font(.wr(.subheadline, .semibold)) } icon: { Image(systemName: "gift").foregroundStyle(Color.clay) }
                }
            }
            .font(.wr(.subheadline))
            .foregroundStyle(Color.ink2)
        }
    }

    private func timeline(_ c: CompetitionDetail) -> some View {
        let decide: CompetitionPhase = c.isVotes ? .voting : .jury
        let order: [CompetitionPhase] = [.upcoming, .open, decide, .ended]
        let current = order.firstIndex(of: c.phase) ?? 0
        let steps: [(CompetitionPhase, String, String)] = [
            (.open, "Einreichung", "\(CompetitionFmt.day(c.startsAt)) – \(CompetitionFmt.day(c.endsAt))"),
            c.isVotes ? (.voting, "Abstimmung", c.votingEndsAt.map { "bis \(CompetitionFmt.day($0))" } ?? "") : (.jury, "Jury", "Moderation entscheidet"),
            (.ended, "Ergebnis", c.resultsAt.map { CompetitionFmt.day($0) } ?? ""),
        ]
        return VStack(alignment: .leading, spacing: 0) {
            SpecLabel("Ablauf").padding(.bottom, 12)
            ForEach(Array(steps.enumerated()), id: \.offset) { i, s in
                let idx = order.firstIndex(of: s.0) ?? 0
                let done = current > idx
                let now = current == idx
                HStack(alignment: .top, spacing: 12) {
                    VStack(spacing: 0) {
                        Circle()
                            .strokeBorder(now || done ? Color.moss : Color.lineStrong, lineWidth: 2)
                            .background(Circle().fill(now ? Color.moss : done ? Color.mossSoft : Color.card))
                            .overlay { if now { Circle().fill(Color.paper).frame(width: 6, height: 6) } }
                            .frame(width: 19, height: 19)
                        if i < steps.count - 1 {
                            Rectangle().fill(done ? Color.moss : Color.lineStrong).frame(width: 1).frame(minHeight: 22)
                        }
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(s.1).font(.wr(.subheadline, .semibold)).foregroundStyle(now || done ? Color.ink : Color.muted)
                        if !s.2.isEmpty { Text(s.2).font(.wr(.caption)).foregroundStyle(Color.muted) }
                    }
                    .padding(.bottom, i < steps.count - 1 ? 12 : 0)
                    Spacer(minLength: 0)
                }
                .accessibilityElement(children: .combine)
                .accessibilityValue(now ? "Aktuell" : done ? "Abgeschlossen" : "Ausstehend")
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
    }

    @ViewBuilder private func entryPanel(_ c: CompetitionDetail) -> some View {
        if c.phase == .open {
            VStack(alignment: .leading, spacing: 10) {
                if !app.isSignedIn {
                    Text("Melde dich an und tritt der Community bei, um ein Projekt einzureichen.").font(.wr(.subheadline)).foregroundStyle(Color.ink2)
                } else if !c.viewer.isMember {
                    Text("Mitmachen können Mitglieder von \(c.community.name).").font(.wr(.subheadline)).foregroundStyle(Color.ink2)
                    Button { router.open(.community(slug: c.community.slug)) } label: {
                        Label("Zur Community", systemImage: "person.3").font(.wr(.subheadline, .semibold))
                    }
                    .buttonStyle(.glassProminent).tint(.action)
                } else if let my = c.viewer.myEntry {
                    Label("Du bist dabei", systemImage: "checkmark").font(.wr(.footnote, .semibold)).foregroundStyle(Color.moss)
                    Text(c.entries.first { $0.id == my.id }?.project?.title ?? "Dein Projekt").font(.wr(.headline)).foregroundStyle(Color.ink)
                    HStack(spacing: 8) {
                        Button("Anderes Projekt wählen") { showSubmit = true }
                            .buttonStyle(.glass)
                        Button("Zurückziehen", role: .destructive) { confirmWithdraw = true }
                            .buttonStyle(.glass)
                    }
                    .font(.wr(.subheadline, .semibold))
                } else {
                    Text("Reiche eines deiner öffentlichen Projekte ein – pro Person ein Beitrag.").font(.wr(.subheadline)).foregroundStyle(Color.ink2)
                    Button { showSubmit = true } label: {
                        Label("Projekt einreichen", systemImage: "trophy")
                    }
                    .primaryButton()
                    .tint(.action)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .cardSurface()
        }
    }

    private func winners(_ c: CompetitionDetail) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHeader("Gewinner:innen", number: "★")
            ForEach(c.winners) { w in
                VStack(alignment: .leading, spacing: 8) {
                    if let p = w.place { CompetitionPlaceBadge(place: p) }
                    if let project = w.project { ProjectCardView(project: project, style: .wide) }
                    if let v = w.votes { Text(Fmt.plural(v, "Stimme", "Stimmen")).font(.wr(.caption)).foregroundStyle(Color.muted) }
                }
            }
        }
    }

    // MARK: Einreichungen

    private func entries(_ c: CompetitionDetail) -> some View {
        let canVote = c.phase == .voting && c.isVotes && c.viewer.isMember
        let jury = c.phase == .jury && c.viewer.isMod
        return VStack(alignment: .leading, spacing: 16) {
            SectionHeader(c.phase == .ended ? "Alle Einreichungen" : "Einreichungen", number: c.rules?.nilIfEmpty == nil ? "01" : "02")
            if c.entries.isEmpty {
                Text(c.phase == .upcoming ? "Die Einreichung startet bald." : "Noch keine Einreichungen – sei die erste Person!")
                    .font(.wr(.subheadline)).foregroundStyle(Color.muted)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 36)
                    .overlay(RoundedRectangle(cornerRadius: Radius.card, style: .continuous).strokeBorder(Color.lineStrong, style: StrokeStyle(lineWidth: 1, dash: [5, 4])))
            } else {
                if canVote {
                    HStack(spacing: 10) {
                        HStack(spacing: 4) {
                            ForEach(0..<CompetitionRules.votesPerPerson, id: \.self) { i in
                                Circle().fill(i < votes.count ? Color.moss : Color.lineStrong).frame(width: 10, height: 10)
                            }
                        }
                        .accessibilityHidden(true)
                        Text("Du hast **\(votes.count)** von \(CompetitionRules.votesPerPerson) Stimmen vergeben. Zwischenstände bleiben bis zum Ende verborgen.")
                            .font(.wr(.footnote)).foregroundStyle(Color.ink2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .sunkenSurface()
                }
                if jury {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Jury: Wähle bei bis zu drei Einreichungen einen Platz und veröffentliche das Ergebnis.")
                            .font(.wr(.footnote)).foregroundStyle(Color.ink2)
                            .fixedSize(horizontal: false, vertical: true)
                        Button("Ergebnis veröffentlichen") { confirmPublish = true }
                            .buttonStyle(.glassProminent).tint(.action)
                            .font(.wr(.subheadline, .semibold))
                            .disabled(places.isEmpty)
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.claySoft, in: .rect(cornerRadius: Radius.inner, style: .continuous))
                }
                ForEach(c.entries) { e in entryCell(e, c, canVote: canVote, jury: jury) }
            }
        }
    }

    @ViewBuilder private func entryCell(_ e: CompetitionEntry, _ c: CompetitionDetail, canVote: Bool, jury: Bool) -> some View {
        if let project = e.project {
            VStack(alignment: .leading, spacing: 10) {
                ProjectCardView(project: project, style: .wide)
                if let n = e.note?.nilIfEmpty {
                    Text("„\(n)“").font(.wr(.subheadline)).foregroundStyle(Color.ink2).a11yLineLimit(3)
                }
                FlowLayout(spacing: 8) {
                    if let p = e.place { CompetitionPlaceBadge(place: p) }
                    if let v = e.votes { Text(Fmt.plural(v, "Stimme", "Stimmen")).font(.wr(.caption)).foregroundStyle(Color.muted).padding(.vertical, 5) }
                    if e.isMine && c.phase != .ended { Pill(text: "Deine Einreichung", tint: .moss) }
                    if canVote && !e.isMine { voteButton(e) }
                }
                if jury {
                    Picker("Platz für \(project.title)", selection: Binding(get: { places[e.id] ?? 0 }, set: { setPlace(e.id, $0) })) {
                        Text("–").tag(0)
                        Text("1.").tag(1)
                        Text("2.").tag(2)
                        Text("3.").tag(3)
                    }
                    .pickerStyle(.segmented)
                }
                if c.viewer.isMod && c.phase != .ended {
                    Button(role: .destructive) { removeTarget = e } label: {
                        Label("Einreichung entfernen", systemImage: "trash").font(.wr(.caption, .semibold))
                    }
                    .buttonStyle(.glass)
                    .controlSize(.small)
                    .tint(.danger)
                }
            }
        }
    }

    private func voteButton(_ e: CompetitionEntry) -> some View {
        let on = votes.contains(e.id)
        return Button { Task { await toggleVote(e) } } label: {
            Label(on ? "Deine Stimme" : "Stimme geben", systemImage: on ? "checkmark" : "trophy")
                .font(.wr(.subheadline, .semibold))
        }
        .buttonStyle(.glassProminent)
        .tint(on ? Color.action : Color.sunken)
        .foregroundStyle(on ? Color.paper : Color.ink)
        .disabled(voting.contains(e.id))
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    // MARK: Aktionen

    private func toggleVote(_ e: CompetitionEntry) async {
        let on = !votes.contains(e.id)
        if on && votes.count >= CompetitionRules.votesPerPerson {
            app.show("Du hast alle \(CompetitionRules.votesPerPerson) Stimmen vergeben. Nimm eine zurück, um neu zu wählen.", style: .warning)
            return
        }
        Haptics.selection()
        voting.insert(e.id)
        defer { voting.remove(e.id) }
        withAnimation(.snappy) { if on { votes.append(e.id) } else { votes.removeAll { $0 == e.id } } }
        do {
            _ = try await APIClient.shared.post("/competition-entries/\(e.id)/vote", ["on": JSONValue.bool(on)]) as CompetitionVoteResult
        } catch {
            withAnimation(.snappy) { if on { votes.removeAll { $0 == e.id } } else { votes.append(e.id) } }
            app.show(error: error)
        }
    }

    private func setPlace(_ entryId: String, _ place: Int) {
        Haptics.selection()
        var next = places.filter { $0.key != entryId && $0.value != place }
        if place > 0 { next[entryId] = place }
        places = next
    }

    private func publish() async {
        let list: [JSONValue] = places.map { .object(["entryId": .string($0.key), "place": .number(Double($0.value))]) }
        if await app.run("Ergebnis veröffentlicht.", { _ = try await APIClient.shared.post("/competitions/\(id)/results", ["places": JSONValue.array(list)]) as JSONValue }) {
            places = [:]
            await load()
        }
    }

    private func withdraw() async {
        if await app.run("Einreichung zurückgezogen.", { _ = try await APIClient.shared.delete("/competitions/\(id)/entry") as JSONValue }) {
            await load()
        }
    }

    private func remove(_ e: CompetitionEntry) async {
        if await app.run("Einreichung entfernt.", { _ = try await APIClient.shared.delete("/competition-entries/\(e.id)") as JSONValue }) {
            await load()
        }
    }
}

// MARK: - Projekt einreichen

struct CompetitionEntrySheet: View {
    var competition: CompetitionDetail
    var onDone: () -> Void

    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @Environment(\.dismiss) private var dismiss

    @State private var options: [CompetitionProjectOption]?
    @State private var projectId: String
    @State private var note: String
    @State private var fields: [String: String] = [:]
    @State private var sending = false

    init(competition: CompetitionDetail, onDone: @escaping () -> Void) {
        self.competition = competition
        self.onDone = onDone
        _projectId = State(initialValue: competition.viewer.myEntry?.projectId ?? "")
        _note = State(initialValue: competition.viewer.myEntry?.note ?? "")
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Space.xl) {
                    VStack(alignment: .leading, spacing: 4) {
                        SpecLabel("Wettbewerb", color: .moss)
                        Text(competition.title).font(.titleSerif).foregroundStyle(Color.ink)
                    }
                    if let options {
                        if options.isEmpty {
                            EmptyStateView(symbol: "hammer", title: "Noch kein passendes Projekt", message: "Du hast noch kein veröffentlichtes, öffentliches Projekt.", actionTitle: "Projekt anlegen") {
                                dismiss()
                                Task { @MainActor in
                                    try? await Task.sleep(for: .milliseconds(400))
                                    router.present(.projectEditor())
                                }
                            }
                        } else {
                            picker(options)
                            VStack(alignment: .leading, spacing: 8) {
                                SpecLabel("Ein paar Worte dazu (optional)")
                                TextField("Was war die Idee, was war knifflig?", text: $note, axis: .vertical)
                                    .lineLimit(3...6)
                                    .font(.wr(.body))
                                    .padding(14)
                                    .cardSurface(radius: 14)
                                    .onChange(of: note) { _, v in if v.count > CompetitionRules.noteMax { note = String(v.prefix(CompetitionRules.noteMax)) } }
                                HStack {
                                    if let e = fields["note"] { Text(e).font(.wr(.caption, .semibold)).foregroundStyle(Color.danger) }
                                    Spacer()
                                    Text("\(note.count)/\(CompetitionRules.noteMax)").font(.spec).monospacedDigit().foregroundStyle(Color.muted)
                                }
                            }
                        }
                    } else {
                        LoadingView()
                    }
                }
                .padding(.horizontal, Space.gutter)
                .padding(.vertical, Space.l)
            }
            .background(Color.paper)
            .navigationTitle("Projekt einreichen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button { Task { await submit() } } label: {
                        if sending { ProgressView() } else { Text(competition.viewer.myEntry != nil ? "Aktualisieren" : "Einreichen") }
                    }
                    .buttonStyle(.glassProminent)
                    .tint(.action)
                    .disabled(projectId.isEmpty || sending)
                }
            }
            .task { await loadOptions() }
        }
    }

    private func picker(_ options: [CompetitionProjectOption]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SpecLabel("Projekt")
            if let e = fields["projectId"] { Text(e).font(.wr(.caption, .semibold)).foregroundStyle(Color.danger) }
            AdaptiveGrid(spacing: 12, rowSpacing: 14) {
                ForEach(options) { p in
                    let on = p.id == projectId
                    Button {
                        Haptics.selection()
                        withAnimation(.snappy) { projectId = p.id }
                    } label: {
                        VStack(alignment: .leading, spacing: 6) {
                            CoverView(url: p.coverUrl, seed: p.id, category: nil, showLabel: false)
                                .aspectRatio(4 / 3, contentMode: .fit)
                                .clipShape(.rect(cornerRadius: Radius.inner, style: .continuous))
                                .overlay(RoundedRectangle(cornerRadius: Radius.inner, style: .continuous).strokeBorder(on ? Color.moss : Color.line, lineWidth: on ? 3 : 0.75))
                                .overlay(alignment: .topTrailing) {
                                    if on {
                                        Image(systemName: "checkmark").font(.wr(.caption, .bold)).foregroundStyle(Color.paper)
                                            .frame(width: 24, height: 24).background(Color.moss, in: Circle()).padding(8)
                                    }
                                }
                            Text(p.title).font(.wr(.footnote, .medium)).foregroundStyle(Color.ink).a11yLineLimit(2).multilineTextAlignment(.leading)
                        }
                        .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(on ? [.isSelected, .isButton] : .isButton)
                }
            }
        }
    }

    private func loadOptions() async {
        do {
            let o: [CompetitionProjectOption] = try await APIClient.shared.get("/competitions/\(competition.id)/project-options")
            withAnimation(.snappy) { options = o }
        } catch is CancellationError {
        } catch {
            options = []
            app.show(error: error)
        }
    }

    private func submit() async {
        sending = true
        defer { sending = false }
        fields = [:]
        do {
            let r: CompetitionEntrySubmitted = try await APIClient.shared.post("/competitions/\(competition.id)/entry", ["projectId": JSONValue.string(projectId), "note": .string(note.trimmed)])
            app.show(r.replaced == true ? "Einreichung aktualisiert." : "Eingereicht. Viel Glück!")
            onDone()
            dismiss()
        } catch let e as APIError {
            fields = e.fields ?? [:]
            app.show(error: e)
        } catch {
            app.show(error: error)
        }
    }
}
