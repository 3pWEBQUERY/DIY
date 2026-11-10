import SwiftUI
import EventKit
import EventKitUI

// MARK: - Übersicht (`/events`)

private enum EventModeFilter: String, CaseIterable, Hashable {
    case all, inPerson, online
    var label: String {
        switch self {
        case .all: "Alle"
        case .inPerson: "Vor Ort"
        case .online: "Online"
        }
    }
    var query: String? {
        switch self {
        case .all: nil
        case .inPerson: EventMode.inPerson.rawValue
        case .online: EventMode.online.rawValue
        }
    }
}

struct EventListView: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router

    @State private var data: CommunityEventsOverview?
    @State private var error: String?
    @State private var mode: EventModeFilter = .all
    @State private var category: String?
    @State private var loading = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                PageTitle(kicker: "Communities · Events", title: "Events", subtitle: "Treffen, Workshops und Tauschbörsen aus den Communities – zum gemeinsamen Werkeln vor Ort oder online.")
                    .padding(.horizontal, Space.gutter)
                ChipBar(items: EventModeFilter.allCases.map { ($0, $0.label) }, selection: $mode)
                DiscoverCategoryChips(categories: app.activeCategories, selection: $category)
                if let data {
                    sections(data)
                        .padding(.horizontal, Space.gutter)
                        .opacity(loading ? 0.55 : 1)
                } else if let error {
                    ErrorStateView(message: error) { await load() }
                } else {
                    LoadingView()
                }
            }
            .padding(.vertical, 12)
            .padding(.bottom, 40)
        }
        .background(Color.paper)
        .navigationTitle("Events")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { router.open(.communities) } label: { Image(systemName: "person.3") }
                    .accessibilityLabel("Communities entdecken")
            }
        }
        .task(id: "\(mode.rawValue)|\(category ?? "")") { await load() }
        .refreshable { await load() }
    }

    @ViewBuilder private func sections(_ d: CommunityEventsOverview) -> some View {
        let list: [(String, [CommunityEventCard])] = [
            ("Deine nächsten Events", d.mine),
            ("In deinen Communities", d.communities),
        ].filter { !$0.1.isEmpty }
        VStack(alignment: .leading, spacing: 28) {
            ForEach(Array(list.enumerated()), id: \.element.0) { i, sec in
                VStack(alignment: .leading, spacing: 12) {
                    SectionHeader(sec.0, number: String(format: "%02d", i + 1))
                    ForEach(sec.1) { CommunityEventRow(event: $0) }
                }
            }
            VStack(alignment: .leading, spacing: 12) {
                SectionHeader(app.isSignedIn ? "Weitere Events" : "Kommende Events", number: String(format: "%02d", list.count + 1))
                if d.open.isEmpty {
                    EmptyStateView(symbol: "calendar", title: "Gerade nichts geplant", message: "Events entstehen in den Communities. Gründe eine oder schlage in deiner Community ein Treffen vor.", actionTitle: "Zu den Communities") {
                        router.open(.communities)
                    }
                } else {
                    ForEach(d.open) { CommunityEventRow(event: $0) }
                }
            }
        }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            let d: CommunityEventsOverview = try await APIClient.shared.get("/events", query: ["mode": mode.query, "category": category])
            withAnimation(.snappy) { data = d; error = nil }
        } catch is CancellationError {
        } catch {
            if data == nil { self.error = (error as? APIError)?.message ?? error.localizedDescription } else { app.show(error: error) }
        }
    }
}

// MARK: - Datumsblatt & Karte

/// Abreisskalender-Blatt (Tag + Monat)
struct EventDateTile: View {
    var date: Date
    var muted = false
    var size: CGFloat = 56

    var body: some View {
        VStack(spacing: 1) {
            Text(EventFmt.dayNumber(date)).font(.wr(size: size * 0.36, weight: .bold)).monospacedDigit()
            Text(EventFmt.monthShort(date)).font(.wr(size: size * 0.19, weight: .semibold)).textCase(.uppercase).tracking(0.6)
        }
        .foregroundStyle(muted ? Color.muted : Color.mossInk)
        .frame(width: size, height: size)
        .background(muted ? Color.sunken : Color.mossSoft, in: .rect(cornerRadius: size * 0.28, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: size * 0.28, style: .continuous).strokeBorder(muted ? Color.line : Color.moss.opacity(0.3), lineWidth: 0.75))
        .accessibilityHidden(true)
    }
}

