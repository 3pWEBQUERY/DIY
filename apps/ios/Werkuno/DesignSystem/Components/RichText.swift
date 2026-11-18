import SwiftUI
import UIKit

/// Formatierter Text für Produktbeschreibung, Sicherheitshinweise und Rückgabe – dieselbe Auszeichnung wie
/// im Web (apps/web/src/lib/rich-text.ts): Zeilen mit „- “ bzw. „1. “ sind Listen, inline **fett**,
/// *kursiv* und [Text](https://…). Gespeichert wird nie HTML; bisheriger reiner Text ist unverändert gültig.
enum RichMarkup {
    /// Kursiv ohne eigenen Kursiv-Schnitt (Manrope hat keinen): leicht geneigt
    static let italicSlant: Double = 0.18

    static func baseFont(_ size: CGFloat = 17) -> UIFont { Manrope.uiFont(size: size) }
    static func boldFont(_ size: CGFloat = 17) -> UIFont { Manrope.uiFont(size: size, weight: .bold) }

    static func attrs(bold: Bool = false, italic: Bool = false, link: URL? = nil, size: CGFloat = 17, color: UIColor = UIColor(Color.ink)) -> [NSAttributedString.Key: Any] {
        var a: [NSAttributedString.Key: Any] = [.font: bold ? boldFont(size) : baseFont(size), .foregroundColor: color]
        if italic { a[.obliqueness] = italicSlant }
        if let link { a[.link] = link }
        return a
    }

    // MARK: Inline (wie parseInline im Web)

    struct Run { var text: String; var bold = false; var italic = false; var link: URL? = nil }

    static func parseInline(_ src: String, bold: Bool = false, italic: Bool = false, link: URL? = nil, depth: Int = 0) -> [Run] {
        let c = Array(src)
        var out: [Run] = []
        var buf = ""
        func flush() {
            if !buf.isEmpty { out.append(Run(text: buf, bold: bold, italic: italic, link: link)) }
            buf = ""
        }
        var i = 0
        while i < c.count {
            let ch = c[i]
            if ch == "\\", i + 1 < c.count, "*[]()\\".contains(c[i + 1]) {
                buf.append(c[i + 1]); i += 2; continue
            }
            if depth < 3, ch == "*", i + 1 < c.count, c[i + 1] == "*", let end = find("**", in: c, from: i + 2), end > i + 2 {
                flush()
                out += parseInline(String(c[(i + 2)..<end]), bold: true, italic: italic, link: link, depth: depth + 1)
                i = end + 2; continue
            }
            if depth < 3, ch == "*", i + 1 < c.count, c[i + 1] != " ", c[i + 1] != "*" {
                var end = -1
                var j = i + 1
                while j < c.count {
                    if c[j] == "\n" { break }
                    if c[j] != "*" { j += 1; continue }
                    if j + 1 < c.count, c[j + 1] == "*" { j += 2; continue }
                    if c[j - 1] != " " { end = j; break }
                    j += 1
                }
                if end > i + 1 {
                    flush()
                    out += parseInline(String(c[(i + 1)..<end]), bold: bold, italic: true, link: link, depth: depth + 1)
                    i = end + 1; continue
                }
            }
            if depth < 3, ch == "[", let close = find("](", in: c, from: i + 1), close > i + 1,
               !c[i..<close].contains("\n"), let end = find(")", in: c, from: close + 2), end > close + 2,
               let url = safeURL(String(c[(close + 2)..<end])) {
                flush()
                out += parseInline(String(c[(i + 1)..<close]), bold: bold, italic: italic, link: url, depth: depth + 1)
                i = end + 1; continue
            }
            buf.append(ch); i += 1
        }
        flush()
        return out
    }

    private static func find(_ needle: String, in c: [Character], from: Int) -> Int? {
        let n = Array(needle)
        guard from >= 0, c.count >= n.count, from <= c.count - n.count else { return nil }
        var i = from
        while i <= c.count - n.count {
            if Array(c[i..<(i + n.count)]) == n { return i }
            i += 1
        }
        return nil
    }

    /// Nur http(s), mailto und eigene Pfade – wie safeHref im Web
    static func safeURL(_ raw: String) -> URL? {
        let s = raw.trimmingCharacters(in: .whitespaces)
        guard !s.isEmpty, !s.contains(" "), !s.contains("\\") else { return nil }
        let lower = s.lowercased()
        if lower.hasPrefix("https://") || lower.hasPrefix("http://") || lower.hasPrefix("mailto:") { return URL(string: s) }
        if s.hasPrefix("/"), !s.hasPrefix("//") { return AppConfig.resolve(s) }
        return nil
    }

