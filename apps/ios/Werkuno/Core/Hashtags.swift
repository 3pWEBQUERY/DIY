import SwiftUI

/// Hashtags (#DIY, #Möbelbau) – gleiche Regeln wie `packages/shared/src/hashtags.ts`:
/// Buchstaben (inkl. Umlaute), Ziffern und `_`, mindestens ein Buchstabe, höchstens 50 Zeichen,
/// nicht mitten in Wörtern, Links oder HTML-Entitäten. Normalform: klein geschrieben (NFKC).
enum Hashtags {
    static let maxLength = 50

    private static let body = "[\\p{L}\\p{M}\\p{N}_]"
    /// Ohne Erfassungsgruppe, auch für kombinierte Muster (Erwähnungen, Links)
    static let pattern = "(?<![\\p{L}\\p{M}\\p{N}_&#/=?.\\-])#\(body){1,\(maxLength)}(?!\(body))"

    /// `#DIY` → `diy`
    static func normalize(_ tag: String) -> String {
        var t = Substring(tag)
        while t.first == "#" { t = t.dropFirst() }
        return String(t).precomposedStringWithCompatibilityMapping.lowercased()
    }

    static func isValid(_ tag: String) -> Bool {
        let t = tag.hasPrefix("#") ? String(tag.dropFirst()) : tag
        guard !t.isEmpty, t.count <= maxLength else { return false }
        guard t.range(of: "^\(body)+$", options: .regularExpression) != nil else { return false }
        return t.unicodeScalars.contains { CharacterSet.letters.contains($0) }
    }

    /// Schlagwort (z. B. Projekt-Tag „Eiche massiv“) als Hashtag: ohne Leer- und Satzzeichen
    static func fromTag(_ tag: String) -> String? {
        let cleaned = tag.replacingOccurrences(of: "[^\\p{L}\\p{M}\\p{N}_]+", with: "", options: .regularExpression)
        let t = String(cleaned.prefix(maxLength))
        return isValid(t) ? t : nil
    }

    /// Pfad der Hashtag-Seite im Web (`/hashtag/möbelbau`, kodiert)
    static func path(_ tag: String) -> String {
        let n = normalize(tag)
        let enc = n.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/?#"))) ?? n
        return "/hashtag/\(enc)"
    }

    /// Gerade getippter Hashtag am Textende (für Vorschläge): „Heute #Mö“ → „Mö“; nil, wenn keiner
    static func trailingQuery(_ text: String) -> String? {
        guard let hash = text.lastIndex(of: "#") else { return nil }
        let after = text[text.index(after: hash)...]
        if after.count > maxLength { return nil }
        if after.contains(where: { !($0.isLetter || $0.isNumber || $0 == "_") }) { return nil }
        if hash > text.startIndex {
            let before = text[text.index(before: hash)]
            if before.isLetter || before.isNumber || "_&#/=?.-".contains(before) { return nil }
        }
        return String(after)
    }
}

/// Text mit tippbaren @Erwähnungen, #Hashtags und Links. Zeilenumbrüche bleiben erhalten.
/// Tippen öffnet Profile bzw. die Hashtag-Seite im aktuellen Tab (`.contentLinks()`).
enum LinkedText {
    private static let regex: NSRegularExpression? = {
        let url = "https?://[^\\s]+?(?=[.,;:!?)\\]]*(?:\\s|$))"
        let mention = "(?<![a-z0-9._@])@[a-z0-9][a-z0-9._]{1,22}[a-z0-9]"
        return try? NSRegularExpression(pattern: "(\(url))|(\(mention))|(\(Hashtags.pattern))", options: [.caseInsensitive])
    }()

