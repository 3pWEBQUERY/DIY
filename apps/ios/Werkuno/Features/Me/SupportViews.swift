import SwiftUI
import StoreKit

// MARK: - Unterstützer-Abo
//
// Fans unterstützen eine Person (Creator) monatlich und erhalten Zugang zu deren exklusiven Anleitungen.
// In der App: ein Apple-Produkt je Stufe für einen Monat, angelegt als Verbrauchsartikel (oder als
// „Abo ohne automatische Verlängerung“ – beides funktioniert, der Server prüft nur Produkt-ID und Token). Jeder Kauf verlängert die
// Unterstützung um einen Monat; mehrere Creator gleichzeitig sind möglich. Der Server ordnet den Kauf über
// das appAccountToken (je Konto und Creator) zu – auch nach einer Neuinstallation.

struct SupportOfferResponse: Decodable, Sendable {
    struct Offer: Decodable, Sendable, Hashable {
        struct Creator: Decodable, Sendable, Hashable {
            var id: String
            var handle: String
            var displayName: String
            var avatarUrl: String?
        }
        struct Mine: Decodable, Sendable, Hashable {
            var active: Bool
            var provider: String
            var priceMinor: Int?
            var currency: String?
            var currentPeriodEnd: Date?
            var cancelAtPeriodEnd: Bool?
        }
        var enabled: Bool
        var priceMinor: Int
        /// Stufe in der Währung der Betrachter:in (5 CHF bzw. 5 €)
        var currency: String?
        var perks: String?
        var exclusiveTutorials: Int?
        var creator: Creator?
        var me: Mine?
    }
    struct Apple: Decodable, Sendable {
        var productId: String
        var appAccountToken: String
    }
    var offer: Offer?
    var apple: Apple?
}

@MainActor
final class SupportStore {
    static let shared = SupportStore()
    static let productIds: Set<String> = ["ch.werkuno.app.support.tier3", "ch.werkuno.app.support.tier5", "ch.werkuno.app.support.tier10"]
    static let purchasedNotification = Notification.Name("werkuno.support.purchased")

    enum Outcome { case purchased, pending, deliveryPending, cancelled }

    private var products: [String: Product] = [:]

    func product(_ id: String) async -> Product? {
        if let p = products[id] { return p }
        guard let p = try? await Product.products(for: [id]).first else { return nil }
        products[id] = p
        return p
    }

    /// Unterstützung kaufen bzw. um einen Monat verlängern
    func buy(creatorId: String) async throws -> Outcome {
        await DigitalStore.shared.retryUnfinished()
        let r: SupportOfferResponse = try await APIClient.shared.get("/creators/\(creatorId)/support")
        guard let apple = r.apple, let token = UUID(uuidString: apple.appAccountToken), let product = await product(apple.productId) else {
            StoreDiagnostics.report("support.product_missing", error: nil, productIds: [r.apple?.productId ?? "-"])
            throw DigitalStoreError.unavailable
        }
        let result: Product.PurchaseResult
        do {
            result = try await product.purchaseInActiveScene(options: [.appAccountToken(token)])
        } catch {
            guard let mapped = StorePurchaseError.wrap(error) else { return .cancelled }
            StoreDiagnostics.report("support.purchase_failed", error: error, productIds: [apple.productId])
            throw mapped
        }
        switch result {
        case .success(let verification):
            do {
                try await deliver(verification)
                return .purchased
            } catch {
                // Apple hat bereits kassiert: Transaktion bleibt offen und wird später verbucht
                StoreDiagnostics.report("support.deliver_failed", error: error, productIds: [apple.productId])
                return .deliveryPending
            }
        case .pending:
            return .pending
        case .userCancelled:
            return .cancelled
        @unknown default:
            return .cancelled
        }
    }

    /// Beim Server verbuchen, danach abschliessen (sonst liefert StoreKit die Transaktion erneut).
    private func deliver(_ verification: VerificationResult<StoreKit.Transaction>) async throws {
        if case .unverified = verification { throw DigitalStoreError.unverified }
        let transaction = verification.unsafePayloadValue
        _ = try await APIClient.shared.post("/support/apple", ["signedTransaction": JSONValue.string(verification.jwsRepresentation)]) as JSONValue
        await transaction.finish()
    }

    /// Offene Käufe (Kaufanfrage genehmigt, App beendet, Netzfehler) nachträglich verbuchen
    func deliverQuietly(_ verification: VerificationResult<StoreKit.Transaction>) async {
        let transaction = verification.unsafePayloadValue
        if transaction.revocationDate != nil {
            await transaction.finish()
            return
        }
        guard APIClient.shared.isSignedIn else { return }
        do {
            try await deliver(verification)
            NotificationCenter.default.post(name: Self.purchasedNotification, object: nil)
        } catch {
            #if DEBUG
            print("Unterstützung konnte noch nicht verbucht werden: \(error.localizedDescription)")
            #endif
        }
    }
}

