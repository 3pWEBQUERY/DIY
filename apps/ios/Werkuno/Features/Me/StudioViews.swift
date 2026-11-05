import SwiftUI
import Charts

// MARK: - Übersicht (PRD §20.1)

struct StudioView: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @State private var data: MeStudioOverviewResponse?
    @State private var error: String?

    var body: some View {
        MePhase(value: data, error: error, retry: load) { d in content(d) }
            .background(Color.paper)
            .navigationTitle("Creator Studio")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button("Beitrag teilen", systemImage: "square.and.pencil") { router.present(.composer()) }
                        Button("Projekt starten", systemImage: "hammer") { router.present(.projectEditor()) }
                        Button("Anleitung schreiben", systemImage: "list.number") { router.present(.tutorialEditor()) }
                        Button("Artikel verfassen", systemImage: "text.book.closed") { router.present(.articleEditor()) }
                        if app.me?.shop != nil {
                            Button("Produkt anlegen", systemImage: "tag") { router.present(.productEditor()) }
                        } else {
                            Button("Shop eröffnen", systemImage: "storefront") { router.present(.shopWizard) }
                        }
                    } label: { Image(systemName: "plus") }
                    .accessibilityLabel("Erstellen")
                }
            }
            .task { if data == nil { await load() } }
            .refreshable { await load() }
    }

    private func load() async {
        do { data = try await APIClient.shared.get("/studio/overview"); error = nil }
        catch { if data == nil { self.error = MeErr.text(error) } else { app.show(error: error) } }
    }

    private func content(_ d: MeStudioOverviewResponse) -> some View {
        let o = d.overview
        let days = o.periodDays ?? 28
        return ScrollView {
            VStack(alignment: .leading, spacing: 26) {
                PageTitle(kicker: "Creator Studio", title: "Deine Werkstatt in Zahlen", subtitle: "Letzte \(days) Tage im Vergleich zu den \(days) Tagen davor.")

                // 01 Reichweite & Resonanz
                VStack(alignment: .leading, spacing: 12) {
                    SectionHeader("Reichweite & Resonanz", number: "01") {
                        Button("Je Inhalt") { router.open(.studioSection(.stats)) }.font(.wr(.subheadline))
                    }
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                        MeKPI(label: "Profilaufrufe", value: Fmt.number(o.profileViews.cur), cur: o.profileViews.cur, prev: o.profileViews.prev, symbol: "person.crop.circle")
                        MeKPI(label: "Projektaufrufe", value: Fmt.number(o.projectViews.cur), cur: o.projectViews.cur, prev: o.projectViews.prev, symbol: "hammer")
                        MeKPI(label: "Anleitungsaufrufe", value: Fmt.number(o.tutorialViews.cur), cur: o.tutorialViews.cur, prev: o.tutorialViews.prev, symbol: "list.number")
                        MeKPI(label: "Interaktionen", value: Fmt.number(o.interactions.cur.total), cur: o.interactions.cur.total, prev: o.interactions.prev.total, symbol: "heart")
                    }
                    Text("\(Fmt.number(o.interactions.cur.likes)) Gefällt-mir · \(Fmt.number(o.interactions.cur.comments)) Kommentare · \(Fmt.number(o.interactions.cur.saves)) gemerkt")
                        .font(.wr(.footnote)).foregroundStyle(Color.muted)
                    Text("Aufrufe (geschätzt, ohne Mehrfachzählung binnen 30 Min., ohne eigene Aufrufe) – keine eindeutigen Besucher.")
                        .font(.wr(.caption)).foregroundStyle(Color.muted)
                }

                // 02 Follower
                VStack(alignment: .leading, spacing: 12) {
                    SectionHeader("Follower", number: "02")
                    followers(o.followers)
                }

                // 03 Veröffentlichungen (3D-Aktivitätslandschaft)
                VStack(alignment: .leading, spacing: 12) {
                    SectionHeader("Veröffentlichungen", number: "03", subtitle: "Letzte 12 Wochen")
                    heat(d.heat, meaningful: o.meaningful ?? 0)
                }

                // 04 Shop
                if let shop = o.shop, let rev = o.revenue {
                    VStack(alignment: .leading, spacing: 12) {
                        SectionHeader("Shop · \(shop.name ?? "")", number: "04") {
                            Button("Einnahmen") { router.open(.studioSection(.revenue)) }.font(.wr(.subheadline))
                        }
                        revenue(rev)
                    }
                }

                // Navigation
                VStack(alignment: .leading, spacing: 12) {
                    SectionHeader("Verwalten", number: o.shop != nil ? "05" : "04")
                    MeGroup {
                        ForEach(StudioSection.allCases) { s in
                            MeNavRow(symbol: s.symbol, title: s.title, subtitle: subtitle(s), tint: isShopSection(s) ? .clay : .ink) { router.open(.studioSection(s)) }
                        }
                    }
                }

                VStack(alignment: .leading, spacing: 6) {
                    SpecLabel("So zählen wir", color: .ink)
                    Text("Aufrufe sind Seitenaufrufe, keine eindeutigen Personen. Wiederholte Aufrufe derselben Person innerhalb von 30 Minuten zählen einmal, eigene Aufrufe nie. Interaktionen umfassen Gefällt-mir, Kommentare und Merken anderer Personen auf deinen Beiträgen, Projekten, Anleitungen und Artikeln. Umsätze sind Bruttowerte vor Gebühren des Zahlungsdienstleisters; massgeblich ist die Abrechnung unter Einnahmen.")
                        .font(.wr(.caption)).foregroundStyle(Color.muted)
                }
                .padding(.top, 8)
                .hairline(.top)
            }
            .padding(.horizontal, Space.gutter)
            .padding(.bottom, 40)
        }
    }

    private func isShopSection(_ s: StudioSection) -> Bool { [.products, .orders, .shop, .revenue].contains(s) }

    private func subtitle(_ s: StudioSection) -> String? {
        switch s {
        case .content: "Alle Beiträge, Projekte, Anleitungen, Artikel"
        case .projects: "Status, Sichtbarkeit, Journal"
        case .tutorials: "Versionen, Leser:innen im Fortschritt"
        case .articles: "Entwürfe, geplante und veröffentlichte Artikel"
        case .products: app.me?.shop == nil ? "Mit eigenem Shop" : "Angebote, Bestand, Preise"
        case .orders: "Eingegangene Bestellungen"
        case .shop: app.me?.shop?.name ?? "Shop eröffnen"
        case .media: "Bilder, Videos, Alt-Texte"
        case .stats: "Kennzahlen je Inhalt"
        case .revenue: "Umsatz, Gebühren, Auszahlungen"
        }
    }

    private func followers(_ f: MeStudioOverview.Followers) -> some View {
        let series = f.gainedSeries ?? []
        let gained = series.reduce(0, +)
        return HStack(alignment: .bottom, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text(Fmt.number(f.total)).font(.wr(.largeTitle, .semibold)).monospacedDigit().foregroundStyle(Color.ink)
                SpecLabel("Follower gesamt")
                Text(gained > 0 ? "+\(Fmt.number(gained)) in 12 Wochen" : "Keine neuen in 12 Wochen").font(.wr(.caption)).foregroundStyle(gained > 0 ? Color.moss : Color.muted)
            }
            Spacer(minLength: 0)
            if !series.isEmpty {
                Chart(Array(series.enumerated()), id: \.offset) { i, v in
                    BarMark(x: .value("Woche", i), y: .value("Neue Follower", v), width: .fixed(7))
                        .foregroundStyle(Color.moss)
                        .clipShape(Capsule())
                }
                .chartXAxis(.hidden)
                .chartYAxis(.hidden)
                .frame(width: 150, height: 60)
                .accessibilityLabel("Neue Follower pro Woche")
                .accessibilityValue(series.map(String.init).joined(separator: ", "))
            }
        }
        .padding(16)
        .cardSurface()
    }

    private func heat(_ h: MeStudioHeat, meaningful: Int) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ThreeCanvas(scene: .heat(days: h.days.map(\.n)))
                .frame(height: 280)
                .frame(maxWidth: .infinity)
                .background(Color.sunken)
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline) {
                    Text("\(h.activeDays ?? 0) Tage aktiv in 12 Wochen").font(.wr(.headline)).foregroundStyle(Color.ink)
                    Spacer()
                    Text(Fmt.plural(h.total ?? 0, "Veröffentlichung", "Veröffentlichungen")).font(.wr(.subheadline)).foregroundStyle(Color.muted)
                }
                Text("Jede Säule ist ein Tag – je höher, desto mehr hast du veröffentlicht: Beiträge, Journal-Einträge, Projekte, Anleitungen und Artikel.\(meaningful > 0 ? " \(Fmt.number(meaningful)) Aktionen zählen als bedeutsame kreative Aktivität." : "")")
                    .font(.wr(.caption)).foregroundStyle(Color.muted)
            }
            .padding(14)
        }
        .cardSurface()
        .clipShape(.rect(cornerRadius: Radius.card, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Aktivitätslandschaft: \(h.activeDays ?? 0) aktive Tage und \(h.total ?? 0) Veröffentlichungen in 12 Wochen")
    }

    private func revenue(_ r: MeStudioOverview.Revenue) -> some View {
        VStack(spacing: 10) {
            HStack(alignment: .bottom) {
                MeKPI(label: "Umsatz", value: Fmt.money(r.gross, currency: r.currency), caption: "Bezahlte Bestellungen inkl. Versand, ohne Stornos")
                    .overlay(alignment: .bottomTrailing) {
                        MeDelta(cur: r.gross, prev: r.grossPrev).padding(14)
                    }
            }
            if let s = r.series, !s.isEmpty {
                Chart(Array(s.enumerated()), id: \.offset) { i, v in
                    AreaMark(x: .value("Woche", i), y: .value("Umsatz", Double(v) / 100))
                        .foregroundStyle(Color.clay.opacity(0.18))
                    LineMark(x: .value("Woche", i), y: .value("Umsatz", Double(v) / 100))
                        .foregroundStyle(Color.clay)
                }
                .chartXAxis(.hidden)
                .chartYAxis { AxisMarks(position: .trailing) { AxisValueLabel().font(.wr(.caption2)) } }
                .frame(height: 80)
                .padding(14)
                .cardSurface(radius: Radius.inner + 4)
                .accessibilityLabel("Umsatz pro Woche")
            }
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                MeKPI(label: "Bestellungen", value: Fmt.number(r.orders), caption: "bezahlt")
                MeKPI(label: "Provision", value: Fmt.money(r.fees, currency: r.currency), caption: "auf Warenwert")
            }
            MeKPI(label: "Umsatz gesamt", value: Fmt.money(r.allTime, currency: r.currency), caption: "seit Shop-Eröffnung")
        }
    }
}

