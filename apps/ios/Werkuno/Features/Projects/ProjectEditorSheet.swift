import SwiftUI

/// Projekt anlegen, bearbeiten oder nachbauen – in vier klaren Etappen entlang des Fadens.
/// Neu `POST /projects` · Bearbeiten `GET /projects/by/:handle/:slug/edit` → `PUT /projects/:id`
/// Nachbau `GET /projects/remix-source/:id` (Vorbelegung, `remixOfId`, `remixNote`)
struct ProjectEditorSheet: View {
    var handle: String? = nil
    var slug: String? = nil
    var remixOf: String? = nil

    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @Environment(\.dismiss) private var dismiss

    // Zustand
    @State private var loading = true
    @State private var didLoad = false
    @State private var loadError: String?
    @State private var projectId: String?
    @State private var step = 0
    @State private var saving = false
    @State private var errors = ProjectsFieldErrors()
    @State private var confirmDiscard = false

    // Felder
    @State private var title = ""
    @State private var summary = ""
    @State private var category = ""
    @State private var tags: [String] = []
    @State private var status = "IN_PROGRESS"
    @State private var visibility = "PUBLIC"
    @State private var difficulty = 2
    @State private var estimatedMinutes: Int?
    @State private var actualMinutes: Int?
    @State private var budget = ""
    @State private var media: [DraftMedia] = []
    @State private var materials: [ProjectsLineDraft] = []
    @State private var tools: [ProjectsLineDraft] = []
    @State private var remixNote = ""
    @State private var remixTitle: String?
    @State private var remixOwner: String?
    @State private var remixSourceId: String?
    @State private var durationSeed = 0

    @FocusState private var titleFocused: Bool

    private var isEdit: Bool { handle != nil && slug != nil }
    private var isRemix: Bool { remixSourceId != nil }
    private let steps: [(title: String, symbol: String)] = [("Idee", "lightbulb"), ("Bilder", "photo.on.rectangle"), ("Stand", "gauge.with.dots.needle.33percent"), ("Material", "list.bullet.rectangle")]

