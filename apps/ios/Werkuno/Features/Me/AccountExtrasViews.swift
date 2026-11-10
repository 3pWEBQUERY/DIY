import SwiftUI

// MARK: - Einstellungen → Konto: E-Mail-Adresse ändern (§9) und Angaben für Bestellungen
// Web-Gegenstück: `/einstellungen/konto` („Adresse ändern“, Abschnitt 03 „Angaben für Bestellungen“).

private struct MeEmailChangeResult: Decodable { var email: String; var message: String? }

/// `POST /me/email` – umgestellt wird erst, wenn der Link in der Mail an die neue Adresse geöffnet wird.
struct MeEmailChangeSheet: View {
    var currentEmail: String
    var hasPassword: Bool
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var app
    @State private var email = ""
    @State private var password = ""
    @State private var fields: [String: String] = [:]
    @State private var errorText: String?
    @State private var sentMessage: String?
    @State private var needsPassword = false

    var body: some View {
        NavigationStack {
            Form {
                if let sentMessage {
                    Section {
                        NoticeView(tone: .success, title: "Bestätigungslink unterwegs", message: sentMessage)
                            .listRowInsets(EdgeInsets())
                            .listRowBackground(Color.clear)
                    } footer: {
                        Text("Bis du den Link öffnest, gilt weiterhin \(currentEmail).")
                    }
                } else if !hasPassword || needsPassword {
                    Section {
                        NoticeView(tone: .info, title: "Zuerst ein Passwort festlegen", message: "Du meldest dich bisher nur mit Apple an. Lege unter „Passwort festlegen“ zuerst ein Passwort fest – damit bestätigst du die Änderung.")
                            .listRowInsets(EdgeInsets())
                            .listRowBackground(Color.clear)
                    }
                } else {
                    Section {
                        TextField("Neue E-Mail-Adresse", text: $email)
                            .keyboardType(.emailAddress)
                            .textContentType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                        if let e = fields["email"] { Text(e).font(.wr(.caption)).foregroundStyle(Color.danger) }
                    } header: { Text("Neue Adresse") } footer: {
                        Text("Wir schicken einen Bestätigungslink an die neue Adresse. Erst nach dem Klick wird umgestellt – bis dahin gilt deine bisherige Adresse.")
                    }
                    Section {
                        SecureField("Aktuelles Passwort", text: $password).textContentType(.password)
                        if let e = fields["password"] ?? fields["_"] { Text(e).font(.wr(.caption)).foregroundStyle(Color.danger) }
                    } header: { Text("Bestätigen") } footer: {
                        Text("Zur Sicherheit bestätigst du die Änderung mit deinem Passwort.")
                    }
                    if let errorText {
                        Section { Text(errorText).font(.wr(.subheadline)).foregroundStyle(Color.danger) }
                    }
                }
            }
            .meFormStyle()
            .navigationTitle("E-Mail-Adresse ändern")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(sentMessage == nil ? "Abbrechen" : "Fertig") { dismiss() }
                }
                if sentMessage == nil && hasPassword && !needsPassword {
                    ToolbarItem(placement: .confirmationAction) {
                        AsyncButton("Senden") { await submit() }
                            .disabled(!email.contains("@") || password.isEmpty)
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func submit() async {
        fields = [:]
        errorText = nil
        do {
            let r: MeEmailChangeResult = try await APIClient.shared.post("/me/email", ["email": JSONValue.string(email.trimmed), "password": .string(password)])
            withAnimation { sentMessage = r.message ?? "Wir haben einen Bestätigungslink an \(r.email) geschickt. Erst nach dem Klick wird die Adresse umgestellt." }
            Haptics.success()
        } catch let e as APIError {
            // Konto ohne Passwort (nur Apple): 422 mit fields.password
            if e.status == 422, e.fields?["password"] != nil, password.isEmpty || !hasPassword {
                withAnimation { needsPassword = true }
            } else if let f = e.fields, !f.isEmpty {
                fields = f
            } else {
                errorText = e.message
            }
            Haptics.warning()
        } catch {
            app.show(error: error)
        }
    }
}

// MARK: - Angaben für Bestellungen (`GET/PUT /me/customer-details`)

struct MeCustomerDetails: Codable, Sendable, Equatable {
    var firstName = ""
    var lastName = ""
    var line1 = ""
    var line2 = ""
    var postalCode = ""
    var city = ""
    var country = "CH"
    var phone = ""

    init() {}
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        firstName = try c.decodeIfPresent(String.self, forKey: .firstName) ?? ""
        lastName = try c.decodeIfPresent(String.self, forKey: .lastName) ?? ""
        line1 = try c.decodeIfPresent(String.self, forKey: .line1) ?? ""
        line2 = try c.decodeIfPresent(String.self, forKey: .line2) ?? ""
        postalCode = try c.decodeIfPresent(String.self, forKey: .postalCode) ?? ""
        city = try c.decodeIfPresent(String.self, forKey: .city) ?? ""
        country = try c.decodeIfPresent(String.self, forKey: .country) ?? "CH"
        phone = try c.decodeIfPresent(String.self, forKey: .phone) ?? ""
    }
}

private struct MeCustomerDetailsBox: Decodable { var details: MeCustomerDetails? }

/// Formular-Abschnitt in „Konto“: Name, Rechnungsadresse und Telefon – einmal erfasst, bei jeder Bestellung verwendet.
struct MeCustomerDetailsSection: View {
    @Environment(AppState.self) private var app
    @State private var saved: MeCustomerDetails?
    @State private var draft = MeCustomerDetails()
    @State private var loaded = false
    @State private var loadError: String?
    @State private var fields: [String: String] = [:]

    var body: some View {
        Section {
            if let loadError {
                VStack(alignment: .leading, spacing: 6) {
                    Text(loadError).font(.wr(.footnote)).foregroundStyle(Color.danger)
                    AsyncButton("Erneut versuchen") { await load() }.font(.wr(.footnote, .semibold))
                }
            } else if !loaded {
                ProgressView().frame(maxWidth: .infinity)
            } else {
                field("Vorname", \.firstName, key: "firstName", content: .givenName)
                field("Nachname", \.lastName, key: "lastName", content: .familyName)
                field("Strasse und Hausnummer", \.line1, key: "line1", content: .streetAddressLine1)
                field("Adresszusatz (optional)", \.line2, key: "line2", content: .streetAddressLine2)
                field("PLZ", \.postalCode, key: "postalCode", content: .postalCode, keyboard: .numberPad)
                field("Ort", \.city, key: "city", content: .addressCity)
                Picker("Land", selection: $draft.country) {
                    ForEach(L.shipCountries, id: \.key) { Text($0.label).tag($0.key) }
                }
                field("Telefon (optional)", \.phone, key: "phone", content: .telephoneNumber, keyboard: .phonePad)
                AsyncButton { await save() } label: { Text("Angaben speichern").fontWeight(.semibold) }
                    .disabled(draft == (saved ?? MeCustomerDetails()))
            }
        } header: { Text("Angaben für Bestellungen") } footer: {
            Text("Name und Adresse für Rechnung und Versand. Sie werden bei jeder Bestellung verwendet und nur an den Shop weitergegeben, bei dem du bestellst – nie öffentlich angezeigt. Das Telefon nutzen Shops nur für Rückfragen zu einer Lieferung.")
        }
        .task { if !loaded { await load() } }
    }

    private func field(_ title: String, _ path: WritableKeyPath<MeCustomerDetails, String>, key: String, content: UITextContentType, keyboard: UIKeyboardType = .default) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            TextField(title, text: Binding(get: { draft[keyPath: path] }, set: { draft[keyPath: path] = $0 }))
                .textContentType(content)
                .keyboardType(keyboard)
            if let e = fields[key] ?? fields["details.\(key)"] { Text(e).font(.wr(.caption)).foregroundStyle(Color.danger) }
        }
    }

    private func load() async {
        do {
            let r: MeCustomerDetailsBox = try await APIClient.shared.get("/me/customer-details")
            saved = r.details
            draft = r.details ?? MeCustomerDetails()
            loaded = true
            loadError = nil
        } catch is CancellationError {
        } catch {
            loadError = MeErr.text(error)
        }
    }

    private func save() async {
        fields = [:]
        do {
            let r: MeCustomerDetailsBox = try await APIClient.shared.put("/me/customer-details", draft)
            saved = r.details ?? draft
            draft = saved ?? draft
            app.show("Angaben gespeichert.")
        } catch {
            fields = (error as? APIError)?.fields ?? [:]
            app.show(error: error)
        }
    }
}
