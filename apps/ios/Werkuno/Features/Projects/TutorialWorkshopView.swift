import AudioToolbox
import SwiftUI
import UIKit
import UserNotifications

/// Werkstatt-Modus (Gegenstück zu `components/tutorials/workshop-mode.tsx`): ein Schritt pro Bildschirm,
/// grosse Schrift (drei Stufen, gemerkt), Bildschirm bleibt an, Bereitlegen-Liste, Timer mit Mitteilung und Ton.
/// Fortschritt wie in der Anleitung über die bestehenden Schritt-Haken; Stelle, Bereitgelegtes und Timer
/// merkt sich das Gerät je Anleitung.
struct TutorialWorkshopView: View {
    var page: TutorialPage
    @Binding var done: Set<String>
    @Binding var completedAt: Date?
    var toggle: (TutorialPageStep) async -> Void
    var complete: () async -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("werkuno.werkstatt.size") private var size = 1
    @State private var index = 0
    @State private var ready: Set<String> = []
    @State private var timer: WorkshopTimer?
    @State private var showTimer = false
    @State private var ringing = false
    @State private var keepAwake = true
    @State private var questionsStep: TutorialPageStep?
    @State private var qCounts: [String: Int] = [:]
    @State private var loaded = false

    private var steps: [TutorialPageStep] { page.steps }
    private var materials: [ProjectsLineValue] { page.materials ?? [] }
    private var tools: [ProjectsLineValue] { page.tools ?? [] }
    private var hasPrep: Bool { !materials.isEmpty || !tools.isEmpty }
    private var prepOffset: Int { hasPrep ? 1 : 0 }
    /// [Bereitlegen?] + Schritte + Abschluss
    private var pageCount: Int { prepOffset + steps.count + 1 }
    private var isEnd: Bool { index == pageCount - 1 }
    private var currentStep: TutorialPageStep? { steps[safe: index - prepOffset] }
    private var scale: WorkshopScale { WorkshopScale(level: size) }

