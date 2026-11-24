import SwiftUI

// Studio › Geschenkgutscheine (Verkäufer:in) – wie im Web (/studio/geschenkgutscheine):
// Angebot einstellen, verkaufte Gutscheine sehen, unbenutzte stornieren.
// Server: GET /studio/giftcards, PUT /studio/giftcards/settings, POST /studio/giftcards/:id/refund

struct StudioGiftCardSettings: Codable, Hashable, Sendable {
    var enabled: Bool
    var amounts: [Int]
    var customEnabled: Bool
    var customMinMinor: Int
    var customMaxMinor: Int
    var validityMonths: Int
    var note: String
}

struct StudioGiftCardRedemption: Decodable, Hashable, Sendable {
    var amountMinor: Int
    var createdAt: Date?
    var orderId: String?
    var orderNumber: String?
}

struct StudioGiftCard: Decodable, Hashable, Identifiable, Sendable {
    var id: String
    var code: String
    var status: String
    var currency: String
    var initialMinor: Int
    var balanceMinor: Int
    var recipientName: String?
    var createdAt: Date?
    var expiresAt: Date?
    var expired: Bool?
    var delivered: Bool?
    var refundable: Bool?
    var redemptions: [StudioGiftCardRedemption]?
}

struct StudioGiftCardStats: Decodable, Hashable, Sendable {
    var sold: Int
    var soldMinor: Int
    var openMinor: Int
    var redeemedMinor: Int
}

struct StudioGiftCardShop: Decodable, Hashable, Sendable {
    var id: String
    var slug: String?
    var name: String?
    var currency: String
}

struct StudioGiftCardPage: Decodable, Sendable {
    var shop: StudioGiftCardShop
    var settings: StudioGiftCardSettings
    var stats: StudioGiftCardStats
    var cards: [StudioGiftCard]
}

struct StudioGiftCardsView: View {
    @Environment(AppState.self) private var app
    @State private var data: StudioGiftCardPage?
    @State private var error: String?
    @State private var editing = false
    @State private var confirmRefund: StudioGiftCard?

    var body: some View {
        content
            .background(Color.paper)
            .navigationTitle("Geschenkgutscheine")
            .navigationBarTitleDisplayMode(.inline)
            .task { await load() }
            .refreshable { await load() }
            .sheet(isPresented: $editing, onDismiss: { Task { await load() } }) {
                if let d = data { StudioGiftCardSettingsSheet(initial: d.settings, currency: d.shop.currency) }
            }
            .confirmationDialog(
                "Gutschein stornieren?",
                isPresented: Binding(get: { confirmRefund != nil }, set: { if !$0 { confirmRefund = nil } }),
                titleVisibility: .visible,
                presenting: confirmRefund
            ) { c in
                Button("Stornieren und erstatten", role: .destructive) { Task { await refund(c) } }
            } message: { _ in
                Text("Der Kauf wird vollständig erstattet (inkl. Provision), der Code ist danach ungültig.")
            }
    }

