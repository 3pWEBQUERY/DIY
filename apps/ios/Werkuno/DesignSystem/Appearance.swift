import SwiftUI
import UIKit

// MARK: - Darstellung: Hell, Dunkel oder wie das System
//
// Die Wahl wird lokal gespeichert (`werkuno.appearance`) und auf alle Fenster angewendet
// (overrideUserInterfaceStyle). So folgen auch UIKit-Teile (Leisten, Alerts, Sheets) und die
// dynamischen Farben (`Color.dynamic`) zuverlässig – auch beim Zurückwechseln auf „System“.

enum AppAppearance: String, CaseIterable, Identifiable {
    case system, light, dark

    static let storageKey = "werkuno.appearance"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .system: "System"
        case .light: "Hell"
        case .dark: "Dunkel"
        }
    }

    var symbol: String {
        switch self {
        case .system: "iphone"
        case .light: "sun.max"
        case .dark: "moon"
        }
    }

    var style: UIUserInterfaceStyle {
        switch self {
        case .system: .unspecified
        case .light: .light
        case .dark: .dark
        }
    }

    static var current: AppAppearance {
        AppAppearance(rawValue: UserDefaults.standard.string(forKey: storageKey) ?? "") ?? .system
    }

    /// Auf alle offenen Fenster anwenden. Bewusst ohne UIView.transition: Die Überblendung des ganzen
    /// Fensters hielt die alte Darstellung (inkl. alter Auswahl) fest und schluckte Tipps während der Animation.
    @MainActor static func apply(_ a: AppAppearance = .current) {
        for scene in UIApplication.shared.connectedScenes {
            guard let ws = scene as? UIWindowScene else { continue }
            for w in ws.windows where w.overrideUserInterfaceStyle != a.style {
                w.overrideUserInterfaceStyle = a.style
            }
        }
    }
}

/// Auswahl als drei Kacheln (Hell · Dunkel · System) – für Einstellungen und Gastbereich.
struct AppearancePicker: View {
    @AppStorage(AppAppearance.storageKey) private var raw = AppAppearance.system.rawValue
    /// Sichtbare Auswahl – wechselt sofort beim Tippen, unabhängig vom Umschalten der Fenster
    @State private var selection: AppAppearance = .current

    var body: some View {
        HStack(spacing: 10) {
            ForEach([AppAppearance.light, .dark, .system]) { a in
                let on = a == selection
                Button {
                    guard a != selection else { return }
                    Haptics.selection()
                    selection = a
                    raw = a.rawValue
                    // Erst die neue Auswahl zeichnen, dann die Darstellung umschalten
                    Task { @MainActor in AppAppearance.apply(a) }
                } label: {
                    VStack(spacing: 8) {
                        preview(a)
                        HStack(spacing: 5) {
                            Image(systemName: on ? "checkmark.circle.fill" : "circle")
                                .font(.wr(.footnote, .semibold))
                                .foregroundStyle(on ? Color.moss : Color.muted)
                            Text(a.label).font(.wr(.footnote, on ? .bold : .medium)).foregroundStyle(Color.ink)
                        }
                    }
                    .padding(10)
                    .frame(maxWidth: .infinity)
                    .background(on ? Color.mossSoft : Color.clear, in: .rect(cornerRadius: Radius.inner, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: Radius.inner, style: .continuous).strokeBorder(on ? Color.moss : Color.line, lineWidth: on ? 1.5 : 0.75))
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Darstellung \(a.label)")
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .padding(12)
        .onAppear { selection = AppAppearance(rawValue: raw) ?? .system }
        .onChange(of: raw) { _, new in selection = AppAppearance(rawValue: new) ?? .system }
    }

    /// Kleine Vorschau: Papier, Karte, Akzent – in hell bzw. dunkel; „System“ halb/halb
    @ViewBuilder private func preview(_ a: AppAppearance) -> some View {
        let shape = RoundedRectangle(cornerRadius: 10, style: .continuous)
        Group {
            switch a {
            case .light: miniScreen(dark: false)
            case .dark: miniScreen(dark: true)
            case .system:
                HStack(spacing: 0) {
                    miniScreen(dark: false).frame(maxWidth: .infinity, alignment: .leading).clipped()
                    miniScreen(dark: true).frame(maxWidth: .infinity, alignment: .trailing).clipped()
                }
            }
        }
        .frame(height: 64)
        .clipShape(shape)
        .overlay(shape.strokeBorder(Color.lineStrong, lineWidth: 0.75))
        .accessibilityHidden(true)
    }

    private func miniScreen(dark: Bool) -> some View {
        let paper = Color(UIColor(hex: dark ? 0x151312 : 0xFFFFFF))
        let card = Color(UIColor(hex: dark ? 0x1F1C1B : 0xFFFFFF))
        let ink = Color(UIColor(hex: dark ? 0xEEEAE6 : 0x262427))
        let accent = Color(UIColor(hex: dark ? 0xE47F6B : 0xB64B3A))
        return ZStack(alignment: .topLeading) {
            paper
            VStack(alignment: .leading, spacing: 4) {
                Capsule().fill(ink).frame(width: 26, height: 4)
                RoundedRectangle(cornerRadius: 4, style: .continuous).fill(card)
                    .frame(height: 22)
                    .overlay(alignment: .leading) { Capsule().fill(accent).frame(width: 18, height: 4).padding(.leading, 5) }
                Capsule().fill(accent).frame(width: 34, height: 7)
            }
            .padding(7)
        }
    }
}
