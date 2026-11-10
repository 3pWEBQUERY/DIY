import SwiftUI

// MARK: - Zwei-Faktor-Anmeldung (Moderation/Administration Pflicht, sonst freiwillig)

/// Passwort bzw. Apple-Anmeldung war korrekt, das Konto verlangt aber noch einen zweiten Faktor.
/// Das Token ist erst nach `POST /api/v1/auth/session/mfa` gültig und wird bis dahin nicht gespeichert.
struct MfaChallenge: Error, Identifiable, Hashable {
    let token: String
    var id: String { token }
}

enum MfaKind: String { case totp, recovery }

extension AppState {
    /// Schritt 2: Code prüfen, danach Token übernehmen und wie gewohnt starten.
    func completeSignIn(_ challenge: MfaChallenge, code: String, kind: MfaKind) async throws {
        try await api.verifyMfa(pendingToken: challenge.token, code: code, kind: kind.rawValue)
        api.token = challenge.token
        isGuest = false
        await refresh()
    }

    /// Abbrechen: ausstehende Sitzung verwerfen.
    func cancelSignIn(_ challenge: MfaChallenge) async {
        await api.revoke(pendingToken: challenge.token)
    }
}

/// Code-Eingabe wie im Web (`/anmelden/zwei-faktor`): 6-stelliger Code oder Wiederherstellungscode.
struct TwoFactorStep: View {
    var challenge: MfaChallenge
    var onDone: () -> Void
    var onCancel: () -> Void
    @Environment(AppState.self) private var app
    @State private var kind: MfaKind = .totp
    @State private var code = ""
    @State private var error: String?
    @State private var busy = false
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            PageTitle(kicker: "Schritt 2 von 2", title: "Bestätigen", subtitle: kind == .totp
                      ? "Gib den 6-stelligen Code aus deiner Authenticator-App ein."
                      : "Gib einen deiner Wiederherstellungscodes ein.")

            VStack(alignment: .leading, spacing: 6) {
                Text(kind == .totp ? "Code aus der App" : "Wiederherstellungscode")
                    .font(.wr(.caption, .semibold)).foregroundStyle(Color.muted)
                TextField(kind == .totp ? "000000" : "xxxxx-xxxxx", text: $code)
                    .font(.wr(size: kind == .totp ? 28 : 22, weight: .semibold).monospacedDigit())
                    .tracking(kind == .totp ? 8 : 2)
                    .multilineTextAlignment(.center)
                    .keyboardType(kind == .totp ? .numberPad : .asciiCapable)
                    .textContentType(kind == .totp ? .oneTimeCode : nil)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($focused)
                    .padding(.vertical, 14)
                    .background(Color.card, in: .rect(cornerRadius: Radius.inner, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: Radius.inner, style: .continuous).strokeBorder(error == nil ? Color.line : Color.danger, lineWidth: error == nil ? 0.75 : 1.2))
                    .onChange(of: code) { _, v in
                        if kind == .totp {
                            let digits = String(v.filter(\.isNumber).prefix(6))
                            if digits != v { code = digits; return }
                            if digits.count == 6 && !busy { Task { await submit() } }
                        } else if v.count > 20 {
                            code = String(v.prefix(20))
                        }
                    }
                    .onSubmit { Task { await submit() } }
                    .accessibilityLabel(kind == .totp ? "Code aus der App" : "Wiederherstellungscode")
                if let error {
                    Text(error).font(.wr(.caption)).foregroundStyle(Color.danger)
                } else {
                    Text(kind == .totp ? "Der Code wechselt alle 30 Sekunden." : "Jeder Code funktioniert genau einmal.")
                        .font(.wr(.caption)).foregroundStyle(Color.muted)
                }
            }

            Button { Task { await submit() } } label: {
                ZStack {
                    Text("Bestätigen").opacity(busy ? 0 : 1)
                    if busy { ProgressView().controlSize(.small) }
                }
                .frame(maxWidth: .infinity)
            }
            .primaryButton()
            .disabled(busy || code.trimmed.isEmpty)

            HStack {
                Button(kind == .totp ? "Wiederherstellungscode verwenden" : "Code aus der App verwenden") {
                    withAnimation(.snappy) {
                        kind = kind == .totp ? .recovery : .totp
                        code = ""
                        error = nil
                    }
                    focused = true
                }
                .foregroundStyle(Color.moss)
                Spacer()
                Button("Abbrechen") {
                    Task { await app.cancelSignIn(challenge) }
                    onCancel()
                }
                .foregroundStyle(Color.muted)
            }
            .font(.wr(.footnote, .semibold))

            Text("Kein Zugriff auf die App und keine Wiederherstellungscodes mehr? Melde dich beim Support – die Zwei-Faktor-Anmeldung kann nach einer Identitätsprüfung zurückgesetzt werden.")
                .font(.wr(.caption)).foregroundStyle(Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .onAppear { focused = true }
    }

    private func submit() async {
        let value = code.trimmed
        guard !value.isEmpty, !busy else { return }
        busy = true
        defer { busy = false }
        withAnimation { error = nil }
        do {
            try await app.completeSignIn(challenge, code: value, kind: kind)
            Haptics.success()
            onDone()
        } catch let e as APIError {
            if e.isAuth {
                // Ausstehende Sitzung abgelaufen → zurück zum Passwort
                app.show("Die Anmeldung ist abgelaufen. Bitte melde dich erneut an.", style: .warning)
                onCancel()
                return
            }
            withAnimation { error = e.fields?["code"] ?? e.message }
            code = ""
            Haptics.warning()
        } catch {
            app.show(error: error)
        }
    }
}

/// Eigenes Sheet für den zweiten Faktor nach „Mit Apple fortfahren“.
struct TwoFactorSheet: View {
    var challenge: MfaChallenge
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                TwoFactorStep(challenge: challenge, onDone: { dismiss() }, onCancel: { dismiss() })
                    .padding(Space.gutter)
            }
            .background(Color.paper)
            .scrollDismissesKeyboard(.interactively)
        }
        .presentationDetents([.large])
        .interactiveDismissDisabled()
    }
}
