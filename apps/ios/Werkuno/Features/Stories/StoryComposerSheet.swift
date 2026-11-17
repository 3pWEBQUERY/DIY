import SwiftUI
import PhotosUI
import AVFoundation
import UniformTypeIdentifiers

/// Neue Story: Foto oder Video (mit optionaler Bildunterschrift) oder ein Satz auf einer Farbfläche.
/// Oben die Vorschau im Story-Format (9:16), darunter die Angaben.
struct StoryComposerSheet: View {
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss

    private enum Mode: String, CaseIterable, Identifiable { case media, text; var id: String { rawValue } }
    private enum Upload: Equatable {
        case idle
        case uploading(image: UIImage?, video: Bool)
        case ready(id: String, image: UIImage?, video: Bool, processing: Bool)
        case failed(String)
    }

    @State private var mode: Mode = .media
    @State private var pick: PhotosPickerItem?
    @State private var upload: Upload = .idle
    @State private var caption = ""
    @State private var alt = ""
    @State private var text = ""
    @State private var background: StoryBackground = .coral
    @State private var audience: StoryAudience = .public
    @State private var projectId: String = ""
    @State private var projects: [IdTitle] = []
    @State private var posting = false
    @FocusState private var textFocused: Bool

    private var ready: Bool {
        switch mode {
        case .media: if case .ready = upload { true } else { false }
        case .text: !text.trimmed.isEmpty
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    Picker("Art der Story", selection: $mode) {
                        Label("Foto/Video", systemImage: "photo").tag(Mode.media)
                        Label("Text", systemImage: "textformat").tag(Mode.text)
                    }
                    .pickerStyle(.segmented)

                    preview
                        .frame(width: 230)
                        .frame(maxWidth: .infinity)

                    if mode == .media { mediaFields } else { textFields }
                    commonFields
                }
                .padding(.horizontal, Space.gutter)
                .padding(.vertical, 16)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Color.paper)
            .navigationTitle("Neue Story")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() }.disabled(posting) }
                ToolbarItem(placement: .confirmationAction) {
                    Button { Task { await post() } } label: {
                        if posting { ProgressView() } else { Text("Teilen").fontWeight(.semibold) }
                    }
                    .disabled(!ready || posting)
                }
            }
            .onChange(of: pick) { _, item in
                guard let item else { return }
                pick = nil
                Task { await ingest(item) }
            }
            .onChange(of: mode) { _, m in textFocused = m == .text }
            .task { await loadProjects() }
        }
        .interactiveDismissDisabled(posting || isUploading)
    }

    private var isUploading: Bool { if case .uploading = upload { true } else { false } }

    // MARK: Vorschau

    @ViewBuilder private var preview: some View {
        GeometryReader { geo in
            ZStack {
                if mode == .text {
                    background.background
                    TextField("", text: $text, prompt: Text("Dein Text").foregroundStyle(background.foreground.opacity(0.55)), axis: .vertical)
                        .focused($textFocused)
                        .font(.wr(size: max(14, geo.size.width * StoryFmt.textScale(text.isEmpty ? "Dein Text" : text)), weight: .bold))
                        .multilineTextAlignment(.center)
                        .foregroundStyle(background.foreground)
                        .tint(background.foreground)
                        .padding(.horizontal, geo.size.width * 0.09)
                        .onChange(of: text) { _, t in if t.count > StoryRules.textMax { text = String(t.prefix(StoryRules.textMax)) } }
                        .accessibilityLabel("Text der Story")
                } else {
                    Color.sunken
                    switch upload {
                    case .idle, .failed:
                        PhotosPicker(selection: $pick, matching: .any(of: [.images, .videos])) {
                            VStack(spacing: 10) {
                                Image(systemName: "photo.badge.plus")
                                    .font(.system(size: 22, weight: .semibold))
                                    .foregroundStyle(Color.moss)
                                    .frame(width: 52, height: 52)
                                    .background(Color.card, in: Circle())
                                    .overlay(Circle().strokeBorder(Color.line))
                                Text("Foto oder Video wählen").font(.wr(.subheadline, .semibold)).foregroundStyle(Color.ink)
                                Text("Hochformat wirkt am besten. Videos bis \(Int(StoryRules.videoMaxSeconds)) Sekunden.")
                                    .font(.wr(.caption))
                                    .foregroundStyle(Color.muted)
                                    .multilineTextAlignment(.center)
                                    .padding(.horizontal, 18)
                            }
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                            .contentShape(.rect)
                        }
                        .buttonStyle(.plain)
                    case .uploading(let img, _), .ready(_, let img, _, _):
                        if let img {
                            Image(uiImage: img).resizable().aspectRatio(contentMode: .fill)
                                .frame(width: geo.size.width, height: geo.size.height)
                                .clipped()
                        }
                        if let c = caption.nilIfEmpty {
                            VStack {
                                Spacer()
                                Text(c)
                                    .font(.wr(.caption))
                                    .foregroundStyle(.white)
                                    .multilineTextAlignment(.center)
                                    .padding(.horizontal, 10).padding(.vertical, 7)
                                    .background(.black.opacity(0.55), in: .rect(cornerRadius: 10, style: .continuous))
                                    .padding(10)
                            }
                        }
                        if isUploading {
                            Color.black.opacity(0.35)
                            ProgressView().tint(.white).controlSize(.large)
                        }
                    }
                }
            }
            .clipShape(.rect(cornerRadius: Radius.card, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Radius.card, style: .continuous).strokeBorder(Color.line, lineWidth: 0.75))
        }
        .aspectRatio(9.0 / 16.0, contentMode: .fit)
    }

    // MARK: Angaben

    @ViewBuilder private var mediaFields: some View {
        VStack(alignment: .leading, spacing: 14) {
            if case .failed(let msg) = upload {
                NoticeView(tone: .danger, message: msg)
            }
            if case .ready(_, _, true, true) = upload {
                NoticeView(tone: .info, message: "Das Video wird im Hintergrund aufbereitet. Du kannst die Story schon teilen – sie erscheint, sobald es fertig ist.")
            }
            if case .ready = upload {
                PhotosPicker(selection: $pick, matching: .any(of: [.images, .videos])) {
                    Label("Andere Datei wählen", systemImage: "arrow.triangle.2.circlepath")
                        .font(.wr(.subheadline, .semibold))
                        .foregroundStyle(Color.moss)
                }
            }
            field("Bildunterschrift", count: "\(caption.count)/\(StoryRules.captionMax)") {
                TextField("Optional – ein Satz zum Bild", text: $caption, axis: .vertical)
                    .lineLimit(1...3)
                    .onChange(of: caption) { _, t in if t.count > StoryRules.captionMax { caption = String(t.prefix(StoryRules.captionMax)) } }
            }
            if case .ready(_, _, false, _) = upload {
                field("Bildbeschreibung", count: nil) {
                    TextField("Was ist zu sehen? (für VoiceOver)", text: $alt, axis: .vertical).lineLimit(1...3)
                }
            }
        }
    }

    private var textFields: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Hintergrund").font(.wr(.subheadline, .semibold))
                Spacer()
                Text("\(text.count)/\(StoryRules.textMax)").font(.wr(.caption)).monospacedDigit().foregroundStyle(Color.muted)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(StoryBackground.allCases) { b in
                        Button { Haptics.selection(); background = b } label: {
                            Circle().fill(b.background)
                                .frame(width: 30, height: 30)
                                .overlay(Circle().strokeBorder(.black.opacity(0.08)))
                                .padding(4)
                                .overlay(Circle().strokeBorder(background == b ? Color.ink : .clear, lineWidth: 2))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(b.label)
                        .accessibilityAddTraits(background == b ? .isSelected : [])
                    }
                }
                .padding(.vertical, 2)
            }
        }
    }

    private var commonFields: some View {
        VStack(spacing: 0) {
            HStack {
                Label("Wer sieht die Story?", systemImage: audience.symbol).font(.wr(.subheadline))
                Spacer()
                Picker("Wer sieht die Story?", selection: $audience) {
                    ForEach(StoryAudience.allCases) { Text($0.label).tag($0) }
                }
                .pickerStyle(.menu)
                .tint(Color.moss)
            }
            .padding(.horizontal, 14).frame(minHeight: 50)
            if !projects.isEmpty {
                Divider().padding(.leading, 14)
                HStack {
                    Label("Projektfaden", systemImage: "point.3.connected.trianglepath.dotted").font(.wr(.subheadline))
                    Spacer()
                    Picker("Projektfaden", selection: $projectId) {
                        Text("Kein Projekt").tag("")
                        ForEach(projects) { Text($0.title).tag($0.id) }
                    }
                    .pickerStyle(.menu)
                    .tint(Color.moss)
                }
                .padding(.horizontal, 14).frame(minHeight: 50)
            }
        }
        .cardSurface(radius: Radius.inner)
    }

    private func field<C: View>(_ label: String, count: String?, @ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(label).font(.wr(.subheadline, .semibold))
                Spacer()
                if let count { Text(count).font(.wr(.caption)).monospacedDigit().foregroundStyle(Color.muted) }
            }
            content()
                .font(.wr(.body))
                .padding(.horizontal, 14).padding(.vertical, 11)
                .cardSurface(radius: Radius.inner)
        }
    }

    // MARK: Laden & Teilen

    private func loadProjects() async {
        if let c: SocialFeedContext = try? await APIClient.shared.get("/feed/context") { projects = c.projectOptions ?? [] }
    }

    private func ingest(_ item: PhotosPickerItem) async {
        if item.supportedContentTypes.contains(where: { $0.conforms(to: .movie) }) {
            guard let movie = try? await item.loadTransferable(type: PickedMovie.self) else {
                upload = .failed("Das Video konnte nicht gelesen werden.")
                return
            }
            let asset = AVURLAsset(url: movie.url)
            if let d = try? await asset.load(.duration), d.seconds.isFinite, d.seconds > StoryRules.videoMaxSeconds + 1 {
                upload = .failed("Das Video ist \(Int(d.seconds)) Sekunden lang. Story-Videos dürfen höchstens \(Int(StoryRules.videoMaxSeconds)) Sekunden lang sein – längere Videos teilst du als Beitrag.")
                return
            }
            let thumb = await Self.thumbnail(asset)
            upload = .uploading(image: thumb, video: true)
            do {
                let id = try await MediaUpload.uploadVideo(movie.url)
                upload = .ready(id: id, image: thumb, video: true, processing: true)
            } catch {
                upload = .failed((error as? APIError)?.message ?? "Der Upload ist fehlgeschlagen. Bitte versuche es erneut.")
            }
            return
        }
        guard let data = try? await item.loadTransferable(type: Data.self), let img = UIImage(data: data) else {
            upload = .failed("Das Bild konnte nicht gelesen werden.")
            return
        }
        upload = .uploading(image: img, video: false)
        do {
            let (id, r) = try await MediaUpload.upload(img)
            upload = .ready(id: id, image: img, video: false, processing: r.state != "READY")
        } catch {
            upload = .failed((error as? APIError)?.message ?? "Der Upload ist fehlgeschlagen. Bitte versuche es erneut.")
        }
    }

    private static func thumbnail(_ asset: AVURLAsset) async -> UIImage? {
        let gen = AVAssetImageGenerator(asset: asset)
        gen.appliesPreferredTrackTransform = true
        gen.maximumSize = CGSize(width: 900, height: 1600)
        guard let frame = try? await gen.image(at: CMTime(seconds: 0.5, preferredTimescale: 600)) else { return nil }
        return UIImage(cgImage: frame.image)
    }

    private func post() async {
        posting = true
        defer { posting = false }
        let project = projectId.isEmpty ? nil : projectId
        do {
            var processing = false
            switch mode {
            case .media:
                guard case .ready(let id, _, _, let p) = upload else { return }
                processing = p
                _ = try await StoryAPI.createMedia(mediaId: id, alt: alt.trimmed, caption: caption.trimmed, audience: audience, projectId: project)
            case .text:
                _ = try await StoryAPI.createText(text.trimmed, background: background, audience: audience, projectId: project)
            }
            Haptics.success()
            app.show(processing ? "Deine Story erscheint, sobald das Video verarbeitet ist." : "Deine Story ist online – 24 Stunden lang.")
            NotificationCenter.default.post(name: .storiesChanged, object: nil)
            dismiss()
        } catch {
            app.show(error: error)
        }
    }
}
