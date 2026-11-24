import SwiftUI
import UIKit

struct MainTabView: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router
    @Environment(\.colorScheme) private var colorScheme
    /// Eigenes Profilbild für den „Ich“-Tab (nil → Symbol)
    @State private var avatar: UIImage?

    private var avatarPath: String? { app.isGuest ? nil : app.me?.profile?.avatarUrl }

    private var meIcon: Image {
        guard avatarPath != nil, let avatar else { return Image(systemName: "person.crop.circle") }
        return Image(uiImage: TabAvatar.render(avatar, selected: router.tab == .me, dark: colorScheme == .dark))
    }

    var body: some View {
        @Bindable var router = router
        TabView(selection: $router.tab) {
            Tab("Werkbank", systemImage: "square.grid.2x2", value: AppTab.workbench) {
                TabStack(tab: .workbench) { if app.isGuest { GuestFeedView() } else { FeedView() } }
            }
            Tab("Entdecken", systemImage: "safari", value: AppTab.discover) {
                TabStack(tab: .discover) { DiscoverView() }
            }
            // Marktplatz per Feature-Flag pausiert → Tab ausblenden (Bestellungen bleiben unter „Ich“)
            if app.marketplaceEnabled {
                Tab("Markt", systemImage: "bag", value: AppTab.market) {
                    TabStack(tab: .market) { MarketView() }
                }
                .badge(app.cartCount)
            }
            Tab(value: AppTab.me) {
                TabStack(tab: .me) { if app.isGuest { GuestMeView() } else { MeView() } }
            } label: {
                // Mit Profilbild: rundes Foto (aktiv mit Koralle-Ring), sonst das bisherige Symbol
                Label { Text("Ich") } icon: { meIcon }
            }
            .badge(app.unreadNotifications + app.unreadMessages)
            Tab(value: AppTab.search, role: .search) {
                TabStack(tab: .search) { SearchView() }
            }
        }
        .tabBarMinimizeBehavior(.onScrollDown)
        .task(id: avatarPath) {
            guard let url = AppConfig.resolve(avatarPath) else { avatar = nil; return }
            if let hit = ImageCache.shared.cached(url) { avatar = hit; return }
            avatar = nil
            // Bis zu drei Versuche (kurzes Funkloch beim Start); ein abgelöster Auftrag schreibt nichts mehr
            for attempt in 0..<3 {
                let img = await ImageCache.shared.load(url)
                guard !Task.isCancelled else { return }
                if let img { avatar = img; return }
                try? await Task.sleep(for: .seconds(2 << attempt))
                guard !Task.isCancelled else { return }
            }
        }
        .onChange(of: app.marketplaceEnabled) { _, enabled in
            if !enabled && router.tab == .market { router.tab = .workbench }
        }
        .tabViewBottomAccessory(isEnabled: router.immersiveCount == 0) { if app.isGuest { GuestAccessory() } else { WorkbenchAccessory() } }
        .sheet(item: $router.sheet) { route in
            SheetHost(route: route)
                .environment(app)
                .environment(router)
                .toastOverlay()
        }
        .fullScreenCover(item: $router.storyViewer) { req in
            StoryViewerView(request: req)
                .environment(app)
                .environment(router)
                .toastOverlay()
        }
    }
}

/// Profilbild als Tab-Symbol. Die Tab-Leiste färbt Symbole sonst einfarbig ein – darum ein fertig
/// gezeichnetes, rundes Bild im Originalmodus (Grösse wie ein SF-Symbol im Tab).
enum TabAvatar {
    static func render(_ image: UIImage, selected: Bool, dark: Bool) -> UIImage {
        let side: CGFloat = 26
        let rect = CGRect(x: 0, y: 0, width: side, height: side)
        let traits = UITraitCollection(userInterfaceStyle: dark ? .dark : .light)
        let out = UIGraphicsImageRenderer(size: rect.size).image { _ in
            if selected {
                let ring = UIBezierPath(ovalIn: rect.insetBy(dx: 0.9, dy: 0.9))
                ring.lineWidth = 1.8
                UIColor(Color.moss).resolvedColor(with: traits).setStroke()
                ring.stroke()
            }
            let photo = selected ? rect.insetBy(dx: 3, dy: 3) : rect
            UIBezierPath(ovalIn: photo).addClip()
            // Bildmitte füllend zuschneiden
            let scale = max(photo.width / max(image.size.width, 1), photo.height / max(image.size.height, 1))
            let w = image.size.width * scale, h = image.size.height * scale
            image.draw(in: CGRect(x: photo.midX - w / 2, y: photo.midY - h / 2, width: w, height: h))
        }
        return out.withRenderingMode(.alwaysOriginal)
    }
}

