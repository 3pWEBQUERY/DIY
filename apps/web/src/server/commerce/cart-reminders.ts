import "server-only";
import { convertMinor, currencyForCountry, formatMoney } from "@werkraum/shared";
import { db } from "@/server/db";
import { sendMail } from "@/server/mail";
import { unsubscribeUrl } from "@/server/mail-unsubscribe";
import { captureError } from "@/server/monitoring";
import { publish } from "@/server/realtime/bus";
import { getFxRate } from "./currency";
import { salesForProducts, saleUnit } from "./sale-prices";

/**
 * Erinnerung an einen liegengebliebenen Warenkorb (stündlich im Worker).
 *
 * Wer Artikel in den Warenkorb gelegt und 24–72 Stunden nichts mehr daran geändert hat, bekommt EINE
 * Nachricht (E-Mail + Push/In-App) mit bis zu drei erhältlichen Artikeln. Nicht, wenn seither bestellt
 * wurde, nichts mehr erhältlich ist, die Erinnerung abgeschaltet ist (`notificationPrefs.cartReminders`)
 * oder in den letzten 7 Tagen schon eine Erinnerung kam. Neue oder geänderte Artikel setzen
 * `Cart.remindedAt` zurück (cart.ts).
 */

export const REMIND_AFTER_H = 24;
export const REMIND_UNTIL_H = 72;
export const REMIND_GAP_DAYS = 7;

/** Liegt die letzte Änderung im Fenster für eine Erinnerung? */
export function inReminderWindow(lastActivity: Date, now = new Date()) {
  const h = (now.getTime() - lastActivity.getTime()) / 3_600_000;
  return h >= REMIND_AFTER_H && h <= REMIND_UNTIL_H;
}

/** Darf diese Person erinnert werden? (reine Regel, für Tests) */
export function reminderAllowed(input: { prefs: unknown; lastReminderAt: Date | null; orderedSince: boolean; purchasableCount: number }, now = new Date()) {
  if ((input.prefs as { cartReminders?: unknown } | null)?.cartReminders === false) return false;
  if (input.orderedSince || input.purchasableCount === 0) return false;
  if (input.lastReminderAt && now.getTime() - input.lastReminderAt.getTime() < REMIND_GAP_DAYS * 86_400_000) return false;
  return true;
}

