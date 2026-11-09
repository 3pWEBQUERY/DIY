import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

/// Ein ausgewähltes bzw. hochgeladenes Medium im Editor.
struct DraftMedia: Identifiable, Hashable {
    enum State: Hashable { case uploading, ready, failed(String) }
    var id: String = UUID().uuidString
    /// Server-Medien-ID (nach dem Upload)
    var mediaId: String?
    var alt: String = ""
    var image: UIImage?
    var remoteURL: String?
    var isVideo = false
    var state: State = .ready

    var ref: MediaRef? { mediaId.map { MediaRef(id: $0, alt: alt) } }

    static func existing(id: String, url: String?, alt: String?) -> DraftMedia {
        DraftMedia(id: id, mediaId: id, alt: alt ?? "", remoteURL: url, state: .ready)
    }
}

enum MediaUpload {
    /// Bild für den Upload vorbereiten: max. 2560 px, JPEG 0.86 (EXIF wird serverseitig entfernt)
    static func jpeg(from image: UIImage, maxSide: CGFloat = 2560) -> Data? {
        let s = image.size
        let scale = min(1, maxSide / max(s.width, s.height))
        let target = CGSize(width: s.width * scale, height: s.height * scale)
        let fmt = UIGraphicsImageRendererFormat.default()
        fmt.scale = 1
        let img = UIGraphicsImageRenderer(size: target, format: fmt).image { _ in image.draw(in: CGRect(origin: .zero, size: target)) }
        return img.jpegData(compressionQuality: 0.86)
    }

    static func upload(_ image: UIImage) async throws -> (String, APIClient.UploadResult) {
        guard let data = jpeg(from: image) else { throw APIError(code: "IMAGE", message: "Das Bild konnte nicht gelesen werden.", fields: nil, status: 0) }
        let r = try await APIClient.shared.upload(data: data, mime: "image/jpeg")
        return (r.id, r.result)
    }

    static func uploadVideo(_ url: URL) async throws -> String {
        let data = try Data(contentsOf: url)
        let mime = url.pathExtension.lowercased() == "mov" ? "video/quicktime" : "video/mp4"
        return try await APIClient.shared.upload(data: data, mime: mime).id
    }
}

struct PickedMovie: Transferable {
    let url: URL
    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(contentType: .movie) { SentTransferredFile($0.url) } importing: { received in
            let dst = FileManager.default.temporaryDirectory.appendingPathComponent("werkuno-video-" + UUID().uuidString + "." + (received.file.pathExtension.isEmpty ? "mov" : received.file.pathExtension))
            try FileManager.default.copyItem(at: received.file, to: dst)
            return PickedMovie(url: dst)
        }
    }
}

/// Medienauswahl mit Upload, Reihenfolge, Alt-Text (Barrierefreiheit) und Entfernen.
struct MediaPickerField: View {
    @Binding var items: [DraftMedia]
    var maxCount: Int = 10
    var allowVideo = false
    var title = "Bilder"
    var coverHint = false

