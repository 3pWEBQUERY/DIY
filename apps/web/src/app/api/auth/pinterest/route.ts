import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { generateState } from "arctic";
import { features } from "@/server/env";
import { AppError } from "@/server/errors";
import { getSession } from "@/server/auth/session";
import { beginPinterestLink, PINTEREST_LINK_COOKIE, pinterestAuthorizeUrl } from "@/server/identity/pinterest";
import { safeNext } from "@/lib/safe-next";

const LINK_START = "/api/auth/pinterest?verbinden=1";

/**
 * Start der Anmeldung mit Pinterest. `?verbinden=1` verknüpft Pinterest mit dem angemeldeten Konto
 * (Einstellungen → Konto); `?weiter=/pfad` führt danach dorthin zurück (z. B. Bestätigung kritischer Schritte).
 *
 * Verknüpfen braucht eine erneute Bestätigung (eine gestohlene Sitzung allein reicht nie):
 * - Konto ohne Passwort → GET kurz nach einer frischen Anmeldung (sonst über /api/auth/reauth zurück hierher).
 * - Konto mit Passwort → POST mit `password` (Formular); ein GET führt zurück zu den Einstellungen.
 */
export async function GET(req: Request) {
  return start(req, null);
}

export async function POST(req: Request) {
  const base = process.env.APP_URL ?? new URL(req.url).origin;
  // Route-Handler haben keinen eingebauten CSRF-Schutz wie Server Actions → nur Formulare dieser Seite
  if (req.headers.get("origin") !== new URL(base).origin) return new NextResponse(null, { status: 403 });
  const form = await req.formData().catch(() => null);
  const password = form?.get("password");
  return start(req, typeof password === "string" ? password : "");
}

async function start(req: Request, password: string | null) {
  const base = process.env.APP_URL ?? new URL(req.url).origin;
  const back = (path: string) => NextResponse.redirect(new URL(path, base), 303);
  if (!features.pinterest()) return back("/anmelden?fehler=pinterest");
  const params = new URL(req.url).searchParams;
  const linkMode = password !== null || params.get("verbinden") === "1";
  const jar = await cookies();
  // Lax genügt: Pinterest kehrt per GET-Weiterleitung zurück
  const opts = { httpOnly: true, secure: true, sameSite: "lax" as const, maxAge: 600, path: "/" };
  if (linkMode) {
    const s = await getSession();
    if (!s) return back(`/anmelden?weiter=${encodeURIComponent("/einstellungen/konto")}`);
    try {
      const r = await beginPinterestLink(s.user.id, s.sessionId, { password });
      if (!r.ok) return back(r.need === "password" ? "/einstellungen/konto?pinterest=bestaetigen" : `/api/auth/reauth?weiter=${encodeURIComponent(LINK_START)}`);
      jar.set(PINTEREST_LINK_COOKIE, r.grant, opts);
    } catch (e) {
      // Falsches Passwort bzw. zu viele Versuche
      return back(e instanceof AppError && e.code === "VALIDATION" ? "/einstellungen/konto?pinterest=passwort" : "/einstellungen/konto?pinterest=fehler");
    }
  } else {
    jar.delete(PINTEREST_LINK_COOKIE);
  }
  const state = generateState();
  jar.set("wr_pinterest_state", state, opts);
  const next = safeNext(params.get("weiter"));
  if (next) jar.set("wr_pinterest_next", next, opts);
  else jar.delete("wr_pinterest_next");
  // 303: nach einem POST per GET weiter zu Pinterest
  return NextResponse.redirect(pinterestAuthorizeUrl(state), 303);
}
