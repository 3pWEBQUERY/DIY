import SwiftUI
import AuthenticationServices
import CryptoKit
import Security

/// Willkommen: Die Faden-Story in vier Kapiteln (Three.js) – danach Anmelden oder Registrieren.
struct AuthFlowView: View {
    @Environment(AppState.self) private var app
    @State private var chapter = 0
    @State private var sheet: AuthSheet?
    @State private var autoplay = true
    /// Roh-Nonce der laufenden Apple-Anmeldung: Apple bekommt den SHA-256-Hash, der Server den Rohwert
    /// und prüft, dass das Identity-Token genau zu dieser Anfrage gehört (Schutz vor Token-Replay).
    @State private var appleNonce: String?

    enum AuthSheet: String, Identifiable { case signIn, signUp, reset, mfa; var id: String { rawValue } }

    private struct Chapter { let kicker: String; let title: String; let text: String; let spec: [String] }
    private let chapters: [Chapter] = [
        Chapter(kicker: "01 · Entdecken", title: "Ein Faden.", text: "Alles beginnt mit einer Idee – und mit Menschen, die zeigen, wie sie entsteht.", spec: ["Baumwollgarn", "300 g", "Nadel 4 mm"]),
        Chapter(kicker: "02 · Erschaffen", title: "Schicht für Schicht.", text: "Dokumentiere dein Projekt im Journal – mit Fortschritt, Problemen und Lösungen.", spec: ["Steinzeug", "Ø 18 cm", "34 Wülste"]),
        Chapter(kicker: "03 · Teilen", title: "Zum Nachbauen.", text: "Aus Projekten werden Anleitungen, Materiallisten und Nachbauten anderer.", spec: ["Eiche massiv", "Sitzhöhe 45 cm", "4 Beine"]),
        Chapter(kicker: "04 · Gemeinsam wachsen", title: "Viele Projekte.", text: "Der Projektfaden verbindet Beiträge, Anleitungen, Shops und Communities.", spec: ["1 Projekt", "5 Verbindungen", "∞ Nachbauten"]),
    ]

