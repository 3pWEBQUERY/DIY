import SwiftUI
import AuthenticationServices
import CryptoKit
import Security

/// Willkommen: vier Kapitel mit je einem Werkstatt-Foto oben (weich ins Papier auslaufend) – danach Anmelden
/// oder Registrieren. Das Foto wechselt mit dem Kapitel; `focus` hält das Motiv auf jedem Bildschirm im Ausschnitt.
struct AuthFlowView: View {
    @Environment(AppState.self) private var app
    @Environment(\.colorScheme) private var colorScheme
    @State private var chapter = 0
    @State private var sheet: AuthSheet?
    @State private var autoplay = true
    /// Roh-Nonce der laufenden Apple-Anmeldung: Apple bekommt den SHA-256-Hash, der Server den Rohwert
    /// und prüft, dass das Identity-Token genau zu dieser Anfrage gehört (Schutz vor Token-Replay).
    @State private var appleNonce: String?
    @State private var appleMfa: MfaChallenge?

    enum AuthSheet: String, Identifiable { case signIn, signUp, reset; var id: String { rawValue } }

    private struct Chapter {
        let kicker: String; let title: String; let text: String
        let spec: [(symbol: String, label: String)]
        /// Bild im Asset-Katalog und Bildpunkt, der im Ausschnitt mittig bleiben soll (0…1)
        let image: String; let focus: UnitPoint
    }
    private let chapters: [Chapter] = [
        Chapter(kicker: "01 · Entdecken", title: "Ein Faden.", text: "Alles beginnt mit einer Idee – und mit Menschen, die zeigen, wie sie entsteht.",
                spec: [("circle.hexagongrid", "Granny Squares"), ("scribble.variable", "Baumwollgarn"), ("ruler", "Nadel 5 mm")],
                image: "Welcome1", focus: UnitPoint(x: 0.68, y: 0.42)),
        Chapter(kicker: "02 · Erschaffen", title: "Schicht für Schicht.", text: "Dokumentiere dein Projekt im Journal – mit Fortschritt, Problemen und Lösungen.",
                spec: [("cabinet", "Schrankbau"), ("ruler", "120 cm"), ("square.stack.3d.up", "Massivholz")],
                image: "Welcome2", focus: UnitPoint(x: 0.5, y: 0.46)),
        Chapter(kicker: "03 · Teilen", title: "Zum Nachbauen.", text: "Aus Projekten werden Anleitungen, Materiallisten und Nachbauten anderer.",
                spec: [("books.vertical", "Regal"), ("square.stack.3d.up", "Fichte massiv"), ("screwdriver", "Akkuschrauber")],
                image: "Welcome3", focus: UnitPoint(x: 0.74, y: 0.42)),
        Chapter(kicker: "04 · Gemeinsam wachsen", title: "Viele Projekte.", text: "Der Projektfaden verbindet Beiträge, Anleitungen, Shops und Communities.",
                spec: [("hare", "Amigurumi"), ("square.grid.2x2", "Granny Square"), ("scribble.variable", "Wolle")],
                image: "Welcome4", focus: UnitPoint(x: 0.5, y: 0.46)),
    ]

