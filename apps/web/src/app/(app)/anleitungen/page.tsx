import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Search } from "lucide-react";
import { CATEGORIES, DIFFICULTY, DIFFICULTY_LABEL, SAFETY_LABEL, categoryBySlug } from "@werkraum/shared";
import { currentUser } from "@/server/auth/session";
import { DURATIONS, listTutorials, type TutorialCardData, type TutorialFilters } from "@/server/tutorials/service";
import { Page, PageHeader, TabLinks } from "@/components/shell/page";
import { ChipLink, ChipRow } from "@/components/ui/chips";
import { Avatar, Difficulty, Empty } from "@/components/ui/misc";
import { Cover } from "@/components/ui/media";
import { LinkButton } from "@/components/ui/button";
import { TutorialList } from "@/components/tutorials/tutorial-list";
import { formatMinutes } from "@/lib/utils";

type SP = { kategorie?: string; stufe?: string; dauer?: string; sort?: string; q?: string };

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const sp = await searchParams;
  const cat = categoryBySlug(sp.kategorie);
  return {
    title: cat ? `${cat.name} – Anleitungen` : "Anleitungen",
    description: "Schritt-für-Schritt-Anleitungen der Community: mit Materialliste, Zeitangaben, Tipps und klar markierten Sicherheitshinweisen.",
    alternates: { canonical: cat ? `/anleitungen?kategorie=${cat.slug}` : "/anleitungen" },
  };
}

