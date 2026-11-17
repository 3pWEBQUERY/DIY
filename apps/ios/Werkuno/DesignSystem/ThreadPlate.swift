import SwiftUI

// Dateiname bleibt „ThreadPlate.swift“, damit bestehende Xcode-Projekte ohne neues `xcodegen generate` weiter bauen.
// Inhalt: Platzhalterbilder je Inhaltstyp und CoverView (die Faden-Tafel gibt es nicht mehr).

// MARK: - Platzhalter (wenn kein eigenes Bild vorhanden ist)

/// Inhaltstyp – bestimmt das Platzhalterbild, wenn kein eigenes Bild gesetzt ist (wie im Web).
enum PlaceholderKind {
    case project, workbench, article, community, tutorial, product

    var assetName: String {
        switch self {
        case .project: "PlaceholderProject"
        // Ohne eigenes Motiv: Anleitungen zeigen das Werkzeug, Produkte die Werkstücke
        case .workbench, .tutorial: "PlaceholderWorkbench"
        case .article: "PlaceholderArticle"
        case .community, .product: "PlaceholderCommunity"
        }
    }

    /// Treffertyp der Suche → Platzhalter
    init(searchType: String?) {
        switch searchType {
        case "tutorial": self = .tutorial
        case "product", "shop": self = .product
        case "community": self = .community
        case "article": self = .article
        default: self = .project
        }
    }
}

/// Platzhalterbild – füllt die vorgeschlagene Fläche und wird dort beschnitten.
struct PlaceholderImage: View {
    var kind: PlaceholderKind

    var body: some View {
        Color.sunken
            .overlay {
                Image(kind.assetName)
                    .resizable()
                    .scaledToFill()
            }
            .clipped()
            .accessibilityHidden(true)
    }
}

/// Bild oder Platzhalterbild – die Standard-Darstellung jeder Titelfläche.
struct CoverView: View {
    var url: String?
    var seed: String
    var category: String?
    var showLabel = true
    var animated = false
    /// .fit: Bild vollständig zeigen statt beschneiden (Produktfotos)
    var contentMode: ContentMode = .fill
    /// Platzhalter ohne eigenes Bild
    var kind: PlaceholderKind = .project

    var body: some View {
        // Color.clear übernimmt die vorgeschlagene Grösse; das Bild füllt sie (bzw. passt hinein) und wird dort beschnitten
        Color.clear
            .overlay {
                RemoteImage(path: url, contentMode: contentMode) {
                    PlaceholderImage(kind: kind)
                }
            }
            .clipped()
            .contentShape(.rect)
    }
}
