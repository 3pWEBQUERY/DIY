import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth/session";
import { SettingsNav } from "@/components/settings/settings-nav";

export const metadata: Metadata = { title: { default: "Einstellungen", template: "%s · Einstellungen" }, robots: { index: false } };

/** Einstellungen (PRD §7, §8.3, §19.3, §23.1) – Unternavigation links, Inhalt rechts. */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user?.profile) redirect("/anmelden?weiter=/einstellungen");
  return (
    <div className="mx-auto w-full max-w-[1040px] px-4 py-6 sm:px-6 md:py-10 lg:px-10">
      <header className="mb-8">
        <p className="spec mb-3 flex items-center gap-2">
          <span className="inline-block h-px w-6 bg-rule-strong" />
          Konto · @{user.profile.handle}
        </p>
        <h1 className="display text-[2.4rem] sm:text-5xl">Einstellungen</h1>
      </header>
      <div className="flex flex-col gap-0 md:flex-row md:gap-12">
        <SettingsNav />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
