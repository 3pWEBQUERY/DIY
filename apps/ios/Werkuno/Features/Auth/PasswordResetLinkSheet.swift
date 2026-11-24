import SwiftUI

// Link aus der E-Mail „Passwort zurücksetzen“ (`/passwort-zuruecksetzen/:token`) – neues Passwort direkt
// in der App festlegen. Server: POST /auth/password-reset/confirm (beendet alle Sitzungen, wie im Web).

struct PasswordResetLinkSheet: View {
    var link: PasswordResetLink
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var password = ""
    @State private var repeated = ""
    @State private var done = false

    private var mismatch: Bool { !repeated.isEmpty && repeated != password }
    private var tooShort: Bool { !password.isEmpty && password.count < 10 }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    PageTitle(kicker: "Konto", title: "Neues Passwort", subtitle: done ? nil : "Mindestens 10 Zeichen, mit Buchstaben und einer Ziffer oder einem Sonderzeichen.")
                    if done {
                        NoticeView(tone: .success, title: "Passwort geändert", message: "Alle Sitzungen wurden abgemeldet. Melde dich jetzt mit dem neuen Passwort an.")
                    } else {
                        form
                    }
                }
                .padding(Space.gutter)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Color.paper)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(done ? "Fertig" : "Abbrechen") { dismiss() } } }
        }
    }

    @ViewBuilder private var form: some View {
        AuthField(title: "Neues Passwort", text: $password, error: tooShort ? "Mindestens 10 Zeichen" : nil, secure: true, content: .newPassword)
        AuthField(title: "Passwort wiederholen", text: $repeated, error: mismatch ? "Die Passwörter stimmen nicht überein" : nil, secure: true, content: .newPassword)
        AsyncButton { await save() } label: { Text("Passwort speichern").frame(maxWidth: .infinity) }
            .primaryButton()
            .disabled(password.count < 10 || repeated != password)
    }

    private func save() async {
        do {
            _ = try await APIClient.shared.post("/auth/password-reset/confirm", ["token": link.token, "password": password]) as JSONValue
            withAnimation { done = true }
            // Der Server hat alle Sitzungen beendet – auch die dieser App
            if app.isSignedIn { await app.signOut(sessionRevoked: true) }
        } catch { app.show(error: error) }
    }
}
