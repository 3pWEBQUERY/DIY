import Foundation

// MARK: - Live-Updates (wie im Web: Server-Sent Events über /api/v1/stream)
//
// Der Server verteilt über Postgres LISTEN/NOTIFY drei Ereignisse an die offenen Streams:
//   message {c}  – neue Nachricht in Unterhaltung c
//   read {c}     – Unterhaltung c wurde gelesen (Lesebestätigung, andere Geräte)
//   counts       – Zähler (Benachrichtigungen, Nachrichten, Warenkorb) haben sich geändert
// Polling bleibt als Rückfall bestehen; der Stream macht es nur sofort.

enum LiveEvent: Equatable, Sendable {
    case message(conversationId: String)
    case read(conversationId: String)
    case counts

    static let notification = Notification.Name("werkuno.live")

    /// Ereignis aus dem Notification-Objekt lesen (für `.onReceive`)
    init?(_ n: Notification) {
        guard let e = n.object as? LiveEvent else { return nil }
        self = e
    }

    var conversationId: String? {
        switch self {
        case .message(let c), .read(let c): c
        case .counts: nil
        }
    }
}

/// Hält genau eine SSE-Verbindung, solange jemand angemeldet und die App aktiv ist.
@MainActor
final class LiveStream {
    static let shared = LiveStream()

    private var task: Task<Void, Never>?
    private(set) var isConnected = false

    func start() {
        guard task == nil, APIClient.shared.isSignedIn else { return }
        task = Task { [weak self] in await self?.run() }
    }

    func stop() {
        task?.cancel()
        task = nil
        isConnected = false
    }

    private func run() async {
        var delay: Double = 1
        while !Task.isCancelled {
            guard let token = APIClient.shared.token else { return }
            var req = URLRequest(url: AppConfig.baseURL.appendingPathComponent("/api/v1/stream"))
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            req.setValue("text/event-stream", forHTTPHeaderField: "Accept")
            req.setValue("WerkunoApp/1.0 (iOS)", forHTTPHeaderField: "User-Agent")
            req.timeoutInterval = 90 // Herzschlag kommt alle 25 s
            do {
                let (bytes, response) = try await URLSession.shared.bytes(for: req)
                let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                if status == 401 { return } // abgemeldet – AppState kümmert sich
                guard status == 200 else { throw URLError(.badServerResponse) }
                isConnected = true
                delay = 1
                // Nach (Wieder-)Verbindung einmal alles auffrischen – verpasste Ereignisse
                post(.counts)
                // Der Server schickt jede Nutzlast als eine einzige `data:`-Zeile (JSON mit Feld `t`).
                // `bytes.lines` liefert keine Leerzeilen, deshalb wird pro data-Zeile ausgewertet;
                // Kommentare (": ping"), `event:` und `retry:` werden übersprungen.
                for try await line in bytes.lines {
                    if Task.isCancelled { break }
                    if line.hasPrefix("data:") {
                        dispatch(data: line.dropFirst(5).trimmingCharacters(in: .whitespaces))
                    }
                }
            } catch is CancellationError {
                break
            } catch {
                // Netz weg, Server-Neustart … → mit Backoff neu verbinden
            }
            isConnected = false
            if Task.isCancelled { break }
            try? await Task.sleep(for: .seconds(delay))
            delay = min(delay * 2, 30)
        }
        isConnected = false
    }

    private func dispatch(data: String) {
        struct Payload: Decodable { var t: String; var c: String? }
        guard let d = data.data(using: .utf8), let p = try? JSONDecoder().decode(Payload.self, from: d) else { return }
        switch p.t {
        case "message": if let c = p.c { post(.message(conversationId: c)) }
        case "read": if let c = p.c { post(.read(conversationId: c)) }
        case "counts": post(.counts)
        default: break
        }
    }

    private func post(_ e: LiveEvent) {
        NotificationCenter.default.post(name: LiveEvent.notification, object: e)
    }
}
