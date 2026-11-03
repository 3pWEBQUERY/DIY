import "server-only";
import { z } from "zod";
import { db, type Prisma } from "@/server/db";
import { fail } from "@/server/errors";
import { hasRole } from "@/server/authz";
import type { SessionUser } from "@/server/auth/session";

/**
 * Transaktionen & Streitfälle – ausschliesslich ADMIN (§24.3 Trennung von
 * Moderation und Zahlungsverwaltung). Nur lesend; Erstattungen und
 * Statuswechsel laufen über den Commerce-Bereich mit Provider-Events.
 */

type Actor = Pick<SessionUser, "id" | "role">;

function admin(actor: Actor) {
  if (!hasRole(actor, "ADMIN")) throw fail.forbidden();
}

const ORDER_FILTER = z.enum(["ALL", "OPEN", "PAID", "PROBLEM", "REFUNDED", "CANCELLED", "DISPUTED"]).catch("ALL");
export type OrderFilter = z.infer<typeof ORDER_FILTER>;

export async function listOrders(actor: Actor, opts: { filter?: string | null; q?: string | null; page?: number }) {
  admin(actor);
  const page = Math.max(1, opts.page ?? 1);
  const filter = ORDER_FILTER.parse(opts.filter ?? "ALL");
  const where: Prisma.OrderWhereInput = {
    ...(filter === "OPEN" ? { status: { in: ["NEW", "IN_PROGRESS", "READY_TO_SHIP", "SHIPPED"] } } : {}),
    ...(filter === "PAID" ? { paidAt: { not: null } } : {}),
    ...(filter === "PROBLEM" ? { status: "PROBLEM" } : {}),
    ...(filter === "REFUNDED" ? { status: "REFUNDED" } : {}),
    ...(filter === "CANCELLED" ? { status: "CANCELLED" } : {}),
    ...(filter === "DISPUTED" ? { payments: { some: { status: "DISPUTED" } } } : {}),
    ...(opts.q ? { OR: [{ number: opts.q.toUpperCase() }, { id: opts.q }, { shop: { slug: opts.q.toLowerCase() } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * 50,
      take: 50,
      select: {
        id: true,
        number: true,
        status: true,
        currency: true,
        totalMinor: true,
        platformFeeMinor: true,
        feeBps: true,
        paidAt: true,
        createdAt: true,
        shop: { select: { name: true, slug: true } },
        buyer: { select: { profile: { select: { handle: true } } } },
        payments: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, failureReason: true } },
        _count: { select: { items: true, refunds: true } },
      },
    }),
    db.order.count({ where }),
  ]);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / 50)), filter };
}

/** Streitfälle: Zahlungen im Status DISPUTED und Bestellungen im Problemfall. */
export async function listDisputes(actor: Actor) {
  admin(actor);
  const [disputed, problems, refundsPending, payoutsFailed] = await Promise.all([
    db.payment.findMany({
      where: { status: "DISPUTED" },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: { id: true, amountMinor: true, currency: true, updatedAt: true, providerRef: true, order: { select: { id: true, number: true, status: true, shop: { select: { name: true, slug: true } } } } },
    }),
    db.order.findMany({
      where: { status: "PROBLEM" },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        number: true,
        totalMinor: true,
        currency: true,
        updatedAt: true,
        shop: { select: { name: true, slug: true } },
        events: { where: { to: "PROBLEM" }, orderBy: { createdAt: "desc" }, take: 1, select: { note: true, createdAt: true } },
      },
    }),
    db.refund.count({ where: { status: "PENDING" } }),
    db.payoutRecord.count({ where: { status: { in: ["failed", "FAILED", "canceled", "CANCELED"] } } }),
  ]);
  return { disputed, problems, refundsPending, payoutsFailed };
}
