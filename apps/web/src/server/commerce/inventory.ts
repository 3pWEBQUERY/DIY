import "server-only";
import type { Tx } from "@/server/db";

/**
 * Atomare Bestandsoperationen (§31.4 Nr. 8: nicht verfügbare Ware kann nie gekauft werden).
 * Jede Operation ist ein bedingtes UPDATE – kein Lesen-dann-Schreiben, daher ohne Race Conditions.
 * Digitale Positionen haben keinen Bestand und werden übersprungen.
 */
export type StockLine = { productId: string; variantId: string | null; quantity: number; isDigital: boolean };

export class OutOfStockError extends Error {
  constructor(public productId: string) {
    super("nicht mehr verfügbar");
  }
}

/** Reserviert `quantity` Stück, sofern frei verfügbar. Wirft OutOfStockError sonst. */
export async function reserve(tx: Tx, l: StockLine) {
  if (l.isDigital) return;
  const n = l.variantId
    ? await tx.$executeRaw`UPDATE "InventoryItem" SET "reserved" = "reserved" + ${l.quantity}, "updatedAt" = now()
        WHERE "variantId" = ${l.variantId} AND "productId" = ${l.productId} AND "onHand" - "reserved" >= ${l.quantity}`
    : await tx.$executeRaw`UPDATE "InventoryItem" SET "reserved" = "reserved" + ${l.quantity}, "updatedAt" = now()
        WHERE "productId" = ${l.productId} AND "variantId" IS NULL AND "onHand" - "reserved" >= ${l.quantity}`;
  if (n === 0) throw new OutOfStockError(l.productId);
}

/** Gibt eine Reservierung frei (abgebrochene/abgelaufene Zahlung). */
export async function release(tx: Tx, l: StockLine) {
  if (l.isDigital) return;
  if (l.variantId) {
    await tx.$executeRaw`UPDATE "InventoryItem" SET "reserved" = GREATEST("reserved" - ${l.quantity}, 0), "updatedAt" = now() WHERE "variantId" = ${l.variantId}`;
  } else {
    await tx.$executeRaw`UPDATE "InventoryItem" SET "reserved" = GREATEST("reserved" - ${l.quantity}, 0), "updatedAt" = now() WHERE "productId" = ${l.productId} AND "variantId" IS NULL`;
  }
}

/**
 * Wandelt die Reservierung in einen Verkauf um (onHand −q, reserved −q).
 * `reserved: false` = Reservierung war bereits freigegeben (verspätete Zahlung) → nur aus freiem Bestand.
 */
export async function commitSale(tx: Tx, l: StockLine, opts: { reserved: boolean }) {
  if (l.isDigital) return;
  let n: number;
  if (opts.reserved) {
    n = l.variantId
      ? await tx.$executeRaw`UPDATE "InventoryItem" SET "onHand" = "onHand" - ${l.quantity}, "reserved" = "reserved" - ${l.quantity}, "updatedAt" = now()
          WHERE "variantId" = ${l.variantId} AND "reserved" >= ${l.quantity} AND "onHand" >= ${l.quantity}`
      : await tx.$executeRaw`UPDATE "InventoryItem" SET "onHand" = "onHand" - ${l.quantity}, "reserved" = "reserved" - ${l.quantity}, "updatedAt" = now()
          WHERE "productId" = ${l.productId} AND "variantId" IS NULL AND "reserved" >= ${l.quantity} AND "onHand" >= ${l.quantity}`;
    if (n > 0) return;
  }
  n = l.variantId
    ? await tx.$executeRaw`UPDATE "InventoryItem" SET "onHand" = "onHand" - ${l.quantity}, "updatedAt" = now()
        WHERE "variantId" = ${l.variantId} AND "onHand" - "reserved" >= ${l.quantity}`
    : await tx.$executeRaw`UPDATE "InventoryItem" SET "onHand" = "onHand" - ${l.quantity}, "updatedAt" = now()
        WHERE "productId" = ${l.productId} AND "variantId" IS NULL AND "onHand" - "reserved" >= ${l.quantity}`;
  if (n === 0) throw new OutOfStockError(l.productId);
}

/** Bestand nach Stornierung eines bezahlten Auftrags zurückbuchen. */
export async function restock(tx: Tx, l: StockLine) {
  if (l.isDigital) return;
  if (l.variantId) {
    await tx.$executeRaw`UPDATE "InventoryItem" SET "onHand" = "onHand" + ${l.quantity}, "updatedAt" = now() WHERE "variantId" = ${l.variantId}`;
  } else {
    await tx.$executeRaw`UPDATE "InventoryItem" SET "onHand" = "onHand" + ${l.quantity}, "updatedAt" = now() WHERE "productId" = ${l.productId} AND "variantId" IS NULL`;
  }
}

/** ACTIVE ↔ SOLD_OUT anhand des physischen Bestands nachführen. */
export async function refreshSoldOut(tx: Tx, productIds: string[]) {
  for (const id of new Set(productIds)) {
    const p = await tx.product.findUnique({ where: { id }, select: { status: true, kind: true, inventory: { select: { onHand: true } } } });
    if (!p || p.kind === "DIGITAL") continue;
    const onHand = p.inventory.reduce((s, i) => s + Math.max(0, i.onHand), 0);
    if (onHand <= 0 && p.status === "ACTIVE") await tx.product.update({ where: { id }, data: { status: "SOLD_OUT" } });
    else if (onHand > 0 && p.status === "SOLD_OUT") await tx.product.update({ where: { id }, data: { status: "ACTIVE" } });
  }
}

/** Zeilensperre auf eine Bestellung – serialisiert parallele Webhooks/Aktionen. */
export async function lockOrder(tx: Tx, orderId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
}
