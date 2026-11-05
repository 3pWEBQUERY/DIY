import Link from "next/link";
import Form from "next/form";
import type { Metadata } from "next";
import { Plus, Search } from "lucide-react";
import { DIFFICULTY, DIFFICULTY_LABEL, PROJECT_STATUS, PROJECT_STATUS_LABEL, type ProjectStatus } from "@werkraum/shared";
import { currentUser } from "@/server/auth/session";
import { browseCategories, effectiveCategory } from "@/server/categories/settings";
import { listProjects, type ProjectFilters, type ProjectSort } from "@/server/projects/service";
import { Page, PageHeader, TabLinks } from "@/components/shell/page";
import { ChipLink, ChipRow } from "@/components/ui/chips";
import { Empty } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";
import { ProjectList } from "@/components/projects/project-list";
import { StatusMark } from "@/components/projects/status";

type SP = { kategorie?: string; stufe?: string; status?: string; anleitung?: string; sort?: string; q?: string };

const SORTS: { key: ProjectSort; label: string; param: string }[] = [
  { key: "new", label: "Neu", param: "neu" },
  { key: "popular", label: "Beliebt", param: "beliebt" },
  { key: "completed", label: "Abgeschlossen", param: "abgeschlossen" },
];

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const sp = await searchParams;
  const cat = await effectiveCategory(sp.kategorie);
  return {
    title: cat ? `${cat.name} – Projekte` : "Projekte",
    description: cat ? `DIY-Projekte rund um ${cat.name}: mit Journal, Materialliste und Nachbauten.` : "Projekte der Community – vom ersten Skizzenstrich bis zum fertigen Stück, mit Journal, Materialliste und Nachbauten.",
    alternates: { canonical: cat ? `/projekte?kategorie=${cat.slug}` : "/projekte" },
  };
}