    // MARK: Zeilen (Listen)

    enum LineKind: Equatable { case text, bullet, number(Int) }

    /// „- Punkt“, „• Punkt“, „* Punkt“ → Aufzählung; „3. Punkt“ / „3) Punkt“ → nummeriert
    static func lineKind(_ line: String) -> (LineKind, String) {
        let t = line.drop(while: { $0 == " " || $0 == "\t" })
        if let f = t.first, "-•*".contains(f) {
            let rest = t.dropFirst()
            if let s = rest.first, s == " " || s == "\t" { return (.bullet, String(rest.drop(while: { $0 == " " || $0 == "\t" }))) }
        }
        let digits = t.prefix(while: { $0.isASCII && $0.isNumber })
        if !digits.isEmpty, digits.count <= 3 {
            let rest = t.dropFirst(digits.count)
            if let p = rest.first, p == "." || p == ")" {
                let after = rest.dropFirst()
                if let s = after.first, s == " " || s == "\t" { return (.number(Int(digits) ?? 1), String(after.drop(while: { $0 == " " || $0 == "\t" }))) }
            }
        }
        return (.text, line)
    }

    // MARK: Auszeichnung ↔ NSAttributedString (Editor)

    static func attributed(_ markup: String, size: CGFloat = 17) -> NSAttributedString {
        let out = NSMutableAttributedString()
        let lines = markup.replacingOccurrences(of: "\r\n", with: "\n").components(separatedBy: "\n")
        for (k, line) in lines.enumerated() {
            let (kind, rest) = lineKind(line)
            switch kind {
            case .bullet: out.append(NSAttributedString(string: "• ", attributes: attrs(size: size)))
            case .number(let n): out.append(NSAttributedString(string: "\(n). ", attributes: attrs(size: size)))
            case .text: break
            }
            for r in parseInline(rest) { out.append(NSAttributedString(string: r.text, attributes: attrs(bold: r.bold, italic: r.italic, link: r.link, size: size))) }
            if k < lines.count - 1 { out.append(NSAttributedString(string: "\n", attributes: attrs(size: size))) }
        }
        return out
    }