    /// `links: false` (in Sheets): nur Text – das Ziel würde hinter dem Sheet geöffnet
    static func attributed(_ text: String, linkColor: Color = .moss, links: Bool = true) -> AttributedString {
        guard links, let regex else { return AttributedString(text) }
        let ns = text as NSString
        var out = AttributedString()
        var last = 0
        for m in regex.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
            let token = ns.substring(with: m.range)
            var link: URL?
            if m.range(at: 1).location != NSNotFound {
                link = URL(string: token)
            } else if m.range(at: 2).location != NSNotFound {
                link = AppConfig.webURL("/u/\(token.dropFirst().lowercased())")
            } else if Hashtags.isValid(token) {
                link = AppConfig.webURL(Hashtags.path(token))
            }
            guard let link else { continue }
            if m.range.location > last { out += AttributedString(ns.substring(with: NSRange(location: last, length: m.range.location - last))) }
            var part = AttributedString(m.range(at: 1).location != NSNotFound ? shortURL(token) : token)
            part.link = link
            part.foregroundColor = linkColor
            if m.range(at: 1).location == NSNotFound { part.inlinePresentationIntent = .stronglyEmphasized }
            out += part
            last = m.range.location + m.range.length
        }
        if last < ns.length { out += AttributedString(ns.substring(from: last)) }
        return out
    }

    private static func shortURL(_ s: String) -> String {
        let bare = s.replacingOccurrences(of: "^https?://", with: "", options: .regularExpression)
        return bare.count > 40 ? String(bare.prefix(40)) + "…" : bare
    }
}

/// Interne Links (`/hashtag/…`, `/u/…`) öffnen native Ziele im aktuellen Tab, externe Links Safari.
struct ContentLinkHandler: ViewModifier {
    @Environment(Router.self) private var router
    func body(content: Content) -> some View {
        content.environment(\.openURL, OpenURLAction { url in
            if url.host == nil || AppConfig.isOwnHost(url.host) {
                var path = url.path(percentEncoded: true)
                if let q = url.query { path += "?" + q }
                if let r = Route.from(href: path) {
                    Haptics.selection()
                    router.open(r)
                    return .handled
                }
            }
            if url.scheme == "http" || url.scheme == "https" {
                router.present(.web(url: url))
                return .handled
            }
            return .systemAction
        })
    }
}

extension EnvironmentValues {
    /// false in Sheets und Vollbild-Ansichten: Hashtags/Erwähnungen dort nicht als Link anbieten
    @Entry var contentLinksEnabled: Bool = true
}

extension View {
    /// Links in `LinkedText` (Hashtags, Erwähnungen, Links) in der App öffnen
    func contentLinks() -> some View { modifier(ContentLinkHandler()) }
}

/// Vorschläge beim Tippen eines Hashtags am Textende (`GET /hashtags/suggest`).
/// Tippen ersetzt das angefangene Wort durch den Hashtag in seiner üblichen Schreibweise.
struct HashtagSuggestionBar: View {
    @Binding var text: String
    @State private var items: [HashtagSummary] = []

    private var query: String? { Hashtags.trailingQuery(text) }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Color.clear.frame(height: 0)
            if query != nil, !items.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(items) { item in chip(item) }
                    }
                    .padding(.vertical, 2)
                }
                .transition(.opacity)
            }
        }
        .task(id: query) { await load() }
    }

    private func chip(_ item: HashtagSummary) -> some View {
        Button {
            Haptics.selection()
            apply(item)
        } label: {
            HStack(spacing: 4) {
                Text("#\(item.display)").font(.wr(.footnote, .semibold)).foregroundStyle(Color.moss)
                Text(Fmt.number(item.count)).font(.wr(.caption2)).foregroundStyle(Color.muted).monospacedDigit()
            }
            .padding(.horizontal, 10).padding(.vertical, 6)
            .background(Color.mossSoft, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Hashtag \(item.display) einfügen")
    }

    private func apply(_ item: HashtagSummary) {
        guard let q = query, let hash = text.lastIndex(of: "#"), text[text.index(after: hash)...] == q else { return }
        text = String(text[..<hash]) + "#\(item.display) "
        items = []
    }

    private func load() async {
        guard let q = query else { items = []; return }
        // Kurz warten: nicht bei jedem Buchstaben eine Anfrage
        try? await Task.sleep(for: .milliseconds(220))
        guard !Task.isCancelled else { return }
        do {
            struct Res: Decodable, Sendable { var items: [HashtagSummary] }
            let r: Res = try await APIClient.shared.get("/hashtags/suggest", query: ["q": q])
            guard !Task.isCancelled else { return }
            // Bereits vollständig getippter einziger Treffer: keine Leiste nötig
            withAnimation(.snappy) { items = r.items.filter { !($0.name == Hashtags.normalize(q) && r.items.count == 1) } }
        } catch {
            items = []
        }
    }
}
