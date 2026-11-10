import SwiftUI

// MARK: - Auszahlungen (Studio → Einnahmen, §6)
// Guthaben, Auszahlung beantragen, Auszahlungsplan, Bankkonto und Verlauf – ohne Stripe-Dashboard.
// Web-Gegenstück: `components/commerce/payout-panel.tsx` auf `/studio/einnahmen#auszahlungen`.

struct MePayoutOverview: Decodable, Sendable {
    struct Schedule: Decodable, Sendable, Hashable {
        var interval: String
        var weeklyAnchor: String?
        var monthlyAnchor: Int?
    }
    struct Bank: Decodable, Sendable, Equatable {
        var name: String?
        var last4: String
        var currency: String?
    }
    struct Payout: Decodable, Sendable, Identifiable, Hashable {
        var id: String
        var amountMinor: Int
        var currency: String?
        var status: String
        var arrivalAt: Date?
        var createdAt: Date?
        var automatic: Bool?
        var failureMessage: String?
    }
    var mode: String
    var connected: Bool
    var payoutsEnabled: Bool
    var currency: String
    var available: Int
    var pending: Int
    var schedule: Schedule?
    var bank: Bank?
    var payouts: [Payout]
    var unavailable: Bool?
}

private struct MePayoutRequestResult: Decodable { var amountMinor: Int; var currency: String?; var arrivalAt: Date? }
private struct MeBankLink: Decodable { var url: String }

enum MePayoutLabels {
    static let intervals: [(key: String, label: String)] = [("manual", "Auf Anfrage"), ("daily", "Täglich"), ("weekly", "Wöchentlich"), ("monthly", "Monatlich")]
    static let weekdays: [(key: String, label: String)] = [("monday", "Montag"), ("tuesday", "Dienstag"), ("wednesday", "Mittwoch"), ("thursday", "Donnerstag"), ("friday", "Freitag")]

    static func status(_ s: String) -> String {
        switch s {
        case "pending": "In Vorbereitung"
        case "in_transit": "Unterwegs"
        case "paid": "Gutgeschrieben"
        case "failed": "Fehlgeschlagen"
        case "canceled": "Storniert"
        default: s
        }
    }

    static func tone(_ s: String) -> MeStatePill.Tone {
        switch s {
        case "paid": .moss
        case "failed": .danger
        case "canceled": .neutral
        default: .warn
        }
    }

    static func longDay(_ d: Date) -> String {
        d.formatted(.dateTime.weekday(.wide).day().month(.wide).locale(Fmt.locale))
    }
}

/// Auszahlungs-Bereich der Einnahmen-Seite. Lädt `/studio/payouts` selbst.
/// `reloadKey` ändern (z. B. bei Pull-to-Refresh), um neu zu laden; `onChanged` nach einer Auszahlung.
struct StudioPayoutPanel: View {
    var reloadKey: Int = 0
    var onChanged: () async -> Void = {}
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @Environment(\.openURL) private var openURL
    @State private var data: MePayoutOverview?
    @State private var error: String?
    @State private var requesting = false
    @State private var openingBank = false

    var body: some View {
        Group {
            if let data { content(data) }
            else if let error { ErrorStateView(message: error) { await load() } }
            else { ProgressView().frame(maxWidth: .infinity, minHeight: 120) }
        }
        .task(id: reloadKey) { await load() }
        .sheet(isPresented: $requesting) {
            if let data {
                MePayoutRequestSheet(data: data) {
                    await load()
                    await onChanged()
                }
                .meSheetEnvironment(app, router)
            }
        }
    }

    private func load() async {
        do {
            let d: MePayoutOverview = try await APIClient.shared.get("/studio/payouts")
            withAnimation(.smooth) { data = d }
            error = nil
        } catch is CancellationError {
        } catch {
            if data == nil { self.error = MeErr.text(error) } else { app.show(error: error) }
        }
    }

