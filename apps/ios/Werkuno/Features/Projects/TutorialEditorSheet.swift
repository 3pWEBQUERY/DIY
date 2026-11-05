import SwiftUI

/// Anleitung schreiben oder bearbeiten – Überblick, Material, Schritte, Freigabe.
/// Bearbeiten `GET /tutorials/:id/edit`, Vorlage `GET /tutorials/seed/:projectId`,
/// Speichern `POST /tutorials` bzw. `PUT /tutorials/:id` mit `{ input, publish }`.
struct TutorialEditorSheet: View {
    var id: String? = nil
    var seedProjectId: String? = nil

    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @Environment(\.dismiss) private var dismiss

    @State private var loading = true
    @State private var didLoad = false
    @State private var loadError: String?
    @State private var tutorialId: String?
    @State private var originalSlug: String?
    @State private var state: String?
    @State private var currentVersion: Int?
    @State private var projectOptions: [IdTitle] = []
    @State private var section = 0
    @State private var saving = false
    @State private var errors = ProjectsFieldErrors()
    @State private var confirmDiscard = false
    @State private var editingStep: TutorialStepEditTarget?

    // Felder
    @State private var title = ""
    @State private var summary = ""
    @State private var category = ""
    @State private var difficulty = 2
    @State private var minutes: Int?
    @State private var projectId = ""
    @State private var coverId: String?
    @State private var coverPreview: String?
    @State private var materials: [ProjectsLineDraft] = []
    @State private var tools: [ProjectsLineDraft] = []
    @State private var steps: [TutorialStepDraft] = []
    @State private var changeNote = ""
    @State private var isMajor = false
    @State private var notifyReaders = false
    @State private var shareToFeed = false
    @State private var durationSeed = 0

    private let sections = ["Überblick", "Material", "Schritte", "Freigabe"]
    private var isEdit: Bool { id != nil }
    private var uploading: Bool { steps.contains { $0.media.isUploading } }

