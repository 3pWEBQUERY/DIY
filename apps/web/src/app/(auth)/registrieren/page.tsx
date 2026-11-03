import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth/session";
import { features } from "@/server/env";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Konto erstellen" };

export default async function SignUpPage() {
  if (await currentUser()) redirect("/feed");
  return (
    <>
      <p className="spec mb-3">Kostenlos · ab 18 Jahren</p>
      <h1 className="display text-5xl">Konto erstellen</h1>
      <p className="mt-3 text-muted">Ein Konto für alles: entdecken, veröffentlichen, bloggen und später verkaufen.</p>
      <SignUpForm apple={features.apple()} />
    </>
  );
}
