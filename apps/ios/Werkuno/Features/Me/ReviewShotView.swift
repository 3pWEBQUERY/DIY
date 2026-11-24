#if DEBUG
import SwiftUI

/// Prüf-Screenshot für App Store Connect: Profilkopf einer Creatorin mit der echten Karte
/// „Unterstützen“ (feste Beispieldaten statt Server). Nur in Debug-Builds; die CI startet die App mit
/// `-WerkunoReviewShot` und nimmt den Bildschirm auf.
struct ReviewShotView: View {
    private let creatorName = "Lena Brunner"

    private var offer: SupportOfferResponse {
        SupportOfferResponse(
            offer: .init(
                enabled: true,
                priceMinor: 500,
                currency: "CHF",
                perks: "Exklusive Häkelanleitungen mit Video, Vorlagen zum Ausdrucken und früher Zugang zu neuen Mustern.",
                exclusiveTutorials: 6,
                creator: .init(id: "review", handle: "lena.haekelt", displayName: creatorName, avatarUrl: nil),
                me: nil
            ),
            apple: .init(productId: "ch.werkuno.app.support.tier5", appAccountToken: "00000000-0000-4000-8000-000000000000")
        )
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    AvatarView(url: nil, name: creatorName, size: 88, category: "textil")
                        .padding(.top, 12)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(creatorName).font(.display(28)).foregroundStyle(Color.ink)
                        Text("@lena.haekelt").font(.wr(.subheadline)).foregroundStyle(Color.muted)
                    }
                    Text("Ich häkle Taschen, Körbe und Decken aus Baumwolle und teile hier meine Anleitungen – Schritt für Schritt erklärt.")
                        .font(.wr(.body)).foregroundStyle(Color.ink2)
                        .fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: 20) {
                        stat("48", "Projekte")
                        stat("21", "Anleitungen")
                        stat("1 284", "Follower")
                    }
                    SupportCardView(creatorId: "review", creatorName: creatorName, preview: offer, previewPrice: "CHF 7.00")
                }
                .padding(.horizontal, Space.gutter)
                .padding(.bottom, 32)
            }
            .background(Color.paper)
            .navigationTitle("Profil")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private func stat(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(.wr(.headline, .bold)).foregroundStyle(Color.ink).monospacedDigit()
            Text(label).font(.wr(.caption)).foregroundStyle(Color.muted)
        }
    }
}
#endif
