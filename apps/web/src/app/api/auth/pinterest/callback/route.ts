import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { appleAccountBlocked } from "@/server/identity/apple";
import { encodePending, fetchPinterestAccount, PINTEREST_PENDING_COOKIE, resolvePinterest } from "@/server/identity/pinterest";
import { createSession, currentUser } from "@/server/auth/session";
import { warnNewDevice } from "@/server/auth/new-device";
import { safeNext } from "@/lib/safe-next";

export async function GET(req: NextRequest) {
  const base = process.env.APP_URL ?? req.nextUrl.origin;
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const jar = await cookies();
  const expected = jar.get("wr_pinterest_state")?.value;
  const next = safeNext(jar.get("wr_pinterest_next")?.value);
  const linkMode = jar.get("wr_pinterest_link")?.value === "1";
  jar.delete("wr_pinterest_state");
  jar.delete("wr_pinterest_next");
  jar.delete("wr_pinterest_link");
  const back = (path: string) => NextResponse.redirect(new URL(path, base), 303);
  // Abgebrochen (error=access_denied) oder manipuliert
  if (!code || !expected || state !== expected) return back(linkMode ? "/einstellungen/konto?pinterest=fehler" : "/anmelden?fehler=pinterest");
  try {
    const account = await fetchPinterestAccount(code);
    const me = linkMode ? await currentUser() : null;
    const r = await resolvePinterest(account, me?.id ?? null);
    if (r.kind === "taken") return back("/einstellungen/konto?pinterest=vergeben");
    if (r.kind === "linked") return back(next ?? "/einstellungen/konto?pinterest=verbunden");
    if (r.kind === "signup") {
      jar.set(PINTEREST_PENDING_COOKIE, encodePending(account), { httpOnly: true, secure: true, sameSite: "lax", maxAge: 1800, path: "/" });
      return back("/registrieren/pinterest");
    }
    const blocked = await appleAccountBlocked(r.userId);
    if (blocked) return back(`/anmelden?fehler=${blocked === "BANNED" ? "gesperrt" : "geloescht"}`);
    const s = await createSession(r.userId);
    if (s.mfaRequired) return back(`/anmelden/zwei-faktor${next ? `?weiter=${encodeURIComponent(next)}` : ""}`);
    if (s.isNewDevice) await warnNewDevice(r.userId, s.deviceLabel);
    return back(next ?? "/feed");
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "pinterest_callback", err: e instanceof Error ? e.message : String(e) }));
    return back(linkMode ? "/einstellungen/konto?pinterest=fehler" : "/anmelden?fehler=pinterest");
  }
}
