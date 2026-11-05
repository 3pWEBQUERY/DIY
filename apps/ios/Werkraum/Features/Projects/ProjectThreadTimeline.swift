import SwiftUI

/// Der Projektfaden als vertikale Zeitleiste: jeder Journal-Eintrag ein Knoten auf der Linie.
/// Meilensteine sind grosse Terrakotta-Knoten, Probleme Ocker-Ringe, Einträge Moos-Punkte.
struct ProjectThreadTimeline: View {
    var entries: [ProjectJournalEntry]
    var status: String
    var startedAt: Date?
    var completedAt: Date?
    var ownerId: String
    var color: Color
    var highlighted: Int?
    var onSelect: (Int) -> Void
    var onDelete: (ProjectJournalEntry) -> Void

    @Environment(Router.self) private var router

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            capRow(title: "Begonnen", detail: Fmt.date(startedAt, style: .long), symbol: nil, done: true)
            ForEach(Array(entries.enumerated()), id: \.element.id) { i, e in
                ProjectThreadEntryRow(
                    entry: e,
                    index: i,
                    color: color,
                    highlighted: highlighted == i,
                    showAuthor: e.author?.id != nil && e.author?.id != ownerId,
                    onOpenPost: { router.open(.post(id: $0)) },
                    onDelete: { onDelete(e) }
                )
                .id("journal-\(e.id)")
                .contentShape(.rect)
                .onTapGesture { onSelect(i) }
            }
            terminal
        }
    }

    @ViewBuilder private var terminal: some View {
        switch status {
        case "COMPLETED":
            capRow(title: "Faden abgeschlossen", detail: completedAt.map { "Fertig gebaut · \(Fmt.date($0, style: .long))" } ?? "Fertig gebaut.", symbol: "checkmark", done: true, last: true)
        case "PAUSED":
            capRow(title: "Faden ruht", detail: "Pausiert – es geht später weiter.", symbol: "pause.fill", done: false, last: true)
        case "ARCHIVED":
            capRow(title: "Archiviert", detail: nil, symbol: "archivebox.fill", done: false, last: true)
        default:
            capRow(title: "Faden läuft weiter", detail: L.projectStatus(status), symbol: nil, done: false, last: true)
        }
    }

    private func capRow(title: String, detail: String?, symbol: String?, done: Bool, last: Bool = false) -> some View {
        HStack(alignment: .top, spacing: 14) {
            ZStack {
                if let symbol {
                    Circle().fill(done ? Color.moss : Color.sunken).frame(width: 24, height: 24)
                    Image(systemName: symbol).font(.system(size: 10, weight: .bold)).foregroundStyle(done ? Color.paper : Color.muted)
                } else {
                    Circle().fill(Color.paper).frame(width: 16, height: 16)
                    Circle().strokeBorder(done ? color : Color.lineStrong, style: StrokeStyle(lineWidth: 2, dash: done ? [] : [3, 3])).frame(width: 16, height: 16)
                }
            }
            .frame(width: 28, height: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(last && !done ? Color.muted : Color.ink)
                if let detail, !detail.isEmpty { Text(detail).font(.caption).foregroundStyle(Color.muted) }
            }
            .padding(.top, 4)
            Spacer(minLength: 0)
        }
        .padding(.bottom, last ? 0 : 18)
        .background(alignment: .topLeading) {
            if last {
                Rectangle().fill(color.opacity(0.25)).frame(width: 2, height: 14).padding(.leading, 13)
            } else {
                Rectangle().fill(color.opacity(0.5)).frame(width: 2).padding(.top, 14).padding(.leading, 13)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

private struct ProjectThreadEntryRow: View {
    var entry: ProjectJournalEntry
    var index: Int
    var color: Color
    var highlighted: Bool
    var showAuthor: Bool
    var onOpenPost: (String) -> Void
    var onDelete: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            node.frame(width: 28)
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    SpecLabel(metaLine, color: highlighted ? color : .muted)
                    Spacer(minLength: 4)
                    if entry.canDelete == true {
                        Menu {
                            Button("Eintrag löschen", systemImage: "trash", role: .destructive, action: onDelete)
                        } label: {
                            Image(systemName: "ellipsis").font(.footnote.weight(.semibold)).foregroundStyle(Color.muted).frame(width: 32, height: 28).contentShape(.rect)
                        }
                        .accessibilityLabel("Aktionen zum Eintrag")
                    }
                }
                if let m = entry.milestone?.nilIfEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        SpecLabel("Meilenstein", color: .clay)
                        Text(m).font(.titleSerif).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
                    }
                }
                if showAuthor, let a = entry.author {
                    HStack(spacing: 6) {
                        AvatarView(url: a.avatarUrl, name: a.displayName ?? "", size: 18)
                        Text(a.displayName ?? "").font(.caption.weight(.medium)).foregroundStyle(Color.ink2)
                    }
                }
                Text(entry.body).font(.body).foregroundStyle(Color.ink2).fixedSize(horizontal: false, vertical: true).textSelection(.enabled)
                if let p = entry.problem?.nilIfEmpty {
                    callout(label: "Problem", text: p, tint: .ochre, symbol: "exclamationmark.triangle.fill")
                    if let s = entry.solution?.nilIfEmpty {
                        callout(label: "Lösung", text: s, tint: .moss, symbol: "checkmark.circle.fill")
                    } else {
                        Text("Noch offen – weisst du Rat? Schreib es in die Fragen.").font(.caption).foregroundStyle(Color.muted)
                    }
                } else if let s = entry.solution?.nilIfEmpty {
                    callout(label: "Lösung", text: s, tint: .moss, symbol: "checkmark.circle.fill")
                }
                if let media = entry.media, !media.isEmpty {
                    MediaStrip(media: media.map(\.asItem))
                }
                if let pid = entry.postId {
                    Button { onOpenPost(pid) } label: {
                        Label("Im Feed geteilt", systemImage: "bubble.left.and.text.bubble.right").font(.caption.weight(.semibold)).foregroundStyle(Color.moss)
                    }
                    .buttonStyle(.plain)
                    .frame(minHeight: 32)
                }
            }
            .padding(.bottom, 26)
        }
        .background(alignment: .topLeading) {
            Rectangle().fill(color.opacity(0.5)).frame(width: 2).padding(.leading, 13)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(accessibilityTitle)
    }

    private var metaLine: String {
        var parts = [Fmt.date(entry.happenedAt)]
        if let m = entry.minutes, m > 0 { parts.append(Fmt.minutes(m)) }
        return parts.filter { !$0.isEmpty }.joined(separator: " · ")
    }

    private var accessibilityTitle: String {
        let kind = entry.milestone?.nilIfEmpty != nil ? "Meilenstein" : entry.problem?.nilIfEmpty != nil ? "Problem" : "Eintrag"
        return "\(kind) \(index + 1), \(Fmt.date(entry.happenedAt))"
    }

    @ViewBuilder private var node: some View {
        let scale: CGFloat = highlighted ? 1.18 : 1
        ZStack {
            if highlighted { Circle().fill(color.opacity(0.16)).frame(width: 30, height: 30) }
            switch entry.nodeKind {
            case "milestone":
                Circle().fill(Color.clay).frame(width: 24, height: 24)
                Image(systemName: "flag.fill").font(.system(size: 10, weight: .bold)).foregroundStyle(Color.paper)
            case "problem":
                Circle().fill(Color.paper).frame(width: 20, height: 20)
                Circle().strokeBorder(Color.ochre, lineWidth: 3).frame(width: 20, height: 20)
            default:
                Circle().fill(Color.paper).frame(width: 16, height: 16)
                Circle().fill(Color.moss).frame(width: 11, height: 11)
            }
        }
        .frame(width: 28, height: 28)
        .scaleEffect(scale)
        .animation(.spring(duration: 0.35, bounce: 0.4), value: highlighted)
        .accessibilityHidden(true)
    }

    private func callout(label: String, text: String, tint: Color, symbol: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Label(label, systemImage: symbol).font(.caption.weight(.semibold)).foregroundStyle(tint)
            Text(text).font(.subheadline).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(tint.opacity(0.1), in: .rect(cornerRadius: Radius.inner, style: .continuous))
        .overlay(alignment: .leading) { Rectangle().fill(tint).frame(width: 2.5) }
        .clipShape(.rect(cornerRadius: Radius.inner, style: .continuous))
    }
}