export default async function ProjectsIndex({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await currentUser();
  const [cat, cats] = await Promise.all([effectiveCategory(sp.kategorie), browseCategories(sp.kategorie)]);
  const level = DIFFICULTY.find((d) => String(d) === sp.stufe);
  const status = PROJECT_STATUS.find((s) => s === sp.status?.toUpperCase()) as ProjectStatus | undefined;
  const sort = SORTS.find((s) => s.param === sp.sort) ?? SORTS[0]!;
  const withTutorial = sp.anleitung === "1";
  const q = sp.q?.trim().slice(0, 80) || undefined;

  const filters: ProjectFilters = { category: cat?.slug, difficulty: level, status: sort.key === "completed" ? undefined : status, hasTutorial: withTutorial || undefined, q, sort: sort.key };
  const result = await listProjects(filters, user?.id ?? null);

  const href = (patch: Partial<Record<keyof SP, string | undefined>>) => {
    const next: Record<string, string | undefined> = { kategorie: cat?.slug, stufe: level ? String(level) : undefined, status: status?.toLowerCase(), anleitung: withTutorial ? "1" : undefined, sort: sort.param === "neu" ? undefined : sort.param, q, ...patch };
    const qs = new URLSearchParams(Object.entries(next).filter((e): e is [string, string] => !!e[1])).toString();
    return `/projekte${qs ? `?${qs}` : ""}`;
  };
  const anyFilter = !!(cat || level || status || withTutorial || q);

  return (
    <Page width="wide">
      <PageHeader
        kicker="Werkverzeichnis"
        title={cat ? cat.name : "Projekte"}
        description="Vom ersten Skizzenstrich bis zum fertigen Stück. Jedes Projekt ist ein Faden: Journal, Materialliste, Anleitung und Nachbauten hängen daran."
        actions={
          <LinkButton href={cat ? `/projekte/neu?kategorie=${cat.slug}` : "/projekte/neu"} variant="ink">
            <Plus size={16} /> Neues Projekt
          </LinkButton>
        }
      />

      <TabLinks
        active="projekte"
        tabs={[
          { key: "projekte", label: "Projekte", href: "/projekte" },
          { key: "anleitungen", label: "Anleitungen", href: "/anleitungen" },
          { key: "materialien", label: "Materialien", href: "/materialien" },
        ]}
      />

      <div className="mt-6 space-y-3 border-b border-line pb-6">
        <Form action="/projekte" className="relative mb-5 max-w-md" role="search">
          {cat && <input type="hidden" name="kategorie" value={cat.slug} />}
          <label htmlFor="pq" className="sr-only">Projekte durchsuchen</label>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input id="pq" name="q" defaultValue={q} placeholder="Projekte durchsuchen …" className="h-10 w-full border border-line-strong bg-card pl-9 pr-3 text-[14px] outline-none hover:border-muted focus:border-moss rounded-2xl" />
        </Form>
        <ChipRow label="Kategorie">
          <ChipLink href={href({ kategorie: undefined })} active={!cat}>Alle</ChipLink>
          {cats.map((c) => (
            <ChipLink key={c.slug} href={href({ kategorie: c.slug })} active={cat?.slug === c.slug}>
              {c.short}
            </ChipLink>
          ))}
        </ChipRow>
        <ChipRow label="Schwierigkeit">
          <ChipLink href={href({ stufe: undefined })} active={!level}>Alle</ChipLink>
          {DIFFICULTY.map((d) => (
            <ChipLink key={d} href={href({ stufe: String(d) })} active={level === d}>
              {DIFFICULTY_LABEL[d]}
            </ChipLink>
          ))}
        </ChipRow>
        {sort.key !== "completed" && (
          <ChipRow label="Status">
            <ChipLink href={href({ status: undefined })} active={!status}>Alle</ChipLink>
            {PROJECT_STATUS.filter((s) => s !== "ARCHIVED").map((s) => (
              <ChipLink key={s} href={href({ status: s.toLowerCase() })} active={status === s}>
                <StatusMark status={s} className={status === s && (s === "IDEA" || s === "PLANNING") ? "border-paper" : undefined} />
                {PROJECT_STATUS_LABEL[s]}
              </ChipLink>
            ))}
          </ChipRow>
        )}
        <ChipRow label="Extras">
          <ChipLink href={href({ anleitung: withTutorial ? undefined : "1" })} active={withTutorial}>
            Mit Anleitung
          </ChipLink>
          {anyFilter && (
            <Link href="/projekte" className="inline-flex h-8 items-center px-2 text-[13px] text-muted underline underline-offset-2 hover:text-ink rounded-xl">
              Filter zurücksetzen
            </Link>
          )}
        </ChipRow>
      </div>

      <div className="mb-8 mt-6 flex items-center justify-between gap-4">
        <p className="spec">{q ? `Treffer für «${q}»` : "Sortierung"}</p>
        <nav aria-label="Sortierung" className="flex gap-1">
          {SORTS.map((s) => (
            <Link
              key={s.key}
              scroll={false}
              href={href({ sort: s.param === "neu" ? undefined : s.param })}
              aria-current={s.key === sort.key ? "true" : undefined}
              className={s.key === sort.key ? "border-b-2 border-moss px-2 py-1 text-[14px] font-semibold" : "border-b-2 border-transparent px-2 py-1 text-[14px] text-muted hover:text-ink"}
            >
              {s.label}
            </Link>
          ))}
        </nav>
      </div>

      {result.items.length ? (
        <ProjectList initial={result.items} cursor={result.nextCursor} filters={filters} />
      ) : (
        <Empty
          title={anyFilter ? "Nichts gefunden" : "Noch keine Projekte"}
          body={anyFilter ? "Mit diesen Filtern gibt es (noch) keine Projekte. Lockere die Auswahl – oder starte selbst eines." : "Leg das erste Projekt an und dokumentiere, was auf deiner Werkbank entsteht."}
          action={<LinkButton href="/projekte/neu" variant="outline">Projekt starten</LinkButton>}
        />
      )}
    </Page>
  );
}
