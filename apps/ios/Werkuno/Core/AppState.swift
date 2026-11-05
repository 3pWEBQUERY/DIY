import Foundation
import SwiftUI
import Observation

// MARK: - Bootstrap

struct Bootstrap: Decodable, Sendable {
    struct Payments: Decodable, Sendable { var mode: String; var feeBps: Int }
    struct Features: Decodable, Sendable { var apple: Bool?; var appleNative: Bool? }
    var categories: [Category]
    var payments: Payments
    var features: Features?
    var me: Me?
}

struct Me: Decodable, Sendable, Equatable {
    struct Profile: Decodable, Sendable, Equatable {
        var handle: String
        var displayName: String
        var avatarUrl: String?
        var bio: String?
        var categories: [String]?
        var isCreatorPro: Bool?
    }
    struct ShopMini: Decodable, Sendable, Equatable { var id: String; var slug: String; var status: String; var name: String }
    struct CountsBox: Decodable, Sendable, Equatable {
        var notifications: Int
        var messages: InboxCounts
        var cart: Int
    }
    var id: String
    var email: String
    var role: String
    var status: String
    var suspendedUntil: Date?
    var emailVerified: Bool
    var onboarded: Bool
    var adultConfirmed: Bool?
    var createdAt: Date?
    var profile: Profile?
    var shop: ShopMini?
    var isModerator: Bool
    var isAdmin: Bool
    var counts: CountsBox
}

// MARK: - App-Zustand

@MainActor
@Observable
final class AppState {
    enum Phase: Equatable { case launching, signedOut, onboarding, ready }

    /// Gastmodus: öffentliche Inhalte ohne Konto ansehen (PRD §7.2)
    var isGuest = false

    var phase: Phase = .launching
    var me: Me?
    var categories: [Category] = []
    var paymentsMode: String = "disabled"
    var feeBps: Int = 600
    var appleNative = false
    var lastError: String?

    /// Zentrale Meldungen („Toast“)
    var toast: Toast?

    private var countsTask: Task<Void, Never>?
    let api = APIClient.shared

    init() {
        api.onUnauthorized = { [weak self] in
            Task { @MainActor in self?.handleUnauthorized() }
        }
    }

    var isSignedIn: Bool { me != nil }
    var handle: String? { me?.profile?.handle }
    var unreadNotifications: Int { me?.counts.notifications ?? 0 }
    var unreadMessages: Int { (me?.counts.messages.unread ?? 0) + (me?.counts.messages.requests ?? 0) }
    var cartCount: Int { me?.counts.cart ?? 0 }
    var hasActiveShop: Bool { me?.shop?.status == "ACTIVE" || me?.shop?.status == "PAUSED" }

    func category(_ slug: String?) -> Category? { categories.first { $0.slug == slug } }
    func categoryName(_ slug: String?) -> String { category(slug)?.name ?? slug ?? "" }
    func categoryShort(_ slug: String?) -> String { category(slug)?.short ?? categoryName(slug) }
    var activeCategories: [Category] { categories.filter { $0.isActive != false } }

    // MARK: Start & Bootstrap

    func launch() async {
        await refresh()
        startCountsPolling()
    }

    func refresh() async {
        do {
            let b: Bootstrap = try await api.get("/bootstrap")
            apply(b)
        } catch let e as APIError where e.isAuth {
            api.token = nil
            me = nil
            phase = .signedOut
        } catch {
            lastError = (error as? APIError)?.message ?? error.localizedDescription
            if phase == .launching { phase = api.isSignedIn ? .ready : .signedOut }
        }
    }

    private func apply(_ b: Bootstrap) {
        categories = b.categories
        paymentsMode = b.payments.mode
        feeBps = b.payments.feeBps
        appleNative = b.features?.appleNative ?? false
        me = b.me
        if b.me == nil {
            if api.token != nil { api.token = nil }
            phase = isGuest ? .ready : .signedOut
        } else if b.me?.onboarded == false {
            phase = .onboarding
        } else {
            phase = .ready
        }
        if b.me != nil { Task { await PushRegistration.sync() } }
    }

    func refreshCounts() async {
        guard api.isSignedIn else { return }
        if let b: Bootstrap = try? await api.get("/bootstrap"), let m = b.me {
            withAnimation(.snappy) { me = m }
        }
    }

    private func startCountsPolling() {
        countsTask?.cancel()
        countsTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(45))
                await self?.refreshCounts()
            }
        }
    }

    // MARK: Anmeldung

    func signIn(email: String, password: String) async throws {
        let r = try await api.login(email: email, password: password)
        api.token = r.token
        isGuest = false
        await refresh()
    }

    func browseAsGuest() {
        isGuest = true
        phase = .ready
    }

    /// Aus dem Gastmodus zur Anmeldung
    func requestSignIn() {
        isGuest = false
        phase = .signedOut
    }

    struct SignUpResult: Decodable { var userId: String; var token: String? }

    func signUp(email: String, password: String, displayName: String, handle: String) async throws {
        let body: [String: JSONValue] = ["email": .string(email), "password": .string(password), "displayName": .string(displayName), "handle": .string(handle), "adult": true, "terms": true]
        let r: SignUpResult = try await api.post("/auth/signup", body)
        if let t = r.token { api.token = t } else { try await signIn(email: email, password: password); return }
        isGuest = false
        await refresh()
    }

    struct AppleResult: Decodable { var token: String; var isNew: Bool }

    func signInWithApple(identityToken: String, givenName: String?, familyName: String?) async throws {
        let r: AppleResult = try await api.post("/auth/apple", ["identityToken": JSONValue.string(identityToken), "givenName": .from(givenName), "familyName": .from(familyName)])
        api.token = r.token
        isGuest = false
        await refresh()
    }

    func signOut() async {
        await PushRegistration.unregister()
        await api.logout()
        api.token = nil
        me = nil
        phase = .signedOut
        ImageCache.shared.clear()
    }

    private func handleUnauthorized() {
        guard me != nil || api.token != nil else { return }
        api.token = nil
        me = nil
        phase = .signedOut
        show("Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.", style: .warning)
    }

    func finishOnboarding() async {
        await refresh()
    }

    // MARK: Meldungen

    func show(_ message: String, style: Toast.Style = .success) {
        withAnimation(.spring(duration: 0.35)) { toast = Toast(message: message, style: style) }
    }

    func show(error: Error) {
        if error is CancellationError { return }
        if isGuest, let e = error as? APIError, e.isAuth {
            show("Melde dich an, um mitzumachen – folgen, speichern, kommentieren.", style: .info)
            return
        }
        let msg = (error as? APIError)?.message ?? error.localizedDescription
        show(msg, style: .error)
    }

    /// Führt eine Aktion aus und zeigt Erfolg/Fehler als Toast.
    @discardableResult
    func run(_ success: String? = nil, _ work: () async throws -> Void) async -> Bool {
        do {
            try await work()
            if let success { show(success) }
            return true
        } catch {
            show(error: error)
            return false
        }
    }
}

struct Toast: Equatable, Identifiable {
    enum Style { case success, error, warning, info }
    let id = UUID()
    var message: String
    var style: Style
}
