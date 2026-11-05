import SwiftUI

/// Onboarding (PRD §8.2): Name & Handle → Interessen → Profil → Vorschläge → Feed. Jeder Schritt ist überspringbar.
struct OnboardingView: View {
    @Environment(AppState.self) private var app
    @State private var step = 0
    @State private var displayName = ""
    @State private var handle = ""
    @State private var adultConfirmed = true
    @State private var adult = false
    @State private var interests: [String] = []
    @State private var bio = ""
    @State private var region = ""
    @State private var avatarPath: String?
    @State private var suggestions: Suggestions?
    @State private var followed: Set<String> = []
    @State private var joined: Set<String> = []
    @State private var error: APIError?
    @State private var lastGlyph: String? = "loop"

    struct Suggestions: Decodable {
        struct Community: Decodable, Identifiable { var id: String; var slug: String; var name: String; var category: String?; var memberCount: Int?; var coverUrl: String? }
        var creators: [CreatorSuggestion]
        var communities: [Community]
    }

    private let steps = ["Du", "Interessen", "Profil", "Vorschläge"]

    var body: some View {
        VStack(spacing: 0) {
            header
            ThreeCanvas(scene: .glyph(lastGlyph, color: CategoryPalette.color(for: interests.last ?? "haekeln-stricken"), seed: interests.count + 1, spin: 0.3))
                .frame(height: step == 3 ? 120 : 210)
                .animation(.smooth, value: step)
            TabView(selection: $step) {
                nameStep.tag(0)
                interestsStep.tag(1)
                profileStep.tag(2)
                suggestionsStep.tag(3)
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .animation(.smooth, value: step)
            footer
        }
        .background(Color.paper.ignoresSafeArea())
        .task { await load() }
        .onChange(of: step) { _, s in if s == 3 { Task { await loadSuggestions() } } }
    }

    // MARK: Kopf & Fuss

    private var header: some View {
        HStack {
            Wordmark(size: 17)
            Spacer()
            HStack(spacing: 5) {
                ForEach(steps.indices, id: \.self) { i in
                    Capsule().fill(i <= step ? Color.moss : Color.line).frame(width: i == step ? 22 : 8, height: 5)
                }
            }
            .animation(.snappy, value: step)
            .accessibilityLabel("Schritt \(step + 1) von \(steps.count)")
            Spacer()
            Button("Überspringen") { Task { await skip() } }
                .font(.footnote.weight(.semibold))
                .buttonStyle(.glass)
        }
        .padding(.horizontal, Space.gutter)
        .padding(.top, 8)
    }

    private var footer: some View {
        VStack(spacing: 8) {
            if let error { NoticeView(tone: .danger, message: error.message).padding(.horizontal, Space.gutter) }
            HStack(spacing: 10) {
                if step > 0 {
                    Button { withAnimation { step -= 1 } } label: { Image(systemName: "chevron.left").frame(width: 24, height: 24) }
                        .buttonStyle(.glass).controlSize(.large)
                        .accessibilityLabel("Zurück")
                }
                AsyncButton {
                    if step < 3 { withAnimation { step += 1 } } else { await finish() }
                } label: {
                    Text(step < 3 ? "Weiter" : "Zum Feed").frame(maxWidth: .infinity)
                }
                .primaryButton()
                .disabled(step == 0 && (displayName.trimmed.isEmpty || handle.count < 3 || (!adultConfirmed && !adult)))
            }
            .padding(.horizontal, Space.gutter)
        }
        .padding(.bottom, 12)
    }

    // MARK: Schritte

    private var nameStep: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                PageTitle(kicker: "Schritt 1 · Du", title: "Wie sollen wir dich nennen?", subtitle: "Dein Anzeigename kann später geändert werden. Der Benutzername ist deine Adresse bei Werkuno.")
                AuthField(title: "Anzeigename", text: $displayName, error: error?.fields?["displayName"], content: .name)
                AuthField(title: "Benutzername", text: $handle, error: error?.fields?["handle"], prefix: "@", content: .username)
                    .onChange(of: handle) { _, v in handle = v.lowercased().replacingOccurrences(of: " ", with: "") }
                if !adultConfirmed {
                    Toggle("Ich bin mindestens 18 Jahre alt.", isOn: $adult).tint(.moss).padding(14).cardSurface()
                }
            }
            .padding(Space.gutter)
        }
    }

    private var interestsStep: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                PageTitle(kicker: "Schritt 2 · Interessen", title: "Woran arbeitest du gern?", subtitle: "Wir stellen deinen Feed danach zusammen. Du kannst das jederzeit ändern.")
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                    ForEach(app.activeCategories) { c in
                        let on = interests.contains(c.slug)
                        Button {
                            Haptics.selection()
                            withAnimation(.snappy) {
                                if on { interests.removeAll { $0 == c.slug } } else { interests.append(c.slug) }
                                lastGlyph = app.category(interests.last)?.glyph ?? "loop"
                            }
                        } label: {
                            HStack(spacing: 10) {
                                Image(systemName: CategoryPalette.symbol(for: c.glyph))
                                    .font(.body)
                                    .foregroundStyle(on ? Color.paper : CategoryPalette.color(for: c.slug))
                                    .frame(width: 34, height: 34)
                                    .background(on ? CategoryPalette.color(for: c.slug) : CategoryPalette.soft(for: c.slug), in: .rect(cornerRadius: 10, style: .continuous))
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(c.short).font(.subheadline.weight(.semibold)).foregroundStyle(Color.ink)
                                    if c.focus == true { Text("Schwerpunkt").font(.caption2).foregroundStyle(Color.moss) }
                                }
                                Spacer(minLength: 0)
                                Image(systemName: on ? "checkmark.circle.fill" : "circle").foregroundStyle(on ? Color.moss : Color.lineStrong)
                            }
                            .padding(10)
                            .background(on ? Color.mossSoft : Color.card, in: .rect(cornerRadius: Radius.inner, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: Radius.inner, style: .continuous).strokeBorder(on ? Color.moss : Color.line, lineWidth: on ? 1.2 : 0.75))
                        }
                        .buttonStyle(.pressable)
                        .accessibilityLabel(c.name)
                        .accessibilityAddTraits(on ? .isSelected : [])
                    }
                }
            }
            .padding(Space.gutter)
        }
    }

    private var profileStep: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                PageTitle(kicker: "Schritt 3 · Profil", title: "Zeig dich der Community", subtitle: "Optional – ein Bild und ein paar Worte helfen anderen, dich kennenzulernen.")
                HStack(spacing: 16) {
                    SingleImagePicker(onUploaded: { _, path in avatarPath = path }) {
                        ZStack(alignment: .bottomTrailing) {
                            AvatarView(url: avatarPath, name: displayName.isEmpty ? "Du" : displayName, size: 84, category: interests.first)
                            Image(systemName: "camera.fill").font(.caption).foregroundStyle(.white).padding(7).background(Color.moss, in: Circle())
                        }
                    }
                    .accessibilityLabel("Profilbild wählen")
                    VStack(alignment: .leading, spacing: 2) {
                        Text(displayName.isEmpty ? "Dein Name" : displayName).font(.titleSerif)
                        Text("@\(handle)").font(.footnote).foregroundStyle(Color.muted)
                    }
                }
                VStack(alignment: .leading, spacing: 5) {
                    Text("Kurzbiografie").font(.caption.weight(.semibold)).foregroundStyle(Color.muted)
                    TextField("Was machst du gern mit deinen Händen?", text: $bio, axis: .vertical)
                        .lineLimit(3...6)
                        .padding(14)
                        .background(Color.card, in: .rect(cornerRadius: Radius.inner, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: Radius.inner, style: .continuous).strokeBorder(Color.line, lineWidth: 0.75))
                    Text("\(bio.count)/300").font(.caption2).foregroundStyle(bio.count > 300 ? Color.danger : Color.muted)
                }
                AuthField(title: "Region (optional)", text: $region, error: nil, content: .addressCity)
            }
            .padding(Space.gutter)
        }
    }

    private var suggestionsStep: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                PageTitle(kicker: "Schritt 4 · Vorschläge", title: "Menschen & Gruppen für dich", subtitle: "Folge ersten Creatorn und tritt Communities bei – so ist dein Feed von Anfang an lebendig.")
                if let s = suggestions {
                    if !s.creators.isEmpty {
                        SectionHeader("Creator", number: "01")
                        VStack(spacing: 12) {
                            ForEach(s.creators) { c in
                                HStack(spacing: 12) {
                                    AvatarView(url: c.avatarUrl, name: c.displayName, size: 44, category: c.categories?.first)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(c.displayName).font(.subheadline.weight(.semibold))
                                        Text(c.bio ?? "").font(.caption).foregroundStyle(Color.muted).lineLimit(2)
                                    }
                                    Spacer(minLength: 0)
                                    toggleButton(on: followed.contains(c.userId), onTitle: "Folge ich", offTitle: "Folgen") {
                                        let next = !followed.contains(c.userId)
                                        if next { followed.insert(c.userId) } else { followed.remove(c.userId) }
                                        Task { do { try await SocialAPI.follow(c.userId, next) } catch { app.show(error: error) } }
                                    }
                                }
                                .padding(12).cardSurface()
                            }
                        }
                    }
                    if !s.communities.isEmpty {
                        SectionHeader("Communities", number: "02")
                        VStack(spacing: 12) {
                            ForEach(s.communities) { c in
                                HStack(spacing: 12) {
                                    CoverView(url: c.coverUrl, seed: c.id, category: c.category, showLabel: false).frame(width: 44, height: 44).clipShape(.rect(cornerRadius: 12, style: .continuous))
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(c.name).font(.subheadline.weight(.semibold))
                                        Text(Fmt.plural(c.memberCount ?? 0, "Mitglied", "Mitglieder")).font(.caption).foregroundStyle(Color.muted)
                                    }
                                    Spacer(minLength: 0)
                                    toggleButton(on: joined.contains(c.id), onTitle: "Dabei", offTitle: "Beitreten") {
                                        let next = !joined.contains(c.id)
                                        if next { joined.insert(c.id) } else { joined.remove(c.id) }
                                        Task {
                                            do { _ = try await APIClient.shared.post("/communities/\(c.id)/\(next ? "join" : "leave")") as JSONValue }
                                            catch { app.show(error: error) }
                                        }
                                    }
                                }
                                .padding(12).cardSurface()
                            }
                        }
                    }
                    if s.creators.isEmpty && s.communities.isEmpty {
                        EmptyStateView(symbol: "person.2", title: "Noch keine Vorschläge", message: "Entdecke nach dem Start Projekte und Menschen im Tab „Entdecken“.")
                    }
                } else {
                    LoadingView(text: "Wir suchen passende Creator …")
                }
            }
            .padding(Space.gutter)
        }
    }

    private func toggleButton(on: Bool, onTitle: String, offTitle: String, action: @escaping () -> Void) -> some View {
        Button { Haptics.tap(); withAnimation(.snappy) { action() } } label: {
            Text(on ? onTitle : offTitle).font(.footnote.weight(.semibold))
        }
        .buttonStyle(on ? AnyPrimitiveButtonStyle(.glass) : AnyPrimitiveButtonStyle(.glassProminent))
        .tint(on ? nil : .ink)
        .controlSize(.small)
    }

    // MARK: Daten

    private func load() async {
        struct O: Decodable { var profile: Me.Profile?; var adultConfirmed: Bool }
        if let o: O = try? await APIClient.shared.get("/onboarding") {
            displayName = o.profile?.displayName ?? ""
            handle = o.profile?.handle ?? ""
            interests = o.profile?.categories ?? []
            bio = o.profile?.bio ?? ""
            avatarPath = o.profile?.avatarUrl
            adultConfirmed = o.adultConfirmed
        }
    }

    private func loadSuggestions() async {
        if let s: Suggestions = try? await APIClient.shared.post("/onboarding/suggestions", ["interests": JSONValue.from(interests)]) {
            withAnimation { suggestions = s }
        } else {
            suggestions = Suggestions(creators: [], communities: [])
        }
    }

    private func finish() async {
        error = nil
        var body: [String: JSONValue] = ["displayName": .string(displayName.trimmed), "handle": .string(handle.trimmed), "interests": .from(interests), "bio": .string(String(bio.trimmed.prefix(300))), "region": .string(region.trimmed)]
        if !adultConfirmed { body["adult"] = .bool(adult) }
        if let avatarPath, avatarPath.hasPrefix("/media/") { body["avatarUrl"] = .string(avatarPath) }
        do {
            _ = try await APIClient.shared.post("/onboarding/complete", body) as JSONValue
            Haptics.success()
            await app.finishOnboarding()
            app.show("Willkommen bei Werkuno, \(displayName.trimmed)!")
        } catch let e as APIError {
            withAnimation { error = e; if e.fields?["handle"] != nil || e.fields?["displayName"] != nil || e.fields?["adult"] != nil { step = 0 } }
        } catch { app.show(error: error) }
    }

    private func skip() async {
        if !adultConfirmed { withAnimation { step = 0 }; app.show("Bitte bestätige zuerst, dass du mindestens 18 Jahre alt bist.", style: .warning); return }
        await app.run { _ = try await APIClient.shared.post("/onboarding/skip") as JSONValue }
        await app.finishOnboarding()
    }
}
