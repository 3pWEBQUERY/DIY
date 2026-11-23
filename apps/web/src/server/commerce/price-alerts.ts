import "server-only";
import { randomUUID } from "node:crypto";
import { convertMinor, currencyForCountry, formatMoney, type Currency } from "@werkraum/shared";
import { db, Prisma } from "@/server/db";
import { notify } from "@/server/notifications";
import { captureError } from "@/server/monitoring";
import { getFxRate } from "./currency";
import { salesForProducts, saleUnit } from "./sale-prices";

/**
 * Preisalarm für gemerkte Produkte (Merkliste = Lesezeichen auf PRODUCT).
 *
 * Anlässe (je Person, Produkt und Anlass höchstens eine Nachricht – `PriceAlertSent` ist eindeutig):
 * - SALE: eine Shop-Aktion hat begonnen (ref = Aktion). Mehrere gemerkte Produkte derselben Aktion
 *   ergeben eine einzige Nachricht.
 * - PRICE_DROP: der Shop senkt den Grundpreis um mindestens 5 % (ref = neuer Preis).
 * - RESTOCK: ein ausverkauftes Produkt ist wieder erhältlich (ref = Tag). Wer zusätzlich eine Anfrage zur
 *   Nachproduktion gestellt hat, bekommt nur deren Nachricht (`notifyBackInStock`), nicht beide.
 *   Damit ein Übergang AUSVERKAUFT → ERHÄLTLICH erkennbar ist, merkt sich der Lauf ausverkaufte gemerkte
 *   Produkte als „ARMED“-Zeile (gleiche Tabelle, interner Anlass) und löst sie beim Wiederauffüllen aus.
 *
 * Zustellung über Benachrichtigungen (Typ RESTOCK, Shop-Gruppe): In-App, Push und E-Mail nach den
 * Kanal-Einstellungen; abschaltbar mit `notificationPrefs.priceAlerts`. Preise in der Währung der
 * Empfänger:in, Aktionspreis wie auf Karte und Kasse (erst Rabatt in der Shop-Währung, dann umgerechnet).
 */

export const PRICE_DROP_MIN_BPS = 500; // ≥ 5 % günstiger
export type AlertKind = "SALE" | "PRICE_DROP" | "RESTOCK";

/** Lohnt eine Preissenkung einen Hinweis? (mind. 5 %, nur echte Senkungen) */
export function isNotablePriceDrop(oldMinor: number, newMinor: number) {
  return newMinor < oldMinor && (oldMinor - newMinor) * 10_000 >= oldMinor * PRICE_DROP_MIN_BPS;
}

/** „noch bis Sonntag“ (innert 6 Tagen) bzw. „noch bis 30. November“ */
export function untilLabel(endsAt: Date, now = new Date()) {
  const days = (endsAt.getTime() - now.getTime()) / 86_400_000;
  const opts: Intl.DateTimeFormatOptions = days < 6 ? { weekday: "long", timeZone: "Europe/Zurich" } : { day: "numeric", month: "long", timeZone: "Europe/Zurich" };
  return `noch bis ${endsAt.toLocaleDateString("de-CH", opts)}`;
}

/** Tag (Zürich) als Schlüssel für „wieder erhältlich“ */
function dayKey(d = new Date()) {
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Zurich" });
}

/**
 * Gemerkte Produkte → wer einen Hinweis bekommen darf: aktives Konto, nicht die Shop-Inhaberin,
 * keine Blockierung in einer der beiden Richtungen, Preisalarm nicht abgeschaltet.
 */