    @ViewBuilder private func content(_ d: MePayoutOverview) -> some View {
        if d.mode == "disabled" {
            EmptyView()
        } else if !d.connected || !d.payoutsEnabled {
            VStack(alignment: .leading, spacing: 10) {
                Label("Auszahlungen", systemImage: "banknote").font(.wr(.headline, .semibold)).foregroundStyle(Color.ink)
                Text(d.connected
                     ? "Stripe prüft dein Auszahlungskonto noch. Sobald Auszahlungen freigeschaltet sind, kannst du dein Guthaben hier auszahlen lassen."
                     : "Verbinde zuerst ein Auszahlungskonto, damit du Einnahmen auf dein Bankkonto auszahlen lassen kannst.")
                    .font(.wr(.subheadline)).foregroundStyle(Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
                Button { router.open(.studioSection(.shop)) } label: { Label("Zur Shopverwaltung", systemImage: "arrow.up.right") }
                    .font(.wr(.subheadline, .semibold)).foregroundStyle(Color.moss)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .cardSurface()
            history(d)
        } else {
            VStack(alignment: .leading, spacing: 0) {
                if d.unavailable == true {
                    NoticeView(tone: .warn, title: "Stripe ist gerade nicht erreichbar", message: "Guthaben und Auszahlungsplan können im Moment nicht geladen werden. Bitte versuche es in ein paar Minuten erneut.")
                        .padding([.horizontal, .top], 14)
                }
                balance(d).padding(16)
                Rectangle().fill(Color.line).frame(height: 0.75)
                MePayoutSchedulePicker(schedule: d.schedule, disabled: d.unavailable == true) { await load() }
                    .id(d.schedule)
                    .padding(16)
                Rectangle().fill(Color.line).frame(height: 0.75)
                bank(d).padding(16)
            }
            .cardSurface()
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Guthaben und Auszahlungen")
            history(d)
        }
    }

    private func balance(_ d: MePayoutOverview) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SpecLabel("Verfügbares Guthaben")
            Text(Fmt.money(d.available, currency: d.currency))
                .font(.wr(size: 36, weight: .bold)).monospacedDigit()
                .foregroundStyle(Color.ink)
                .contentTransition(.numericText())
            Text(d.pending > 0
                 ? "+ \(Fmt.money(d.pending, currency: d.currency)) in Bearbeitung – wird nach der Sperrfrist von Stripe verfügbar"
                 : "Alles Verfügbare kann ausgezahlt werden.")
                .font(.wr(.footnote)).foregroundStyle(Color.muted)
                .fixedSize(horizontal: false, vertical: true)
            Button { requesting = true } label: {
                Label("Auszahlung beantragen", systemImage: "banknote").frame(maxWidth: .infinity)
            }
            .primaryButton()
            .disabled(d.available < 100 || d.unavailable == true)
            .padding(.top, 4)
            if d.mode == "simulated" {
                Text("Testmodus: Es fliesst kein echtes Geld.").font(.wr(.caption)).foregroundStyle(Color.muted)
            }
        }
    }

