import SwiftUI

// Gemeinsame Bausteine der Editoren und Detailseiten (Bereich Projekte & Anleitungen).

// MARK: - Feld mit Label, Hinweis und Feldfehler

struct ProjectsField<Content: View>: View {
    var label: String
    var hint: String? = nil
    var error: String? = nil
    var trailing: String? = nil
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(alignment: .firstTextBaseline) {
                SpecLabel(label, color: error == nil ? .muted : .danger)
                Spacer(minLength: 8)
                if let trailing { Text(trailing).font(.caption2).monospacedDigit().foregroundStyle(Color.muted) }
            }
            content()
            if let error {
                Label(error, systemImage: "exclamationmark.circle.fill")
                    .font(.caption)
                    .foregroundStyle(Color.danger)
                    .accessibilityLabel("Fehler: \(error)")
            } else if let hint {
                Text(hint).font(.caption).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .contain)
    }
}

extension View {
    /// Ruhiges Eingabefeld (abgesenkte Fläche, Haarlinie bei Fehler)
    func projectsInput(error: Bool = false) -> some View {
        self
            .padding(.horizontal, 14).padding(.vertical, 12)
            .background(Color.sunken, in: .rect(cornerRadius: Radius.inner, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Radius.inner, style: .continuous).strokeBorder(error ? Color.danger : .clear, lineWidth: 1))
    }
}

/// Feldfehler aus `APIError.fields` (`title`, `materials.0.name`, `steps.2.title` …)
struct ProjectsFieldErrors: Equatable {
    var fields: [String: String] = [:]
    subscript(_ key: String) -> String? {
        if let v = fields[key] { return v }
        return fields.first { $0.key.hasPrefix(key + ".") }?.value
    }
    var isEmpty: Bool { fields.isEmpty }
    mutating func clear() { fields = [:] }
}

// MARK: - Auswahl-Chips (ohne Glas – Inhaltsebene)

struct ProjectsChoiceChips<T: Hashable>: View {
    var items: [(value: T, label: String, symbol: String?)]
    @Binding var selection: T
    var tint: Color = .ink

    var body: some View {
        FlowLayout(spacing: 8, lineSpacing: 8) {
            ForEach(items, id: \.value) { item in
                let on = item.value == selection
                Button {
                    Haptics.selection()
                    withAnimation(.snappy) { selection = item.value }
                } label: {
                    HStack(spacing: 6) {
                        if let s = item.symbol { Image(systemName: s).font(.caption.weight(.semibold)) }
                        Text(item.label).font(.subheadline.weight(on ? .semibold : .regular))
                    }
                    .foregroundStyle(on ? Color.paper : Color.ink)
                    .padding(.horizontal, 14).padding(.vertical, 9)
                    .background(on ? tint : Color.sunken, in: Capsule())
                    .overlay(Capsule().strokeBorder(on ? Color.clear : Color.line, lineWidth: 0.75))
                    .frame(minHeight: 44)
                    .contentShape(Capsule())
                }
                .buttonStyle(.pressable)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
    }
}

// MARK: - Kategorie-Auswahl

struct ProjectsCategoryPicker: View {
    @Binding var selection: String
    @Environment(AppState.self) private var app

    var body: some View {
        FlowLayout(spacing: 8, lineSpacing: 8) {
            ForEach(app.activeCategories) { c in
                let on = c.slug == selection
                let color = CategoryPalette.color(for: c.slug)
                Button {
                    Haptics.selection()
                    withAnimation(.snappy) { selection = c.slug }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: CategoryPalette.symbol(for: c.glyph)).font(.caption.weight(.semibold))
                        Text(c.short).font(.subheadline.weight(on ? .semibold : .regular))
                    }
                    .foregroundStyle(on ? Color.paper : color)
                    .padding(.horizontal, 13).padding(.vertical, 9)
                    .background(on ? color : color.opacity(0.1), in: Capsule())
                    .frame(minHeight: 44)
                    .contentShape(Capsule())
                }
                .buttonStyle(.pressable)
                .accessibilityLabel(c.name)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
    }
}

// MARK: - Schwierigkeit 1–5

struct ProjectsDifficultyPicker: View {
    @Binding var level: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .bottom, spacing: 6) {
                ForEach(1...5, id: \.self) { i in
                    let on = i <= level
                    Button {
                        Haptics.selection()
                        withAnimation(.spring(duration: 0.3, bounce: 0.35)) { level = i }
                    } label: {
                        VStack(spacing: 6) {
                            RoundedRectangle(cornerRadius: 5, style: .continuous)
                                .fill(on ? Color.ink : Color.lineStrong.opacity(0.6))
                                .frame(height: 10 + CGFloat(i) * 7)
                            Text("\(i)").font(.specLarge).foregroundStyle(i == level ? Color.ink : Color.muted)
                        }
                        .frame(maxWidth: .infinity, minHeight: 64, alignment: .bottom)
                        .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(L.difficulty[i] ?? "Stufe \(i)"), Stufe \(i) von 5")
                    .accessibilityAddTraits(i == level ? .isSelected : [])
                }
            }
            HStack(spacing: 6) {
                Text(L.difficulty[level] ?? "").font(.headlineSerif).foregroundStyle(Color.ink).contentTransition(.opacity)
                Spacer()
                Text(difficultyHint).font(.caption).foregroundStyle(Color.muted).multilineTextAlignment(.trailing)
            }
        }
    }

