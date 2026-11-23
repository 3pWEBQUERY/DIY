import SwiftUI

/// Geschenkgutscheine: im Warenkorb einlösen und „Meine Geschenkgutscheine“.
/// Kaufen ist nur auf werkuno.ch möglich (die App verkauft keine Gutscheine).

// MARK: - Modelle

struct MarketGiftCardItem: Decodable, Hashable, Identifiable, Sendable {
    struct ShopRef: Decodable, Hashable, Sendable { var name: String; var slug: String }
    var id: String
    var code: String
    var shop: ShopRef
    var currency: String
    var initialMinor: Int
    var balanceMinor: Int
    var status: String
    var expiresAt: Date?
    var expired: Bool?
    var senderName: String?
    var recipientName: String?
    var recipientEmail: String?
    var message: String?
    var deliverAt: Date?
    var delivered: Bool?
}

struct MarketGiftCardsPage: Decodable, Sendable {
    var received: [MarketGiftCardItem]
    var bought: [MarketGiftCardItem]
}

// MARK: - Warenkorb

/// Code eingeben (bestimmt den Shop) – gilt nur im Shop, der den Gutschein ausgestellt hat.
struct MarketGiftCardRedeemField: View {
    var onChange: () async -> Void

    @Environment(AppState.self) private var app
    @State private var open = false
    @State private var code = ""
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        if !open {
            Button { open = true } label: {
                Label("Geschenkgutschein einlösen", systemImage: "gift").font(.wr(.footnote, .semibold))
            }
            .buttonStyle(.plain)
            .foregroundStyle(Color.ink2)
        } else {
            form
        }
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                TextField("XXXX-XXXX-XXXX-XXXX", text: $code)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .font(.wr(.body).monospaced())
                    .padding(.horizontal, 12).padding(.vertical, 9)
                    .background(Color.sunken, in: .rect(cornerRadius: 12, style: .continuous))
                    .submitLabel(.done)
                    .onSubmit { Task { await apply() } }
                    .accessibilityLabel("Code des Geschenkgutscheins")
                Button(busy ? "Prüfe …" : "Einlösen") { Task { await apply() } }
                    .buttonStyle(.glass)
                    .disabled(busy || code.trimmed.isEmpty)
            }
            if let error { Text(error).font(.wr(.caption)).foregroundStyle(Color.danger).fixedSize(horizontal: false, vertical: true) }
            Text("Gilt nur im Shop, der ihn ausgestellt hat. Was übrig bleibt, bleibt dir als Guthaben.")
                .font(.wr(.caption)).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
        }
    }

    private func apply() async {
        guard !busy, !code.trimmed.isEmpty else { return }
        busy = true
        defer { busy = false }
        do {
            _ = try await APIClient.shared.post("/cart/giftcard", ["code": JSONValue.string(code.trimmed)]) as JSONValue
            Haptics.success()
            app.show("Geschenkgutschein hinterlegt.")
            code = ""
            error = nil
            open = false
            await onChange()
        } catch {
            self.error = (error as? APIError)?.message ?? error.localizedDescription
        }
    }
}

/// Angerechneter Gutschein einer Shop-Gruppe im Warenkorb
struct MarketGiftCardAppliedRow: View {
    var shopId: String
    var giftCard: MarketCartGiftCard
    var currency: String?
    var onChange: () async -> Void

    @Environment(AppState.self) private var app

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                Image(systemName: "gift").foregroundStyle(Color.muted)
                Text(summary).font(.wr(.subheadline)).fixedSize(horizontal: false, vertical: true)
                Spacer()
                Button("Entfernen") { Task { await remove() } }
                    .font(.wr(.footnote, .semibold)).buttonStyle(.plain).foregroundStyle(Color.muted)
                    .accessibilityLabel("Geschenkgutschein \(giftCard.code) entfernen")
            }
            if let p = giftCard.problem {
                Text(p).font(.wr(.caption)).foregroundStyle(Color.warn).fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var summary: String {
        guard giftCard.appliedMinor > 0 else { return "Geschenkgutschein \(giftCard.code)" }
        let applied = Fmt.money(giftCard.appliedMinor, currency: currency)
        let rest = Fmt.money(giftCard.balanceAfterMinor, currency: giftCard.currency)
        return "Geschenkgutschein \(giftCard.code) · −\(applied) · Rest \(rest)"
    }

    private func remove() async {
        if await app.run("Gutschein entfernt.", { _ = try await APIClient.shared.delete("/cart/giftcard/\(shopId)") as JSONValue }) {
            await onChange()
        }
    }
}

