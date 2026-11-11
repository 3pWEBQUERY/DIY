import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { getSession } from "@/server/auth/session";
import { features } from "@/server/env";
import { safeNext } from "@/lib/safe-next";

/**
 * Konten ohne Passwort bestätigen kritische Schritte mit einer frischen Anmeldung beim verknüpften Anbieter.
 * Diese Route wählt ihn (Apple vor Pinterest) und führt danach zu `weiter` zurück.
 */
export async function GET(req: Request) {
  const base = process.env.APP_URL ?? new URL(req.url).origin;
  const next = safeNext(new URL(req.url).searchParams.get("weiter")) ?? "/einstellungen/konto";
  const s = await getSession();
  if (!s) return NextResponse.redirect(new URL(`/anmelden?weiter=${encodeURIComponent(next)}`, base));
  const providers = (await db.authAccount.findMany({ where: { userId: s.user.id }, select: { provider: true } })).map((a) => a.provider);
  const q = `?weiter=${encodeURIComponent(next)}`;
  if (providers.includes("apple") && features.apple()) return NextResponse.redirect(new URL(`/api/auth/apple${q}`, base));
  if (providers.includes("pinterest") && features.pinterest()) return NextResponse.redirect(new URL(`/api/auth/pinterest${q}`, base));
  return NextResponse.redirect(new URL(`/anmelden${q}`, base));
}
