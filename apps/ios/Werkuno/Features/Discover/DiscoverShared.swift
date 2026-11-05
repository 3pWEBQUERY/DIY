import SwiftUI

// Gemeinsame Bausteine des Bereichs Entdecken (nur hier verwendet; Präfix gegen Kollisionen).

// MARK: - Suchfeld (inline)

struct DiscoverSearchField: View {
    var prompt: String
    @Binding var text: String
    var onSubmit: () -> Void = {}
    @FocusState private var focused: Bool

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").foregroundStyle(Color.muted)
            TextField(prompt, text: $text)
                .focused($focused)
                .submitLabel(.search)
                .onSubmit(onSubmit)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
            if !text.isEmpty {
                Button { text = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(Color.muted) }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Suchtext löschen")
            }
        }
        .padding(.horizontal, 14)
        .frame(minHeight: 44)
        .background(Color.sunken, in: Capsule())
    }
}

// MARK: - Horizontales Karussell

struct DiscoverCarousel<Item: Identifiable, Cell: View>: View {
    var items: [Item]
    var width: CGFloat
    var spacing: CGFloat = 12
    @ViewBuilder var cell: (Item) -> Cell

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            LazyHStack(alignment: .top, spacing: spacing) {
                ForEach(items) { item in cell(item).frame(width: width) }
            }
            .scrollTargetLayout()
            .padding(.horizontal, Space.gutter)
        }
        .scrollTargetBehavior(.viewAligned)
        .scrollClipDisabled()
    }
}

// MARK: - „Alle anzeigen“-Knopf für Abschnittsköpfe

struct DiscoverMoreButton: View {
    var title = "Alle"
    var action: () -> Void
    var body: some View {
        Button(action: action) {
            HStack(spacing: 3) {
                Text(title)
                Image(systemName: "chevron.right").font(.caption2.weight(.bold))
            }
            .font(.footnote.weight(.semibold))
            .foregroundStyle(Color.moss)
            .frame(minHeight: 44)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Neu laden, wenn ein Editor-Sheet geschlossen wird

struct DiscoverReloadOnSheetClose: ViewModifier {
    @Environment(Router.self) private var router
    var action: () async -> Void
    func body(content: Content) -> some View {
        content.onChange(of: router.sheet) { old, new in
            if old != nil && new == nil { Task { await action() } }
        }
    }
}

extension View {
    func reloadWhenSheetCloses(_ action: @escaping () async -> Void) -> some View {
        modifier(DiscoverReloadOnSheetClose(action: action))
    }
}

// MARK: - Kategorie-Glyphe als Kachel

struct DiscoverCategoryTile: View {
    var category: Category
    var selected = false

    var body: some View {
        let color = CategoryPalette.color(for: category.slug)
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top) {
                Image(systemName: CategoryPalette.symbol(for: category.glyph))
                    .font(.title3.weight(.medium))
                    .foregroundStyle(color)
                    .frame(width: 40, height: 40)
                    .background(Color.card.opacity(0.85), in: Circle())
                Spacer()
                if let n = category.projectCount {
                    Text(Fmt.number(n)).font(.specLarge).foregroundStyle(color).monospacedDigit()
                }
            }
            Spacer(minLength: 14)
            Text(category.name)
                .font(.system(.subheadline, design: .serif).weight(.semibold))
                .foregroundStyle(Color.ink)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
            SpecLabel(Fmt.plural(category.projectCount ?? 0, "Projekt", "Projekte"), color: color)
        }
        .padding(12)
        .frame(maxWidth: .infinity, minHeight: 128, alignment: .leading)
        .background {
            ThreadPlate(seed: category.slug, category: category.slug, glyph: category.glyph, showLabel: false, lineWidth: 1.1)
                .opacity(0.75)
        }
        .clipShape(.rect(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(selected ? color : Color.line, lineWidth: selected ? 1.5 : 0.75))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(category.name), \(Fmt.plural(category.projectCount ?? 0, "Projekt", "Projekte"))")
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    }
}

// MARK: - Glas-Chips mit Kategorie-Glyphen

struct DiscoverCategoryChips: View {
    var categories: [Category]
    @Binding var selection: String?
    var allLabel = "Alle"

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            GlassEffectContainer(spacing: 6) {
                HStack(spacing: 6) {
                    chip(nil, label: allLabel, symbol: "sparkles", color: .ink)
                    ForEach(categories) { c in
                        chip(c.slug, label: c.short, symbol: CategoryPalette.symbol(for: c.glyph), color: CategoryPalette.color(for: c.slug))
                    }
                }
                .padding(.horizontal, Space.gutter)
                .padding(.vertical, 4)
            }
        }
    }

    private func chip(_ slug: String?, label: String, symbol: String, color: Color) -> some View {
        let on = selection == slug
        return Button {
            Haptics.selection()
            withAnimation(.snappy) { selection = slug }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: symbol).font(.footnote.weight(.semibold))
                Text(label).font(.subheadline.weight(on ? .semibold : .regular))
            }
            .foregroundStyle(on ? Color.paper : Color.ink)
            .padding(.horizontal, 13).padding(.vertical, 9)
        }
        .buttonStyle(.plain)
        .glassEffect(on ? .regular.tint(color).interactive() : .regular.interactive(), in: Capsule())
        .accessibilityLabel(label)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

// MARK: - Magazin-Zeile (Artikel kompakt, Serifen)

struct BlogMagazineRow: View {
    var article: ArticleCard
    var showAuthor = true
    @Environment(Router.self) private var router

    var body: some View {
        Button {
            if let h = article.author?.handle { router.open(.article(handle: h, slug: article.slug)) } else { router.open(href: article.href) }
        } label: {
            HStack(alignment: .top, spacing: 14) {
                VStack(alignment: .leading, spacing: 6) {
                    if let c = article.category?.name { SpecLabel(c, color: .clay) }
                    Text(article.title)
                        .font(.system(.headline, design: .serif))
                        .foregroundStyle(Color.ink)
                        .multilineTextAlignment(.leading)
                        .lineLimit(3)
                    if let dek = article.dek?.nilIfEmpty {
                        Text(dek).font(.footnote).foregroundStyle(Color.muted).lineLimit(2).multilineTextAlignment(.leading)
                    }
                    HStack(spacing: 6) {
                        if showAuthor, let a = article.author { Text(a.displayName).foregroundStyle(Color.ink2) }
                        if let m = article.readingMinutes { Text("\(m) Min.") }
                        Text(Fmt.date(article.publishedAt))
                    }
                    .font(.caption)
                    .foregroundStyle(Color.muted)
                }
                Spacer(minLength: 0)
                CoverView(url: article.coverUrl, seed: article.id, category: nil, showLabel: false)
                    .frame(width: 86, height: 86)
                    .clipShape(.rect(cornerRadius: Radius.small, style: .continuous))
            }
            .padding(.vertical, 14)
            .hairline()
            .contentShape(.rect)
        }
        .buttonStyle(.pressable)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Artikel lesen")
    }
}

// MARK: - Zahl der aktiven Filter

struct DiscoverBadge: View {
    var count: Int
    var body: some View {
        if count > 0 {
            Text("\(count)")
                .font(.caption2.weight(.bold)).monospacedDigit()
                .foregroundStyle(Color.paper)
                .frame(minWidth: 16, minHeight: 16)
                .background(Color.clay, in: Circle())
        }
    }
}

// MARK: - Fehlertext für Felder

struct DiscoverFieldError: View {
    var message: String?
    var body: some View {
        if let message {
            Text(message).font(.caption).foregroundStyle(Color.danger)
        }
    }
}