    var body: some View {
        VStack(spacing: 0) {
            WorkshopHeader(
                title: page.title, steps: steps, done: done, timer: timer, size: $size, keepAwake: $keepAwake,
                close: { dismiss() }, openTimer: { showTimer = true }
            )
            if ringing { ringBanner }
            pager
        }
        .background(Color.paper.ignoresSafeArea())
        .safeAreaInset(edge: .bottom) { controls }
        .sheet(isPresented: $showTimer) {
            WorkshopTimerSheet(step: currentStep, running: timer, start: startTimer, stop: stopTimer)
        }
        .sheet(item: $questionsStep) { s in
            StepQuestionsSheet(tutorialId: page.id, step: s, isOwner: page.isOwner) { n in qCounts[s.stableKey] = n }
        }
        .onAppear(perform: restore)
        .onDisappear {
            UIApplication.shared.isIdleTimerDisabled = false
        }
        .onChange(of: keepAwake) { _, on in UIApplication.shared.isIdleTimerDisabled = on }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { UIApplication.shared.isIdleTimerDisabled = keepAwake }
        }
        .onChange(of: index) { _, _ in Haptics.selection(); persist() }
        .onChange(of: ready) { _, _ in persist() }
        .onChange(of: timer) { _, _ in persist() }
        .task(id: timer) { await waitForTimer() }
    }

    // MARK: Seiten

    private var pager: some View {
        TabView(selection: $index) {
            if hasPrep {
                WorkshopPrepPage(materials: materials, tools: tools, ready: $ready, scale: scale).tag(0)
            }
            ForEach(Array(steps.enumerated()), id: \.element.id) { i, s in
                WorkshopStepPage(
                    step: s, total: steps.count, isDone: done.contains(s.stableKey), scale: scale,
                    timerRunning: timer != nil, questions: page.preview == true ? nil : (qCounts[s.stableKey] ?? 0),
                    startTimer: { m in startTimer(Double(m), "Schritt \(s.position + 1)") },
                    openQuestions: { questionsStep = s }
                )
                .tag(i + prepOffset)
            }
            endPage.tag(pageCount - 1)
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
        .animation(.snappy, value: index)
    }

    private var endPage: some View {
        WorkshopEndPage(
            doneCount: steps.filter { done.contains($0.stableKey) }.count, total: steps.count,
            completed: completedAt != nil, canComplete: !page.isOwner && page.preview != true, scale: scale,
            complete: complete, back: { dismiss() }
        )
    }

    private var ringBanner: some View {
        HStack(spacing: 12) {
            Image(systemName: "timer").font(.wr(.title3, .semibold))
            Text("Zeit ist um.").font(.wr(.title3, .semibold)).frame(maxWidth: .infinity, alignment: .leading)
            Button("OK") { ringing = false }
                .font(.wr(.subheadline, .semibold))
                .foregroundStyle(Color.ink)
                .padding(.horizontal, 18).frame(minHeight: 44)
                .background(Color.paper, in: Capsule())
        }
        .foregroundStyle(Color.paper)
        .padding(.horizontal, 18).padding(.vertical, 12)
        .background(Color.ink, in: .rect(cornerRadius: Radius.inner, style: .continuous))
        .padding(.horizontal, Space.gutter).padding(.top, 10)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isStaticText)
        .transition(.move(edge: .top).combined(with: .opacity))
    }

    // MARK: Bedienleiste

    private var controls: some View {
        HStack(spacing: 12) {
            Button { go(index - 1) } label: {
                Image(systemName: "arrow.left").font(.wr(.title3, .semibold)).frame(width: 64, height: 56)
            }
            .buttonStyle(.plain)
            .foregroundStyle(Color.ink)
            .overlay(RoundedRectangle(cornerRadius: Radius.inner, style: .continuous).strokeBorder(Color.lineStrong, lineWidth: 1))
            .disabled(index == 0)
            .opacity(index == 0 ? 0.35 : 1)
            .accessibilityLabel("Zurück")

            Text(String(format: "%02d / %02d", index + 1, pageCount))
                .font(.specLarge).monospacedDigit().foregroundStyle(Color.muted)
                .frame(maxWidth: .infinity)
                .accessibilityHidden(true)

            if isEnd {
                if steps.count > 0 && index > 0 {
                    Button("Von vorne") { go(prepOffset) }
                        .font(.wr(.body, .semibold)).foregroundStyle(Color.ink)
                        .padding(.horizontal, 18).frame(height: 56)
                        .overlay(RoundedRectangle(cornerRadius: Radius.inner, style: .continuous).strokeBorder(Color.lineStrong, lineWidth: 1))
                }
            } else {
                Button(action: next) {
                    Label(nextTitle, systemImage: "arrow.right")
                        .labelStyle(TrailingIconLabelStyle())
                        .font(.wr(.body, .semibold))
                        .padding(.horizontal, 20).frame(height: 56)
                        .foregroundStyle(Color.paper)
                        .background(Color.ink, in: .rect(cornerRadius: Radius.inner, style: .continuous))
                }
                .buttonStyle(.pressable)
            }
        }
        .padding(.horizontal, Space.gutter)
        .padding(.vertical, 10)
        .background(Color.paper)
        .hairline(.top)
    }

    private var nextTitle: String {
        guard let s = currentStep else { return "Los geht's" }
        return done.contains(s.stableKey) ? "Weiter" : "Erledigt – weiter"
    }

    // MARK: Aktionen

    private func go(_ i: Int) {
        withAnimation(.snappy) { index = min(max(i, 0), pageCount - 1) }
    }

    /// „Erledigt – weiter“: Schritt abhaken (nur wenn noch offen) und eine Seite weiter
    private func next() {
        if let s = currentStep, !done.contains(s.stableKey), page.preview != true {
            Task { await toggle(s) }
        }
        go(index + 1)
    }

    private func startTimer(_ minutes: Double, _ label: String) {
        let t = WorkshopTimer(endsAt: Date().addingTimeInterval(minutes * 60), total: minutes * 60, label: label)
        timer = t
        ringing = false
        showTimer = false
        Task { await WorkshopTimerNotification.schedule(t, tutorialId: page.id, title: page.title) }
    }

    private func stopTimer() {
        timer = nil
        showTimer = false
        WorkshopTimerNotification.cancel(tutorialId: page.id)
    }

    private func waitForTimer() async {
        guard let t = timer else { return }
        let wait = t.endsAt.timeIntervalSinceNow
        if wait > 0 { try? await Task.sleep(for: .seconds(wait)) }
        guard !Task.isCancelled, timer == t else { return }
        withAnimation(.snappy) { ringing = true }
        // `timer = nil` erst am Ende – das beendet diese Aufgabe (`.task(id:)`)
        defer { timer = nil }
        // Mit erlaubten Mitteilungen kommt der Ton über die Mitteilung (auch im Vordergrund), sonst ein Systemton
        let status = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
        if status != .authorized && status != .provisional && status != .ephemeral { AudioServicesPlaySystemSound(1005) }
        AudioServicesPlayAlertSound(SystemSoundID(kSystemSoundID_Vibrate))
        Haptics.success()
        UIAccessibility.post(notification: .announcement, argument: "Zeit ist um.")
    }

    // MARK: Merken (je Anleitung auf dem Gerät)

    private var storeKey: String { "werkuno.werkstatt.\(page.id)" }

    private func restore() {
        UIApplication.shared.isIdleTimerDisabled = keepAwake
        qCounts = page.stepQuestions ?? [:]
        guard !loaded else { return }
        defer { loaded = true }
        guard let data = UserDefaults.standard.data(forKey: storeKey),
              let s = try? JSONDecoder().decode(WorkshopStored.self, from: data) else { return }
        index = min(max(s.index, 0), pageCount - 1)
        ready = Set(s.ready)
        if let t = s.timer, t.endsAt > Date() { timer = t }
    }

    private func persist() {
        guard loaded else { return }
        let s = WorkshopStored(index: index, ready: Array(ready), timer: timer)
        if let data = try? JSONEncoder().encode(s) { UserDefaults.standard.set(data, forKey: storeKey) }
    }
}

