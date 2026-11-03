import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { resolveAppleUser } from "@/server/identity/apple";
import { createSession } from "@/server/auth/session";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const code = form.get("code");
  const state = form.get("state");
  const jar = await cookies();
  const expected = jar.get("wr_apple_state")?.value;
  jar.delete("wr_apple_state");
  const base = process.env.APP_URL ?? req.nextUrl.origin;
  if (typeof code !== "string" || !expected || state !== expected) {
    return NextResponse.redirect(new URL("/anmelden?fehler=apple", base), 303);
  }
  try {
    const { userId, isNew } = await resolveAppleUser(code, typeof form.get("user") === "string" ? (form.get("user") as string) : null);
    await createSession(userId);
    // Erstanmeldung: 18+ und Interessen im Onboarding bestätigen
    return NextResponse.redirect(new URL(isNew ? "/willkommen" : "/feed", base), 303);
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "apple_callback", err: e instanceof Error ? e.message : String(e) }));
    return NextResponse.redirect(new URL("/anmelden?fehler=apple", base), 303);
  }
}
