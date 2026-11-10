import SwiftUI

// MARK: - Creator Pro (Studio, §5)
// Status, Vorteile und Verwaltung. App-Store-Regel 3.1.1: Creator Pro ist ein digitales Abo –
// in der App deshalb KEIN Kaufen-Button, KEINE Preise zum Abschliessen und KEIN Link zum Web-Checkout.
// Wer im Web abschliesst, ist in der App automatisch Pro.

struct MeProOverview: Decodable, Sendable {
    struct Status: Decodable, Sendable {
        var active: Bool
        var interval: String?
        var status: String?
        var provider: String?
        var periodEnd: Date?
        var cancelAtPeriodEnd: Bool?
        var priceMinor: Int?
        var currency: String?
        var pastDue: Bool?
    }
    var status: Status
    var enabled: Bool?
    var featuredProjectIds: [String]
    var mediaKitPublic: Bool
    var mediaKitUrl: String?
    var featuredMax: Int?
}

private struct MeProBenefit: Identifiable {
    var id: String { title }
    var symbol: String
    var title: String
    var text: String
}

struct StudioProView: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @State private var data: MeProOverview?
    @State private var projects: [MeStudioProject] = []
    @State private var error: String?
    @State private var selection: [String] = []
    @State private var mediaKitPublic = false
    @State private var confirmCancel = false

    private func benefits(max: Int) -> [MeProBenefit] {
        [
            MeProBenefit(symbol: "rectangle.3.group", title: "Profil mit Schaufenster", text: "Bis zu \(max) Projekte ganz oben in deinem Profil hervorheben – und das Pro-Kennzeichen neben deinem Namen."),
            MeProBenefit(symbol: "doc.richtext", title: "Medienkit für Kooperationen", text: "Eine Seite mit deinen besten Arbeiten und echten, erklärten Zahlen. Teilbar per Link, druckbar als PDF."),
            MeProBenefit(symbol: "chart.bar.xaxis", title: "Statistik über 12 Monate", text: "Verläufe über ein ganzes Jahr statt 12 Wochen – und alle Zahlen als CSV für Excel oder Numbers."),
            MeProBenefit(symbol: "film", title: "Längere Videos", text: "Längere und grössere Videos in Beiträgen, Projekten und Anleitungen."),
            MeProBenefit(symbol: "percent", title: "Tiefere Provision im Shop", text: "Eine tiefere Plattformprovision auf den Warenwert jedes Verkaufs."),
        ]
    }

    var body: some View {
        MePhase(value: data, error: error, retry: load) { d in content(d) }
            .background(Color.paper)
            .navigationTitle("Creator Pro")
            .navigationBarTitleDisplayMode(.inline)
            .task { if data == nil { await load() } }
            .refreshable { await load() }
            .confirmationDialog("Creator Pro kündigen?", isPresented: $confirmCancel, titleVisibility: .visible) {
                Button("Kündigen", role: .destructive) { Task { await setCancel(true) } }
                Button("Pro behalten", role: .cancel) {}
            } message: {
                Text("Pro bleibt \(endLabel.map { "bis zum \($0)" } ?? "bis zum Ende der Laufzeit") aktiv. Danach werden hervorgehobene Projekte und das Medienkit ausgeblendet – deine Inhalte bleiben erhalten.")
            }
    }

    private var endLabel: String? { data?.status.periodEnd.map { Fmt.date($0, style: .long) } }

    private func load() async {
        do {
            let d: MeProOverview = try await APIClient.shared.get("/studio/pro")
            if d.status.active {
                let all: [MeStudioProject] = (try? await APIClient.shared.get("/studio/projects")) ?? projects
                projects = Array(all.filter { $0.state == "PUBLISHED" && $0.visibility == "PUBLIC" }
                    .sorted { ($0.viewCount ?? 0) > ($1.viewCount ?? 0) }
                    .prefix(24))
            }
            selection = d.featuredProjectIds.filter { id in projects.contains { $0.id == id } }
            mediaKitPublic = d.mediaKitPublic
            withAnimation(.smooth) { data = d }
            error = nil
        } catch is CancellationError {
        } catch {
            if data == nil { self.error = MeErr.text(error) } else { app.show(error: error) }
        }
    }

    private func content(_ d: MeProOverview) -> some View {
        let max = d.featuredMax ?? 3
        return ScrollView {
            VStack(alignment: .leading, spacing: 26) {
                VStack(alignment: .leading, spacing: 10) {
                    PageTitle(kicker: "Werkuno Studio", title: "Creator Pro", subtitle: "Werkzeuge für Menschen, die mit ihren Projekten wachsen wollen – Schaufenster, Medienkit, Jahresstatistik, längere Videos und eine tiefere Shop-Provision.")
                    if d.status.active { Pill(text: "Aktiv", symbol: "seal.fill", tint: .moss) }
                }

                if d.status.active {
                    if d.status.pastDue == true {
                        NoticeView(tone: .warn, title: "Zahlung fehlgeschlagen", message: "Die letzte Zahlung konnte nicht eingezogen werden. Bitte aktualisiere dein Zahlungsmittel – Pro bleibt solange aktiv.")
                    }
                    subscription(d)
                    showcase(max: max, initial: d.featuredProjectIds)
                    mediaKit(d)
                    VStack(alignment: .leading, spacing: 12) {
                        SectionHeader("Alles, was Pro freischaltet", number: "03")
                        benefitList(max: max)
                        Button { router.open(.studioSection(.stats)) } label: { Label("Zur Statistik", systemImage: "arrow.right") }
                            .font(.wr(.subheadline, .semibold)).foregroundStyle(Color.moss)
                    }
                } else {
                    VStack(alignment: .leading, spacing: 10) {
                        Label("Für dein Konto nicht aktiv", systemImage: "seal").font(.wr(.headline, .semibold)).foregroundStyle(Color.ink)
                        Text("Du nutzt alle Grundfunktionen von Werkuno. Ist Creator Pro für dein Konto aktiv, kannst du hier Schaufenster, Medienkit und Abo verwalten.")
                            .font(.wr(.subheadline)).foregroundStyle(Color.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .cardSurface()
                    VStack(alignment: .leading, spacing: 12) {
                        SectionHeader("Das bietet Creator Pro")
                        benefitList(max: max)
                    }
                }

                fairNote
            }
            .padding(.horizontal, Space.gutter)
            .padding(.bottom, 40)
        }
    }

    // MARK: Abo

    private func subscription(_ d: MeProOverview) -> some View {
        let s = d.status
        let plan: String = {
            if s.provider == "comp" { return "Geschenkt von Werkuno" + (endLabel.map { " · gültig bis \($0)" } ?? " · unbefristet") }
            var t = s.interval == "year" ? "Jährlich" : "Monatlich"
            if let p = s.priceMinor { t += " · \(Fmt.money(p, currency: s.currency ?? "CHF"))" }
            if let e = endLabel { t += s.cancelAtPeriodEnd == true ? " · gekündigt, aktiv bis \(e)" : " · nächste Abrechnung am \(e)" }
            return t
        }()
        return VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                SpecLabel("Dein Abo")
                Text(plan).font(.wr(.headline, .semibold)).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
                if s.provider == "simulated" { Text("Testmodus – es wird nichts abgebucht.").font(.wr(.caption)).foregroundStyle(Color.muted) }
            }
            if s.provider != "comp" {
                if s.cancelAtPeriodEnd == true {
                    AsyncButton { await setCancel(false) } label: { Text("Kündigung zurücknehmen").frame(maxWidth: .infinity) }
                        .primaryButton()
                } else {
                    Button("Abo kündigen", role: .destructive) { confirmCancel = true }
                        .font(.wr(.subheadline, .semibold))
                        .foregroundStyle(Color.danger)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
    }

    private func setCancel(_ cancel: Bool) async {
        let ok = await app.run(cancel ? "Gekündigt – Pro bleibt bis zum Ende der Laufzeit aktiv." : "Schön, dass du bleibst! Die Kündigung ist zurückgenommen.") {
            _ = try await APIClient.shared.post("/studio/pro/cancel", ["cancel": JSONValue.bool(cancel)]) as JSONValue
        }
        if ok { await load() }
    }

    // MARK: 01 Schaufenster

    private func showcase(max: Int, initial: [String]) -> some View {
        let saved = initial.filter { id in projects.contains { $0.id == id } }
        let dirty = selection != saved
        return VStack(alignment: .leading, spacing: 12) {
            SectionHeader("Schaufenster im Profil", number: "01", subtitle: "Wähle bis zu \(max) Projekte, die ganz oben in deinem Profil erscheinen – deine besten Arbeiten zuerst.")
            if projects.isEmpty {
                Text("Veröffentliche ein öffentliches Projekt, um es hier hervorzuheben.").font(.wr(.subheadline)).foregroundStyle(Color.muted)
            } else {
                AdaptiveGrid(spacing: 12, rowSpacing: 14) {
                    ForEach(projects) { p in showcaseTile(p, max: max) }
                }
                HStack(spacing: 12) {
                    AsyncButton { await saveFeatured() } label: { Text("Speichern").font(.wr(.subheadline, .semibold)) }
                        .buttonStyle(.glassProminent).tint(.action)
                        .disabled(!dirty)
                    Text("\(selection.count) von \(max) gewählt · Reihenfolge = Reihenfolge der Auswahl")
                        .font(.wr(.caption)).foregroundStyle(Color.muted)
                }
            }
        }
    }

    private func showcaseTile(_ p: MeStudioProject, max: Int) -> some View {
        let index = selection.firstIndex(of: p.id)
        let on = index != nil
        let blocked = !on && selection.count >= max
        return Button {
            Haptics.selection()
            withAnimation(.snappy) {
                if on { selection.removeAll { $0 == p.id } } else if !blocked { selection.append(p.id) }
            }
        } label: {
            VStack(alignment: .leading, spacing: 6) {
                CoverView(url: p.coverUrl, seed: p.id, category: p.category, showLabel: false)
                    .aspectRatio(4 / 3, contentMode: .fit)
                    .clipShape(.rect(cornerRadius: Radius.inner, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: Radius.inner, style: .continuous).strokeBorder(on ? Color.moss : Color.clear, lineWidth: 2.5))
                    .overlay(alignment: .topTrailing) {
                        Text(index.map { "\($0 + 1)" } ?? "")
                            .font(.wr(.caption, .bold)).monospacedDigit()
                            .foregroundStyle(Color.paper)
                            .frame(width: 24, height: 24)
                            .background(on ? Color.moss : Color.card.opacity(0.85), in: Circle())
                            .padding(8)
                    }
                Text(p.title).font(.wr(.footnote, .medium)).foregroundStyle(Color.ink).a11yLineLimit(1)
            }
            .opacity(blocked ? 0.45 : 1)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .disabled(blocked)
        .accessibilityLabel(p.title)
        .accessibilityValue(index.map { "Ausgewählt, Platz \($0 + 1)" } ?? "Nicht ausgewählt")
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private func saveFeatured() async {
        let ok = await app.run("Hervorgehobene Projekte gespeichert.") {
            _ = try await APIClient.shared.put("/studio/pro/featured", ["ids": JSONValue.from(selection)]) as JSONValue
        }
        if ok { await load() }
    }

    // MARK: 02 Medienkit

    private func mediaKit(_ d: MeProOverview) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader("Medienkit", number: "02", subtitle: "Deine besten Arbeiten und echte Zahlen auf einer Seite – ideal für Anfragen von Marken, Läden oder Workshops. Teilbar per Link, druckbar als PDF.")
            VStack(alignment: .leading, spacing: 10) {
                Toggle(isOn: Binding(get: { mediaKitPublic }, set: { v in Task { await setMediaKit(v) } })) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Medienkit öffentlich").font(.wr(.body))
                        Text(mediaKitPublic ? "Öffentlich – jede Person mit dem Link kann es sehen" : "Privat – nur du siehst es")
                            .font(.wr(.caption)).foregroundStyle(Color.muted)
                    }
                }
                .tint(.moss)
                if let url = d.mediaKitUrl {
                    HStack(spacing: 16) {
                        Button { router.open(.web(path: url)) } label: { Label("Medienkit ansehen", systemImage: "arrow.up.right") }
                        if mediaKitPublic {
                            ShareLink(item: AppConfig.webURL(url)) { Label("Teilen", systemImage: "square.and.arrow.up") }
                        }
                    }
                    .font(.wr(.subheadline, .semibold)).foregroundStyle(Color.moss)
                }
            }
            .padding(16)
            .cardSurface()
        }
    }

    private func setMediaKit(_ value: Bool) async {
        let previous = mediaKitPublic
        withAnimation(.snappy) { mediaKitPublic = value }
        let ok = await app.run(value ? "Medienkit ist jetzt öffentlich." : "Medienkit ist jetzt privat.") {
            _ = try await APIClient.shared.put("/studio/pro/media-kit", ["public": JSONValue.bool(value)]) as JSONValue
        }
        if !ok { withAnimation(.snappy) { mediaKitPublic = previous } }
    }

    // MARK: Vorteile

    private func benefitList(max: Int) -> some View {
        VStack(spacing: 0) {
            ForEach(benefits(max: max)) { b in
                HStack(alignment: .top, spacing: 14) {
                    Image(systemName: b.symbol)
                        .font(.wr(size: 17, weight: .medium))
                        .foregroundStyle(Color.moss)
                        .frame(width: 38, height: 38)
                        .background(Color.mossSoft, in: .rect(cornerRadius: 11, style: .continuous))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(b.title).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink)
                        Text(b.text).font(.wr(.footnote)).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                }
                .padding(.vertical, 12)
                .accessibilityElement(children: .combine)
                .hairline()
            }
        }
    }

    private var fairNote: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "checkmark.shield").foregroundStyle(Color.moss)
            Text("**Fair für alle:** Projekte, Anleitungen, Communities und der Shop bleiben kostenlos. Pro kauft keine Reichweite – bezahlte Profile werden im Feed nicht bevorzugt.")
                .font(.wr(.footnote)).foregroundStyle(Color.ink2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .sunkenSurface()
    }
}