export async function sendCartReminders(now = new Date()) {
  const carts = await db.cart.findMany({
    where: {
      remindedAt: null,
      updatedAt: { gte: new Date(now.getTime() - REMIND_UNTIL_H * 3_600_000), lte: new Date(now.getTime() - REMIND_AFTER_H * 3_600_000) },
      items: { some: {} },
      user: { status: "ACTIVE", emailVerifiedAt: { not: null } },
    },
    take: 500,
    select: {
      id: true,
      userId: true,
      updatedAt: true,
      user: { select: { email: true, preference: { select: { notificationPrefs: true, emailDigest: true } }, profile: { select: { country: true } } } },
      items: {
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          quantity: true,
          variant: { select: { name: true, priceDeltaMinor: true } },
          product: { select: { id: true, title: true, slug: true, priceMinor: true, currency: true, status: true, shopId: true, shop: { select: { slug: true, status: true } } } },
        },
      },
    },
  });
  if (!carts.length) return { sent: 0 };
  const userIds = carts.map((c) => c.userId);
  const since = new Date(now.getTime() - REMIND_GAP_DAYS * 86_400_000);
  const [recent, orders, fx] = await Promise.all([
    db.notification.findMany({ where: { recipientId: { in: userIds }, type: "RESTOCK", createdAt: { gte: since }, data: { path: ["kind"], equals: "cart" } }, select: { recipientId: true, createdAt: true } }),
    db.order.findMany({ where: { buyerId: { in: userIds }, createdAt: { gte: new Date(now.getTime() - REMIND_UNTIL_H * 3_600_000) } }, select: { buyerId: true, createdAt: true } }),
    getFxRate(),
  ]);
  const lastReminder = new Map<string, Date>();
  for (const r of recent) if (!lastReminder.has(r.recipientId) || lastReminder.get(r.recipientId)! < r.createdAt) lastReminder.set(r.recipientId, r.createdAt);
  const allProducts = carts.flatMap((c) => c.items.map((i) => ({ id: i.product.id, shopId: i.product.shopId })));
  const sales = await salesForProducts(allProducts, now);
  const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

  let sent = 0;
  for (const cart of carts) {
    const purchasable = cart.items.filter((i) => i.product.status === "ACTIVE" && i.product.shop.status === "ACTIVE");
    const orderedSince = orders.some((o) => o.buyerId === cart.userId && o.createdAt > cart.updatedAt);
    const prefs = cart.user.preference?.notificationPrefs ?? null;
    if (!reminderAllowed({ prefs, lastReminderAt: lastReminder.get(cart.userId) ?? null, orderedSince, purchasableCount: purchasable.length }, now)) {
      // Nicht erneut prüfen, bis sich der Warenkorb ändert
      await db.cart.updateMany({ where: { id: cart.id, remindedAt: null }, data: { remindedAt: now } });
      continue;
    }
    // Verbuchen vor dem Versand: lieber eine Erinnerung verlieren als doppelt senden
    const claimed = await db.cart.updateMany({ where: { id: cart.id, remindedAt: null }, data: { remindedAt: now } });
    if (!claimed.count) continue;
    try {
      const to = currencyForCountry(cart.user.profile?.country);
      const lines = purchasable.slice(0, 3).map((i) => {
        const sale = sales.get(i.product.id) ?? null;
        const unit = saleUnit(i.product.priceMinor + (i.variant?.priceDeltaMinor ?? 0), sale);
        const price = formatMoney(convertMinor(unit, i.product.currency, to, fx.rate), to);
        return {
          text: `${i.quantity > 1 ? `${i.quantity} × ` : ""}${i.product.title}${i.variant ? ` (${i.variant.name})` : ""} – ${price}${sale ? ` · in Aktion −${sale.percent} %` : ""}`,
          url: `${appUrl}/markt/${i.product.shop.slug}/${i.product.slug}`,
        };
      });
      const first = purchasable[0]!.product.title;
      const more = purchasable.length - 1;
      const message = `Dein Warenkorb wartet: „${first}“${more > 0 ? ` und ${more === 1 ? "1 weiterer Artikel" : `${more} weitere Artikel`}` : ""}. Die Artikel sind nicht reserviert.`;
      // In-App + Push (die E-Mail geht unten separat raus – deshalb hier als „gemailt“ markiert)
      await db.notification.create({
        data: {
          recipientId: cart.userId,
          type: "RESTOCK",
          targetType: "PRODUCT",
          targetId: purchasable[0]!.product.id,
          data: { kind: "cart", message, href: "/warenkorb", _inApp: true, _email: false },
          emailedAt: now,
        },
      });
      setTimeout(() => void publish([cart.userId], { t: "counts" }), 400);
      if (cart.user.preference?.emailDigest !== "OFF" && !cart.user.email.endsWith(".invalid")) {
        await sendMail(cart.user.email, "Dein Warenkorb wartet", "Du hast Artikel in deinem Warenkorb liegen lassen. Sie sind nicht reserviert – Einzelstücke können jederzeit weg sein.", {
          eyebrow: "Warenkorb",
          heading: "Dein Warenkorb wartet",
          preheader: lines.map((l) => l.text).join(" · ").slice(0, 140),
          items: lines,
          cta: { label: "Zum Warenkorb", url: `${appUrl}/warenkorb` },
          unsubscribeUrl: unsubscribeUrl(cart.userId),
          footerNote: "Du erhältst diese Erinnerung höchstens einmal pro Woche. Abschalten kannst du sie unter Einstellungen → Benachrichtigungen.",
        });
      }
      sent++;
    } catch (e) {
      await captureError(e, { source: "WORKER", path: "cart-reminders", meta: { cartId: cart.id } });
    }
  }
  return { sent };
}