    private var difficultyHint: String {
        switch level {
        case 1: "Ohne Vorkenntnisse machbar"
        case 2: "Etwas Übung hilft"
        case 3: "Grundtechniken sitzen"
        case 4: "Für Erfahrene"
        default: "Viel Erfahrung & Geduld"
        }
    }
}

// MARK: - Dauer (Std. + Min.)

struct ProjectsDurationField: View {
    @Binding var minutes: Int?
    @State private var hours = ""
    @State private var mins = ""

    var body: some View {
        HStack(spacing: 8) {
            unitField($hours, unit: "Std.", label: "Stunden")
            unitField($mins, unit: "Min.", label: "Minuten")
        }
        .onAppear(perform: sync)
        .onChange(of: hours) { _, _ in push() }
        .onChange(of: mins) { _, _ in push() }
    }

    private func unitField(_ text: Binding<String>, unit: String, label: String) -> some View {
        HStack(spacing: 6) {
            TextField("0", text: text).keyboardType(.numberPad).monospacedDigit()
            Text(unit).font(.footnote).foregroundStyle(Color.muted)
        }
        .projectsInput()
        .accessibilityLabel(label)
    }

    private func sync() {
        guard let m = minutes, m > 0 else { hours = ""; mins = ""; return }
        hours = m / 60 > 0 ? "\(m / 60)" : ""
        mins = m % 60 > 0 ? "\(m % 60)" : ""
    }

    private func push() {
        let h = Int(hours.filter(\.isNumber)) ?? 0
        let m = Int(mins.filter(\.isNumber)) ?? 0
        let total = h * 60 + m
        minutes = (hours.isEmpty && mins.isEmpty) ? nil : total
    }
}

// MARK: - Schlagwörter (Enter/Komma → Chip)

struct ProjectsTagField: View {
    @Binding var tags: [String]
    var max = 12
    @State private var text = ""
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if !tags.isEmpty {
                FlowLayout(spacing: 6, lineSpacing: 6) {
                    ForEach(tags, id: \.self) { t in
                        Button { withAnimation(.snappy) { tags.removeAll { $0 == t } } } label: {
                            HStack(spacing: 4) {
                                Text("#\(t)").font(.footnote.weight(.medium))
                                Image(systemName: "xmark").font(.system(size: 9, weight: .bold)).foregroundStyle(Color.muted)
                            }
                            .foregroundStyle(Color.ink2)
                            .padding(.horizontal, 10).padding(.vertical, 6)
                            .background(Color.card, in: Capsule())
                            .overlay(Capsule().strokeBorder(Color.line, lineWidth: 0.75))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Schlagwort \(t) entfernen")
                    }
                }
            }
            if tags.count < max {
                HStack {
                    Image(systemName: "number").font(.footnote).foregroundStyle(Color.muted)
                    TextField(tags.isEmpty ? "z. B. arve, hocker, leinöl" : "Weiteres Schlagwort", text: $text)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.done)
                        .focused($focused)
                        .onSubmit { commit(); focused = true }
                        .onChange(of: text) { _, v in if v.contains(",") { commit() } }
                    if !text.trimmed.isEmpty {
                        Button("Hinzufügen") { commit() }.font(.footnote.weight(.semibold)).foregroundStyle(Color.moss)
                    }
                }
                .projectsInput()
            }
        }
    }

    private func commit() {
        let parts = text.split(separator: ",").map { String($0).trimmed.lowercased().replacingOccurrences(of: "#", with: "") }.filter { !$0.isEmpty }
        for p in parts where !tags.contains(p) && tags.count < max { tags.append(String(p.prefix(30))) }
        text = ""
    }
}

// MARK: - Material-/Werkzeug-Zeilen

struct ProjectsLineDraft: Identifiable, Hashable {
    var id = UUID().uuidString
    var name = ""
    var quantity = ""
    var note = ""
    var materialId: String?

