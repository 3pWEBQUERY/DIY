import { createHash } from "node:crypto";
import { db } from "@/server/db";
import { sha256 } from "@/server/crypto";

/**
 * Fehlerüberwachung ohne Fremddienst: unerwartete Fehler aus Server, Browser und Worker
 * landen gruppiert in der Datenbank (Admin → Fehler). Neue Fehler und Rückfälle bereits
 * erledigter Fehler melden sich bei der Administration (höchstens einmal pro Stunde je Fehler).
 *
 * `captureError` wirft nie und blockiert keine Anfrage länger als nötig.
 */

export type ErrorSource = "SERVER" | "CLIENT" | "WORKER";
export type CaptureContext = {
  source: ErrorSource;
  path?: string | null;
  method?: string | null;
  userId?: string | null;
  userAgent?: string | null;
  digest?: string | null;
  meta?: Record<string, unknown>;
};

const RELEASE = process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? null;
const ALERT_EVERY_MS = 60 * 60 * 1000;

/**
 * Browserberichte kommen über einen offenen Endpunkt (auch ohne Anmeldung) und enthalten frei
 * wählbaren Text. Deshalb: höchstens so viele neue Fehlergruppen pro Stunde (der Rest läuft in einer
 * Sammelgruppe auf), keine Meldung für anonyme Berichte, und Meldungen ohne den gemeldeten Text –
 * sonst liessen sich Admins mit beliebigen Nachrichten fluten („Bitte Passwort unter … bestätigen“).
 */
export const CLIENT_NEW_GROUPS_PER_HOUR = 50;
export const CLIENT_OVERFLOW_FINGERPRINT = "client-overflow";
const CLIENT_OVERFLOW = { name: "ClientErrorOverflow", message: "Weitere neue Browserfehler (Stundenlimit für neue Fehlergruppen erreicht)" };

/** Text der Admin-Meldung. Bei Browserfehlern neutral, ohne gemeldeten Namen oder Text. */
export function alertMessage(source: ErrorSource, regression: boolean, name: string, message: string) {
  if (source === "CLIENT") return "Neue Fehler im Browser gemeldet – Details in der Fehlerübersicht.";
  return `${regression ? "Erneut aufgetreten" : "Neuer Fehler"} (${SOURCE_LABEL[source]}): ${name}: ${message.slice(0, 140)}`;
}

/** Erwartete Abläufe (Redirect, 404, fachliche Fehler) sind keine Fehler. */
function isExpected(e: unknown) {
  if (!e || typeof e !== "object") return false;
  const d = (e as { digest?: unknown }).digest;
  if (typeof d === "string" && (d.startsWith("NEXT_REDIRECT") || d.startsWith("NEXT_HTTP_ERROR_FALLBACK") || d === "NEXT_NOT_FOUND" || d === "DYNAMIC_SERVER_USAGE")) return true;
  const n = (e as { name?: unknown }).name;
  return n === "AppError" || n === "ZodError" || n === "AbortError" || n === "ResponseAborted";
}