// MARK: - Meine Inhalte

struct StudioContentView: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @State private var data: MeStudioContent?
    @State private var error: String?
    @State private var type = ""
    @State private var state = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                PageTitle(kicker: "Studio", title: "Meine Inhalte", subtitle: "Alles, was du veröffentlicht oder angefangen hast.")
                    .padding(.horizontal, Space.gutter)
                ChipBar(items: typeItems, selection: $type)
                ChipBar(items: [("", "Alle Stände"), ("draft", "Entwürfe"), ("published", "Veröffentlicht"), ("archived", "Archiviert")], selection: $state)
                MePhase(value: data, error: error, retry: load) { d in
                    if d.rows.isEmpty {
                        EmptyStateView(symbol: "square.stack.3d.up", title: "Nichts gefunden", message: "In dieser Auswahl gibt es noch keine Inhalte.",
                                       actionTitle: "Etwas erstellen") { router.present(.createMenu) }
                    } else {
                        LazyVStack(spacing: 0) {
                            ForEach(d.rows) { row($0) }
                        }
                        .cardSurface()
                    }
                }
                .padding(.horizontal, Space.gutter)
            }
            .padding(.bottom, 40)
        }
        .background(Color.paper)
        .navigationTitle("Meine Inhalte")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { router.present(.createMenu) } label: { Image(systemName: "plus") }.accessibilityLabel("Erstellen")
            }
        }
        .task(id: "\(type)|\(state)") { await load() }
        .refreshable { await load() }
        .onChange(of: router.sheet) { _, new in if new == nil { Task { await load() } } }
    }

    private var typeItems: [(value: String, label: String)] {
        var t: [(value: String, label: String)] = [("", "Alle"), ("post", "Beiträge"), ("project", "Projekte"), ("tutorial", "Anleitungen"), ("article", "Artikel")]
        if data?.hasShop == true || app.me?.shop != nil { t.append(("product", "Produkte")) }
        return t
    }

    private func load() async {
        do {
            data = try await APIClient.shared.get("/studio/content", query: ["type": type.nilIfEmpty, "state": state.nilIfEmpty])
            error = nil
        } catch { if data == nil { self.error = MeErr.text(error) } else { app.show(error: error) } }
    }

    private func row(_ r: MeStudioContentRow) -> some View {
        let t = MeLabels.contentType(r.type)
        return HStack(spacing: 12) {
            Button { if let h = r.href { router.open(href: h) } else { edit(r) } } label: {
                HStack(spacing: 12) {
                    Image(systemName: t.symbol)
                        .font(.wr(.subheadline)).foregroundStyle(Color.moss)
                        .frame(width: 34, height: 34)
                        .background(Color.mossSoft, in: .rect(cornerRadius: 10, style: .continuous))
                    VStack(alignment: .leading, spacing: 3) {
                        Text(r.title.nilIfEmpty ?? "Ohne Titel").font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink).lineLimit(2).multilineTextAlignment(.leading)
                        HStack(spacing: 6) {
                            MeStatePill(text: r.stateLabel ?? r.state, tone: r.state == "published" ? .moss : r.state == "draft" ? .warn : .neutral)
                            Text([t.label, r.meta, Fmt.relative(r.updatedAt)].compactMap { $0?.nilIfEmpty }.joined(separator: " · "))
                                .font(.wr(.caption)).foregroundStyle(Color.muted).lineLimit(1)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            Button { edit(r) } label: {
                Image(systemName: "pencil").font(.wr(.subheadline)).frame(width: 40, height: 40).contentShape(.rect)
            }
            .buttonStyle(.glass)
            .accessibilityLabel("\(r.title) bearbeiten")
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .hairline()
    }

    private func edit(_ r: MeStudioContentRow) {
        switch r.type {
        case "post": router.present(.editPost(id: r.id))
        case "project":
            let parts = (r.href ?? "").split(separator: "/").map(String.init)
            router.present(.projectEditor(handle: parts.count >= 3 ? parts[1] : app.handle, slug: parts.last))
        case "tutorial": router.present(.tutorialEditor(id: r.id))
        case "article": router.present(.articleEditor(id: r.id))
        case "product": router.present(.productEditor(id: r.id))
        default: router.open(href: r.manageHref)
        }
    }
}

// MARK: - Projekte

struct StudioProjectsView: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @State private var rows: [MeStudioProject]?
    @State private var error: String?

    var body: some View {
        MePhase(value: rows, error: error, retry: load) { rows in
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    PageTitle(kicker: "Studio", title: "Projekte", subtitle: Fmt.plural(rows.count, "Projekt", "Projekte"))
                    if rows.isEmpty {
                        EmptyStateView(symbol: "hammer", title: "Noch keine Projekte", message: "Ein Projekt ist dein Werkstattbuch: Idee, Material, Journal, Ergebnis.",
                                       actionTitle: "Neues Projekt") { router.present(.projectEditor()) }
                    } else {
                        LazyVStack(spacing: 12) { ForEach(rows) { card($0) } }
                    }
                }
                .padding(.horizontal, Space.gutter)
                .padding(.bottom, 40)
            }
        }
        .background(Color.paper)
        .navigationTitle("Projekte")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { router.present(.projectEditor()) } label: { Image(systemName: "plus") }.accessibilityLabel("Neues Projekt")
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .onChange(of: router.sheet) { _, new in if new == nil { Task { await load() } } }
    }

    private func load() async {
        do { rows = try await APIClient.shared.get("/studio/projects"); error = nil }
        catch { if rows == nil { self.error = MeErr.text(error) } else { app.show(error: error) } }
    }

    private func card(_ p: MeStudioProject) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Button { if let h = app.handle { router.open(.project(handle: h, slug: p.slug)) } } label: {
                HStack(spacing: 12) {
                    CoverView(url: p.coverUrl, seed: p.id, category: p.category, showLabel: false)
                        .frame(width: 64, height: 64)
                        .clipShape(.rect(cornerRadius: Radius.small, style: .continuous))
                    VStack(alignment: .leading, spacing: 5) {
                        Text(p.title).font(.wr(.headline)).foregroundStyle(Color.ink).lineLimit(2).multilineTextAlignment(.leading)
                        HStack(spacing: 6) {
                            StatusBadge(status: p.status)
                            if let v = p.visibility { MeStatePill(text: L.visibility(v), tone: v == "PUBLIC" ? .moss : .neutral) }
                            if p.state == "HIDDEN" { MeStatePill(text: "Ausgeblendet", tone: .danger) }
                            if p.state == "DRAFT" { MeStatePill(text: "Entwurf", tone: .warn) }
                        }
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            HStack(spacing: 14) {
                MeCountLabel(symbol: "eye", value: p.viewCount, label: "Aufrufe")
                MeCountLabel(symbol: "heart", value: p.likeCount, label: "Gefällt-mir")
                MeCountLabel(symbol: "bookmark", value: p.saveCount, label: "gemerkt")
                MeCountLabel(symbol: "point.3.connected.trianglepath.dotted", value: p._count?.updates, label: "Journal-Einträge")
                MeCountLabel(symbol: "bell", value: p._count?.followers, label: "folgen dem Projekt")
                Spacer(minLength: 0)
            }
            GlassEffectContainer(spacing: 8) {
                HStack(spacing: 8) {
                    Button { router.present(.journalEntry(projectId: p.id, projectTitle: p.title)) } label: {
                        Label("Journal-Eintrag", systemImage: "plus.bubble").font(.wr(.footnote, .semibold))
                    }
                    .buttonStyle(.glassProminent).tint(.moss)
                    Button { router.present(.projectEditor(handle: app.handle, slug: p.slug)) } label: {
                        Label("Bearbeiten", systemImage: "pencil").font(.wr(.footnote, .semibold))
                    }
                    .buttonStyle(.glass)
                    Spacer()
                    if let u = p.updatedAt { Text(Fmt.relative(u)).font(.wr(.caption)).foregroundStyle(Color.muted) }
                }
            }
        }
        .padding(14)
        .cardSurface()
    }
}

// MARK: - Anleitungen

struct StudioTutorialsView: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @State private var rows: [MeStudioTutorial]?
    @State private var error: String?
    @State private var pendingDelete: MeStudioTutorial?

    var body: some View {
        MePhase(value: rows, error: error, retry: load) { rows in
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    PageTitle(kicker: "Studio", title: "Anleitungen", subtitle: "Veröffentlichte Versionen bleiben für Lesende stabil – Änderungen erscheinen erst beim nächsten Veröffentlichen.")
                    if rows.isEmpty {
                        EmptyStateView(symbol: "list.number", title: "Noch keine Anleitung", message: "Mach aus einem abgeschlossenen Projekt eine Schritt-für-Schritt-Anleitung.",
                                       actionTitle: "Anleitung schreiben") { router.present(.tutorialEditor()) }
                    } else {
                        LazyVStack(spacing: 12) { ForEach(rows) { card($0) } }
                    }
                }
                .padding(.horizontal, Space.gutter)
                .padding(.bottom, 40)
            }
        }
        .background(Color.paper)
        .navigationTitle("Anleitungen")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { router.present(.tutorialEditor()) } label: { Image(systemName: "plus") }.accessibilityLabel("Neue Anleitung")
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .onChange(of: router.sheet) { _, new in if new == nil { Task { await load() } } }
        .confirmationDialog("Anleitung löschen?", isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }), titleVisibility: .visible, presenting: pendingDelete) { t in
            Button("«\(t.title)» löschen", role: .destructive) {
                Task { if await app.run("Anleitung gelöscht.", { _ = try await APIClient.shared.delete("/tutorials/\(t.id)") as JSONValue }) { await load() } }
            }
        } message: { _ in Text("Lesende verlieren den Zugriff, ihr Fortschritt wird entfernt. Das kann nicht rückgängig gemacht werden.") }
    }

    private func load() async {
        do { rows = try await APIClient.shared.get("/studio/tutorials"); error = nil }
        catch { if rows == nil { self.error = MeErr.text(error) } else { app.show(error: error) } }
    }

    private func setPublished(_ t: MeStudioTutorial, _ on: Bool) async {
        if await app.run(on ? "Anleitung veröffentlicht." : "Anleitung zurückgezogen – sie ist jetzt nur für dich sichtbar.", {
            _ = try await APIClient.shared.post("/tutorials/\(t.id)/published", ["published": JSONValue.bool(on)]) as JSONValue
        }) { await load() }
    }

    private func card(_ t: MeStudioTutorial) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Button { router.open(.tutorial(slug: t.slug)) } label: {
                HStack(alignment: .top, spacing: 12) {
                    CoverView(url: nil, seed: t.id, category: t.category, showLabel: false)
                        .frame(width: 56, height: 56)
                        .clipShape(.rect(cornerRadius: Radius.small, style: .continuous))
                    VStack(alignment: .leading, spacing: 5) {
                        Text(t.title).font(.wr(.headline)).foregroundStyle(Color.ink).lineLimit(2).multilineTextAlignment(.leading)
                        HStack(spacing: 6) {
                            MeStatePill(text: MeLabels.tutorialState(t.state), tone: t.state == "PUBLISHED" ? .moss : t.state == "HIDDEN" ? .danger : .warn)
                            if let v = t.currentVersion?.version { MeStatePill(text: "Version \(v)", tone: .slate) }
                            if t.hasUnpublishedChanges == true { MeStatePill(text: "Unveröffentlichte Änderungen", tone: .clay) }
                        }
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            HStack(spacing: 14) {
                MeCountLabel(symbol: "eye", value: t.viewCount, label: "Aufrufe")
                MeCountLabel(symbol: "figure.walk.motion", value: t._count?.progress, label: "Lesende im Fortschritt")
                MeCountLabel(symbol: "checkmark.seal", value: t.completionCount, label: "abgeschlossen")
                MeCountLabel(symbol: "bookmark", value: t.saveCount, label: "gemerkt")
                Spacer(minLength: 0)
            }
            HStack(spacing: 8) {
                Button { router.present(.tutorialEditor(id: t.id)) } label: { Label("Bearbeiten", systemImage: "pencil").font(.wr(.footnote, .semibold)) }
                    .buttonStyle(.glass)
                if t.state == "PUBLISHED" {
                    AsyncButton { await setPublished(t, false) } label: { Label("Zurückziehen", systemImage: "eye.slash").font(.wr(.footnote, .semibold)) }
                        .buttonStyle(.glass)
                } else if t.state == "DRAFT" && t.currentVersion != nil {
                    AsyncButton { await setPublished(t, true) } label: { Label("Veröffentlichen", systemImage: "paperplane").font(.wr(.footnote, .semibold)) }
                        .buttonStyle(.glassProminent).tint(.moss)
                }
                Spacer()
                Menu {
                    Button("Ansehen", systemImage: "eye") { router.open(.tutorial(slug: t.slug)) }
                    Button("Löschen", systemImage: "trash", role: .destructive) { pendingDelete = t }
                } label: { Image(systemName: "ellipsis").frame(width: 36, height: 36).contentShape(.rect) }
                .accessibilityLabel("Weitere Aktionen")
            }
            if t.state == "DRAFT" && t.currentVersion == nil {
                Text("Noch nie veröffentlicht – öffne den Editor, um eine erste Version zu veröffentlichen.").font(.wr(.caption)).foregroundStyle(Color.muted)
            }
        }
        .padding(14)
        .cardSurface()
    }
}

