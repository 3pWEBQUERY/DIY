import SwiftUI

/// Funktionen von Creator Pro – dieselben Schlüssel wie im Web (`/studio/pro?funktion=…`).
/// Wer kein Pro hat und auf eine Pro-Funktion tippt, landet auf der Pro-Seite mit dieser Funktion
/// hervorgehoben (Abschluss in der App nur über Apple, siehe `ProStore`).
enum ProFeature: String, CaseIterable, Identifiable, Hashable, Sendable {
    case schaufenster
    case medienkit
    case statistik
    case videos
    case provision
    case newsletter
    case aktionen
    case kalender
    case kommentare
    case profilDesign = "profil-design"
    case pdfBranding = "pdf-branding"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .schaufenster: "Profil mit Schaufenster"
        case .medienkit: "Medienkit für Kooperationen"
        case .statistik: "Statistik über 12 Monate"
        case .videos: "Längere Videos"
        case .provision: "Tiefere Provision im Shop"
        case .newsletter: "Newsletter an deine Follower"
        case .aktionen: "Shop-Aktionen mit Countdown"
        case .kalender: "Planen und Inhaltskalender"
        case .kommentare: "Kommentare im Griff"
        case .profilDesign: "Eigenes Profil-Design"
        case .pdfBranding: "Anleitungs-PDF mit deinem Branding"
        }
    }

    /// Kurzer Name für „„…“ gehört zu Creator Pro“
    var shortName: String {
        switch self {
        case .schaufenster: "Schaufenster"
        case .medienkit: "Medienkit"
        case .statistik: "Jahresstatistik"
        case .videos: "Längere Videos"
        case .provision: "Tiefere Provision"
        case .newsletter: "Newsletter"
        case .aktionen: "Shop-Aktionen"
        case .kalender: "Planen"
        case .kommentare: "Kommentar-Werkzeuge"
        case .profilDesign: "Profil-Design"
        case .pdfBranding: "PDF-Branding"
        }
    }

    var symbol: String {
        switch self {
        case .schaufenster: "rectangle.3.group"
        case .medienkit: "doc.richtext"
        case .statistik: "chart.bar.xaxis"
        case .videos: "film"
        case .provision: "percent"
        case .newsletter: "envelope"
        case .aktionen: "timer"
        case .kalender: "calendar.badge.clock"
        case .kommentare: "text.bubble"
        case .profilDesign: "paintpalette"
        case .pdfBranding: "printer"
        }
    }

    func text(featuredMax max: Int = 3) -> String {
        switch self {
        case .schaufenster: "Bis zu \(max) Projekte ganz oben in deinem Profil hervorheben – und das Pro-Kennzeichen neben deinem Namen."
        case .medienkit: "Eine Seite mit deinen besten Arbeiten und echten, erklärten Zahlen. Teilbar per Link, druckbar als PDF."
        case .statistik: "Verläufe über ein ganzes Jahr statt 12 Wochen – und alle Zahlen als CSV für Excel oder Numbers."
        case .videos: "Längere und grössere Videos in Beiträgen, Projekten und Anleitungen."
        case .provision: "Eine tiefere Plattformprovision auf den Warenwert jedes Verkaufs."
        case .newsletter: "Neue Projekte, Anleitungen oder Drops direkt ins Postfach – sofort oder geplant, mit Öffnungen und Klicks."
        case .aktionen: "Zeitlich begrenzte Rabatte auf den ganzen Shop oder ausgewählte Stücke – mit Countdown, automatisch an und aus."
        case .kalender: "Projekte und Anleitungen zu einem festen Zeitpunkt veröffentlichen und alles Geplante im Blick behalten."
        case .kommentare: "Einen Kommentar oben anheften, Kommentare mit bestimmten Wörtern ausblenden und Kommentare je Inhalt schliessen."
        case .profilDesign: "Akzentfarbe, Titelbild und Reihenfolge der Bereiche auf deinem Profil selbst wählen."
        case .pdfBranding: "Druck- und PDF-Version deiner Anleitungen mit deinem Logo, Namen und Link."
        }
    }
}

/// Ruhiger Hinweis mit Knopf „Mit Creator Pro freischalten“ – öffnet die Pro-Seite mit der Funktion
/// hervorgehoben. `beforeOpen` z. B. zum Schliessen eines Blatts, bevor navigiert wird.
struct ProUnlockCard: View {
    var feature: ProFeature
    var message: String? = nil
    var beforeOpen: (() -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("„\(feature.shortName)“ gehört zu Creator Pro", systemImage: "seal")
                .font(.wr(.subheadline, .semibold))
                .foregroundStyle(Color.ink)
            Text(message ?? feature.text())
                .font(.wr(.footnote))
                .foregroundStyle(Color.muted)
                .fixedSize(horizontal: false, vertical: true)
            ProUnlockButton(feature: feature, beforeOpen: beforeOpen)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
    }
}

/// Knopf „Mit Creator Pro freischalten“ (öffnet die Pro-Seite mit hervorgehobener Funktion)
struct ProUnlockButton: View {
    @Environment(Router.self) private var router
    var feature: ProFeature
    var title: String = "Mit Creator Pro freischalten"
    var beforeOpen: (() -> Void)? = nil

    var body: some View {
        Button {
            Haptics.tap()
            ProUnlock.open(feature, router: router, beforeOpen: beforeOpen)
        } label: {
            Label(title, systemImage: "arrow.right")
                .font(.wr(.subheadline, .semibold))
                .foregroundStyle(Color.moss)
        }
        .buttonStyle(.plain)
        .accessibilityHint("Öffnet Creator Pro mit allen Funktionen")
    }
}

enum ProUnlock {
    /// Pro-Seite öffnen; aus einem Blatt heraus erst schliessen, dann (kurz verzögert) navigieren
    @MainActor static func open(_ feature: ProFeature, router: Router, beforeOpen: (() -> Void)? = nil) {
        guard let beforeOpen else {
            router.open(.creatorPro(feature: feature))
            return
        }
        beforeOpen()
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(350))
            router.open(.creatorPro(feature: feature))
        }
    }
}

/// Pro-Seite als Blatt – für Stellen in Editoren, die man nicht verlassen soll (ungesicherte Eingaben)
struct ProFeatureSheet: View {
    var feature: ProFeature
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            StudioProView(highlight: feature)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Schliessen") { dismiss() } }
                }
        }
    }
}
