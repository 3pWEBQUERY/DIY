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
                CountryFlagView(country: c, size: 28)
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

/// Quadratische Landesflagge mit abgerundeten Ecken (statt Emoji). Gezeichnet im 32er-Raster wie im Web
/// (`components/account/country-flag.tsx`).
struct CountryFlagView: View {
    let country: MemberCountry
    var size: CGFloat = 30

    var body: some View {
        Canvas { ctx, canvasSize in
            CountryFlagView.draw(country, in: &ctx, scale: canvasSize.width / 32)
        }
        .frame(width: size, height: size)
        .clipShape(.rect(cornerRadius: size * 0.22, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: size * 0.22, style: .continuous)
                .strokeBorder(Color.black.opacity(0.1), lineWidth: 0.5)
        }
        .accessibilityHidden(true)
    }

    private static func rgb(_ r: Double, _ g: Double, _ b: Double) -> Color {
        Color(red: r / 255, green: g / 255, blue: b / 255)
    }

    private static func fill(_ ctx: inout GraphicsContext, _ s: CGFloat, _ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat, _ color: Color) {
        ctx.fill(Path(CGRect(x: x * s, y: y * s, width: w * s, height: h * s)), with: .color(color))
    }

    private static func draw(_ country: MemberCountry, in ctx: inout GraphicsContext, scale s: CGFloat) {
        switch country {
        case .CH:
            fill(&ctx, s, 0, 0, 32, 32, rgb(218, 41, 28))
            fill(&ctx, s, 13, 6, 6, 20, .white)
            fill(&ctx, s, 6, 13, 20, 6, .white)
        case .LI:
            fill(&ctx, s, 0, 0, 32, 16, rgb(0, 43, 127))
            fill(&ctx, s, 0, 16, 32, 16, rgb(206, 17, 38))
            drawCrown(&ctx, s)
        case .DE:
            fill(&ctx, s, 0, 0, 32, 10.7, .black)
            fill(&ctx, s, 0, 10.66, 32, 10.7, rgb(221, 0, 0))
            fill(&ctx, s, 0, 21.33, 32, 10.67, rgb(255, 206, 0))
        case .AT:
            fill(&ctx, s, 0, 0, 32, 32, rgb(200, 16, 46))
            fill(&ctx, s, 0, 10.66, 32, 10.68, .white)
        }
    }

    /// Vereinfachte Fürstenkrone (Liechtenstein)
    private static func drawCrown(_ ctx: inout GraphicsContext, _ s: CGFloat) {
        let gold = rgb(255, 216, 61)
        let points: [CGPoint] = [
            CGPoint(x: 6.6, y: 11.4), CGPoint(x: 5.9, y: 6.7), CGPoint(x: 8.3, y: 8.6), CGPoint(x: 10.5, y: 5.3),
            CGPoint(x: 12.7, y: 8.6), CGPoint(x: 15.1, y: 6.7), CGPoint(x: 14.4, y: 11.4),
        ]
        var crown = Path()
        crown.addLines(points.map { CGPoint(x: $0.x * s, y: $0.y * s) })
        crown.closeSubpath()
        ctx.fill(crown, with: .color(gold))
        let band = CGRect(x: 6.6 * s, y: 11.8 * s, width: 8.2 * s, height: 1.3 * s)
        ctx.fill(Path(roundedRect: band, cornerRadius: 0.4 * s), with: .color(gold))
        let orb = CGRect(x: 9.6 * s, y: 3.4 * s, width: 1.8 * s, height: 1.8 * s)
        ctx.fill(Path(ellipseIn: orb), with: .color(gold))
    }
}
