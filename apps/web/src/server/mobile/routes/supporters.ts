import { z } from "zod";
import * as support from "@/server/supporters/service";
import { fail } from "@/server/errors";
import { GET, POST, PUT, me, viewerId, zBool, type RouteDef } from "../router";

/**
 * Unterstützer-Abo in der App. Gekauft wird ausschliesslich über Apple (Abo ohne automatische
 * Verlängerung, 1 Monat) – Web-Abos (Stripe) lassen sich hier ansehen und kündigen.
 */
export const supporterRoutes: RouteDef[] = [
  /** Angebot einer Person und eigener Stand; mit Apple-Produkt und Konto-Token zum Kaufen */
  GET("/creators/:id/support", async (c) => {
    const vid = await viewerId();
    const offer = await support.supportOffer(c.p.id!, vid);
    if (!offer) return { offer: null, apple: null };
    let apple: { productId: string; appAccountToken: string } | null = null;
    if (vid && vid !== c.p.id && offer.enabled) apple = await support.appleSupportOffer({ id: vid }, c.p.id!).catch(() => null);
    return { offer, apple };
  }),
  /** Kauf aus der App verbuchen (signierte Transaktion) */
  POST("/creators/:id/support/apple", async (c) => {
    const b = z.object({ signedTransaction: z.string().min(20) }).parse(await c.json());
    return support.syncAppleSupportFromApp(await me(), c.p.id!, b);
  }),
  /** Web-Abo kündigen bzw. Kündigung zurücknehmen */
  POST("/creators/:id/support/cancel", async (c) => {
    const { cancel } = await c.body({ cancel: zBool });
    return support.setSupportCancel(await me(), c.p.id!, cancel !== false);
  }),
  GET("/me/supporting", async () => support.listMySupporting((await me()).id)),

  // ── Studio: eigenes Unterstützer-Abo ──
  GET("/studio/support", async () => support.getMySupportStudio((await me()).id)),
  PUT("/studio/support", async (c) => {
    const u = await me();
    const r = await support.saveSupportPlan(u, await c.json());
    if (!r) throw fail.invalid("Speichern nicht möglich.");
    return support.getMySupportStudio(u.id);
  }),
];