    static func markup(from text: NSAttributedString) -> String {
        let full = text.string
        var lines: [String] = []
        var offset = 0
        for line in full.components(separatedBy: "\n") {
            let len = (line as NSString).length
            lines.append(serializeLine(text, range: NSRange(location: offset, length: len), raw: line))
            offset += len + 1
        }
        return lines.joined(separator: "\n")
            .replacingOccurrences(of: "\n{3,}", with: "\n\n", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func serializeLine(_ text: NSAttributedString, range: NSRange, raw: String) -> String {
        var prefix = ""
        var prefixLen = 0
        if raw.hasPrefix("• ") { prefix = "- "; prefixLen = 2 }
        else if case .number(let n) = lineKind(raw).0, raw.hasPrefix("\(n). ") { prefix = "\(n). "; prefixLen = ("\(n). " as NSString).length }
        let body = NSRange(location: range.location + prefixLen, length: max(0, range.length - prefixLen))
        var s = ""
        let ns = text.string as NSString
        text.enumerateAttributes(in: body) { a, r, _ in
            var t = escape(ns.substring(with: r))
            let font = a[.font] as? UIFont
            let bold = font.map { $0.fontName.localizedCaseInsensitiveContains("bold") || $0.fontDescriptor.symbolicTraits.contains(.traitBold) } ?? false
            let italic = ((a[.obliqueness] as? NSNumber)?.doubleValue ?? 0) > 0 || (font?.fontDescriptor.symbolicTraits.contains(.traitItalic) ?? false)
            if italic { t = wrap(t, "*") }
            if bold { t = wrap(t, "**") }
            let href = (a[.link] as? URL)?.absoluteString ?? (a[.link] as? String)
            if let href, safeURL(href) != nil, !t.trimmingCharacters(in: .whitespaces).isEmpty { t = "[\(t)](\(href))" }
            s += t
        }
        // Leere Listenpunkte nicht speichern
        if !prefix.isEmpty && s.trimmingCharacters(in: .whitespaces).isEmpty { return "" }
        return prefix + s
    }

    private static func escape(_ s: String) -> String {
        var out = ""
        for ch in s {
            if "\\*[]()".contains(ch) { out.append("\\") }
            out.append(ch)
        }
        return out
    }

    private static func wrap(_ inner: String, _ mark: String) -> String {
        let lead = inner.prefix(while: { $0 == " " })
        let rest = inner.dropFirst(lead.count)
        let trailCount = rest.reversed().prefix(while: { $0 == " " }).count
        let core = rest.dropLast(trailCount)
        guard !core.isEmpty else { return inner }
        return "\(lead)\(mark)\(core)\(mark)\(String(repeating: " ", count: trailCount))"
    }

    /// Klartext ohne Auszeichnung (z. B. für Vorschauen)
    static func plain(_ markup: String) -> String { attributed(markup).string }
}

// MARK: - Anzeige

/// Zeigt formatierten Text: Absätze, Aufzählungen, fett, kursiv, Links (tippbar).
struct RichTextBlock: View {
    var text: String
    var font: Font = .wr(.body)
    var color: Color = .ink2

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, b in
                switch b {
                case .paragraph(let lines):
                    inline(lines.joined(separator: "\n"))
                case .list(let items):
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(Array(items.enumerated()), id: \.offset) { _, it in
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                Text(it.marker).font(font).foregroundStyle(Color.muted).monospacedDigit()
                                inline(it.text)
                            }
                        }
                    }
                }
            }
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    private enum Block { case paragraph([String]), list([(marker: String, text: String)]) }

    private var blocks: [Block] {
        var out: [Block] = []
        var para: [String] = []
        var list: [(marker: String, text: String)] = []
        func flushPara() { if !para.isEmpty { out.append(.paragraph(para)) }; para = [] }
        func flushList() { if !list.isEmpty { out.append(.list(list)) }; list = [] }
        for line in text.replacingOccurrences(of: "\r\n", with: "\n").components(separatedBy: "\n") {
            let (kind, rest) = RichMarkup.lineKind(line)
            switch kind {
            case .bullet: flushPara(); list.append((marker: "•", text: rest))
            case .number(let n): flushPara(); list.append((marker: "\(n).", text: rest))
            case .text:
                flushList()
                if line.trimmingCharacters(in: .whitespaces).isEmpty { flushPara() } else { para.append(line) }
            }
        }
        flushPara(); flushList()
        return out
    }

    private func inline(_ s: String) -> some View {
        var a = AttributedString()
        for r in RichMarkup.parseInline(s) {
            var part = AttributedString(r.text)
            if r.bold && r.italic { part.font = font.bold().italic() }
            else if r.bold { part.font = font.bold() }
            else if r.italic { part.font = font.italic() }
            if let l = r.link { part.link = l; part.foregroundColor = Color.moss; part.underlineStyle = Text.LineStyle.single }
            a += part
        }
        return Text(a).font(font).foregroundStyle(color).tint(Color.moss).fixedSize(horizontal: false, vertical: true)
    }
}

// MARK: - Editor (WYSIWYG)

/// Hält den UITextView des Editors für die Werkzeugleiste.
@MainActor final class RichTextController {
    weak var textView: UITextView?
    var onEdit: (() -> Void)?

    private func isBold(_ a: [NSAttributedString.Key: Any]) -> Bool { (a[.font] as? UIFont)?.fontName.localizedCaseInsensitiveContains("bold") == true }
    private func isItalic(_ a: [NSAttributedString.Key: Any]) -> Bool { ((a[.obliqueness] as? NSNumber)?.doubleValue ?? 0) > 0 }

    func toggleBold() {
        toggle(isOn: isBold, on: { $0[.font] = RichMarkup.boldFont() }, off: { $0[.font] = RichMarkup.baseFont() })
    }

    func toggleItalic() {
        toggle(isOn: isItalic, on: { $0[.obliqueness] = RichMarkup.italicSlant }, off: { $0.removeValue(forKey: .obliqueness) })
    }

    private func toggle(isOn: ([NSAttributedString.Key: Any]) -> Bool, on: (inout [NSAttributedString.Key: Any]) -> Void, off: (inout [NSAttributedString.Key: Any]) -> Void) {
        guard let tv = textView else { return }
        let r = tv.selectedRange
        if r.length == 0 {
            var t = tv.typingAttributes
            if isOn(t) { off(&t) } else { on(&t) }
            tv.typingAttributes = t
            return
        }
        var all = true
        tv.textStorage.enumerateAttributes(in: r) { a, _, stop in
            if !isOn(a) { all = false; stop.pointee = true }
        }
        tv.textStorage.beginEditing()
        tv.textStorage.enumerateAttributes(in: r) { a, sub, _ in
            var n = a
            if all { off(&n) } else { on(&n) }
            tv.textStorage.setAttributes(n, range: sub)
        }
        tv.textStorage.endEditing()
        tv.selectedRange = r
        onEdit?()
    }