    var body: some View {
        ZStack {
            Color.paper.ignoresSafeArea()
            DotGrid().ignoresSafeArea().opacity(0.6)
            VStack(spacing: 0) {
                HStack {
                    Wordmark(size: 24)
                    Spacer()
                    Button("Anmelden") { sheet = .signIn }
                        .buttonStyle(.glass)
                        .font(.wr(.subheadline, .semibold))
                }
                .padding(.horizontal, Space.gutter)
                .padding(.top, 8)

                ThreeCanvas(scene: .story(progress: Double(chapter)))
                    .frame(maxWidth: .infinity)
                    .frame(height: 360)
                    .padding(.top, 4)

                TabView(selection: $chapter) {
                    ForEach(chapters.indices, id: \.self) { i in
                        chapterView(chapters[i]).tag(i).padding(.horizontal, Space.gutter)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .frame(height: 190)
                .onChange(of: chapter) { _, _ in Haptics.selection() }
                .simultaneousGesture(DragGesture().onChanged { _ in autoplay = false })

                pager.padding(.vertical, 10)
                Spacer(minLength: 8)

                VStack(spacing: 10) {
                    Button { sheet = .signUp } label: { Text("Konto erstellen – kostenlos").frame(maxWidth: .infinity) }
                        .primaryButton()
                    if app.appleNative {
                        SignInWithAppleButton(.continue) { req in
                            req.requestedScopes = [.fullName, .email]
                            let raw = AppleNonce.random()
                            appleNonce = raw
                            req.nonce = AppleNonce.sha256(raw)
                        } onCompletion: { result in
                            Task { await handleApple(result) }
                        }
                        .signInWithAppleButtonStyle(.black)
                        .frame(height: 50)
                        .clipShape(Capsule())
                    }
                    Button("Erst einmal umsehen") { app.browseAsGuest() }
                        .font(.wr(.subheadline, .semibold))
                        .foregroundStyle(Color.moss)
                        .padding(.vertical, 4)
                    Text("Ab 18 Jahren. Mit der Registrierung akzeptierst du die Nutzungsbedingungen und die Datenschutzerklärung.")
                        .font(.wr(.caption2)).foregroundStyle(Color.muted).multilineTextAlignment(.center)
                }
                .padding(.horizontal, Space.gutter)
                .padding(.bottom, 12)
            }
        }
        .sheet(item: $sheet, onDismiss: {
            // Zwei-Faktor-Schritt weggewischt → ausstehende Session verwerfen
            if !app.isSignedIn { app.cancelMfa() }
        }) { s in
            Group {
                switch s {
                case .signIn: SignInSheet(onReset: { sheet = .reset }, onSignUp: { sheet = .signUp })
                case .signUp: SignUpSheet(onSignIn: { sheet = .signIn })
                case .reset: PasswordResetSheet()
                case .mfa: MfaSheet()
                }
            }
            .environment(app)
            .toastOverlay()
        }
        .task {
            // Story läuft von selbst, bis jemand wischt
            while autoplay && !Task.isCancelled {
                try? await Task.sleep(for: .seconds(4.6))
                guard autoplay, sheet == nil else { continue }
                withAnimation(.smooth) { chapter = (chapter + 1) % chapters.count }
            }
        }
    }

    private func chapterView(_ c: Chapter) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SpecLabel(c.kicker, color: .moss)
            Text(c.title).font(.display(38)).foregroundStyle(Color.ink)
            Text(c.text).font(.wr(.body)).foregroundStyle(Color.ink2).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 8) {
                ForEach(c.spec, id: \.self) { s in
                    Text(s).font(.spec).foregroundStyle(Color.muted)
                        .padding(.horizontal, 8).padding(.vertical, 4)
                        .overlay(Capsule().strokeBorder(Color.line))
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    private var pager: some View {
        GlassEffectContainer(spacing: 6) {
            HStack(spacing: 6) {
                ForEach(chapters.indices, id: \.self) { i in
                    Capsule()
                        .fill(i == chapter ? Color.ink : Color.lineStrong)
                        .frame(width: i == chapter ? 26 : 7, height: 7)
                        .onTapGesture { autoplay = false; withAnimation(.snappy) { chapter = i } }
                }
            }
            .padding(.horizontal, 12).padding(.vertical, 9)
            .glassEffect(.regular, in: Capsule())
        }
        .animation(.snappy, value: chapter)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Kapitel \(chapter + 1) von \(chapters.count)")
        .accessibilityAdjustableAction { dir in
            withAnimation { chapter = dir == .increment ? min(chapter + 1, chapters.count - 1) : max(chapter - 1, 0) }
        }
    }

    private func handleApple(_ result: Result<ASAuthorization, Error>) async {
        switch result {
        case .success(let auth):
            guard let cred = auth.credential as? ASAuthorizationAppleIDCredential, let data = cred.identityToken, let token = String(data: data, encoding: .utf8) else { return }
            let code = cred.authorizationCode.flatMap { String(data: $0, encoding: .utf8) }
            let nonce = appleNonce
            appleNonce = nil
            do {
                let done = try await app.signInWithApple(identityToken: token, givenName: cred.fullName?.givenName, familyName: cred.fullName?.familyName, authorizationCode: code, nonce: nonce)
                if !done && app.needsMfa { sheet = .mfa }
            } catch { app.show(error: error) }
        case .failure(let e):
            if (e as? ASAuthorizationError)?.code != .canceled { app.show(error: e) }
        }
    }
}

/// Nonce für „Mit Apple anmelden“: zufälliger Rohwert (an den Server) und dessen SHA-256 als Hex (an Apple).
enum AppleNonce {
    static func random(length: Int = 32) -> String {
        var bytes = [UInt8](repeating: 0, count: length)
        if SecRandomCopyBytes(kSecRandomDefault, length, &bytes) != errSecSuccess {
            // Sehr unwahrscheinlich – dann auf den System-Zufallsgenerator ausweichen
            bytes = (0..<length).map { _ in UInt8.random(in: 0...255) }
        }
        return bytes.map { String(format: "%02x", $0) }.joined()
    }

    static func sha256(_ input: String) -> String {
        SHA256.hash(data: Data(input.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}

/// Erneute Bestätigung mit Apple für Konten ohne Passwort (NEUE-FUNKTIONEN §11): Erstes Passwort
/// festlegen und Konto löschen verlangen ein frisches identityToken derselben Apple-ID
/// (höchstens 10 Minuten alt) als `appleIdentityToken`. Ohne Nachweis antwortet der Server mit
/// 403 und `fields.reauth == "apple"`.
final class AppleReauth: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private var continuation: CheckedContinuation<String, Error>?
    /// Der Controller hält seinen Delegate nur schwach – beide leben, solange `run()` wartet.
    private var controller: ASAuthorizationController?

    /// Verlangt der Server für diesen Schritt eine erneute Anmeldung mit Apple?
    static func isRequired(_ error: Error) -> Bool { (error as? APIError)?.fields?["reauth"] == "apple" }

    /// Zeigt den Apple-Dialog (ohne Scopes) und liefert das frische identityToken.
    /// Abbruch durch die Person → `CancellationError`.
    @MainActor
    static func identityToken() async throws -> String {
        try await AppleReauth().run()
    }

    /// Führt `send` mit dem passenden Nachweis aus: `appleFirst` holt das Apple-Token vor dem Absenden
    /// (Konto ohne Passwort). Antwortet der Server trotzdem mit `fields.reauth == "apple"` (z. B. weil
    /// `hasPassword` veraltet war), wird einmal mit Apple bestätigt und wiederholt – sofern
    /// `appleAvailable` (Sign in with Apple in der App eingerichtet).
    @MainActor
    static func perform<T>(appleFirst: Bool, appleAvailable: Bool, _ send: (String?) async throws -> T) async throws -> T {
        var token: String?
        if appleFirst && appleAvailable { token = try await identityToken() }
        do {
            return try await send(token)
        } catch {
            guard token == nil, appleAvailable, isRequired(error) else { throw error }
            let fresh = try await identityToken()
            return try await send(fresh)
        }
    }

    @MainActor
    private func run() async throws -> String {
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = []
        // Der Server prüft die Nonce hier nicht; sie bindet das Token trotzdem an genau diese Anfrage.
        request.nonce = AppleNonce.sha256(AppleNonce.random())
        let c = ASAuthorizationController(authorizationRequests: [request])
        c.delegate = self
        c.presentationContextProvider = self
        controller = c
        return try await withCheckedThrowingContinuation { cont in
            continuation = cont
            c.performRequests()
        }
    }

    private func finish(_ result: Result<String, Error>) {
        guard let cont = continuation else { return }
        continuation = nil
        controller = nil
        cont.resume(with: result)
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let cred = authorization.credential as? ASAuthorizationAppleIDCredential,
              let data = cred.identityToken, let token = String(data: data, encoding: .utf8) else {
            finish(.failure(APIError(code: "APPLE", message: "Die Bestätigung mit Apple ist fehlgeschlagen. Bitte versuche es erneut.", fields: nil, status: 0)))
            return
        }
        finish(.success(token))
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        if (error as? ASAuthorizationError)?.code == .canceled { finish(.failure(CancellationError())); return }
        finish(.failure(APIError(code: "APPLE", message: "Die Bestätigung mit Apple ist fehlgeschlagen. Bitte versuche es erneut.", fields: nil, status: 0)))
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            guard let scene = scenes.first(where: { $0.activationState == .foregroundActive }) ?? scenes.first else { return ASPresentationAnchor() }
            return scene.keyWindow ?? scene.windows.first ?? UIWindow(windowScene: scene)
        }
    }
}

/// Feines Punktraster als Werkbuch-Hintergrund
struct DotGrid: View {
    var body: some View {
        Canvas { ctx, size in
            let step: CGFloat = 22
            var p = Path()
            var y: CGFloat = 0
            while y < size.height { var x: CGFloat = 0; while x < size.width { p.addEllipse(in: CGRect(x: x, y: y, width: 1.3, height: 1.3)); x += step }; y += step }
            ctx.fill(p, with: .color(Color.lineStrong.opacity(0.55)))
        }
        .accessibilityHidden(true)
    }
}

// MARK: - Anmelden

struct SignInSheet: View {
    var onReset: () -> Void
    var onSignUp: () -> Void
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var password = ""
    @State private var error: APIError?
    @State private var mfaStep = false
    @FocusState private var field: Int?

    var body: some View {
        NavigationStack {
            if mfaStep {
                MfaStepView(onDone: { dismiss() }, onCancel: { withAnimation { mfaStep = false; password = "" } })
            } else {
                credentials
            }
        }
        .presentationDetents([.large])
    }

    private var credentials: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                PageTitle(kicker: "Willkommen zurück", title: "Anmelden", subtitle: "Schön, dass du wieder in der Werkstatt bist.")
                VStack(spacing: 12) {
                    AuthField(title: "E-Mail", text: $email, error: error?.fields?["email"], keyboard: .emailAddress, content: .username)
                        .focused($field, equals: 0).submitLabel(.next).onSubmit { field = 1 }
                    AuthField(title: "Passwort", text: $password, error: error?.fields?["password"], secure: true, content: .password)
                        .focused($field, equals: 1).submitLabel(.go).onSubmit { Task { await submit() } }
                }
                if let error, error.fields == nil { NoticeView(tone: .danger, message: error.message) }
                AsyncButton { await submit() } label: { Text("Anmelden").frame(maxWidth: .infinity) }
                    .primaryButton()
                    .disabled(email.trimmed.isEmpty || password.isEmpty)
                HStack {
                    Button("Passwort vergessen?", action: onReset)
                    Spacer()
                    Button("Neu hier? Registrieren", action: onSignUp)
                }
                .font(.wr(.footnote, .semibold))
                .foregroundStyle(Color.moss)
            }
            .padding(Space.gutter)
        }
        .background(Color.paper)
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Schliessen", systemImage: "xmark") { dismiss() } } }
        .onAppear { field = 0 }
    }

    private func submit() async {
        error = nil
        do {
            if try await app.signIn(email: email.trimmed, password: password) {
                Haptics.success()
                dismiss()
            } else if app.needsMfa {
                withAnimation(.smooth) { mfaStep = true }
            }
        } catch let e as APIError { withAnimation { error = e }; Haptics.warning() }
        catch { app.show(error: error) }
    }
}

// MARK: - Zwei-Faktor-Anmeldung (TOTP / Wiederherstellungscode)

/// Eigenes Sheet für den zweiten Schritt nach „Mit Apple anmelden“.
struct MfaSheet: View {
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            MfaStepView(onDone: { dismiss() }, onCancel: { dismiss() })
        }
        .presentationDetents([.large])
    }
}

