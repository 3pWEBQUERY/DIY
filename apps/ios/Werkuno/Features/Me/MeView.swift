import SwiftUI

/// Tab „Ich“ – persönliche Zentrale
struct MeView: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @State private var counts: MeSettingsProfile?
    @State private var confirmSignOut = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                header
                notices
                quickTiles
                MeGroup(title: "Werkstatt") {
                    MeNavRow(symbol: "chart.bar.xaxis", title: "Creator Studio", subtitle: "Inhalte, Kennzahlen, Medien", tint: .moss) { router.open(.studio) }
                    if let shop = app.me?.shop {
                        MeNavRow(symbol: "storefront", title: shop.name, subtitle: "Shop · \(L.shopStatus[shop.status] ?? shop.status)", tint: .clay) { router.open(.studioSection(.shop)) }
                    } else {
                        MeNavRow(symbol: "storefront", title: "Shop eröffnen", subtitle: "Verkaufe Einzelstücke, Sets und Anleitungen", tint: .clay) { router.present(.shopWizard) }
                    }
                    MeNavRow(symbol: "shippingbox", title: "Meine Bestellungen", subtitle: "Käufe, Status, Belege") { router.open(.orders) }
                }
                if app.me?.isModerator == true {
                    MeGroup(title: "Team") {
                        MeNavRow(symbol: "checkmark.shield", title: "Moderation", subtitle: app.me?.isAdmin == true ? "Fälle, Einsprüche, Nutzer:innen · Admin" : "Fälle, Einsprüche, Meldungen", tint: .slate) { router.open(.moderation) }
                    }
                }
                MeGroup(title: "Konto") {
                    MeNavRow(symbol: "gearshape", title: "Einstellungen", subtitle: "Profil, Konto, Benachrichtigungen, Privatsphäre") { router.open(.settings) }
                    MeNavRow(symbol: "bell.badge", title: "Benachrichtigungen verwalten") { router.open(.settingsSection(.notifications)) }
                }
                MeGroup(title: "Hilfe & Richtlinien") {
                    MeNavRow(symbol: "questionmark.circle", title: "Hilfe-Center", external: true) { router.open(.web(path: "/hilfe")) }
                    MeNavRow(symbol: "person.2.wave.2", title: "Community-Richtlinien", external: true) { router.open(.web(path: "/richtlinien/community")) }
                    MeNavRow(symbol: "lock.doc", title: "Datenschutz", external: true) { router.open(.web(path: "/rechtliches/datenschutz")) }
                    MeNavRow(symbol: "doc.text", title: "AGB", external: true) { router.open(.web(path: "/rechtliches/agb")) }
                    MeNavRow(symbol: "building.columns", title: "Impressum", external: true) { router.open(.web(path: "/rechtliches/impressum")) }
                }
                Button(role: .destructive) { confirmSignOut = true } label: {
                    Label("Abmelden", systemImage: "rectangle.portrait.and.arrow.right")
                        .font(.body.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 4)
                }
                .buttonStyle(.glass)
                .controlSize(.large)
                .tint(.danger)
                footer
            }
            .padding(.horizontal, Space.gutter)
            .padding(.top, 4)
            .padding(.bottom, 40)
        }
        .background(Color.paper)
        .navigationTitle("Ich")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let h = app.handle {
                ToolbarItem(placement: .topBarTrailing) {
                    ShareLink(item: MeLinks.profile(h)) { Image(systemName: "square.and.arrow.up") }
                        .accessibilityLabel("Profil teilen")
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button { router.open(.settings) } label: { Image(systemName: "gearshape") }
                    .accessibilityLabel("Einstellungen")
            }
        }
        .refreshable { await reload(); await app.refreshCounts() }
        .task { await reload() }
        .confirmationDialog("Abmelden?", isPresented: $confirmSignOut, titleVisibility: .visible) {
            Button("Abmelden", role: .destructive) { Task { await app.signOut() } }
            Button("Abbrechen", role: .cancel) {}
        } message: {
            Text("Du wirst auf diesem Gerät abgemeldet. Deine Inhalte bleiben erhalten.")
        }
    }

    private func reload() async {
        if let p: MeSettingsProfile = try? await APIClient.shared.get("/settings/profile") {
            withAnimation(.snappy) { counts = p }
        }
    }

    // MARK: Kopf

    private var header: some View {
        let p = app.me?.profile
        return Button {
            if let h = p?.handle { router.open(.profile(handle: h)) }
        } label: {
            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 14) {
                    AvatarView(url: p?.avatarUrl, name: p?.displayName ?? "?", size: 68, category: p?.categories?.first)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(p?.displayName ?? "Mein Profil").font(.display(26)).foregroundStyle(Color.ink).lineLimit(2).multilineTextAlignment(.leading)
                        HStack(spacing: 6) {
                            Text("@\(p?.handle ?? "")").font(.subheadline).foregroundStyle(Color.muted)
                            if p?.isCreatorPro == true { Pill(text: "Creator Pro", symbol: "seal.fill", tint: .moss) }
                        }
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Color.lineStrong)
                }
                HStack(spacing: 0) {
                    headerCount(counts?.followerCount, "Follower")
                    headerCount(counts?.followingCount, "Folgt")
                    headerCount(counts?.projectCount, "Projekte")
                    headerCount(counts?.postCount, "Beiträge")
                }
                .padding(.top, 2)
            }
            .padding(16)
            .cardSurface()
            .contentShape(.rect)
        }
        .buttonStyle(.pressable)
        .accessibilityHint("Eigenes Profil öffnen")
    }

    private func headerCount(_ n: Int?, _ label: String) -> some View {
        StatCell(value: n.map { Fmt.number($0) } ?? "–", label: label)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: Hinweise

    @ViewBuilder private var notices: some View {
        if let me = app.me {
            if me.status == "SUSPENDED" {
                NoticeView(tone: .danger, title: "Dein Konto ist eingeschränkt",
                           message: me.suspendedUntil.map { "Gesperrt bis \(Fmt.dateTime($0)). Du kannst lesen, aber nichts veröffentlichen. Eine Begründung findest du in deinen Benachrichtigungen." } ?? "Du kannst lesen, aber nichts veröffentlichen. Eine Begründung findest du in deinen Benachrichtigungen.")
            }
            if !me.emailVerified {
                VStack(alignment: .leading, spacing: 10) {
                    NoticeView(tone: .warn, title: "Bitte bestätige deine E-Mail-Adresse",
                               message: "Wir haben dir einen Link an \(me.email) geschickt. Erst danach kannst du verkaufen und Nachrichten an neue Kontakte senden.")
                    AsyncButton {
                        await app.run("Wir haben dir einen neuen Bestätigungslink geschickt.") {
                            _ = try await APIClient.shared.post("/auth/resend-verification") as JSONValue
                        }
                    } label: {
                        Label("Link erneut senden", systemImage: "envelope.arrow.triangle.branch").font(.subheadline.weight(.semibold))
                    }
                    .buttonStyle(.glass)
                }
            }
        }
    }

    // MARK: Kacheln

    private var quickTiles: some View {
        GlassEffectContainer(spacing: 10) {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                tile("Benachrichtigungen", symbol: "bell", badge: app.unreadNotifications, tint: .clay) { router.open(.notifications) }
                tile("Nachrichten", symbol: "bubble.left.and.bubble.right", badge: app.unreadMessages, tint: .slate) { router.open(.conversations) }
                tile("Gespeichert", symbol: "bookmark", badge: 0, tint: .moss) { router.open(.saved) }
                tile("Einkaufslisten", symbol: "checklist", badge: 0, tint: .ochre) { router.open(.shoppingLists) }
            }
        }
    }

    private func tile(_ title: String, symbol: String, badge: Int, tint: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Image(systemName: symbol).font(.title3).foregroundStyle(tint)
                    Spacer()
                    if badge > 0 {
                        Text(badge > 99 ? "99+" : "\(badge)")
                            .font(.caption.weight(.bold)).monospacedDigit()
                            .foregroundStyle(Color.paper)
                            .padding(.horizontal, 7).padding(.vertical, 2)
                            .background(Color.clay, in: Capsule())
                    }
                }
                Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(Color.ink).lineLimit(1).minimumScaleFactor(0.8)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .glassEffect(.regular.interactive(), in: .rect(cornerRadius: Radius.card, style: .continuous))
        .accessibilityLabel(badge > 0 ? "\(title), \(badge) neu" : title)
    }

    private var footer: some View {
        VStack(spacing: 4) {
            Wordmark(size: 18)
            Text("\(appVersion) · \(AppConfig.environment.label)").font(.caption2).foregroundStyle(Color.muted)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 8)
    }

    private var appVersion: String {
        let v = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
        let b = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
        return "Version \(v) (\(b))"
    }
}
