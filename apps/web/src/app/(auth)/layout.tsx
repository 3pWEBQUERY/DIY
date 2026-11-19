import Link from "next/link";
import type { Metadata } from "next";
import { Wordmark } from "@/components/shell/wordmark";
import { AuthAside } from "@/components/auth/auth-aside";

// Anmelden, Registrieren, Passwort … gehören nicht in die Suchergebnisse (Links darauf dürfen gefolgt werden)
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <Link href="/" className="w-fit" aria-label="Zur Startseite">
          <Wordmark />
        </Link>
        <main id="main" className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-12">
          {children}
        </main>
        <footer className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
          <Link href="/rechtliches/datenschutz" className="hover:text-ink">Datenschutz</Link>
          <Link href="/rechtliches/agb" className="hover:text-ink">Nutzungsbedingungen</Link>
          <Link href="/rechtliches/impressum" className="hover:text-ink">Impressum</Link>
          <Link href="/hilfe" className="hover:text-ink">Hilfe</Link>
        </footer>
      </div>
      <AuthAside />
    </div>
  );
}
