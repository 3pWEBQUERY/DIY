import SwiftUI
import WebKit

/// Three.js-Szenen (ThreeD/web/scenes.js) in einem transparenten WKWebView.
/// Steuerung über `WR.boot/update/theme/pause`, Rückmeldungen (z. B. Knoten-Tipp) über `onEvent`.
struct ThreeScene: Equatable {
    enum Kind: String { case story, glyph, journal, heat, knot }
    var kind: Kind
    var params: [String: JSONValue] = [:]
    var interactive = true

    static func story(progress: Double) -> ThreeScene { ThreeScene(kind: .story, params: ["progress": .number(progress)]) }
    static func glyph(_ glyph: String?, color: Color, seed: Int = 1, spin: Double = 0.22, thin: Bool = false) -> ThreeScene {
        ThreeScene(kind: .glyph, params: ["glyph": .from(glyph), "color": .string(color.hex), "seed": .number(Double(seed)), "spin": .number(spin), "thin": .bool(thin)])
    }
    static func journal(nodes: [String], remixes: Int, status: String, color: Color, highlight: Int? = nil) -> ThreeScene {
        ThreeScene(kind: .journal, params: ["nodes": .array(nodes.map { ["kind": .string($0)] }), "remixes": .number(Double(remixes)), "status": .string(status), "color": .string(color.hex), "highlight": .from(highlight)])
    }
    static func heat(days: [Int]) -> ThreeScene { ThreeScene(kind: .heat, params: ["days": .array(days.map { .number(Double($0)) })]) }
    static func knot(color: Color) -> ThreeScene { ThreeScene(kind: .knot, params: ["color": .string(color.hex)]) }
}

extension Color {
    /// Aufgelöste Hex-Farbe (für JS) im aktuellen Erscheinungsbild
    var hex: String { UIColor(self).resolvedColor(with: UITraitCollection.current).hexString }
    func hex(_ scheme: ColorScheme) -> String {
        UIColor(self).resolvedColor(with: UITraitCollection(userInterfaceStyle: scheme == .dark ? .dark : .light)).hexString
    }
}

