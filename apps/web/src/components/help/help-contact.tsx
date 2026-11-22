import Link from "next/link";
import { BRAND } from "@/config/brand";
import { LEGAL } from "@/config/legal";

/** „Noch Fragen?“ – Abschluss jeder Hilfe-Seite */
export function HelpContact() {
  return (
    <section aria-labelledby="kontakt-t" className="rounded-2xl border border-line bg-card p-6 sm:p-8">
      <h2 id="kontakt-t" className="headline text-2xl">
        Noch Fragen?
      </h2>
      <p className="mt-2 text-[15px] text-ink-2">
        Schreib uns – ein Mensch liest deine Nachricht und antwortet so rasch wie möglich. Telefonisch erreichst du uns unter{" "}
        <a href={LEGAL.phoneHref} className="text-moss underline underline-offset-2">
          {LEGAL.phone}
        </a>
        .
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link href="/kontakt" className="inline-flex h-10 items-center rounded-xl bg-moss px-4 text-sm font-semibold text-paper hover:bg-moss-ink">
          Support kontaktieren
        </Link>
        <a href={`mailto:${BRAND.supportEmail}`} className="inline-flex h-10 items-center rounded-xl border border-line-strong px-4 text-sm font-semibold hover:border-rule-strong">
          {BRAND.supportEmail}
        </a>
      </div>
      <p className="mt-4 text-xs text-muted">
        Bei akuter Gefahr: Polizei 117 · Sanität 144 · Feuerwehr 118 · Tox Info Suisse 145 · europaweit 112. Inhalte meldest du am schnellsten direkt über „Melden“.
      </p>
    </section>
  );
}
