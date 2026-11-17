import "server-only";
import { Prisma } from "@/server/db";

/**
 * Echte Umsätze: Testkäufe aus der iOS-App (Apple Sandbox/Xcode) zählen nicht – sie werden für das App
 * Review angenommen und schalten den Download frei, es fliesst aber kein Geld.
 */
export const REAL_ORDER: Prisma.OrderWhereInput = { NOT: { appStorePurchase: { is: { environment: { not: "Production" } } } } };

/** Dasselbe für Roh-SQL über "Order" (z. B. weeklySeries). */
export const REAL_ORDER_SQL = Prisma.sql`AND NOT EXISTS (SELECT 1 FROM "AppStorePurchase" a WHERE a."orderId" = "Order"."id" AND a."environment" <> 'Production')`;
