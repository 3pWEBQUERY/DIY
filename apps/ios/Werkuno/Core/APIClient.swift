import Foundation
import Security

// MARK: - Umgebung

enum ServerEnvironment: String, CaseIterable, Identifiable, Codable {
    case production
    case local

    var id: String { rawValue }
    var label: String { self == .production ? "Produktion (werkuno.ch)" : "Lokal (localhost:3000)" }
    var baseURL: URL {
        switch self {
        case .production: URL(string: "https://werkuno.ch")!
        case .local: URL(string: "http://localhost:3000")!
        }
    }
}

enum AppConfig {
    private static let envKey = "werkuno.server"

    static var environment: ServerEnvironment {
        get {
            if let raw = UserDefaults.standard.string(forKey: envKey), let e = ServerEnvironment(rawValue: raw) { return e }
            #if DEBUG
            if let raw = ProcessInfo.processInfo.environment["WERKUNO_SERVER"], let e = ServerEnvironment(rawValue: raw) { return e }
            #endif
            return .production
        }
        set { UserDefaults.standard.set(newValue.rawValue, forKey: envKey) }
    }

    static var baseURL: URL { environment.baseURL }

    /// Relative Medien- und Seitenpfade (`/media/...`, `/u/...`) gegen den Server auflösen.
    static func resolve(_ path: String?) -> URL? {
        guard let path, !path.isEmpty else { return nil }
        if path.hasPrefix("http://") || path.hasPrefix("https://") { return URL(string: path).map(canonical) }
        return URL(string: path, relativeTo: baseURL)?.absoluteURL
    }

    static func webURL(_ path: String) -> URL { resolve(path) ?? baseURL }

    /// Frühere Railway-Adresse: alte Links in Inhalten gelten weiter als eigene Seiten.
    static let legacyHosts: Set<String> = ["web-production-d04e69.up.railway.app", "www.werkuno.ch"]

    /// Gehört der Host zu unserer Plattform (aktuelle Basis-URL oder frühere Adresse)?
    static func isOwnHost(_ host: String?) -> Bool {
        guard let host = host?.lowercased() else { return false }
        return host == baseURL.host?.lowercased() || legacyHosts.contains(host)
    }

    /// Absolute Links auf die alte Adresse auf die aktuelle Basis-URL umschreiben.
    static func canonical(_ url: URL) -> URL {
        guard let host = url.host?.lowercased(), legacyHosts.contains(host),
              var c = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return url }
        c.scheme = baseURL.scheme; c.host = baseURL.host; c.port = baseURL.port
        return c.url ?? url
    }
}

// MARK: - Keychain (Session-Token)

enum Keychain {
    private static let service = "ch.werkuno.app.session"

    static func read(_ account: String) -> String? {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data else { return nil }
        return String(data: d, encoding: .utf8)
    }

    static func write(_ account: String, _ value: String?) {
        let base: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
        SecItemDelete(base as CFDictionary)
        guard let value, let data = value.data(using: .utf8) else { return }
        var add = base
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(add as CFDictionary, nil)
    }
}

// MARK: - Fehler

struct APIError: Error, LocalizedError, Equatable {
    var code: String
    var message: String
    var fields: [String: String]?
    var status: Int

    var errorDescription: String? { message }
    var isAuth: Bool { status == 401 || code == "UNAUTHENTICATED" }

    static let offline = APIError(code: "OFFLINE", message: "Keine Verbindung zu Werkuno. Prüfe dein Netz und versuche es erneut.", fields: nil, status: 0)
    static func decoding(_ detail: String) -> APIError {
        APIError(code: "DECODING", message: "Die Antwort des Servers konnte nicht gelesen werden.\n\(detail)", fields: nil, status: 0)
    }
}

private struct ErrorEnvelope: Decodable {
    struct Body: Decodable { let code: String; let message: String?; let fields: [String: String]? }
    let error: Body
}

private struct DataEnvelope<T: Decodable>: Decodable { let data: T }

/// Leere Antwort `{ data: { ok: true } }` o. ä.
struct OK: Decodable { var ok: Bool?; var message: String? }

