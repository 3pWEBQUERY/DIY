import { z } from "zod";
import * as nl from "@/server/pro/newsletter";
import { countRecipients } from "@/server/pro/newsletter";
import { DELETE, GET, POST, PUT, me, viewerId, type RouteDef } from "../router";

/**
 * Creator-Pro-Newsletter in der App: Follower:innen abonnieren bzw. bestellen ihn auf dem Profil ab;
 * Pro-Creator:innen schreiben, planen und senden im Studio (gleiche Dienste wie /studio/newsletter).
 */
export const newsletterRoutes: RouteDef[] = [
  /** Zustand auf einem Profil (null: kein Pro-Profil, nicht gefolgt oder eigenes Profil) */
  GET("/creators/:id/newsletter", async (c) => ({ newsletter: await nl.newsletterState(await viewerId(), c.p.id!) })),
  PUT("/creators/:id/newsletter", async (c) => {
    const b = z.object({ subscribed: z.boolean() }).parse(await c.json());
    return nl.setNewsletterSubscribed(await me(), c.p.id!, b.subscribed);
  }),

  // ── Studio ──
  GET("/studio/newsletters", async () => nl.listMyNewsletters(await me())),
  /** Eigene Inhalte für Karten (Projekte, Anleitungen, Produkte) */
  GET("/studio/newsletters/options", async () => {
    const u = await me();
    const [options, recipients, quota] = await Promise.all([nl.cardOptions(u), countRecipients(u.id), nl.newsletterQuota(u.id)]);
    return { options, recipients, quota };
  }),
  POST("/studio/newsletters/preview", async (c) => nl.sendNewsletterPreview(await me(), await c.json())),
  POST("/studio/newsletters", async (c) => nl.saveNewsletter(await me(), null, await c.json())),
  GET("/studio/newsletters/:id", async (c) => nl.getMyNewsletter(await me(), c.p.id!)),
  PUT("/studio/newsletters/:id", async (c) => nl.saveNewsletter(await me(), c.p.id!, await c.json())),
  /** Senden: ohne `at` sofort, sonst geplant */
  POST("/studio/newsletters/:id/schedule", async (c) => nl.scheduleNewsletter(await me(), c.p.id!, await c.json().catch(() => ({})))),
  POST("/studio/newsletters/:id/unschedule", async (c) => {
    await nl.unscheduleNewsletter(await me(), c.p.id!);
    return { ok: true };
  }),
  DELETE("/studio/newsletters/:id", async (c) => {
    await nl.deleteNewsletter(await me(), c.p.id!);
    return { ok: true };
  }),
];
