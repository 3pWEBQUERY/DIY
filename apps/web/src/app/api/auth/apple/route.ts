import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { generateState } from "arctic";
import { appleClient } from "@/server/identity/apple";
import { features } from "@/server/env";

/** Start der Anmeldung mit Apple (§8.1, §25.5). */
export async function GET() {
  if (!features.apple()) return NextResponse.redirect(new URL("/anmelden?fehler=apple", process.env.APP_URL));
  const state = generateState();
  const url = appleClient().createAuthorizationURL(state, ["name", "email"]);
  url.searchParams.set("response_mode", "form_post");
  const jar = await cookies();
  // SameSite=None nötig, da Apple per POST (form_post) zurückkehrt
  jar.set("wr_apple_state", state, { httpOnly: true, secure: true, sameSite: "none", maxAge: 600, path: "/" });
  return NextResponse.redirect(url);
}