    var body: some View {
        // Passt sich der verfügbaren Höhe an: Auf kleinen Bildschirmen (iPhone SE, iPhone-App auf dem iPad) wird der
        // Bildbereich kleiner; reicht der Platz trotzdem nicht (z. B. grosse Schrift), lässt sich scrollen – die
        // Anmelde-Knöpfe bleiben immer erreichbar.
        GeometryReader { geo in
            let stage = stageHeight(for: geo.size.height)
            ZStack(alignment: .top) {
                Color.paper.ignoresSafeArea()

                // Foto: reicht bis hinter die Statusleiste und läuft bis zum Kapitel-Kicker ins Papier aus
                photo(height: geo.safeAreaInsets.top + 60 + stage + 30)
                    .ignoresSafeArea(edges: .top)

                ScrollView {
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

                        Color.clear.frame(height: stage).padding(.top, 4)

                        TabView(selection: $chapter) {
                            ForEach(chapters.indices, id: \.self) { i in
                                chapterView(chapters[i]).tag(i).padding(.horizontal, Space.gutter)
                            }
                        }
                        .tabViewStyle(.page(indexDisplayMode: .never))
                        .frame(height: geo.size.height < 760 ? 178 : 196)
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
                                .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)  // HIG: im Dunkeln die weisse Variante
                                .frame(height: 50)
                                .clipShape(Capsule())
                            }
                            Button("Erst einmal umsehen") { app.browseAsGuest() }
                                .font(.wr(.subheadline, .semibold))
                                .foregroundStyle(Color.moss)
                                .padding(.vertical, 4)
                            Text("Ab 18 Jahren. Mit der Registrierung akzeptierst du die Nutzungsbedingungen und die Datenschutzerklärung.")
                                .font(.wr(.caption2)).foregroundStyle(Color.muted).multilineTextAlignment(.center)
                                .fixedSize(horizontal: false, vertical: true)  // im ScrollView sonst auf eine Zeile gekürzt
                        }
                        .padding(.horizontal, Space.gutter)
                        .padding(.bottom, 12)
                    }
                    .frame(minHeight: geo.size.height)
                }
                .scrollBounceBehavior(.basedOnSize)
                .scrollIndicators(.hidden)
            }
        }
        .sheet(item: $sheet) { s in
            Group {
                switch s {
                case .signIn: SignInSheet(onReset: { sheet = .reset }, onSignUp: { sheet = .signUp })
                case .signUp: SignUpSheet(onSignIn: { sheet = .signIn })
                case .reset: PasswordResetSheet()
                }
            }
            .environment(app)
            .toastOverlay()
        }
        .sheet(item: $appleMfa) { c in
            TwoFactorSheet(challenge: c).environment(app).toastOverlay()
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

    /// Bildbereich zwischen Kopfzeile und Kapiteltext: so gross wie möglich (max. 380 pt), aber nie auf Kosten der
    /// Knöpfe. Rund 495 pt brauchen Kopfzeile, Kapiteltext, Seitenpunkte und Anmelde-Knöpfe; mindestens 110 pt.
    private func stageHeight(for height: CGFloat) -> CGFloat {
        let reserved: CGFloat = app.appleNative ? 495 : 435
        return min(380, max(110, height - reserved))
    }

    /// Kapitel-Foto mit weichem Übergang: oben leicht aufgehellt (Logo, Statusleiste), unten ins Papier auslaufend.
    private func photo(height: CGFloat) -> some View {
        ZStack {
            ForEach(chapters.indices, id: \.self) { i in
                if i == chapter {
                    FocalImage(name: chapters[i].image, focus: chapters[i].focus)
                        .transition(.opacity)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: height)
        .mask(LinearGradient(stops: [.init(color: .black, location: 0), .init(color: .black, location: 0.6), .init(color: .clear, location: 1)], startPoint: .top, endPoint: .bottom))
        .overlay(alignment: .top) {
            LinearGradient(colors: [Color.paper.opacity(0.7), Color.paper.opacity(0)], startPoint: .top, endPoint: .bottom)
                .frame(height: 150)
        }
        .animation(.easeInOut(duration: 0.7), value: chapter)
        .accessibilityHidden(true)
    }

    private func chapterView(_ c: Chapter) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SpecLabel(c.kicker, color: .moss)
            Text(c.title).font(.display(38)).foregroundStyle(Color.ink)
                .lineLimit(1).minimumScaleFactor(0.75)  // „Schicht für Schicht.“ passt so auch auf schmale Bildschirme
            Text(c.text).font(.wr(.body)).foregroundStyle(Color.ink2).fixedSize(horizontal: false, vertical: true)
            // Drei Merkmale; passt das nicht in die Breite (schmale Bildschirme, grosse Schrift), nur die ersten zwei
            ViewThatFits(in: .horizontal) {
                chips(c.spec)
                chips(Array(c.spec.prefix(2)))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    private func chips(_ items: [(symbol: String, label: String)]) -> some View {
        HStack(spacing: 8) {
            ForEach(items, id: \.label) { item in
                HStack(spacing: 6) {
                    Image(systemName: item.symbol).font(.system(size: 12, weight: .medium))
                    Text(item.label).font(.wr(.footnote, .medium))
                }
                .lineLimit(1)
                .fixedSize()
                .foregroundStyle(Color.ink2)
                .padding(.horizontal, 10).padding(.vertical, 6)
                .background(Color.card.opacity(0.7), in: Capsule())
                .overlay(Capsule().strokeBorder(Color.line))
            }
        }
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
            do { try await app.signInWithApple(identityToken: token, givenName: cred.fullName?.givenName, familyName: cred.fullName?.familyName, authorizationCode: code, nonce: nonce) }
            catch let c as MfaChallenge { appleMfa = c }
            catch { app.show(error: error) }
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
            // Die Anmeldung startet immer aus einer sichtbaren Oberfläche – eine Szene gibt es also stets
            // (das frühere `ASPresentationAnchor()` ohne Szene ist seit iOS 26 veraltet)
            guard let scene = scenes.first(where: { $0.activationState == .foregroundActive }) ?? scenes.first else {
                preconditionFailure("Anmelden mit Apple ohne aktive Fensterszene")
            }
            return scene.keyWindow ?? scene.windows.first ?? UIWindow(windowScene: scene)
        }
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
    @State private var mfa: MfaChallenge?
    @FocusState private var field: Int?

    var body: some View {
        NavigationStack {
            ScrollView {
                if let mfa {
                    TwoFactorStep(challenge: mfa, onDone: { dismiss() }, onCancel: { withAnimation(.snappy) { self.mfa = nil; password = "" } })
                        .padding(Space.gutter)
                        .transition(.move(edge: .trailing).combined(with: .opacity))
                } else {
                    credentials
                }
            }
            .background(Color.paper)
            .scrollDismissesKeyboard(.interactively)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Schliessen", systemImage: "xmark") { close() } } }
            .onAppear { field = 0 }
        }
        .presentationDetents([.large])
        .interactiveDismissDisabled(mfa != nil)
    }

    /// Schliessen während Schritt 2: ausstehende Sitzung verwerfen
    private func close() {
        if let mfa { Task { await app.cancelSignIn(mfa) } }
        dismiss()
    }

    private var credentials: some View {
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

    private func submit() async {
        error = nil
        do {
            try await app.signIn(email: email.trimmed, password: password)
            Haptics.success()
            dismiss()
        } catch let c as MfaChallenge {
            withAnimation(.snappy) { mfa = c }
        } catch let e as APIError { withAnimation { error = e }; Haptics.warning() }
        catch { app.show(error: error) }
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
    /// Land bestimmt die Währung (CH/LI: Franken, DE/AT: Euro) – Pflicht, bewusst ohne Vorauswahl
    @State private var country: MemberCountry?
    @State private var error: APIError?
    @State private var handleState: (ok: Bool, text: String)?
    @State private var handleTouched = false
    /// Zuletzt automatisch vorgeschlagener Benutzername – Änderungen auf genau diesen Wert stammen nicht vom Nutzer.
    @State private var suggestedHandle = ""
    @State private var legal: URL?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    PageTitle(kicker: "Konto erstellen", title: "Willkommen bei Werkuno", subtitle: "Ein Konto für alles: entdecken, dokumentieren, bloggen und – wenn du magst – verkaufen.")
                    VStack(spacing: 12) {
                        AuthField(title: "Anzeigename", text: $displayName, error: error?.fields?["displayName"], content: .name)
                            .onChange(of: displayName) { _, v in
                                guard !handleTouched else { return }
                                let s = suggestHandle(v)
                                suggestedHandle = s
                                handle = s
                            }
                        VStack(alignment: .leading, spacing: 4) {
                            AuthField(title: "Benutzername", text: $handle, error: error?.fields?["handle"], prefix: "@", content: .username)
                                .onChange(of: handle) { _, v in
                                    let normalized = v.lowercased().replacingOccurrences(of: " ", with: "")
                                    if normalized != v { handle = normalized; return }
                                    // Nur echte Eingaben sperren den Vorschlag; leeres Feld nimmt ihn wieder auf
                                    if v.isEmpty { handleTouched = false } else if v != suggestedHandle { handleTouched = true }
                                }
                            if let s = handleState, error?.fields?["handle"] == nil {
                                Label(s.text, systemImage: s.ok ? "checkmark.circle.fill" : "xmark.circle.fill")
                                    .font(.wr(.caption)).foregroundStyle(s.ok ? Color.moss : Color.danger)
                            }
                            Text("Dein Profil: \(AppConfig.baseURL.host() ?? "werkuno.ch")/u/\(handle.isEmpty ? "name" : handle)").font(.wr(.caption2)).foregroundStyle(Color.muted)
                        }
                        AuthField(title: "E-Mail", text: $email, error: error?.fields?["email"], keyboard: .emailAddress, content: .emailAddress)
                        VStack(alignment: .leading, spacing: 6) {
                            AuthField(title: "Passwort", text: $password, error: error?.fields?["password"], secure: true, content: .newPassword)
                            PasswordStrength(password: password)
                        }
                    }
                    CountryPicker(selection: $country, hint: "Bestimmt, in welcher Währung du Preise siehst und bezahlst. Später in den Einstellungen änderbar.", error: error?.fields?["country"])
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
                        .disabled(country == nil || !adult || !terms || email.trimmed.isEmpty || password.count < 10 || displayName.trimmed.isEmpty || handle.count < 3)
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
        guard let country else { return }
        do {
            try await app.signUp(email: email.trimmed, password: password, displayName: displayName.trimmed, handle: handle.trimmed, country: country.rawValue)
            Haptics.success()
            dismiss()
        } catch let e as APIError { withAnimation { error = e }; Haptics.warning() }
        catch { app.show(error: error) }
    }
}

struct PasswordStrength: View {
    var password: String
    private var hasDigitOrSymbol: Bool {
        password.rangeOfCharacter(from: .decimalDigits) != nil || password.rangeOfCharacter(from: .punctuationCharacters.union(.symbols)) != nil
    }
    private var hasMixedCase: Bool {
        password.rangeOfCharacter(from: .uppercaseLetters) != nil && password.rangeOfCharacter(from: .lowercaseLetters) != nil
    }
    private var score: Int {
        var s = 0
        if password.count >= 10 { s += 1 }
        if password.count >= 14 { s += 1 }
        if hasDigitOrSymbol { s += 1 }
        if hasMixedCase { s += 1 }
        return s
    }
    /// Nennt das Kriterium, das tatsächlich noch fehlt.
    private var hint: String {
        if password.count < 10 { return "Mind. 10 Zeichen" }
        if score >= 3 { return "Stark" }
        if !hasDigitOrSymbol { return "Ziffer oder Sonderzeichen ergänzen" }
        if !hasMixedCase { return "Gross- und Kleinbuchstaben mischen" }
        return "Länger machen (ab 14 Zeichen)"
    }
    var body: some View {
        if !password.isEmpty {
            HStack(spacing: 4) {
                ForEach(0..<4, id: \.self) { i in Capsule().fill(i < score ? (score >= 3 ? Color.moss : Color.warn) : Color.line).frame(height: 3) }
                Text(hint).font(.wr(.caption2)).foregroundStyle(Color.muted).fixedSize()
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
            ScrollView {
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
            }
            .padding(Space.gutter)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Color.paper)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(sent ? "Fertig" : "Abbrechen") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
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
    @State private var reveal = false

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title).font(.wr(.caption, .semibold)).foregroundStyle(Color.muted)
            HStack(spacing: 4) {
                if let prefix { Text(prefix).foregroundStyle(Color.muted) }
                Group {
                    if secure && !reveal { SecureField("", text: $text) } else { TextField("", text: $text) }
                }
                .accessibilityLabel(title)
                .textContentType(content)
                .keyboardType(keyboard)
                .textInputAutocapitalization(keyboard == .emailAddress || secure || prefix != nil ? .never : .words)
                .autocorrectionDisabled(keyboard == .emailAddress || secure || prefix != nil)
                if secure {
                    Button { reveal.toggle() } label: {
                        Image(systemName: reveal ? "eye.slash" : "eye").foregroundStyle(Color.muted)
                            .frame(width: 44, height: 44)
                            .contentShape(Rectangle())
                    }
                        .buttonStyle(.plain)
                        // 44-pt-Trefferfläche, ohne das Feld höher zu machen
                        .padding(.vertical, -12).padding(.trailing, -12)
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

/// Bild, das seine Fläche füllt und dabei den Bildpunkt `focus` möglichst in der Mitte hält – so bleibt das Motiv
/// (Person, Hände, Werkstück) bei Hoch- und Querformat-Fotos auf jedem Bildschirm im Ausschnitt.
private struct FocalImage: View {
    let name: String
    let focus: UnitPoint

    var body: some View {
        GeometryReader { g in
            if let ui = UIImage(named: name), ui.size.width > 0, ui.size.height > 0 {
                let scale = max(g.size.width / ui.size.width, g.size.height / ui.size.height)
                let w = ui.size.width * scale, h = ui.size.height * scale
                let x = min(0, max(g.size.width - w, g.size.width / 2 - focus.x * w))
                let y = min(0, max(g.size.height - h, g.size.height / 2 - focus.y * h))
                Image(uiImage: ui).resizable().frame(width: w, height: h).offset(x: x, y: y)
            }
        }
        .clipped()
    }
}
