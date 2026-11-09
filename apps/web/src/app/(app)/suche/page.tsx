import Form from "next/form";
import Link from "next/link";
import type { Metadata } from "next";
import { Search } from "lucide-react";
import { DIFFICULTY_LABEL, formatMoney, type Currency } from "@werkraum/shared";
import { currentUser } from "@/server/auth/session";
import { browseCategories } from "@/server/categories/settings";
import { search, SEARCH_TYPES, type SearchType } from "@/server/discovery/search";
import { getProjectCards } from "@/server/projects/service";
import { getTutorialCards } from "@/server/tutorials/service";
import { Page, PageHeader, TabLinks } from "@/components/shell/page";
import { ProjectCard, ProjectGrid } from "@/components/projects/project-card";
import { TutorialCard } from "@/components/tutorials/tutorial-card";
import { Avatar, Empty, SectionTitle } from "@/components/ui/misc";
import { Cover } from "@/components/ui/media";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";

export const metadata: Metadata = { title: "Suche", robots: { index: false } };

const LABEL: Record<SearchType, string> = { project: "Projekte", tutorial: "Anleitungen", product: "Produkte", user: "Mitglieder", article: "Artikel", community: "Communities", post: "Beiträge" };

type SP = { q?: string; typ?: string; kategorie?: string; stufe?: string; dauer?: string; preis_max?: string; kostenlos?: string };

