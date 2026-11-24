import SwiftUI
import CoreImage.CIFilterBuiltins

// Zwei-Faktor-Anmeldung verwalten (Einstellungen › Sicherheit) – wie im Web
// (components/settings/two-factor.tsx): einrichten, Wiederherstellungscodes neu erzeugen, deaktivieren.
// Server: GET /settings/mfa, POST /settings/mfa/{setup,confirm,recovery-codes,disable}.

struct MfaStatus: Decodable, Sendable {
    var enabled: Bool
    var enabledAt: Date?
    var recoveryCodesLeft: Int
    var hasPassword: Bool
    var required: Bool?
}

private struct MfaSetupStart: Decodable, Sendable {
    var secret: String
    var uri: String
}

private struct MfaCodes: Decodable, Sendable {
    var recoveryCodes: [String]
}

/// Abschnitt im Sicherheits-Formular
struct MfaSettingsSection: View {
    @Environment(AppState.self) private var app
    @State private var status: MfaStatus?
    @State private var sheet: MfaSheet?

    enum MfaSheet: String, Identifiable {
        case setup, regenerate, disable
        var id: String { rawValue }
    }

    var body: some View {
        Section {
            content
        } header: {
            Group { Text("Zwei-Faktor-Anmeldung") }.font(.wr(.footnote, .semibold))
        } footer: {
            Group { Text("Zusätzlich zum Passwort fragt Werkuno beim Anmelden nach einem Code aus einer Authenticator-App (z. B. Passwörter auf dem iPhone, 1Password, Google Authenticator).") }.font(.wr(.footnote))
        }
        .task { if status == nil { await load() } }
        .sheet(item: $sheet, onDismiss: { Task { await load() } }) { s in
            switch s {
            case .setup: MfaSetupSheet(hasPassword: status?.hasPassword ?? true)
            case .regenerate: MfaRegenerateSheet()
            case .disable: MfaDisableSheet(hasPassword: status?.hasPassword ?? true)
            }
        }
    }

    @ViewBuilder private var content: some View {
        if let s = status {
            if s.enabled {
                HStack(spacing: 8) {
                    MeStatePill(text: "Aktiv", tone: .moss)
                    if let d = s.enabledAt { Text("seit \(Fmt.date(d))").font(.wr(.caption)).foregroundStyle(Color.muted) }
                }
                Text(s.recoveryCodesLeft == 1 ? "Noch 1 Wiederherstellungscode übrig." : "Noch \(s.recoveryCodesLeft) Wiederherstellungscodes übrig.")
                    .font(.wr(.subheadline))
                    .foregroundStyle(s.recoveryCodesLeft <= 2 ? Color.danger : Color.ink2)
                Button("Neue Wiederherstellungscodes erzeugen", systemImage: "arrow.clockwise") { sheet = .regenerate }
                if s.required != true {
                    Button("Zwei-Faktor-Anmeldung deaktivieren", systemImage: "lock.open", role: .destructive) { sheet = .disable }
                } else {
                    Text("Für Moderations- und Admin-Konten ist die Zwei-Faktor-Anmeldung Pflicht.").font(.wr(.caption)).foregroundStyle(Color.muted)
                }
            } else {
                Text("Nicht aktiv").font(.wr(.subheadline)).foregroundStyle(Color.muted)
                Button("Zwei-Faktor-Anmeldung einrichten", systemImage: "lock.shield") { sheet = .setup }
            }
        } else {
            ProgressView()
        }
    }

    private func load() async {
        do { status = try await APIClient.shared.get("/settings/mfa") } catch is CancellationError {} catch { app.show(error: error) }
    }
}

// MARK: - Einrichten

