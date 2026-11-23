import SwiftUI

/// „Später veröffentlichen“ (Creator Pro) für Projekte und Anleitungen.
/// Ohne Pro: kurzer Hinweis statt Schalter. Frühestens in 5 Minuten, höchstens in einem Jahr.
struct PublishScheduleSection: View {
    var isPro: Bool
    @Binding var enabled: Bool
    @Binding var date: Date
    /// „das Projekt“ / „die Anleitung“
    var noun: String
    var error: String?
    @State private var showPro = false

    private var range: ClosedRange<Date> {
        let now = Date()
        return now.addingTimeInterval(6 * 60)...now.addingTimeInterval(365 * 86_400)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if isPro {
                Toggle(isOn: $enabled.animation(.snappy)) {
                    Label("Später veröffentlichen", systemImage: "calendar.badge.clock")
                        .font(.wr(.subheadline, .semibold))
                }
                .tint(.moss)
                if enabled {
                    DatePicker("Veröffentlichen am", selection: $date, in: range, displayedComponents: [.date, .hourAndMinute])
                        .font(.wr(.subheadline))
                    Text("Bis dahin bleibt \(noun) ein Entwurf und ist nur für dich sichtbar.")
                        .font(.wr(.footnote)).foregroundStyle(Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let error {
                    Text(error).font(.wr(.footnote)).foregroundStyle(Color.danger)
                }
            } else {
                Label("Zeitgesteuert veröffentlichen kannst du mit Creator Pro.", systemImage: "calendar.badge.clock")
                    .font(.wr(.footnote)).foregroundStyle(Color.muted)
                // Als Blatt: der Editor bleibt offen, Eingaben gehen nicht verloren
                Button { showPro = true } label: {
                    Label("Mit Creator Pro freischalten", systemImage: "arrow.right")
                        .font(.wr(.footnote, .semibold))
                        .foregroundStyle(Color.moss)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(14)
        .background(Color.card, in: .rect(cornerRadius: Radius.inner, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: Radius.inner, style: .continuous).strokeBorder(Color.line, lineWidth: 1)
        }
        .sheet(isPresented: $showPro) { ProFeatureSheet(feature: .kalender) }
    }

    /// Ausgangswert: morgen um 9 Uhr (lokale Zeit)
    static func defaultDate() -> Date {
        let cal = Calendar.current
        let tomorrow = cal.date(byAdding: .day, value: 1, to: Date()) ?? Date().addingTimeInterval(86_400)
        return cal.date(bySettingHour: 9, minute: 0, second: 0, of: tomorrow) ?? tomorrow
    }

    static func iso(_ d: Date) -> String { JSON.isoFormatter.string(from: d) }

    static func parse(_ s: String?) -> Date? {
        guard let s, !s.isEmpty else { return nil }
        return JSON.isoFormatter.date(from: s) ?? ISO8601DateFormatter().date(from: s)
    }
}
