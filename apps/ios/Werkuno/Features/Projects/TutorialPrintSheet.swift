import PDFKit
import SwiftUI
import UIKit
import WebKit

/// „Als PDF teilen / Drucken“: lädt die Druckfassung der Website (`/anleitungen/{slug}/drucken`) unsichtbar,
/// angemeldet über das App-Token, und setzt daraus ein A4-PDF mit Seitenumbrüchen. Das Pro-Branding
/// der Autorin bzw. des Autors kommt automatisch aus der Druckfassung.
struct TutorialPrintSheet: View {
    var slug: String
    var title: String

    @Environment(\.dismiss) private var dismiss
    @State private var withImages = true
    @State private var pdf: Data?
    @State private var fileURL: URL?
    @State private var error: String?
    @State private var loading = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                preview
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.sunken)
                controls
            }
            .background(Color.paper)
            .navigationTitle("PDF & Drucken")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Schliessen") { dismiss() } }
            }
        }
        .task(id: withImages) { await render() }
    }

    @ViewBuilder private var preview: some View {
        if let pdf {
            PDFPreview(data: pdf).accessibilityLabel("Vorschau der Druckfassung")
        } else if let error {
            ContentUnavailableView {
                Label("PDF nicht möglich", systemImage: "doc.badge.ellipsis")
            } description: {
                Text(error)
            } actions: {
                Button("Erneut versuchen") { Task { await render() } }
            }
        } else {
            VStack(spacing: 12) {
                ProgressView()
                Text("Druckfassung wird erstellt …").font(.wr(.footnote)).foregroundStyle(Color.muted)
            }
        }
    }

    private var controls: some View {
        VStack(spacing: 12) {
            Toggle("Mit Bildern", isOn: $withImages)
                .font(.wr(.subheadline, .medium))
                .tint(.moss)
                .disabled(loading)
            HStack(spacing: 10) {
                if let fileURL {
                    ShareLink(item: fileURL, subject: Text(title)) {
                        Label("Als PDF teilen", systemImage: "square.and.arrow.up").font(.wr(.subheadline, .semibold)).frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.glass)
                    .controlSize(.large)
                }
                Button { printPDF() } label: { Label("Drucken", systemImage: "printer") }
                    .primaryButton()
                    .disabled(pdf == nil)
            }
            Text("A4, mit Material zum Abhaken und QR-Code zur Anleitung.")
                .font(.wr(.caption)).foregroundStyle(Color.muted)
        }
        .padding(.horizontal, Space.gutter)
        .padding(.vertical, 14)
        .hairline(.top)
    }

    private func render() async {
        loading = true
        defer { loading = false }
        error = nil
        pdf = nil
        fileURL = nil
        do {
            let data = try await TutorialPDFRenderer().render(slug: slug, withImages: withImages)
            let name = slug.replacingOccurrences(of: "/", with: "-")
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(name).pdf")
            try data.write(to: url, options: .atomic)
            pdf = data
            fileURL = url
        } catch is CancellationError {
        } catch {
            self.error = (error as? TutorialPDFRenderer.Failure)?.message ?? "Die Druckfassung konnte nicht geladen werden. Prüfe die Verbindung und versuche es erneut."
        }
    }

    private func printPDF() {
        guard let pdf else { return }
        let info = UIPrintInfo.printInfo()
        info.jobName = title
        info.outputType = withImages ? .general : .grayscale
        let c = UIPrintInteractionController.shared
        c.printInfo = info
        c.printingItem = pdf
        c.present(animated: true)
    }
}

// MARK: - Vorschau

private struct PDFPreview: UIViewRepresentable {
    var data: Data
    func makeUIView(context: Context) -> PDFView {
        let v = PDFView()
        v.autoScales = true
        v.displayMode = .singlePageContinuous
        v.backgroundColor = .clear
        return v
    }
    func updateUIView(_ v: PDFView, context: Context) {
        if v.document?.dataRepresentation() != data { v.document = PDFDocument(data: data) }
    }
}

// MARK: - Renderer

/// Lädt die Druckfassung in einer unsichtbaren WKWebView (mit `Authorization: Bearer`) und rendert
/// sie über `UIPrintPageRenderer` zu A4-Seiten. Das Druck-CSS der Seite blendet die Werkzeugleiste aus.
@MainActor
final class TutorialPDFRenderer: NSObject, WKNavigationDelegate {
    struct Failure: Error { var message: String }
    static let locked = Failure(message: "Diese Anleitung ist nur für Unterstützer:innen. Werde Unterstützer:in, um sie als PDF zu speichern oder zu drucken.")

