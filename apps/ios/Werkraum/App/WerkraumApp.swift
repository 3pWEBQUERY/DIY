import SwiftUI

import UserNotifications

/// Push-Vorbereitung (PRD §19.2): Gerätetoken an den Server melden, sobald erlaubt.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        UNUserNotificationCenter.current().getNotificationSettings { s in
            if s.authorizationStatus == .authorized { DispatchQueue.main.async { application.registerForRemoteNotifications() } }
        }
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
        PushRegistration.token = hex
        Task { await PushRegistration.sync() }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        #if DEBUG
        print("Push-Registrierung nicht möglich: \(error.localizedDescription)")
        #endif
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions { [.banner, .badge, .sound] }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        if let href = response.notification.request.content.userInfo["href"] as? String, let url = URL(string: "werkraum:/" + href) {
            await MainActor.run { UIApplication.shared.open(url) }
        }
    }
}

/// Gerätetoken an die aktuelle Sitzung binden bzw. beim Abmelden lösen.
enum PushRegistration {
    static var token: String? {
        get { UserDefaults.standard.string(forKey: "werkraum.pushToken") }
        set { UserDefaults.standard.set(newValue, forKey: "werkraum.pushToken") }
    }
    #if DEBUG
    static let environment = "sandbox"
    #else
    static let environment = "production"
    #endif

    static func sync() async {
        guard let token, APIClient.shared.isSignedIn else { return }
        _ = try? await APIClient.shared.patch("/devices/push", ["token": JSONValue.string(token), "environment": .string(environment)]) as JSONValue
    }

    static func unregister() async {
        guard let token, APIClient.shared.isSignedIn else { return }
        _ = try? await APIClient.shared.send("DELETE", "/devices/push", body: ["token": JSONValue.string(token)]) as JSONValue
    }
}

@main
struct WerkraumApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @State private var app = AppState()
    @State private var router = Router()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(app)
                .environment(router)
                .tint(.moss)
                .onOpenURL { router.handle(url: $0) }
        }
    }
}

struct RootView: View {
    @Environment(AppState.self) private var app

    var body: some View {
        ZStack {
            Color.paper.ignoresSafeArea()
            switch app.phase {
            case .launching: LaunchView()
            case .signedOut: AuthFlowView().transition(.opacity)
            case .onboarding: OnboardingView().transition(.move(edge: .trailing).combined(with: .opacity))
            case .ready: MainTabView().transition(.opacity)
            }
        }
        .animation(.smooth(duration: 0.45), value: app.phase)
        .toastOverlay()
        .task { await app.launch() }
    }
}

/// Startbildschirm: der Faden wickelt sich zum Knäuel.
struct LaunchView: View {
    var body: some View {
        VStack(spacing: 18) {
            ThreeCanvas(scene: ThreeScene(kind: .glyph, params: ["glyph": "loop", "color": .string(Color.clay.hex), "spin": 0.5], interactive: false))
                .frame(width: 220, height: 220)
            Wordmark(size: 30)
            YarnSpinner(size: 22)
        }
    }
}

struct Wordmark: View {
    var size: CGFloat = 22
    var body: some View {
        HStack(spacing: 0) {
            Text("WERK").font(.system(size: size, weight: .bold, design: .serif)).tracking(size * 0.08)
            Text("RAUM").font(.system(size: size, weight: .regular, design: .serif)).tracking(size * 0.08)
        }
        .foregroundStyle(Color.ink)
        .accessibilityLabel("Werkraum")
    }
}
