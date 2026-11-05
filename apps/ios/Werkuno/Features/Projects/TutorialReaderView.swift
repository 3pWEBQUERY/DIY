import SwiftUI

/// Schritt-für-Schritt-Lesemodus im Vollbild: grosse Typografie, Bilder, Tipp, Sicherheit,
/// Material/Werkzeug je Schritt und Haken. Oben wächst der Fortschrittsfaden mit jedem Haken.
struct TutorialReaderView: View {
    var page: TutorialPage
    var startIndex: Int
    @Binding var done: Set<String>
    @Binding var completedAt: Date?
    var toggle: (TutorialPageStep) async -> Void
    var complete: () async -> Void
    var remix: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var index = 0
    @State private var reportStep: TutorialPageStep?
    @State private var celebrate = 0
    @State private var didSetStart = false

    private var steps: [TutorialPageStep] { page.steps }
    /// Letzte Seite = Abschluss
    private var pageCount: Int { steps.count + 1 }
    private var color: Color { CategoryPalette.color(for: page.category) }

    var body: some View {
        VStack(spacing: 0) {
            topBar
            TabView(selection: $index) {
                ForEach(Array(steps.enumerated()), id: \.element.id) { i, s in
                    stepPage(s, index: i).tag(i)
                }
                finishPage.tag(steps.count)
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .animation(.snappy, value: index)
        }
        .background(Color.paper.ignoresSafeArea())
        .safeAreaInset(edge: .bottom) { bottomBar }
        .sheet(item: $reportStep) { s in
            ReportSheet(targetType: "TUTORIAL_STEP", targetId: s.id, title: "Schritt \(s.position + 1): \(s.title)")
        }
        .onAppear {
            guard !didSetStart else { return }
            didSetStart = true
            index = min(max(0, startIndex), steps.count)
        }
        .onChange(of: index) { _, _ in Haptics.selection() }
    }

    // MARK: Kopf mit Fortschrittsfaden

    private var topBar: some View {
        VStack(spacing: 10) {
            HStack(spacing: 12) {
                Button { dismiss() } label: {
                    Image(systemName: "xmark").font(.body.weight(.semibold)).frame(width: 30, height: 30)
                }
                .buttonStyle(.glass)
                .buttonBorderShape(.circle)
                .accessibilityLabel("Lesemodus schliessen")
                VStack(alignment: .leading, spacing: 1) {
                    SpecLabel(index < steps.count ? "Schritt \(index + 1) von \(steps.count)" : "Abschluss", color: .moss)
                    Text(page.title).font(.footnote.weight(.semibold)).foregroundStyle(Color.ink).lineLimit(1)
                }
                Spacer(minLength: 0)
                Text("\(steps.filter { done.contains($0.stableKey) }.count)/\(steps.count)")
                    .font(.specLarge).monospacedDigit().foregroundStyle(Color.ink)
                    .contentTransition(.numericText())
                    .accessibilityLabel("\(steps.filter { done.contains($0.stableKey) }.count) von \(steps.count) erledigt")
            }
            TutorialProgressThread(steps: steps, done: done, current: index < steps.count ? index : nil) { i in
                withAnimation(.snappy) { index = i }
            }
        }
        .padding(.horizontal, Space.gutter)
        .padding(.top, 8)
        .padding(.bottom, 8)
        .background(Color.paper)
        .hairline()
    }

    // MARK: Schrittseite

    private func stepPage(_ s: TutorialPageStep, index i: Int) -> some View {
        let isDone = done.contains(s.stableKey)
        return ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                HStack(alignment: .firstTextBaseline, spacing: 14) {
                    Text(String(format: "%02d", i + 1))
                        .font(.system(size: 64, weight: .semibold, design: .serif)).monospacedDigit()
                        .foregroundStyle(isDone ? Color.moss : Color.ink)
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 4) {
                        if let m = s.minutes, m > 0 { SpecLabel("ca. \(Fmt.minutes(m))") }
                        if isDone { Label("Erledigt", systemImage: "checkmark.circle.fill").font(.caption.weight(.semibold)).foregroundStyle(Color.moss) }
                    }
                }
                Text(s.title)
                    .font(.system(.largeTitle, design: .serif).weight(.semibold))
                    .foregroundStyle(Color.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityLabel("Schritt \(i + 1): \(s.title)")

                if s.safety?.nilIfEmpty != nil || !(s.safetyKinds ?? []).isEmpty {
                    safetyBox(s)
                }

                if let media = s.media, !media.isEmpty {
                    MediaStrip(media: media.map(\.asItem))
                }

                if let body = s.body?.nilIfEmpty {
                    Text(body)
                        .font(.title3)
                        .lineSpacing(6)
                        .foregroundStyle(Color.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .textSelection(.enabled)
                }

                if let tip = s.tip?.nilIfEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        Label("Tipp aus der Werkstatt", systemImage: "lightbulb.fill").font(.caption.weight(.semibold)).foregroundStyle(Color.mossInk)
                        Text(tip).font(.body).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.mossSoft, in: .rect(cornerRadius: Radius.inner, style: .continuous))
                    .accessibilityElement(children: .combine)
                }

                let mats = s.materials ?? []
                let tls = s.tools ?? []
                if !mats.isEmpty || !tls.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        if !mats.isEmpty { itemList("Material in diesem Schritt", mats, symbol: "shippingbox") }
                        if !tls.isEmpty { itemList("Werkzeug", tls, symbol: "wrench.and.screwdriver") }
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .cardSurface()
                }