    var body: some View {
        NavigationStack {
            Group {
                if loading {
                    LoadingView(text: isEdit ? "Projekt wird geladen …" : "Vorlage wird vorbereitet …").frame(maxHeight: .infinity)
                } else if let loadError {
                    ErrorStateView(message: loadError) { await load() }
                } else {
                    editor
                }
            }
            .background(Color.paper)
            .navigationTitle(isEdit ? "Projekt bearbeiten" : isRemix ? "Nachbau starten" : "Neues Projekt")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { if hasContent { confirmDiscard = true } else { dismiss() } }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isEdit ? "Sichern" : "Anlegen") { Task { await save() } }
                        .disabled(saving || loading || media.isUploading)
                }
            }
            .confirmationDialog("Änderungen verwerfen?", isPresented: $confirmDiscard, titleVisibility: .visible) {
                Button("Verwerfen", role: .destructive) { dismiss() }
                Button("Weiter bearbeiten", role: .cancel) {}
            }
        }
        .interactiveDismissDisabled(hasContent)
        .task { if !didLoad { await load() } }
    }

    private var hasContent: Bool { !title.isEmpty || !summary.isEmpty || !media.isEmpty }

    // MARK: - Editor

    private var editor: some View {
        VStack(spacing: 0) {
            ProjectsStepThread(steps: steps.map(\.title), current: step, errorSteps: errorSteps) { i in
                withAnimation(.snappy) { step = i }
            }
            .padding(.horizontal, Space.gutter)
            .padding(.top, 6)
            .padding(.bottom, 10)

            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 26) {
                        Color.clear.frame(height: 0).id("top")
                        switch step {
                        case 0: ideaStep
                        case 1: mediaStep
                        case 2: stateStep
                        default: materialStep
                        }
                        if let general = errors.fields["_"] { NoticeView(tone: .danger, message: general) }
                    }
                    .padding(.horizontal, Space.gutter)
                    .padding(.top, 8)
                    .padding(.bottom, 24)
                    .id(step)
                    .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity), removal: .opacity))
                }
                .scrollDismissesKeyboard(.interactively)
                .onChange(of: step) { _, _ in proxy.scrollTo("top", anchor: .top) }
            }
        }
        .safeAreaInset(edge: .bottom) { bottomBar }
    }

    private var bottomBar: some View {
        ProjectsEditorBar {
            if step > 0 {
                Button { withAnimation(.snappy) { step -= 1 } } label: {
                    Image(systemName: "chevron.left").font(.wr(.body, .semibold)).frame(width: 30, height: 30)
                }
                .buttonStyle(.glass)
                .controlSize(.large)
                .buttonBorderShape(.circle)
                .accessibilityLabel("Zurück zu \(steps[step - 1].title)")
            }
            if step < steps.count - 1 {
                Button { withAnimation(.snappy) { step += 1 } } label: {
                    Label("Weiter: \(steps[step + 1].title)", systemImage: "arrow.right")
                        .labelStyle(ProjectsTrailingIconLabelStyle())
                }
                .primaryButton()
            } else {
                AsyncButton { await save() } label: {
                    Label(isEdit ? "Änderungen sichern" : isRemix ? "Nachbau anlegen" : "Projekt anlegen", systemImage: "checkmark")
                }
                .primaryButton()
                .disabled(saving || media.isUploading)
            }
        }
    }

    private var errorSteps: Set<Int> {
        Set(errors.fields.keys.map(stepFor))
    }

    private func stepFor(_ key: String) -> Int {
        let root = key.split(separator: ".").first.map(String.init) ?? key
        switch root {
        case "media", "coverMediaId": return 1
        case "status", "visibility", "difficulty", "estimatedMinutes", "actualMinutes", "budgetMinor": return 2
        case "materials", "tools": return 3
        default: return 0
        }
    }

    // MARK: Etappe 1 – Idee

    private var ideaStep: some View {
        VStack(alignment: .leading, spacing: 24) {
            if isRemix {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 8) {
                        Image(systemName: "arrow.triangle.branch").foregroundStyle(Color.moss)
                        SpecLabel("Nachbau", color: .moss)
                    }
                    Text("Dein Projekt verweist auf «\(remixTitle ?? "das Original")»\(remixOwner.map { " von \($0)" } ?? ""). Texte und Bilder werden nicht kopiert – nur die Materialliste kannst du übernehmen.")
                        .font(.wr(.footnote)).foregroundStyle(Color.ink2).fixedSize(horizontal: false, vertical: true)
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.mossSoft, in: .rect(cornerRadius: Radius.inner, style: .continuous))
            }

            ProjectsField(label: "Titel", error: errors["title"], trailing: "\(title.count)/120") {
                TextField("Wie heisst dein Projekt?", text: $title, axis: .vertical)
                    .font(.wr(.title3, .semibold))
                    .lineLimit(1...3)
                    .focused($titleFocused)
                    .projectsInput(error: errors["title"] != nil)
            }

            ProjectsField(label: "Kategorie", error: errors["category"]) {
                ProjectsCategoryPicker(selection: $category)
            }

            ProjectsField(label: "Idee & Beschreibung", hint: "Was hat dich zu diesem Projekt gebracht? Was ist das Ziel?", error: errors["description"], trailing: summary.isEmpty ? nil : "\(summary.count)/10000") {
                TextField("Erzähl, worum es geht …", text: $summary, axis: .vertical)
                    .lineLimit(4...12)
                    .projectsInput(error: errors["description"] != nil)
            }

            ProjectsField(label: "Schlagwörter", hint: "Mit Enter oder Komma hinzufügen. Höchstens 12.", error: errors["tags"], trailing: "\(tags.count)/12") {
                ProjectsTagField(tags: $tags)
            }

            if isRemix || !remixNote.isEmpty {
                ProjectsField(label: "Abweichungen zum Original", hint: "Was machst du anders? Material, Masse, Technik …", error: errors["remixNote"]) {
                    TextField("z. B. Robinie statt Arve, Sitzfläche dicker", text: $remixNote, axis: .vertical)
                        .lineLimit(2...6)
                        .projectsInput(error: errors["remixNote"] != nil)
                }
            }
        }
    }

    // MARK: Etappe 2 – Bilder

    private var mediaStep: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Galerie & Titelbild").font(.headlineSerif)
                Text("Zeig dein Projekt – Skizzen, Zwischenstände, das fertige Stück. Ohne Bilder bekommt es eine eigene Faden-Tafel.")
                    .font(.wr(.subheadline)).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
            }
            MediaPickerField(items: $media, maxCount: 30, title: "Bilder", coverHint: true)
            if let e = errors["media"] ?? errors["coverMediaId"] { Text(e).font(.wr(.caption)).foregroundStyle(Color.danger) }
            if media.isEmpty {
                ThreadPlate(seed: projectId ?? title.nilIfEmpty ?? "neu", category: category.nilIfEmpty, animated: true)
                    .frame(height: 180)
                    .clipShape(.rect(cornerRadius: Radius.card, style: .continuous))
                    .overlay(alignment: .bottomLeading) {
                        SpecLabel("Vorschau ohne Foto").padding(12)
                    }
            }
            Text("Tipp: Beschreibe jedes Bild mit einem Alt-Text – tippe dazu auf ein Bild.").font(.wr(.caption)).foregroundStyle(Color.muted)
        }
    }

    // MARK: Etappe 3 – Stand

    private var stateStep: some View {
        VStack(alignment: .leading, spacing: 26) {
            ProjectsField(label: "Status", error: errors["status"]) {
                ProjectsChoiceChips(items: L.projectStatus.map { (value: $0.key, label: $0.label, symbol: ProjectsStatusStyle.symbol($0.key)) }, selection: $status, tint: .moss)
            }
            ProjectsField(label: "Sichtbarkeit", hint: visibilityHint, error: errors["visibility"]) {
                ProjectsChoiceChips(items: L.visibility.map { (value: $0.key, label: $0.label, symbol: ProjectsStatusStyle.visibilitySymbol($0.key)) }, selection: $visibility)
            }
            ProjectsField(label: "Schwierigkeit", error: errors["difficulty"]) {
                ProjectsDifficultyPicker(level: $difficulty)
                    .padding(14)
                    .cardSurface()
            }
            ProjectsField(label: "Geschätzte Zeit", error: errors["estimatedMinutes"]) {
                ProjectsDurationField(minutes: $estimatedMinutes).id("est-\(durationSeed)")
            }
            ProjectsField(label: "Tatsächliche Zeit", hint: "Die Zeit aus dem Journal wird zusätzlich automatisch summiert.", error: errors["actualMinutes"]) {
                ProjectsDurationField(minutes: $actualMinutes).id("act-\(durationSeed)")
            }
            ProjectsField(label: "Budget", hint: "Ungefähre Materialkosten.", error: errors["budgetMinor"]) {
                HStack(spacing: 8) {
                    Text("CHF").font(.wr(.subheadline, .semibold)).foregroundStyle(Color.muted)
                    TextField("0.00", text: $budget).keyboardType(.decimalPad).monospacedDigit()
                }
                .projectsInput(error: errors["budgetMinor"] != nil)
            }
        }
    }

    private var visibilityHint: String {
        switch visibility {
        case "PRIVATE": "Nur du siehst das Projekt – ideal für frühe Ideen."
        case "FOLLOWERS": "Nur Menschen, die dir folgen, sehen das Projekt."
        default: "Alle sehen dein Projekt – auch ohne Anmeldung."
        }
    }

    // MARK: Etappe 4 – Material

    private var materialStep: some View {
        VStack(alignment: .leading, spacing: 26) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Material & Werkzeug").font(.headlineSerif)
                Text("Mit einer Materialliste können andere direkt eine Einkaufsliste erstellen. Bekannte Materialien schlagen wir dir beim Tippen vor.")
                    .font(.wr(.subheadline)).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
            }
            VStack(alignment: .leading, spacing: 10) {
                SectionHeader("Material", subtitle: materials.isEmpty ? nil : Fmt.plural(materials.count, "Position", "Positionen"))
                ProjectsLineEditor(lines: $materials, kind: .material, errorPrefix: "materials", errors: errors)
            }
            VStack(alignment: .leading, spacing: 10) {
                SectionHeader("Werkzeug", subtitle: tools.isEmpty ? nil : Fmt.plural(tools.count, "Position", "Positionen"))
                ProjectsLineEditor(lines: $tools, kind: .tool, errorPrefix: "tools", errors: errors)
            }
        }
    }

    // MARK: - Laden

    private func load() async {
        loading = true
        loadError = nil
        defer { loading = false; if loadError == nil { didLoad = true } }
        do {
            if let handle, let slug {
                let d: ProjectEditData = try await APIClient.shared.get("/projects/by/\(handle)/\(slug)/edit")
                guard let id = d.id, let v = d.values else {
                    loadError = "Dieses Projekt kannst du nicht bearbeiten."
                    return
                }
                projectId = id
                title = v.title
                summary = v.description ?? ""
                category = v.category
                tags = v.tags ?? []
                status = v.status ?? "IN_PROGRESS"
                visibility = v.visibility ?? "PUBLIC"
                difficulty = v.difficulty ?? 2
                estimatedMinutes = v.estimatedMinutes
                actualMinutes = v.actualMinutes
                budget = Fmt.moneyInput(v.budgetMinor)
                var items = (v.media ?? []).map { m -> DraftMedia in
                    var x = DraftMedia.existing(id: m.id, url: m.preview?.nilIfEmpty, alt: m.alt)
                    x.isVideo = m.kind == "VIDEO"
                    return x
                }
                if let cover = v.coverMediaId, let i = items.firstIndex(where: { $0.mediaId == cover }), i > 0 {
                    let c = items.remove(at: i)
                    items.insert(c, at: 0)
                }
                media = items
                materials = (v.materials ?? []).map(ProjectsLineDraft.init)
                tools = (v.tools ?? []).map(ProjectsLineDraft.init)
                remixNote = v.remixNote ?? ""
                if let r = d.remixOf { remixTitle = r.title; remixOwner = r.ownerName }
                durationSeed += 1
            } else if let remixOf {
                let src: ProjectRemixSource = try await APIClient.shared.get("/projects/remix-source/\(remixOf)")
                remixSourceId = src.id
                remixTitle = src.title
                remixOwner = src.ownerName
                category = src.category
                difficulty = src.difficulty ?? 2
                materials = (src.materials ?? []).map(ProjectsLineDraft.init)
                tools = (src.tools ?? []).map(ProjectsLineDraft.init)
                durationSeed += 1
                titleFocused = true
            } else {
                if category.isEmpty { category = app.me?.profile?.categories?.first(where: { c in app.activeCategories.contains { $0.slug == c } }) ?? "" }
                titleFocused = true
            }
        } catch is CancellationError {
        } catch {
            loadError = (error as? APIError)?.message ?? error.localizedDescription
        }
    }

    // MARK: - Speichern

    private func validate() -> Bool {
        var f: [String: String] = [:]
        if title.trimmed.count < 3 { f["title"] = "Titel ist zu kurz" }
        if category.isEmpty { f["category"] = "Bitte wähle eine Kategorie" }
        if !budget.trimmed.isEmpty, Fmt.parseMoney(budget) == nil { f["budgetMinor"] = "Bitte gib einen gültigen Betrag an, z. B. 45.50" }
        errors.fields = f
        if let first = f.keys.map(stepFor).min() { withAnimation(.snappy) { step = first } }
        return f.isEmpty
    }

    private func save() async {
        guard !saving, !media.isUploading else { return }
        guard validate() else { Haptics.warning(); return }
        saving = true
        defer { saving = false }

        var body: [String: JSONValue] = [
            "title": .string(title.trimmed),
            "description": .string(summary.trimmed),
            "category": .string(category),
            "tags": .from(tags),
            "status": .string(status),
            "visibility": .string(visibility),
            "difficulty": .number(Double(difficulty)),
            "media": media.refsJSON,
            "materials": materials.cleaned.json,
            "tools": tools.cleaned.json,
        ]
        if let m = estimatedMinutes { body["estimatedMinutes"] = .number(Double(m)) }
        if let m = actualMinutes { body["actualMinutes"] = .number(Double(m)) }
        if let b = Fmt.parseMoney(budget), !budget.trimmed.isEmpty { body["budgetMinor"] = .number(Double(b)) }
        if let cover = media.refs.first?.id { body["coverMediaId"] = .string(cover) }
        if let rid = remixSourceId, !isEdit { body["remixOfId"] = .string(rid) }
        if isRemix || isEdit { body["remixNote"] = .string(remixNote.trimmed) }

        do {
            let result: ProjectSaveResult
            if let id = projectId, isEdit {
                result = try await APIClient.shared.put("/projects/\(id)", body)
            } else {
                result = try await APIClient.shared.post("/projects", body)
            }
            Haptics.success()
            app.show(isEdit ? "Änderungen gespeichert." : isRemix ? "Nachbau angelegt – viel Freude beim Bauen!" : "Projekt angelegt.")
            dismiss()
            if !isEdit {
                let h = app.handle ?? result.href.flatMap { Route.from(href: $0) }.flatMap { r -> String? in
                    if case .project(let h, _) = r { return h } else { return nil }
                }
                if let h {
                    try? await Task.sleep(for: .milliseconds(350))
                    router.open(.project(handle: h, slug: result.slug))
                }
            }
        } catch let e as APIError {
            errors.fields = e.fields ?? [:]
            if let first = errors.fields.keys.map(stepFor).min() { withAnimation(.snappy) { step = first } }
            if e.fields?.isEmpty ?? true { app.show(error: e) } else { Haptics.warning() }
        } catch {
            app.show(error: error)
        }
    }
}