    @ViewBuilder private var content: some View {
        if app.me?.shop == nil {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    header
                    MarketNoShopCTA()
                }
                .padding(.horizontal, Space.gutter)
                .padding(.bottom, 40)
            }
        } else if data == nil && error == nil {
            LoadingView()
        } else if let error, data == nil {
            ErrorStateView(message: error) { await load() }
        } else if let data {
            list(data)
        }
    }

    private var header: some View {
        PageTitle(kicker: "Werkuno Studio", title: "Geschenkgutscheine", subtitle: "Kund:innen verschenken einen Betrag für deinen Shop.")
    }

    private func list(_ d: StudioGiftCardPage) -> some View {
        List {
            Section {
                header.listRowInsets(EdgeInsets()).listRowBackground(Color.clear).listRowSeparator(.hidden)
                Text("Das Geld kommt beim Kauf auf dein Konto (abzüglich Provision); beim Einlösen bezahlt die Kundschaft entsprechend weniger – ohne zweite Provision.")
                    .font(.wr(.footnote)).foregroundStyle(Color.muted)
                    .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 8, trailing: 0))
                    .listRowBackground(Color.clear).listRowSeparator(.hidden)
                StudioGiftCardStatsGrid(stats: d.stats, currency: d.shop.currency)
                    .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 12, trailing: 0))
                    .listRowBackground(Color.clear).listRowSeparator(.hidden)
            }
            Section {
                offerRow(d.settings, d.shop.currency)
            } header: {
                SpecLabel("Angebot")
            }
            Section {
                if d.cards.isEmpty {
                    Text("Noch keine Gutscheine verkauft.").font(.wr(.subheadline)).foregroundStyle(Color.muted)
                        .listRowBackground(Color.paper)
                } else {
                    ForEach(d.cards) { c in row(c) }
                }
            } header: {
                SpecLabel(d.cards.isEmpty ? "Verkaufte Gutscheine" : Fmt.plural(d.cards.count, "verkaufter Gutschein", "verkaufte Gutscheine"))
            } footer: {
                Text("Gutscheinverkäufe erscheinen hier, nicht unter Einnahmen der Bestellungen – dort zählt beim Einlösen nur, was die Kundschaft zusätzlich bezahlt.")
                    .font(.wr(.caption)).foregroundStyle(Color.muted)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .contentMargins(.horizontal, Space.gutter, for: .scrollContent)
    }

    private func offerRow(_ s: StudioGiftCardSettings, _ cur: String) -> some View {
        Button { editing = true } label: {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    MeStatePill(text: s.enabled ? "Im Verkauf" : "Nicht im Verkauf", tone: s.enabled ? .moss : .neutral)
                    Text(StudioGiftCardFormat.offer(s, cur)).font(.wr(.subheadline)).foregroundStyle(Color.ink)
                    Text("Gültig \(s.validityMonths) Monate").font(.wr(.caption)).foregroundStyle(Color.muted)
                }
                Spacer(minLength: 4)
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Color.muted)
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityHint("Angebot bearbeiten")
        .listRowBackground(Color.paper)
    }

    private func row(_ c: StudioGiftCard) -> some View {
        StudioGiftCardRow(card: c)
            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                if c.refundable == true {
                    Button("Stornieren", systemImage: "arrow.uturn.backward", role: .destructive) { confirmRefund = c }
                }
            }
            .contextMenu {
                if c.refundable == true {
                    Button("Stornieren und erstatten", systemImage: "arrow.uturn.backward", role: .destructive) { confirmRefund = c }
                }
            }
            .listRowBackground(Color.paper)
            .listRowInsets(EdgeInsets(top: 10, leading: 0, bottom: 10, trailing: 0))
    }

    private func load() async {
        guard app.me?.shop != nil else { return }
        do {
            let d: StudioGiftCardPage = try await APIClient.shared.get("/studio/giftcards")
            withAnimation(.smooth) { data = d }
            error = nil
        } catch is CancellationError {
        } catch {
            self.error = (error as? APIError)?.message ?? error.localizedDescription
        }
    }

    private func refund(_ c: StudioGiftCard) async {
        await app.run("Gutschein storniert und erstattet.") {
            _ = try await APIClient.shared.post("/studio/giftcards/\(c.id)/refund") as JSONValue
        }
        await load()
    }
}

enum StudioGiftCardFormat {
    static func offer(_ s: StudioGiftCardSettings, _ cur: String) -> String {
        var parts: [String] = []
        if !s.amounts.isEmpty { parts.append(s.amounts.map { Fmt.money($0, currency: cur) }.joined(separator: " · ")) }
        if s.customEnabled { parts.append("frei \(Fmt.money(s.customMinMinor, currency: cur))–\(Fmt.money(s.customMaxMinor, currency: cur))") }
        return parts.isEmpty ? "Noch keine Beträge festgelegt" : parts.joined(separator: " · ")
    }

    static func status(_ c: StudioGiftCard) -> (String, MeStatePill.Tone) {
        if c.status == "REFUNDED" { return ("Erstattet", .neutral) }
        if c.expired == true { return ("Abgelaufen", .neutral) }
        return c.delivered == true ? ("Zugestellt", .moss) : ("Geplant", .slate)
    }
}

private struct StudioGiftCardStatsGrid: View {
    var stats: StudioGiftCardStats
    var currency: String

    var body: some View {
        AdaptiveGrid(spacing: 10, rowSpacing: 10) {
            cell("Verkauft", Fmt.number(stats.sold))
            cell("Umsatz Gutscheine", Fmt.money(stats.soldMinor, currency: currency))
            cell("Eingelöst", Fmt.money(stats.redeemedMinor, currency: currency))
            cell("Offenes Guthaben", Fmt.money(stats.openMinor, currency: currency))
        }
    }

    private func cell(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            SpecLabel(label)
            Text(value).font(.wr(.title3, .semibold)).monospacedDigit().foregroundStyle(Color.ink)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .cardSurface()
        .accessibilityElement(children: .combine)
    }
}

private struct StudioGiftCardRow: View {
    var card: StudioGiftCard