// MARK: - Blog-Artikel

struct StudioArticlesView: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @State private var rows: [MeStudioArticle]?
    @State private var error: String?
    @State private var state = ""
    @State private var pendingDelete: MeStudioArticle?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                PageTitle(kicker: "Studio", title: "Blog", subtitle: "Längere Texte: Werkstattberichte, Techniken, Hintergründe.")
                    .padding(.horizontal, Space.gutter)
                ChipBar(items: [("", "Alle"), ("DRAFT", "Entwürfe"), ("SCHEDULED", "Geplant"), ("PUBLISHED", "Veröffentlicht")], selection: $state)
                MePhase(value: rows, error: error, retry: load) { rows in
                    if rows.isEmpty {
                        EmptyStateView(symbol: "text.book.closed", title: "Keine Artikel", message: state.isEmpty ? "Schreib deinen ersten Artikel – mit Bildern, Zitaten und verknüpften Projekten." : "In dieser Auswahl gibt es keine Artikel.",
                                       actionTitle: "Neuer Artikel") { router.present(.articleEditor()) }
                    } else {
                        LazyVStack(spacing: 12) { ForEach(rows) { card($0) } }
                    }
                }
                .padding(.horizontal, Space.gutter)
            }
            .padding(.bottom, 40)
        }
        .background(Color.paper)
        .navigationTitle("Blog")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { router.present(.articleEditor()) } label: { Image(systemName: "plus") }.accessibilityLabel("Neuer Artikel")
            }
        }
        .task(id: state) { await load() }
        .refreshable { await load() }
        .onChange(of: router.sheet) { _, new in if new == nil { Task { await load() } } }
        .confirmationDialog("Artikel löschen?", isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }), titleVisibility: .visible, presenting: pendingDelete) { a in
            Button("«\(a.title)» löschen", role: .destructive) {
                Task { if await app.run("Artikel gelöscht.", { _ = try await APIClient.shared.delete("/studio/articles/\(a.id)") as JSONValue }) { await load() } }
            }
        } message: { _ in Text("Der Artikel und seine Kommentare werden entfernt.") }
    }

    private func load() async {
        do { rows = try await APIClient.shared.get("/studio/articles", query: ["state": state.nilIfEmpty]); error = nil }
        catch { if rows == nil { self.error = MeErr.text(error) } else { app.show(error: error) } }
    }

    private func card(_ a: MeStudioArticle) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Button {
                if a.state == "PUBLISHED", let h = app.handle { router.open(.article(handle: h, slug: a.slug)) } else { router.present(.articleEditor(id: a.id)) }
            } label: {
                HStack(alignment: .top, spacing: 12) {
                    CoverView(url: a.coverUrl, seed: a.id, category: nil, showLabel: false)
                        .frame(width: 72, height: 72)
                        .clipShape(.rect(cornerRadius: Radius.small, style: .continuous))
                    VStack(alignment: .leading, spacing: 4) {
                        SpecLabel([a.category?.name, a.readingMinutes.map { "\($0) Min." }].compactMap { $0 }.joined(separator: " · "), color: .clay)
                        Text(a.title.nilIfEmpty ?? "Ohne Titel").font(.wr(.headline)).foregroundStyle(Color.ink).lineLimit(2).multilineTextAlignment(.leading)
                        if let d = a.dek?.nilIfEmpty { Text(d).font(.wr(.caption)).foregroundStyle(Color.muted).lineLimit(2).multilineTextAlignment(.leading) }
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            HStack(spacing: 8) {
                MeStatePill(text: MeLabels.articleState(a.state), tone: a.state == "PUBLISHED" ? .moss : a.state == "SCHEDULED" ? .slate : a.state == "HIDDEN" ? .danger : .warn)
                if a.state == "SCHEDULED", let p = a.publishedAt { Text("am \(Fmt.dateTime(p))").font(.wr(.caption)).foregroundStyle(Color.muted) }
                MeCountLabel(symbol: "eye", value: a.viewCount, label: "Aufrufe")
                MeCountLabel(symbol: "heart", value: a.likeCount, label: "Gefällt-mir")
                MeCountLabel(symbol: "bubble.left", value: a.commentCount, label: "Kommentare")
                Spacer()
                Menu {
                    Button("Bearbeiten", systemImage: "pencil") { router.present(.articleEditor(id: a.id)) }
                    if a.state == "PUBLISHED" || a.state == "SCHEDULED" {
                        Button(a.state == "SCHEDULED" ? "Planung aufheben" : "Zurückziehen", systemImage: "eye.slash") {
                            Task { if await app.run("Artikel ist wieder ein Entwurf.", { _ = try await APIClient.shared.post("/studio/articles/\(a.id)/unpublish") as JSONValue }) { await load() } }
                        }
                    } else if a.state == "DRAFT" {
                        Button("Jetzt veröffentlichen", systemImage: "paperplane") {
                            Task { if await app.run("Artikel veröffentlicht.", { _ = try await APIClient.shared.post("/studio/articles/\(a.id)/publish", ["shareToFeed": JSONValue.bool(true)]) as JSONValue }) { await load() } }
                        }
                    }
                    if a.state == "PUBLISHED", let h = app.handle {
                        ShareLink(item: AppConfig.webURL("/u/\(h)/blog/\(a.slug)")) { Label("Teilen", systemImage: "square.and.arrow.up") }
                    }
                    Divider()
                    Button("Löschen", systemImage: "trash", role: .destructive) { pendingDelete = a }
                } label: { Image(systemName: "ellipsis").frame(width: 36, height: 36).contentShape(.rect) }
                .accessibilityLabel("Aktionen für \(a.title)")
            }
        }
        .padding(14)
        .cardSurface()
    }
}

