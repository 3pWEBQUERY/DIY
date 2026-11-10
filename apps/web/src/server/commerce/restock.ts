import "server-only";
import { z } from "zod";
import { db, Prisma } from "@/server/db";
import { fail } from "@/server/errors";
import { limit } from "@/server/ratelimit";
import { notify } from "@/server/notifications";
import { isBlockedBetween } from "@/server/visibility";
import { captureError } from "@/server/monitoring";
import type { SessionUser } from "@/server/auth/session";

/**
 * Ausverkaufte Produkte: Sichtbarkeit und Anfragen zur Nachproduktion.
 *
 * - Ein ausverkauftes Produkt bleibt standardmässig öffentlich sichtbar („Ausverkauft“). Der Shop kann pro
 *   Produkt wählen, es ausverkauft auszublenden (`hideWhenSoldOut`). Mit neuem Bestand wird es wieder ACTIVE
 *   und damit automatisch wieder sichtbar.
 * - Wer ein sichtbares, ausverkauftes Produkt sieht, kann fragen, ob es nachproduziert wird. Der Shop erhält
 *   eine (gebündelte) Benachrichtigung; sobald das Produkt wieder Bestand hat, werden alle Anfragenden informiert.
 */

/** Öffentlich sichtbare Produkte: aktiv, oder ausverkauft und nicht ausgeblendet. */
export const publicProductWhere = {
  OR: [{ status: "ACTIVE" }, { status: "SOLD_OUT", hideWhenSoldOut: false }],
} satisfies Prisma.ProductWhereInput;

/** Gleiche Regel für SQL (Spaltennamen ohne bzw. mit Tabellen-Alias). */
export function publicProductSql(alias?: string) {
  const c = (col: string) => Prisma.raw(alias ? `${alias}."${col}"` : `"${col}"`);
  return Prisma.sql`(${c("status")} = 'ACTIVE' OR (${c("status")} = 'SOLD_OUT' AND NOT ${c("hideWhenSoldOut")}))`;
}

export function isPublicProduct(p: { status: string; hideWhenSoldOut?: boolean | null }) {
  return p.status === "ACTIVE" || (p.status === "SOLD_OUT" && !p.hideWhenSoldOut);
}

const requestSchema = z.object({ note: z.string().trim().max(500).default("") });

/** Nachproduktion anfragen. Idempotent: eine offene Anfrage pro Person und Produkt. */
export async function requestRestock(user: Pick<SessionUser, "id">, productId: string, input: unknown = {}) {
  const { note } = requestSchema.parse(input ?? {});
  const p = await db.product.findUnique({
    where: { id: productId },
    select: { id: true, title: true, status: true, hideWhenSoldOut: true, kind: true, shop: { select: { id: true, ownerId: true, status: true } } },
  });
  if (!p || !isPublicProduct(p) || !["ACTIVE", "PAUSED"].includes(p.shop.status)) throw fail.notFound("Produkt nicht gefunden.");
  if (p.shop.ownerId === user.id) throw fail.invalid("Das ist dein eigenes Produkt.");
  if (p.status !== "SOLD_OUT") throw fail.conflict("Dieses Produkt ist gerade verfügbar.");
  if (await isBlockedBetween(user.id, p.shop.ownerId)) throw fail.notFound("Produkt nicht gefunden.");

  const existing = await db.restockRequest.findUnique({ where: { productId_userId: { productId, userId: user.id } }, select: { id: true, notifiedAt: true } });
  if (existing && !existing.notifiedAt) {
    // Schon angefragt: nur die Notiz aktualisieren, keine zweite Benachrichtigung
    if (note) await db.restockRequest.update({ where: { id: existing.id }, data: { note } });
    return restockSummary(productId, user.id);
  }
  await limit("restockRequest", user.id);
  await db.$transaction(async (tx) => {
    if (existing) await tx.restockRequest.update({ where: { id: existing.id }, data: { note, notifiedAt: null, createdAt: new Date() } });
    else await tx.restockRequest.create({ data: { productId, userId: user.id, note } });
    await notify(
      {
        recipientId: p.shop.ownerId,
        type: "RESTOCK",
        actorId: user.id,
        targetType: "PRODUCT",
        targetId: p.id,
        data: { kind: "request", title: p.title, excerpt: note || undefined, href: `/studio/produkte/${p.id}` },
      },
      tx,
    );
  });
  return restockSummary(productId, user.id);
}