// MARK: - Karte auf Profil und bei exklusiven Anleitungen

struct SupportCardView: View {
    enum Variant { case profile, locked }
    var creatorId: String
    var creatorName: String
    var variant: Variant = .profile
    /// Nach einem Kauf (z. B. Anleitung neu laden)
    var onChange: () -> Void = {}

    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @State private var data: SupportOfferResponse?
    @State private var displayPrice: String?
    @State private var buying = false
    @State private var loaded = false

    var body: some View {
        // Immer ein (ggf. leerer) Container, damit `.task` auch ohne Angebot läuft
        VStack(spacing: 0) {
            if let offer = data?.offer, offer.enabled || offer.me != nil {
                card(offer)
            } else if variant == .locked && loaded {
                Text("\(creatorName) nimmt gerade keine neuen Unterstützungen an.")
                    .font(.wr(.subheadline)).foregroundStyle(Color.muted)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(16).cardSurface()
            } else {
                Color.clear.frame(height: 0)
            }
        }
        .task(id: creatorId) { await load() }
        .onReceive(NotificationCenter.default.publisher(for: SupportStore.purchasedNotification)) { _ in
            Task { await load(); onChange() }
        }
    }

    @ViewBuilder private func card(_ offer: SupportOfferResponse.Offer) -> some View {
        let active = offer.me?.active == true
        VStack(alignment: .leading, spacing: 10) {
            Label(variant == .locked ? "Exklusiv für Unterstützer:innen" : "Unterstützer-Abo", systemImage: variant == .locked ? "lock" : "heart")
                .labelStyle(.compact)
                .specStyle()
            Text(active ? "Du unterstützt \(creatorName)" : variant == .locked ? "Unterstütze \(creatorName), um diese Anleitung zu öffnen" : "\(creatorName) unterstützen")
                .font(.wr(.headline, .semibold)).foregroundStyle(Color.ink)
                .fixedSize(horizontal: false, vertical: true)
            if active, let mine = offer.me {
                Text(activeText(mine)).font(.wr(.subheadline)).foregroundStyle(Color.ink2).fixedSize(horizontal: false, vertical: true)
                if mine.provider == "apple", offer.enabled, data?.apple != nil {
                    Button { Task { await buy() } } label: {
                        Text(buying ? "Einen Moment …" : "Um einen Monat verlängern\(displayPrice.map { " · \($0)" } ?? "")")
                    }
                    .primaryButton()
                    .disabled(buying)
                }
                Button("Unterstützungen verwalten") { router.open(.settingsSection(.supporting)) }
                    .font(.wr(.footnote, .semibold)).buttonStyle(.plain).foregroundStyle(Color.ink2)
            } else if offer.enabled {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(displayPrice ?? Fmt.money(offer.priceMinor, currency: offer.currency)).font(.wr(.title2, .bold)).monospacedDigit()
                    Text("für einen Monat").font(.wr(.subheadline)).foregroundStyle(Color.muted)
                }
                if let perks = offer.perks?.nilIfEmpty {
                    Text(perks).font(.wr(.subheadline)).foregroundStyle(Color.ink2).fixedSize(horizontal: false, vertical: true)
                }
                if let n = offer.exclusiveTutorials, n > 0 {
                    Text(n == 1 ? "1 exklusive Anleitung" : "\(n) exklusive Anleitungen").font(.wr(.footnote)).foregroundStyle(Color.muted)
                }
                if app.isSignedIn {
                    Button { Task { await buy() } } label: {
                        Label(buying ? "Einen Moment …" : "Unterstützen", systemImage: "heart")
                    }
                    .primaryButton()
                    .disabled(buying || data?.apple == nil)
                } else {
                    Button("Anmelden und unterstützen") { app.requestSignIn() }.primaryButton()
                }
                Text("Ein Monat Zugang, verlängert sich nicht automatisch. Abrechnung über Apple. Der Betrag geht an \(creatorName); Werkuno behält einen Anteil für Betrieb und Gebühren.")
                    .font(.wr(.caption)).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
    }

    private func activeText(_ mine: SupportOfferResponse.Offer.Mine) -> String {
        var s = "Danke! Exklusive Anleitungen sind für dich freigeschaltet."
        if let end = mine.currentPeriodEnd, mine.provider == "apple" || mine.cancelAtPeriodEnd == true {
            s += " Läuft bis \(Fmt.date(end, style: .long))."
        }
        return s
    }

    private func load() async {
        defer { loaded = true }
        guard let r: SupportOfferResponse = try? await APIClient.shared.get("/creators/\(creatorId)/support") else { return }
        data = r
        if let id = r.apple?.productId { displayPrice = await SupportStore.shared.product(id)?.displayPrice }
    }

    private func buy() async {
        guard !buying else { return }
        buying = true
        defer { buying = false }
        do {
            switch try await SupportStore.shared.buy(creatorId: creatorId) {
            case .purchased:
                Haptics.success()
                app.show("Danke! Du unterstützt jetzt \(creatorName).")
                await load()
                onChange()
            case .pending:
                app.show("Die Kaufanfrage wartet auf Zustimmung.", style: .info)
            case .deliveryPending:
                app.show("Bezahlt – die Freischaltung folgt in Kürze automatisch.", style: .info)
            case .cancelled:
                break
            }
        } catch {
            app.show(error: error)
        }
    }
}

// MARK: - Einstellungen › Unterstützungen

struct MeSupportingItem: Decodable, Identifiable, Hashable, Sendable {
    var creatorId: String
    var handle: String
    var displayName: String
    var avatarUrl: String?
    var provider: String
    var priceMinor: Int
    var currency: String?
    var active: Bool
    var cancelAtPeriodEnd: Bool
    var currentPeriodEnd: Date?
    var id: String { creatorId }
}

struct MeSupportingView: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @State private var items: [MeSupportingItem] = []
    @State private var loaded = false
    @State private var confirm: MeSupportingItem?

