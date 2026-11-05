import Form from "next/form";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Plus, Search } from "lucide-react";
import { currentUser } from "@/server/auth/session";
import { browseCategories, effectiveCategories } from "@/server/categories/settings";
import { communityCategoryCounts, listCommunities, viewerInvitations } from "@/server/communities/service";
import { Page, PageHeader } from "@/components/shell/page";
import { CommunityCard } from "@/components/communities/community-card";
import { Empty, SectionTitle } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";
import { cn, pluralize } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Communities",
  description: "Gruppen für Häkeln, Holz, Keramik und mehr – lokal und online. Finde deine Werkstattgemeinschaft.",
  alternates: { canonical: "/communities" },
};

type SP = { q?: string; kategorie?: string; nach?: string };

export default async function CommunitiesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await currentUser();
  const viewerId = user?.id ?? null;
  const filtered = !!(sp.q || sp.kategorie);
  const [counts, browse, allCats] = await Promise.all([communityCategoryCounts(), browseCategories(sp.kategorie), effectiveCategories()]);
  const cats = browse.filter((c) => (counts.get(c.slug) ?? 0) > 0);

  const header = (
    <PageHeader
      kicker="Communities"
      title="Gemeinsam werkeln"
      description="Gruppen rund um ein Handwerk, eine Region oder ein Projekt. Stell Fragen, zeig Zwischenstände, mach bei Challenges mit."
      actions={
        <LinkButton href={user ? "/communities/neu" : "/anmelden?weiter=/communities/neu"} variant="ink">
          <Plus size={15} /> Community gründen
        </LinkButton>
      }
    >
      <Form role="search" action="/communities" className="mt-8 flex max-w-xl items-center border-b border-rule">
        <label htmlFor="c-q" className="sr-only">Communities durchsuchen</label>
        <Search size={16} className="text-muted" aria-hidden />
        <input id="c-q" name="q" type="search" defaultValue={sp.q} placeholder="Nach Thema, Ort oder Name suchen …" className="h-12 flex-1 bg-transparent px-3 text-[15px] outline-none" />
        {sp.kategorie && <input type="hidden" name="kategorie" value={sp.kategorie} />}
        <button type="submit" className="text-sm font-semibold">Suchen</button>
      </Form>
      {cats.length > 0 && (
        <nav aria-label="Kategorien" className="-mx-4 mt-5 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
          <ul className="flex min-w-max gap-2">
            <li>
              <Link href={sp.q ? `/communities?q=${encodeURIComponent(sp.q)}` : "/communities"} aria-current={!sp.kategorie ? "page" : undefined} className={cn("inline-flex h-8 items-center border px-3 text-[13px] rounded-xl", !sp.kategorie ? "border-moss bg-moss text-paper" : "border-line-strong hover:border-rule-strong")}>
                Alle
              </Link>
            </li>
            {cats.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/communities?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), kategorie: c.slug })}`}
                  aria-current={sp.kategorie === c.slug ? "page" : undefined}
                  className={cn("inline-flex h-8 items-center gap-2 border px-3 text-[13px] rounded-xl", sp.kategorie === c.slug ? "border-moss bg-moss text-paper" : "border-line-strong hover:border-rule-strong")}
                >
                  {c.short}
                  <span className={cn("font-mono text-[10px]", sp.kategorie === c.slug ? "text-paper/70" : "text-muted")}>{counts.get(c.slug)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </PageHeader>
  );

  if (filtered) {
    const res = await listCommunities({ q: sp.q, category: sp.kategorie, viewerId, take: 24 }, sp.nach);
    const label = [sp.q && `„${sp.q}“`, allCats.find((c) => c.slug === sp.kategorie)?.name].filter(Boolean).join(" · ");
    return (
      <Page width="wide">
        {header}
        <SectionTitle n="01" title={label} action={<span className="spec">{pluralize(res.items.length, "Treffer", "Treffer")}{res.nextCursor ? "+" : ""}</span>} />
        {res.items.length ? (
          <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {res.items.map((c) => (
              <li key={c.id}><CommunityCard community={c} className="h-full" /></li>
            ))}
          </ul>
        ) : (
          <Empty className="mt-6" title="Keine Community gefunden" body="Vielleicht ist es Zeit, sie selbst zu gründen?" action={<LinkButton href="/communities/neu" variant="outline">Community gründen</LinkButton>} />
        )}
        {res.nextCursor && (
          <div className="mt-10 flex justify-center">
            <LinkButton variant="outline" href={`/communities?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.kategorie ? { kategorie: sp.kategorie } : {}), nach: res.nextCursor })}`}>
              Weitere <ArrowRight size={14} />
            </LinkButton>
          </div>
        )}
      </Page>
    );
  }

  const [mine, invites, featured, all] = await Promise.all([
    viewerId ? listCommunities({ memberOf: viewerId, viewerId, take: 12 }) : Promise.resolve({ items: [], nextCursor: null }),
    viewerId ? viewerInvitations(viewerId) : Promise.resolve([]),
    listCommunities({ featured: true, viewerId, take: 3 }),
    listCommunities({ viewerId, take: 60 }),
  ]);
  const featuredIds = new Set(featured.items.map((c) => c.id));
  // Gruppierung über alle Kategorien – Communities in deaktivierten Kategorien bleiben auffindbar
  const byCategory = allCats.map((cat) => ({ cat, items: all.items.filter((c) => c.category === cat.slug && !featuredIds.has(c.id)).slice(0, 3) })).filter((g) => g.items.length);
  let n = 0;
  const next = () => String(++n).padStart(2, "0");

  return (
    <Page width="wide">
      {header}

      {invites.length > 0 && (
        <section aria-labelledby="einl" className="rounded-2xl mb-12 bg-clay-soft px-5 py-4">
          <h2 id="einl" className="spec text-clay-ink">Einladungen für dich</h2>
          <ul className="mt-2 divide-y divide-clay/20">
            {invites.map((c) => (
              <li key={c.id}><CommunityCard community={c} variant="row" /></li>
            ))}
          </ul>
        </section>
      )}

      {mine.items.length > 0 && (
        <section aria-labelledby="meine" className="mb-14">
          <SectionTitle n={next()} title={<span id="meine">Meine Communities</span>} />
          <ul className="mt-2 grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
            {mine.items.map((c) => (
              <li key={c.id} className="border-b border-line"><CommunityCard community={c} variant="row" /></li>
            ))}
          </ul>
        </section>
      )}

      {all.items.length === 0 ? (
        <Empty title="Noch keine Communities" body="Gründe die erste – für dein Handwerk, deine Stadt oder dein Lieblingsmaterial." action={<LinkButton href="/communities/neu">Community gründen</LinkButton>} />
      ) : (
        <>
          {featured.items.length > 0 && (
            <section aria-labelledby="empf" className="mb-14">
              <SectionTitle n={next()} title={<span id="empf">Empfohlen</span>} />
              <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {featured.items.map((c) => (
                  <li key={c.id}><CommunityCard community={c} className="h-full" /></li>
                ))}
              </ul>
            </section>
          )}
          {byCategory.map((g) => (
            <section key={g.cat.slug} aria-labelledby={`k-${g.cat.slug}`} className="mb-14">
              <SectionTitle
                n={next()}
                title={<span id={`k-${g.cat.slug}`}>{g.cat.name}</span>}
                action={(counts.get(g.cat.slug) ?? 0) > g.items.length ? <Link href={`/communities?kategorie=${g.cat.slug}`} className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink">Alle {counts.get(g.cat.slug)} <ArrowRight size={12} /></Link> : undefined}
              />
              <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map((c) => (
                  <li key={c.id}><CommunityCard community={c} className="h-full" /></li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </Page>
  );
}
