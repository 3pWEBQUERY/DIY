import SwiftUI

import UserNotifications

/// Push-Vorbereitung (PRD §19.2): Gerätetoken an den Server melden, sobald erlaubt.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        Self.applyManropeToUIKit()
        UNUserNotificationCenter.current().delegate = self
        UNUserNotificationCenter.current().getNotificationSettings { s in
            if s.authorizationStatus == .authorized { DispatchQueue.main.async { application.registerForRemoteNotifications() } }
        }
        return true
    }

    /// UIKit-Leisten (Navigationstitel, Segmente, Tab-Beschriftungen) ebenfalls in Manrope
    private static func applyManropeToUIKit() {
        let nav = UINavigationBar.appearance()
        nav.titleTextAttributes = [.font: Manrope.uiFont(size: 17, weight: .bold, relativeTo: .headline)]
        nav.largeTitleTextAttributes = [.font: Manrope.uiFont(size: 34, weight: .bold, relativeTo: .largeTitle)]
        UIBarButtonItem.appearance().setTitleTextAttributes([.font: Manrope.uiFont(size: 17, weight: .medium)], for: .normal)
        let seg = UISegmentedControl.appearance()
        seg.setTitleTextAttributes([.font: Manrope.uiFont(size: 13, weight: .medium, relativeTo: .footnote)], for: .normal)
        seg.setTitleTextAttributes([.font: Manrope.uiFont(size: 13, weight: .bold, relativeTo: .footnote)], for: .selected)
        let tab = Manrope.uiFont(size: 10, weight: .semibold, relativeTo: .caption2)
        UITabBarItem.appearance().setTitleTextAttributes([.font: tab], for: .normal)
        UITabBarItem.appearance().setTitleTextAttributes([.font: tab], for: .selected)
        UITextField.appearance().font = Manrope.uiFont(size: 17)
        UITextView.appearance().font = Manrope.uiFont(size: 17)
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
        if let href = response.notification.request.content.userInfo["href"] as? String, let url = URL(string: "werkuno:/" + href) {
            await MainActor.run { UIApplication.shared.open(url) }
        }
    }
}

/// Gerätetoken an die aktuelle Sitzung binden bzw. beim Abmelden lösen.
enum PushRegistration {
    static var token: String? {
        get { UserDefaults.standard.string(forKey: "werkuno.pushToken") }
        set { UserDefaults.standard.set(newValue, forKey: "werkuno.pushToken") }
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
struct WerkunoApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @State private var app = AppState()
    /// App-weit, nicht je Fenster: Deshalb ist `UIApplicationSupportsMultipleScenes` in der Info.plist aus.
    @State private var router = Router()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(app)
                .environment(router)
                .tint(.moss)
                .font(.wr(.body))
                .onOpenURL { router.handle(url: $0) }
        }
    }
}

struct RootView: View {
    @Environment(AppState.self) private var app
    @Environment(\.scenePhase) private var scenePhase

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
        .onAppear { AppAppearance.apply() } // gespeicherte Darstellung (Hell/Dunkel/System)
        .task { await app.launch() }
        // Käufe digitaler Produkte, die ausserhalb des Kaufdialogs abgeschlossen wurden, nachträglich verbuchen
        .task(id: app.phase == .ready) { if app.phase == .ready { DigitalStore.shared.startListening() } }
        .onChange(of: scenePhase) { _, p in app.setActive(p == .active) }
    }
}

/// Startbildschirm: die vier Werkuno-Kacheln setzen sich zusammen, dann erscheint die Wortmarke.
struct LaunchView: View {
    @State private var shown = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: 26) {
            BrandMark(size: 132)
                .scaleEffect(shown ? 1 : 0.82)
                .rotationEffect(.degrees(shown ? 0 : -6))
                .opacity(shown ? 1 : 0)
            Wordmark(size: 34)
                .opacity(shown ? 1 : 0)
                .offset(y: shown ? 0 : 8)
            YarnSpinner(size: 22)
        }
        .onAppear {
            withAnimation(reduceMotion ? .none : .spring(duration: 0.7, bounce: 0.35)) { shown = true }
        }
    }
}

/// Wortmarke „WERKUNO“: schwarz im hellen, weiss im dunklen Modus (Asset-Katalog).
struct Wordmark: View {
    /// Höhe des Platzes in Punkten (wie bei der früheren Wortmarke mit Nadel und Schere)
    var size: CGFloat = 22
    var body: some View {
        Image("Wordmark")
            .resizable()
            .interpolation(.high)
            .scaledToFit()
            // Die neue Wortmarke ist eng zugeschnitten – etwas kleiner, damit die Schrift gleich gross bleibt
            .frame(height: size * 0.62)
            .frame(height: size)
            .accessibilityElement()
            .accessibilityLabel("Werkuno")
    }
}

/// Bildmarke: vier Kacheln – Hammer, Wolle, Schere, Pflanze.
struct BrandMark: View {
    var size: CGFloat = 44
    var body: some View {
        Image("BrandMark")
            .resizable()
            .interpolation(.high)
            .scaledToFit()
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}
