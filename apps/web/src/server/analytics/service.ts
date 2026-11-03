import "server-only";
import { headers } from "next/headers";
import { db, type Tx } from "@/server/db";
import { sha256 } from "@/server/crypto";
import { fail } from "@/server/errors";
import { rateLimit } from "@/server/ratelimit";
import { targetMeta } from "@/server/social/targets";

/**
 * Produktanalyse (PRD §30) – pseudonym, ohne Klartext-PII (§26.3).
 * `track()` ist die einzige Schreibstelle für AnalyticsEvent und darf von allen
 * Domänen genutzt werden. Fehler werden geschluckt: Analytics bricht nie einen Ablauf.
 */

/** Ereignisse, die auf die North-Star-Metrik einzahlen (§30.1: „bedeutsame kreative Aktivität“). */
export const MEANINGFUL_EVENTS = [
  "project_published",
  "project_update",
  "tutorial_completed",
  "remix_shared",
  "qualified_comment",
] as const;
export type MeaningfulEvent = (typeof MEANINGFUL_EVENTS)[number];

/** Bekannte Ereignisnamen (frei erweiterbar, snake_case). */
export type AnalyticsEventName =
  | MeaningfulEvent
  | "view"
  | "tutorial_started"
  | "post_published"
  | "comment_created"
  | "follow"
  | "save"
  | "like"
  | "share"
  | "search"
  | "checkout_started"
  | "order_paid"
  | "signup"
  | "onboarding_completed"
  | (string & {});

export type TrackInput = {
  userId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  ownerId?: string | null;
  meaningful?: boolean;
  props?: Record<string, unknown>;
};

/** Schlüssel, die nie gespeichert werden (Schutz vor versehentlicher PII). */
const PII_KEYS = /^(email|e-?mail|mail|name|displayname|firstname|lastname|phone|tel|address|adresse|ip|ipaddress|useragent|ua|password|token|iban|card)$/i;

function sanitizeProps(props: Record<string, unknown> | undefined) {
  if (!props) return {};
  const out: Record<string, string | number | boolean | null> = {};
  let n = 0;
  for (const [k, v] of Object.entries(props)) {
    if (n >= 20 || PII_KEYS.test(k) || k.length > 40) continue;
    if (typeof v === "string") out[k] = v.slice(0, 120);
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "boolean" || v === null) out[k] = v;
    else continue;
    n++;
  }
  return out;
}

/**
 * Ereignis erfassen. Beispiel:
 * `await track("project_published", { userId, targetType: "PROJECT", targetId, ownerId: userId })`
 */
export async function track(name: AnalyticsEventName, input: TrackInput = {}, tx?: Tx) {
  try {
    const c = tx ?? db;
    const clean = name.trim().toLowerCase().replace(/[^a-z0-9_.]/g, "_").slice(0, 64);
    if (!clean) return null;
    return await c.analyticsEvent.create({
      data: {
        name: clean,
        userId: input.userId ?? null,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        ownerId: input.ownerId ?? null,
        meaningful: input.meaningful ?? (MEANINGFUL_EVENTS as readonly string[]).includes(clean),
        props: sanitizeProps(input.props),
      },
      select: { id: true },
    });
  } catch (e) {
    console.warn(JSON.stringify({ level: "warn", msg: "analytics_track_failed", event: name, err: e instanceof Error ? e.message : String(e) }));
    return null;
  }
}

/**
 * „Qualifizierter Kommentar“ (§30.1): substanzieller Beitrag statt reiner Reaktion.
 * Mind. 40 Zeichen und 6 Wörter, nicht nur Emojis/Satzzeichen.
 */
export function isQualifiedComment(body: string) {
  const text = body.trim();
  const letters = text.replace(/[^\p{L}\p{N}]/gu, "");
  const words = text.split(/\s+/).filter((w) => /[\p{L}\p{N}]{2,}/u.test(w));
  return text.length >= 40 && letters.length >= 25 && words.length >= 6;
}

/** Pseudonymer Betrachterschlüssel: Konto-ID oder tagesaktueller Hash aus IP + Gerät. */
async function viewerKey(userId: string | null) {
  if (userId) return `u:${userId}`;
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "0.0.0.0";
  const ua = h.get("user-agent") ?? "";
  const day = new Date().toISOString().slice(0, 10);
  return `a:${sha256(`${process.env.SESSION_SECRET}:${ip}:${ua}:${day}`).slice(0, 24)}`;
}

const VIEW_DEDUPE_SECONDS = 30 * 60;

/**
 * Aufruf zählen (§20.4: „Aufrufe“ = nicht eindeutige Besucher, aber ohne
 * Mehrfachzählung desselben Betrachters innerhalb von 30 Minuten).
 * Eigene Aufrufe zählen nicht. Bots ohne User-Agent werden ignoriert.
 */
export async function recordView(input: { viewerId: string | null; targetType: string; targetId: string; ref?: string }) {
  const h = await headers();
  const ua = h.get("user-agent") ?? "";
  if (!ua || /bot|crawler|spider|preview|headless/i.test(ua)) return { counted: false as const, reason: "bot" };
  const vk = await viewerKey(input.viewerId);
  // grobe Missbrauchsbremse je Betrachter
  await rateLimit(`track:${vk}`, 600, 3600);

  const meta = await targetMeta(input.targetType as Parameters<typeof targetMeta>[0], input.targetId);
  if (!meta || meta.state !== "PUBLISHED") throw fail.notFound();
  if (input.viewerId && input.viewerId === meta.ownerId) return { counted: false as const, reason: "own" };

  try {
    await rateLimit(`view:${vk}:${input.targetType}:${input.targetId}`, 1, VIEW_DEDUPE_SECONDS);
  } catch {
    return { counted: false as const, reason: "duplicate" };
  }

  await track("view", {
    userId: input.viewerId,
    targetType: input.targetType,
    targetId: input.targetId,
    ownerId: meta.ownerId,
    props: input.ref ? { ref: input.ref } : undefined,
  });
  await bumpViewCount(input.targetType, input.targetId);
  return { counted: true as const };
}

async function bumpViewCount(type: string, id: string) {
  const inc = { viewCount: { increment: 1 } };
  try {
    switch (type) {
      case "PROJECT":
        await db.project.update({ where: { id }, data: inc, select: { id: true } });
        break;
      case "TUTORIAL":
        await db.tutorial.update({ where: { id }, data: inc, select: { id: true } });
        break;
      case "ARTICLE":
        await db.blogArticle.update({ where: { id }, data: inc, select: { id: true } });
        break;
      case "PRODUCT":
        await db.product.update({ where: { id }, data: inc, select: { id: true } });
        break;
    }
  } catch {
    /* Zähler sind Komfort – Ereignis ist die Quelle der Wahrheit */
  }
}
