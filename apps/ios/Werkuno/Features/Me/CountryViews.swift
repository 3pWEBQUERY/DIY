import SwiftUI

/// Wahl des Landes (CH, LI, DE, AT) als vier Kacheln mit Währung – bestimmt, in welcher Währung
/// Preise erscheinen und bezahlt werden. Gleiche Gestaltung wie die Auswahl der Darstellung.
struct CountryPicker: View {
    @Binding var selection: MemberCountry?
    var title: String? = "Land"
    var hint: String? = "Bestimmt, in welcher Währung du Preise siehst und bezahlst."
    var error: String? = nil

    private let columns = [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let title { Text(title).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink) }
            if let hint { Text(hint).font(.wr(.footnote)).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true) }
            LazyVGrid(columns: columns, spacing: 8) {
                ForEach(MemberCountry.allCases) { c in
                    tile(c)
                }
            }
            if let error {
                Text(error).font(.wr(.footnote)).foregroundStyle(Color.danger)
            }
        }
    }

    private func tile(_ c: MemberCountry) -> some View {
        let on = selection == c
        let border: Color = on ? .moss : (error != nil ? .danger : .lineStrong)
        return Button {
            Haptics.selection()
            selection = c
        } label: {
            HStack(spacing: 10) {
                Text(c.flag).font(.system(size: 22))
                VStack(alignment: .leading, spacing: 2) {
                    Text(c.label).font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink).lineLimit(1).minimumScaleFactor(0.8)
                    Text(c.currency == "EUR" ? "PREISE IN € EURO" : "PREISE IN CHF FRANKEN")
                        .font(.system(size: 10, weight: .medium, design: .monospaced))
                        .foregroundStyle(Color.muted)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 11)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(on ? Color.mossSoft : Color.card, in: .rect(cornerRadius: Radius.inner, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Radius.inner, style: .continuous).strokeBorder(border, lineWidth: on ? 1.5 : 0.75))
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(c.label), Preise in \(Currency.name(c.currency))")
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

/// Einmalige Abfrage für bestehende Konten ohne bestätigtes Land. Nicht wegwischbar, aber vorausgefüllt –
/// meist genügt ein Tippen. Danach lädt die App neu, damit alle Preise in der passenden Währung erscheinen.
struct CountryPromptSheet: View {
    var suggested: String?
    @Environment(AppState.self) private var app
    @State private var country: MemberCountry?
    @State private var error: APIError?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    PageTitle(kicker: "Einmalig", title: "Woher kommst du?", subtitle: "Damit du alle Preise in deiner Währung siehst: aus der Schweiz und Liechtenstein in Franken, aus Deutschland und Österreich in Euro.")
                    CountryPicker(selection: $country, hint: nil, error: error?.fields?["country"])
                    if let error, error.fields?["country"] == nil { NoticeView(tone: .danger, message: error.message) }
                    AsyncButton { await save() } label: { Text(buttonTitle).frame(maxWidth: .infinity) }
                        .primaryButton()
                        .disabled(country == nil)
                    Text("Jederzeit änderbar unter Einstellungen → Profil.")
                        .font(.wr(.caption))
                        .foregroundStyle(Color.muted)
                        .frame(maxWidth: .infinity)
                }
                .padding(Space.gutter)
            }
            .background(Color.paper)
        }
        .interactiveDismissDisabled()
        .onAppear { if country == nil { country = MemberCountry(code: suggested) } }
    }

    private var buttonTitle: String {
        guard let country else { return "Land wählen" }
        return "Weiter mit Preisen in \(Currency.name(country.currency))"
    }

    private func save() async {
        guard let country else { return }
        error = nil
        do {
            struct R: Decodable { var country: String; var currency: String? }
            let r: R = try await APIClient.shared.post("/me/country", ["country": JSONValue.string(country.rawValue)])
            Haptics.success()
            await app.refresh()
            app.show("Gespeichert – du siehst Preise jetzt in \(Currency.name(r.currency ?? country.currency)).")
        } catch let e as APIError {
            withAnimation { error = e }
            Haptics.warning()
        } catch {
            app.show(error: error)
        }
    }
}
