import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser, getPendingMfaSession } from "@/server/auth/session";
import { maskEmail } from "@/server/admin/guard";
import { safeNext } from "@/lib/safe-next";
import { MfaForm } from "./mfa-form";

export const metadata: Metadata = { title: "Zwei-Faktor-Anmeldung", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ weiter?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.weiter, "/feed")!;
  if (await currentUser()) redirect(next);
  const pending = await getPendingMfaSession();
  if (!pending) redirect(`/anmelden?weiter=${encodeURIComponent(next)}`);
  return (
    <>
      <p className="spec mb-3">Schritt 2 von 2</p>
      <h1 className="display text-5xl">Bestätigen</h1>
      <p className="mt-3 text-muted">
        Gib den 6-stelligen Code aus deiner Authenticator-App ein. Angemeldet wird <span className="font-semibold text-ink">{maskEmail(pending.user.email)}</span>.
      </p>
      <MfaForm next={next} />
    </>
  );
}