/// Zweiter Anmeldeschritt: 6-stelliger Code aus der Authentifizierungs-App oder ein Wiederherstellungscode.
struct MfaStepView: View {
    var onDone: () -> Void
    var onCancel: () -> Void
    @Environment(AppState.self) private var app
    @State private var code = ""
    @State private var recovery = false
    @State private var error: APIError?
    @State private var submitting = false
    @FocusState private var focused: Bool

    private var digits: String { code.filter(\.isNumber) }
    private var canSubmit: Bool { recovery ? code.filter { $0.isLetter || $0.isNumber }.count >= 8 : digits.count == 6 }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                PageTitle(kicker: "Zwei-Faktor-Anmeldung",
                          title: recovery ? "Wiederherstellungscode" : "Bestätigungscode",
                          subtitle: recovery
                              ? "Gib einen deiner Wiederherstellungscodes ein. Jeder Code funktioniert nur einmal."
                              : "Gib den 6-stelligen Code aus deiner Authentifizierungs-App ein.")
                AuthField(title: recovery ? "Wiederherstellungscode" : "Code", text: $code, error: error?.fields?["code"],
                          keyboard: recovery ? .asciiCapable : .numberPad, content: recovery ? nil : UITextContentType.oneTimeCode, plain: true)
                    .focused($focused)
                    .submitLabel(.go)
                    .onSubmit { Task { await submit() } }
                    .onChange(of: code) { _, v in
                        if error != nil { withAnimation { error = nil } }
                        guard !recovery else { return }
                        let d = String(v.filter(\.isNumber).prefix(6))
                        if d != v { code = d }
                        // Vollständiger Code (auch per AutoFill) → direkt prüfen
                        if d.count == 6 && !submitting { Task { await submit() } }
                    }
                if let error, error.fields?["code"] == nil { NoticeView(tone: .danger, message: error.message) }
                AsyncButton { await submit() } label: { Text("Bestätigen").frame(maxWidth: .infinity) }
                    .primaryButton()
                    .disabled(!canSubmit || submitting)
                Button(recovery ? "Code aus der App verwenden" : "Wiederherstellungscode verwenden") {
                    withAnimation(.snappy) { recovery.toggle(); code = ""; error = nil }
                    focused = true
                }
                .font(.wr(.footnote, .semibold))
                .foregroundStyle(Color.moss)
            }
            .padding(Space.gutter)
        }
        .background(Color.paper)
        .scrollDismissesKeyboard(.interactively)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Abbrechen", systemImage: "xmark") { app.cancelMfa(); onCancel() }
            }
        }
        .onAppear { focused = true }
    }

    private func submit() async {
        guard canSubmit, !submitting else { return }
        submitting = true
        defer { submitting = false }
        error = nil
        do {
            try await app.verifyMfa(code: recovery ? code.trimmed : digits, recovery: recovery)
            Haptics.success()
            onDone()
        } catch let e as APIError {
            withAnimation { error = e }
            Haptics.warning()
            if !app.needsMfa {
                // Ausstehende Session abgelaufen → zurück zur Anmeldung
                app.show(e.message, style: .warning)
                onCancel()
            }
        } catch {
            app.show(error: error)
        }
    }
}

