import Link from "next/link";
import { Wordmark } from "@/components/shell/wordmark";
import { BRAND } from "@/config/brand";

const LINKS = {
  Rechtliches: [
    { href: "/rechtliches/impressum", label: "Impressum" },
    { href: "/rechtliches/datenschutz", label: "Datenschutz" },
    { href: "/rechtliches/agb", label: "Nutzungsbedingungen" },
  ],
  Richtlinien: [
    { href: "/richtlinien/community", label: "Community" },
    { href: "/richtlinien/marktplatz", label: "Marktplatz" },
    { href: "/richtlinien/sicherheit", label: "Sicherheit beim Selbermachen" },
    { href: "/richtlinien/urheberrecht", label: "Urheberrecht" },
  ],
  Hilfe: [
    { href: "/hilfe", label: "Häufige Fragen" },
    { href: "/einstellungen/hilfe-support", label: "Support kontaktieren" },
  ],
};

/** Redaktionelles Layout für Rechtstexte, Richtlinien und Hilfe – ruhig, gut lesbar, druckbar. */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="border-b border-rule">
        <div className="mx-auto flex h-16 max-w-[1120px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
          <Link href="/" aria-label={`${BRAND.name} – Startseite`}>
            <Wordmark />
          </Link>
          <nav aria-label="Rechtliches" className="hidden items-center gap-6 text-sm text-muted md:flex">
            <Link href="/hilfe" className="hover:text-ink">Hilfe</Link>
            <Link href="/richtlinien/community" className="hover:text-ink">Richtlinien</Link>
            <Link href="/rechtliches/datenschutz" className="hover:text-ink">Datenschutz</Link>
            <Link href="/feed" className="border border-rule px-3 py-1.5 font-semibold text-ink hover:border-moss hover:bg-moss hover:text-paper rounded-2xl">Zur Community</Link>
          </nav>
          <Link href="/feed" className="text-sm font-semibold md:hidden">Zur Community →</Link>
        </div>
      </header>
      <main id="main" className="flex-1">{children}</main>
      <footer className="border-t border-line bg-sunken/50">
        <div className="mx-auto grid max-w-[1120px] gap-8 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-10">
          <div>
            <Wordmark />
            <p className="mt-3 max-w-[16rem] text-xs leading-relaxed text-muted">{BRAND.claim}</p>
          </div>
          {Object.entries(LINKS).map(([title, links]) => (
            <div key={title}>
              <p className="spec mb-3 text-ink">{title}</p>
              <ul className="space-y-1.5 text-sm">
                {links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-ink-2 hover:text-ink hover:underline">{l.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mx-auto flex max-w-[1120px] flex-wrap justify-between gap-2 border-t border-line px-4 py-4 text-xs text-muted sm:px-6 lg:px-10">
          <span>© {new Date().getFullYear()} {BRAND.name} (Arbeitstitel) · Schweiz</span>
          <span>Kontakt: {BRAND.supportEmail}</span>
        </div>
      </footer>
    </div>
  );
}