/** Anfrage zurückziehen. */
export async function cancelRestock(user: Pick<SessionUser, "id">, productId: string) {
  await db.restockRequest.deleteMany({ where: { productId, userId: user.id, notifiedAt: null } });
  return restockSummary(productId, user.id);
}

/** Zustand für die Produktseite: hat die Person angefragt? Offene Anfragen (für den Shop). */
export async function restockSummary(productId: string, viewerId: string | null | undefined) {
  const [mine, pending] = await Promise.all([
    viewerId ? db.restockRequest.findUnique({ where: { productId_userId: { productId, userId: viewerId } }, select: { notifiedAt: true } }) : null,
    db.restockRequest.count({ where: { productId, notifiedAt: null } }),
  ]);
  return { requested: !!mine && !mine.notifiedAt, pendingCount: pending };
}

/** Offene Anfragen je Produkt (Studio-Liste). */
export async function pendingRestockCounts(productIds: string[]) {
  if (!productIds.length) return new Map<string, number>();
  const rows = await db.restockRequest.groupBy({ by: ["productId"], where: { productId: { in: productIds }, notifiedAt: null }, _count: { _all: true } });
  return new Map(rows.map((r) => [r.productId, r._count._all]));
}

/** Offene Anfragen eines Produkts mit Personen (Studio-Editor, nur Eigentümer). */
export async function listRestockRequests(user: Pick<SessionUser, "id">, productId: string) {
  const p = await db.product.findUnique({ where: { id: productId }, select: { shop: { select: { ownerId: true } } } });
  if (!p || p.shop.ownerId !== user.id) throw fail.notFound();
  const rows = await db.restockRequest.findMany({
    where: { productId, notifiedAt: null },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, note: true, createdAt: true, user: { select: { id: true, profile: { select: { handle: true, displayName: true, avatarUrl: true } } } } },
  });
  return rows.map((r) => ({
    id: r.id,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
    user: { id: r.user.id, handle: r.user.profile?.handle ?? "", displayName: r.user.profile?.displayName ?? "", avatarUrl: r.user.profile?.avatarUrl ?? null },
  }));
}

/**
 * Anfragende informieren, deren Produkt wieder Bestand hat. Läuft direkt nach dem Speichern im Editor
 * und zusätzlich minütlich im Worker (z. B. nach Stornierungen, die Bestand zurückbuchen).
 */
export async function notifyBackInStock(productIds?: string[]) {
  const due = await db.restockRequest.findMany({
    where: {
      notifiedAt: null,
      ...(productIds ? { productId: { in: productIds } } : {}),
      product: { status: "ACTIVE", shop: { status: "ACTIVE" } },
    },
    take: 500,
    orderBy: { createdAt: "asc" },
    select: { id: true, userId: true, product: { select: { id: true, title: true, slug: true, shop: { select: { slug: true } } } } },
  });
  let sent = 0;
  for (const r of due) {
    try {
      // Erst markieren, dann benachrichtigen: lieber eine Meldung verlieren als doppelt senden
      const claimed = await db.restockRequest.updateMany({ where: { id: r.id, notifiedAt: null }, data: { notifiedAt: new Date() } });
      if (!claimed.count) continue;
      await notify({
        recipientId: r.userId,
        type: "RESTOCK",
        targetType: "PRODUCT",
        targetId: r.product.id,
        bundle: false,
        data: { kind: "available", title: r.product.title, href: `/markt/${r.product.shop.slug}/${r.product.slug}` },
      });
      sent++;
    } catch (e) {
      captureError(e, { source: "SERVER", path: "commerce/restock:notifyBackInStock" });
    }
  }
  return { sent };
}