    var body: some View {
        NavigationStack {
            Group {
                if loading {
                    LoadingView(text: "Anleitung wird vorbereitet …").frame(maxHeight: .infinity)
                } else if let loadError {
                    ErrorStateView(message: loadError) { await load() }
                } else {
                    editor
                }
            }
            .background(Color.paper)
            .navigationTitle(isEdit ? "Anleitung bearbeiten" : "Neue Anleitung")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { if !title.isEmpty || steps.contains(where: { !$0.title.isEmpty }) { confirmDiscard = true } else { dismiss() } }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Entwurf") { Task { await save(publish: false) } }
                        .disabled(saving || loading || uploading)
                        .accessibilityLabel("Entwurf speichern")
                }
            }
            .confirmationDialog("Änderungen verwerfen?", isPresented: $confirmDiscard, titleVisibility: .visible) {
                Button("Verwerfen", role: .destructive) { dismiss() }
                Button("Weiter bearbeiten", role: .cancel) {}
            }
            .sheet(item: $editingStep) { target in
                if let b = stepBinding(target.id) {
                    TutorialStepEditor(step: b, number: (steps.firstIndex { $0.id == target.id } ?? 0) + 1, materialNames: materials.cleaned.map(\.name), toolNames: tools.cleaned.map(\.name))
                        .environment(app)
                }
            }
        }
        .interactiveDismissDisabled(!title.isEmpty)
        .task { if !didLoad { await load() } }
    }

    // MARK: - Editor

    private var editor: some View {
        VStack(spacing: 0) {
            ProjectsStepThread(steps: sections, current: section, errorSteps: errorSections) { i in withAnimation(.snappy) { section = i } }
                .padding(.horizontal, Space.gutter)
                .padding(.top, 6)
                .padding(.bottom, 10)
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 26) {
                        Color.clear.frame(height: 0).id("top")
                        switch section {
                        case 0: overview
                        case 1: materialSection
                        case 2: stepsSection
                        default: releaseSection
                        }
                        if let general = errors.fields["_"] { NoticeView(tone: .danger, message: general) }
                    }
                    .padding(.horizontal, Space.gutter)
                    .padding(.top, 8)
                    .padding(.bottom, 24)
                    .id(section)
                    .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity), removal: .opacity))
                }
                .scrollDismissesKeyboard(.interactively)
                .onChange(of: section) { _, _ in proxy.scrollTo("top", anchor: .top) }
            }
        }
        .safeAreaInset(edge: .bottom) { bottomBar }
    }

    private var bottomBar: some View {
        ProjectsEditorBar {
            if section > 0 {
                Button { withAnimation(.snappy) { section -= 1 } } label: {
                    Image(systemName: "chevron.left").font(.wr(.body, .semibold)).frame(width: 30, height: 30)
                }
                .buttonStyle(.glass)
                .buttonBorderShape(.circle)
                .controlSize(.large)
                .accessibilityLabel("Zurück zu \(sections[section - 1])")
            }
            if section < sections.count - 1 {
                Button { withAnimation(.snappy) { section += 1 } } label: {
                    Label("Weiter: \(sections[section + 1])", systemImage: "arrow.right").labelStyle(ProjectsTrailingIconLabelStyle())
                }
                .primaryButton()
            } else {
                AsyncButton { await save(publish: false) } label: { Text("Entwurf speichern") }
                    .font(.wr(.body, .semibold))
                    .buttonStyle(.glass)
                    .controlSize(.large)
                    .disabled(saving || uploading)
                AsyncButton { await save(publish: true) } label: {
                    Label(currentVersion == nil ? "Veröffentlichen" : "Version \((currentVersion ?? 0) + 1)", systemImage: "paperplane.fill")
                }
                .primaryButton()
                .disabled(saving || uploading)
            }
        }
    }

    private var errorSections: Set<Int> { Set(errors.fields.keys.map(sectionFor)) }

    private func sectionFor(_ key: String) -> Int {
        let root = key.split(separator: ".").first.map(String.init) ?? key
        switch root {
        case "materials", "tools": return 1
        case "steps": return 2
        case "changeNote", "isMajor", "notifyReaders", "shareToFeed": return 3
        default: return 0
        }
    }

    // MARK: 1 Überblick

    private var overview: some View {
        VStack(alignment: .leading, spacing: 24) {
            ProjectsField(label: "Titel", error: errors["title"], trailing: "\(title.count)/140") {
                TextField("Was baut man mit deiner Anleitung?", text: $title, axis: .vertical)
                    .font(.wr(.title3, .semibold))
                    .lineLimit(1...3)
                    .projectsInput(error: errors["title"] != nil)
            }
            ProjectsField(label: "Zusammenfassung", hint: "Worum geht es, für wen ist es geeignet, was kommt am Ende heraus?", error: errors["summary"], trailing: summary.isEmpty ? nil : "\(summary.count)/2000") {
                TextField("In zwei, drei Sätzen …", text: $summary, axis: .vertical)
                    .lineLimit(3...8)
                    .projectsInput(error: errors["summary"] != nil)
            }
            ProjectsField(label: "Kategorie", error: errors["category"]) {
                ProjectsCategoryPicker(selection: $category)
            }
            ProjectsField(label: "Schwierigkeit", error: errors["difficulty"]) {
                ProjectsDifficultyPicker(level: $difficulty).padding(14).cardSurface()
            }
            ProjectsField(label: "Gesamtdauer", hint: "Leer lassen, um die Minuten der Schritte zu summieren (\(Fmt.minutes(steps.reduce(0) { $0 + ($1.minutes ?? 0) }))).", error: errors["minutes"]) {
                ProjectsDurationField(minutes: $minutes).id("min-\(durationSeed)")
            }
            ProjectsField(label: "Verknüpftes Projekt", hint: "Leser:innen sehen dein Projekt als Beispiel – und können es nachbauen.", error: errors["projectId"]) {
                Menu {
                    Picker("Projekt", selection: $projectId) {
                        Text("Kein Projekt").tag("")
                        ForEach(projectOptions) { o in Text(o.title).tag(o.id) }
                    }
                } label: {
                    HStack {
                        Image(systemName: "point.3.connected.trianglepath.dotted").foregroundStyle(Color.moss)
                        Text(projectOptions.first { $0.id == projectId }?.title ?? "Kein Projekt").foregroundStyle(Color.ink).lineLimit(1)
                        Spacer()
                        Image(systemName: "chevron.up.chevron.down").font(.wr(.caption)).foregroundStyle(Color.muted)
                    }
                    .projectsInput()
                }
            }
            ProjectsField(label: "Titelbild", error: errors["coverMediaId"]) {
                HStack(spacing: 14) {
                    SingleImagePicker(onUploaded: { id, url in coverId = id; coverPreview = url }) {
                        CoverView(url: coverPreview, seed: tutorialId ?? title.nilIfEmpty ?? "neu", category: category.nilIfEmpty, showLabel: false)
                            .frame(width: 120, height: 90)
                            .clipShape(.rect(cornerRadius: Radius.inner, style: .continuous))
                            .overlay(alignment: .bottomTrailing) {
                                Image(systemName: "camera.fill").font(.wr(.caption)).foregroundStyle(Color.paper).padding(6).background(Color.ink.opacity(0.7), in: Circle()).padding(6)
                            }
                    }
                    .accessibilityLabel(coverId == nil ? "Titelbild wählen" : "Titelbild ändern")
                    VStack(alignment: .leading, spacing: 6) {
                        Text(coverId == nil ? "Ohne Titelbild zeigen wir eine Faden-Tafel." : "Titelbild gesetzt.").font(.wr(.footnote)).foregroundStyle(Color.muted)
                        if coverId != nil {
                            Button("Entfernen", role: .destructive) { coverId = nil; coverPreview = nil }.font(.wr(.footnote, .semibold))
                        }
                    }
                }
            }
        }
    }

    // MARK: 2 Material

    private var materialSection: some View {
        VStack(alignment: .leading, spacing: 26) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Material & Werkzeug").font(.headlineSerif)
                Text("Die Liste erscheint in der Übersicht – Leser:innen können sie direkt auf eine Einkaufsliste setzen. In jedem Schritt kannst du daraus auswählen.")
                    .font(.wr(.subheadline)).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
            }
            VStack(alignment: .leading, spacing: 10) {
                SectionHeader("Material")
                ProjectsLineEditor(lines: $materials, kind: .material, errorPrefix: "materials", errors: errors)
            }
            VStack(alignment: .leading, spacing: 10) {
                SectionHeader("Werkzeug")
                ProjectsLineEditor(lines: $tools, kind: .tool, errorPrefix: "tools", errors: errors)
            }
        }
    }

    // MARK: 3 Schritte

    private var stepsSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Schritte").font(.headlineSerif)
                Text("Ein Schritt = eine Tätigkeit. Tippe auf einen Schritt, um Text, Bilder, Tipp und Sicherheitshinweise zu bearbeiten.")
                    .font(.wr(.subheadline)).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
            }
            if let e = errors.fields["steps"] { Text(e).font(.wr(.caption)).foregroundStyle(Color.danger) }
            VStack(spacing: 0) {
                ForEach(Array(steps.enumerated()), id: \.element.id) { i, s in
                    stepRow(s, index: i)
                }
            }
            Button {
                let s = TutorialStepDraft()
                withAnimation(.snappy) { steps.append(s) }
                editingStep = TutorialStepEditTarget(id: s.id)
            } label: {
                Label("Schritt hinzufügen", systemImage: "plus")
                    .font(.wr(.subheadline, .semibold))
                    .foregroundStyle(Color.moss)
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .background(Color.mossSoft.opacity(0.6), in: .rect(cornerRadius: Radius.inner, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: Radius.inner, style: .continuous).strokeBorder(Color.moss.opacity(0.35), style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
            }
            .buttonStyle(.pressable)
            .disabled(steps.count >= 80)
        }
    }

    private func stepRow(_ s: TutorialStepDraft, index i: Int) -> some View {
        let err = errors["steps.\(i)"]
        return HStack(alignment: .top, spacing: 14) {
            ZStack {
                Circle().fill(err == nil ? Color.ink : Color.danger).frame(width: 28, height: 28)
                Text("\(i + 1)").font(.wr(size: 12, weight: .bold)).foregroundStyle(Color.paper)
            }
            .frame(width: 28)
            Button { editingStep = TutorialStepEditTarget(id: s.id) } label: {
                VStack(alignment: .leading, spacing: 5) {
                    Text(s.title.nilIfEmpty ?? "Ohne Titel").font(.wr(.subheadline, .semibold)).foregroundStyle(s.title.isEmpty ? Color.muted : Color.ink).multilineTextAlignment(.leading)
                    if let b = s.body.nilIfEmpty { Text(b).font(.wr(.footnote)).foregroundStyle(Color.muted).lineLimit(2).multilineTextAlignment(.leading) }
                    HStack(spacing: 10) {
                        if let m = s.minutes, m > 0 { Label(Fmt.minutes(m), systemImage: "clock").labelStyle(.compact) }
                        if !s.media.isEmpty { Label("\(s.media.count)", systemImage: "photo").labelStyle(.compact) }
                        if s.tip.nilIfEmpty != nil { Label("Tipp", systemImage: "lightbulb").labelStyle(.compact) }
                        if s.safety.nilIfEmpty != nil || !s.safetyKinds.isEmpty { Label("Sicherheit", systemImage: "exclamationmark.triangle.fill").labelStyle(.compact).foregroundStyle(Color.danger) }
                        if s.stableKey != nil { Image(systemName: "link").accessibilityLabel("Fortschritt bleibt erhalten") }
                    }
                    .font(.wr(.caption2)).foregroundStyle(Color.muted)
                    if let err { Text(err).font(.wr(.caption)).foregroundStyle(Color.danger) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(.rect)
            }
            .buttonStyle(.pressable)
            Menu {
                Button("Bearbeiten", systemImage: "pencil") { editingStep = TutorialStepEditTarget(id: s.id) }
                if i > 0 { Button("Nach oben", systemImage: "arrow.up") { withAnimation(.snappy) { steps.swapAt(i, i - 1) } } }
                if i < steps.count - 1 { Button("Nach unten", systemImage: "arrow.down") { withAnimation(.snappy) { steps.swapAt(i, i + 1) } } }
                Button("Duplizieren", systemImage: "plus.square.on.square") {
                    var c = s
                    c.id = UUID().uuidString
                    c.stableKey = nil
                    withAnimation(.snappy) { steps.insert(c, at: i + 1) }
                }
                Divider()
                Button("Löschen", systemImage: "trash", role: .destructive) { withAnimation(.snappy) { steps.removeAll { $0.id == s.id } } }
            } label: {
                Image(systemName: "ellipsis").font(.wr(.subheadline, .semibold)).foregroundStyle(Color.muted).frame(width: 36, height: 36).contentShape(.rect)
            }
            .accessibilityLabel("Aktionen für Schritt \(i + 1)")
        }
        .padding(.vertical, 14)
        .background(alignment: .topLeading) {
            if i < steps.count - 1 { Rectangle().fill(Color.lineStrong).frame(width: 1.5).padding(.leading, 13.25).padding(.top, 42) }
        }
        .accessibilityElement(children: .contain)
    }

    private func stepBinding(_ id: String) -> Binding<TutorialStepDraft>? {
        guard steps.contains(where: { $0.id == id }) else { return nil }
        return Binding(
            get: { steps.first { $0.id == id } ?? TutorialStepDraft() },
            set: { v in if let i = steps.firstIndex(where: { $0.id == id }) { steps[i] = v } }
        )
    }

    // MARK: 4 Freigabe

    private var releaseSection: some View {
        VStack(alignment: .leading, spacing: 22) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Freigabe").font(.headlineSerif)
                Text(currentVersion.map { "Veröffentlicht ist Version \($0). Beim Veröffentlichen entsteht Version \($0 + 1) – der Fortschritt deiner Leser:innen bleibt bei unveränderten Schritten erhalten." } ?? "Noch nicht veröffentlicht. Ein Entwurf ist nur für dich sichtbar; beim Veröffentlichen entsteht Version 1.")
                    .font(.wr(.subheadline)).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
            }

            VStack(alignment: .leading, spacing: 0) {
                SpecRow(label: "Schritte", value: "\(steps.count)", symbol: "list.number")
                SpecRow(label: "Material", value: "\(materials.cleaned.count)", symbol: "shippingbox")
                SpecRow(label: "Werkzeug", value: "\(tools.cleaned.count)", symbol: "wrench.and.screwdriver")
                SpecRow(label: "Dauer", value: Fmt.minutes(minutes ?? steps.reduce(0) { $0 + ($1.minutes ?? 0) }), symbol: "clock")
                let kinds = Set(steps.flatMap(\.safetyKinds))
                SpecRow(label: "Sicherheit", value: kinds.isEmpty ? "–" : L.safety.filter { kinds.contains($0.key) }.map(\.label).joined(separator: ", "), symbol: "exclamationmark.triangle")
            }

            if currentVersion != nil {
                ProjectsField(label: "Änderungshinweis", hint: "Erscheint über der Anleitung, z. B. «Schritt 3 präzisiert, neues Foto».", error: errors["changeNote"], trailing: changeNote.isEmpty ? nil : "\(changeNote.count)/500") {
                    TextField("Was hat sich geändert?", text: $changeNote, axis: .vertical)
                        .lineLimit(2...4)
                        .projectsInput(error: errors["changeNote"] != nil)
                }
                VStack(alignment: .leading, spacing: 14) {
                    Toggle(isOn: $isMajor.animation(.snappy)) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Grössere Änderung").font(.wr(.subheadline, .semibold))
                            Text("Z. B. andere Masse, Materialien oder Reihenfolge.").font(.wr(.caption)).foregroundStyle(Color.muted)
                        }
                    }
                    .tint(.clay)
                    if isMajor {
                        Toggle(isOn: $notifyReaders) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Leser:innen benachrichtigen").font(.wr(.subheadline, .semibold))
                                Text("Alle, die gerade nachbauen, erhalten einen Hinweis.").font(.wr(.caption)).foregroundStyle(Color.muted)
                            }
                        }
                        .tint(.moss)
                    }
                }
                .padding(16)
                .cardSurface()
            } else {
                ProjectsField(label: "Notiz zur Version (optional)", error: errors["changeNote"]) {
                    TextField("Erste Veröffentlichung", text: $changeNote).projectsInput(error: errors["changeNote"] != nil)
                }
            }

            Toggle(isOn: $shareToFeed) {
                Label { VStack(alignment: .leading, spacing: 2) {
                    Text("Im Feed teilen").font(.wr(.subheadline, .semibold))
                    Text("Beim Veröffentlichen entsteht ein Beitrag für deine Follower.").font(.wr(.caption)).foregroundStyle(Color.muted)
                } } icon: { Image(systemName: "bubble.left.and.text.bubble.right").foregroundStyle(Color.moss) }
            }
            .tint(.moss)
            .padding(16)
            .cardSurface()

            if state == "PUBLISHED" {
                NoticeView(tone: .info, message: "«Entwurf speichern» ändert die öffentliche Version nicht. Erst «Veröffentlichen» macht deine Änderungen sichtbar.")
            }
        }
    }

    // MARK: - Laden

    private func load() async {
        loading = true
        loadError = nil
        defer { loading = false; if loadError == nil { didLoad = true } }
        do {
            if let id {
                let d: TutorialEditData = try await APIClient.shared.get("/tutorials/\(id)/edit")
                guard let tid = d.id, let v = d.values else { loadError = "Diese Anleitung kannst du nicht bearbeiten."; return }
                tutorialId = tid
                originalSlug = d.slug
                state = d.state
                currentVersion = d.currentVersion
                projectOptions = d.projectOptions ?? []
                apply(v)
            } else {
                async let opts: [IdTitle] = APIClient.shared.get("/me/project-options")
                if let seedProjectId {
                    let v: TutorialEditValues = try await APIClient.shared.get("/tutorials/seed/\(seedProjectId)")
                    apply(v)
                }
                projectOptions = (try? await opts) ?? []
                if category.isEmpty { category = app.me?.profile?.categories?.first(where: { c in app.activeCategories.contains { $0.slug == c } }) ?? "" }
                if steps.isEmpty { steps = [TutorialStepDraft()] }
            }
        } catch is CancellationError {
        } catch {
            loadError = (error as? APIError)?.message ?? error.localizedDescription
        }
    }

    private func apply(_ v: TutorialEditValues) {
        title = v.title
        summary = v.summary ?? ""
        category = v.category
        difficulty = v.difficulty ?? 2
        minutes = v.minutes
        projectId = v.projectId ?? ""
        coverId = v.cover?.id
        coverPreview = v.cover?.preview?.nilIfEmpty
        materials = (v.materials ?? []).map(ProjectsLineDraft.init)
        tools = (v.tools ?? []).map(ProjectsLineDraft.init)
        steps = (v.steps ?? []).map(TutorialStepDraft.init)
        durationSeed += 1
    }

    // MARK: - Speichern

    private func validate(publish: Bool) -> Bool {
        var f: [String: String] = [:]
        if title.trimmed.count < 3 { f["title"] = "Mindestens 3 Zeichen" }
        if category.isEmpty { f["category"] = "Bitte wähle eine Kategorie" }
        let filled = steps.filter { !$0.isBlank }
        if filled.isEmpty { f["steps"] = "Mindestens ein Schritt" }
        for (i, s) in steps.enumerated() where !s.isBlank && s.title.trimmed.isEmpty {
            f["steps.\(i).title"] = "Jeder Schritt braucht einen Titel"
        }
        errors.fields = f
        if let first = f.keys.map(sectionFor).min() { withAnimation(.snappy) { section = first } }
        return f.isEmpty
    }

    private func save(publish: Bool) async {
        guard !saving, !uploading else { return }
        // Leere Schritte am Ende ignorieren
        let nonBlank = steps.filter { !$0.isBlank }
        if !nonBlank.isEmpty && nonBlank.count != steps.count { steps = nonBlank }
        guard validate(publish: publish) else { Haptics.warning(); return }
        saving = true
        defer { saving = false }

        var input: [String: JSONValue] = [
            "title": .string(title.trimmed),
            "summary": .string(summary.trimmed),
            "category": .string(category),
            "difficulty": .number(Double(difficulty)),
            "language": "de-CH",
            "materials": materials.cleaned.json,
            "tools": tools.cleaned.json,
            "steps": .array(steps.map(\.json)),
            "isMajor": .bool(currentVersion != nil && isMajor),
            "notifyReaders": .bool(currentVersion != nil && isMajor && notifyReaders),
            "shareToFeed": .bool(publish && shareToFeed),
        ]
        if let m = minutes { input["minutes"] = .number(Double(m)) }
        if let p = projectId.nilIfEmpty { input["projectId"] = .string(p) }
        if let c = coverId { input["coverMediaId"] = .string(c) }
        if let n = changeNote.nilIfEmpty { input["changeNote"] = .string(n.trimmed) }
        let body: [String: JSONValue] = ["input": .object(input), "publish": .bool(publish)]

        do {
            let r: TutorialSaveResult
            if let tid = tutorialId, isEdit {
                r = try await APIClient.shared.put("/tutorials/\(tid)", body)
            } else {
                r = try await APIClient.shared.post("/tutorials", body)
            }
            Haptics.success()
            app.show(publish ? (r.version.map { $0 == 1 ? "Anleitung veröffentlicht." : "Version \($0) veröffentlicht." } ?? "Anleitung veröffentlicht.") : "Entwurf gespeichert.")
            dismiss()
            if !isEdit || r.slug != originalSlug {
                try? await Task.sleep(for: .milliseconds(350))
                router.open(.tutorial(slug: r.slug))
            }
        } catch let e as APIError {
            errors.fields = e.fields ?? [:]
            if let first = errors.fields.keys.map(sectionFor).min() { withAnimation(.snappy) { section = first } }
            if e.fields?.isEmpty ?? true { app.show(error: e) } else { Haptics.warning() }
        } catch {
            app.show(error: error)
        }
    }
}

