import SwiftUI
import AVKit

// MARK: - Videos in Beiträgen, Projekten und Vollbild (wie im Web: Vorschaubild + echter Player)
//
// Der Server liefert für Videos die Varianten `video` (MP4) und `poster`/`sm` (Vorschaubild).
// Solange der Worker noch umwandelt, fehlt `video` – dann erscheint „Video wird verarbeitet …“.

extension MediaItem {
    /// Abspielbare MP4-Datei (nur bei Videos, sobald umgewandelt)
    var videoURL: URL? { isVideo ? AppConfig.resolve(variants?.video) : nil }
    /// Vorschaubild eines Videos bzw. das Bild selbst
    var posterURL: String? { isVideo ? (variants?.poster ?? variants?.sm ?? preview) : displayURL }
}

/// Video mit Vorschaubild. Erst beim Antippen wird der Player geladen (spart Daten im Feed);
/// `autoplay` startet sofort (Vollbild).
struct InlineVideo: View {
    var media: MediaItem
    var contentMode: ContentMode = .fill
    var autoplay = false

    @State private var player: AVPlayer?

    var body: some View {
        ZStack {
            if let player {
                VideoPlayer(player: player)
                    .onDisappear { player.pause() }
            } else {
                RemoteImage(path: media.posterURL, contentMode: contentMode) { Color.black.opacity(0.85) }
                if media.videoURL == nil {
                    VStack(spacing: 8) {
                        ProgressView().tint(.white)
                        Text("Video wird verarbeitet …").font(.wr(.footnote)).foregroundStyle(.white)
                    }
                    .padding(14)
                    .background(.black.opacity(0.45), in: .rect(cornerRadius: 14, style: .continuous))
                } else {
                    Button(action: start) {
                        Image(systemName: "play.fill")
                            .font(.system(size: 22, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(width: 60, height: 60)
                            .background(.black.opacity(0.45), in: Circle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(media.alt?.nilIfEmpty.map { "Video abspielen: \($0)" } ?? "Video abspielen")
                }
            }
        }
        .background(Color.black)
        .onAppear { if autoplay { start() } }
    }

    private func start() {
        guard player == nil, let url = media.videoURL else { return }
        // Ton auch im Stummmodus, wie bei Videos üblich
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
        let p = AVPlayer(url: url)
        player = p
        p.play()
    }
}