struct CommunityEventRow: View {
    var event: CommunityEventCard
    var showCommunity = true
    @Environment(Router.self) private var router

    var body: some View {
        let e = event
        Button { router.open(.event(id: e.id)) } label: {
            HStack(alignment: .top, spacing: 14) {
                EventDateTile(date: e.startsAt, muted: e.isCancelled || e.isPast)
                VStack(alignment: .leading, spacing: 6) {
                    FlowLayout(spacing: 6) {
                        Pill(text: EventKind.label(e.kind), tint: .ink2)
                        if e.isCancelled { Pill(text: "Abgesagt", tint: .danger) }
                        else if e.myStatus == EventAttendance.going.rawValue { Pill(text: "Du bist dabei", symbol: "checkmark", tint: .moss) }
                        else if e.myStatus == EventAttendance.interested.rawValue { Pill(text: "Interessiert", symbol: "star", tint: .slate) }
                        if !e.isCancelled && e.full == true && e.myStatus != EventAttendance.going.rawValue { Pill(text: "Ausgebucht", tint: .warn) }
                    }
                    Text(e.title)
                        .font(.wr(.headline))
                        .foregroundStyle(Color.ink)
                        .strikethrough(e.isCancelled)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(EventFmt.cardLine(e.startsAt, e.endsAt)).font(.wr(.caption)).foregroundStyle(Color.muted)
                    HStack(spacing: 12) {
                        Label(e.isOnline ? "Online" : (e.locationName?.nilIfEmpty ?? "Vor Ort"), systemImage: e.isOnline ? "video" : "mappin")
                            .lineLimit(1)
                        Label("\(e.goingCount)\(e.capacity.map { " / \($0)" } ?? "") dabei", systemImage: "person.2")
                            .monospacedDigit()
                        if showCommunity { Text(e.community.name).foregroundStyle(Color.muted).lineLimit(1) }
                    }
                    .font(.wr(.caption))
                    .foregroundStyle(Color.ink2)
                    .labelStyle(.compact)
                }
                Spacer(minLength: 0)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .cardSurface(radius: 18)
            .opacity(e.isCancelled ? 0.7 : 1)
        }
        .buttonStyle(.pressable)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Event öffnen")
    }
}

// MARK: - Events-Tab der Community

/// Kommende/vergangene Events einer Community inkl. „Event erstellen“.
struct CommunityEventsSection: View {
    var communityId: String
    var canCreate: Bool
    var isMember: Bool

    @Environment(AppState.self) private var app
    @State private var past = false
    @State private var items: [CommunityEventCard]?
    @State private var showEditor = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Picker("Zeitraum", selection: $past) {
                    Text("Kommende").tag(false)
                    Text("Vergangene").tag(true)
                }
                .pickerStyle(.segmented)
                .frame(maxWidth: 240)
                Spacer(minLength: 8)
                if canCreate {
                    Button { showEditor = true } label: {
                        Label("Event erstellen", systemImage: "calendar.badge.plus").font(.wr(.subheadline, .semibold))
                    }
                    .buttonStyle(.glassProminent)
                    .tint(.action)
                }
            }
            if let items {
                if items.isEmpty {
                    EmptyStateView(
                        symbol: "calendar",
                        title: past ? "Noch keine vergangenen Events" : "Keine Events geplant",
                        message: past ? nil : isMember ? "Lade zu einem Treffen, Workshop oder einer Tauschbörse ein – vor Ort oder online." : "Tritt bei, um Events zu erstellen und teilzunehmen.",
                        actionTitle: !past && canCreate ? "Event erstellen" : nil
                    ) { showEditor = true }
                } else {
                    ForEach(items) { CommunityEventRow(event: $0, showCommunity: false) }
                }
            } else {
                LoadingView()
            }
        }
        .task(id: past) { await load() }
        .sheet(isPresented: $showEditor) {
            EventEditorSheet(communityId: communityId, event: nil) { _ in Task { await load() } }
        }
    }

    private func load() async {
        do {
            let r: [CommunityEventCard] = try await APIClient.shared.get("/communities/\(communityId)/events", query: ["when": past ? "past" : nil])
            withAnimation(.snappy) { items = r }
        } catch is CancellationError {
        } catch {
            items = items ?? []
            app.show(error: error)
        }
    }
}