// MARK: - Schritt-Entwurf

struct TutorialStepDraft: Identifiable, Hashable {
    var id = UUID().uuidString
    /// Bleibt beim Bearbeiten erhalten, damit der Lesefortschritt über Versionen erhalten bleibt.
    var stableKey: String?
    var title = ""
    var body = ""
    var minutes: Int?
    var tip = ""
    var safety = ""
    var safetyKinds: [String] = []
    var media: [DraftMedia] = []
    var materials: [String] = []
    var tools: [String] = []

    init() {}

    init(_ s: TutorialEditValues.Step) {
        stableKey = s.stableKey?.nilIfEmpty
        title = s.title
        body = s.body ?? ""
        minutes = s.minutes
        tip = s.tip ?? ""
        safety = s.safety ?? ""
        safetyKinds = s.safetyKinds ?? []
        media = (s.media ?? []).map { DraftMedia.existing(id: $0.id, url: $0.preview?.nilIfEmpty, alt: $0.alt) }
        materials = s.materials ?? []
        tools = s.tools ?? []
    }

    var isBlank: Bool { title.trimmed.isEmpty && body.trimmed.isEmpty && media.isEmpty && tip.trimmed.isEmpty && safety.trimmed.isEmpty }

    var json: JSONValue {
        var o: [String: JSONValue] = [
            "title": .string(title.trimmed),
            "body": .string(body.trimmed),
            "safetyKinds": .from(safetyKinds),
            "media": media.refsJSON,
            "materials": .from(materials.map(\.trimmed).filter { !$0.isEmpty }),
            "tools": .from(tools.map(\.trimmed).filter { !$0.isEmpty }),
        ]
        if let k = stableKey { o["stableKey"] = .string(k) }
        if let m = minutes { o["minutes"] = .number(Double(m)) }
        if let t = tip.nilIfEmpty { o["tip"] = .string(t.trimmed) }
        if let s = safety.nilIfEmpty { o["safety"] = .string(s.trimmed) }
        return .object(o)
    }
}