    init(name: String = "", quantity: String = "", note: String = "", materialId: String? = nil) {
        self.name = name; self.quantity = quantity; self.note = note; self.materialId = materialId
    }
    init(_ v: ProjectsLineValue) {
        self.init(name: v.name, quantity: v.quantity ?? "", note: v.note ?? "", materialId: v.materialId)
    }
    var value: ProjectsLineValue { ProjectsLineValue(name: name, quantity: quantity, note: note, materialId: materialId) }
    var isEmpty: Bool { name.trimmed.isEmpty }
}

extension Array where Element == ProjectsLineDraft {
    var cleaned: [ProjectsLineValue] { filter { !$0.isEmpty }.map(\.value) }
}

struct ProjectsLineEditor: View {
    enum Kind { case material, tool }
    @Binding var lines: [ProjectsLineDraft]
    var kind: Kind
    var errorPrefix: String
    var errors: ProjectsFieldErrors

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(Array(lines.enumerated()), id: \.element.id) { idx, line in
                if let b = binding(for: line.id) {
                    ProjectsLineRow(line: b, index: idx, kind: kind, error: errors["\(errorPrefix).\(idx)"]) {
                        withAnimation(.snappy) { lines.removeAll { $0.id == line.id } }
                    } move: { d in
                        let j = idx + d
                        guard lines.indices.contains(j) else { return }
                        withAnimation(.snappy) { lines.swapAt(idx, j) }
                    }
                    .transition(.opacity.combined(with: .move(edge: .top)))
                }
            }
            Button {
                withAnimation(.snappy) { lines.append(ProjectsLineDraft()) }
            } label: {
                Label(kind == .material ? "Material hinzufügen" : "Werkzeug hinzufügen", systemImage: "plus")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.moss)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(Color.mossSoft.opacity(0.6), in: .rect(cornerRadius: Radius.inner, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: Radius.inner, style: .continuous).strokeBorder(Color.moss.opacity(0.35), style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
            }
            .buttonStyle(.pressable)
            .disabled(lines.count >= 60)
        }
    }

    private func binding(for id: String) -> Binding<ProjectsLineDraft>? {
        guard lines.contains(where: { $0.id == id }) else { return nil }
        return Binding(
            get: { lines.first { $0.id == id } ?? ProjectsLineDraft() },
            set: { v in if let i = lines.firstIndex(where: { $0.id == id }) { lines[i] = v } }
        )
    }
}

private struct ProjectsLineRow: View {
    @Binding var line: ProjectsLineDraft
    var index: Int
    var kind: ProjectsLineEditor.Kind
    var error: String?
    var remove: () -> Void
    var move: (Int) -> Void

    @FocusState private var nameFocused: Bool
    @State private var hits: [ProjectsMaterialHit] = []
    @State private var pickedName: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(String(format: "%02d", index + 1)).font(.specLarge).foregroundStyle(Color.moss).frame(width: 22, alignment: .leading)
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 8) {
                        TextField(kind == .material ? "Material, z. B. Merinowolle" : "Werkzeug, z. B. Japansäge", text: $line.name)
                            .font(.body.weight(.medium))
                            .focused($nameFocused)
                            .submitLabel(.next)
                        if kind == .material {
                            TextField("Menge", text: $line.quantity)
                                .multilineTextAlignment(.trailing)
                                .frame(maxWidth: 92)
                                .font(.subheadline.monospacedDigit())
                                .accessibilityLabel("Menge")
                        }
                    }
                    TextField("Notiz (optional)", text: $line.note)
                        .font(.footnote)
                        .foregroundStyle(Color.ink2)
                }
                Menu {
                    if index > 0 { Button("Nach oben", systemImage: "arrow.up") { move(-1) } }
                    Button("Nach unten", systemImage: "arrow.down") { move(1) }
                    Button("Entfernen", systemImage: "trash", role: .destructive, action: remove)
                } label: {
                    Image(systemName: "ellipsis").font(.subheadline.weight(.semibold)).foregroundStyle(Color.muted).frame(width: 36, height: 36).contentShape(.rect)
                }
                .accessibilityLabel("Zeile \(index + 1) bearbeiten")
            }
            if line.materialId != nil {
                Label("Aus dem Materialkatalog", systemImage: "checkmark.seal.fill").font(.caption2).foregroundStyle(Color.moss).padding(.leading, 32)
            }
            if nameFocused && !hits.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(hits) { h in
                            Button {
                                pickedName = h.name
                                line.name = h.name
                                line.materialId = h.id
                                if line.quantity.isEmpty, let u = h.unit?.nilIfEmpty { line.quantity = u == "Stk" ? "1 Stk" : "" }
                                hits = []
                                Haptics.selection()
                            } label: {
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(h.name).font(.footnote.weight(.semibold)).foregroundStyle(Color.ink)
                                    if let c = h.category ?? h.type { Text(c).font(.caption2).foregroundStyle(Color.muted) }
                                }
                                .padding(.horizontal, 10).padding(.vertical, 6)
                                .background(Color.card, in: .rect(cornerRadius: Radius.small, style: .continuous))
                                .overlay(RoundedRectangle(cornerRadius: Radius.small, style: .continuous).strokeBorder(Color.line, lineWidth: 0.75))
                            }
                            .buttonStyle(.pressable)
                        }
                    }
                    .padding(.leading, 32)
                }
                .transition(.opacity)
            }
            if let error { Text(error).font(.caption).foregroundStyle(Color.danger).padding(.leading, 32) }
        }
        .padding(12)
        .background(Color.sunken, in: .rect(cornerRadius: Radius.inner, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radius.inner, style: .continuous).strokeBorder(error == nil ? Color.clear : Color.danger, lineWidth: 1))
        .onChange(of: line.name) { old, new in
            if line.materialId != nil, old != new, new != pickedName { line.materialId = nil }
        }
        .task(id: nameFocused ? line.name : "") {
            guard kind == .material, nameFocused, line.name.trimmed.count >= 2, line.materialId == nil else { hits = []; return }
            try? await Task.sleep(for: .milliseconds(280))
            guard !Task.isCancelled else { return }
            let q = line.name.trimmed
            let found: [ProjectsMaterialHit] = (try? await APIClient.shared.get("/materials", query: ["q": q, "limit": "8"])) ?? []
            withAnimation(.snappy) { hits = found }
        }
    }
}