// MARK: - Registrieren (§8.1, 18+)

struct SignUpSheet: View {
    var onSignIn: () -> Void
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var displayName = ""
    @State private var handle = ""
    @State private var email = ""
    @State private var password = ""
    @State private var adult = false
    @State private var terms = false
    @State private var error: APIError?
    @State private var handleState: (ok: Bool, text: String)?
    @State private var handleTouched = false
    @State private var legal: URL?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    PageTitle(kicker: "Konto erstellen", title: "Willkommen bei Werkuno", subtitle: "Ein Konto für alles: entdecken, dokumentieren, bloggen und – wenn du magst – verkaufen.")
                    VStack(spacing: 12) {
                        AuthField(title: "Anzeigename", text: $displayName, error: error?.fields?["displayName"], content: .name)
                            .onChange(of: displayName) { _, v in if !handleTouched { handle = suggestHandle(v) } }
                        VStack(alignment: .leading, spacing: 4) {
                            AuthField(title: "Benutzername", text: $handle, error: error?.fields?["handle"], prefix: "@", content: .username)
                                .onChange(of: handle) { _, v in handleTouched = true; handle = v.lowercased().replacingOccurrences(of: " ", with: "") }
                            if let s = handleState, error?.fields?["handle"] == nil {
                                Label(s.text, systemImage: s.ok ? "checkmark.circle.fill" : "xmark.circle.fill")
                                    .font(.wr(.caption)).foregroundStyle(s.ok ? Color.moss : Color.danger)
                            }
                            Text("Dein Profil: werkuno/u/\(handle.isEmpty ? "name" : handle)").font(.wr(.caption2)).foregroundStyle(Color.muted)
                        }
                        AuthField(title: "E-Mail", text: $email, error: error?.fields?["email"], keyboard: .emailAddress, content: .emailAddress)
                        VStack(alignment: .leading, spacing: 6) {
                            AuthField(title: "Passwort", text: $password, error: error?.fields?["password"], secure: true, content: .newPassword)
                            PasswordStrength(password: password)
                        }
                    }
                    VStack(alignment: .leading, spacing: 12) {
                        Toggle(isOn: $adult) { Text("Ich bin mindestens 18 Jahre alt.").font(.wr(.subheadline)) }
                        Toggle(isOn: $terms) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Ich akzeptiere die Nutzungsbedingungen und habe die Datenschutzerklärung gelesen.").font(.wr(.subheadline))
                                HStack(spacing: 12) {
                                    Button("AGB") { legal = AppConfig.webURL("/rechtliches/agb") }
                                    Button("Datenschutz") { legal = AppConfig.webURL("/rechtliches/datenschutz") }
                                }
                                .font(.wr(.caption, .semibold)).foregroundStyle(Color.moss)
                            }
                        }
                    }
                    .tint(.moss)
                    .padding(14)
                    .cardSurface()
                    if let error, error.fields == nil || (error.fields?["adult"] != nil || error.fields?["terms"] != nil) { NoticeView(tone: .danger, message: error.message) }
                    AsyncButton { await submit() } label: { Text("Konto erstellen").frame(maxWidth: .infinity) }
                        .primaryButton()
                        .disabled(!adult || !terms || email.trimmed.isEmpty || password.count < 10 || displayName.trimmed.isEmpty || handle.count < 3)
                    Button("Schon dabei? Anmelden", action: onSignIn).font(.wr(.footnote, .semibold)).foregroundStyle(Color.moss).frame(maxWidth: .infinity)
                }
                .padding(Space.gutter)
            }
            .background(Color.paper)
            .scrollDismissesKeyboard(.interactively)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Schliessen", systemImage: "xmark") { dismiss() } } }
            .sheet(item: $legal) { SafariSheet(url: $0).ignoresSafeArea() }
            .task(id: handle) {
                guard handle.count >= 3 else { handleState = nil; return }
                try? await Task.sleep(for: .milliseconds(400))
                struct R: Decodable { var ok: Bool; var reason: String? }
                if let r: R = try? await APIClient.shared.post("/auth/handle-check", ["handle": JSONValue.string(handle)]) {
                    withAnimation { handleState = (r.ok, r.ok ? "Verfügbar" : (r.reason ?? "Nicht verfügbar")) }
                }
            }
        }
    }

    private func suggestHandle(_ name: String) -> String {
        let map: [Character: String] = ["ä": "ae", "ö": "oe", "ü": "ue", "é": "e", "è": "e", "à": "a", "ç": "c"]
        let s = name.lowercased().map { map[$0] ?? String($0) }.joined()
        let allowed = s.map { $0.isLetter || $0.isNumber ? String($0) : ($0 == " " || $0 == "-" ? "." : "") }.joined()
        return String(allowed.trimmingCharacters(in: CharacterSet(charactersIn: "._")).prefix(24))
    }

    private func submit() async {
        error = nil
        do {
            try await app.signUp(email: email.trimmed, password: password, displayName: displayName.trimmed, handle: handle.trimmed)
            Haptics.success()
            dismiss()
        } catch let e as APIError { withAnimation { error = e }; Haptics.warning() }
        catch { app.show(error: error) }
    }
}