// MARK: - Detail (`/c/:slug/events/:id`)

struct EventDetailView: View {
    var id: String

    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @State private var e: CommunityEventDetail?
    @State private var error: String?
    @State private var busy = false
    @State private var showEditor = false
    @State private var showCancel = false
    @State private var cancelReason = ""
    @State private var showCalendar = false

    var body: some View {
        Group {
            if let e {
                content(e)
            } else if let error {
                ErrorStateView(message: error) { await load() }
            } else {
                LoadingView()
            }
        }
        .background(Color.paper)
        .navigationTitle(e?.title ?? "Event")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let e {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        ShareLink(item: AppConfig.webURL(e.href ?? "/c/\(e.community.slug)/events/\(e.id)"), subject: Text(e.title)) {
                            Label("Teilen", systemImage: "square.and.arrow.up")
                        }
                        if !e.isCancelled && !e.isPast {
                            Button("Zum Kalender", systemImage: "calendar.badge.plus") { showCalendar = true }
                        }
                        Button("Zur Community", systemImage: "person.3") { router.open(.community(slug: e.community.slug)) }
                        if e.canEdit {
                            Divider()
                            Button("Bearbeiten", systemImage: "pencil") { showEditor = true }
                            Button("Event absagen …", systemImage: "xmark.circle", role: .destructive) { showCancel = true }
                        }
                    } label: { Image(systemName: "ellipsis") }
                    .accessibilityLabel("Weitere Aktionen")
                }
            }
        }
        .task { if e == nil { await load() } }
        .refreshable { await load() }
        .sheet(isPresented: $showEditor) {
            if let e { EventEditorSheet(communityId: e.communityId, event: e) { _ in Task { await load() } } }
        }
        .sheet(isPresented: $showCalendar) {
            if let e { EventCalendarSheet(event: e) { showCalendar = false }.ignoresSafeArea() }
        }
        .alert("Event absagen?", isPresented: $showCancel) {
            TextField("Grund (optional)", text: $cancelReason)
            Button("Zurück", role: .cancel) {}
            Button("Endgültig absagen", role: .destructive) { Task { await cancel() } }
        } message: { Text("Alle Teilnehmenden werden benachrichtigt. Das lässt sich nicht rückgängig machen.") }
    }

    private func load() async {
        do {
            let d: CommunityEventDetail = try await APIClient.shared.get("/events/\(id)")
            withAnimation(.snappy) { e = d; error = nil }
        } catch is CancellationError {
        } catch {
            if e == nil { self.error = (error as? APIError)?.message ?? error.localizedDescription } else { app.show(error: error) }
        }
    }

    // MARK: Inhalt

    private func content(_ e: CommunityEventDetail) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                header(e)
                if e.isCancelled {
                    NoticeView(tone: .danger, title: "Dieses Event wurde abgesagt", message: e.cancelReason?.nilIfEmpty ?? "Die Veranstalterin bzw. der Veranstalter hat das Event abgesagt.")
                }
                facts(e)
                attendancePanel(e)
                if let d = e.description?.nilIfEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        SectionHeader("Worum es geht", number: "01")
                        Text(d).font(.wr(.body)).foregroundStyle(Color.ink2).fixedSize(horizontal: false, vertical: true).textSelection(.enabled)
                    }
                }
                attendees(e, number: e.description?.nilIfEmpty == nil ? "01" : "02")
            }
            .padding(.horizontal, Space.gutter)
            .padding(.vertical, 12)
            .padding(.bottom, 40)
        }
    }

    private func header(_ e: CommunityEventDetail) -> some View {
        HStack(alignment: .top, spacing: 16) {
            EventDateTile(date: e.startsAt, muted: e.isCancelled || e.isPast, size: 72)
            VStack(alignment: .leading, spacing: 8) {
                FlowLayout(spacing: 6) {
                    Pill(text: EventKind.label(e.kind), tint: .ink2)
                    if e.isCancelled { Pill(text: "Abgesagt", tint: .danger) }
                    if e.isPast && !e.isCancelled { Pill(text: "Vorbei", tint: .muted) }
                }
                Text(e.title).font(.display(28)).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 4) {
                    Text("von").foregroundStyle(Color.muted)
                    Button(e.organizer.name) { if let h = e.organizer.handle?.nilIfEmpty { router.open(.profile(handle: h)) } }
                        .fontWeight(.semibold).foregroundStyle(Color.ink)
                    Text("in").foregroundStyle(Color.muted)
                    Button(e.community.name) { router.open(.community(slug: e.community.slug)) }
                        .fontWeight(.semibold).foregroundStyle(Color.ink)
                        .lineLimit(1)
                }
                .font(.wr(.footnote))
                .buttonStyle(.plain)
            }
        }
    }

    private func facts(_ e: CommunityEventDetail) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            fact("clock", EventFmt.longDate(e.startsAt), EventFmt.span(e.startsAt, e.endsAt))
            if e.isOnline {
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: "video").foregroundStyle(Color.muted).frame(width: 20)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Online").font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink)
                        if let u = e.onlineUrl?.nilIfEmpty, let url = URL(string: u) {
                            Link(u.replacingOccurrences(of: "https://", with: ""), destination: url)
                                .font(.wr(.footnote)).tint(.moss).lineLimit(1)
                        } else {
                            Label("Link nach Zusage sichtbar", systemImage: "lock").font(.wr(.footnote)).foregroundStyle(Color.muted).labelStyle(.compact)
                        }
                    }
                }
            } else {
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: "mappin.and.ellipse").foregroundStyle(Color.muted).frame(width: 20)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(e.locationName?.nilIfEmpty ?? "Vor Ort").font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink)
                        if let a = e.address?.nilIfEmpty { Text(a).font(.wr(.footnote)).foregroundStyle(Color.ink2).textSelection(.enabled) }
                        let q = [e.locationName, e.address].compactMap { $0?.nilIfEmpty }.joined(separator: ", ")
                        if !q.isEmpty, let url = URL(string: "https://maps.apple.com/?q=\(q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")") {
                            Link("Auf der Karte zeigen", destination: url).font(.wr(.footnote, .semibold)).tint(.moss)
                        }
                    }
                }
            }
            fact("person.2", "\(e.goingCount) dabei\((e.interestedCount ?? 0) > 0 ? " · \(e.interestedCount ?? 0) interessiert" : "")",
                 e.capacity.map { cap in (e.spotsLeft ?? 0) > 0 ? "Noch \(e.spotsLeft ?? 0) von \(cap) Plätzen frei" : "Ausgebucht" })
            if let cost = e.costNote?.nilIfEmpty {
                fact("banknote", cost, "Bezahlung direkt bei der Veranstalterin bzw. dem Veranstalter")
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
    }

    private func fact(_ symbol: String, _ title: String, _ sub: String?) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: symbol).foregroundStyle(Color.muted).frame(width: 20)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink).monospacedDigit()
                if let sub { Text(sub).font(.wr(.footnote)).foregroundStyle(Color.ink2) }
            }
        }
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private func attendancePanel(_ e: CommunityEventDetail) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            if e.canAttend {
                if e.organizer.id == app.me?.id {
                    Label("Du organisierst dieses Event.", systemImage: "star").font(.wr(.subheadline)).foregroundStyle(Color.ink2)
                } else {
                    GlassEffectContainer(spacing: 8) {
                        HStack(spacing: 8) {
                            if e.status == .going {
                                AsyncButton { await rsvp(nil) } label: { Label("Doch nicht dabei", systemImage: "xmark").font(.wr(.subheadline, .semibold)) }
                                    .buttonStyle(.glass)
                            } else {
                                AsyncButton { await rsvp(.going) } label: {
                                    Label(e.full == true ? "Ausgebucht" : "Ich bin dabei", systemImage: "checkmark").font(.wr(.subheadline, .semibold))
                                }
                                .buttonStyle(.glassProminent)
                                .tint(.action)
                                .disabled(e.full == true)
                                if e.status == .interested {
                                    AsyncButton { await rsvp(nil) } label: { Text("Nicht mehr interessiert").font(.wr(.subheadline)) }
                                        .buttonStyle(.glass)
                                } else {
                                    AsyncButton { await rsvp(.interested) } label: { Label("Interessiert", systemImage: "star").font(.wr(.subheadline, .semibold)) }
                                        .buttonStyle(.glass)
                                }
                            }
                            Spacer(minLength: 0)
                        }
                    }
                    if e.status == .going { Label("Du bist dabei", systemImage: "checkmark.seal.fill").font(.wr(.footnote, .semibold)).foregroundStyle(Color.moss) }
                }
            } else if e.isCancelled || e.isPast {
                Text(e.isCancelled ? "Abgesagt – keine Anmeldung möglich." : "Dieses Event ist vorbei.").font(.wr(.subheadline)).foregroundStyle(Color.muted)
            } else if app.isSignedIn {
                Text("Tritt der Community bei, um teilzunehmen.").font(.wr(.subheadline)).foregroundStyle(Color.muted)
                Button { router.open(.community(slug: e.community.slug)) } label: {
                    Label("Zur Community", systemImage: "person.3").font(.wr(.subheadline, .semibold))
                }
                .buttonStyle(.glass)
            } else {
                Text("Melde dich an, um teilzunehmen.").font(.wr(.subheadline)).foregroundStyle(Color.muted)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
    }

    private func attendees(_ e: CommunityEventDetail, number: String) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader("Dabei (\(e.goingCount))", number: number)
            if e.attendees.isEmpty {
                Text("Noch niemand – sei die erste Person.").font(.wr(.subheadline)).foregroundStyle(Color.muted)
            } else {
                FlowLayout(spacing: 8) {
                    ForEach(e.attendees) { a in
                        Button { if let h = a.handle?.nilIfEmpty { router.open(.profile(handle: h)) } } label: {
                            HStack(spacing: 8) {
                                AvatarView(url: a.avatarUrl, name: a.name, size: 28)
                                Text(a.name).font(.wr(.footnote, .medium)).foregroundStyle(Color.ink).lineLimit(1)
                            }
                            .padding(.leading, 3).padding(.trailing, 12).padding(.vertical, 3)
                            .background(Color.card, in: Capsule())
                            .overlay(Capsule().strokeBorder(Color.line, lineWidth: 0.75))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    // MARK: Aktionen

    private func rsvp(_ status: EventAttendance?) async {
        Haptics.selection()
        let msg: String = switch status {
        case .going: "Du bist dabei."
        case .interested: "Als interessiert markiert."
        case nil: e?.status == .going ? "Zusage zurückgezogen." : "Nicht mehr interessiert."
        }
        do {
            let d: CommunityEventDetail = try await APIClient.shared.post("/events/\(id)/rsvp", ["status": status.map { JSONValue.string($0.rawValue) } ?? .null])
            app.show(msg)
            withAnimation(.snappy) { e = d }
        } catch {
            app.show(error: error)
        }
    }

    private func cancel() async {
        let reason = cancelReason.trimmed
        if await app.run("Event abgesagt.", { _ = try await APIClient.shared.post("/events/\(id)/cancel", ["reason": JSONValue.string(reason)]) as JSONValue }) {
            cancelReason = ""
            await load()
        }
    }
}

// MARK: - Erstellen / Bearbeiten

struct EventEditorSheet: View {
    var communityId: String
    var event: CommunityEventDetail?
    var onSaved: (String) -> Void

    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @Environment(\.dismiss) private var dismiss

    @State private var title: String
    @State private var kind: EventKind
    @State private var mode: EventMode
    @State private var startsAt: Date
    @State private var endsAt: Date
    @State private var locationName: String
    @State private var address: String
    @State private var onlineUrl: String
    @State private var capacity: String
    @State private var costNote: String
    @State private var description: String
    @State private var fields: [String: String] = [:]
    @State private var saving = false

    init(communityId: String, event: CommunityEventDetail?, onSaved: @escaping (String) -> Void) {
        self.communityId = communityId
        self.event = event
        self.onSaved = onSaved
        let start = event?.startsAt ?? Calendar.current.date(bySettingHour: 18, minute: 0, second: 0, of: Date().addingTimeInterval(7 * 86400)) ?? Date().addingTimeInterval(7 * 86400)
        _title = State(initialValue: event?.title ?? "")
        _kind = State(initialValue: EventKind(rawValue: event?.kind ?? "") ?? .meetup)
        _mode = State(initialValue: EventMode(rawValue: event?.mode ?? "") ?? .inPerson)
        _startsAt = State(initialValue: start)
        _endsAt = State(initialValue: event?.endsAt ?? start.addingTimeInterval(2 * 3600))
        _locationName = State(initialValue: event?.locationName ?? "")
        _address = State(initialValue: event?.address ?? "")
        _onlineUrl = State(initialValue: event?.onlineUrl ?? "")
        _capacity = State(initialValue: event?.capacity.map(String.init) ?? "")
        _costNote = State(initialValue: event?.costNote ?? "")
        _description = State(initialValue: event?.description ?? "")
    }

    private var isEdit: Bool { event != nil }
    private var valid: Bool {
        title.trimmed.count >= 3 && endsAt > startsAt
            && (mode == .online ? onlineUrl.trimmed.hasPrefix("https://") : !(locationName.trimmed.isEmpty && address.trimmed.isEmpty))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Titel, z. B. „Häkeltreff im Café“", text: $title)
                    DiscoverFieldError(message: fields["title"])
                    Picker("Art", selection: $kind) {
                        ForEach(EventKind.allCases) { Text($0.label).tag($0) }
                    }
                }
                Section {
                    DatePicker("Beginn", selection: $startsAt, in: (isEdit ? Date.distantPast : Date())...)
                        .onChange(of: startsAt) { old, new in
                            // Dauer beibehalten
                            let d = endsAt.timeIntervalSince(old)
                            endsAt = new.addingTimeInterval(d > 0 ? d : 7200)
                        }
                    DiscoverFieldError(message: fields["startsAt"])
                    DatePicker("Ende", selection: $endsAt, in: startsAt...)
                    DiscoverFieldError(message: fields["endsAt"])
                } header: { Text("Wann") }
                Section {
                    Picker("Ort", selection: $mode) {
                        ForEach(EventMode.allCases) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    if mode == .inPerson {
                        TextField("Treffpunkt, z. B. Café, Werkstatt", text: $locationName)
                        DiscoverFieldError(message: fields["locationName"])
                        TextField("Adresse (optional)", text: $address)
                            .textContentType(.fullStreetAddress)
                        DiscoverFieldError(message: fields["address"])
                    } else {
                        TextField("https://…", text: $onlineUrl)
                            .keyboardType(.URL)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                        DiscoverFieldError(message: fields["onlineUrl"])
                    }
                } header: { Text("Wo") } footer: {
                    Text(mode == .online ? "Nur Teilnehmende mit Zusage sehen den Link." : "Name des Ortes und Adresse helfen beim Hinfinden.")
                }
                Section {
                    TextField("Plätze (leer = unbegrenzt)", text: $capacity)
                        .keyboardType(.numberPad)
                        .onChange(of: capacity) { _, v in
                            let digits = v.filter(\.isNumber)
                            if digits != v { capacity = digits }
                        }
                    DiscoverFieldError(message: fields["capacity"])
                    TextField("Kosten, z. B. „CHF 15 Material, bar vor Ort“", text: $costNote)
                    DiscoverFieldError(message: fields["costNote"])
                } header: { Text("Teilnahme") }
                Section {
                    TextField("Was passiert, was bringt man mit, für wen ist es geeignet?", text: $description, axis: .vertical)
                        .lineLimit(4...12)
                    DiscoverFieldError(message: fields["description"])
                } header: { Text("Beschreibung (optional)") }
            }
            .font(.wr(.body))
            .scrollContentBackground(.hidden)
            .background(Color.paper)
            .navigationTitle(isEdit ? "Event bearbeiten" : "Neues Event")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button { Task { await save() } } label: {
                        if saving { ProgressView() } else { Text(isEdit ? "Speichern" : "Erstellen") }
                    }
                    .buttonStyle(.glassProminent)
                    .tint(.action)
                    .disabled(!valid || saving)
                }
            }
        }
        .interactiveDismissDisabled(!title.trimmed.isEmpty && !isEdit)
    }

    private func save() async {
        saving = true
        defer { saving = false }
        fields = [:]
        let cap = Int(capacity.trimmed)
        let body: [String: JSONValue] = [
            "title": .string(title.trimmed),
            "kind": .string(kind.rawValue),
            "mode": .string(mode.rawValue),
            "startsAt": .string(JSON.isoFormatter.string(from: startsAt)),
            "endsAt": .string(JSON.isoFormatter.string(from: endsAt)),
            "locationName": .string(mode == .inPerson ? locationName.trimmed : ""),
            "address": .string(mode == .inPerson ? address.trimmed : ""),
            "onlineUrl": .string(mode == .online ? onlineUrl.trimmed : ""),
            "capacity": cap.map { .number(Double($0)) } ?? .null,
            "costNote": .string(costNote.trimmed),
            "description": .string(description.trimmed),
        ]
        do {
            let r: CommunityEventSaved
            if let event {
                r = try await APIClient.shared.patch("/events/\(event.id)", body)
            } else {
                r = try await APIClient.shared.post("/communities/\(communityId)/events", body)
            }
            app.show(isEdit ? "Event gespeichert." : "Event erstellt. Du bist automatisch dabei.")
            onSaved(r.id)
            dismiss()
            if !isEdit {
                let id = r.id
                Task { @MainActor in
                    try? await Task.sleep(for: .milliseconds(400))
                    router.open(.event(id: id))
                }
            }
        } catch let e as APIError {
            fields = e.fields ?? [:]
            app.show(error: e)
        } catch {
            app.show(error: error)
        }
    }
}

