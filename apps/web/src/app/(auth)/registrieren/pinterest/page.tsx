import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth/session";
import { decodePending, PINTEREST_PENDING_COOKIE } from "@/server/identity/pinterest";
import { Notice } from "@/components/ui/misc";
import { PinterestSignUpForm } from "./form";

export const metadata: Metadata = { title: "Mit Pinterest registrieren", robots: { index: false } };

export default async function PinterestSignUpPage() {
  if (await currentUser()) redirect("/feed");
  const pending = decodePending((await cookies()).get(PINTEREST_PENDING_COOKIE)?.value);
  if (!pending) {
    return (
      <>
        <h1 className="display text-5xl">Mit Pinterest registrieren</h1>
        <Notice tone="warn" className="mt-6">Die Anmeldung mit Pinterest ist abgelaufen oder wurde nicht gestartet.</Notice>
        <p className="mt-6 text-sm text-muted">
          <Link href="/registrieren" className="font-semibold text-ink underline underline-offset-2">Zurück zur Registrierung</Link>
        </p>
      </>
    );
  }
  return (
    <>
      <p className="spec mb-3">Fast geschafft · ab 18 Jahren</p>
      <h1 className="display text-5xl">Konto erstellen</h1>
      <p className="mt-3 text-muted">
        Du bist bei Pinterest als <strong className="text-ink">{pending.username ? `@${pending.username}` : "angemeldet"}</strong> angemeldet. Pinterest gibt keine E-Mail-Adresse weiter – wir brauchen sie für Bestellbestätigungen und Sicherheitshinweise.
      </p>
      <PinterestSignUpForm suggestedName={pending.username} />
    </>
  );
}