    private func bank(_ d: MePayoutOverview) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Bankkonto", systemImage: "building.columns").font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink)
            if let b = d.bank {
                HStack(spacing: 8) {
                    Text(b.name ?? "Bankkonto").font(.wr(.subheadline, .medium))
                    Text("···· \(b.last4)").font(.wr(.subheadline)).monospacedDigit().foregroundStyle(Color.muted)
                    if let c = b.currency { MeStatePill(text: c, tone: .neutral) }
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(b.name ?? "Bankkonto"), endet auf \(b.last4)")
            } else {
                Text("Noch kein Bankkonto hinterlegt.").font(.wr(.subheadline)).foregroundStyle(Color.muted)
            }
            if d.mode == "stripe" {
                Button { Task { await openBankLink() } } label: {
                    HStack(spacing: 6) {
                        if openingBank { ProgressView().controlSize(.mini) }
                        Text(d.bank == nil ? "Bankkonto hinterlegen" : "Bankkonto ändern")
                        Image(systemName: "arrow.up.right").font(.wr(.caption, .semibold))
                    }
                }
                .font(.wr(.subheadline, .semibold)).foregroundStyle(Color.moss)
                .disabled(openingBank)
            }
            Text("Aus Sicherheitsgründen wird die IBAN im gesicherten Formular unseres Zahlungspartners Stripe erfasst.")
                .font(.wr(.caption)).foregroundStyle(Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder private func history(_ d: MePayoutOverview) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader("Auszahlungen", subtitle: d.payouts.isEmpty ? nil : "Letzte \(d.payouts.count)")
            if d.payouts.isEmpty {
                Text(d.connected ? "Noch keine Auszahlungen. Du wirst über jede Auszahlung benachrichtigt – auch über automatische." : "Noch kein Auszahlungskonto verbunden.")
                    .font(.wr(.footnote)).foregroundStyle(Color.muted)
            } else {
                VStack(spacing: 0) {
                    ForEach(d.payouts) { p in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(Fmt.money(p.amountMinor, currency: p.currency ?? d.currency)).font(.wr(.body, .semibold)).monospacedDigit()
                                Spacer()
                                MeStatePill(text: MePayoutLabels.status(p.status), tone: MePayoutLabels.tone(p.status))
                            }
                            Text(subtitle(p)).font(.wr(.caption)).foregroundStyle(Color.muted)
                            if let f = p.failureMessage { Text(f).font(.wr(.caption)).foregroundStyle(Color.danger) }
                        }
                        .padding(.vertical, 10)
                        .accessibilityElement(children: .combine)
                        .hairline()
                    }
                }
            }
        }
        .padding(.top, 6)
    }

    private func subtitle(_ p: MePayoutOverview.Payout) -> String {
        var parts = [p.automatic == false ? "Beantragt" : "Automatisch"]
        if let c = p.createdAt { parts.append(Fmt.date(c)) }
        if let a = p.arrivalAt, p.status != "failed", p.status != "canceled" {
            parts.append("\(p.status == "paid" ? "gutgeschrieben am" : "Ankunft ca.") \(Fmt.date(a))")
        }
        return parts.joined(separator: " · ")
    }

    private func openBankLink() async {
        openingBank = true
        defer { openingBank = false }
        do {
            let r: MeBankLink = try await APIClient.shared.post("/studio/payouts/bank-link")
            if let url = URL(string: r.url) { openURL(url) }
        } catch { app.show(error: error) }
    }
}

// MARK: Auszahlungsplan

private struct MePayoutSchedulePicker: View {
    var schedule: MePayoutOverview.Schedule?
    var disabled: Bool
    var onSaved: () async -> Void
    @Environment(AppState.self) private var app
    @State private var interval = "daily"
    @State private var weekly = "monday"
    @State private var monthly = 1
    @State private var saving = false

    private var dirty: Bool {
        guard let s = schedule else { return false }
        return interval != s.interval
            || (interval == "weekly" && weekly != (s.weeklyAnchor ?? "monday"))
            || (interval == "monthly" && monthly != (s.monthlyAnchor ?? 1))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Auszahlungsplan", systemImage: "calendar.badge.clock").font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink)
            Picker("Auszahlungsplan", selection: $interval) {
                ForEach(MePayoutLabels.intervals, id: \.key) { Text($0.label).tag($0.key) }
            }
            .pickerStyle(.segmented)
            .disabled(disabled || saving)
            if interval == "weekly" {
                Picker("Wochentag", selection: $weekly) {
                    ForEach(MePayoutLabels.weekdays, id: \.key) { Text("jeden \($0.label)").tag($0.key) }
                }
                .tint(.ink)
            } else if interval == "monthly" {
                Picker("Tag im Monat", selection: $monthly) {
                    ForEach(1...28, id: \.self) { Text("am \($0). des Monats").tag($0) }
                }
                .tint(.ink)
            }
            Text("\(interval == "manual" ? "Du entscheidest, wann ausgezahlt wird." : interval == "daily" ? "Verfügbares Guthaben geht täglich automatisch raus." : "Verfügbares Guthaben geht automatisch raus.") Über jede Auszahlung wirst du benachrichtigt.")
                .font(.wr(.footnote)).foregroundStyle(Color.muted)
                .fixedSize(horizontal: false, vertical: true)
            if dirty {
                AsyncButton { await save() } label: { Text("Speichern").font(.wr(.subheadline, .semibold)) }
                    .buttonStyle(.glassProminent).tint(.action)
                    .transition(.opacity)
            }
        }
        .animation(.snappy, value: interval)
        .onAppear {
            interval = schedule?.interval ?? "daily"
            weekly = schedule?.weeklyAnchor ?? "monday"
            monthly = schedule?.monthlyAnchor ?? 1
        }
    }

    private func save() async {
        saving = true
        defer { saving = false }
        let body: [String: JSONValue] = [
            "interval": .string(interval),
            "weeklyAnchor": interval == "weekly" ? .string(weekly) : .null,
            "monthlyAnchor": interval == "monthly" ? .from(monthly) : .null,
        ]
        if await app.run("Auszahlungsplan gespeichert.", { _ = try await APIClient.shared.put("/studio/payouts/schedule", body) as JSONValue }) {
            await onSaved()
        }
    }
}