/** Aufmacher: die erste Anleitung redaktionell gross. */
function Lead({ t }: { t: TutorialCardData }) {
  const cat = categoryBySlug(t.category);
  return (
    <Link href={t.href} className="group mb-14 grid gap-6 border-b border-ink pb-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-10">
      <div className="crop border border-line">
        <Cover url={t.coverUrl} alt="" seed={`t-${t.id}`} category={t.category} ratio="16/10" priority sizes="(min-width: 1024px) 680px, 100vw" />
      </div>
      <div className="flex min-w-0 flex-col justify-end">
        <p className="spec">Aufmacher · {cat?.name ?? "Anleitung"}</p>
        <h2 className="display mt-3 text-[2.2rem] text-balance decoration-1 underline-offset-[6px] group-hover:underline sm:text-[2.8rem]">{t.title}</h2>
        {t.summary && <p className="mt-4 line-clamp-3 font-serif text-[1.15rem] leading-relaxed text-ink-2">{t.summary}</p>}
        <dl className="mt-6 grid grid-cols-3 border-y border-line">
          <div className="py-3 pr-3">
            <dt className="spec">Schwierigkeit</dt>
            <dd className="mt-1"><Difficulty level={t.difficulty} /></dd>
          </div>
          <div className="border-l border-line py-3 pl-3">
            <dt className="spec">Dauer</dt>
            <dd className="mt-1 text-[15px] font-semibold num">{formatMinutes(t.minutes)}</dd>
          </div>
          <div className="border-l border-line py-3 pl-3">
            <dt className="spec">Schritte</dt>
            <dd className="mt-1 text-[15px] font-semibold num">{t.steps}</dd>
          </div>
        </dl>
        {t.safetyKinds.length > 0 && <p className="mt-3 text-[12px] text-warn">Sicherheitshinweise: {t.safetyKinds.map((k) => SAFETY_LABEL[k]).join(" · ")}</p>}
        <div className="mt-5 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-[13px] text-muted">
            <Avatar src={t.author.avatarUrl} name={t.author.displayName} size={22} /> {t.author.displayName}
          </span>
          <span className="inline-flex items-center gap-1 text-sm font-semibold">
            Lesen <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}

export default async function TutorialsIndex({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await currentUser();
  const cat = categoryBySlug(sp.kategorie);
  const level = DIFFICULTY.find((d) => String(d) === sp.stufe);
  const duration = DURATIONS.find((d) => d.key === sp.dauer);
  const sort = sp.sort === "beliebt" ? "popular" : "new";
  const q = sp.q?.trim().slice(0, 80) || undefined;
  const filters: TutorialFilters = { category: cat?.slug, difficulty: level, duration: duration?.key, q, sort };
  const result = await listTutorials(filters, user?.id ?? null);
  const anyFilter = !!(cat || level || duration || q);
  const lead = !anyFilter && sort === "new" ? result.items[0] : undefined;
  const rest = lead ? result.items.slice(1) : result.items;

  const href = (patch: Partial<Record<keyof SP, string | undefined>>) => {
    const next: Record<string, string | undefined> = { kategorie: cat?.slug, stufe: level ? String(level) : undefined, dauer: duration?.key, sort: sort === "popular" ? "beliebt" : undefined, q, ...patch };
    const qs = new URLSearchParams(Object.entries(next).filter((e): e is [string, string] => !!e[1])).toString();
    return `/anleitungen${qs ? `?${qs}` : ""}`;
  };

  return (
    <Page width="wide">
      <PageHeader
        kicker="Werkstattbuch"
        title={cat ? `Anleitungen: ${cat.short}` : "Anleitungen"}
        description="Schritt für Schritt, mit Materialliste und Zeitangaben. Tipps aus Erfahrung sind grün markiert, verbindliche Sicherheitshinweise rot."
        actions={<LinkButton href="/studio/anleitungen/neu" variant="ink">Anleitung schreiben</LinkButton>}
      />
      <TabLinks
        active="anleitungen"
        tabs={[
          { key: "projekte", label: "Projekte", href: "/projekte" },
          { key: "anleitungen", label: "Anleitungen", href: "/anleitungen" },
          { key: "materialien", label: "Materialien", href: "/materialien" },
        ]}
      />

      <div className="mt-6 space-y-3 border-b border-line pb-6">
        <form action="/anleitungen" className="relative mb-5 max-w-md" role="search">
          {cat && <input type="hidden" name="kategorie" value={cat.slug} />}
          <label htmlFor="tq" className="sr-only">Anleitungen durchsuchen</label>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input id="tq" name="q" defaultValue={q} placeholder="Was möchtest du lernen?" className="h-10 w-full border border-line-strong bg-card pl-9 pr-3 text-[14px] outline-none hover:border-muted focus:border-ink" />
        </form>
        <ChipRow label="Kategorie">
          <ChipLink href={href({ kategorie: undefined })} active={!cat}>Alle</ChipLink>
          {CATEGORIES.map((c) => (
            <ChipLink key={c.slug} href={href({ kategorie: c.slug })} active={cat?.slug === c.slug}>{c.short}</ChipLink>
          ))}
        </ChipRow>
        <ChipRow label="Schwierigkeit">
          <ChipLink href={href({ stufe: undefined })} active={!level}>Alle</ChipLink>
          {DIFFICULTY.map((d) => (
            <ChipLink key={d} href={href({ stufe: String(d) })} active={level === d}>{DIFFICULTY_LABEL[d]}</ChipLink>
          ))}
        </ChipRow>
        <ChipRow label="Dauer">
          <ChipLink href={href({ dauer: undefined })} active={!duration}>Alle</ChipLink>
          {DURATIONS.map((d) => (
            <ChipLink key={d.key} href={href({ dauer: d.key })} active={duration?.key === d.key}>{d.label}</ChipLink>
          ))}
        </ChipRow>
      </div>

      <div className="mb-8 mt-6 flex items-center justify-between gap-4">
        <p className="spec">{q ? `Treffer für «${q}»` : anyFilter ? "Gefiltert" : "Alle Anleitungen"}</p>
        <nav aria-label="Sortierung" className="flex gap-1">
          {[
            { key: "new", label: "Neu", param: undefined },
            { key: "popular", label: "Oft nachgebaut", param: "beliebt" },
          ].map((s) => (
            <a key={s.key} href={href({ sort: s.param })} aria-current={sort === s.key ? "true" : undefined} className={sort === s.key ? "border-b-2 border-ink px-2 py-1 text-[14px] font-semibold" : "border-b-2 border-transparent px-2 py-1 text-[14px] text-muted hover:text-ink"}>
              {s.label}
            </a>
          ))}
        </nav>
      </div>

      {result.items.length ? (
        <>
          {lead && <Lead t={lead} />}
          {rest.length > 0 && <TutorialList initial={rest} cursor={result.nextCursor} filters={filters} />}
        </>
      ) : (
        <Empty
          title={anyFilter ? "Keine passende Anleitung" : "Noch keine Anleitungen"}
          body={anyFilter ? "Versuche andere Filter – oder schreib die Anleitung, die hier fehlt." : "Teile dein Wissen: Aus jedem Projekt kann eine Anleitung werden."}
          action={<LinkButton href="/studio/anleitungen/neu" variant="outline">Anleitung schreiben</LinkButton>}
        />
      )}
    </Page>
  );
}
