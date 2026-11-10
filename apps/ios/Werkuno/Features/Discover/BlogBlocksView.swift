import SwiftUI
import AVKit

// MARK: - Nativer Block-Renderer für Artikel (articleBlockSchema)

struct BlogBlocksView: View {
    var blocks: [BlogBlock]
    var linkedProjects: [BlogLinkedProject] = []
    /// Fallback, wenn ein Artikel (z. B. aus Seed-Daten) nur Klartext hat
    var plainText: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            if blocks.isEmpty, let plain = plainText?.nilIfEmpty {
                ForEach(Array(plain.components(separatedBy: "\n\n").enumerated()), id: \.offset) { _, para in
                    if let p = para.trimmed.nilIfEmpty { BlogInlineText(text: p).blogBodyStyle() }
                }
            }
            ForEach(blocks) { b in
                BlogBlockView(block: b, linkedProjects: linkedProjects)
                    .id(b.id)
            }
        }
        .modifier(BlogLinkHandler())
    }
}

/// Fliesstext-Stil (Serif, grosszügiger Zeilenabstand)
extension View {
    func blogBodyStyle() -> some View {
        font(.wr(size: 18, weight: .regular))
            .lineSpacing(5)
            .foregroundStyle(Color.ink)
            .tint(Color.moss)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Interne Links (`/u/...`, `/anleitungen/...`) öffnen native Ziele, externe Links Safari.
struct BlogLinkHandler: ViewModifier {
    @Environment(Router.self) private var router
    func body(content: Content) -> some View {
        content.environment(\.openURL, OpenURLAction { url in
            let internalHost = url.host == nil || AppConfig.isOwnHost(url.host)
            if internalHost {
                var path = url.path
                if let q = url.query { path += "?" + q }
                if let r = Route.from(href: path) { router.open(r); return .handled }
            }
            if url.scheme == "http" || url.scheme == "https" {
                router.present(.web(url: url))
                return .handled
            }
            return .systemAction
        })
    }
}

/// Inline-Auszeichnung: **fett**, *kursiv*, [Link](url)
struct BlogInlineText: View {
    var text: String
    var body: some View {
        Text(Self.attributed(text))
    }

    static func attributed(_ s: String) -> AttributedString {
        let opts = AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace, failurePolicy: .returnPartiallyParsedIfPossible)
        var a = (try? AttributedString(markdown: s, options: opts, baseURL: AppConfig.baseURL)) ?? AttributedString(s)
        for run in a.runs where run.link != nil {
            a[run.range].foregroundColor = .moss
            a[run.range].underlineStyle = .single
        }
        return a
    }
}

struct BlogBlockView: View {
    var block: BlogBlock
    var linkedProjects: [BlogLinkedProject] = []
    @Environment(Router.self) private var router
    @Environment(AppState.self) private var app

    var body: some View {
        switch block.type {
        case "heading":
            if block.level == 3 {
                Text(block.text ?? "")
                    .font(.wr(.title3, .semibold))
                    .foregroundStyle(Color.ink)
                    .padding(.top, 4)
                    .accessibilityAddTraits(.isHeader)
            } else {
                Text(block.text ?? "")
                    .font(.display(25))
                    .foregroundStyle(Color.ink)
                    .padding(.top, 10)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
            }
        case "paragraph":
            BlogInlineText(text: block.text ?? "").blogBodyStyle()
                .textSelection(.enabled)
        case "list":
            VStack(alignment: .leading, spacing: 8) {
                ForEach(Array((block.items ?? []).enumerated()), id: \.offset) { i, item in
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Text(block.ordered == true ? "\(i + 1)." : "•")
                            .font(.wr(size: 17, weight: .semibold))
                            .foregroundStyle(Color.moss)
                            .frame(minWidth: 18, alignment: .trailing)
                        BlogInlineText(text: item).blogBodyStyle()
                    }
                }
            }
        case "quote":
            VStack(alignment: .leading, spacing: 8) {
                Text(block.text ?? "")
                    .font(.wr(size: 22, weight: .regular).italic())
                    .foregroundStyle(Color.ink)
                    .lineSpacing(4)
                    .fixedSize(horizontal: false, vertical: true)
                if let c = block.cite?.nilIfEmpty {
                    Text("— \(c)").font(.wr(.subheadline)).foregroundStyle(Color.muted)
                }
            }
            .padding(.leading, 16)
            .padding(.vertical, 4)
            .overlay(alignment: .leading) { Capsule().fill(Color.clay).frame(width: 3) }
            .accessibilityElement(children: .combine)
        case "image":
            BlogFigure(url: block.url, seed: block.mediaId ?? block.id, alt: block.alt, caption: block.caption)
        case "gallery":
            BlogGallery(images: block.images ?? [])
        case "video":
            VStack(alignment: .leading, spacing: 6) {
                if let url = AppConfig.resolve(block.url) {
                    BlogVideo(url: url)
                } else {
                    NoticeView(tone: .info, message: "Das Video wird noch verarbeitet.")
                }
                if let c = block.caption?.nilIfEmpty { Text(c).font(.wr(.footnote)).foregroundStyle(Color.muted) }
            }
        case "table":
            BlogTable(rows: block.rows ?? [])
        case "callout":
            let tone: NoticeView.Tone = switch block.tone { case "tip": .success; case "warning": .warn; default: .info }
            NoticeView(tone: tone, title: L.calloutTones.first { $0.key == block.tone }?.label, message: block.text ?? "")
        case "projectCard":
            let lp = linkedProjects.first { $0.id == block.projectId }
            embed(kicker: "Projekt" + (lp?.status.map { " · \(L.projectStatus($0))" } ?? ""), title: block.title ?? lp?.title ?? "Projekt", seed: block.projectId ?? block.id, category: lp?.category, url: lp?.coverUrl) {
                if let href = lp?.href { router.open(href: href) } else { router.open(.search(query: block.title ?? "")) }
            }
        case "tutorialCard":
            embed(kicker: "Anleitung", title: block.title ?? "Anleitung", seed: block.tutorialId ?? block.id, category: nil, url: nil) {
                router.open(.search(query: block.title ?? ""))
            }
        case "productCard":
            embed(kicker: "Produkt im Markt", title: block.title ?? "Produkt", seed: block.productId ?? block.id, category: nil, url: nil) {
                router.open(.search(query: block.title ?? ""))
            }
        case "divider":
            HStack(spacing: 10) {
                Spacer()
                ForEach(0..<3) { _ in Circle().fill(Color.lineStrong).frame(width: 4, height: 4) }
                Spacer()
            }
            .padding(.vertical, 8)
            .accessibilityHidden(true)
        default:
            EmptyView()
        }
    }