struct PasswordStrength: View {
    var password: String
    private var score: Int {
        var s = 0
        if password.count >= 10 { s += 1 }
        if password.count >= 14 { s += 1 }
        if password.rangeOfCharacter(from: .decimalDigits) != nil || password.rangeOfCharacter(from: .punctuationCharacters.union(.symbols)) != nil { s += 1 }
        if password.rangeOfCharacter(from: .uppercaseLetters) != nil && password.rangeOfCharacter(from: .lowercaseLetters) != nil { s += 1 }
        return s
    }
    var body: some View {
        if !password.isEmpty {
            HStack(spacing: 4) {
                ForEach(0..<4, id: \.self) { i in Capsule().fill(i < score ? (score >= 3 ? Color.moss : Color.warn) : Color.line).frame(height: 3) }
                Text(password.count < 10 ? "Mind. 10 Zeichen" : score >= 3 ? "Stark" : "Ziffer oder Sonderzeichen ergänzen").font(.wr(.caption2)).foregroundStyle(Color.muted).fixedSize()
            }
            .animation(.snappy, value: score)
        }
    }
}

// MARK: - Passwort vergessen

struct PasswordResetSheet: View {
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var sent = false

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 20) {
                PageTitle(kicker: "Konto", title: "Passwort vergessen", subtitle: sent ? nil : "Wir schicken dir einen Link, mit dem du ein neues Passwort festlegen kannst.")
                if sent {
                    NoticeView(tone: .success, title: "E-Mail unterwegs", message: "Falls ein Konto mit dieser Adresse existiert, haben wir dir eine E-Mail geschickt. Der Link ist 60 Minuten gültig.")
                } else {
                    AuthField(title: "E-Mail", text: $email, error: nil, keyboard: .emailAddress, content: .emailAddress)
                    AsyncButton {
                        do {
                            _ = try await APIClient.shared.post("/auth/password-reset", ["email": JSONValue.string(email.trimmed)]) as JSONValue
                            withAnimation { sent = true }
                        } catch { app.show(error: error) }
                    } label: { Text("Link senden").frame(maxWidth: .infinity) }
                    .primaryButton()
                    .disabled(!email.contains("@"))
                }
                Spacer()
            }
            .padding(Space.gutter)
            .background(Color.paper)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(sent ? "Fertig" : "Abbrechen") { dismiss() } } }
        }
        .presentationDetents([.medium])
    }
}

