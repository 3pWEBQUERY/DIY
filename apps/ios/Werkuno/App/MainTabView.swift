import SwiftUI

struct MainTabView: View {
    @Environment(AppState.self) private var app
    @Environment(Router.self) private var router

    var body: some View {
        @Bindable var router = router
        TabView(selection: $router.tab) {
            Tab("Werkbank", systemImage: "square.grid.2x2", value: AppTab.workbench) {
                TabStack(tab: .workbench) { if app.isGuest { GuestFeedView() } else { FeedView() } }
            }
            Tab("Entdecken", systemImage: "safari", value: AppTab.discover) {
                TabStack(tab: .discover) { DiscoverView() }
            }
            Tab("Markt", systemImage: "bag", value: AppTab.market) {
                TabStack(tab: .market) { MarketView() }
            }
            .badge(app.cartCount)
            Tab("Ich", systemImage: "person.crop.circle", value: AppTab.me) {
                TabStack(tab: .me) { if app.isGuest { GuestMeView() } else { MeView() } }
            }
            .badge(app.unreadNotifications + app.unreadMessages)
            Tab(value: AppTab.search, role: .search) {
                TabStack(tab: .search) { SearchView() }
            }
        }
        .tabBarMinimizeBehavior(.onScrollDown)
        .tabViewBottomAccessory(isEnabled: router.immersiveCount == 0) { if app.isGuest { GuestAccessory() } else { WorkbenchAccessory() } }
        .sheet(item: $router.sheet) { route in
            SheetHost(route: route)
                .environment(app)
                .environment(router)
                .toastOverlay()
        }
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
    var body: some View {
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
            case .studio: StudioView()
            case .studioSection(let s): StudioSectionView(section: s)
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
            }
        }
        .background(Color.paper)
        .toolbarVisibility(hidesTabBar ? .hidden : .automatic, for: .tabBar)
        .onAppear { if hidesTabBar { router.immersiveCount += 1 } }
        .onDisappear { if hidesTabBar { router.immersiveCount = max(0, router.immersiveCount - 1) } }
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

struct StudioSectionView: View {
    var section: StudioSection
    var body: some View {
        switch section {
        case .content: StudioContentView()
        case .projects: StudioProjectsView()
        case .tutorials: StudioTutorialsView()
        case .articles: StudioArticlesView()
        case .products: StudioProductsView()
        case .orders: StudioOrdersView()
        case .shop: StudioShopView()
        case .media: StudioMediaView()
        case .stats: StudioStatsView()
        case .revenue: StudioRevenueView()
        }
    }
}

/// Modale Editoren
struct SheetHost: View {
    var route: SheetRoute
    var body: some View {
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
        }
    }
}
