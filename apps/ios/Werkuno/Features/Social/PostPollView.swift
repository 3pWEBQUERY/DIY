import SwiftUI

/// Umfrage an einem Beitrag: abstimmen (eine oder mehrere Antworten, einmalig), danach bzw. nach
/// Ende die Ergebnisse. `POST /posts/:id/poll { optionIds }` liefert die aktualisierte Umfrage.
struct PostPollView: View {
    var postId: String
    var poll: PostItem.Poll

    @Environment(AppState.self) private var app
    /// Stand nach der eigenen Abstimmung (bis der Beitrag neu geladen wird)
    @State private var updated: PostItem.Poll?
    @State private var selection: Set<String> = []
    @State private var voting = false

    private var current: PostItem.Poll { updated ?? poll }

    var body: some View {
        let p = current
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "chart.bar.xaxis").font(.wr(.caption))
                SpecLabel(p.isMultiple ? "Umfrage · Mehrfachauswahl" : "Umfrage", color: .moss)
            }
            .foregroundStyle(Color.moss)

            if p.revealsResults {
                ForEach(p.options) { o in result(o, in: p) }
            } else {
                ForEach(p.options) { o in choice(o, in: p) }
                if canVote(p) {
                    Button { Task { await vote() } } label: {
                        ZStack {
                            if voting { ProgressView().controlSize(.small) } else { Text("Abstimmen").font(.wr(.subheadline, .semibold)) }
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.glassProminent)
                    .tint(.moss)
                    .disabled(selection.isEmpty || voting)
                    .padding(.top, 2)
                }
            }

            Text(footer(p))
                .font(.wr(.caption))
                .foregroundStyle(Color.muted)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .sunkenSurface()
        .onChange(of: poll) { _, _ in
            // Beitrag neu geladen → Serverstand gilt wieder
            updated = nil
            selection = []
        }
    }

    // MARK: Auswahl

    private func choice(_ o: PostItem.Poll.Option, in p: PostItem.Poll) -> some View {
        let selected = selection.contains(o.id)
        return Button {
            Haptics.selection()
            if p.isMultiple {
                if selected { selection.remove(o.id) } else { selection.insert(o.id) }
            } else {
                selection = selected ? [] : [o.id]
            }
        } label: {
            HStack(spacing: 10) {
                Image(systemName: p.isMultiple ? (selected ? "checkmark.square.fill" : "square") : (selected ? "largecircle.fill.circle" : "circle"))
                    .foregroundStyle(selected ? Color.moss : Color.muted)
                Text(o.label)
                    .font(.wr(.subheadline))
                    .foregroundStyle(Color.ink)
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(Color.card, in: .rect(cornerRadius: Radius.small, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Radius.small, style: .continuous).strokeBorder(selected ? Color.moss : Color.line, lineWidth: selected ? 1.2 : 0.75))
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .disabled(!canVote(p) || voting)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    // MARK: Ergebnisse

    private func result(_ o: PostItem.Poll.Option, in p: PostItem.Poll) -> some View {
        let votes = o.votes ?? 0
        let total = max(p.voterCount ?? 0, 1)
        let share = min(1, Double(votes) / Double(total))
        let mine = (p.viewerVotes ?? []).contains(o.id)
        let leading = votes > 0 && votes == (p.options.map { $0.votes ?? 0 }.max() ?? 0)
        return VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Text(o.label)
                    .font(.wr(.subheadline, leading ? .semibold : .regular))
                    .foregroundStyle(Color.ink)
                    .multilineTextAlignment(.leading)
                if mine {
                    Image(systemName: "checkmark.circle.fill").font(.wr(.caption)).foregroundStyle(Color.moss)
                        .accessibilityLabel("Deine Stimme")
                }
                Spacer(minLength: 6)
                Text(o.votes == nil ? "–" : "\(Int((share * 100).rounded())) %")
                    .font(.wr(.footnote, .semibold))
                    .monospacedDigit()
                    .foregroundStyle(Color.ink2)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.line.opacity(0.6))
                    Capsule().fill(mine || leading ? Color.moss : Color.muted.opacity(0.55))
                        .frame(width: max(0, geo.size.width * share))
                }
            }
            .frame(height: 6)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(o.label): \(o.votes == nil ? "kein Ergebnis" : Fmt.plural(votes, "Stimme", "Stimmen"))\(mine ? ", deine Stimme" : "")")
    }

    // MARK: Hilfen

    private func canVote(_ p: PostItem.Poll) -> Bool {
        p.id != nil && !p.isEnded && !p.hasVoted && !app.isGuest
    }

    private func footer(_ p: PostItem.Poll) -> String {
        var parts = [Fmt.plural(p.voterCount ?? 0, "Stimme", "Stimmen")]
        if p.isEnded {
            parts.append("Beendet")
        } else if let end = p.endsAt {
            parts.append(Self.remaining(until: end))
        }
        if app.isGuest && !p.isEnded { parts.append("Melde dich an, um abzustimmen") }
        else if !p.revealsResults { parts.append("Ergebnisse nach deiner Stimme") }
        return parts.joined(separator: " · ")
    }

    static func remaining(until end: Date) -> String {
        let s = end.timeIntervalSinceNow
        if s <= 0 { return "Beendet" }
        if s < 3600 { return "noch \(max(1, Int(s / 60))) Min." }
        if s < 86400 { return "noch \(Int(s / 3600)) Std." }
        let d = Int(s / 86400)
        return d == 1 ? "noch 1 Tag" : "noch \(d) Tage"
    }

    private func vote() async {
        guard !selection.isEmpty, !voting else { return }
        voting = true
        defer { voting = false }
        let ids = current.options.map(\.id).filter { selection.contains($0) }
        do {
            let r: PostItem.Poll? = try await APIClient.shared.post("/posts/\(postId)/poll", ["optionIds": JSONValue.from(ids)])
            Haptics.success()
            if let r, r.isUsable {
                withAnimation(.snappy) { updated = r }
            }
            selection = []
        } catch {
            app.show(error: error)
        }
    }
}