// MARK: - Modelle

struct WorkshopTimer: Codable, Hashable, Sendable {
    var endsAt: Date
    var total: TimeInterval
    var label: String

    static func clock(_ seconds: TimeInterval) -> String {
        let s = max(0, Int(seconds.rounded(.up)))
        let h = s / 3600, m = (s % 3600) / 60, sec = s % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, sec) : String(format: "%02d:%02d", m, sec)
    }
}

private struct WorkshopStored: Codable {
    var index: Int
    var ready: [String]
    var timer: WorkshopTimer?
}

/// Drei Schriftstufen wie im Web (18/21/25 pt Text, 28/34/40 pt Titel)
struct WorkshopScale {
    var level: Int
    private static let bodySizes: [CGFloat] = [18, 21, 25]
    private static let titleSizes: [CGFloat] = [28, 34, 40]
    private var i: Int { min(max(level, 0), 2) }
    var body: Font { .wr(size: Self.bodySizes[i], relativeTo: .body) }
    var bodyBold: Font { .wr(size: Self.bodySizes[i], weight: .semibold, relativeTo: .body) }
    var title: Font { .wr(size: Self.titleSizes[i], weight: .semibold, relativeTo: .largeTitle) }
}

private struct TrailingIconLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 8) { configuration.title; configuration.icon }
    }
}

// MARK: - Mitteilung für den Timer

enum WorkshopTimerNotification {
    private static func id(_ tutorialId: String) -> String { "werkuno.werkstatt.timer.\(tutorialId)" }

