import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser, getPendingMfaSession } from "@/server/auth/session";
import { features } from "@/server/env";
import { SignInForm } from "./sign-in-form";
import { safeNext } from "@/lib/safe-next";

export const metadata: Metadata = { title: "Anmelden", robots: { index: false } };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ weiter?: string; fehler?: string }> }) {
  const sp = await searchParams;
  if (await currentUser()) redirect(safeNext(sp.weiter, "/feed")!);
  // Passwort schon geprüft, Code fehlt noch → direkt zur Code-Eingabe
  if (await getPendingMfaSession()) redirect(`/anmelden/zwei-faktor?weiter=${encodeURIComponent(safeNext(sp.weiter, "/feed")!)}`);
  return (
    <>
      <p className="spec mb-3">Willkommen zurück</p>
      <h1 className="display text-5xl">Anmelden</h1>
      <p className="mt-3 text-muted">Schön, dass du wieder da bist. Deine Projekte warten.</p>
      <SignInForm next={sp.weiter} apple={features.apple()} pinterest={features.pinterest()} error={sp.fehler} />
    </>
  );
}
