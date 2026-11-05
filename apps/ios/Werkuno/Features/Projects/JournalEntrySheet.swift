import SwiftUI

/// Neuer Journal-Eintrag („Was hast du heute geschafft?“) – `POST /projects/:id/updates`
/// Schema `projectUpdateEntrySchema`: body (Pflicht), milestone, problem, solution, minutes, media, shareToFeed.
struct JournalEntrySheet: View {
    var projectId: String
    var projectTitle: String

    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss

    @State private var text = ""
    @State private var isMilestone = false
    @State private var milestone = ""
    @State private var withProblem = false
    @State private var problem = ""
    @State private var solution = ""
    @State private var minutes: Int?
    @State private var media: [DraftMedia] = []
    @State private var shareToFeed = false
    @State private var errors = ProjectsFieldErrors()
    @State private var saving = false
    @FocusState private var bodyFocused: Bool

    private var canSave: Bool { !text.trimmed.isEmpty && !media.isUploading && !saving }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 26) {
                    VStack(alignment: .leading, spacing: 6) {
                        SpecLabel("Journal · \(projectTitle)", color: .moss)
                        Text("Was hast du heute geschafft?").font(.display(28)).foregroundStyle(Color.ink)
                        Text("Auch Fehlversuche helfen anderen weiter.").font(.wr(.subheadline)).foregroundStyle(Color.muted)
                    }

                    ProjectsField(label: "Was ist passiert?", error: errors["body"], trailing: "\(text.count)/5000") {
                        TextField("Heute habe ich …", text: $text, axis: .vertical)
                            .lineLimit(5...14)
                            .focused($bodyFocused)
                            .projectsInput(error: errors["body"] != nil)
                    }

                    MediaPickerField(items: $media, maxCount: 10, title: "Fotos")

                    ProjectsField(label: "Arbeitszeit", hint: "Fliesst in die Journal-Zeit des Projekts ein.", error: errors["minutes"]) {
                        ProjectsDurationField(minutes: $minutes)
                    }

                    VStack(alignment: .leading, spacing: 14) {
                        Toggle(isOn: $isMilestone.animation(.snappy)) {
                            Label { VStack(alignment: .leading, spacing: 2) {
                                Text("Meilenstein").font(.wr(.subheadline, .semibold))
                                Text("Erscheint hervorgehoben im Projektfaden.").font(.wr(.caption)).foregroundStyle(Color.muted)
                            } } icon: { Image(systemName: "flag.fill").foregroundStyle(Color.clay) }
                        }
                        .tint(.clay)
                        if isMilestone {
                            ProjectsField(label: "Meilenstein", error: errors["milestone"]) {
                                TextField("Zum Beispiel «Rahmen verleimt»", text: $milestone).projectsInput(error: errors["milestone"] != nil)
                            }
                            .transition(.opacity.combined(with: .move(edge: .top)))
                        }

                        Divider()

                        Toggle(isOn: $withProblem.animation(.snappy)) {
                            Label { VStack(alignment: .leading, spacing: 2) {
                                Text("Problem und Lösung dokumentieren").font(.wr(.subheadline, .semibold))
                                Text("Was ging schief – und wie hast du es gelöst?").font(.wr(.caption)).foregroundStyle(Color.muted)
                            } } icon: { Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(Color.ochre) }
                        }
                        .tint(.ochre)
                        if withProblem {
                            VStack(alignment: .leading, spacing: 14) {
                                ProjectsField(label: "Problem", error: errors["problem"]) {
                                    TextField("Was ging schief?", text: $problem, axis: .vertical).lineLimit(2...6).projectsInput(error: errors["problem"] != nil)
                                }
                                ProjectsField(label: "Lösung", hint: "Noch keine Lösung? Lass das Feld leer – vielleicht weiss jemand in den Fragen Rat.", error: errors["solution"]) {
                                    TextField("Wie hast du es gelöst?", text: $solution, axis: .vertical).lineLimit(2...6).projectsInput(error: errors["solution"] != nil)
                                }
                            }
                            .transition(.opacity.combined(with: .move(edge: .top)))
                        }
                    }
                    .padding(16)
                    .cardSurface()

                    Toggle(isOn: $shareToFeed) {
                        Label { VStack(alignment: .leading, spacing: 2) {
                            Text("Im Feed teilen").font(.wr(.subheadline, .semibold))
                            Text("Deine Follower sehen den Fortschritt auch in ihrer Werkbank.").font(.wr(.caption)).foregroundStyle(Color.muted)
                        } } icon: { Image(systemName: "bubble.left.and.text.bubble.right").foregroundStyle(Color.moss) }
                    }
                    .tint(.moss)
                    .padding(16)
                    .cardSurface()

                    if let general = errors.fields["_"] { NoticeView(tone: .danger, message: general) }
                }
                .padding(.horizontal, Space.gutter)
                .padding(.vertical, 16)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Color.paper)
            .navigationTitle("Fortschritt eintragen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Eintragen") { Task { await save() } }.disabled(!canSave)
                }
            }
            .safeAreaInset(edge: .bottom) {
                ProjectsEditorBar {
                    AsyncButton { await save() } label: {
                        Label(media.isUploading ? "Lädt hoch …" : "Eintragen", systemImage: "point.3.connected.trianglepath.dotted")
                    }
                    .primaryButton()
                    .disabled(!canSave)
                }
            }
            .onAppear { bodyFocused = true }
        }
        .interactiveDismissDisabled(!text.isEmpty || !media.isEmpty)
    }

    private func save() async {
        guard canSave else { return }
        saving = true
        defer { saving = false }
        errors.clear()
        var body: [String: JSONValue] = [
            "body": .string(text.trimmed),
            "media": media.refsJSON,
            "shareToFeed": .bool(shareToFeed),
        ]
        if isMilestone, let m = milestone.nilIfEmpty { body["milestone"] = .string(m.trimmed) }
        if withProblem {
            if let p = problem.nilIfEmpty { body["problem"] = .string(p.trimmed) }
            if let s = solution.nilIfEmpty { body["solution"] = .string(s.trimmed) }
        }
        if let minutes, minutes > 0 { body["minutes"] = .number(Double(minutes)) }
        do {
            _ = try await APIClient.shared.post("/projects/\(projectId)/updates", body) as JSONValue
            Haptics.success()
            app.show(shareToFeed ? "Fortschritt eingetragen und im Feed geteilt." : "Fortschritt eingetragen.")
            dismiss()
        } catch let e as APIError {
            errors.fields = e.fields ?? [:]
            if e.fields?.isEmpty ?? true { app.show(error: e) }
        } catch {
            app.show(error: error)
        }
    }
}