export async function alertRecipients(productIds: string[]) {
  if (!productIds.length) return [] as { userId: string; productId: string }[];
  return db.$queryRaw<{ userId: string; productId: string }[]>`
    SELECT b."userId", b."targetId" AS "productId"
    FROM "Bookmark" b
    JOIN "Product" p ON p.id = b."targetId"
    JOIN "Shop" s ON s.id = p."shopId"
    JOIN "User" u ON u.id = b."userId"
    LEFT JOIN "UserPreference" up ON up."userId" = u.id
    WHERE b."targetType" = 'PRODUCT'
      AND b."targetId" = ANY(${productIds})
      AND u.status = 'ACTIVE'
      AND u.id <> s."ownerId"
      AND COALESCE((up."notificationPrefs"->>'priceAlerts')::boolean, true)
      AND NOT EXISTS (
        SELECT 1 FROM "UserBlock" x
        WHERE (x."blockerId" = u.id AND x."blockedId" = s."ownerId") OR (x."blockerId" = s."ownerId" AND x."blockedId" = u.id)
      )`;
}

/**
 * Anlass verbuchen; zurück kommen nur die neu verbuchten Paare (bereits benachrichtigte fallen weg).
 * Eine Zeile pro Paar – gleichzeitige Läufe schicken dank ON CONFLICT nie doppelt.
 */
export async function claimAlerts(pairs: { userId: string; productId: string }[], kind: AlertKind, ref: (productId: string) => string) {
  if (!pairs.length) return [] as { userId: string; productId: string }[];
  const out: { userId: string; productId: string }[] = [];
  for (let i = 0; i < pairs.length; i += 1000) {
    const chunk = pairs.slice(i, i + 1000);
    const rows = await db.$queryRaw<{ userId: string; productId: string }[]>`
      INSERT INTO "PriceAlertSent" ("id", "userId", "productId", "kind", "ref", "createdAt")
      SELECT x.id, x."userId", x."productId", ${kind}, x.ref, now()
      FROM UNNEST(${chunk.map(() => randomUUID())}::text[], ${chunk.map((c) => c.userId)}::text[], ${chunk.map((c) => c.productId)}::text[], ${chunk.map((c) => ref(c.productId))}::text[]) AS x(id, "userId", "productId", ref)
      ON CONFLICT ("userId", "productId", "kind", "ref") DO NOTHING
      RETURNING "userId", "productId"`;
    out.push(...rows);
  }
  return out;
}

/** Währung je Person (Land im Profil) und Tageskurs – einmal je Lauf */
async function currencies(userIds: string[]) {
  const [profiles, fx] = await Promise.all([db.userProfile.findMany({ where: { userId: { in: [...new Set(userIds)] } }, select: { userId: true, country: true } }), getFxRate()]);
  const byUser = new Map(profiles.map((p) => [p.userId, currencyForCountry(p.country)]));
  return (userId: string, minor: number, from: string) => {
    const to: Currency = byUser.get(userId) ?? "CHF";
    return formatMoney(convertMinor(minor, from, to, fx.rate), to);
  };
}

type ProductInfo = { id: string; title: string; slug: string; priceMinor: number; currency: string; shopId: string; shop: { slug: string; name: string } };
const productSelect = { id: true, title: true, slug: true, priceMinor: true, currency: true, shopId: true, shop: { select: { slug: true, name: true } } } as const;
const hrefOf = (p: ProductInfo) => `/markt/${p.shop.slug}/${p.slug}`;

async function send(userId: string, p: ProductInfo, kind: "price_sale" | "price_drop" | "price_back", message: string, href = hrefOf(p)) {
  try {
    await notify({ recipientId: userId, type: "RESTOCK", targetType: "PRODUCT", targetId: p.id, bundle: false, data: { kind, title: p.title, message, href } });
  } catch (e) {
    await captureError(e, { source: "WORKER", path: "price-alerts", meta: { kind, productId: p.id } });
  }
}

/* ───────────────────────── Aktion begonnen ───────────────────────── */

