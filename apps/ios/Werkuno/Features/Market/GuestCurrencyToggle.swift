import SwiftUI

/// Markt für Gäste ohne Konto: Preise in CHF oder EUR (wie im Web die Umschaltung für Abgemeldete).
/// Die Wahl bleibt auf dem Gerät gespeichert und geht als `X-Werkuno-Currency` an den Server.
struct GuestCurrencyToggle: View {
    @Environment(AppState.self) private var app

    var body: some View {
        Picker("Währung", selection: Binding(get: { app.priceCurrency }, set: { c in Haptics.selection(); app.setGuestCurrency(c) })) {
            Text("CHF").tag("CHF")
            Text("EUR").tag("EUR")
        }
        .pickerStyle(.segmented)
        .fixedSize()
        .accessibilityLabel("Währung der Preise")
        .accessibilityHint("Umgerechnet zum aktuellen Tageskurs")
    }
}