struct ThreeSceneView: UIViewRepresentable {
    var scene: ThreeScene
    var paused = false
    var onEvent: ((String, [String: Any]) -> Void)? = nil
    /// Löst bei Änderung `WR.celebrate()` aus (Knoten-Szene)
    var celebrateToken: Int = 0

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let cfg = WKWebViewConfiguration()
        cfg.userContentController.add(WeakHandler(context.coordinator), name: "wr")
        cfg.suppressesIncrementalRendering = false
        cfg.allowsInlineMediaPlayback = true
        let wv = WKWebView(frame: .zero, configuration: cfg)
        wv.isOpaque = false
        wv.backgroundColor = .clear
        wv.scrollView.backgroundColor = .clear
        wv.scrollView.isScrollEnabled = false
        wv.scrollView.bounces = false
        wv.scrollView.contentInsetAdjustmentBehavior = .never
        wv.isUserInteractionEnabled = scene.interactive
        wv.isInspectable = true
        wv.accessibilityElementsHidden = true
        context.coordinator.webView = wv
        context.coordinator.onEvent = onEvent
        context.coordinator.pendingBoot = bootScript()
        if let dir = Bundle.main.url(forResource: "web", withExtension: nil) {
            wv.loadFileURL(dir.appendingPathComponent("index.html"), allowingReadAccessTo: dir)
        }
        context.coordinator.lastScene = scene
        context.coordinator.lastScheme = colorScheme
        return wv
    }

    func updateUIView(_ wv: WKWebView, context: Context) {
        let c = context.coordinator
        c.onEvent = onEvent
        wv.isUserInteractionEnabled = scene.interactive
        if c.lastScene?.kind != scene.kind {
            c.run(bootScript())
        } else if c.lastScene != scene {
            c.run("WR.update(\(json(scene.params)))")
        }
        if c.lastScheme != colorScheme { c.run("WR.theme(\(json(themeDict)))") }
        if c.lastPaused != paused { c.run("WR.pause(\(paused))") }
        if c.lastCelebrate != celebrateToken { c.run("WR.celebrate()") }
        c.lastScene = scene
        c.lastScheme = colorScheme
        c.lastPaused = paused
        c.lastCelebrate = celebrateToken
    }

    static func dismantleUIView(_ wv: WKWebView, coordinator: Coordinator) {
        wv.configuration.userContentController.removeScriptMessageHandler(forName: "wr")
        wv.stopLoading()
    }

    private var themeDict: [String: JSONValue] {
        ["ink": .string(Color.ink.hex(colorScheme)), "moss": .string(Color.moss.hex(colorScheme)), "clay": .string(Color.clay.hex(colorScheme)), "paper": .string(Color.paper.hex(colorScheme)), "muted": .string(Color.muted.hex(colorScheme)), "dark": .bool(colorScheme == .dark)]
    }

    private func bootScript() -> String {
        let cfg: [String: JSONValue] = ["scene": .string(scene.kind.rawValue), "params": .object(scene.params), "theme": .object(themeDict), "reduceMotion": .bool(reduceMotion), "interactive": .bool(scene.interactive)]
        return "WR.boot(\(json(.object(cfg))))"
    }

    private func json(_ v: [String: JSONValue]) -> String { json(.object(v)) }
    private func json(_ v: JSONValue) -> String { (try? String(data: JSON.encoder.encode(v), encoding: .utf8)) ?? "{}" }

    final class Coordinator: NSObject, WKScriptMessageHandler {
        weak var webView: WKWebView?
        var onEvent: ((String, [String: Any]) -> Void)?
        var loaded = false
        var pendingBoot: String?
        var queue: [String] = []
        var lastScene: ThreeScene?
        var lastScheme: ColorScheme?
        var lastPaused = false
        var lastCelebrate = 0

        func run(_ js: String) {
            guard loaded, let webView else {
                if js.hasPrefix("WR.boot") { pendingBoot = js } else { queue.append(js) }
                return
            }
            webView.evaluateJavaScript(js, completionHandler: nil)
        }

        func userContentController(_ uc: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
            if type == "loaded" {
                loaded = true
                if let b = pendingBoot { webView?.evaluateJavaScript(b) }
                pendingBoot = nil
                queue.forEach { webView?.evaluateJavaScript($0) }
                queue.removeAll()
                return
            }
            onEvent?(type, body)
        }
    }

    /// Verhindert Retain-Zyklus WKUserContentController → Coordinator
    final class WeakHandler: NSObject, WKScriptMessageHandler {
        weak var target: WKScriptMessageHandler?
        init(_ t: WKScriptMessageHandler) { target = t }
        func userContentController(_ uc: WKUserContentController, didReceive m: WKScriptMessage) { target?.userContentController(uc, didReceive: m) }
    }
}

/// Bequemer Container: pausiert die Szene, wenn sie nicht sichtbar ist.
struct ThreeCanvas: View {
    var scene: ThreeScene
    var onEvent: ((String, [String: Any]) -> Void)? = nil
    var celebrateToken = 0
    @State private var visible = true
    @Environment(\.scenePhase) private var phase

    var body: some View {
        ThreeSceneView(scene: scene, paused: !visible || phase != .active, onEvent: onEvent, celebrateToken: celebrateToken)
            .onGeometryChange(for: Bool.self) { proxy in
                let f = proxy.frame(in: .global)
                let h = proxy.bounds(of: .scrollView)?.height ?? 2000
                return f.maxY > 0 && f.minY < h && f.height > 0
            } action: { visible = $0 }
            .onDisappear { visible = false }
            .onAppear { visible = true }
            .accessibilityHidden(true)
    }
}