// MARK: - JSON

enum JSON {
    static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .custom { dec in
            let c = try dec.singleValueContainer()
            let s = try c.decode(String.self)
            if let date = parseDate(s) { return date }
            throw DecodingError.dataCorruptedError(in: c, debugDescription: "Ungültiges Datum \(s)")
        }
        return d
    }()

    static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .custom { date, enc in
            var c = enc.singleValueContainer()
            try c.encode(isoFormatter.string(from: date))
        }
        return e
    }()

    nonisolated(unsafe) static let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    nonisolated(unsafe) private static let isoPlain: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    private static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "Europe/Zurich")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static func parseDate(_ s: String) -> Date? {
        isoFormatter.date(from: s) ?? isoPlain.date(from: s) ?? dayFormatter.date(from: s)
    }
}

// MARK: - Client

/// HTTP-Client für die Werkuno-API. Bearer-Token aus dem Keychain, **keine Cookies**
/// (ein Cookie hätte serverseitig Vorrang vor dem Token).
final class APIClient: @unchecked Sendable {
    static let shared = APIClient()

    private let session: URLSession
    private let tokenKey = "token"
    private var cachedToken: String?
    private let lock = NSLock()

    /// Wird bei 401 aufgerufen (Session abgelaufen/widerrufen).
    var onUnauthorized: (@Sendable () -> Void)?

    init() {
        let cfg = URLSessionConfiguration.default
        cfg.httpCookieStorage = nil
        cfg.httpShouldSetCookies = false
        cfg.httpCookieAcceptPolicy = .never
        cfg.timeoutIntervalForRequest = 30
        cfg.requestCachePolicy = .reloadIgnoringLocalCacheData
        cfg.httpAdditionalHeaders = ["Accept": "application/json", "Accept-Language": "de-CH", "User-Agent": "WerkunoApp/1.0 (iOS)"]
        session = URLSession(configuration: cfg)
    }

    var token: String? {
        get {
            lock.lock(); defer { lock.unlock() }
            #if DEBUG
            // Nur Entwicklung/Tests: Token per `simctl spawn booted defaults write ch.werkuno.app werkuno.debugToken <token>` setzen
            if let t = UserDefaults.standard.string(forKey: "werkuno.debugToken"), !t.isEmpty {
                UserDefaults.standard.removeObject(forKey: "werkuno.debugToken")
                Keychain.write(tokenKey, t)
                cachedToken = t
            }
            #endif
            if cachedToken == nil { cachedToken = Keychain.read(tokenKey) }
            return cachedToken
        }
        set {
            lock.lock(); cachedToken = newValue; lock.unlock()
            Keychain.write(tokenKey, newValue)
        }
    }

    var isSignedIn: Bool { token != nil }

    // MARK: Anfragen

    /// Mobile-API: Pfade relativ zu `/api/v1/app`.
    func get<T: Decodable>(_ path: String, query: [String: String?] = [:], as: T.Type = T.self) async throws -> T {
        try await send("GET", path, query: query, body: Optional<Int>.none)
    }

    func post<T: Decodable>(_ path: String, _ body: some Encodable = [String: String](), as: T.Type = T.self) async throws -> T {
        try await send("POST", path, body: body)
    }

    func put<T: Decodable>(_ path: String, _ body: some Encodable, as: T.Type = T.self) async throws -> T {
        try await send("PUT", path, body: body)
    }

    func patch<T: Decodable>(_ path: String, _ body: some Encodable, as: T.Type = T.self) async throws -> T {
        try await send("PATCH", path, body: body)
    }

    func delete<T: Decodable>(_ path: String, as: T.Type = T.self) async throws -> T {
        try await send("DELETE", path, body: Optional<Int>.none)
    }

    /// Fire-and-forget-Variante (Antwort egal).
    @discardableResult
    func action(_ method: String, _ path: String, _ body: [String: JSONValue] = [:]) async throws -> JSONValue {
        try await send(method, path, body: method == "GET" || method == "DELETE" ? nil : body)
    }

