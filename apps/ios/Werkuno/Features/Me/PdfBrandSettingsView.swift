import PhotosUI
import SwiftUI

/// GET /studio/pdf-brand
struct PdfBrandState: Decodable, Sendable {
    struct Brand: Decodable, Hashable, Sendable {
        var name: String
        var link: String?
        var logoUrl: String?
        var logoMediaId: String?
    }
    struct Defaults: Decodable, Sendable { var name: String; var link: String }
    struct Preview: Decodable, Sendable { var slug: String; var title: String }
    var isPro: Bool
    var brand: Brand?
    var defaults: Defaults
    var preview: Preview?
}

/// PDF-Branding (Creator Pro): Logo, Name und Link in der Druck- und PDF-Fassung der eigenen
/// Anleitungen – gleiche Regeln wie /studio/einstellungen im Web.
struct PdfBrandSettingsView: View {
    @Environment(AppState.self) private var app
    @State private var state: PdfBrandState?
    @State private var error: String?

    var body: some View {
        MePhase(value: state, error: error, retry: load) { s in
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    PageTitle(kicker: "Creator Pro", title: "PDF-Branding", subtitle: "Die Druck- und PDF-Fassung deiner Anleitungen trägt dein Logo, deinen Namen und deinen Link mit QR-Code statt des Werkuno-Kopfs. Ein kleiner Hinweis „erstellt mit Werkuno“ bleibt.")
                    if s.isPro {
                        PdfBrandForm(state: s) { await load() }
                    } else {
                        ProUnlockCard(feature: .pdfBranding)
                    }
                }
                .padding(.horizontal, Space.gutter)
                .padding(.vertical, 20)
            }
        }
        .background(Color.paper)
        .navigationTitle("PDF-Branding")
        .navigationBarTitleDisplayMode(.inline)
        .task { if state == nil { await load() } }
    }

    private func load() async {
        do {
            state = try await APIClient.shared.get("/studio/pdf-brand")
            error = nil
        } catch is CancellationError {
        } catch {
            if state == nil { self.error = (error as? APIError)?.message ?? error.localizedDescription } else { app.show(error: error) }
        }
    }
}

// MARK: - Formular

private struct PdfBrandForm: View {
    var state: PdfBrandState
    var reload: () async -> Void

