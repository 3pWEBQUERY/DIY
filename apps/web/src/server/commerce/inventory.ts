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

/**
 * Zurückgebuchten Bestand erneut als verkauft verbuchen – nur ganz oder gar nicht: Die Zeilen werden
 * gesperrt und erst geprüft, dann abgebucht. Gibt `false` zurück (ohne etwas zu ändern), wenn auch nur
 * eine Position nicht mehr frei verfügbar ist (z. B. inzwischen an jemand anderen verkauft).
 */
export async function retakeSale(tx: Tx, lines: StockLine[]) {
  const need = new Map<string, { line: StockLine; quantity: number }>();
  for (const l of lines) {
    if (l.isDigital) continue;
    const key = l.variantId ?? `p:${l.productId}`;
    const e = need.get(key);
    if (e) e.quantity += l.quantity;
    else need.set(key, { line: l, quantity: l.quantity });
  }
  for (const { line, quantity } of need.values()) {
    const rows = line.variantId
      ? await tx.$queryRaw<{ free: number }[]>`SELECT "onHand" - "reserved" AS free FROM "InventoryItem" WHERE "variantId" = ${line.variantId} FOR UPDATE`
      : await tx.$queryRaw<{ free: number }[]>`SELECT "onHand" - "reserved" AS free FROM "InventoryItem" WHERE "productId" = ${line.productId} AND "variantId" IS NULL FOR UPDATE`;
    if (!rows[0] || Number(rows[0].free) < quantity) return false;
  }
  for (const l of lines) await commitSale(tx, l, { reserved: false });
  return true;
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