                HStack {
                    Spacer()
                    if !page.isOwner && page.preview != true {
                        Button { reportStep = s } label: {
                            Label("Fehler in diesem Schritt melden", systemImage: "flag").font(.caption).foregroundStyle(Color.muted)
                        }
                        .buttonStyle(.plain)
                        .frame(minHeight: 44)
                    }
                }
            }
            .padding(.horizontal, Space.gutter)
            .padding(.top, 20)
            .padding(.bottom, 30)
        }
    }

    private func safetyBox(_ s: TutorialPageStep) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(Color.danger)
                SpecLabel("Sicherheitshinweis", color: .danger)
            }
            if let kinds = s.safetyKinds, !kinds.isEmpty {
                FlowLayout(spacing: 6, lineSpacing: 6) {
                    ForEach(kinds, id: \.self) { k in
                        let x = L.safety(k)
                        Label(x.label, systemImage: x.symbol)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Color.danger)
                            .padding(.horizontal, 8).padding(.vertical, 4)
                            .overlay(Capsule().strokeBorder(Color.danger.opacity(0.4), lineWidth: 1))
                    }
                }
            }
            if let text = s.safety?.nilIfEmpty {
                Text(text).font(.body).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.danger.opacity(0.08), in: .rect(cornerRadius: Radius.inner, style: .continuous))
        .overlay(alignment: .leading) { Rectangle().fill(Color.danger).frame(width: 3) }
        .clipShape(.rect(cornerRadius: Radius.inner, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    private func itemList(_ title: String, _ items: [String], symbol: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            SpecLabel(title)
            ForEach(items, id: \.self) { m in
                Label(m, systemImage: symbol).font(.subheadline).foregroundStyle(Color.ink2)
            }
        }
    }

    // MARK: Abschlussseite

    private var finishPage: some View {
        let count = steps.filter { done.contains($0.stableKey) }.count
        return ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                ThreeCanvas(scene: .knot(color: .moss), celebrateToken: celebrate)
                    .frame(height: 260)
                    .frame(maxWidth: .infinity)
                SpecLabel("Ende der Anleitung", color: .ink)
                Text(completedAt != nil ? "Nachgebaut – stark!" : count == steps.count && !steps.isEmpty ? "Alle Schritte erledigt." : "Fertig gebaut?")
                    .font(.system(.largeTitle, design: .serif).weight(.semibold))
                    .foregroundStyle(Color.ink)
                Text(completedAt != nil ? "Zeig, wie dein Stück geworden ist: Lege ein eigenes Projekt an. Es verweist auf das Original." : "Markiere die Anleitung als nachgebaut und dokumentiere deine Version als Projekt – mit deinen Abweichungen.")
                    .font(.body).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
                if count < steps.count {
                    Text("Noch offen: \(Fmt.plural(steps.count - count, "Schritt", "Schritte")).").font(.footnote).foregroundStyle(Color.muted)
                }
                VStack(spacing: 10) {
                    if completedAt == nil && !page.isOwner && page.preview != true {
                        AsyncButton {
                            await complete()
                            if completedAt != nil { celebrate += 1 }
                        } label: { Label("Als nachgebaut markieren", systemImage: "checkmark.seal") }
                            .primaryButton()
                    }
                    if !page.isOwner {
                        Button { remix() } label: {
                            Label("Eigenes Nachbauprojekt erstellen", systemImage: "arrow.triangle.branch").font(.subheadline.weight(.semibold)).frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.glass)
                        .controlSize(.large)
                    }
                    Button("Zur Übersicht") { dismiss() }
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.moss)
                        .frame(minHeight: 44)
                }
                .padding(.top, 6)
            }
            .padding(.horizontal, Space.gutter)
            .padding(.vertical, 20)
        }
    }

    // MARK: Untere Glas-Leiste

    private var bottomBar: some View {
        GlassEffectContainer(spacing: 10) {
            HStack(spacing: 10) {
                Button { withAnimation(.snappy) { index = max(0, index - 1) } } label: {
                    Image(systemName: "chevron.left").font(.body.weight(.semibold)).frame(width: 30, height: 30)
                }
                .buttonStyle(.glass)
                .buttonBorderShape(.circle)
                .controlSize(.large)
                .disabled(index == 0)
                .accessibilityLabel("Vorheriger Schritt")

                if let s = steps[safe: index] {
                    let isDone = done.contains(s.stableKey)
                    AsyncButton {
                        await toggle(s)
                        if !isDone, done.contains(s.stableKey), index < steps.count {
                            try? await Task.sleep(for: .milliseconds(380))
                            withAnimation(.snappy) { index += 1 }
                        }
                    } label: {
                        Label(isDone ? "Erledigt" : "Schritt erledigt", systemImage: isDone ? "checkmark.circle.fill" : "circle")
                            .contentTransition(.symbolEffect(.replace))
                    }
                    .font(.body.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 4)
                    .buttonStyle(.glassProminent)
                    .tint(isDone ? .moss : .ink)
                    .controlSize(.large)
                    .disabled(page.preview == true)
                    .accessibilityAddTraits(isDone ? .isSelected : [])
                    .accessibilityHint(isDone ? "Als offen markieren" : "Als erledigt markieren und weiter")
                } else {
                    Button { dismiss() } label: { Label("Fertig", systemImage: "checkmark") }
                        .primaryButton()
                }

                Button { withAnimation(.snappy) { index = min(pageCount - 1, index + 1) } } label: {
                    Image(systemName: "chevron.right").font(.body.weight(.semibold)).frame(width: 30, height: 30)
                }
                .buttonStyle(.glass)
                .buttonBorderShape(.circle)
                .controlSize(.large)
                .disabled(index >= pageCount - 1)
                .accessibilityLabel("Nächster Schritt")
            }
        }
        .padding(.horizontal, Space.gutter)
        .padding(.top, 8)
        .padding(.bottom, 6)
    }
}