    /// Fragt beim ersten Timer nach der Erlaubnis; ohne Erlaubnis piept es nur, solange die App offen ist.
    static func schedule(_ t: WorkshopTimer, tutorialId: String, title: String) async {
        let center = UNUserNotificationCenter.current()
        var status = await center.notificationSettings().authorizationStatus
        if status == .notDetermined {
            _ = try? await center.requestAuthorization(options: [.alert, .sound, .badge])
            status = await center.notificationSettings().authorizationStatus
        }
        center.removePendingNotificationRequests(withIdentifiers: [id(tutorialId)])
        guard status == .authorized || status == .provisional || status == .ephemeral else { return }
        let content = UNMutableNotificationContent()
        content.title = "Zeit ist um"
        content.body = "\(t.label) · \(title)"
        content.sound = .default
        let wait = max(1, t.endsAt.timeIntervalSinceNow)
        let request = UNNotificationRequest(identifier: id(tutorialId), content: content, trigger: UNTimeIntervalNotificationTrigger(timeInterval: wait, repeats: false))
        try? await center.add(request)
    }

    static func cancel(tutorialId: String) {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [id(tutorialId)])
    }
}

// MARK: - Kopf

private struct WorkshopHeader: View {
    var title: String
    var steps: [TutorialPageStep]
    var done: Set<String>
    var timer: WorkshopTimer?
    @Binding var size: Int
    @Binding var keepAwake: Bool
    var close: () -> Void
    var openTimer: () -> Void

    private var doneCount: Int { steps.filter { done.contains($0.stableKey) }.count }
    private var remaining: Int { steps.filter { !done.contains($0.stableKey) }.reduce(0) { $0 + ($1.minutes ?? 0) } }
    private var progress: Double { steps.isEmpty ? 0 : Double(doneCount) / Double(steps.count) }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 4) {
                iconButton("xmark", label: "Werkstatt-Modus beenden", action: close)
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).font(.wr(.footnote, .semibold)).foregroundStyle(Color.ink).lineLimit(1)
                    Text(status).font(.spec).monospacedDigit().foregroundStyle(Color.muted).lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                timerButton
                sizeControl
                iconButton(keepAwake ? "sun.max.fill" : "sun.min", label: keepAwake ? "Bildschirm bleibt an – ausschalten" : "Bildschirm anlassen", tint: keepAwake ? .mossInk : .ink) { keepAwake.toggle() }
            }
            .padding(.horizontal, 8).padding(.vertical, 4)
            progressBar
        }
        .background(Color.paper)
    }

    private var status: String {
        let base = String(format: "%02d / %02d erledigt", doneCount, steps.count)
        return remaining > 0 ? "\(base) · noch ca. \(Fmt.minutes(remaining))" : base
    }

    @ViewBuilder private var timerButton: some View {
        if let timer {
            Button(action: openTimer) {
                TimelineView(.periodic(from: .now, by: 1)) { ctx in
                    Label(WorkshopTimer.clock(timer.endsAt.timeIntervalSince(ctx.date)), systemImage: "timer")
                        .font(.wr(.subheadline, .semibold).monospacedDigit())
                }
                .foregroundStyle(Color.paper)
                .padding(.horizontal, 12).frame(height: 40)
                .background(Color.ink, in: Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Timer \(timer.label)")
            .accessibilityHint("Timer anpassen oder stoppen")
        } else {
            iconButton("timer", label: "Timer", action: openTimer)
        }
    }

    private var sizeControl: some View {
        HStack(spacing: 0) {
            iconButton("textformat.size.smaller", label: "Schrift kleiner") { size = max(0, size - 1) }
                .disabled(size == 0).opacity(size == 0 ? 0.35 : 1)
            iconButton("textformat.size.larger", label: "Schrift grösser") { size = min(2, size + 1) }
                .disabled(size == 2).opacity(size == 2 ? 0.35 : 1)
        }
    }

    private var progressBar: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Rectangle().fill(Color.line)
                Rectangle().fill(Color.moss).frame(width: g.size.width * progress)
            }
        }
        .frame(height: 3)
        .animation(.snappy, value: progress)
        .accessibilityElement()
        .accessibilityLabel("Erledigte Schritte")
        .accessibilityValue("\(Int((progress * 100).rounded())) Prozent")
    }

    private func iconButton(_ symbol: String, label: String, tint: Color = .ink, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol).font(.wr(.body, .semibold)).frame(width: 44, height: 44).contentShape(.rect)
        }
        .buttonStyle(.plain)
        .foregroundStyle(tint)
        .accessibilityLabel(label)
    }
}