    @Environment(AppState.self) private var app
    @State private var name = ""
    @State private var link = ""
    @State private var logoURL: String?
    @State private var logoImage: UIImage?
    @State private var logoMediaId: String?
    @State private var removeLogo = false
    @State private var pick: PhotosPickerItem?
    @State private var uploading = false
    @State private var fields: [String: String] = [:]
    @State private var confirmReset = false
    @State private var showPreview = false
    @State private var didInit = false

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            logoRow
            VStack(alignment: .leading, spacing: 4) {
                MarketWizardField(title: "Name im Kopf", text: $name, error: fields["name"] ?? nameProblem, prompt: state.defaults.name)
                Text("z. B. dein Atelier- oder Shopname").font(.wr(.caption)).foregroundStyle(Color.muted)
            }
            VStack(alignment: .leading, spacing: 4) {
                MarketWizardField(title: "Link (optional)", text: $link, error: fields["link"] ?? linkProblem, prompt: "https://")
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                Text("Shop oder Website, mit https:// – erscheint in der Fusszeile, mit QR-Code").font(.wr(.caption)).foregroundStyle(Color.muted)
            }
            PdfBrandPreview(name: name.trimmed, link: link.trimmed, logoURL: removeLogo ? nil : logoURL, logoImage: removeLogo ? nil : logoImage)
            actions
        }
        .onAppear(perform: fill)
        .onChange(of: pick) { _, item in if let item { Task { await upload(item) } } }
        .sheet(isPresented: $showPreview) {
            if let p = state.preview { TutorialPrintSheet(slug: p.slug, title: p.title) }
        }
        .confirmationDialog("Standard-Druckfassung verwenden?", isPresented: $confirmReset, titleVisibility: .visible) {
            Button("Branding entfernen", role: .destructive) { Task { await reset() } }
            Button("Abbrechen", role: .cancel) {}
        } message: { Text("Deine Anleitungen erscheinen dann wieder mit dem Werkuno-Kopf.") }
    }

    private var nameProblem: String? {
        let n = name.trimmed
        return n.count > 60 ? "Höchstens 60 Zeichen" : nil
    }

    private var linkProblem: String? {
        let l = link.trimmed
        guard !l.isEmpty else { return nil }
        guard let u = URL(string: l), u.scheme == "https", let h = u.host, h.contains(".") else { return "Bitte gib eine vollständige Adresse mit https:// an" }
        return l.count > 200 ? "Höchstens 200 Zeichen" : nil
    }

    private var canSave: Bool { !name.trimmed.isEmpty && nameProblem == nil && linkProblem == nil && !uploading }

    private var logoRow: some View {
        HStack(spacing: 14) {
            logoThumb
                .frame(width: 96, height: 64)
                .background(Color.sunken, in: .rect(cornerRadius: Radius.small, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: Radius.small, style: .continuous).strokeBorder(Color.line, lineWidth: 0.75))
            VStack(alignment: .leading, spacing: 6) {
                Text("Logo").font(.wr(.subheadline, .semibold))
                PhotosPicker(selection: $pick, matching: .images) {
                    Label(uploading ? "Lädt hoch …" : hasLogo ? "Logo ersetzen" : "Logo hochladen", systemImage: "photo.badge.plus")
                        .font(.wr(.footnote, .semibold))
                }
                .disabled(uploading)
                if hasLogo {
                    Button("Logo entfernen", role: .destructive) {
                        removeLogo = true
                        logoMediaId = nil
                        logoImage = nil
                    }
                    .font(.wr(.footnote))
                }
            }
        }
    }

    private var hasLogo: Bool { !removeLogo && (logoImage != nil || logoURL != nil) }

    @ViewBuilder private var logoThumb: some View {
        if uploading {
            ProgressView()
        } else if !removeLogo, let logoImage {
            Image(uiImage: logoImage).resizable().scaledToFit().padding(6)
        } else if !removeLogo, let logoURL {
            RemoteImage(path: logoURL, contentMode: .fit) { Color.clear }.padding(6)
        } else {
            Text("Kein Logo").font(.wr(.caption2)).foregroundStyle(Color.muted)
        }
    }

    private var actions: some View {
        VStack(alignment: .leading, spacing: 10) {
            AsyncButton { await save() } label: { Text("Speichern") }
                .primaryButton()
                .disabled(!canSave)
            HStack {
                if state.brand != nil {
                    Button("Standard verwenden") { confirmReset = true }
                        .font(.wr(.subheadline, .semibold))
                        .foregroundStyle(Color.muted)
                        .frame(minHeight: 44)
                }
                Spacer()
                if state.preview != nil {
                    Button { showPreview = true } label: { Label("Druckfassung ansehen", systemImage: "doc.richtext") }
                        .font(.wr(.subheadline, .semibold))
                        .foregroundStyle(Color.ink)
                        .frame(minHeight: 44)
                        .accessibilityHint("Zeigt deine neueste Anleitung als PDF mit dem gespeicherten Branding")
                }
            }
        }
    }

    // MARK: Aktionen

    private func fill() {
        guard !didInit else { return }
        didInit = true
        name = state.brand?.name ?? state.defaults.name
        link = state.brand?.link ?? state.defaults.link
        logoURL = state.brand?.logoUrl
    }

    private func upload(_ item: PhotosPickerItem) async {
        defer { pick = nil }
        guard let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) else {
            app.show("Das Bild konnte nicht gelesen werden.", style: .error)
            return
        }
        uploading = true
        defer { uploading = false }
        do {
            let (id, result) = try await MediaUpload.upload(image)
            guard result.state == "READY" else {
                app.show("Das Bild wird noch verarbeitet. Bitte versuche es gleich noch einmal.", style: .error)
                return
            }
            logoMediaId = id
            logoImage = image
            logoURL = result.variants?.md ?? result.variants?.sm ?? result.variants?.lg
            removeLogo = false
            fields["logo"] = nil
        } catch {
            app.show(error: error)
        }
    }

    private func save() async {
        var body: [String: JSONValue] = ["name": .string(name.trimmed), "link": .string(link.trimmed)]
        if let logoMediaId { body["logoMediaId"] = .string(logoMediaId) }
        if removeLogo { body["removeLogo"] = .bool(true) }
        do {
            _ = try await APIClient.shared.put("/studio/pdf-brand", body) as JSONValue
            fields = [:]
            app.show("PDF-Branding gespeichert.")
            Haptics.success()
            await reload()
            logoMediaId = nil
        } catch let e as APIError {
            fields = e.fields ?? [:]
            if let logo = fields["logo"] { app.show(logo, style: .error) } else { app.show(error: e) }
        } catch {
            app.show(error: error)
        }
    }

    private func reset() async {
        let ok = await app.run("Standard-Druckfassung wiederhergestellt.") {
            _ = try await APIClient.shared.delete("/studio/pdf-brand") as JSONValue
        }
        guard ok else { return }
        didInit = false
        removeLogo = false
        logoImage = nil
        logoMediaId = nil
        await reload()
        name = state.defaults.name
        link = state.defaults.link
        logoURL = nil
        didInit = true
    }
}

// MARK: - Vorschau des Kopfs

private struct PdfBrandPreview: View {
    var name: String
    var link: String
    var logoURL: String?
    var logoImage: UIImage?

    private var shown: String { name.isEmpty ? "Dein Name" : name }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SpecLabel("Vorschau")
            HStack(spacing: 12) {
                logo
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(shown) · Anleitung".uppercased()).font(.spec).foregroundStyle(Color.muted).lineLimit(1)
                    Text("Titel deiner Anleitung").font(.wr(.title3, .heavy)).foregroundStyle(Color.ink)
                }
            }
            .padding(.bottom, 10)
            .overlay(alignment: .bottom) { Rectangle().fill(Color.ink).frame(height: 2) }
            Text(link.isEmpty ? "\(shown) · erstellt mit Werkuno" : "\(shown) · \(link) · erstellt mit Werkuno")
                .font(.wr(.caption2)).foregroundStyle(Color.muted)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.paper, in: .rect(cornerRadius: Radius.inner, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radius.inner, style: .continuous).strokeBorder(Color.line, lineWidth: 1))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Vorschau des Kopfs: \(shown)")
    }

    @ViewBuilder private var logo: some View {
        if let logoImage {
            Image(uiImage: logoImage).resizable().scaledToFit().frame(maxWidth: 120, maxHeight: 40)
        } else if let logoURL {
            RemoteImage(path: logoURL, contentMode: .fit) { Color.clear }.frame(width: 80, height: 40)
        }
    }
}