    /// Aufzählung für die markierten Zeilen ein- bzw. ausschalten
    func toggleList() {
        guard let tv = textView else { return }
        let ns = tv.textStorage.string as NSString
        let lines = ns.lineRange(for: tv.selectedRange)
        var parts = ns.substring(with: lines).components(separatedBy: "\n")
        if parts.count > 1, parts.last == "" { parts.removeLast() }
        let bullet = NSAttributedString(string: "• ", attributes: RichMarkup.attrs())
        let allBullets = parts.allSatisfy { $0.hasPrefix("• ") }
        var starts: [Int] = []
        var off = lines.location
        for p in parts { starts.append(off); off += (p as NSString).length + 1 }
        tv.textStorage.beginEditing()
        for (idx, start) in starts.enumerated().reversed() {
            if allBullets { tv.textStorage.replaceCharacters(in: NSRange(location: start, length: 2), with: "") }
            else if !parts[idx].hasPrefix("• ") { tv.textStorage.insert(bullet, at: start) }
        }
        tv.textStorage.endEditing()
        // Cursor ans Ende der ersten bearbeiteten Zeile
        let after = tv.textStorage.string as NSString
        let first = after.lineRange(for: NSRange(location: min(lines.location, after.length), length: 0))
        let endsWithBreak = first.length > 0 && after.substring(with: NSRange(location: first.location + first.length - 1, length: 1)) == "\n"
        tv.selectedRange = NSRange(location: first.location + first.length - (endsWithBreak ? 1 : 0), length: 0)
        tv.typingAttributes = RichMarkup.attrs()
        onEdit?()
    }

    /// Markierten Text verlinken; ohne Markierung wird die Adresse eingefügt
    @discardableResult func addLink(_ raw: String) -> Bool {
        let s = raw.trimmingCharacters(in: .whitespaces)
        let candidate = s.lowercased().hasPrefix("http") || s.hasPrefix("/") || s.lowercased().hasPrefix("mailto:") ? s : "https://\(s)"
        guard let tv = textView, let url = RichMarkup.safeURL(candidate) else { return false }
        var r = tv.selectedRange
        if r.length == 0 {
            tv.textStorage.insert(NSAttributedString(string: s, attributes: RichMarkup.attrs()), at: r.location)
            r = NSRange(location: r.location, length: (s as NSString).length)
        }
        tv.textStorage.addAttribute(.link, value: url, range: r)
        tv.selectedRange = NSRange(location: r.location + r.length, length: 0)
        tv.typingAttributes = RichMarkup.attrs()
        onEdit?()
        return true
    }
}

struct RichTextView: UIViewRepresentable {
    @Binding var markup: String
    var controller: RichTextController
    var minHeight: CGFloat

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> UITextView {
        let tv = UITextView()
        tv.backgroundColor = .clear
        tv.isScrollEnabled = false
        tv.textContainerInset = UIEdgeInsets(top: 8, left: 0, bottom: 8, right: 0)
        tv.textContainer.lineFragmentPadding = 0
        // Nur unsere Formate (fett, kursiv, Liste, Link) – das System-Menü bietet sonst Unterstreichen u. ä.
        tv.allowsEditingTextAttributes = false
        tv.adjustsFontForContentSizeCategory = true
        tv.linkTextAttributes = [.foregroundColor: UIColor(Color.moss), .underlineStyle: NSUnderlineStyle.single.rawValue]
        tv.attributedText = RichMarkup.attributed(markup)
        tv.typingAttributes = RichMarkup.attrs()
        tv.delegate = context.coordinator
        tv.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        controller.textView = tv
        controller.onEdit = { [weak coordinator = context.coordinator] in coordinator?.push() }
        context.coordinator.lastMarkup = markup
        return tv
    }

    func updateUIView(_ tv: UITextView, context: Context) {
        context.coordinator.parent = self
        // Nur Änderungen von aussen übernehmen (Laden) – eigene Eingaben nicht neu setzen (Cursor bleibt)
        if markup != context.coordinator.lastMarkup {
            tv.attributedText = RichMarkup.attributed(markup)
            tv.typingAttributes = RichMarkup.attrs()
            context.coordinator.lastMarkup = markup
        }
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: UITextView, context: Context) -> CGSize? {
        let w = proposal.width ?? uiView.bounds.width
        guard w > 0 else { return nil }
        let s = uiView.sizeThatFits(CGSize(width: w, height: .greatestFiniteMagnitude))
        return CGSize(width: w, height: max(s.height, minHeight))
    }