    var body: some View {
        let st = StudioGiftCardFormat.status(card)
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(Fmt.money(card.initialMinor, currency: card.currency)).font(.wr(.headline)).monospacedDigit()
                Text(card.code).font(.system(.footnote, design: .monospaced)).foregroundStyle(Color.muted)
                Spacer(minLength: 4)
                MeStatePill(text: st.0, tone: st.1)
            }
            Text(detail).font(.wr(.caption)).foregroundStyle(Color.muted)
            if let r = card.redemptions, !r.isEmpty {
                Text("Eingelöst: " + r.map { "\($0.orderNumber ?? "Bestellung") (\(Fmt.money($0.amountMinor, currency: card.currency)))" }.joined(separator: ", "))
                    .font(.wr(.caption)).foregroundStyle(Color.ink2)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var detail: String {
        var p: [String] = []
        if let n = card.recipientName, !n.isEmpty { p.append("Für \(n)") }
        p.append("verkauft \(Fmt.date(card.createdAt))")
        p.append("Guthaben \(Fmt.money(card.balanceMinor, currency: card.currency))")
        p.append(card.expired == true ? "abgelaufen" : "gültig bis \(Fmt.date(card.expiresAt))")
        return p.joined(separator: " · ")
    }
}

// MARK: - Angebot bearbeiten

private struct StudioGiftCardSettingsSheet: View {
    var initial: StudioGiftCardSettings
    var currency: String
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var enabled = false
    @State private var amounts = ""
    @State private var customEnabled = false
    @State private var minText = ""
    @State private var maxText = ""
    @State private var months = 36
    @State private var note = ""
    @State private var loaded = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Toggle("Geschenkgutscheine verkaufen", isOn: $enabled)
                }
                amountsSection
                Section {
                    Stepper("Gültig \(months) Monate", value: $months, in: 12...120, step: 6)
                } footer: {
                    Text("Üblich: 36 Monate.")
                }
                Section {
                    TextField("z. B. Einlösbar für alle Produkte", text: $note, axis: .vertical)
                        .lineLimit(2...4)
                        .onChange(of: note) { _, v in if v.count > 200 { note = String(v.prefix(200)) } }
                } header: {
                    Text("Hinweis auf der Gutscheinseite")
                } footer: {
                    Text("\(note.count)/200")
                }
            }
            .navigationTitle("Angebot")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    AsyncButton { await save() } label: { Text("Speichern") }
                }
            }
            .onAppear(perform: fill)
        }
    }

    private var amountsSection: some View {
        Section {
            TextField("Feste Beträge (\(currency))", text: $amounts)
                .keyboardType(.numbersAndPunctuation)
            Toggle("Freie Beträge erlauben", isOn: $customEnabled)
            if customEnabled {
                LabeledContent("Mindestens (\(currency))") {
                    TextField("10", text: $minText).keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                }
                LabeledContent("Höchstens (\(currency))") {
                    TextField("300", text: $maxText).keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                }
            }
        } header: {
            Text("Beträge")
        } footer: {
            Text("Feste Beträge mit Komma trennen, z. B. 25, 50, 100 (höchstens 6).")
        }
    }

    private func fill() {
        guard !loaded else { return }
        loaded = true
        enabled = initial.enabled
        amounts = initial.amounts.map { Self.input($0) }.joined(separator: ", ")
        customEnabled = initial.customEnabled
        minText = Self.input(initial.customMinMinor)
        maxText = Self.input(initial.customMaxMinor)
        months = initial.validityMonths
        note = initial.note
    }

    private static func input(_ m: Int) -> String { m % 100 == 0 ? String(m / 100) : Fmt.moneyInput(m) }

    private func save() async {
        // Wie im Web: Komma, Semikolon oder Leerzeichen trennen die Beträge (Dezimalpunkt: 12.50)
        let tokens = amounts.split(whereSeparator: { $0 == "," || $0 == ";" || $0.isWhitespace }).map(String.init)
        let parsed = tokens.map { Fmt.parseMoney($0) }
        guard !parsed.contains(where: { $0 == nil || $0 == 0 }) else {
            app.show("Bitte gib die festen Beträge als Zahlen an, z. B. 25, 50, 100.", style: .error)
            return
        }
        let body = StudioGiftCardSettings(
            enabled: enabled,
            amounts: parsed.compactMap { $0 },
            customEnabled: customEnabled,
            customMinMinor: Fmt.parseMoney(minText) ?? 0,
            customMaxMinor: Fmt.parseMoney(maxText) ?? 0,
            validityMonths: months,
            note: note.trimmingCharacters(in: .whitespacesAndNewlines)
        )
        if await app.run("Gespeichert.", { _ = try await APIClient.shared.put("/studio/giftcards/settings", body) as JSONValue }) {
            dismiss()
        }
    }
}