// MARK: - Bereitlegen

private struct WorkshopPrepPage: View {
    var materials: [ProjectsLineValue]
    var tools: [ProjectsLineValue]
    @Binding var ready: Set<String>
    var scale: WorkshopScale

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                SpecLabel("Vor dem Start")
                Text("Alles bereitlegen").font(scale.title).foregroundStyle(Color.ink).accessibilityAddTraits(.isHeader)
                Text("Hake ab, was griffbereit liegt.").font(scale.body).foregroundStyle(Color.ink2)
                if !materials.isEmpty { group("Material", materials) }
                if !tools.isEmpty { group("Werkzeug", tools) }
            }
            .padding(.horizontal, Space.gutter)
            .padding(.vertical, 22)
        }
    }

    private func group(_ label: String, _ lines: [ProjectsLineValue]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            SpecLabel(label).padding(.bottom, 6)
            ForEach(Array(lines.enumerated()), id: \.offset) { i, m in
                // Gleicher Schlüssel wie im Web, damit sich Bereitgelegtes nicht vermischt
                row(m, key: "\(label):\(m.name):\(i)")
            }
        }
        .padding(.top, 20)
    }

    private func row(_ m: ProjectsLineValue, key: String) -> some View {
        let on = ready.contains(key)
        return Button {
            Haptics.selection()
            if on { ready.remove(key) } else { ready.insert(key) }
        } label: {
            HStack(spacing: 14) {
                Image(systemName: on ? "checkmark.square.fill" : "square")
                    .font(.wr(.title2)).foregroundStyle(on ? Color.moss : Color.lineStrong)
                VStack(alignment: .leading, spacing: 2) {
                    Text(m.name).font(scale.bodyBold).strikethrough(on).foregroundStyle(on ? Color.muted : Color.ink)
                    if let n = m.note?.nilIfEmpty { Text(n).font(.wr(.subheadline)).foregroundStyle(Color.muted) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if let q = m.quantity?.nilIfEmpty { Text(q).font(scale.body.monospacedDigit()).foregroundStyle(Color.ink2) }
            }
            .padding(.vertical, 10)
            .frame(minHeight: 56)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .hairline()
        .accessibilityAddTraits(on ? [.isSelected, .isToggle] : .isToggle)
    }
}

// MARK: - Schritt

private struct WorkshopStepPage: View {
    var step: TutorialPageStep
    var total: Int
    var isDone: Bool
    var scale: WorkshopScale
    var timerRunning: Bool
    /// nil = keine Fragen (Vorschau)
    var questions: Int?
    var startTimer: (Int) -> Void
    var openQuestions: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 6) {
                    SpecLabel(meta, color: isDone ? .moss : .muted)
                    Text(String(format: "%02d", step.position + 1)).font(scale.title.monospacedDigit()).foregroundStyle(Color.muted).accessibilityHidden(true)
                    Text(step.title).font(scale.title).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)
                        .accessibilityLabel("Schritt \(step.position + 1) von \(total): \(step.title)")
                }
                if step.safety?.nilIfEmpty != nil || !(step.safetyKinds ?? []).isEmpty { safetyBox }
                if let media = step.media, !media.isEmpty { MediaStrip(media: media.map(\.asItem)) }
                if let body = step.body?.nilIfEmpty {
                    Text(body).font(scale.body).lineSpacing(6).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true).textSelection(.enabled)
                }
                if let tip = step.tip?.nilIfEmpty { tipBox(tip) }
                if let line = itemsLine { Text(line).font(.wr(.subheadline)).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true) }
                actions
            }
            .padding(.horizontal, Space.gutter)
            .padding(.vertical, 22)
        }
    }

    private var meta: String {
        var parts = ["Schritt \(step.position + 1) von \(total)"]
        if let m = step.minutes, m > 0 { parts.append("ca. \(Fmt.minutes(m))") }
        if isDone { parts.append("erledigt") }
        return parts.joined(separator: " · ")
    }

    private var itemsLine: String? {
        var parts: [String] = []
        if let m = step.materials, !m.isEmpty { parts.append("Material: \(m.joined(separator: ", "))") }
        if let t = step.tools, !t.isEmpty { parts.append("Werkzeug: \(t.joined(separator: ", "))") }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private var safetyBox: some View {
        VStack(alignment: .leading, spacing: 6) {
            let kinds = (step.safetyKinds ?? []).map { L.safety($0).label }
            SpecLabel(kinds.isEmpty ? "Sicherheit" : "Sicherheit · \(kinds.joined(separator: ", "))", color: .danger)
            if let text = step.safety?.nilIfEmpty {
                Text(text).font(scale.body).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.danger.opacity(0.08), in: .rect(cornerRadius: Radius.inner, style: .continuous))
        .overlay(alignment: .leading) { Rectangle().fill(Color.danger).frame(width: 4) }
        .clipShape(.rect(cornerRadius: Radius.inner, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    private func tipBox(_ tip: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            SpecLabel("Tipp", color: .mossInk)
            Text(tip).font(scale.body).foregroundStyle(Color.ink2).fixedSize(horizontal: false, vertical: true)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.mossSoft, in: .rect(cornerRadius: Radius.inner, style: .continuous))
        .overlay(alignment: .leading) { Rectangle().fill(Color.moss).frame(width: 4) }
        .clipShape(.rect(cornerRadius: Radius.inner, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private var actions: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let m = step.minutes, m > 0, !timerRunning {
                Button { startTimer(m) } label: {
                    Label("Timer \(Fmt.minutes(m)) starten", systemImage: "timer")
                        .font(.wr(.body, .semibold)).foregroundStyle(Color.ink)
                        .padding(.horizontal, 18).frame(height: 48)
                        .overlay(Capsule().strokeBorder(Color.lineStrong, lineWidth: 1))
                }
                .buttonStyle(.pressable)
            }
            if let n = questions {
                Button(action: openQuestions) {
                    Label(n > 0 ? "Fragen zu diesem Schritt (\(n))" : "Frage zu diesem Schritt", systemImage: "questionmark.bubble")
                        .font(.wr(.footnote, .semibold)).foregroundStyle(Color.ink)
                }
                .buttonStyle(.plain)
                .frame(minHeight: 44)
            }
        }
    }
}

// MARK: - Abschluss

private struct WorkshopEndPage: View {
    var doneCount: Int
    var total: Int
    var completed: Bool
    var canComplete: Bool
    var scale: WorkshopScale
    var complete: () async -> Void
    var back: () -> Void

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                Image(systemName: "checkmark")
                    .font(.wr(size: 30, weight: .bold))
                    .foregroundStyle(Color.paper)
                    .frame(width: 64, height: 64)
                    .background(Color.moss, in: Circle())
                    .accessibilityHidden(true)
                Text(completed ? "Nachgebaut!" : "Alle Schritte durch").font(scale.title).foregroundStyle(Color.ink).accessibilityAddTraits(.isHeader)
                Text("\(doneCount) von \(total) Schritten erledigt. \(completed ? "Zeig dein Ergebnis als Projekt." : "Markiere die Anleitung als nachgebaut, damit andere sehen, dass sie funktioniert.")")
                    .font(scale.body).foregroundStyle(Color.ink2).multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
                VStack(spacing: 10) {
                    if !completed && canComplete {
                        AsyncButton { await complete() } label: { Label("Als nachgebaut markieren", systemImage: "checkmark.seal") }
                            .primaryButton()
                    }
                    Button("Zurück zur Anleitung", action: back)
                        .font(.wr(.body, .semibold)).foregroundStyle(Color.ink)
                        .frame(maxWidth: .infinity).frame(height: 52)
                        .overlay(Capsule().strokeBorder(Color.lineStrong, lineWidth: 1))
                }
                .padding(.top, 8)
            }
            .padding(.horizontal, Space.gutter)
            .padding(.vertical, 32)
        }
    }
}

// MARK: - Timer-Auswahl

private struct WorkshopTimerSheet: View {
    var step: TutorialPageStep?
    var running: WorkshopTimer?
    var start: (Double, String) -> Void
    var stop: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var custom = ""
    private static let presets = [1, 5, 10, 15, 30, 60]

    private var customMinutes: Int? {
        guard let v = Int(custom.trimmed), v >= 1, v <= 24 * 60 else { return nil }
        return v
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    if let running { runningCard(running) }
                    if let s = step, let m = s.minutes, m > 0 {
                        Button { start(Double(m), "Schritt \(s.position + 1)") } label: {
                            Label("\(Fmt.minutes(m)) für diesen Schritt", systemImage: "timer").frame(maxWidth: .infinity)
                        }
                        .primaryButton()
                    }
                    presetGrid
                    customRow
                    Text("Läuft weiter, auch wenn du die Schritte wechselst oder die App verlässt. Am Ende kommt eine Mitteilung mit Ton – sofern du Mitteilungen erlaubst.")
                        .font(.wr(.footnote)).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, Space.gutter)
                .padding(.vertical, 16)
            }
            .background(Color.paper)
            .navigationTitle("Timer")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Fertig") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
    }

    private func runningCard(_ t: WorkshopTimer) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                SpecLabel(t.label)
                TimelineView(.periodic(from: .now, by: 1)) { ctx in
                    Text(WorkshopTimer.clock(t.endsAt.timeIntervalSince(ctx.date))).font(.wr(.largeTitle, .semibold).monospacedDigit()).foregroundStyle(Color.ink)
                }
            }
            Spacer()
            Button("Timer stoppen", role: .destructive, action: stop)
                .font(.wr(.subheadline, .semibold))
                .frame(minHeight: 44)
        }
        .padding(16)
        .cardSurface()
    }

    private var presetGrid: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 92), spacing: 10)], spacing: 10) {
            ForEach(Self.presets, id: \.self) { m in
                Button { start(Double(m), "\(m) min") } label: {
                    Text("\(m) min").font(.wr(.body, .semibold).monospacedDigit()).foregroundStyle(Color.ink)
                        .frame(maxWidth: .infinity).frame(height: 48)
                        .overlay(Capsule().strokeBorder(Color.lineStrong, lineWidth: 1))
                        .contentShape(Capsule())
                }
                .buttonStyle(.pressable)
            }
        }
    }

    private var customRow: some View {
        HStack(spacing: 10) {
            TextField("Eigene Minuten", text: $custom)
                .keyboardType(.numberPad)
                .font(.wr(.body).monospacedDigit())
                .padding(.horizontal, 14).frame(height: 48)
                .background(Color.sunken, in: Capsule())
                .accessibilityLabel("Eigene Minuten, 1 bis 1440")
            Button("Start") { if let m = customMinutes { start(Double(m), "\(m) min") } }
                .font(.wr(.body, .semibold)).foregroundStyle(Color.ink)
                .padding(.horizontal, 20).frame(height: 48)
                .overlay(Capsule().strokeBorder(Color.lineStrong, lineWidth: 1))
                .disabled(customMinutes == nil)
                .opacity(customMinutes == nil ? 0.4 : 1)
        }
    }
}