    @State private var picks: [PhotosPickerItem] = []
    @State private var altEditing: DraftMedia?
    @Environment(AppState.self) private var app

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(title).font(.wr(.subheadline, .semibold))
                Spacer()
                Text("\(items.count)/\(maxCount)").font(.wr(.caption)).monospacedDigit().foregroundStyle(Color.muted)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(Array(items.enumerated()), id: \.element.id) { idx, m in
                        tile(m, index: idx)
                    }
                    if items.count < maxCount {
                        PhotosPicker(selection: $picks, maxSelectionCount: maxCount - items.count, matching: allowVideo ? .any(of: [.images, .videos]) : .images) {
                            VStack(spacing: 6) {
                                Image(systemName: "plus").font(.wr(.title3, .semibold))
                                Text("Hinzufügen").font(.wr(.caption))
                            }
                            .foregroundStyle(Color.moss)
                            .frame(width: 96, height: 96)
                            .background(Color.mossSoft, in: .rect(cornerRadius: Radius.inner, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: Radius.inner, style: .continuous).strokeBorder(Color.moss.opacity(0.35), style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
                        }
                        .accessibilityLabel("Bilder hinzufügen")
                    }
                }
                .padding(.vertical, 2)
            }
            if coverHint && !items.isEmpty { Text("Das erste Bild ist das Titelbild. Halte ein Bild gedrückt, um es zu verschieben.").font(.wr(.caption)).foregroundStyle(Color.muted) }
        }
        .onChange(of: picks) { _, new in
            guard !new.isEmpty else { return }
            let batch = new
            picks = []
            Task { await ingest(batch) }
        }
        .sheet(item: $altEditing) { m in
            AltTextSheet(media: m) { alt in
                if let i = items.firstIndex(where: { $0.id == m.id }) { items[i].alt = alt }
            }
        }
    }

    private func tile(_ m: DraftMedia, index: Int) -> some View {
        ZStack(alignment: .topTrailing) {
            Group {
                if let img = m.image { Image(uiImage: img).resizable().scaledToFill() }
                else { RemoteImage(path: m.remoteURL) }
            }
            .frame(width: 96, height: 96)
            .clipShape(.rect(cornerRadius: Radius.inner, style: .continuous))
            .overlay {
                switch m.state {
                case .uploading: ZStack { Color.black.opacity(0.35); ProgressView().tint(.white) }.clipShape(.rect(cornerRadius: Radius.inner, style: .continuous))
                case .failed: ZStack { Color.danger.opacity(0.55); Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.white) }.clipShape(.rect(cornerRadius: Radius.inner, style: .continuous))
                case .ready: EmptyView()
                }
            }
            .overlay(alignment: .bottomLeading) {
                HStack(spacing: 4) {
                    if index == 0 && coverHint { Text("Titel").font(.wr(size: 9, weight: .bold)).padding(.horizontal, 5).padding(.vertical, 2).background(Color.moss, in: Capsule()).foregroundStyle(.white) }
                    if !m.alt.isEmpty { Text("ALT").font(.wr(size: 9, weight: .bold)).padding(.horizontal, 5).padding(.vertical, 2).background(.black.opacity(0.55), in: Capsule()).foregroundStyle(.white) }
                    if m.isVideo { Image(systemName: "video.fill").font(.wr(size: 9)).padding(4).background(.black.opacity(0.55), in: Capsule()).foregroundStyle(.white) }
                }.padding(5)
            }
            Button { withAnimation(.snappy) { items.removeAll { $0.id == m.id } } } label: {
                Image(systemName: "xmark").font(.wr(size: 10, weight: .bold)).foregroundStyle(.white).frame(width: 22, height: 22).background(.black.opacity(0.6), in: Circle())
            }
            .padding(4)
            .accessibilityLabel("Bild entfernen")
        }
        .contextMenu {
            Button("Alt-Text bearbeiten", systemImage: "text.below.photo") { altEditing = m }
            if index > 0 { Button("Nach vorne", systemImage: "arrow.left") { move(index, by: -1) } }
            if index < items.count - 1 { Button("Nach hinten", systemImage: "arrow.right") { move(index, by: 1) } }
            if index > 0 && coverHint { Button("Als Titelbild", systemImage: "star") { withAnimation { let x = items.remove(at: index); items.insert(x, at: 0) } } }
            Button("Entfernen", systemImage: "trash", role: .destructive) { withAnimation { items.removeAll { $0.id == m.id } } }
        }
        .onTapGesture { altEditing = m }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(m.alt.isEmpty ? "Bild \(index + 1), ohne Alt-Text" : "Bild \(index + 1): \(m.alt)")
        .accessibilityHint("Doppeltippen für Alt-Text")
    }

    private func move(_ i: Int, by d: Int) {
        withAnimation(.snappy) { items.swapAt(i, i + d) }
    }

    private func ingest(_ batch: [PhotosPickerItem]) async {
        for item in batch {
            if allowVideo, item.supportedContentTypes.contains(where: { $0.conforms(to: .movie) }), let movie = try? await item.loadTransferable(type: PickedMovie.self) {
                var d = DraftMedia(isVideo: true, state: .uploading)
                d.image = await thumbnail(movie.url)
                items.append(d)
                let did = d.id
                do {
                    let mid = try await MediaUpload.uploadVideo(movie.url)
                    update(did) { $0.mediaId = mid; $0.state = .ready }
                } catch { update(did) { $0.state = .failed(error.localizedDescription) }; app.show(error: error) }
                continue
            }
            guard let data = try? await item.loadTransferable(type: Data.self), let img = UIImage(data: data) else { continue }
            let d = DraftMedia(image: img, state: .uploading)
            withAnimation(.snappy) { items.append(d) }
            let did = d.id
            do {
                let (mid, r) = try await MediaUpload.upload(img)
                update(did) { $0.mediaId = mid; $0.remoteURL = r.variants?.best; $0.state = .ready }
            } catch {
                update(did) { $0.state = .failed(error.localizedDescription) }
                app.show(error: error)
            }
        }
    }

    private func update(_ id: String, _ f: (inout DraftMedia) -> Void) {
        if let i = items.firstIndex(where: { $0.id == id }) { f(&items[i]) }
    }

    private func thumbnail(_ url: URL) async -> UIImage? {
        let gen = AVAssetImageGeneratorBox(url: url)
        return await gen.image()
    }
}

