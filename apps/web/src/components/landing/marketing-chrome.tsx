import Link from "next/link";
import { Wordmark } from "@/components/shell/wordmark";
import { LinkButton } from "@/components/ui/button";
import { BRAND } from "@/config/brand";
import { LEGAL_BRAND } from "@/config/legal";
import { CATEGORIES, listCategories } from "@werkraum/shared";

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper">
      <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-4 px-4 sm:gap-8 sm:px-8">
        <Link href="/" aria-label={`${BRAND.name} Startseite`} className="shrink-0 rounded-lg">
          <Wordmark height={26} className="sm:hidden" />
          <Wordmark height={30} className="hidden sm:block" />
        </Link>
        <nav aria-label="Bereiche" className="hidden items-center gap-1 text-[14px] font-medium text-ink-2 lg:flex">
          {[
            ["/entdecken", "Entdecken"],
            ["/projekte", "Projekte"],
            ["/anleitungen", "Anleitungen"],
            ["/communities", "Communities"],
            ["/markt", "Marktplatz"],
            ["/blogs", "Blogs"],
          ].map(([href, label]) => (
            <Link key={href} href={href} className="rounded-lg px-3 py-2 transition-colors hover:bg-ink/[0.05] hover:text-ink">
              {label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
          <LinkButton href="/anmelden" variant="ghost" size="sm" className="px-2.5 sm:px-3.5">
            Anmelden
          </LinkButton>
          <LinkButton href="/registrieren" size="sm">
            Kostenlos starten
          </LinkButton>
        </div>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="bg-paper">
      <div className="mx-auto grid max-w-[1240px] grid-cols-2 gap-x-6 gap-y-10 px-5 py-14 sm:px-8 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="col-span-2 md:col-span-1">
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
          links={listCategories({ activeOnly: true }).filter((c) => c.focus || ["holz", "keramik", "moebel-upcycling", "3d-druck"].includes(c.slug)).map((c) => [`/entdecken?kategorie=${c.slug}`, c.name] as [string, string])}
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
            ["/hilfe", "Hilfe"],
            ["/kontakt", "Kontakt"],
          ]}
        />
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4 px-5 py-5 text-xs text-muted sm:px-8">
          <span>© {new Date().getFullYear()} {LEGAL_BRAND}</span>
          <span className="font-semibold">{BRAND.claim}</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <p className="text-[13px] font-bold text-ink">{title}</p>
      <ul className="mt-4 space-y-2.5 text-sm">
        {links.map(([href, label]) => (
          <li key={href}>
            <Link href={href} className="text-muted transition-colors hover:text-ink hover:underline underline-offset-4">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