// MARK: - Eingabefeld

struct AuthField: View {
    var title: String
    @Binding var text: String
    var error: String?
    var secure = false
    var prefix: String? = nil
    var keyboard: UIKeyboardType = .default
    var content: UITextContentType? = nil
    /// Codes o. ä.: keine Autokorrektur, keine Grossschreibung
    var plain = false
    @State private var reveal = false

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title).font(.wr(.caption, .semibold)).foregroundStyle(Color.muted)
            HStack(spacing: 4) {
                if let prefix { Text(prefix).foregroundStyle(Color.muted) }
                Group {
                    if secure && !reveal { SecureField("", text: $text) } else { TextField("", text: $text) }
                }
                .textContentType(content)
                .keyboardType(keyboard)
                .textInputAutocapitalization(keyboard == .emailAddress || secure || prefix != nil || plain ? .never : .words)
                .autocorrectionDisabled(keyboard == .emailAddress || secure || prefix != nil || plain)
                if secure {
                    Button { reveal.toggle() } label: { Image(systemName: reveal ? "eye.slash" : "eye").foregroundStyle(Color.muted) }
                        .buttonStyle(.plain)
                        .accessibilityLabel(reveal ? "Passwort verbergen" : "Passwort anzeigen")
                }
            }
            .font(.wr(.body))
            .padding(.horizontal, 14).padding(.vertical, 13)
            .background(Color.card, in: .rect(cornerRadius: Radius.inner, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Radius.inner, style: .continuous).strokeBorder(error == nil ? Color.line : Color.danger, lineWidth: error == nil ? 0.75 : 1.2))
            if let error { Text(error).font(.wr(.caption)).foregroundStyle(Color.danger) }
        }
        .accessibilityElement(children: .contain)
    }
}

extension URL: @retroactive Identifiable { public var id: String { absoluteString } }
