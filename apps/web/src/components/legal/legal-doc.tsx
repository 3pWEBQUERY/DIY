import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type LegalSection = { id: string; title: string; body: ReactNode };

/**
 * Rechtstext im Werkbuch-Stil: Kicker, Serifentitel, Entwurfshinweis,
 * nummerierte Abschnitte mit Inhaltsverzeichnis (Sprungmarken).
 */
export function LegalDoc({
  kicker,
  title,
  intro,
  updated,
  sections,
  draft = true,
  aside,
}: {
  kicker: string;
  title: string;
  intro?: ReactNode;
  updated: string;
  sections: LegalSection[];
  draft?: boolean;
  aside?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[1120px] px-4 py-10 sm:px-6 md:py-14 lg:px-10">
      <header className="mb-10 max-w-3xl">
        <p className="spec mb-3 flex items-center gap-2">
          <span className="inline-block h-px w-6 bg-rule-strong" />
          {kicker}
        </p>
        <h1 className="display text-[2.6rem] text-balance sm:text-6xl">{title}</h1>
        {intro && <div className="mt-5 text-[17px] leading-relaxed text-ink-2 text-pretty">{intro}</div>}
        <p className="spec mt-5">Stand {updated}</p>
      </header>

      {draft && <DraftNotice className="mb-12 max-w-3xl" />}

      <div className="grid gap-12 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Inhalt" className="h-fit lg:sticky lg:top-8">
          <p className="spec mb-3 text-ink">Inhalt</p>
          <ol className="space-y-1.5 border-l border-line text-[13.5px]">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="-ml-px flex gap-2.5 border-l border-transparent pl-3 text-muted hover:border-rule-strong hover:text-ink">
                  <span className="font-mono text-[10px] leading-5">{String(i + 1).padStart(2, "0")}</span>
                  <span>{s.title}</span>
                </a>
              </li>
            ))}
          </ol>
          {aside && <div className="mt-8">{aside}</div>}
        </nav>

        <article className="max-w-[44rem]">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-t`} className="mb-12 scroll-mt-8">
              <h2 id={`${s.id}-t`} className="mb-4 flex items-baseline gap-3 border-b border-rule pb-2.5 text-[17px] font-bold tracking-tight">
                <span className="spec text-ink">{String(i + 1).padStart(2, "0")}</span>
                {s.title}
              </h2>
              <div className="legal-body space-y-4 text-[15.5px] leading-[1.7] text-ink-2 [&_a]:text-moss [&_a]:underline [&_a]:underline-offset-2 [&_h3]:mt-6 [&_h3]:text-[15px] [&_h3]:font-bold [&_h3]:text-ink [&_li]:relative [&_li]:pl-5 [&_li]:before:absolute [&_li]:before:left-0.5 [&_li]:before:top-[0.85em] [&_li]:before:h-px [&_li]:before:w-2.5 [&_li]:before:bg-ink [&_strong]:text-ink [&_ul]:space-y-1.5">
                {s.body}
              </div>
            </section>
          ))}
        </article>
      </div>
    </div>
  );
}

export function DraftNotice({ className }: { className?: string }) {
  return (
    <div role="note" className={cn("flex gap-4 border border-warn/40 bg-warn-soft px-5 py-4 rounded-2xl", className)}>
      <span className="spec mt-0.5 shrink-0 text-warn">Entwurf</span>
      <p className="text-sm leading-relaxed text-ink-2">
        <strong className="text-ink">Entwurf – vor dem Launch juristisch prüfen.</strong> Dieser Text ist eine sorgfältig vorbereitete Vorlage und noch nicht rechtsverbindlich geprüft. Platzhalter in eckigen Klammern werden vor der Veröffentlichung ersetzt.
      </p>
    </div>
  );
}

/** Kompakte Definitionsliste für Datenblätter (z. B. Impressum, Gebühren). */
export function FactList({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-8 gap-y-3 border-y border-line py-4 sm:grid-cols-[180px_minmax(0,1fr)]">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="spec pt-0.5">{k}</dt>
          <dd className="text-[15px] text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Zweispaltige Gegenüberstellung „erlaubt / nicht erlaubt“. */
export function DoDont({ doTitle = "Erlaubt", dontTitle = "Nicht erlaubt", dos, donts }: { doTitle?: string; dontTitle?: string; dos: ReactNode[]; donts: ReactNode[] }) {
  return (
    <div className="grid gap-px border border-line bg-line sm:grid-cols-2 rounded-2xl overflow-hidden">
      <div className="bg-paper p-4">
        <p className="spec mb-2 text-moss">{doTitle}</p>
        <ul>{dos.map((d, i) => <li key={i}>{d}</li>)}</ul>
      </div>
      <div className="bg-paper p-4">
        <p className="spec mb-2 text-clay-ink">{dontTitle}</p>
        <ul>{donts.map((d, i) => <li key={i}>{d}</li>)}</ul>
      </div>
    </div>
  );
}
