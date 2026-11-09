import SwiftUI
import UIKit

/// Bilder-Cache (Speicher + URLCache auf Disk). Relative Pfade werden gegen den Server aufgelöst.
final class ImageCache: @unchecked Sendable {
    static let shared = ImageCache()
    private let memory = NSCache<NSURL, UIImage>()
    private let session: URLSession
    private let urlCache: URLCache
    private var inflight: [URL: Task<UIImage?, Never>] = [:]
    private let lock = NSLock()

    init() {
        memory.totalCostLimit = 120 * 1024 * 1024
        let cfg = URLSessionConfiguration.default
        urlCache = URLCache(memoryCapacity: 20 * 1024 * 1024, diskCapacity: 300 * 1024 * 1024)
        cfg.urlCache = urlCache
        cfg.requestCachePolicy = .returnCacheDataElseLoad
        cfg.httpCookieStorage = nil
        session = URLSession(configuration: cfg)
    }

    func cached(_ url: URL) -> UIImage? { memory.object(forKey: url as NSURL) }

    func load(_ url: URL) async -> UIImage? {
        if let img = cached(url) { return img }
        if let t = lock.withLock({ inflight[url] }) { return await t.value }
        let task = Task<UIImage?, Never> { [session] in
            var req = URLRequest(url: url)
            if AppConfig.isOwnHost(url.host), let t = APIClient.shared.token { req.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
            guard let (data, resp) = try? await session.data(for: req), (resp as? HTTPURLResponse)?.statusCode ?? 200 < 400, let img = UIImage(data: data) else { return nil }
            return img.preparingForDisplay() ?? img
        }
        lock.withLock { inflight[url] = task }
        let img = await task.value
        lock.withLock { inflight[url] = nil }
        if let img { memory.setObject(img, forKey: url as NSURL, cost: Int(img.size.width * img.size.height * 4)) }
        return img
    }

    /// Speicher- und Disk-Cache leeren (Abmelden: auch private, mit Token geladene Bilder entfernen)
    func clear() {
        memory.removeAllObjects()
        urlCache.removeAllCachedResponses()
    }
}

/// Entferntes Bild mit sanftem Einblenden; zeigt sonst den Platzhalter.
struct RemoteImage<Placeholder: View>: View {
    let path: String?
    var contentMode: ContentMode = .fill
    @ViewBuilder var placeholder: () -> Placeholder

    @State private var image: UIImage?
    @State private var failed = false

    var body: some View {
        ZStack {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: contentMode)
                    .transition(.opacity)
            } else {
                placeholder()
            }
        }
        .task(id: path) {
            guard let url = AppConfig.resolve(path) else { image = nil; return }
            if let c = ImageCache.shared.cached(url) { image = c; return }
            let img = await ImageCache.shared.load(url)
            withAnimation(.easeOut(duration: 0.25)) { image = img; failed = img == nil }
        }
    }
}

extension RemoteImage where Placeholder == Color {
    init(path: String?, contentMode: ContentMode = .fill) {
        self.init(path: path, contentMode: contentMode) { Color.sunken }
    }
}