    var body: some View {
        List {
            if !loaded {
                LoadingView().listRowBackground(Color.clear)
            } else if items.isEmpty {
                EmptyStateView(symbol: "heart", title: "Du unterstützt noch niemanden", message: "Auf Profilen von Creator:innen findest du „Unterstützen“, wenn sie ein Unterstützer-Abo anbieten.")
                    .listRowBackground(Color.clear)
            } else {
                Section {
                    ForEach(items) { r in row(r) }
                } footer: {
                    Text("In der App gekaufte Monate verlängern sich nicht automatisch und enden am angezeigten Datum.").font(.wr(.footnote))
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.paper)
        .task { await load() }
        .refreshable { await load() }
        .confirmationDialog("Unterstützung kündigen?", isPresented: Binding(get: { confirm != nil }, set: { if !$0 { confirm = nil } }), titleVisibility: .visible, presenting: confirm) { r in
            Button("Kündigen", role: .destructive) { Task { await setCancel(r, true) } }
            Button("Abbrechen", role: .cancel) {}
        } message: { r in
            Text("Deine Unterstützung für \(r.displayName) läuft bis zum Ende des bezahlten Monats, danach wird nichts mehr abgebucht.")
        }
    }

    private func row(_ r: MeSupportingItem) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Button { router.open(.profile(handle: r.handle)) } label: {
                HStack(spacing: 12) {
                    AvatarView(url: r.avatarUrl, name: r.displayName, size: 40)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(r.displayName).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink)
                        Text(subtitle(r)).font(.wr(.caption)).foregroundStyle(Color.muted)
                    }
                    Spacer()
                    Pill(text: r.active ? (r.cancelAtPeriodEnd && r.provider != "apple" ? "Gekündigt" : "Aktiv") : "Beendet", tint: r.active ? .moss : .muted)
                }
            }
            .buttonStyle(.plain)
            if r.active && r.provider != "apple" {
                Button(r.cancelAtPeriodEnd ? "Fortsetzen" : "Kündigen") {
                    if r.cancelAtPeriodEnd { Task { await setCancel(r, false) } } else { confirm = r }
                }
                .font(.wr(.footnote, .semibold))
                .buttonStyle(.bordered)
            }
        }
        .padding(.vertical, 4)
    }

    private func subtitle(_ r: MeSupportingItem) -> String {
        var s = "\(Fmt.money(r.priceMinor, currency: r.currency))/Monat"
        if r.active, let end = r.currentPeriodEnd {
            s += r.provider == "apple" || r.cancelAtPeriodEnd ? " · endet am \(Fmt.date(end))" : " · nächste Zahlung am \(Fmt.date(end))"
        }
        return s
    }

    private func load() async {
        defer { loaded = true }
        do { items = try await APIClient.shared.get("/me/supporting") } catch { app.show(error: error) }
    }

    private func setCancel(_ r: MeSupportingItem, _ cancel: Bool) async {
        if await app.run(cancel ? "Gekündigt – läuft bis zum Ende des bezahlten Monats." : "Kündigung zurückgenommen.", {
            _ = try await APIClient.shared.post("/creators/\(r.creatorId)/support/cancel", ["cancel": JSONValue.bool(cancel)]) as JSONValue
        }) { await load() }
    }
}

