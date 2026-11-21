import "server-only";
import { db, type Prisma } from "@/server/db";

/**
 * Summen über Bestellungen in der Shop-Währung. Bestellungen, die in der anderen Währung bezahlt wurden
 * (Mitglieder aus DE/AT bzw. CH/LI), tragen den Kurs vom Kauf in `shopFx`; gruppiert nach Kurs, damit
 * die Datenbank summiert und nur wenige Zeilen zurückkommen.
 */
export async function sumOrdersInShopCurrency(where: Prisma.OrderWhereInput) {
  const groups = await db.order.groupBy({ by: ["shopFx"], where, _sum: { totalMinor: true, platformFeeMinor: true }, _count: { _all: true } });
  return groups.reduce(
    (a, g) => {
      const f = g.shopFx ?? 1;
      a.totalMinor += Math.round((g._sum.totalMinor ?? 0) * f);
      a.platformFeeMinor += Math.round((g._sum.platformFeeMinor ?? 0) * f);
      a.count += g._count._all;
      return a;
    },
    { totalMinor: 0, platformFeeMinor: 0, count: 0 },
  );
}
