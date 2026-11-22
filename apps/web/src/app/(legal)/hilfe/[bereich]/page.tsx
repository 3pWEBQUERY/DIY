import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRight, Plus } from "lucide-react";
import { BRAND } from "@/config/brand";
import { HELP_CATEGORIES, articleAnswer, fillHelp, helpCategory } from "@/lib/help/content";
import { helpVars } from "@/server/help";
import { HelpText } from "@/components/help/help-text";
import { HelpIcon } from "@/components/help/help-icon";
import { HelpContact } from "@/components/help/help-contact";
import { OpenHashDetails } from "@/components/help/open-hash";

type Params = { bereich: string };

export const revalidate = 300;
export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return HELP_CATEGORIES.map((c) => ({ bereich: c.id }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const c = helpCategory((await params).bereich);
  if (!c) return {};
  return {
    title: `${c.title} · Hilfe`,
    description: `${c.summary} Antworten im Hilfe-Center von ${BRAND.name}.`,
    alternates: { canonical: `/hilfe/${c.id}` },
  };
}

export default async function HelpCategoryPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ bereich }, sp] = await Promise.all([params, searchParams]);
  const c = helpCategory(bereich);
  if (!c) notFound();
  const inApp = sp.app === "ios";
  const suffix = inApp ? "?app=ios" : "";
  const vars = await helpVars();
  const at = HELP_CATEGORIES.findIndex((x) => x.id === c.id);

  return (
    <div className="mx-auto max-w-[1120px] px-4 py-10 sm:px-6 md:py-14 lg:px-10">
      <OpenHashDetails />
      <nav aria-label="Brotkrumen" className="spec mb-6 flex flex-wrap items-center gap-2">
        <Link href={`/hilfe${suffix}`} className="hover:text-ink">
          Hilfe-Center
        </Link>
        <span aria-hidden>/</span>
        <span className="text-ink" aria-current="page">
          {c.title}
        </span>
      </nav>

      <header className="mb-10 flex max-w-3xl gap-5">
        <span className="hidden size-14 shrink-0 place-items-center rounded-2xl bg-moss-soft text-moss-ink sm:grid">
          <HelpIcon name={c.icon} size={24} />
        </span>
        <div>
          <h1 className="display text-[2.3rem] sm:text-5xl">{c.title}</h1>
          <p className="mt-3 text-[16.5px] leading-relaxed text-ink-2">{c.summary}</p>
          {c.links.length > 0 && (
            <ul className="mt-5 flex flex-wrap gap-2" aria-label="Direkt zu">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line-strong px-3.5 text-[13.5px] font-semibold text-ink hover:border-moss hover:text-moss-ink">
                    {l.label} <ArrowRight size={13} aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </header>

      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="min-w-0 max-w-[46rem]">
          <h2 className="sr-only">Fragen und Antworten</h2>
          <div className="divide-y divide-line border-y border-line">
            {c.articles.map((a) => (
              <details key={a.id} id={a.id} className="group scroll-mt-8">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4 rounded-md py-4 text-[16px] font-semibold text-ink marker:hidden hover:text-moss-ink focus-visible:outline-2 focus-visible:outline-moss [&::-webkit-details-marker]:hidden">
                  {fillHelp(a.q, vars)}
                  <Plus size={16} aria-hidden className="mt-1 shrink-0 text-muted transition-transform group-open:rotate-45" />
                </summary>
                <div className="pb-5 pr-2 text-[15px] leading-relaxed text-ink-2 sm:pr-8 [&_a]:text-moss [&_a]:underline [&_a]:underline-offset-2 [&_strong]:text-ink">
                  <HelpText text={articleAnswer(a, vars, inApp)} />
                  <a href={`#${a.id}`} className="mt-3 inline-block font-mono text-[11px] uppercase tracking-[0.06em] !text-muted !no-underline hover:!text-ink">
                    Link zu dieser Antwort
                  </a>
                </div>
              </details>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap justify-between gap-3 text-[14px]">
            {at > 0 ? (
              <Link href={`/hilfe/${HELP_CATEGORIES[at - 1]!.id}${suffix}`} className="font-semibold text-ink-2 hover:text-ink">
                ← {HELP_CATEGORIES[at - 1]!.title}
              </Link>
            ) : (
              <span />
            )}
            {at < HELP_CATEGORIES.length - 1 && (
              <Link href={`/hilfe/${HELP_CATEGORIES[at + 1]!.id}${suffix}`} className="font-semibold text-ink-2 hover:text-ink">
                {HELP_CATEGORIES[at + 1]!.title} →
              </Link>
            )}
          </div>

          <div className="mt-12">
            <HelpContact />
          </div>
        </div>

        <nav aria-label="Alle Bereiche" className="h-fit lg:sticky lg:top-8">
          <p className="spec mb-3 text-ink">Alle Bereiche</p>
          <ol className="space-y-1 border-l border-line text-[13.5px]">
            {HELP_CATEGORIES.map((x) => (
              <li key={x.id}>
                <Link
                  href={`/hilfe/${x.id}${suffix}`}
                  aria-current={x.id === c.id ? "page" : undefined}
                  className={x.id === c.id ? "-ml-px block border-l border-moss pl-3 font-semibold text-ink" : "-ml-px block border-l border-transparent pl-3 text-muted hover:border-rule-strong hover:text-ink"}
                >
                  {x.title}
                </Link>
              </li>
            ))}
          </ol>
          <Link href={`/hilfe${suffix}`} className="mt-5 inline-block text-[13.5px] font-semibold text-moss underline underline-offset-2">
            Hilfe durchsuchen
          </Link>
        </nav>
      </div>
    </div>
  );
}