/// NavigationStack je Tab mit gemeinsamen Zielen
struct TabStack<Root: View>: View {
    var tab: AppTab
    @ViewBuilder var root: () -> Root
    @Environment(Router.self) private var router

    var body: some View {
        NavigationStack(path: router.path(for: tab)) {
            root()
                .navigationDestination(for: Route.self) { RouteView(route: $0) }
        }
    }
}

/// Zentrale Zuordnung Route → Bildschirm
struct RouteView: View {
    var route: Route
    @Environment(AppState.self) private var app

    var body: some View {
        Group {
            if !app.marketplaceEnabled && route.needsMarketplace {
                MarketPausedView()
            } else {
                destination
            }
        }
        .background(Color.paper)
        .toolbarVisibility(hidesTabBar ? .hidden : .automatic, for: .tabBar)
        .onAppear { if hidesTabBar { router.immersiveCount += 1 } }
        .onDisappear { if hidesTabBar { router.immersiveCount = max(0, router.immersiveCount - 1) } }
    }

    @ViewBuilder private var destination: some View {
        Group {
            switch route {
            case .post(let id): PostDetailView(id: id)
            case .profile(let h): ProfileView(handle: h)
            case .follows(let h, let f): FollowListView(handle: h, following: f)
            case .project(let h, let s): ProjectDetailView(handle: h, slug: s)
            case .projectList(let c, let s): ProjectListView(category: c, sort: s)
            case .tutorial(let s): TutorialDetailView(slug: s)
            case .tutorialList(let c): TutorialListView(category: c)
            case .product(let s, let p): ProductDetailView(shopSlug: s, productSlug: p)
            case .shop(let s): ShopView(slug: s)
            case .cart: CartView()
            case .checkout: CheckoutView()
            case .orders: OrderListView()
            case .order(let id): OrderDetailView(id: id)
            case .giftCards: MyGiftCardsView()
            case .coupon(let id): CouponLandingView(id: id)
            case .communities: CommunityListView()
            case .community(let s): CommunityDetailView(slug: s)
            case .communityManage(let s): CommunityManageView(slug: s)
            case .blogHome: BlogHomeView()
            case .article(let h, let s): ArticleReaderView(handle: h, slug: s)
            case .userBlog(let h): UserBlogView(handle: h)
            case .conversations: ConversationListView()
            case .conversationsBox(let b): ConversationListView(initialBox: SocialInboxBox(rawValue: b) ?? .inbox)
            case .conversation(let id): ConversationView(id: id)
            case .notifications: NotificationsView()
            case .saved: SavedView()
            case .collection(let id): CollectionView(id: id)
            case .shoppingLists: ShoppingListsView()
            case .shoppingList(let id): ShoppingListView(id: id)
            case .sharedShoppingList(let t): SharedShoppingListView(token: t)
            case .materials: MaterialsView()
            case .cuttingCalculator(let code): CuttingCalculatorView(code: code)
            case .pdfBrand: PdfBrandSettingsView()
            case .studio: StudioView()
            case .studioSection(let s): StudioSectionView(section: s)
            case .creatorPro(let feature): StudioProView(highlight: feature)
            case .sellerOrder(let id): SellerOrderDetailView(id: id)
            case .settings: SettingsView()
            case .settingsSection(let s): SettingsSectionView(section: s)
            case .appeal(let id): AppealView(caseId: id)
            case .moderation: ModerationView()
            case .moderationCase(let id): ModerationCaseView(id: id)
            case .adminUser(let id): AdminUserView(id: id)
            case .search(let q): SearchView(initialQuery: q)
            case .category(let s): CategoryDiscoverView(slug: s)
            case .web(let p): WebPageView(url: AppConfig.webURL(p))
            case .postDrafts: SocialDraftsView()
            case .competitions(let c): CompetitionListView(communitySlug: c)
            case .competition(let id): CompetitionDetailView(id: id)
            case .events: EventListView()
            case .event(let id): EventDetailView(id: id)
            case .material(let s): MaterialDetailView(slug: s)
            case .materialStock: MaterialStockView()
            case .storyArchive: StoryArchiveView()
            case .hashtag(let tag): HashtagView(tag: tag)
            }
        }
    }
    @Environment(Router.self) private var router