    private func embed(kicker: String, title: String, seed: String, category: String?, url: String?, action: @escaping () -> Void) -> some View {
        LinkedThreadRow(kicker: kicker, title: title, seed: seed, category: category, url: url, action: action)
            .padding(12)
            .cardSurface(radius: Radius.inner)
    }
}

// MARK: Bild mit Bildunterschrift

struct BlogFigure: View {
    var url: String?
    var seed: String
    var alt: String?
    var caption: String?
    @State private var fullscreen = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            RemoteImage(path: url, contentMode: .fit) {
                ThreadPlate(seed: seed, category: nil, showLabel: false).frame(height: 220)
            }
            .frame(maxWidth: .infinity)
            .clipShape(.rect(cornerRadius: Radius.inner, style: .continuous))
            .contentShape(.rect)
            .onTapGesture { if url != nil { fullscreen = true } }
            .accessibilityLabel(alt?.nilIfEmpty ?? caption?.nilIfEmpty ?? "Bild")
            .accessibilityAddTraits(.isImage)
            if let c = caption?.nilIfEmpty {
                Text(c).font(.wr(.footnote)).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
            }
        }
        .fullScreenCover(isPresented: $fullscreen) {
            MediaViewer(media: [MediaItem(id: seed, alt: alt, url: url)], start: MediaItem(id: seed, alt: alt, url: url))
        }
    }
}

struct BlogGallery: View {
    var images: [BlogMedia]
    @State private var selected: MediaItem?

    private var items: [MediaItem] { images.map { MediaItem(id: $0.mediaId, alt: $0.alt, url: $0.url) } }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            LazyHStack(alignment: .top, spacing: 10) {
                ForEach(images) { img in
                    VStack(alignment: .leading, spacing: 6) {
                        RemoteImage(path: img.url) { ThreadPlate(seed: img.mediaId, category: nil, showLabel: false) }
                            .frame(height: 240)
                            .clipShape(.rect(cornerRadius: Radius.inner, style: .continuous))
                            .contentShape(.rect)
                            .onTapGesture { selected = items.first { $0.id == img.mediaId } }
                            .accessibilityLabel(img.alt?.nilIfEmpty ?? "Bild")
                            .accessibilityAddTraits(.isImage)
                        if let c = img.caption?.nilIfEmpty { Text(c).font(.wr(.caption)).foregroundStyle(Color.muted).a11yLineLimit(3) }
                    }
                    .containerRelativeFrame(.horizontal, count: 6, span: 5, spacing: 10)
                }
            }
            .scrollTargetLayout()
        }
        .scrollTargetBehavior(.viewAligned)
        .scrollClipDisabled()
        .fullScreenCover(item: $selected) { m in MediaViewer(media: items, start: m) }
    }
}

struct BlogVideo: View {
    var url: URL
    @State private var player: AVPlayer?

    var body: some View {
        VideoPlayer(player: player)
            .aspectRatio(16 / 9, contentMode: .fit)
            .clipShape(.rect(cornerRadius: Radius.inner, style: .continuous))
            .onAppear { if player == nil { player = AVPlayer(url: url) } }
            .onDisappear { player?.pause() }
            .accessibilityLabel("Video")
    }
}

struct BlogTable: View {
    var rows: [[String]]
    var body: some View {
        let cols = rows.map(\.count).max() ?? 0
        ScrollView(.horizontal, showsIndicators: false) {
            Grid(alignment: .leading, horizontalSpacing: 0, verticalSpacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.offset) { r, row in
                    GridRow {
                        ForEach(0..<cols, id: \.self) { c in
                            Text(BlogInlineText.attributed(row[safe: c] ?? ""))
                                .font(r == 0 ? .wr(.subheadline, .semibold) : .wr(.subheadline))
                                .foregroundStyle(Color.ink)
                                .padding(.horizontal, 12).padding(.vertical, 9)
                                .frame(minWidth: 90, alignment: .leading)
                                .background(r == 0 ? Color.sunken : Color.card)
                                .overlay(alignment: .bottom) { Rectangle().fill(Color.line).frame(height: 0.5) }
                        }
                    }
                }
            }
            .clipShape(.rect(cornerRadius: Radius.small, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Radius.small, style: .continuous).strokeBorder(Color.line, lineWidth: 0.75))
        }
    }
}