private struct MfaSetupSheet: View {
    var hasPassword: Bool
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var password = ""
    @State private var start: MfaSetupStart?
    @State private var code = ""
    @State private var codes: [String]?
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                if let codes {
                    MfaRecoveryCodesSection(codes: codes)
                } else if let start {
                    scanSection(start)
                    confirmSection
                } else {
                    passwordSection
                }
            }
            .navigationTitle("Zwei-Faktor-Anmeldung")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(codes == nil ? "Abbrechen" : "Fertig") { dismiss() }
                }
            }
            .interactiveDismissDisabled(codes != nil)
        }
    }

    private var passwordSection: some View {
        Section {
            if hasPassword {
                SecureField("Aktuelles Passwort", text: $password).textContentType(.password)
            }
            AsyncButton { await begin() } label: { Text("Weiter") }
                .disabled(busy || (hasPassword && password.isEmpty))
        } footer: {
            Text(hasPassword ? "Zum Schutz deines Kontos bestätigst du zuerst mit deinem Passwort." : "Zum Schutz deines Kontos bestätigst du als Nächstes mit Apple.")
        }
    }

    private func scanSection(_ s: MfaSetupStart) -> some View {
        Section {
            if let img = QRImage.make(s.uri) {
                Image(uiImage: img)
                    .interpolation(.none)
                    .resizable()
                    .scaledToFit()
                    .frame(maxWidth: 200)
                    .frame(maxWidth: .infinity)
                    .accessibilityLabel("QR-Code für die Authenticator-App")
            }
            if let url = URL(string: s.uri) {
                Button("In Authenticator-App öffnen", systemImage: "arrow.up.forward.app") { openURL(url) }
            }
            VStack(alignment: .leading, spacing: 4) {
                Text("Schlüssel zum Abtippen").font(.wr(.caption)).foregroundStyle(Color.muted)
                Text(s.secret).font(.system(.body, design: .monospaced)).textSelection(.enabled)
            }
            Button("Schlüssel kopieren", systemImage: "doc.on.doc") {
                UIPasteboard.general.string = s.secret.replacingOccurrences(of: " ", with: "")
                app.show("Schlüssel kopiert.")
            }
        } header: {
            Text("1 · In der Authenticator-App hinzufügen")
        }
    }

    private var confirmSection: some View {
        Section {
            TextField("6-stelliger Code", text: $code)
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
            AsyncButton { await confirm() } label: { Text("Aktivieren") }
                .disabled(busy || code.filter(\.isNumber).count < 6)
        } header: {
            Text("2 · Code bestätigen")
        } footer: {
            Text("Danach werden alle anderen Geräte abgemeldet.")
        }
    }

    private func begin() async {
        busy = true
        defer { busy = false }
        let pw = password
        let usePassword = hasPassword
        do {
            let r: MfaSetupStart = try await AppleReauth.perform(appleFirst: !usePassword, appleAvailable: app.appleNative) { token in
                var body: [String: JSONValue] = ["password": usePassword ? .string(pw) : .null]
                if let token { body["appleIdentityToken"] = .string(token) }
                return try await APIClient.shared.post("/settings/mfa/setup", body) as MfaSetupStart
            }
            start = r
        } catch is CancellationError {
        } catch { app.show(error: error) }
    }

    private func confirm() async {
        busy = true
        defer { busy = false }
        do {
            let r: MfaCodes = try await APIClient.shared.post("/settings/mfa/confirm", ["code": code.filter(\.isNumber)])
            codes = r.recoveryCodes
            app.show("Zwei-Faktor-Anmeldung aktiviert. Alle anderen Sitzungen wurden abgemeldet.")
        } catch { app.show(error: error) }
    }
}

// MARK: - Wiederherstellungscodes

private struct MfaRegenerateSheet: View {
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var code = ""
    @State private var codes: [String]?

