import XCTest

/// Bedienungshilfen-Prüfung: öffnet die wichtigsten Bildschirme und lässt Apples Accessibility Audit
/// laufen (Beschriftungen für VoiceOver, abgeschnittener Text, Dynamic Type, Kontrast, Tippflächen …).
/// Gefundene Probleme werden als Zeilen „A11Y|…“ ausgegeben, nicht als Testfehler, damit alle Bildschirme
/// durchlaufen. Voraussetzung: angemeldete App im Simulator und erreichbarer Server.
///
/// Textgrösse über die Umgebungsvariable `A11Y_SIZE` (Standard: AccessibilityExtraExtraExtraLarge),
/// Screenshots nach `A11Y_SHOTS` (Ordner auf dem Mac), falls gesetzt.
final class AccessibilityAuditTests: XCTestCase {
    private var app: XCUIApplication!
    private var issueCount = 0

    private let screens: [(name: String, url: String?)] = [
        ("werkbank", nil),
        ("entdecken", "werkuno://entdecken"),
        ("markt", "werkuno://markt"),
        ("produkt", "werkuno://markt/bottega-mattia/schneidebrett-nussbaum"),
        ("produkt-digital", "werkuno://markt/bottega-mattia/bauanleitung-vogelhaus-pdf"),
        ("shop", "werkuno://markt/bottega-mattia"),
        ("warenkorb", "werkuno://warenkorb"),
        ("projekt", "werkuno://u/mattia.holz/wandregal-mit-schwalbenschwanz"),
        ("anleitung", "werkuno://anleitungen/markttasche-im-netzmuster-haekeln"),
        ("community", "werkuno://c/werkbank-holz"),
        ("profil", "werkuno://u/lena.haekelt"),
        ("benachrichtigungen", "werkuno://benachrichtigungen"),
        ("nachrichten", "werkuno://nachrichten"),
        ("unterhaltung", "werkuno://nachrichten/cmw3enct9000ps8e7yoci03mn"),
        ("suche", "werkuno://suche?q=holz"),
        ("einstellungen", "werkuno://einstellungen"),
        ("bestellungen", "werkuno://bestellungen"),
        ("studio", "werkuno://studio"),
    ]

    override func setUp() {
        continueAfterFailure = true
        let env = ProcessInfo.processInfo.environment
        let size = env["A11Y_SIZE"] ?? "UICTContentSizeCategoryAccessibilityXXXL"
        app = XCUIApplication()
        app.launchArguments += ["-UIPreferredContentSizeCategoryName", size]
        app.launch()
        _ = app.wait(for: .runningForeground, timeout: 10)
        sleep(4)
    }

    func testAuditMainScreens() throws {
        let shots = ProcessInfo.processInfo.environment["A11Y_SHOTS"]
        for screen in screens {
            if let u = screen.url, let url = URL(string: u) {
                app.open(url)
                sleep(3)
            }
            if let shots {
                let data = app.screenshot().pngRepresentation
                try? data.write(to: URL(fileURLWithPath: shots).appendingPathComponent("\(screen.name).png"))
            }
            do {
                try app.performAccessibilityAudit(for: .all) { issue in
                    self.issueCount += 1
                    let el = issue.element
                    let label = el.map { "\($0.elementType.rawValue)|\($0.label)|\($0.identifier)|\(Int($0.frame.minX)),\(Int($0.frame.minY)),\(Int($0.frame.width))x\(Int($0.frame.height))" } ?? "-"
                    print("A11Y|\(screen.name)|\(issue.auditType)|\(issue.compactDescription)|\(label)")
                    return true // erfassen, nicht abbrechen
                }
            } catch {
                print("A11Y|\(screen.name)|ERROR|\(error)")
            }
            print("A11Y-SCREEN-DONE|\(screen.name)")
        }
        print("A11Y-TOTAL|\(issueCount)")
    }
}