// MARK: - Etappen-Faden (Fortschritt im Editor)

/// Vier Knoten auf einem Faden – die erledigten Abschnitte sind ausgefüllt.
struct ProjectsStepThread: View {
    var steps: [String]
    var current: Int
    var errorSteps: Set<Int> = []
    var select: (Int) -> Void

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(steps.enumerated()), id: \.offset) { i, s in
                Button { Haptics.selection(); select(i) } label: {
                    VStack(spacing: 6) {
                        ZStack {
                            Circle().fill(i <= current ? Color.moss : Color.paper).frame(width: 22, height: 22)
                            Circle().strokeBorder(errorSteps.contains(i) ? Color.danger : (i <= current ? Color.moss : Color.lineStrong), lineWidth: 1.5).frame(width: 22, height: 22)
                            if errorSteps.contains(i) {
                                Image(systemName: "exclamationmark").font(.wr(size: 10, weight: .heavy)).foregroundStyle(i <= current ? Color.paper : Color.danger)
                            } else if i < current {
                                Image(systemName: "checkmark").font(.wr(size: 9, weight: .heavy)).foregroundStyle(Color.paper)
                            } else {
                                Text("\(i + 1)").font(.wr(size: 10, weight: .bold)).foregroundStyle(i == current ? Color.paper : Color.muted)
                            }
                        }
                        Text(s).font(.wr(.caption2).weight(i == current ? .semibold : .regular)).foregroundStyle(i == current ? Color.ink : Color.muted)
                    }
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Schritt \(i + 1): \(s)\(errorSteps.contains(i) ? ", enthält Fehler" : "")")
                .accessibilityAddTraits(i == current ? .isSelected : [])
                .background(alignment: .top) {
                    if i < steps.count - 1 {
                        GeometryReader { g in
                            Capsule()
                                .fill(i < current ? Color.moss : Color.lineStrong)
                                .frame(width: g.size.width - 30, height: 1.5)
                                .offset(x: g.size.width / 2 + 15, y: 10.25)
                        }
                    }
                }
            }
        }
        .animation(.snappy, value: current)
    }
}

/// „Weiter →“ (Icon rechts)
struct ProjectsTrailingIconLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 6) { configuration.title; configuration.icon }
    }
}