// MARK: - Studio › Unterstützer:innen

struct StudioSupportData: Decodable, Sendable {
    struct Plan: Decodable, Sendable { var enabled: Bool; var priceMinor: Int; var perks: String }
    struct Eligibility: Decodable, Sendable { var ok: Bool; var reason: String? }
    struct Stats: Decodable, Sendable { var active: Int; var last30NetMinor: Int }
    struct Row: Decodable, Identifiable, Sendable {
        var id: String
        var handle: String
        var displayName: String
        var avatarUrl: String?
        var provider: String
        var priceMinor: Int
        var currency: String?
        var since: Date?
        var currentPeriodEnd: Date?
        var cancelAtPeriodEnd: Bool
        var active: Bool
    }
    var plan: Plan
    var eligibility: Eligibility
    var feeBps: Int
    var tiers: [Int]
    var exclusiveTutorials: Int
    var stats: Stats
    var supporters: [Row]
    /// Währung der Creatorin (Stufen, Einnahmen)
    var currency: String?
}

struct StudioSupportView: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @State private var data: StudioSupportData?
    @State private var enabled = false
    @State private var price = 500
    @State private var perks = ""
    @State private var error: String?

    var body: some View {
        Form {
            if let d = data {
                if !d.eligibility.ok, let reason = d.eligibility.reason {
                    Section { Text(reason).font(.wr(.subheadline)).foregroundStyle(Color.warn) }
                }
                Section {
                    LabeledContent("Aktiv", value: "\(d.stats.active)")
                    LabeledContent("Letzte 30 Tage", value: Fmt.money(d.stats.last30NetMinor, currency: d.currency))
                    LabeledContent("Exklusive Anleitungen", value: "\(d.exclusiveTutorials)")
                }
                Section {
                    Toggle("Unterstützungen annehmen", isOn: $enabled).tint(.moss).disabled(!d.eligibility.ok && !enabled)
                    Picker("Monatsbetrag", selection: $price) {
                        ForEach(d.tiers, id: \.self) { Text(Fmt.money($0, currency: d.currency)).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Was Unterstützer:innen bekommen").font(.wr(.footnote, .semibold))
                        TextField("z. B. exklusive Anleitungen, Vorlagen, früher Zugang", text: $perks, axis: .vertical).lineLimit(3...8)
                    }
                    AsyncButton("Speichern") { await save() }.primaryButton()
                } header: { Text("Dein Unterstützer-Abo") } footer: {
                    Text("Du erhältst \(Fmt.money(price - Int((Double(price) * Double(d.feeBps) / 10_000).rounded()), currency: d.currency)) je Unterstützung und Monat. Werkuno behält \(d.feeBps / 100) % für Zahlung und Betrieb. Exklusive Anleitungen markierst du im Anleitungs-Editor.")
                }
                Section("Wer dich unterstützt") {
                    if d.supporters.isEmpty {
                        Text("Noch niemand. Teile dein Profil – dort steht „Unterstützen“, sobald dein Abo eingeschaltet ist.").font(.wr(.subheadline)).foregroundStyle(Color.muted)
                    }
                    ForEach(d.supporters) { r in
                        Button { router.open(.profile(handle: r.handle)) } label: {
                            HStack(spacing: 12) {
                                AvatarView(url: r.avatarUrl, name: r.displayName, size: 34)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(r.displayName).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink)
                                    Text("\(Fmt.money(r.priceMinor, currency: r.currency))/Monat · \(r.provider == "apple" ? "iOS-App" : r.provider == "stripe" ? "Web" : "Test")").font(.wr(.caption)).foregroundStyle(Color.muted)
                                }
                                Spacer()
                                Pill(text: r.active ? "Aktiv" : "Beendet", tint: r.active ? .moss : .muted)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            } else if let error {
                ErrorStateView(message: error) { await load() }
            } else {
                LoadingView()
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.paper)
        .navigationTitle("Unterstützer:innen")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
    }

    private func apply(_ d: StudioSupportData) {
        data = d
        enabled = d.plan.enabled
        price = d.plan.priceMinor
        perks = d.plan.perks
    }

    private func load() async {
        do {
            apply(try await APIClient.shared.get("/studio/support"))
            error = nil
        } catch { self.error = (error as? APIError)?.message ?? error.localizedDescription }
    }

    private func save() async {
        let body: [String: JSONValue] = ["enabled": .bool(enabled), "priceMinor": .number(Double(price)), "perks": .string(perks)]
        do {
            let d: StudioSupportData = try await APIClient.shared.put("/studio/support", body)
            apply(d)
            app.show("Unterstützer-Abo gespeichert.")
        } catch { app.show(error: error) }
    }
}