// MARK: - Meine Geschenkgutscheine

struct MyGiftCardsView: View {
    @Environment(AppState.self) private var app
    @State private var page: MarketGiftCardsPage?
    @State private var error: String?
    @State private var code = ""
    @State private var busy = false
    @State private var claimError: String?

    var body: some View {
        List {
            Section {
                claimForm
            } header: {
                Text("Gutschein hinzufügen")
            } footer: {
                Text("Gutscheine an deine bestätigte E-Mail-Adresse erscheinen automatisch. Kaufen kannst du Geschenkgutscheine auf der Website des Shops.")
            }
            if let page {
                receivedSection(page.received)
                boughtSection(page.bought)
            } else if let error {
                Text(error).foregroundStyle(Color.danger)
            } else {
                ProgressView().frame(maxWidth: .infinity)
            }
        }
        .navigationTitle("Geschenkgutscheine")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
    }

    private var claimForm: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                TextField("XXXX-XXXX-XXXX-XXXX", text: $code)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .font(.wr(.body).monospaced())
                    .accessibilityLabel("Code des Geschenkgutscheins")
                Button(busy ? "Prüfe …" : "Hinzufügen") { Task { await claim() } }
                    .disabled(busy || code.trimmed.isEmpty)
            }
            if let claimError { Text(claimError).font(.wr(.caption)).foregroundStyle(Color.danger) }
        }
    }

    @ViewBuilder private func receivedSection(_ items: [MarketGiftCardItem]) -> some View {
        Section("Erhalten") {
            if items.isEmpty {
                Text("Noch keine Gutscheine.").foregroundStyle(Color.muted)
            }
            ForEach(items) { c in GiftCardRow(card: c, showCode: true) }
        }
    }

    @ViewBuilder private func boughtSection(_ items: [MarketGiftCardItem]) -> some View {
        if !items.isEmpty {
            Section("Verschenkt") {
                ForEach(items) { c in GiftCardRow(card: c, showCode: c.delivered == true) }
            }
        }
    }

    private func load() async {
        do {
            page = try await APIClient.shared.get("/me/giftcards")
            error = nil
        } catch {
            self.error = (error as? APIError)?.message ?? error.localizedDescription
        }
    }

    private func claim() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            _ = try await APIClient.shared.post("/me/giftcards/claim", ["code": JSONValue.string(code.trimmed)]) as JSONValue
            Haptics.success()
            app.show("Gutschein hinzugefügt.")
            code = ""
            claimError = nil
            await load()
        } catch {
            claimError = (error as? APIError)?.message ?? error.localizedDescription
        }
    }
}

private struct GiftCardRow: View {
    var card: MarketGiftCardItem
    var showCode: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(card.shop.name.uppercased())
                .font(.system(size: 11, weight: .medium, design: .monospaced))
                .foregroundStyle(Color.muted)
            Text(Fmt.money(card.balanceMinor, currency: card.currency))
                .font(.wr(.title2, .semibold)).monospacedDigit()
            Text(detail).font(.wr(.caption)).foregroundStyle(Color.muted)
            if showCode {
                Text(verbatim: card.code).font(.wr(.subheadline).monospaced()).textSelection(.enabled)
            }
            if let sender = card.senderName?.nilIfEmpty {
                Text(senderLine(sender)).font(.wr(.footnote)).foregroundStyle(Color.ink2).fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }

    private var detail: String {
        let initial = Fmt.money(card.initialMinor, currency: card.currency)
        if card.status == "REFUNDED" { return "\(initial) · erstattet" }
        if card.expired == true { return "von \(initial) · abgelaufen" }
        if let d = card.expiresAt { return "von \(initial) · gültig bis \(d.formatted(date: .abbreviated, time: .omitted))" }
        return "von \(initial)"
    }

    private func senderLine(_ sender: String) -> String {
        if let m = card.message?.nilIfEmpty { return "Von \(sender) – „\(m)“" }
        return "Von \(sender)"
    }
}
