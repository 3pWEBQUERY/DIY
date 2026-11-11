import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { generateState } from "arctic";
import { features } from "@/server/env";
import { pinterestAuthorizeUrl } from "@/server/identity/pinterest";
import { safeNext } from "@/lib/safe-next";

/**
 * Start der Anmeldung mit Pinterest. `?verbinden=1` verknüpft Pinterest mit dem angemeldeten Konto
 * (Einstellungen → Konto); `?weiter=/pfad` führt danach dorthin zurück (z. B. Bestätigung kritischer Schritte).
 */
export async function GET(req: Request) {
  const base = process.env.APP_URL ?? new URL(req.url).origin;
  if (!features.pinterest()) return NextResponse.redirect(new URL("/anmelden?fehler=pinterest", base));
  const params = new URL(req.url).searchParams;
  const state = generateState();
  const jar = await cookies();
  // Lax genügt: Pinterest kehrt per GET-Weiterleitung zurück
  const opts = { httpOnly: true, secure: true, sameSite: "lax" as const, maxAge: 600, path: "/" };
  jar.set("wr_pinterest_state", state, opts);
  const next = safeNext(params.get("weiter"));
  if (next) jar.set("wr_pinterest_next", next, opts);
  else jar.delete("wr_pinterest_next");
  if (params.get("verbinden") === "1") jar.set("wr_pinterest_link", "1", opts);
  else jar.delete("wr_pinterest_link");
  return NextResponse.redirect(pinterestAuthorizeUrl(state));
}
