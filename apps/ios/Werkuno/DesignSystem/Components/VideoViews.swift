import SwiftUI
import AVKit
import Combine

// MARK: - Videos in Beiträgen, Projekten und Vollbild (wie im Web: Vorschaubild + echter Player)
//
// Der Server liefert für Videos die Varianten `video` (MP4) und `poster`/`sm` (Vorschaubild).
// Direkt nach dem Hochladen wandelt der Worker das Video noch um – bis dahin zeigt die App einen
// Platzhalter mit Ladeanimation und fragt den Stand ab; sobald das Video fertig ist, erscheint es.

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

    /// Varianten, die nach dem Umwandeln nachgeladen wurden (überschreiben die des Beitrags)
    @State private var fresh: MediaVariants?
    @State private var processingFailed = false
    @State private var player: AVPlayer?
    @State private var buffering = true

    private var current: MediaItem {
        guard let fresh else { return media }
        var m = media
        m.variants = fresh
        return m
    }

    var body: some View {
        let m = current
        // Schwarze Fläche nimmt genau den vorgesehenen Platz ein; Vorschaubild und Player passen sich
        // darin ein (sonst ragt z. B. ein Hochformat-Vorschaubild über den Rahmen hinaus)
        Color.black.overlay { ZStack {
            if let player {
                VideoPlayer(player: player)
                    .onDisappear { player.pause() }
                    .onReceive(player.publisher(for: \.timeControlStatus).receive(on: RunLoop.main)) { s in
                        withAnimation(.easeOut(duration: 0.2)) { buffering = s == .waitingToPlayAtSpecifiedRate }
                    }
                    .onReceive(player.publisher(for: \.currentItem?.status).receive(on: RunLoop.main)) { s in
                        if s == .readyToPlay, player.timeControlStatus == .playing { buffering = false }
                    }
                if buffering { VideoLoadingBadge(text: nil).allowsHitTesting(false).transition(.opacity) }
            } else if m.videoURL == nil {
                VideoProcessingPlaceholder(posterPath: m.posterURL, contentMode: contentMode, failed: processingFailed)
                    .transition(.opacity)
            } else {
                RemoteImage(path: m.posterURL, contentMode: contentMode) { VideoShimmer() }
                Button(action: start) {
                    Image(systemName: "play.fill")
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 60, height: 60)
                        .background(.black.opacity(0.45), in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(m.alt?.nilIfEmpty.map { "Video abspielen: \($0)" } ?? "Video abspielen")
                .transition(.opacity)
            }
        } }
        .clipped()
        .onAppear { if autoplay { start() } }
        .task(id: media.id) { await waitUntilReady() }
    }

    private func start() {
        guard player == nil, let url = current.videoURL else { return }
        // Ton auch im Stummmodus, wie bei Videos üblich
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
        let p = AVPlayer(url: url)
        buffering = true
        player = p
        p.play()
    }

    /// Solange das Video noch umgewandelt wird: alle paar Sekunden den Stand abfragen und es zeigen,
    /// sobald es fertig ist (nur für eigene Uploads möglich – bei anderen bleibt der Platzhalter).
    private func waitUntilReady() async {
        guard media.isVideo, media.videoURL == nil else { return }
        var delay: UInt64 = 2
        for _ in 0..<120 {
            try? await Task.sleep(nanoseconds: delay * 1_000_000_000)
            if Task.isCancelled { return }
            let s: APIClient.MediaStatus
            do { s = try await APIClient.shared.mediaStatus(media.id) } catch let e as APIError where [401, 403, 404].contains(e.status) {
                return  // nicht der eigene Upload (oder noch nicht hochgeladen): Platzhalter bleibt
            } catch {
                if delay < 10 { delay += 2 }  // z. B. offline: seltener erneut versuchen
                continue
            }
            switch s.state {
            case "READY" where s.variants?.video != nil:
                withAnimation(.easeOut(duration: 0.3)) { fresh = s.variants }
                if autoplay { start() }
                return
            case "FAILED":
                withAnimation { processingFailed = true }
                return
            default:
                delay = min(delay + 1, 6)
            }
        }
    }
}

/// Platzhalter während der Umwandlung: Vorschaubild (falls schon da) abgedunkelt,
/// darüber eine laufende Schimmer-Animation und ein Ladekreis.
struct VideoProcessingPlaceholder: View {
    var posterPath: String?
    var contentMode: ContentMode = .fill
    var failed = false

    var body: some View {
        ZStack {
            if let posterPath {
                RemoteImage(path: posterPath, contentMode: contentMode) { Color.clear }
                    .blur(radius: 6)
                    .overlay(Color.black.opacity(0.45))
            }
            if !failed { VideoShimmer(base: posterPath == nil ? 0.9 : 0) }
            if failed {
                VStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle.fill").font(.system(size: 20, weight: .semibold))
                    Text("Video konnte nicht verarbeitet werden").font(.wr(.footnote, .semibold)).multilineTextAlignment(.center)
                }
                .foregroundStyle(.white)
                .padding(14)
            } else {
                VideoLoadingBadge(text: "Video wird verarbeitet …")
            }
        }
        .clipped()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(failed ? "Video konnte nicht verarbeitet werden" : "Video wird verarbeitet")
    }
}

/// Ladekreis mit optionalem Text auf dunklem Grund
struct VideoLoadingBadge: View {
    var text: String?
    var body: some View {
        VStack(spacing: 10) {
            ProgressView().controlSize(.large).tint(.white)
            if let text { Text(text).font(.wr(.footnote, .semibold)).foregroundStyle(.white) }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
        .background(.black.opacity(0.4), in: .rect(cornerRadius: 16, style: .continuous))
    }
}

/// Dunkle Fläche mit diagonal laufendem Lichtstreifen (Ladeanimation)
struct VideoShimmer: View {
    var base: Double = 0.9
    @State private var phase: CGFloat = -1
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            ZStack {
                Color(white: 0.12).opacity(base)
                if !reduceMotion {
                    LinearGradient(colors: [.clear, .white.opacity(0.14), .clear], startPoint: .leading, endPoint: .trailing)
                        .frame(width: max(w * 0.6, 80))
                        .rotationEffect(.degrees(18))
                        .offset(x: phase * (w + max(w * 0.6, 80)))
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
            .clipped()
        }
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.linear(duration: 1.4).repeatForever(autoreverses: false)) { phase = 1 }
        }
    }
}

extension APIClient {
    struct MediaStatus: Decodable { let state: String; let variants: MediaVariants? }
    /// Verarbeitungsstand eines eigenen Uploads (`GET /api/v1/media/:id/status`)
    func mediaStatus(_ id: String) async throws -> MediaStatus {
        try await send("GET", "/media/\(id)/status", body: Optional<Int>.none, root: "/api/v1")
    }
}
