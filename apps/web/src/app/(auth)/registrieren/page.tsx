import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth/session";
import { features } from "@/server/env";
import { SignUpForm } from "./sign-up-form";
import Link from "next/link";
import { flagEnabled, flagPausedMessage } from "@/server/flags";
import { Notice } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Konto erstellen" };

export default async function SignUpPage() {
  if (await currentUser()) redirect("/feed");
  if (!(await flagEnabled("signup")))
    return (
      <>
        <p className="spec mb-3">Vorübergehend pausiert</p>
        <h1 className="display text-5xl">Konto erstellen</h1>
        <Notice tone="warn" className="mt-6">{flagPausedMessage("signup")}</Notice>
        <p className="mt-6 text-sm text-muted">
          Schon ein Konto? <Link href="/anmelden" className="font-semibold text-ink underline underline-offset-2">Anmelden</Link>
        </p>
      </>
    );
  return (
    <>
      <p className="spec mb-3">Kostenlos · ab 18 Jahren</p>
      <h1 className="display text-5xl">Konto erstellen</h1>
      <p className="mt-3 text-muted">Ein Konto für alles: entdecken, veröffentlichen, bloggen und später verkaufen.</p>
      <SignUpForm apple={features.apple()} />
    </>
  );
}