    var body: some View {
        NavigationStack {
            Form {
                if let codes {
                    MfaRecoveryCodesSection(codes: codes)
                } else {
                    Section {
                        TextField("Aktueller Code aus der App", text: $code)
                            .keyboardType(.numberPad)
                            .textContentType(.oneTimeCode)
                        AsyncButton { await regenerate() } label: { Text("Neue Codes erzeugen") }
                            .disabled(code.filter(\.isNumber).count < 6)
                    } footer: {
                        Text("Die bisherigen Wiederherstellungscodes werden ungültig.")
                    }
                }
            }
            .navigationTitle("Wiederherstellungscodes")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(codes == nil ? "Abbrechen" : "Fertig") { dismiss() } }
            }
            .interactiveDismissDisabled(codes != nil)
        }
    }

    private func regenerate() async {
        do {
            let r: MfaCodes = try await APIClient.shared.post("/settings/mfa/recovery-codes", ["code": code.filter(\.isNumber)])
            codes = r.recoveryCodes
            app.show("Neue Wiederherstellungscodes erstellt. Die alten sind ungültig.")
        } catch { app.show(error: error) }
    }
}

/// Codes einmalig anzeigen: kopieren oder teilen
private struct MfaRecoveryCodesSection: View {
    var codes: [String]
    @Environment(AppState.self) private var app

    private var joined: String { codes.joined(separator: "\n") }

    var body: some View {
        Section {
            ForEach(codes, id: \.self) { c in
                Text(c).font(.system(.body, design: .monospaced)).textSelection(.enabled)
            }
            Button("Alle kopieren", systemImage: "doc.on.doc") {
                UIPasteboard.general.string = joined
                app.show("Codes kopiert.")
            }
            ShareLink(item: "Werkuno – Wiederherstellungscodes\n\n" + joined) {
                Label("Teilen oder sichern", systemImage: "square.and.arrow.up")
            }
        } header: {
            Text("Wiederherstellungscodes")
        } footer: {
            Text("Bewahre die Codes sicher auf (z. B. im Passwort-Manager). Jeder Code funktioniert einmal, falls du keinen Zugriff auf die Authenticator-App hast. Sie werden nur jetzt angezeigt.")
        }
    }
}

// MARK: - Deaktivieren

private struct MfaDisableSheet: View {
    var hasPassword: Bool
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var password = ""
    @State private var code = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    if hasPassword {
                        SecureField("Aktuelles Passwort", text: $password).textContentType(.password)
                    }
                    TextField("Aktueller Code aus der App", text: $code)
                        .keyboardType(.numberPad)
                        .textContentType(.oneTimeCode)
                } footer: {
                    Text("Ohne zweiten Faktor reicht zum Anmelden wieder das Passwort.")
                }
                Section {
                    AsyncButton { await disable() } label: { Text("Deaktivieren").foregroundStyle(Color.danger) }
                        .disabled(code.filter(\.isNumber).count < 6 || (hasPassword && password.isEmpty))
                }
            }
            .navigationTitle("Deaktivieren")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
            }
        }
    }

    private func disable() async {
        let pw = password
        let c = code.filter(\.isNumber)
        let usePassword = hasPassword
        do {
            let _: JSONValue = try await AppleReauth.perform(appleFirst: !usePassword, appleAvailable: app.appleNative) { token in
                var body: [String: JSONValue] = ["code": .string(c), "password": usePassword ? .string(pw) : .null]
                if let token { body["appleIdentityToken"] = .string(token) }
                return try await APIClient.shared.post("/settings/mfa/disable", body) as JSONValue
            }
            app.show("Zwei-Faktor-Anmeldung deaktiviert.")
            dismiss()
        } catch is CancellationError {
        } catch { app.show(error: error) }
    }
}

// MARK: - QR-Code

enum QRImage {
    /// QR-Code als scharfes Bild (CoreImage, ohne Netz)
    static func make(_ text: String, scale: CGFloat = 8) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(text.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: scale, y: scale)) else { return nil }
        guard let cg = CIContext().createCGImage(output, from: output.extent) else { return nil }
        return UIImage(cgImage: cg)
    }
}
