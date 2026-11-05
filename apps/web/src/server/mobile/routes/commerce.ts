import "server-only";
import { db } from "@/server/db";
import { fail } from "@/server/errors";
import * as products from "@/server/commerce/products";
import * as shops from "@/server/commerce/shops";
import * as cart from "@/server/commerce/cart";
import * as checkout from "@/server/commerce/checkout";
import * as orders from "@/server/commerce/orders";
import { createReview, listProductReviews, listShopReviews } from "@/server/commerce/reviews";
import { shopRevenue, type RevenueRange } from "@/server/commerce/revenue";
import { paymentsMode } from "@/server/commerce/stripe";
import { shopSlugSchema } from "@werkraum/shared";
import { browseCategories, categoryOptions } from "@/server/categories/settings";
import { getSetting } from "@/server/settings";
import { DELETE, GET, PATCH, POST, PUT, int, me, need, str, viewer, viewerId, type RouteDef } from "../router";

/** Marktplatz, Warenkorb, Kasse, Bestellungen, Shop & Verkauf (PRD §13, §20.3). */
export const commerceRoutes: RouteDef[] = [
  // ── Marktplatz ──
  GET("/market/products", async (c) => {
    const sp: Record<string, string> = {};
    // Gleiche Filterschlüssel wie die Web-Seite /markt
    for (const k of ["q", "kategorie", "art", "min", "max", "versand", "unikat", "sort"]) {
      const v = str(c.q, k);
      if (v) sp[k] = v;
    }
    const filters = products.parseProductFilters(sp);
    // Zusätzliche Mobile-Filter: Shop (Shopseite), Projekt/Anleitung (verknüpfte Produkte)
    const shopSlug = str(c.q, "shop");
    if (shopSlug) {
      const shop = await db.shop.findUnique({ where: { slug: shopSlug.toLowerCase() }, select: { id: true } });
      if (!shop) return { items: [], nextCursor: null };
      Object.assign(filters, { shopId: shop.id, includeSoldOut: true });
    }
    if (str(c.q, "projectId")) Object.assign(filters, { projectId: str(c.q, "projectId") });
    if (str(c.q, "tutorialId")) Object.assign(filters, { tutorialId: str(c.q, "tutorialId") });
    const u = await viewer();
    return products.listProducts(filters, str(c.q, "cursor") ?? null, { viewerId: u?.id, take: int(c.q, "take") ?? 24 });
  }),
  GET("/market/home", async () => {
    const vid = await viewerId();
    const [latest, shopList, categories] = await Promise.all([
      products.listProducts({}, null, { viewerId: vid, take: 12 }),
      shops.listShops({ take: 8, viewerId: vid }),
      browseCategories(),
    ]);
    return { products: latest.items, nextCursor: latest.nextCursor, shops: shopList, categories, payments: { mode: paymentsMode(), feeBps: await getSetting("commerce.feeBps") } };
  }),
  GET("/market/shops", async (c) => shops.listShops({ take: int(c.q, "take") ?? 24, viewerId: await viewerId(), category: str(c.q, "category") })),
  GET("/market/shops/:slug", async (c) => {
    const vid = await viewerId();
    const s = need(await shops.getPublicShop(c.p.slug!, vid), "Shop nicht gefunden.");
    const shopId = (s as unknown as { id?: string; shop?: { id: string } }).id ?? (s as unknown as { shop?: { id: string } }).shop?.id;
    const reviews = shopId ? await listShopReviews(shopId, vid, 12) : [];
    return { ...(s as object), reviews };
  }),
  GET("/market/products/:shopSlug/:productSlug", async (c) => {
    const vid = await viewerId();
    const page = need(await products.getProductPage(c.p.shopSlug!, c.p.productSlug!, vid), "Produkt nicht gefunden.");
    const pg = page as unknown as { id?: string; product?: { id: string; shopId?: string }; shop?: { id: string } };
    const productId = pg.product?.id ?? pg.id;
    const shopId = pg.shop?.id ?? pg.product?.shopId;
    const [reviews, more] = await Promise.all([
      productId ? listProductReviews(productId, vid, 20) : Promise.resolve([]),
      shopId && productId ? products.moreFromShop(shopId, productId, 6) : Promise.resolve([]),
    ]);
    if (productId) void products.countProductView(productId).catch(() => {});
    return { ...(page as object), reviews, moreFromShop: more, payments: { mode: paymentsMode(), feeBps: await getSetting("commerce.feeBps") } };
  }),

  // ── Warenkorb ──
  GET("/cart", async () => {
    const u = await me();
    const [view, pending] = await Promise.all([cart.getCartView(u.id), checkout.payableOrders(u.id)]);
    return { ...view, pendingOrders: pending };
  }),
  POST("/cart/items", async (c) => cart.addToCart(await me(), await c.json())),
  PATCH("/cart/items/:id", async (c) => {
    const { quantity } = await c.json<{ quantity?: number }>();
    return cart.updateCartItem(await me(), { itemId: c.p.id!, quantity });
  }),
  DELETE("/cart/items/:id", async (c) => {
    await cart.removeCartItem(await me(), c.p.id!);
    return { ok: true };
  }),

  // ── Kasse ──
  GET("/checkout", async () => {
    const u = await me();
    const view = await cart.getCartView(u.id);
    const last = await db.order.findFirst({ where: { buyerId: u.id }, orderBy: { createdAt: "desc" }, select: { shippingAddress: true } });
    const address = (last?.shippingAddress as Record<string, string> | null) ?? { name: u.profile.displayName };
    const digitalOnly = view.groups.length > 0 && view.groups.every((g) => g.lines.every((l) => l.isDigital));
    return { cart: view, address, digitalOnly };
  }),
  POST("/checkout", async (c) => checkout.startCheckout(await me(), await c.json())),
  POST("/orders/:id/resume", async (c) => ({ url: await checkout.resumePayment(await me(), c.p.id!) })),
  POST("/orders/:id/abandon", async (c) => {
    await checkout.abandonPendingOrder(await me(), c.p.id!);
    return { ok: true };
  }),
  POST("/orders/:id/simulate", async (c) => {
    const { outcome } = await c.json<{ outcome?: "success" | "failure" }>();
    return checkout.simulatePayment(await me(), c.p.id!, outcome === "failure" ? "failure" : "success");
  }),

  // ── Bestellungen (Käufer) ──
  GET("/orders", async (c) => orders.listBuyerOrders((await me()).id, str(c.q, "cursor") ?? null, int(c.q, "take") ?? 20)),
  GET("/orders/:id", async (c) => {
    const u = await me();
    const [order, payable] = await Promise.all([orders.getBuyerOrder(u.id, c.p.id!), checkout.payableOrders(u.id)]);
    return { order: need(order, "Bestellung nicht gefunden."), canPay: payable.some((o) => o.id === c.p.id) };
  }),
  GET("/orders/:id/receipt", async (c) => orders.getReceipt(await me(), c.p.id!)),
  POST("/orders/:id/problem", async (c) => {
    const { note } = await c.json<{ note?: string }>();
    await orders.reportProblem(await me(), c.p.id!, { note });
    return { message: "Danke. Der Shop wurde informiert – ihr findet gemeinsam eine Lösung." };
  }),
  POST("/orders/:id/confirm", async (c) => {
    await orders.confirmReceipt(await me(), c.p.id!);
    return { message: "Erhalt bestätigt. Danke!" };
  }),
  POST("/reviews", async (c) => {
    await createReview(await me(), await c.json());
    return { message: "Danke für deine Bewertung." };
  }),

  // ── Studio: Shop (§13.2) ──
  GET("/studio/shop", async () => {
    const u = await me();
    const [shop, feeBps] = await Promise.all([shops.getMyShop(u.id), getSetting("commerce.feeBps")]);
    return { shop, feeBps, payments: paymentsMode(), emailVerified: !!u.emailVerifiedAt };
  }),
  PUT("/studio/shop", async (c) => {
    const { input, submit } = await c.json<{ input: unknown; submit?: boolean }>();
    const s = await shops.saveShop(await me(), input, { submit: !!submit });
    return { status: s.status, slug: s.slug };
  }),
  POST("/studio/shop/slug-check", async (c) => {
    const { slug } = await c.json<{ slug?: string }>();
    const parsed = shopSlugSchema.safeParse(slug ?? "");
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Ungültig" };
    const mine = await shops.getMyShop((await me()).id);
    const free = await shops.isShopSlugAvailable(parsed.data, mine?.id);
    return { ok: free, message: free ? "Verfügbar" : "Bereits vergeben" };
  }),
  POST("/studio/shop/stripe-onboarding", async () => ({ url: await shops.startStripeOnboarding(await me()) })),
  POST("/studio/shop/stripe-dashboard", async () => ({ url: await shops.stripeDashboardLink(await me()) })),
  POST("/studio/shop/stripe-refresh", async () => {
    const s = await shops.refreshStripeStatus(await me());
    return { status: s?.status ?? null };
  }),
  POST("/studio/shop/simulate-verification", async () => {
    await shops.simulateVerification(await me());
    return { message: "Testmodus: Shop verifiziert und aktiv." };
  }),
  POST("/studio/shop/paused", async (c) => {
    const { paused } = await c.json<{ paused?: boolean }>();
    await shops.setShopPaused(await me(), !!paused);
    return { ok: true };
  }),
  GET("/studio/revenue", async (c) => {
    const u = await me();
    const shop = need(await shops.getMyShop(u.id), "Kein Shop vorhanden.");
    const range = (["30", "90", "365", "alle"].includes(c.q.get("range") ?? "") ? c.q.get("range") : "30") as RevenueRange;
    const [r, feeBps] = await Promise.all([shopRevenue(shop.id, range), getSetting("commerce.feeBps")]);
    return { ...(r as object), range, feeBps, payments: paymentsMode() };
  }),

  // ── Studio: Produkte ──
  GET("/studio/products", async (c) => {
    const u = await me();
    const [shop, list] = await Promise.all([shops.getMyShop(u.id), products.listMyProducts(u, { status: str(c.q, "status") })]);
    return { shop, products: list };
  }),
  GET("/studio/products/editor", async (c) => {
    const u = await me();
    const id = str(c.q, "id");
    const [shop, links, feeBps, digitalEnabled, categories, product] = await Promise.all([
      shops.getMyShop(u.id),
      products.linkOptions(u.id),
      getSetting("commerce.feeBps"),
      getSetting("commerce.digitalEnabledWeb"),
      categoryOptions(),
      id ? products.getProductForEdit(u, id) : Promise.resolve(null),
    ]);
    if (!shop) throw fail.forbidden("Eröffne zuerst deinen Shop im Creator Studio.");
    return { shop: { id: shop.id, slug: shop.slug, status: shop.status, name: shop.name }, links, feeBps, digitalEnabled, categories, product };
  }),
  POST("/studio/products", async (c) => {
    const { input, extra } = await c.json<{ input: unknown; extra?: unknown }>();
    return products.upsertProduct(await me(), null, input, extra ?? {});
  }),
  PUT("/studio/products/:id", async (c) => {
    const { input, extra } = await c.json<{ input: unknown; extra?: unknown }>();
    return products.upsertProduct(await me(), c.p.id!, input, extra ?? {});
  }),
  POST("/studio/products/:id/status", async (c) => {
    const { status } = await c.json<{ status?: "ACTIVE" | "PAUSED" | "DRAFT" }>();
    if (!status || !["ACTIVE", "PAUSED", "DRAFT"].includes(status)) throw fail.invalid("Ungültiger Status.");
    const p = await products.setProductStatus(await me(), c.p.id!, status);
    return { status: p.status };
  }),
  DELETE("/studio/products/:id", async (c) => {
    await products.deleteProduct(await me(), c.p.id!);
    return { ok: true };
  }),

  // ── Studio: Bestellungen (§13.8) ──
  GET("/studio/orders", async (c) => {
    const u = await me();
    const shop = need(await shops.getMyShop(u.id), "Kein Shop vorhanden.");
    const [list, counts] = await Promise.all([orders.listShopOrders(u, str(c.q, "tab"), str(c.q, "cursor") ?? null, int(c.q, "take") ?? 30), orders.sellerOrderCounts(shop.id)]);
    return { ...(list as object), counts };
  }),
  GET("/studio/orders/:id", async (c) => need(await orders.getSellerOrder(await me(), c.p.id!), "Bestellung nicht gefunden.")),
  POST("/studio/orders/:id/transition", async (c) => {
    const { to, note } = await c.json<{ to?: string; note?: string }>();
    if (!to) throw fail.invalid("Zielstatus fehlt.");
    await orders.transitionOrder(await me(), c.p.id!, to as never, note ?? "");
    return { message: "Status aktualisiert. Die Käuferin bzw. der Käufer wurde informiert." };
  }),
  POST("/studio/orders/:id/shipment", async (c) => {
    await orders.addShipment(await me(), c.p.id!, await c.json());
    return { message: "Als versendet markiert." };
  }),
  POST("/studio/orders/:id/refund", async (c) => {
    await orders.refundOrder(await me(), c.p.id!, await c.json());
    return { message: "Erstattung ausgelöst. Sie erscheint als bestätigt, sobald der Zahlungsanbieter sie verbucht hat." };
  }),
  POST("/studio/orders/:id/cancel", async (c) => {
    const { reason } = await c.json<{ reason?: string }>();
    const r = await orders.cancelBySeller(await me(), c.p.id!, reason ?? "");
    return { ...(typeof r === "object" && r ? r : {}), message: "Bestellung storniert. Der Betrag wird erstattet." };
  }),
];