// MARK: - Datenblatt-Tabelle (Material & Werkzeug, lesend)

struct ProjectsSpecTable: View {
    struct Row: Identifiable, Hashable {
        var id: String
        var name: String
        var quantity: String?
        var note: String?
        var safety: String?
    }
    var title: String
    var rows: [Row]
    var showQuantity = true

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                SpecLabel("Pos.").frame(width: 34, alignment: .leading)
                SpecLabel(title)
                Spacer()
                if showQuantity { SpecLabel("Menge") }
            }
            .padding(.bottom, 8)
            .hairline()
            ForEach(Array(rows.enumerated()), id: \.element.id) { i, r in
                HStack(alignment: .firstTextBaseline, spacing: 0) {
                    Text(String(format: "%02d", i + 1)).font(.specLarge).foregroundStyle(Color.muted).frame(width: 34, alignment: .leading)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(r.name).font(.subheadline.weight(.medium)).foregroundStyle(Color.ink)
                        if let n = r.note?.nilIfEmpty { Text(n).font(.caption).foregroundStyle(Color.muted) }
                        if let s = r.safety?.nilIfEmpty {
                            Label(s, systemImage: "exclamationmark.triangle.fill").font(.caption).foregroundStyle(Color.warn)
                        }
                    }
                    Spacer(minLength: 12)
                    if showQuantity, let q = r.quantity?.nilIfEmpty {
                        Text(q).font(.subheadline.monospacedDigit()).foregroundStyle(Color.ink2)
                    }
                }
                .padding(.vertical, 11)
                .hairline()
                .accessibilityElement(children: .combine)
            }
        }
    }
}

// MARK: - Kleine Helfer

/// Abschnitt mit Abstand zum Rand
struct ProjectsSection<Content: View>: View {
    var title: String
    var number: String?
    var subtitle: String? = nil
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            SectionHeader(title, number: number, subtitle: subtitle)
            content()
        }
        .padding(.horizontal, Space.gutter)
        .padding(.vertical, 28)
        .hairline(.top)
    }
}

/// Schwebende Glas-Leiste für Editor-Hauptaktionen
struct ProjectsEditorBar<Content: View>: View {
    @ViewBuilder var content: () -> Content
    var body: some View {
        GlassEffectContainer(spacing: 10) {
            HStack(spacing: 10) { content() }
        }
        .padding(.horizontal, Space.gutter)
        .padding(.top, 8)
        .padding(.bottom, 6)
    }
}

enum ProjectsStatusStyle {
    static func symbol(_ s: String) -> String {
        switch s {
        case "IDEA": "lightbulb"
        case "PLANNING": "pencil.and.ruler"
        case "IN_PROGRESS": "hammer"
        case "PAUSED": "pause.circle"
        case "COMPLETED": "checkmark.seal"
        case "ARCHIVED": "archivebox"
        default: "circle"
        }
    }
    static func visibilitySymbol(_ v: String) -> String {
        switch v {
        case "FOLLOWERS": "person.2"
        case "PRIVATE": "lock"
        default: "globe.europe.africa"
        }
    }
}