    /// Detailseiten mit eigener schwebender Aktionsleiste blenden Tab- und Werkbank-Leiste aus.
    private var hidesTabBar: Bool {
        switch route {
        case .post, .project, .tutorial, .product, .conversation, .article, .checkout, .order, .sellerOrder: true
        default: false
        }
    }
}

extension Route {
    /// Ziele, die der Server bei pausiertem Marktplatz sperrt (`MARKET_PREFIXES`, Studio-Produkte/-Shop).
    /// Bestellungen bleiben einsehbar.
    var needsMarketplace: Bool {
        switch self {
        case .product, .shop, .cart, .checkout, .coupon: true
        case .studioSection(let s): s == .products || s == .shop || s == .coupons || s == .bundles || s == .giftCards || s == .sales
        default: false
        }
    }
}

extension SheetRoute {
    var needsMarketplace: Bool {
        switch self {
        case .productEditor, .shopWizard: true
        default: false
        }
    }
}

/// Platzhalter, wenn der Marktplatz per Admin-Schalter pausiert ist
struct MarketPausedView: View {
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        EmptyStateView(symbol: "bag.badge.minus", title: "Marktplatz pausiert", message: "Der Marktplatz ist gerade pausiert. Bitte versuche es später erneut. Deine Bestellungen findest du weiterhin unter „Ich“.", actionTitle: "Zurück") { dismiss() }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.paper)
    }
}

struct StudioSectionView: View {
    var section: StudioSection
    var body: some View {
        switch section {
        case .content: StudioContentView()
        case .projects: StudioProjectsView()
        case .tutorials: StudioTutorialsView()
        case .articles: StudioArticlesView()
        case .scheduled: ScheduledContentView()
        case .newsletter: StudioNewsletterView()
        case .products: StudioProductsView()
        case .orders: StudioOrdersView()
        case .coupons: StudioCouponsView()
        case .bundles: StudioBundlesView()
        case .giftCards: StudioGiftCardsView()
        case .sales: StudioSalesView()
        case .shop: StudioShopView()
        case .media: StudioMediaView()
        case .stats: StudioStatsView()
        case .revenue: StudioRevenueView()
        case .supporters: StudioSupportView()
        // Laufen als Sheet (Router.open fängt sie ab); nur als Rückfall eingebettet
        case .comments: CommentFilterSheet()
        case .profileDesign: ProfileThemeEditorSheet()
        }
    }
}

/// Modale Editoren
struct SheetHost: View {
    var route: SheetRoute
    @Environment(AppState.self) private var app
    var body: some View {
        if !app.marketplaceEnabled && route.needsMarketplace {
            NavigationStack { MarketPausedView() }
        } else {
            content
        }
    }

    @ViewBuilder private var content: some View {
        switch route {
        case .composer(let p, let c): ComposerSheet(projectId: p, communityId: c)
        case .editPost(let id): EditPostSheet(id: id)
        case .createMenu: CreateMenuSheet()
        case .projectEditor(let h, let s, let r): ProjectEditorSheet(handle: h, slug: s, remixOf: r)
        case .journalEntry(let id, let t): JournalEntrySheet(projectId: id, projectTitle: t)
        case .tutorialEditor(let id, let seed): TutorialEditorSheet(id: id, seedProjectId: seed)
        case .articleEditor(let id): ArticleEditorSheet(id: id)
        case .productEditor(let id): ProductEditorSheet(id: id)
        case .communityEditor(let s): CommunityEditorSheet(slug: s)
        case .newConversation(let h, let o, let p): NewConversationSheet(handle: h, orderId: o, productId: p)
        case .report(let t, let id, let title): ReportSheet(targetType: t, targetId: id, title: title)
        case .shopWizard: ShopWizardSheet()
        case .collectionPicker(let t, let id): CollectionPickerSheet(type: t, id: id)
        case .shoppingListPicker(let k, let id, let t): ShoppingListPickerSheet(kind: k, id: id, title: t)
        case .web(let url): SafariSheet(url: url).ignoresSafeArea()
        case .coauthors(let id, let co): SocialCoauthorSheet(postId: id, asCoauthor: co)
        case .storyComposer: StoryComposerSheet()
        case .receipt(let id): MarketReceiptSheet(orderId: id)
        case .commentFilter: CommentFilterSheet()
        case .profileTheme: ProfileThemeEditorSheet()
        }
    }
}