// MARK: - Zum Kalender

/// Systemdialog „Ereignis hinzufügen“ (seit iOS 17 ohne Kalenderfreigabe nutzbar).
struct EventCalendarSheet: UIViewControllerRepresentable {
    var event: CommunityEventDetail
    var onDone: () -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onDone: onDone) }

    func makeUIViewController(context: Context) -> EKEventEditViewController {
        let store = EKEventStore()
        let ev = EKEvent(eventStore: store)
        ev.title = event.title
        ev.startDate = event.startsAt
        ev.endDate = event.endsAt
        let web = AppConfig.webURL(event.href ?? "/c/\(event.community.slug)/events/\(event.id)")
        ev.url = web
        if event.isOnline {
            ev.location = event.onlineUrl?.nilIfEmpty ?? "Online"
        } else {
            ev.location = [event.locationName, event.address].compactMap { $0?.nilIfEmpty }.joined(separator: ", ")
        }
        ev.notes = [event.description?.nilIfEmpty, "\(event.community.name) · \(web.absoluteString)"].compactMap { $0 }.joined(separator: "\n\n")
        let vc = EKEventEditViewController()
        vc.eventStore = store
        vc.event = ev
        vc.editViewDelegate = context.coordinator
        return vc
    }

    func updateUIViewController(_ uiViewController: EKEventEditViewController, context: Context) {}

    final class Coordinator: NSObject, EKEventEditViewDelegate {
        let onDone: () -> Void
        init(onDone: @escaping () -> Void) { self.onDone = onDone }
        func eventEditViewController(_ controller: EKEventEditViewController, didCompleteWith action: EKEventEditViewAction) {
            onDone()
        }
    }
}