// MARK: Auszahlung beantragen

private struct MePayoutRequestSheet: View {
    var data: MePayoutOverview
    var onDone: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var app
    @State private var amount = ""
    @State private var error: String?

    private var minor: Int? { Fmt.parseMoney(amount) }
    private var automatic: Bool { (data.schedule?.interval ?? "manual") != "manual" }
    private var valid: Bool { if let m = minor { m >= 100 && m <= data.available } else { false } }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack {
                        TextField("Betrag", text: $amount)
                            .keyboardType(.decimalPad)
                            .font(.wr(.title3, .semibold).monospacedDigit())
                        Button("Alles") { amount = Fmt.moneyInput(data.available) }
                            .buttonStyle(.glass)
                            .controlSize(.small)
                    }
                    if !amount.isEmpty && !valid {
                        Text((minor ?? 0) > data.available ? "Höher als dein verfügbares Guthaben." : "Mindestens 1.00.")
                            .font(.wr(.caption)).foregroundStyle(Color.danger)
                    }
                } header: { Text("Betrag in \(data.currency)") } footer: {
                    Text("Verfügbar: \(Fmt.money(data.available, currency: data.currency))")
                }
                if let b = data.bank {
                    Section {
                        Text("Auf \(b.name ?? "dein Bankkonto") ···· \(b.last4) · Gutschrift meist nach 1–3 Bankarbeitstagen.")
                            .font(.wr(.subheadline)).foregroundStyle(Color.ink2)
                    }
                }
                if automatic {
                    Section {
                        NoticeView(tone: .info, title: "Auszahlungsplan wird umgestellt", message: "Du hast automatische Auszahlungen eingestellt. Für eine Auszahlung auf Anfrage stellen wir deinen Plan auf „Auf Anfrage“ um – du kannst ihn jederzeit wieder ändern.")
                            .listRowInsets(EdgeInsets())
                            .listRowBackground(Color.clear)
                    }
                }
                if let error {
                    Section { Text(error).font(.wr(.subheadline)).foregroundStyle(Color.danger) }
                }
                Section {
                    AsyncButton { await submit() } label: {
                        Text(valid ? "\(automatic ? "Umstellen und " : "")\(Fmt.money(minor ?? 0, currency: data.currency)) auszahlen" : "Auszahlen")
                            .font(.wr(.body, .semibold))
                            .frame(maxWidth: .infinity)
                    }
                    .disabled(!valid)
                }
            }
            .meFormStyle()
            .navigationTitle("Auszahlung beantragen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } } }
            .onAppear { amount = Fmt.moneyInput(data.available) }
        }
        .presentationDetents([.medium, .large])
    }

    private func submit() async {
        guard let minor, valid else { return }
        error = nil
        do {
            let r: MePayoutRequestResult = try await APIClient.shared.post("/studio/payouts", ["amountMinor": JSONValue.from(minor), "switchToManual": .bool(automatic)])
            let when = r.arrivalAt.map { " – voraussichtlich am \(MePayoutLabels.longDay($0)) auf deinem Konto" } ?? ""
            app.show("Auszahlung von \(Fmt.money(r.amountMinor, currency: r.currency ?? data.currency)) ausgelöst\(when).")
            Haptics.success()
            await onDone()
            dismiss()
        } catch {
            self.error = MeErr.text(error)
            Haptics.warning()
        }
    }
}