export default async function SearchPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const type = SEARCH_TYPES.includes(sp.typ as SearchType) ? (sp.typ as SearchType) : null;
  const [user, cats] = await Promise.all([currentUser(), browseCategories(sp.kategorie)]);
  const viewerId = user?.id ?? null;
  const filters = {
    q,
    types: type ? [type] : undefined,
    category: sp.kategorie || undefined,
    difficulty: sp.stufe ? Number(sp.stufe) : undefined,
    maxMinutes: sp.dauer ? Number(sp.dauer) : undefined,
    priceMax: sp.preis_max ? Number(sp.preis_max) * 100 : undefined,
    free: sp.kostenlos === "1",
    limit: type ? 40 : 8,
  };
  const results = q.length >= 2 ? await search(filters, viewerId) : null;
  const [projects, tutorials] = results
    ? await Promise.all([getProjectCards(results.project.map((h) => h.id), viewerId), getTutorialCards(results.tutorial.map((h) => h.id), viewerId)])
    : [[], []];
  const total = results ? SEARCH_TYPES.reduce((n, t) => n + results[t].length, 0) : 0;
  const qs = (o: Partial<SP>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...o }).filter(([, v]) => v) as [string, string][]);
    return `/suche?${p.toString()}`;
  };

  const show = (t: SearchType) => results && (!type || type === t) && results[t].length > 0;

  return (
    <Page width="wide">
      <PageHeader kicker="Suche" title={q ? <>Ergebnisse für <em className="not-italic text-moss">„{q}“</em></> : "Was suchst du?"} />
      <Form action="/suche" role="search" className="mb-6 flex gap-2">
        <label htmlFor="q" className="sr-only">Suchbegriff</label>
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input id="q" name="q" defaultValue={q} placeholder="Technik, Material, Projekt oder Creator – z. B. „Granny Square“, „Arve“, „Leinen“" className="h-12 w-full border border-rule bg-card pl-11 pr-4 text-[16px] outline-none rounded-2xl" />
        </div>
        {type && <input type="hidden" name="typ" value={type} />}
        <button className={buttonClass("ink", "lg")}>Suchen</button>
      </Form>

      {q && (
        <>
          <TabLinks
            active={type ?? "all"}
            tabs={[{ key: "all", label: "Alle", href: qs({ typ: undefined }), count: total }, ...SEARCH_TYPES.map((t) => ({ key: t, label: LABEL[t], href: qs({ typ: t }), count: results?.[t].length }))]}
          />
          {/* Filter (§18.2) – barrierefrei als normale Links/Formular */}
          <Form action="/suche" className="mt-4 flex flex-wrap items-end gap-3 border-b border-line pb-4 text-sm">
            <input type="hidden" name="q" value={q} />
            {type && <input type="hidden" name="typ" value={type} />}
            <label className="flex flex-col gap-1">
              <span className="spec">Kategorie</span>
              <Select name="kategorie" defaultValue={sp.kategorie ?? ""} className="h-9 w-auto min-w-[150px] text-[14px]">
                <option value="">Alle</option>
                {cats.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </Select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="spec">Schwierigkeit bis</span>
              <Select name="stufe" defaultValue={sp.stufe ?? ""} className="h-9 w-auto min-w-[150px] text-[14px]">
                <option value="">Alle</option>
                {[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>{DIFFICULTY_LABEL[d]}</option>)}
              </Select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="spec">Dauer bis</span>
              <Select name="dauer" defaultValue={sp.dauer ?? ""} className="h-9 w-auto min-w-[150px] text-[14px]">
                <option value="">Beliebig</option>
                <option value="60">1 Std.</option>
                <option value="240">4 Std.</option>
                <option value="480">1 Tag</option>
                <option value="1440">3 Tage</option>
              </Select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="spec">Preis bis (CHF)</span>
              <input name="preis_max" type="number" min={0} defaultValue={sp.preis_max} className="h-9 w-24 border border-line-strong bg-card px-2 rounded-2xl" />
            </label>
            <label className="flex h-9 items-center gap-2">
              <input type="checkbox" name="kostenlos" value="1" defaultChecked={sp.kostenlos === "1"} className="accent-[#B64B3A]" /> Nur kostenlose Anleitungen
            </label>
            <button className={buttonClass("outline", "sm")}>Filter anwenden</button>
          </Form>
        </>
      )}

      {!q && (
        <div className="grid gap-px border border-line bg-line sm:grid-cols-3 lg:grid-cols-5 rounded-2xl overflow-hidden">
          {cats.map((c) => (
            <Link key={c.slug} href={`/entdecken?kategorie=${c.slug}`} className="bg-paper p-4 text-sm font-semibold hover:bg-card">{c.name}</Link>
          ))}
        </div>
      )}

      {results && total === 0 && (
        <Empty
          className="mt-10"
          title="Nichts gefunden"
          body={<>Zu „{q}“ gibt es noch keine Treffer{sp.kategorie ? " in dieser Kategorie" : ""}. Versuch einen allgemeineren Begriff, ein Material oder eine Technik – oder entferne Filter.</>}
          action={<Link href={`/suche?q=${encodeURIComponent(q)}`} className={buttonClass("outline")}>Filter zurücksetzen</Link>}
        />
      )}

      <div className="mt-10 space-y-14">
        {show("project") && (
          <section>
            <SectionTitle n="01" title="Projekte" action={!type && <Link href={qs({ typ: "project" })} className="text-xs text-muted hover:text-ink">Alle zeigen</Link>} />
            <ProjectGrid className="mt-6">{projects.map((p) => <ProjectCard key={p.id} project={p} />)}</ProjectGrid>
          </section>
        )}
        {show("tutorial") && (
          <section>
            <SectionTitle n="02" title="Anleitungen" action={!type && <Link href={qs({ typ: "tutorial" })} className="text-xs text-muted hover:text-ink">Alle zeigen</Link>} />
            <div className="mt-6 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">{tutorials.map((t) => <TutorialCard key={t.id} tutorial={t} />)}</div>
          </section>
        )}
        {show("user") && (
          <section>
            <SectionTitle n="03" title="Mitglieder" />
            <ul className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-x-8 sm:grid-cols-[repeat(2,minmax(0,1fr))]">
              {results!.user.map((u) => (
                <li key={u.id} className="border-b border-line">
                  <Link href={u.href} className="flex items-center gap-3 py-3 hover:bg-card rounded-2xl">
                    <Avatar src={u.cover} name={u.title} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{u.title}</span>
                      <span className="block truncate text-sm text-muted">{u.subtitle} · {String(u.meta?.bio ?? "").slice(0, 70)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        {show("product") && (
          <section>
            <SectionTitle n="04" title="Produkte" />
            <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-4">
              {results!.product.map((p) => (
                <Link key={p.id} href={p.href} className="group">
                  <Cover url={p.cover} alt="" seed={p.id} category={p.category} ratio="4/5" />
                  <p className="mt-2 text-sm font-semibold group-hover:underline">{p.title}</p>
                  <p className="text-xs text-muted">{p.subtitle} · <span className="font-mono">{formatMoney(Number(p.meta?.priceMinor), (p.meta?.currency as Currency) ?? "CHF")}</span></p>
                </Link>
              ))}
            </div>
          </section>
        )}
        {(["article", "community", "post"] as const).map(
          (t, i) =>
            show(t) && (
              <section key={t}>
                <SectionTitle n={`0${i + 5}`} title={LABEL[t]} />
                <ul>
                  {results![t].map((h) => (
                    <li key={h.id} className="border-b border-line">
                      <Link href={h.href} className={cn("block py-3.5 hover:bg-card rounded-2xl", t === "article" && "py-5")}>
                        <span className={cn("block font-semibold", t === "article" && "headline text-xl font-normal")}>{h.title}</span>
                        <span className="text-sm text-muted">{h.subtitle}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ),
        )}
      </div>
    </Page>
  );
}