    @MainActor final class Coordinator: NSObject, UITextViewDelegate {
        var parent: RichTextView
        var lastMarkup = ""

        init(_ parent: RichTextView) { self.parent = parent }

        func push() {
            guard let tv = parent.controller.textView else { return }
            let m = RichMarkup.markup(from: tv.attributedText)
            lastMarkup = m
            if parent.markup != m { parent.markup = m }
            tv.invalidateIntrinsicContentSize()
        }

        func textViewDidChange(_ textView: UITextView) { push() }

        /// Listen fortsetzen: Zeilenumbruch in einem Punkt beginnt den nächsten; leerer Punkt beendet die Liste
        func textView(_ tv: UITextView, shouldChangeTextIn range: NSRange, replacementText text: String) -> Bool {
            guard text == "\n" else { return true }
            let ns = tv.textStorage.string as NSString
            let lineRange = ns.lineRange(for: NSRange(location: range.location, length: 0))
            let line = ns.substring(with: lineRange).trimmingCharacters(in: .newlines)
            var next: String?
            if line.hasPrefix("• ") { next = line == "• " ? nil : "• " }
            else if case .number(let n) = RichMarkup.lineKind(line).0, line.hasPrefix("\(n). ") { next = line == "\(n). " ? nil : "\(n + 1). " }
            else { return true }
            if let next {
                let ins = NSAttributedString(string: "\n" + next, attributes: RichMarkup.attrs())
                tv.textStorage.replaceCharacters(in: range, with: ins)
                tv.selectedRange = NSRange(location: range.location + ins.length, length: 0)
            } else {
                // Leerer Punkt: Markierung entfernen und die Liste beenden
                let markerLen = (line as NSString).length
                tv.textStorage.replaceCharacters(in: NSRange(location: lineRange.location, length: markerLen), with: "")
                tv.selectedRange = NSRange(location: lineRange.location, length: 0)
            }
            tv.typingAttributes = RichMarkup.attrs()
            push()
            return false
        }
    }
}

/// Editor-Feld mit Werkzeugleiste (Fett, Kursiv, Aufzählung, Link) – für Formulare.
struct RichTextField: View {
    var placeholder: String
    @Binding var markup: String
    var minHeight: CGFloat = 88

    @State private var controller = RichTextController()
    @State private var askLink = false
    @State private var linkText = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 2) {
                tool("bold", "Fett") { controller.toggleBold() }
                tool("italic", "Kursiv") { controller.toggleItalic() }
                tool("list.bullet", "Aufzählung") { controller.toggleList() }
                tool("link", "Link einfügen") { linkText = ""; askLink = true }
                Spacer(minLength: 0)
            }
            ZStack(alignment: .topLeading) {
                if markup.isEmpty {
                    Text(placeholder)
                        .font(.wr(.body))
                        .foregroundStyle(Color.muted)
                        .padding(.top, 8)
                        .allowsHitTesting(false)
                        .accessibilityHidden(true)
                }
                RichTextView(markup: $markup, controller: controller, minHeight: minHeight)
                    .accessibilityLabel(placeholder)
            }
            // Als Eingabefeld erkennbar: eigene Fläche mit Rahmen, damit es nicht wie ein Hinweis wirkt
            .padding(.horizontal, 10)
            .padding(.vertical, 2)
            .background(Color.sunken.opacity(0.6), in: .rect(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Color.line, lineWidth: 1))
        }
        .alert("Link einfügen", isPresented: $askLink) {
            TextField("https://…", text: $linkText)
                .textInputAutocapitalization(.never)
                .keyboardType(.URL)
                .autocorrectionDisabled()
            Button("Einfügen") { controller.addLink(linkText) }
            Button("Abbrechen", role: .cancel) {}
        } message: {
            Text("Markierter Text wird zum Link – ohne Markierung wird die Adresse eingefügt.")
        }
    }

    private func tool(_ symbol: String, _ label: String, action: @escaping () -> Void) -> some View {
        Button {
            Haptics.selection()
            action()
        } label: {
            Image(systemName: symbol)
                .font(.system(size: 15, weight: .semibold))
                .frame(width: 36, height: 30)
                .contentShape(.rect)
        }
        // In Form-Zeilen sonst: ein Tipp löst alle Buttons der Zeile aus
        .buttonStyle(.borderless)
        .foregroundStyle(Color.ink2)
        .accessibilityLabel(label)
    }
}