// MARK: - Medienbibliothek

struct StudioMediaView: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @State private var data: MeStudioMedia?
    @State private var error: String?
    @State private var filter = "all"
    @State private var selected: MeStudioMediaItem?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                PageTitle(kicker: "Studio", title: "Medienbibliothek", subtitle: data.map { "\(Fmt.plural($0.count ?? $0.items.count, "Datei", "Dateien")) · \(Fmt.bytes($0.totalBytes)) belegt" })
                    .padding(.horizontal, Space.gutter)
                ChipBar(items: [("all", "Alle"), ("unused", "Unbenutzt"), ("images", "Bilder"), ("videos", "Videos"), ("files", "Dateien")], selection: $filter)
                MePhase(value: data, error: error, retry: load) { d in
                    if d.items.isEmpty {
                        EmptyStateView(symbol: "photo.on.rectangle", title: filter == "unused" ? "Alles in Gebrauch" : "Keine Medien",
                                       message: filter == "unused" ? "Es gibt keine ungenutzten Uploads." : "Bilder und Videos aus Beiträgen, Projekten und Anleitungen erscheinen hier.")
                    } else {
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 104), spacing: 6)], spacing: 6) {
                            ForEach(d.items) { tile($0) }
                        }
                        if filter == "all" || filter == "unused" {
                            Text("Tippe auf ein Medium, um den Alt-Text zu bearbeiten. Ungenutzte Uploads kannst du löschen, um Speicher freizugeben.")
                                .font(.wr(.caption)).foregroundStyle(Color.muted).padding(.top, 6)
                        }
                    }
                }
                .padding(.horizontal, Space.gutter)
            }
            .padding(.bottom, 40)
        }
        .background(Color.paper)
        .navigationTitle("Medien")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: filter) { await load() }
        .refreshable { await load() }
        .sheet(item: $selected) { m in
            MeMediaDetailSheet(item: m) { await load() }.meSheetEnvironment(app, router)
        }
    }

    private func load() async {
        do { data = try await APIClient.shared.get("/studio/media", query: ["filter": filter]); error = nil }
        catch { if data == nil { self.error = MeErr.text(error) } else { app.show(error: error) } }
    }

    private func tile(_ m: MeStudioMediaItem) -> some View {
        Button { selected = m } label: {
            Color.sunken
                .aspectRatio(1, contentMode: .fit)
                .overlay {
                    if let p = m.preview {
                        RemoteImage(path: p)
                    } else {
                        Image(systemName: m.kind == "VIDEO" ? "film" : m.kind == "FILE" ? "doc" : "photo").font(.wr(.title2)).foregroundStyle(Color.muted)
                    }
                }
                .clipShape(.rect(cornerRadius: Radius.small, style: .continuous))
                .overlay(alignment: .bottomLeading) {
                    HStack(spacing: 3) {
                        if m.attached != true { Text("UNBENUTZT").font(.wr(size: 8, weight: .bold)).padding(.horizontal, 5).padding(.vertical, 2).background(Color.clay, in: Capsule()).foregroundStyle(.white) }
                        if m.alt?.nilIfEmpty != nil { Text("ALT").font(.wr(size: 8, weight: .bold)).padding(.horizontal, 5).padding(.vertical, 2).background(.black.opacity(0.55), in: Capsule()).foregroundStyle(.white) }
                        if m.isPrivate == true { Image(systemName: "lock.fill").font(.wr(size: 8)).padding(4).background(.black.opacity(0.55), in: Circle()).foregroundStyle(.white) }
                    }
                    .padding(5)
                }
        }
        .buttonStyle(.pressable)
        .accessibilityLabel(m.alt?.nilIfEmpty ?? (m.kind == "VIDEO" ? "Video ohne Beschreibung" : "Bild ohne Beschreibung"))
        .accessibilityHint(m.attached == true ? "In Verwendung" : "Unbenutzt")
    }
}

