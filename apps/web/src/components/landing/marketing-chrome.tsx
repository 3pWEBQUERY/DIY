import Link from "next/link";
import { Wordmark } from "@/components/shell/wordmark";
import { LinkButton } from "@/components/ui/button";
import { BRAND } from "@/config/brand";
import { CATEGORIES } from "@werkraum/shared";

export function MarketingHeader() {
  return (
    <header className="relative z-20 border-b border-line bg-paper">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-8 px-5 sm:px-8">
        <Link href="/" aria-label={`${BRAND.name} Startseite`}>
          <Wordmark />
        </Link>
        <nav aria-label="Bereiche" className="hidden items-center gap-6 text-[14px] text-ink-2 md:flex">
          <Link href="/entdecken" className="ink-link">Entdecken</Link>
          <Link href="/projekte" className="ink-link">Projekte</Link>
          <Link href="/anleitungen" className="ink-link">Anleitungen</Link>
          <Link href="/communities" className="ink-link">Communities</Link>
          <Link href="/markt" className="ink-link">Marktplatz</Link>
          <Link href="/blogs" className="ink-link">Blogs</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <LinkButton href="/anmelden" variant="ghost" size="sm" className="hidden sm:inline-flex">
            Anmelden
          </LinkButton>
          <LinkButton href="/registrieren" size="sm">
            Beitreten
          </LinkButton>
        </div>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-rule bg-paper">
      <div className="mx-auto grid max-w-[1400px] gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Wordmark />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">{BRAND.description}</p>
          <p className="mt-6 spec">Gemacht in der Schweiz · für D-A-CH</p>
        </div>
        <FooterCol
          title="Entdecken"
          links={[
            ["/projekte", "Projekte"],
            ["/anleitungen", "Anleitungen"],
            ["/communities", "Communities"],
            ["/markt", "Marktplatz"],
            ["/blogs", "Blogs"],
            ["/materialien", "Materialien"],
          ]}
        />
        <FooterCol
          title="Kategorien"
          links={CATEGORIES.filter((c) => c.focus || ["holz", "keramik", "moebel-upcycling", "3d-druck"].includes(c.slug)).map((c) => [`/entdecken?kategorie=${c.slug}`, c.name] as [string, string])}
        />
        <FooterCol
          title="Vertrauen"
          links={[
            ["/richtlinien/community", "Community-Richtlinien"],
            ["/richtlinien/marktplatz", "Marktplatz-Richtlinien"],
            ["/richtlinien/sicherheit", "Sicherheit bei DIY"],
            ["/rechtliches/datenschutz", "Datenschutz"],
            ["/rechtliches/agb", "Nutzungsbedingungen"],
            ["/rechtliches/impressum", "Impressum"],
            ["/hilfe", "Hilfe & Kontakt"],
          ]}
        />
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 px-5 py-5 text-xs text-muted sm:px-8">
          <span>© {new Date().getFullYear()} {BRAND.name} (Arbeitstitel)</span>
          <span className="font-mono uppercase tracking-[0.12em]">{BRAND.claim}</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <p className="spec text-ink">{title}</p>
      <ul className="mt-4 space-y-2.5 text-sm">
        {links.map(([href, label]) => (
          <li key={href}>
            <Link href={href} className="text-ink-2 hover:text-ink hover:underline underline-offset-4">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
