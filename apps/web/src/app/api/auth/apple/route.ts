import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { generateState } from "arctic";
import { appleClient } from "@/server/identity/apple";
import { features } from "@/server/env";
import { safeNext } from "@/lib/safe-next";

/**
 * Start der Anmeldung mit Apple (§8.1, §25.5). `?weiter=/pfad` führt danach dorthin zurück – z. B. aus
 * den Einstellungen, wenn ein Konto ohne Passwort einen kritischen Schritt mit Apple bestätigt.
 */
export async function GET(req: Request) {
  if (!features.apple()) return NextResponse.redirect(new URL("/anmelden?fehler=apple", process.env.APP_URL));
  const state = generateState();
  const url = appleClient().createAuthorizationURL(state, ["name", "email"]);
  url.searchParams.set("response_mode", "form_post");
  const jar = await cookies();
  // SameSite=None nötig, da Apple per POST (form_post) zurückkehrt
  jar.set("wr_apple_state", state, { httpOnly: true, secure: true, sameSite: "none", maxAge: 600, path: "/" });
  const next = safeNext(new URL(req.url).searchParams.get("weiter"));
  if (next) jar.set("wr_apple_next", next, { httpOnly: true, secure: true, sameSite: "none", maxAge: 600, path: "/" });
  else jar.delete("wr_apple_next");
  return NextResponse.redirect(url);
}