    private var webView: WKWebView?
    private var continuation: CheckedContinuation<Void, Error>?
    private var status = 200

    /// A4 in Punkten; Ränder wie beim Drucken aus dem Browser
    private static let paper = CGRect(x: 0, y: 0, width: 595.2, height: 841.8)
    private static let margin: CGFloat = 34

    func render(slug: String, withImages: Bool) async throws -> Data {
        var path = "/anleitungen/\(slug)/drucken?app=ios"
        if !withImages { path += "&bilder=0" }
        guard let url = AppConfig.resolve(path) else { throw Failure(message: "Ungültige Adresse.") }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30)
        if let token = APIClient.shared.token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }

        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        let web = WKWebView(frame: CGRect(x: -10_000, y: 0, width: Self.paper.width, height: Self.paper.height), configuration: config)
        web.navigationDelegate = self
        webView = web
        // Ausserhalb des sichtbaren Bereichs ins Fenster hängen, damit WebKit Layout und Bilder fertig lädt
        let window = UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first
        window?.addSubview(web)
        defer {
            web.stopLoading()
            web.removeFromSuperview()
            webView = nil
        }

        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { (c: CheckedContinuation<Void, Error>) in
                continuation = c
                web.load(request)
            }
        } onCancel: {
            Task { @MainActor in self.finish(CancellationError()) }
        }

        if status == 404 || status == 410 { throw Failure(message: "Diese Anleitung gibt es nicht (mehr).") }
        if status >= 400 { throw Failure(message: "Die Druckfassung ist gerade nicht erreichbar (Fehler \(status)).") }
        // Gesperrte Anleitungen (nur für Unterstützer:innen) leitet die Website zur Anleitung um
        guard web.url?.path.hasSuffix("/drucken") == true else { throw Self.locked }
        // Webfonts und Bilder abwarten (verzögert geladene Bilder sofort holen, höchstens 10 s)
        let js = """
        document.querySelectorAll('img[loading="lazy"]').forEach(i => { i.loading = 'eager' });
        await document.fonts.ready;
        const pending = [...document.images].filter(i => !i.complete).map(i => new Promise(r => { i.onload = i.onerror = r }));
        await Promise.race([Promise.all(pending), new Promise(r => setTimeout(r, 10000))]);
        return !!document.querySelector('.print-doc');
        """
        let isPrintPage = (try? await web.callAsyncJavaScript(js, arguments: [:], in: nil, contentWorld: .page)) as? Bool
        guard isPrintPage != false else { throw Self.locked }
        try await Task.sleep(for: .milliseconds(250))
        return pdfData(from: web)
    }

    private func pdfData(from web: WKWebView) -> Data {
        let renderer = UIPrintPageRenderer()
        renderer.addPrintFormatter(web.viewPrintFormatter(), startingAtPageAt: 0)
        let printable = Self.paper.insetBy(dx: Self.margin, dy: Self.margin)
        renderer.setValue(NSValue(cgRect: Self.paper), forKey: "paperRect")
        renderer.setValue(NSValue(cgRect: printable), forKey: "printableRect")
        let data = NSMutableData()
        UIGraphicsBeginPDFContextToData(data, Self.paper, nil)
        renderer.prepare(forDrawingPages: NSRange(location: 0, length: renderer.numberOfPages))
        for i in 0..<renderer.numberOfPages {
            UIGraphicsBeginPDFPage()
            renderer.drawPage(at: i, in: UIGraphicsGetPDFContextBounds())
        }
        UIGraphicsEndPDFContext()
        return data as Data
    }

    private func finish(_ error: Error?) {
        guard let c = continuation else { return }
        continuation = nil
        if let error { c.resume(throwing: error) } else { c.resume() }
    }

    // MARK: WKNavigationDelegate

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse) async -> WKNavigationResponsePolicy {
        if navigationResponse.isForMainFrame, let r = navigationResponse.response as? HTTPURLResponse { status = r.statusCode }
        return .allow
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { finish(nil) }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { finish(error) }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { finish(error) }
}