struct TutorialStepEditTarget: Identifiable, Hashable { var id: String }

// MARK: - Schritt bearbeiten

struct TutorialStepEditor: View {
    @Binding var step: TutorialStepDraft
    var number: Int
    var materialNames: [String]
    var toolNames: [String]

    @Environment(\.dismiss) private var dismiss
    @State private var customMaterial = ""
    @State private var customTool = ""
    @FocusState private var titleFocused: Bool

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        Text(String(format: "%02d", number)).font(.wr(size: 44, weight: .semibold)).foregroundStyle(Color.moss).accessibilityHidden(true)
                        SpecLabel("Schritt \(number)")
                    }
                    ProjectsField(label: "Titel", trailing: "\(step.title.count)/140") {
                        TextField("z. B. Boden in Runden zunehmen", text: $step.title, axis: .vertical)
                            .font(.wr(.title3, .semibold))
                            .lineLimit(1...3)
                            .focused($titleFocused)
                            .projectsInput()
                    }
                    ProjectsField(label: "Anleitungstext", hint: "Kurze Sätze, eine Tätigkeit. Masse und Zahlen helfen beim Nachbauen.") {
                        TextField("Beschreibe, was in diesem Schritt zu tun ist …", text: $step.body, axis: .vertical)
                            .lineLimit(5...16)
                            .projectsInput()
                    }
                    MediaPickerField(items: $step.media, maxCount: 6, title: "Bilder zum Schritt")
                    ProjectsField(label: "Dauer") {
                        ProjectsDurationField(minutes: $step.minutes)
                    }
                    ProjectsField(label: "Tipp aus der Werkstatt") {
                        TextField("Was hilft dir dabei? (optional)", text: $step.tip, axis: .vertical)
                            .lineLimit(2...6)
                            .projectsInput()
                    }

                    VStack(alignment: .leading, spacing: 14) {
                        HStack(spacing: 8) {
                            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(Color.danger)
                            SpecLabel("Sicherheit", color: .danger)
                        }
                        FlowLayout(spacing: 8, lineSpacing: 8) {
                            ForEach(L.safety, id: \.key) { s in
                                let on = step.safetyKinds.contains(s.key)
                                Button {
                                    Haptics.selection()
                                    withAnimation(.snappy) {
                                        if on { step.safetyKinds.removeAll { $0 == s.key } } else { step.safetyKinds.append(s.key) }
                                    }
                                } label: {
                                    Label(s.label, systemImage: s.symbol)
                                        .font(.wr(.footnote).weight(on ? .semibold : .regular))
                                        .foregroundStyle(on ? Color.paper : Color.danger)
                                        .padding(.horizontal, 11).padding(.vertical, 8)
                                        .background(on ? Color.danger : Color.danger.opacity(0.08), in: Capsule())
                                        .frame(minHeight: 44)
                                        .contentShape(Capsule())
                                }
                                .buttonStyle(.pressable)
                                .accessibilityAddTraits(on ? .isSelected : [])
                            }
                        }
                        TextField("Sicherheitswarnung, z. B. «Lötkolben wird über 300 °C heiss.»", text: $step.safety, axis: .vertical)
                            .lineLimit(2...5)
                            .projectsInput()
                    }
                    .padding(16)
                    .background(Color.danger.opacity(0.05), in: .rect(cornerRadius: Radius.card, style: .continuous))

                    pickList(title: "Material in diesem Schritt", options: materialNames, selection: $step.materials, custom: $customMaterial, placeholder: "Weiteres Material")
                    pickList(title: "Werkzeug in diesem Schritt", options: toolNames, selection: $step.tools, custom: $customTool, placeholder: "Weiteres Werkzeug")
                }
                .padding(.horizontal, Space.gutter)
                .padding(.vertical, 16)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Color.paper)
            .navigationTitle("Schritt \(number)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Fertig") { dismiss() }.disabled(step.media.isUploading)
                }
            }
            .onAppear { if step.title.isEmpty { titleFocused = true } }
        }
        .interactiveDismissDisabled(step.media.isUploading)
        .toastOverlay()
    }

    private func pickList(title: String, options: [String], selection: Binding<[String]>, custom: Binding<String>, placeholder: String) -> some View {
        let all = Array(NSOrderedSet(array: options + selection.wrappedValue)) as? [String] ?? options
        return VStack(alignment: .leading, spacing: 10) {
            SpecLabel(title)
            if !all.isEmpty {
                FlowLayout(spacing: 8, lineSpacing: 8) {
                    ForEach(all, id: \.self) { name in
                        let on = selection.wrappedValue.contains(name)
                        Button {
                            Haptics.selection()
                            if on { selection.wrappedValue.removeAll { $0 == name } } else { selection.wrappedValue.append(name) }
                        } label: {
                            HStack(spacing: 5) {
                                Image(systemName: on ? "checkmark" : "plus").font(.wr(.caption2, .bold))
                                Text(name).font(.wr(.footnote).weight(on ? .semibold : .regular))
                            }
                            .foregroundStyle(on ? Color.paper : Color.ink)
                            .padding(.horizontal, 11).padding(.vertical, 8)
                            .background(on ? Color.moss : Color.sunken, in: Capsule())
                            .frame(minHeight: 40)
                            .contentShape(Capsule())
                        }
                        .buttonStyle(.pressable)
                        .accessibilityAddTraits(on ? .isSelected : [])
                    }
                }
            }
            HStack {
                TextField(placeholder, text: custom)
                    .submitLabel(.done)
                    .onSubmit { addCustom(custom, to: selection) }
                if !custom.wrappedValue.trimmed.isEmpty {
                    Button("Hinzufügen") { addCustom(custom, to: selection) }.font(.wr(.footnote, .semibold)).foregroundStyle(Color.moss)
                }
            }
            .projectsInput()
        }
    }

    private func addCustom(_ custom: Binding<String>, to selection: Binding<[String]>) {
        let v = String(custom.wrappedValue.trimmed.prefix(120))
        guard !v.isEmpty, selection.wrappedValue.count < 20 else { return }
        if !selection.wrappedValue.contains(v) { selection.wrappedValue.append(v) }
        custom.wrappedValue = ""
    }
}