/** Laufende Aktionen der letzten 7 Tage prüfen (läuft alle 10 Minuten im Worker). */
export async function runSaleAlerts(now = new Date()) {
  const sales = await db.shopSale.findMany({
    where: {
      active: true,
      startsAt: { lte: now, gte: new Date(now.getTime() - 7 * 86_400_000) },
      // Kurz vor Schluss lohnt kein Hinweis mehr
      endsAt: { gt: new Date(now.getTime() + 60 * 60_000) },
      shop: { status: "ACTIVE", owner: { status: "ACTIVE" } },
    },
    select: { id: true, shopId: true, percent: true, endsAt: true, productIds: true },
    take: 500,
  });
  let sent = 0;
  for (const sale of sales) {
    // Nur gemerkte, erhältliche Produkte dieser Aktion
    const saved = await db.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT p.id FROM "Product" p
      JOIN "Bookmark" b ON b."targetType" = 'PRODUCT' AND b."targetId" = p.id
      WHERE p."shopId" = ${sale.shopId} AND p.status = 'ACTIVE'
        ${sale.productIds.length ? Prisma.sql`AND p.id = ANY(${sale.productIds})` : Prisma.empty}`;
    if (!saved.length) continue;
    const claimed = await claimAlerts(await alertRecipients(saved.map((s) => s.id)), "SALE", () => sale.id);
    if (!claimed.length) continue;
    const products = new Map((await db.product.findMany({ where: { id: { in: [...new Set(claimed.map((c) => c.productId))] } }, select: productSelect })).map((p) => [p.id, p]));
    const money = await currencies(claimed.map((c) => c.userId));
    const until = untilLabel(sale.endsAt, now);
    // Eine Nachricht je Person und Aktion
    const byUser = new Map<string, ProductInfo[]>();
    for (const c of claimed) {
      const p = products.get(c.productId);
      if (p) byUser.set(c.userId, [...(byUser.get(c.userId) ?? []), p]);
    }
    for (const [userId, list] of byUser) {
      const first = list[0]!;
      if (list.length === 1) {
        const salePriceMinor = saleUnit(first.priceMinor, sale);
        const msg = `„${first.title}“ ist jetzt in Aktion: ${money(userId, salePriceMinor, first.currency)} statt ${money(userId, first.priceMinor, first.currency)} – ${until}.`;
        await send(userId, first, "price_sale", msg);
      } else {
        const msg = `${list.length} gemerkte Produkte von ${first.shop.name} sind jetzt in Aktion (−${sale.percent} %) – ${until}.`;
        await send(userId, first, "price_sale", msg, `/markt/${first.shop.slug}`);
      }
      sent++;
    }
  }
  return { sent };
}

/* ───────────────────────── Preis gesenkt ───────────────────────── */

/** Nach dem Speichern im Editor: Grundpreis um mind. 5 % gesenkt → gemerkt hat, erfährt es. */
export async function notifyPriceDrop(productId: string, oldMinor: number, newMinor: number) {
  if (!isNotablePriceDrop(oldMinor, newMinor)) return { sent: 0 };
  const p = await db.product.findUnique({ where: { id: productId }, select: { ...productSelect, status: true, shop: { select: { slug: true, name: true, status: true } } } });
  if (!p || p.status !== "ACTIVE" || p.shop.status !== "ACTIVE") return { sent: 0 };
  // Läuft gerade eine Aktion, zählt deren Hinweis – sonst stünden zwei Preise nebeneinander
  if ((await salesForProducts([{ id: p.id, shopId: p.shopId }])).get(p.id)) return { sent: 0 };
  const claimed = await claimAlerts(await alertRecipients([p.id]), "PRICE_DROP", () => String(newMinor));
  const money = await currencies(claimed.map((c) => c.userId));
  for (const c of claimed) await send(c.userId, p, "price_drop", `„${p.title}“ ist günstiger: ${money(c.userId, newMinor, p.currency)} statt ${money(c.userId, oldMinor, p.currency)}.`);
  return { sent: claimed.length };
}

/* ───────────────────────── Wieder erhältlich ───────────────────────── */

/**
 * Ausverkaufte gemerkte Produkte vormerken und beim Wiederauffüllen benachrichtigen. Läuft im Worker
 * und direkt nach dem Speichern eines Produkts (`productIds`).
 */
export async function runRestockAlerts(productIds?: string[]) {
  const only = productIds?.length ? Prisma.sql`AND p.id = ANY(${productIds})` : Prisma.empty;
  // 1. Vormerken: gemerkt + ausverkauft
  await db.$executeRaw`
    INSERT INTO "PriceAlertSent" ("id", "userId", "productId", "kind", "ref", "createdAt")
    SELECT md5(random()::text || clock_timestamp()::text || b."userId" || p.id), b."userId", p.id, 'ARMED', '-', now()
    FROM "Bookmark" b JOIN "Product" p ON p.id = b."targetId"
    WHERE b."targetType" = 'PRODUCT' AND p.status = 'SOLD_OUT' ${only}
    ON CONFLICT ("userId", "productId", "kind", "ref") DO NOTHING`;
  // 2. Auslösen: vorgemerkt + wieder aktiv (Zeile wird verbraucht, auch wenn kein Hinweis rausgeht)
  const fired = await db.$queryRaw<{ userId: string; productId: string }[]>`
    DELETE FROM "PriceAlertSent" a USING "Product" p, "Shop" s
    WHERE a.kind = 'ARMED' AND a."productId" = p.id AND p."shopId" = s.id AND p.status = 'ACTIVE' AND s.status = 'ACTIVE' ${only}
    RETURNING a."userId", a."productId"`;
  // Aufräumen: Vormerkungen für Produkte, die gelöscht wurden oder lange weg sind
  if (!productIds) await db.$executeRaw`DELETE FROM "PriceAlertSent" a WHERE a.kind = 'ARMED' AND (a."createdAt" < now() - interval '180 days' OR NOT EXISTS (SELECT 1 FROM "Product" p WHERE p.id = a."productId"))`;
  if (!fired.length) return { sent: 0 };

  const ids = [...new Set(fired.map((f) => f.productId))];
  const firedSet = new Set(fired.map((f) => `${f.userId}:${f.productId}`));
  // Wer eine Nachproduktion angefragt hat, erhält deren Nachricht – nicht zusätzlich den Preisalarm
  const requested = await db.restockRequest.findMany({
    where: { productId: { in: ids }, OR: [{ notifiedAt: null }, { notifiedAt: { gte: new Date(Date.now() - 3 * 86_400_000) } }] },
    select: { userId: true, productId: true },
  });
  const skip = new Set(requested.map((r) => `${r.userId}:${r.productId}`));
  const eligible = (await alertRecipients(ids)).filter((r) => firedSet.has(`${r.userId}:${r.productId}`) && !skip.has(`${r.userId}:${r.productId}`));
  const today = dayKey();
  const claimed = await claimAlerts(eligible, "RESTOCK", () => today);
  if (!claimed.length) return { sent: 0 };
  const products = new Map((await db.product.findMany({ where: { id: { in: ids } }, select: productSelect })).map((p) => [p.id, p]));
  const sales = await salesForProducts([...products.values()].map((p) => ({ id: p.id, shopId: p.shopId })));
  const money = await currencies(claimed.map((c) => c.userId));
  for (const c of claimed) {
    const p = products.get(c.productId);
    if (!p) continue;
    const sale = sales.get(p.id);
    const price = money(c.userId, saleUnit(p.priceMinor, sale ?? null), p.currency);
    await send(c.userId, p, "price_back", `Wieder erhältlich: „${p.title}“ für ${price}${sale ? ` (in Aktion, −${sale.percent} %)` : ""}.`);
  }
  return { sent: claimed.length };
}

/** Worker-Lauf (alle 10 Minuten) */
export async function runPriceAlerts() {
  const [sale, restock] = [await runSaleAlerts(), await runRestockAlerts()];
  return { sale: sale.sent, restock: restock.sent };
}