import AVFoundation
private struct AVAssetImageGeneratorBox {
    let url: URL
    func image() async -> UIImage? {
        let g = AVAssetImageGenerator(asset: AVURLAsset(url: url))
        g.appliesPreferredTrackTransform = true
        guard let (cg, _) = try? await g.image(at: .zero) else { return nil }
        return UIImage(cgImage: cg)
    }
}

extension Array where Element == DraftMedia {
    var refs: [MediaRef] { compactMap(\.ref) }
    var isUploading: Bool { contains { $0.state == .uploading } }
    var refsJSON: JSONValue { .array(refs.map { ["id": .string($0.id), "alt": .string($0.alt)] }) }
}

struct AltTextSheet: View {
    var media: DraftMedia
    var save: (String) -> Void
    @State private var alt = ""
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack {
                        Spacer()
                        Group {
                            if let img = media.image { Image(uiImage: img).resizable().scaledToFit() } else { RemoteImage(path: media.remoteURL, contentMode: .fit) }
                        }
                        .frame(maxHeight: 220)
                        .clipShape(.rect(cornerRadius: Radius.inner))
                        Spacer()
                    }
                }
                Section {
                    TextField("Was ist auf dem Bild zu sehen?", text: $alt, axis: .vertical).lineLimit(2...6)
                } header: { Text("Alternativtext") } footer: { Text("Beschreibe das Bild für Menschen, die einen Screenreader nutzen – z. B. Material, Farbe und Arbeitsschritt.") }
            }
            .navigationTitle("Bildbeschreibung")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Fertig") { save(alt.trimmed); dismiss() } }
            }
            .onAppear { alt = media.alt }
        }
        .presentationDetents([.medium, .large])
    }
}

/// Einzelbild-Auswahl (Avatar, Titelbild)
struct SingleImagePicker<Label: View>: View {
    var onUploaded: (String, String?) -> Void
    @ViewBuilder var label: () -> Label
    @State private var pick: PhotosPickerItem?
    @State private var uploading = false
    @Environment(AppState.self) private var app

    var body: some View {
        PhotosPicker(selection: $pick, matching: .images) {
            ZStack {
                label()
                if uploading { ProgressView().padding(8).background(.ultraThinMaterial, in: Circle()) }
            }
        }
        .onChange(of: pick) { _, item in
            guard let item else { return }
            Task {
                uploading = true
                defer { uploading = false; pick = nil }
                guard let data = try? await item.loadTransferable(type: Data.self), let img = UIImage(data: data) else { return }
                do {
                    let (id, r) = try await MediaUpload.upload(img)
                    onUploaded(id, r.variants?.best)
                } catch { app.show(error: error) }
            }
        }
    }
}