private struct MeMediaDetailSheet: View {
    var item: MeStudioMediaItem
    var onChange: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var app
    @State private var alt = ""
    @State private var confirmDelete = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack {
                        Spacer()
                        Group {
                            if let p = item.preview { RemoteImage(path: p, contentMode: .fit) { Color.sunken } }
                            else { Image(systemName: item.kind == "VIDEO" ? "film" : "doc").font(.wr(.largeTitle)).foregroundStyle(Color.muted).frame(height: 120) }
                        }
                        .frame(maxHeight: 240)
                        .clipShape(.rect(cornerRadius: Radius.inner, style: .continuous))
                        Spacer()
                    }
                    .listRowBackground(Color.clear)
                }
                if item.kind == "IMAGE" {
                    Section {
                        TextField("Was ist auf dem Bild zu sehen?", text: $alt, axis: .vertical).lineLimit(2...6)
                        MeCharCounter(count: alt.count, max: 500)
                    } header: { Text("Alternativtext") } footer: {
                        Text("Wird an Verwendungen übernommen, die noch keinen Alt-Text haben. Hilft Menschen mit Screenreader.")
                    }
                }
                Section {
                    LabeledContent("Art", value: item.kind == "VIDEO" ? "Video" : item.kind == "FILE" ? "Datei" : "Bild")
                    if let w = item.width, let h = item.height { LabeledContent("Grösse", value: "\(w) × \(h) px") }
                    LabeledContent("Speicher", value: Fmt.bytes(item.bytes))
                    if let c = item.createdAt { LabeledContent("Hochgeladen", value: Fmt.dateTime(c)) }
                    LabeledContent("Verwendet in", value: (item.usedIn ?? []).isEmpty ? "Nirgends" : (item.usedIn ?? []).joined(separator: ", "))
                    if item.isPrivate == true { LabeledContent("Privat", value: "Nur in Nachrichten/Bestellungen") }
                }
                if item.attached != true {
                    Section {
                        Button("Medium löschen", systemImage: "trash", role: .destructive) { confirmDelete = true }
                    } footer: { Text("Nur ungenutzte Medien können gelöscht werden.") }
                }
            }
            .meFormStyle()
            .navigationTitle("Medium")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Schliessen") { dismiss() } }
                if item.kind == "IMAGE" {
                    ToolbarItem(placement: .confirmationAction) {
                        AsyncButton("Sichern") {
                            if await app.run("Alt-Text gesichert.", { _ = try await APIClient.shared.patch("/studio/media/\(item.id)", ["alt": JSONValue.string(alt.trimmed)]) as JSONValue }) {
                                await onChange(); dismiss()
                            }
                        }
                        .disabled(alt.trimmed == (item.alt ?? "") || alt.count > 500)
                    }
                }
            }
            .onAppear { alt = item.alt ?? "" }
            .confirmationDialog("Medium endgültig löschen?", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Löschen", role: .destructive) {
                    Task {
                        if await app.run("Medium gelöscht.", { _ = try await APIClient.shared.delete("/studio/media/\(item.id)") as JSONValue }) {
                            await onChange(); dismiss()
                        }
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

// MARK: - Statistiken

struct StudioStatsView: View {
    @Environment(AppState.self) private var app
    @State private var data: MeStudioStats?
    @State private var error: String?

    private struct Bar: Identifiable { var id: String; var title: String; var kind: String; var value: Int }

    var body: some View {
        MePhase(value: data, error: error, retry: load) { d in
            ScrollView {
                VStack(alignment: .leading, spacing: 26) {
                    PageTitle(kicker: "Studio", title: "Statistiken", subtitle: "Kennzahlen je Inhalt seit Veröffentlichung. Aufrufe sind Seitenaufrufe, keine eindeutigen Personen.")
                    overview(d)
                    table("Projekte", number: "01", rows: d.projects ?? [], columns: [("eye", "Aufrufe", \.viewCount), ("heart", "Gefällt-mir", \.likeCount), ("bookmark", "gemerkt", \.saveCount), ("bubble.left", "Kommentare", \.commentCount), ("arrow.triangle.branch", "Nachbauten", \.remixCount)])
                    table("Anleitungen", number: "02", rows: d.tutorials ?? [], columns: [("eye", "Aufrufe", \.viewCount), ("checkmark.seal", "abgeschlossen", \.completionCount), ("bookmark", "gemerkt", \.saveCount), ("heart", "Gefällt-mir", \.likeCount)])
                    table("Artikel", number: "03", rows: d.articles ?? [], columns: [("eye", "Aufrufe", \.viewCount), ("heart", "Gefällt-mir", \.likeCount)])
                    table("Beiträge", number: "04", rows: d.posts ?? [], columns: [("heart", "Gefällt-mir", \.likeCount), ("bubble.left", "Kommentare", \.commentCount), ("bookmark", "gemerkt", \.saveCount), ("arrow.2.squarepath", "geteilt", \.repostCount)])
                    if !(d.products ?? []).isEmpty {
                        table("Produkte", number: "05", rows: d.products ?? [], columns: [("eye", "Aufrufe", \.viewCount), ("bookmark", "gemerkt", \.saveCount), ("star", "Bewertungen", \.ratingCount), ("shippingbox", "verkauft", \.orderItemCount)])
                    }
                }
                .padding(.horizontal, Space.gutter)
                .padding(.bottom, 40)
            }
        }
        .background(Color.paper)
        .navigationTitle("Statistiken")
        .navigationBarTitleDisplayMode(.inline)
        .task { if data == nil { await load() } }
        .refreshable { await load() }
    }

    private func load() async {
        do { data = try await APIClient.shared.get("/studio/stats"); error = nil }
        catch { if data == nil { self.error = MeErr.text(error) } else { app.show(error: error) } }
    }

    @ViewBuilder private func overview(_ d: MeStudioStats) -> some View {
        let bars: [Bar] = ((d.projects ?? []).map { Bar(id: $0.id, title: $0.label, kind: "Projekt", value: $0.viewCount ?? 0) }
            + (d.tutorials ?? []).map { Bar(id: $0.id, title: $0.label, kind: "Anleitung", value: $0.viewCount ?? 0) }
            + (d.articles ?? []).map { Bar(id: $0.id, title: $0.label, kind: "Artikel", value: $0.viewCount ?? 0) }
            + (d.products ?? []).map { Bar(id: $0.id, title: $0.label, kind: "Produkt", value: $0.viewCount ?? 0) })
            .filter { $0.value > 0 }
            .sorted { $0.value > $1.value }
        if !bars.isEmpty {
            let top = Array(bars.prefix(8))
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

    @ViewBuilder private func table(_ title: String, number: String, rows: [MeStatRow], columns: [(String, String, KeyPath<MeStatRow, Int?>)]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(title, number: number, subtitle: rows.isEmpty ? "Noch nichts veröffentlicht" : Fmt.plural(rows.count, "Eintrag", "Einträge"))
            if !rows.isEmpty {
                let maxFirst = max(1, rows.map { $0[keyPath: columns[0].2] ?? 0 }.max() ?? 1)
                VStack(spacing: 0) {
                    ForEach(rows) { r in
                        VStack(alignment: .leading, spacing: 8) {
                            HStack(alignment: .firstTextBaseline) {
                                Text(r.label).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink).lineLimit(2)
                                Spacer(minLength: 8)
                                if let p = r.publishedAt { Text(Fmt.date(p)).font(.wr(.caption)).foregroundStyle(Color.muted) }
                            }
                            GeometryReader { geo in
                                let v = CGFloat(r[keyPath: columns[0].2] ?? 0) / CGFloat(maxFirst)
                                Capsule().fill(Color.sunken)
                                    .overlay(alignment: .leading) { Capsule().fill(Color.moss).frame(width: max(3, geo.size.width * v)) }
                            }
                            .frame(height: 4)
                            .accessibilityHidden(true)
                            HStack(spacing: 14) {
                                ForEach(columns, id: \.1) { c in MeCountLabel(symbol: c.0, value: r[keyPath: c.2], label: c.1) }
                                Spacer(minLength: 0)
                            }
                        }
                        .padding(14)
                        .hairline()
                    }
                }
                .cardSurface()
            }
        }
    }
}

private extension MeStatRow {
    var orderItemCount: Int? { _count?.orderItems }
}