/** IDs, Zahlen und Zeichenketten aus Meldungen entfernen, damit gleiche Fehler zusammenfallen. */
export function normalizeMessage(m: string) {
  return m
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<uuid>")
    .replace(/\bc[a-z0-9]{20,30}\b/g, "<id>")
    .replace(/(["'`])(?:(?!\1).){1,200}\1/g, "<str>")
    .replace(/\b\d+(\.\d+)?\b/g, "<n>")
    .slice(0, 300);
}

/** Die obersten Stack-Zeilen ohne Zeilen-/Spaltennummern und Build-Hashes. */
function stackSignature(stack: string | undefined) {
  if (!stack) return "";
  return stack
    .split("\n")
    .slice(1)
    .filter((l) => /^\s*at /.test(l) || /@/.test(l))
    .filter((l) => !/node_modules|node:internal|<anonymous>/.test(l))
    .slice(0, 3)
    .map((l) => l.trim().replace(/:\d+:\d+\)?$/, "").replace(/[-.][0-9a-f]{8,}\./gi, ".").replace(/\?[^)\s]*/, ""))
    .join("|");
}

export function fingerprint(source: ErrorSource, name: string, message: string, stack?: string) {
  return createHash("sha1").update([source, name, normalizeMessage(message), stackSignature(stack)].join("\n")).digest("hex");
}

// Schutz vor Fehlerschleifen: je Fingerabdruck höchstens 20 Einträge pro Minute und Prozess
const recent = new Map<string, { n: number; at: number }>();
function throttled(fp: string) {
  const now = Date.now();
  const r = recent.get(fp);
  if (!r || now - r.at > 60_000) {
    recent.set(fp, { n: 1, at: now });
    if (recent.size > 500) recent.clear();
    return false;
  }
  r.n++;
  return r.n > 20;
}

const clip = (s: string | null | undefined, n: number) => (s ? s.slice(0, n) : null);
const cleanPath = (p: string | null | undefined) => (p ? p.split("?")[0]!.slice(0, 300) : null);

export async function captureError(err: unknown, ctx: CaptureContext) {
  try {
    if (isExpected(err)) return null;
    const e = err instanceof Error ? err : new Error(typeof err === "string" ? err : JSON.stringify(err ?? "Unbekannter Fehler"));
    let name = clip(e.name || "Error", 120)!;
    let message = clip(e.message?.trim() || "(ohne Meldung)", 1000)!;
    let stack = clip(e.stack, 8000);
    let fp = fingerprint(ctx.source, name, message, stack ?? undefined);
    if (throttled(fp)) return null;
    console.error(JSON.stringify({ level: "error", msg: "captured", source: ctx.source, name, err: message, path: cleanPath(ctx.path), fp: fp.slice(0, 10) }));

    const findGroup = (f: string) => db.errorGroup.findUnique({ where: { fingerprint: f }, select: { id: true, resolvedAt: true, ignoredAt: true, lastAlertAt: true } });
    let prev = await findGroup(fp);
    if (!prev && ctx.source === "CLIENT") {
      const fresh = await db.errorGroup.count({ where: { source: "CLIENT", firstSeenAt: { gt: new Date(Date.now() - ALERT_EVERY_MS) } } });
      if (fresh >= CLIENT_NEW_GROUPS_PER_HOUR) {
        // Stundenlimit erreicht: in die Sammelgruppe statt beliebig viele neue Gruppen anzulegen
        ({ name, message } = CLIENT_OVERFLOW);
        stack = null;
        fp = CLIENT_OVERFLOW_FINGERPRINT;
        prev = await findGroup(fp);
      }
    }
    const firstForUser = ctx.userId && prev ? !(await db.errorOccurrence.findFirst({ where: { groupId: prev.id, userId: ctx.userId }, select: { id: true } })) : !!ctx.userId;
    const g = await db.errorGroup.upsert({
      where: { fingerprint: fp },
      create: { fingerprint: fp, source: ctx.source, name, message, stack, lastPath: cleanPath(ctx.path), release: RELEASE ?? null, usersHit: ctx.userId ? 1 : 0 },
      update: {
        count: { increment: 1 },
        lastSeenAt: new Date(),
        message,
        stack,
        lastPath: cleanPath(ctx.path),
        release: RELEASE ?? undefined,
        resolvedAt: null, // Rückfall öffnet den Fehler wieder
        ...(firstForUser ? { usersHit: { increment: 1 } } : {}),
      },
      select: { id: true },
    });
    await db.errorOccurrence.create({
      data: {
        groupId: g.id,
        path: cleanPath(ctx.path),
        method: clip(ctx.method, 10),
        userId: ctx.userId ?? null,
        userAgent: clip(ctx.userAgent, 400),
        release: RELEASE,
        digest: clip(ctx.digest, 64),
        meta: (ctx.meta ?? {}) as object,
      },
    });

    const isNew = !prev;
    const regression = !!prev?.resolvedAt;
    const muted = !!prev?.ignoredAt;
    if ((isNew || regression) && !muted && (!prev?.lastAlertAt || Date.now() - prev.lastAlertAt.getTime() > ALERT_EVERY_MS)) {
      if (ctx.source === "CLIENT") {
        // Anonyme Berichte melden sich nie; angemeldete höchstens einmal pro Stunde für alle Browserfehler zusammen
        const since = new Date(Date.now() - ALERT_EVERY_MS);
        const alerted = ctx.userId ? await db.errorGroup.findFirst({ where: { source: "CLIENT", lastAlertAt: { gt: since } }, select: { id: true } }) : null;
        if (ctx.userId && !alerted) {
          await db.errorGroup.update({ where: { id: g.id }, data: { lastAlertAt: new Date() } });
          await alertAdmins("/admin/fehler?status=open&quelle=CLIENT", alertMessage("CLIENT", regression, name, message));
        }
      } else {
        await db.errorGroup.update({ where: { id: g.id }, data: { lastAlertAt: new Date() } });
        await alertAdmins(`/admin/fehler/${g.id}`, alertMessage(ctx.source, regression, name, message));
      }
    }
    return g.id;
  } catch (inner) {
    // Monitoring darf nie selbst Fehler werfen
    console.error(JSON.stringify({ level: "error", msg: "capture_failed", err: String(inner) }));
    return null;
  }
}

export const SOURCE_LABEL: Record<ErrorSource, string> = { SERVER: "Server", CLIENT: "Browser", WORKER: "Hintergrunddienst" };

async function alertAdmins(href: string, message: string) {
  const { notify } = await import("@/server/notifications");
  const admins = await db.user.findMany({ where: { role: { in: ["ADMIN", "SUPERADMIN"] }, status: "ACTIVE" }, select: { id: true } });
  for (const a of admins) {
    await notify({ recipientId: a.id, type: "MODERATION", data: { kind: "SYSTEM_ERROR", message, href }, bundle: false }).catch(() => {});
  }
}

/** Kontext der laufenden Anfrage (Pfad, Methode, Browser, Konto) – nur wenn verfügbar. */
export async function requestContext(): Promise<Omit<CaptureContext, "source">> {
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    const referer = h.get("referer");
    const path = h.get("x-invoke-path") ?? h.get("next-url") ?? (referer ? new URL(referer).pathname : null);
    let userId: string | null = null;
    try {
      const { currentUser } = await import("@/server/auth/session");
      userId = (await currentUser())?.id ?? null;
    } catch {}
    return { path, userAgent: h.get("user-agent"), userId };
  } catch {
    return {};
  }
}

/** Konto aus dem Session-Cookie (für Fehler beim Rendern, ohne Request-Kontext von next/headers). */
export async function userIdFromCookieHeader(cookie: string | string[] | undefined | null) {
  try {
    const raw = (Array.isArray(cookie) ? cookie.join("; ") : cookie ?? "").match(/(?:^|;\s*)wr_session=([^;]+)/)?.[1];
    if (!raw) return null;
    const s = await db.session.findUnique({ where: { id: sha256(decodeURIComponent(raw)) }, select: { userId: true } });
    return s?.userId ?? null;
  } catch {
    return null;
  }
}