    func send<T: Decodable, B: Encodable>(_ method: String, _ path: String, query: [String: String?] = [:], body: B?, root: String = "/api/v1/app") async throws -> T {
        var comps = URLComponents(url: AppConfig.baseURL.appendingPathComponent(root + path), resolvingAgainstBaseURL: false)!
        let items = query.compactMap { k, v in v.flatMap { $0.isEmpty ? nil : URLQueryItem(name: k, value: $0) } }
        if !items.isEmpty { comps.queryItems = items.sorted { $0.name < $1.name } }
        var req = URLRequest(url: comps.url!)
        req.httpMethod = method
        if let body {
            req.httpBody = try JSON.encoder.encode(body)
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return try await perform(req)
    }

    func perform<T: Decodable>(_ request: URLRequest) async throws -> T {
        var req = request
        if let token { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            if (error as? URLError)?.code == .cancelled { throw CancellationError() }
            throw APIError.offline
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if status >= 400 || status == 0 {
            if let env = try? JSON.decoder.decode(ErrorEnvelope.self, from: data) {
                let err = APIError(code: env.error.code, message: env.error.message ?? "Fehler", fields: env.error.fields, status: status)
                if err.isAuth { onUnauthorized?() }
                throw err
            }
            if status == 401 { onUnauthorized?() }
            throw APIError(code: "HTTP_\(status)", message: "Der Server hat mit Fehler \(status) geantwortet.", fields: nil, status: status)
        }
        do {
            return try JSON.decoder.decode(DataEnvelope<T>.self, from: data).data
        } catch let e as DecodingError {
            #if DEBUG
            print("⚠️ Decoding \(T.self) @ \(req.url?.path ?? ""): \(e)")
            #endif
            throw APIError.decoding(Self.describe(e))
        }
    }

    static func describe(_ e: DecodingError) -> String {
        switch e {
        case .keyNotFound(let k, let c): "Feld fehlt: \(k.stringValue) (\(c.codingPath.map(\.stringValue).joined(separator: ".")))"
        case .typeMismatch(_, let c): "Typfehler bei \(c.codingPath.map(\.stringValue).joined(separator: "."))"
        case .valueNotFound(_, let c): "Wert fehlt bei \(c.codingPath.map(\.stringValue).joined(separator: "."))"
        case .dataCorrupted(let c): "Ungültige Daten bei \(c.codingPath.map(\.stringValue).joined(separator: "."))"
        @unknown default: "Unbekannter Fehler"
        }
    }

    // MARK: Bestehende /api/v1-Endpunkte (Token-Login, Medien, Export)

    struct LoginResult: Decodable { let token: String; let userId: String }

    func login(email: String, password: String) async throws -> LoginResult {
        try await send("POST", "/auth/session", body: ["email": email, "password": password], root: "/api/v1")
    }

    func logout() async {
        _ = try? await send("DELETE", "/auth/session", body: Optional<Int>.none, root: "/api/v1") as JSONValue
    }

    func exportData() async throws -> Data {
        var req = URLRequest(url: AppConfig.baseURL.appendingPathComponent("/api/v1/me/export"))
        if let token { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        let (data, resp) = try await session.data(for: req)
        guard (resp as? HTTPURLResponse)?.statusCode == 200 else { throw APIError(code: "EXPORT", message: "Export fehlgeschlagen.", fields: nil, status: 0) }
        return data
    }

    // MARK: Medien-Pipeline (§25.6): anfordern → hochladen → abschliessen

    struct UploadTicket: Decodable { let mediaId: String; let uploadUrl: String; let fallbackUrl: String }
    struct UploadResult: Decodable { let state: String; let variants: MediaVariants?; let width: Int?; let height: Int? }

    func upload(data: Data, mime: String, purpose: String = "public") async throws -> (id: String, result: UploadResult) {
        let ticket: UploadTicket = try await send("POST", "/media", body: ["mime": JSONValue.string(mime), "bytes": .number(Double(data.count)), "purpose": .string(purpose)], root: "/api/v1")
        guard let target = AppConfig.resolve(ticket.uploadUrl) else { throw APIError.offline }
        var put = URLRequest(url: target)
        put.httpMethod = "PUT"
        put.setValue(mime, forHTTPHeaderField: "Content-Type")
        // Presigned-URLs (S3) ohne Authorization senden; eigener Server erhält das Token
        let sameHost = AppConfig.isOwnHost(target.host)
        if sameHost, let token { put.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        var ok = false
        if let (_, r) = try? await session.upload(for: put, from: data), let code = (r as? HTTPURLResponse)?.statusCode, code < 300 { ok = true }
        if !ok, let fb = AppConfig.resolve(ticket.fallbackUrl) {
            var req = URLRequest(url: fb)
            req.httpMethod = "PUT"
            req.setValue(mime, forHTTPHeaderField: "Content-Type")
            if let token { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
            let (_, r) = try await session.upload(for: req, from: data)
            guard let code = (r as? HTTPURLResponse)?.statusCode, code < 300 else {
                throw APIError(code: "UPLOAD", message: "Der Upload ist fehlgeschlagen. Bitte versuche es erneut.", fields: nil, status: 0)
            }
        }
        let result: UploadResult = try await send("POST", "/media/\(ticket.mediaId)/complete", body: [String: String](), root: "/api/v1")
        return (ticket.mediaId, result)
    }
}

// MARK: - JSONValue (für flexible Bodies & unbekannte Felder)

enum JSONValue: Codable, Hashable, Sendable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let b = try? c.decode(Bool.self) { self = .bool(b) }
        else if let n = try? c.decode(Double.self) { self = .number(n) }
        else if let s = try? c.decode(String.self) { self = .string(s) }
        else if let a = try? c.decode([JSONValue].self) { self = .array(a) }
        else { self = .object(try c.decode([String: JSONValue].self)) }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let b): try c.encode(b)
        case .number(let n): try c.encode(n)
        case .string(let s): try c.encode(s)
        case .array(let a): try c.encode(a)
        case .object(let o): try c.encode(o)
        }
    }

    subscript(key: String) -> JSONValue? { if case .object(let o) = self { o[key] } else { nil } }
    var string: String? { if case .string(let s) = self { s } else { nil } }
    var number: Double? { if case .number(let n) = self { n } else { nil } }
    var int: Int? { number.map { Int($0) } }
    var bool: Bool? { if case .bool(let b) = self { b } else { nil } }
    var array: [JSONValue]? { if case .array(let a) = self { a } else { nil } }
    var object: [String: JSONValue]? { if case .object(let o) = self { o } else { nil } }
    var isNull: Bool { if case .null = self { true } else { false } }
}

extension JSONValue: ExpressibleByStringLiteral, ExpressibleByBooleanLiteral, ExpressibleByIntegerLiteral, ExpressibleByNilLiteral, ExpressibleByArrayLiteral, ExpressibleByDictionaryLiteral, ExpressibleByFloatLiteral {
    init(stringLiteral v: String) { self = .string(v) }
    init(booleanLiteral v: Bool) { self = .bool(v) }
    init(integerLiteral v: Int) { self = .number(Double(v)) }
    init(floatLiteral v: Double) { self = .number(v) }
    init(nilLiteral: ()) { self = .null }
    init(arrayLiteral elements: JSONValue...) { self = .array(elements) }
    init(dictionaryLiteral elements: (String, JSONValue)...) { self = .object(Dictionary(uniqueKeysWithValues: elements)) }

    static func from(_ s: String?) -> JSONValue { s.map { .string($0) } ?? .null }
    static func from(_ i: Int?) -> JSONValue { i.map { .number(Double($0)) } ?? .null }
    static func from(_ b: Bool?) -> JSONValue { b.map { .bool($0) } ?? .null }
    static func from(_ a: [String]) -> JSONValue { .array(a.map { .string($0) }) }
}

/// Encodable → JSONValue (für Bodies aus Modellen)
extension Encodable {
    var jsonValue: JSONValue {
        (try? JSON.decoder.decode(JSONValue.self, from: JSON.encoder.encode(self))) ?? .null
    }
}
